import { defineHook, sleep, getWritable } from "workflow";
import { getAnthropic } from "@/lib/anthropic";
import { anthropicEventId } from "@/lib/managed-agent-events";
import { resolveViaMesh } from "@/lib/mesh-resolver";

// 消費者 Eva 一輪內可能含分鐘級 mesh 委派(規格 §3 A-3):放寬 poll 預算。
// resolveToolCalls 的等待是另一個 awaited step,不佔此 sleep 迴圈計數;
// 此上限只保障輪詢迭代數足夠涵蓋(含巢狀 mesh 後 Eva 整合)。
const MAX_POLLS_PER_TURN = 400;
const POLL_INTERVAL = "3s";

// 消費者聊天 session 本體就是 eva-cxa(ANTHROPIC_AGENT_ID)。此 session 由
// openhair-app 擁有、不在 worker chain 內;解析 Eva 的 call_<域> 時要把
// 跨界鏈 ['eva', 域] + hops 傳給 worker(規格 §3 Part B),worker 才能在
// 下游繞回 Eva 時正確判循環。
const CONSUMER_ENTRY_KEY = "eva";
const HOP_LIMIT = 4; // 對齊 worker 入口預設
const MESH_KEYS = ["eva", "xiaoai", "lisa", "kevin"] as const;

function toolNameToKey(toolName: string): string | null {
  if (!toolName || !toolName.startsWith("call_")) return null;
  const k = toolName.slice("call_".length);
  return (MESH_KEYS as readonly string[]).includes(k) ? k : null;
}

export type SessionEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

export const messageHook = defineHook<{ text: string }>();

async function sendMessage(
  anthropicSessionId: string,
  text: string,
): Promise<void> {
  "use step";
  console.log(`[sendMessage] session=${anthropicSessionId} text=${text.slice(0, 60)}`);

  const client = getAnthropic();
  await client.beta.sessions.events.send(anthropicSessionId, {
    events: [{ type: "user.message", content: [{ type: "text", text }] }],
  });

  console.log(`[sendMessage] DONE`);
}

async function pollAndStream(input: {
  anthropicSessionId: string;
  lastEventId: string | null;
}): Promise<{
  lastEventId: string | null;
  done: boolean;
  requiresActionEventIds: string[];
}> {
  "use step";
  console.log(`[pollAndStream] START session=${input.anthropicSessionId} lastEventId=${input.lastEventId}`);

  const client = getAnthropic();
  const writer = getWritable<SessionEvent>().getWriter();

  let done = false;
  let lastId = input.lastEventId;
  let written = 0;
  let requiresActionEventIds: string[] = [];

  try {
    const page = await client.beta.sessions.events.list(
      input.anthropicSessionId,
      { limit: 100 },
    );

    console.log(`[pollAndStream] fetched ${page.data.length} events`);

    let seenLast = input.lastEventId === null;
    for (const event of page.data) {
      const aid = anthropicEventId(event);
      if (!aid) continue;

      if (!seenLast) {
        if (aid === input.lastEventId) seenLast = true;
        continue;
      }

      const occurredAt =
        "processed_at" in event &&
        typeof (event as { processed_at?: string | null }).processed_at ===
          "string"
          ? (event as { processed_at: string }).processed_at
          : new Date().toISOString();

      await writer.write({
        id: aid,
        type: event.type,
        payload: event as unknown as Record<string, unknown>,
        occurredAt,
      });

      written++;
      lastId = aid;

      if (event.type === "session.status_idle") {
        // 規格 §3 A-1:idle 要看 stop_reason 區分「真完成」vs「requires_action」。
        const stopReason = (
          event as { stop_reason?: { type?: string; event_ids?: string[] } }
        ).stop_reason;
        if (stopReason && stopReason.type === "requires_action") {
          // Eva 呼叫了 mesh tool,session 暫停待回填 —— 不是 done。
          requiresActionEventIds = Array.isArray(stopReason.event_ids)
            ? stopReason.event_ids
            : [];
          break;
        }
        done = true;
        break;
      }
      if (
        event.type === "session.status_terminated" ||
        event.type === "session.deleted"
      ) {
        done = true;
        break;
      }
    }
  } finally {
    writer.releaseLock();
  }

  console.log(
    `[pollAndStream] DONE wrote=${written} lastId=${lastId} done=${done} requiresAction=${requiresActionEventIds.length}`,
  );
  return { lastEventId: lastId, done, requiresActionEventIds };
}

/**
 * 規格 §3 A-2:對每個 requires_action 的 event_id,取對應 agent.custom_tool_use
 * 事件(name/input)→ 委派 worker mesh(跨界鏈 ['eva', 域])→ 把結果用
 * user.custom_tool_result 回填。送完 session 自動轉 running。
 * B3 / 不卡死:resolveViaMesh 永不 throw,失敗也回字串,照樣回填。
 */
async function resolveToolCalls(input: {
  anthropicSessionId: string;
  eventIds: string[];
}): Promise<void> {
  "use step";
  const client = getAnthropic();

  // 取 custom_tool_use 事件詳情(.id / .name / .input)
  const page = await client.beta.sessions.events.list(
    input.anthropicSessionId,
    { limit: 100 },
  );
  const byId = new Map<
    string,
    { name: string; input: Record<string, unknown> }
  >();
  for (const ev of page.data) {
    if (ev.type === "agent.custom_tool_use") {
      const a = ev as {
        id: string;
        name: string;
        input?: Record<string, unknown>;
      };
      byId.set(a.id, { name: a.name, input: a.input ?? {} });
    }
  }

  for (const eid of input.eventIds) {
    let resultText: string;
    const tu = byId.get(eid);
    if (!tu) {
      resultText = `mesh resolve error: custom_tool_use ${eid} not found`;
    } else {
      const targetKey = toolNameToKey(tu.name);
      if (!targetKey) {
        resultText = `mesh resolve error: unknown tool ${tu.name}`;
      } else {
        const inp = tu.input as {
          task?: unknown;
          context?: unknown;
          purpose?: unknown;
        };
        resultText = await resolveViaMesh(
          targetKey,
          {
            task:
              typeof inp.task === "string"
                ? inp.task
                : JSON.stringify(tu.input),
            context:
              typeof inp.context === "string" ? inp.context : undefined,
            purpose:
              typeof inp.purpose === "string" ? inp.purpose : undefined,
          },
          [CONSUMER_ENTRY_KEY, targetKey],
          HOP_LIMIT - 1,
        );
      }
    }
    console.log(
      `[resolveToolCalls] ${eid} -> ${tu?.name ?? "?"} result=${resultText.slice(0, 60)}`,
    );
    await client.beta.sessions.events.send(input.anthropicSessionId, {
      events: [
        {
          type: "user.custom_tool_result",
          custom_tool_use_id: eid,
          content: [{ type: "text", text: resultText }],
        },
      ],
    });
  }
}

async function processTurn(
  anthropicSessionId: string,
  text: string,
  lastEventId: string | null,
): Promise<string | null> {
  await sendMessage(anthropicSessionId, text);

  let currentLastEventId = lastEventId;
  for (let i = 0; i < MAX_POLLS_PER_TURN; i++) {
    await sleep(POLL_INTERVAL);

    const result = await pollAndStream({
      anthropicSessionId,
      lastEventId: currentLastEventId,
    });

    currentLastEventId = result.lastEventId;

    if (result.requiresActionEventIds.length > 0) {
      // 規格 §3 A-3:先解析 tool call(回填)→ 繼續 poll(不 break、不算 done);
      // session 回填後自動轉 running,後續事件(含 Eva 整合)會在下一輪 poll 串出。
      await resolveToolCalls({
        anthropicSessionId,
        eventIds: result.requiresActionEventIds,
      });
      continue;
    }

    if (result.done) {
      console.log(`[sessionWorkflow] turn complete after ${i + 1} polls`);
      break;
    }
  }
  return currentLastEventId;
}

export async function sessionWorkflow(input: {
  internalSessionId: string;
  anthropicSessionId: string;
  initialMessage: string;
}) {
  "use workflow";
  console.log(`[sessionWorkflow] START internal=${input.internalSessionId} anthropic=${input.anthropicSessionId}`);

  let lastEventId: string | null = null;

  lastEventId = await processTurn(
    input.anthropicSessionId,
    input.initialMessage,
    lastEventId,
  );

  const hook = messageHook.create({
    token: `msg:${input.internalSessionId}`,
  });

  for await (const { text } of hook) {
    console.log(`[sessionWorkflow] received message: ${text.slice(0, 60)}`);
    lastEventId = await processTurn(
      input.anthropicSessionId,
      text,
      lastEventId,
    );
  }
}
