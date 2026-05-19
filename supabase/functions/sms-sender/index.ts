// Supabase Send SMS Hook → every8d (API 2.1) 簡訊發送
//
// 觸發鏈：消費者 signInWithOtp → Supabase Auth 產 OTP → Send SMS Hook
//         → 本 Edge Function → every8d SendSMS.ashx → 消費者手機
//
// 規格：Code視窗動工規格_M1階段1_子里程碑D-2_v0.1.md
//   - 第 4 節：職責 / every8d body / 回應解析（本檔依其結構寫，非照抄）
//   - 第 6 節：簡訊 template（文案是規格定死的，精確照規格）
//   - 第 7 節：錯誤處理（signature 失敗 401 / 其餘 500，本檔用 try 分層滿足）
//   - 第 8 節：secrets 經 Deno.env.get 取，絕不入 log
//
// 部署：npx supabase functions deploy sms-sender --no-verify-jwt
//   --no-verify-jwt 必要：Send SMS Hook 是 Supabase Auth 內部呼叫，無 user JWT

import "@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "npm:standardwebhooks";

const EVERY8D_ENDPOINT = "https://new.e8d.tw/API21/HTTP/SendSMS.ashx";

// Hook secret 格式為 "v1,whsec_xxxx"；standardwebhooks 只吃去前綴後的部分
const rawHookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "";
const hookSecret = rawHookSecret.replace("v1,whsec_", "");
const every8dUid = Deno.env.get("EVERY8D_UID") ?? "";
const every8dPwd = Deno.env.get("EVERY8D_PWD") ?? "";

type HookPayload = {
  user: { phone: string };
  sms: { otp: string };
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  // env 防呆（D-1-c env shadow 教訓：缺值要明確報，不要 cast 後 silent fail）
  if (!hookSecret || !every8dUid || !every8dPwd) {
    console.error(
      "[sms-sender] missing secrets — hookSecret:" +
        (hookSecret ? "set" : "MISSING") +
        " EVERY8D_UID:" +
        (every8dUid ? "set" : "MISSING") +
        " EVERY8D_PWD:" +
        (every8dPwd ? "set" : "MISSING"),
    );
    return jsonResponse(
      { error: { http_code: 500, message: "sms-sender misconfigured: secrets not set" } },
      500,
    );
  }

  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers);

  // ── 1. 驗 webhook signature（失敗 → 401，對齊規格第 7 節）──
  let payload: HookPayload;
  try {
    const wh = new Webhook(hookSecret);
    payload = wh.verify(rawBody, headers) as HookPayload;
  } catch {
    // 不 log err 細節（可能含 header / body 片段），只記分類
    console.error("[sms-sender] webhook signature verification failed");
    return jsonResponse(
      { error: { http_code: 401, message: "invalid webhook signature" } },
      401,
    );
  }

  // ── 2~6. 解 payload → 組訊息 → 呼叫 every8d → 解回應 ──
  try {
    const phone = payload?.user?.phone;
    const otp = payload?.sms?.otp;
    if (!phone || !otp) {
      console.error("[sms-sender] payload missing user.phone or sms.otp");
      return jsonResponse(
        { error: { http_code: 400, message: "payload missing phone or otp" } },
        400,
      );
    }

    // every8d 用無 + 前綴格式（跟 Dashboard 測試號碼格式一致、較保險）
    const dest = phone.replace(/^\+/, "");

    // 簡訊 template — 規格第 6 節「最終格式」，文案精確照規格不改動
    const message =
      `【Biocutin】您的 Open Hair 驗證碼是 ${otp},請於 60 秒內輸入。請勿將此驗證碼洩漏給他人。`;

    const body = new URLSearchParams({
      UID: every8dUid,
      PWD: every8dPwd,
      SB: "Open Hair OTP",
      MSG: message,
      DEST: dest,
      ST: "",
      RETRYTIME: "1440",
    });

    const e8dResp = await fetch(EVERY8D_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const e8dText = (await e8dResp.text()).trim();

    // every8d 正常成功回應："credit,sent,cost,unsent,batchId"
    //   例：9610040.00,1,1,0,c496f706-9b0f-4ff8-9644-9503edbb7064
    //   前 4 欄為數字（credit/cost 可含小數、sent/unsent 整數）、第 5 欄 batchId
    // every8d 業務失敗："-{code},{message}" 例："-99,發生不明錯誤"
    // 其他（CloudFront 403 <!DOCTYPE HTML>、空、任何非預期）：一律當失敗。
    //   ⚠️ 舊版用 !startsWith("-") 當成功 → HTML 不以 "-" 開頭會被誤判成
    //   "every8d ok"。改成「明確檢查正常回應格式」才算成功，否則一律 5xx。
    // 注意：不 log e8dText 之外的東西（body 含 UID/PWD，絕不入 log）
    const parts = e8dText.split(",");
    const isEvery8dSuccess =
      !e8dText.startsWith("-") &&
      parts.length === 5 &&
      /^\d+(\.\d+)?$/.test(parts[0].trim()) && // credit
      /^\d+$/.test(parts[1].trim()) && // sent
      /^\d+(\.\d+)?$/.test(parts[2].trim()) && // cost
      /^\d+$/.test(parts[3].trim()); // unsent

    if (!isEvery8dSuccess) {
      // 涵蓋：- 開頭業務錯誤 / CloudFront 403 HTML / 空 / 任何非預期格式
      console.error(
        "[sms-sender] every8d non-success response: " + e8dText.slice(0, 200),
      );
      return jsonResponse(
        {
          error: {
            http_code: 500,
            message: "every8d non-success: " + e8dText.slice(0, 120),
          },
        },
        500,
      );
    }

    console.log("[sms-sender] every8d ok: " + e8dText);
    return jsonResponse({}, 200);
  } catch (err) {
    // fetch / parse 例外。err 不含 secret（body 未被帶入 fetch error），可記 message
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sms-sender] send failed: " + msg);
    return jsonResponse(
      { error: { http_code: 500, message: "sms-sender failed: " + msg } },
      500,
    );
  }
});
