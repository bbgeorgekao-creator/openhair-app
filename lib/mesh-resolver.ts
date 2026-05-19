/**
 * mesh-resolver — 消費者 session 代理層 Part A 的下游解析(規格 v1.0 §3 A-2)。
 *
 * Eva 在消費者對話中呼叫 call_<域> 時,tail-session 的 resolveToolCalls 用本檔
 * 打 worker 既有的 mesh 端點(v1.2):
 *   POST {WORKER_BASE_URL}/agents/{key}/invoke  -> { job_id }
 *   GET  {WORKER_BASE_URL}/jobs/{job_id}        輪詢至 done/error
 *
 * 鐵則:
 *  - A9:coordinator/mesh 是分鐘級。輪詢逾時設寬,不可秒級。
 *  - 永不 throw 出去:任何失敗都回一段文字,讓 tail-session 仍能送
 *    user.custom_tool_result、Eva session 不卡死(對齊 worker handler B3 c)。
 *  - 連通性(WORKER_BASE_URL 實際指向哪)= 規格 §4,待 George 拍板;
 *    本檔只讀環境變數,不決定拓樸。
 */

const WORKER_BASE_URL = (
  process.env.WORKER_BASE_URL ?? "http://localhost:8787"
).replace(/\/+$/, "");

// A9:分鐘級。預設總輪詢上限 20 分鐘、間隔 5s。可由環境變數覆寫。
const POLL_TIMEOUT_MS = Number(process.env.MESH_POLL_TIMEOUT_MS ?? 1_200_000);
const POLL_INTERVAL_MS = Number(process.env.MESH_POLL_INTERVAL_MS ?? 5_000);

export interface MeshInput {
  task: string;
  context?: string;
  purpose?: string;
}

/**
 * 委派一個域給 worker mesh,回傳下游整合後的文字。
 * @param targetKey   eva|xiaoai|lisa|kevin
 * @param input       Eva 的 LLM 已自拆的 task/context/purpose(不重拆,B3)
 * @param chainTrace  跨界鏈:消費者 Eva session 由 openhair-app 擁有,
 *                    解析 Eva 的 call_<t> 時傳 ['eva', targetKey](§3 Part B)
 * @param hopsRemaining 跨界後剩餘跳數(Eva 入口 4,送下游 = 3)
 */
export async function resolveViaMesh(
  targetKey: string,
  input: MeshInput,
  chainTrace: string[],
  hopsRemaining: number,
): Promise<string> {
  let jobId: string;
  try {
    const res = await fetch(`${WORKER_BASE_URL}/agents/${targetKey}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: input.task,
        context: input.context ?? "",
        purpose: input.purpose ?? "",
        chain_trace: chainTrace,
        hops_remaining: hopsRemaining,
      }),
    });
    if (!res.ok) {
      return `mesh delegate error: worker /agents/${targetKey}/invoke HTTP ${res.status}`;
    }
    const j = (await res.json()) as { job_id?: string };
    if (!j.job_id) return `mesh delegate error: no job_id from worker`;
    jobId = j.job_id;
  } catch (e) {
    return `mesh delegate error: cannot reach worker (${
      e instanceof Error ? e.message : String(e)
    })`;
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const res = await fetch(`${WORKER_BASE_URL}/jobs/${jobId}`);
      if (!res.ok) continue; // 暫時性,繼續等
      const job = (await res.json()) as {
        status?: string;
        result?: { text?: string } | null;
        error?: string | null;
      };
      if (job.status === "done") {
        const text = job.result?.text;
        return text && text.trim()
          ? text
          : `(downstream ${targetKey} returned empty)`;
      }
      if (job.status === "error") {
        return `downstream ${targetKey} error: ${job.error ?? "unknown"}`;
      }
      // pending / running → 繼續輪詢(分鐘級)
    } catch {
      // 暫時性網路錯,續等到 deadline
    }
  }
  return `downstream ${targetKey} timeout after ${POLL_TIMEOUT_MS}ms`;
}
