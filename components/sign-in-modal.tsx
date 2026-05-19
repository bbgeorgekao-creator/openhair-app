"use client";

/**
 * SignInModal · 手機號碼 + OTP 登入
 *
 * D-1-c · 從 better-auth Vercel OAuth 換成 Supabase Auth Phone OTP（兩步流程）。
 *
 * 流程：
 *   step "phone" → 輸入手機號碼 → signInWithOtp({ phone, channel: sms }) → step "otp"
 *   step "otp"   → 輸入 6 位驗證碼 → verifyOtp({ phone, token, type: sms }) → 整頁 reload "/"
 *                                                                              （server component 重抓 session）
 *
 * 規格嚴格照 Supabase 官方 phone-login docs：
 *   - phone 參數用 E.164 格式（+8869xxxxxxxx）
 *   - verifyOtp type: "sms"
 *
 * 測試號碼（D-1-e 用）：09xx → +886900000000、固定 OTP 123456（George 在 Supabase 後台已設）
 */

import { useState, type FormEvent } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

// Eva 頭像漸層 · 跟 sidebar / chat-view 同 motif
const EVA_GRADIENT = "linear-gradient(135deg, #534AB7, #8074C1)";

/**
 * 台灣手機號碼 → E.164 normalization
 *   "0912345678"      → "+886912345678"
 *   "+886912345678"   → "+886912345678"（已是 E.164）
 *   "886912345678"    → "+886912345678"（補 + 前綴）
 *   其他              → 原樣回傳（讓 Supabase 報錯，user 自己看）
 *
 * 也容錯空白和 -（"0912-345-678" / "0912 345 678" 都 OK）。
 */
function normalizePhone(input: string): string {
  const trimmed = input.trim().replace(/[\s-]/g, "");
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.startsWith("09")) return "+886" + trimmed.slice(1);
  if (trimmed.startsWith("886")) return "+" + trimmed;
  return trimmed;
}

export function SignInModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [normalizedPhone, setNormalizedPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setStep("phone");
    setPhone("");
    setNormalizedPhone("");
    setOtp("");
    setLoading(false);
    setError("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setError("");
    const normalized = normalizePhone(phone);
    if (!/^\+\d{8,15}$/.test(normalized)) {
      setError("手機號碼格式不對（請用 09 開頭的 10 位數）");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: sbError } = await supabase.auth.signInWithOtp({
        phone: normalized,
      });
      if (sbError) {
        setError(sbError.message || "傳送驗證碼失敗");
        setLoading(false);
        return;
      }
      setNormalizedPhone(normalized);
      setStep("otp");
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "傳送驗證碼失敗");
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (otp.length < 6) {
      setError("驗證碼是 6 位數");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: sbError } = await supabase.auth.verifyOtp({
        phone: normalizedPhone,
        token: otp,
        type: "sms",
      });
      if (sbError) {
        setError(sbError.message || "驗證碼錯誤");
        setLoading(false);
        return;
      }
      // 整頁 reload — server component 重抓 session、proxy 放行 /chat/*
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "驗證失敗");
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <div
            className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full text-base font-bold text-white"
            style={{ background: EVA_GRADIENT }}
            aria-hidden="true"
          >
            E
          </div>
          <DialogTitle>用手機號碼登入</DialogTitle>
          <DialogDescription>
            {step === "phone"
              ? "我們會傳一組 6 位數驗證碼到妳的手機"
              : `驗證碼已傳送至 ${normalizedPhone}`}
          </DialogDescription>
        </DialogHeader>

        {step === "phone" ? (
          <form onSubmit={handleSendOtp} className="mt-2 space-y-3">
            <input
              type="tel"
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09xxxxxxxx"
              disabled={loading}
              autoComplete="tel"
              inputMode="tel"
              className="h-11 w-full rounded-lg border border-border bg-background px-4 text-[15px] outline-none transition-colors focus:border-primary disabled:opacity-50"
            />
            {error && (
              <p className="text-center text-sm text-destructive">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !phone.trim()}
              className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "傳送驗證碼"
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="mt-2 space-y-3">
            <input
              type="text"
              autoFocus
              value={otp}
              onChange={(e) =>
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="6 位數驗證碼"
              disabled={loading}
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              className="h-11 w-full rounded-lg border border-border bg-background px-4 text-center text-[18px] tracking-[0.4em] outline-none transition-colors focus:border-primary disabled:opacity-50"
            />
            {error && (
              <p className="text-center text-sm text-destructive">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "驗證並登入"
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setOtp("");
                setError("");
              }}
              disabled={loading}
              className="flex w-full cursor-pointer items-center justify-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <ArrowLeft className="size-3" />
              重新輸入手機號碼
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
