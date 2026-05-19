"use client";

/**
 * ChatView — 純視覺層元件（presentational）
 *
 * 規格對齊：
 *   - Code視窗動工規格_溝通UI_M1階段1_v0.1.md 第 3 節（視覺規格）
 *   - 第 5 節（接口預留：UI 元件接 props、資料來源可替換、訊息渲染器可擴充）
 *
 * 職責：
 *   - 把 events / text / loading / error 等 props 渲染成 EVA-消費者版概念圖樣式
 *   - 不碰 fetch / SSE / context / hooks（除了 useState for 元件內部 UI 狀態如 ToolGroup expand）
 *   - 完全可被 mock data 驅動 → preview page 用同一份元件做視覺對照
 *
 * 使用者：
 *   - components/chat/chat-panel.tsx（真實對話，包 state + API + SSE）
 *   - app/preview/chat/page.tsx（視覺預覽，mock data + no-op handlers）
 */

import { useRef, useState, useEffect, type RefObject } from "react";
import { ArrowUp, Check, ChevronRight, Loader2, PanelLeft } from "lucide-react";
import { Streamdown, type Components } from "streamdown";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* ────────── Types ────────── */

export type TranscriptEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

export type ChatViewProps = {
  events: TranscriptEvent[];
  text: string;
  onTextChange: (text: string) => void;
  onSend: () => void;
  onQuickReply: (reply: string) => void;
  sending: boolean;
  isActive: boolean;
  showThinking: boolean;
  loading: boolean;
  /** 若有 optimistic pending message，loading 期間不顯示 skeleton */
  pendingMessage?: string | null;
  error: string | null;
  showSidebarToggle: boolean;
  onSidebarToggle: () => void;
  /** Eva header 狀態文字。M1 hardcoded "在線"；階段 2/3 從 session/user context 傳入 */
  evaStatusText?: string;
};

/* ────────── Pure helpers (exported for chat-panel reuse) ────────── */

export function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      (block as { type?: string }).type === "text" &&
      typeof (block as { text?: string }).text === "string"
    ) {
      parts.push((block as { text: string }).text);
    }
  }
  return parts.join("");
}

/* ────────── M1 階段 1 視覺常數 ────────── */

// quick reply chips · M1 固定佔位（階段 2 改 Eva 動態生成）
const QUICK_REPLIES = ["先試染看看", "介紹設計師", "推薦洗髮精", "我只想聊聊"];

// Eva 頭像漸層（規格 3.1）
const EVA_GRADIENT = "linear-gradient(135deg, #534AB7, #8074C1)";

// 對話區背景漸層（規格 3.1：米白→淺粉）
const CHAT_AREA_GRADIENT = "linear-gradient(180deg, #FAFAF7, #FBEAF0)";

// Eva header 紫漸層底
const HEADER_GRADIENT = "linear-gradient(135deg, #534AB7, #3C3489)";

/* ────────── Helper Components ────────── */

function EvaAvatar({
  size = 30,
  withDot = false,
}: {
  size?: number;
  withDot?: boolean;
}) {
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <div
        className="flex h-full w-full items-center justify-center rounded-full font-bold text-white"
        style={{ background: EVA_GRADIENT, fontSize: size * 0.42 }}
      >
        E
      </div>
      {withDot && (
        <span
          className="absolute bottom-0 right-0 rounded-full"
          style={{
            width: Math.max(8, size * 0.28),
            height: Math.max(8, size * 0.28),
            background: "#5DCAA5",
            border: "2px solid white",
          }}
        />
      )}
    </div>
  );
}

function EvaHeader({
  statusText,
  showSidebarToggle,
  onSidebarToggle,
}: {
  statusText: string;
  showSidebarToggle: boolean;
  onSidebarToggle: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 md:px-6"
      style={{ background: HEADER_GRADIENT }}
    >
      {showSidebarToggle && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="hidden shrink-0 text-white hover:bg-white/10 md:flex"
          onClick={onSidebarToggle}
          aria-label="Open sidebar"
        >
          <PanelLeft className="size-4" />
        </Button>
      )}
      <EvaAvatar size={44} withDot />
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold text-white">Eva</div>
        <div className="flex items-center gap-1.5 text-xs text-white/80">
          <span
            className="inline-block size-1.5 rounded-full"
            style={{ background: "#5DCAA5" }}
          />
          {statusText}
        </div>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div
      className="flex max-w-[85%] gap-2 pt-3"
      role="status"
      aria-live="polite"
      aria-label="Eva 正在輸入"
    >
      <EvaAvatar size={30} />
      <div
        className="flex items-center bg-card px-4 py-3 shadow-sm"
        style={{ borderRadius: "16px 16px 16px 4px" }}
      >
        <span className="typing-dot" />
        <span className="typing-dot" style={{ animationDelay: "0.15s" }} />
        <span className="typing-dot" style={{ animationDelay: "0.3s" }} />
      </div>
    </div>
  );
}

function QuickReplies({
  onPick,
  disabled,
}: {
  onPick: (text: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2 px-2">
      {QUICK_REPLIES.map((reply) => (
        <button
          key={reply}
          type="button"
          onClick={() => onPick(reply)}
          disabled={disabled}
          className="border bg-secondary px-4 py-1.5 text-sm text-secondary-foreground transition hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ borderRadius: 14, borderColor: "#B5B0DB" }}
        >
          {reply}
        </button>
      ))}
    </div>
  );
}

/* ────────── Markdown ────────── */

const streamdownComponents: Components = {
  p: ({ children, ...props }) => (
    <div {...props} className="mb-4 last:mb-0">
      {children}
    </div>
  ),
  ol: ({ children, ...props }) => (
    <ol {...props} className="mb-4 list-decimal space-y-2 pl-6 last:mb-0">
      {children}
    </ol>
  ),
  ul: ({ children, ...props }) => (
    <ul {...props} className="mb-4 list-disc space-y-1.5 pl-6 last:mb-0">
      {children}
    </ul>
  ),
  li: ({ children, ...props }) => (
    <li {...props} className="pl-1">
      {children}
    </li>
  ),
  pre: ({ children, ...props }) => (
    <pre {...props} className="mb-4 overflow-x-auto rounded-lg bg-muted/50 p-4 font-mono text-sm last:mb-0">
      {children}
    </pre>
  ),
  code: ({ children, ...props }) => (
    <code {...props} className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[13px]">
      {children}
    </code>
  ),
};

function Markdown({ text }: { text: string }) {
  return (
    <Streamdown components={streamdownComponents} linkSafety={{ enabled: false }}>
      {text}
    </Streamdown>
  );
}

/* ────────── Tool categorization ────────── */

function resolveToolName(ev: TranscriptEvent): string {
  const name = typeof ev.payload.name === "string" ? ev.payload.name : "";
  if (name) return name.toLowerCase();
  return ev.type.replace("agent.", "").toLowerCase() || "tool";
}

function mcpServerFromName(name: string): string | null {
  if (name.startsWith("notion__") || name.startsWith("notion_")) return "notion";
  if (name.startsWith("github__") || name.startsWith("github_")) return "github";
  if (name.startsWith("slack__") || name.startsWith("slack_")) return "slack";
  return null;
}

function toolCategory(name: string): string {
  const server = mcpServerFromName(name);
  if (server) return server;
  switch (name) {
    case "bash":
    case "shell":
      return "ran";
    case "edit":
      return "edited";
    case "write":
      return "wrote";
    case "read":
      return "read";
    case "grep":
    case "rg":
    case "glob":
    case "list":
    case "web_search":
      return "searched";
    case "webfetch":
    case "web_fetch":
      return "fetched";
    case "task":
      return "other";
    default:
      return "other";
  }
}

function summarizeToolGroup(tools: TranscriptEvent[]): string {
  const counts = new Map<string, number>();
  for (const tool of tools) {
    const cat = toolCategory(resolveToolName(tool));
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  const order: [string, string, string, string][] = [
    ["notion", "Used Notion", "time", "times"],
    ["github", "Used GitHub", "time", "times"],
    ["slack", "Used Slack", "time", "times"],
    ["ran", "Ran", "command", "commands"],
    ["edited", "Edited", "file", "files"],
    ["wrote", "Wrote", "file", "files"],
    ["read", "Read", "file", "files"],
    ["searched", "Searched", "pattern", "patterns"],
    ["fetched", "Fetched", "URL", "URLs"],
    ["other", "Ran", "action", "actions"],
  ];

  const parts: string[] = [];
  for (const [key, verb, , plural] of order) {
    const n = counts.get(key);
    if (!n) continue;
    parts.push(n === 1 ? verb : `${verb} ${n} ${plural}`);
  }

  return parts.join(", ") || `${tools.length} tool calls`;
}

function humanToolName(name: string): string {
  const server = mcpServerFromName(name);
  if (server) return name.replace(/^[^_]+__?/, "");
  return name;
}

function describeToolAction(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  if (name === "bash" || name === "shell") {
    const cmd = typeof obj.command === "string" ? obj.command : "";
    return cmd.length > 60 ? cmd.slice(0, 60) + "..." : cmd;
  }
  if (name === "read" || name === "write" || name === "edit") {
    return typeof obj.path === "string" ? obj.path : typeof obj.file_path === "string" ? obj.file_path : "";
  }
  if (name === "grep" || name === "rg") {
    return typeof obj.pattern === "string" ? obj.pattern : "";
  }
  const server = mcpServerFromName(name);
  if (server) {
    const action = name.replace(/^[^_]+__?/, "").replace(/_/g, " ");
    return action || "";
  }
  return "";
}

function ToolCallItem({ ev }: { ev: TranscriptEvent }) {
  const [expanded, setExpanded] = useState(false);
  const rawName = resolveToolName(ev);
  const input = ev.payload.input;
  const displayName = humanToolName(rawName);
  const label = describeToolAction(rawName, input);
  const hasDetail = Boolean(input && typeof input === "object" && Object.keys(input as object).length > 0);

  return (
    <div className="py-0.5">
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-2 py-0.5 text-left text-xs text-muted-foreground transition-colors",
          hasDetail ? "cursor-pointer hover:text-foreground" : "cursor-default",
        )}
        onClick={() => hasDetail && setExpanded((v) => !v)}
      >
        <Check className="size-3 shrink-0 text-muted-foreground" />
        <span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px]">
          {displayName}
        </span>
        {label && <span className="truncate text-foreground/80">{label}</span>}
        {hasDetail && (
          <ChevronRight className={cn("ml-auto size-3 shrink-0 transition-transform", expanded && "rotate-90")} />
        )}
      </button>
      {expanded && (
        <pre className="ml-5 mt-1 mb-1 max-h-48 overflow-auto rounded-lg bg-muted/40 p-3 font-mono text-[11px] text-muted-foreground">
          {JSON.stringify(input, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ToolGroup({ tools }: { tools: TranscriptEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  const label = summarizeToolGroup(tools);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="group flex cursor-pointer items-center gap-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>{label}</span>
        <ChevronRight
          className={cn(
            "size-3 shrink-0 transition-all",
            expanded ? "rotate-90 opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        />
      </button>
      {expanded && (
        <div className="ml-1.5 border-l border-border/40 pl-2 pt-0.5 pb-1">
          {tools.map((ev) => (
            <ToolCallItem key={ev.id} ev={ev} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ────────── Transcript renderer ────────── */

type EventGroup =
  | { kind: "event"; event: TranscriptEvent }
  | { kind: "tools"; events: TranscriptEvent[] };

function TranscriptRenderer({ grouped }: { grouped: EventGroup[] }) {
  return (
    <div className="flex flex-col gap-4">
      {grouped.map((group, idx) => {
        if (group.kind === "tools") {
          return <ToolGroup key={`tg-${idx}`} tools={group.events} />;
        }
        const ev = group.event;
        const { type, payload } = ev;

        if (type === "user.message") {
          const msg = textFromContent(payload.content);
          return (
            <div key={ev.id} className="flex justify-end">
              <div className="max-w-[80%]">
                <div
                  className="bg-secondary px-4 py-2.5 text-[15px] leading-relaxed text-foreground"
                  style={{ borderRadius: "16px 16px 4px 16px" }}
                >
                  <div className="whitespace-pre-wrap">{msg || "(empty)"}</div>
                </div>
              </div>
            </div>
          );
        }

        if (type === "agent.message") {
          const msg = textFromContent(payload.content);
          if (!msg) return null;
          return (
            <div key={ev.id} className="flex max-w-[85%] gap-2">
              <EvaAvatar size={30} />
              <div
                className="bg-card px-4 py-2.5 text-[15px] leading-relaxed text-foreground shadow-sm"
                style={{ borderRadius: "16px 16px 16px 4px" }}
              >
                <div className="overflow-x-auto">
                  <Markdown text={msg} />
                </div>
              </div>
            </div>
          );
        }

        if (type === "session.status_idle") {
          return (
            <div key={ev.id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <p className="text-xs font-medium text-amber-500">Requires action</p>
              <p className="mt-1 text-xs text-muted-foreground">
                This session needs confirmation in the Anthropic console.
              </p>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

/* ────────── Skeleton ────────── */

function ChatSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-6">
      <div className="flex justify-end">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted/30" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted/25" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted/25" />
      </div>
      <div className="h-3 w-36 animate-pulse rounded bg-muted/20" />
      <div className="space-y-2">
        <div className="h-4 w-5/6 animate-pulse rounded bg-muted/25" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted/25" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted/25" />
      </div>
    </div>
  );
}

/* ────────── Event grouping ────────── */

const HIDDEN_TYPES = new Set([
  "span.model_request_start",
  "span.model_request_end",
  "agent.tool_result",
  "session.status_terminated",
  "session.status_running",
  "session.deleted",
  "agent.thinking",
]);

const TOOL_TYPES = new Set([
  "agent.tool_use",
  "agent.mcp_tool_use",
  "agent.custom_tool_use",
]);

function hasMoreToolsAhead(events: TranscriptEvent[], fromIndex: number): boolean {
  for (let j = fromIndex; j < events.length; j++) {
    const t = events[j].type;
    if (TOOL_TYPES.has(t)) return true;
    if (t === "user.message") return false;
    if (t === "session.status_idle") return false;
  }
  return false;
}

function groupEvents(events: TranscriptEvent[]) {
  const visible = events.filter((ev) => !HIDDEN_TYPES.has(ev.type));
  const groups: EventGroup[] = [];
  let pendingTools: TranscriptEvent[] = [];

  const flushTools = () => {
    if (pendingTools.length === 0) return;
    groups.push({ kind: "tools", events: pendingTools });
    pendingTools = [];
  };

  for (let i = 0; i < visible.length; i++) {
    const ev = visible[i];

    if (TOOL_TYPES.has(ev.type)) {
      pendingTools.push(ev);
      continue;
    }

    if (ev.type === "user.message") {
      flushTools();
      groups.push({ kind: "event", event: ev });
      continue;
    }

    if (ev.type === "agent.message") {
      const msg = textFromContent(ev.payload.content);
      if (!msg) continue;
      if (pendingTools.length > 0 && hasMoreToolsAhead(visible, i + 1)) {
        continue;
      }
      flushTools();
      groups.push({ kind: "event", event: ev });
      continue;
    }

    if (ev.type === "session.status_idle") {
      const sr = ev.payload.stop_reason as { type?: string } | undefined;
      if (sr?.type !== "requires_action") continue;
      flushTools();
      groups.push({ kind: "event", event: ev });
      continue;
    }

    groups.push({ kind: "event", event: ev });
  }

  flushTools();
  return groups;
}

/* ────────── Main view component ────────── */

export function ChatView({
  events,
  text,
  onTextChange,
  onSend,
  onQuickReply,
  sending,
  isActive,
  showThinking,
  loading,
  pendingMessage,
  error,
  showSidebarToggle,
  onSidebarToggle,
  evaStatusText = "在線",
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length, showThinking, sending]);

  const grouped = groupEvents(events);

  // Layout · 三塊都在正常 flex flow（header / 對話捲動區 flex-1 / 底部輸入區 shrink-0）。
  // 對話區 overflow-y-auto + min-h-0 確保 flex 子元素正確 shrink；
  // 底部輸入區是正常 flow 子元素，不會疊到對話訊息上。
  return (
    <div className="flex h-full min-h-0">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <EvaHeader
          statusText={evaStatusText}
          showSidebarToggle={showSidebarToggle}
          onSidebarToggle={onSidebarToggle}
        />

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
          style={{ background: CHAT_AREA_GRADIENT }}
        >
          {loading && !pendingMessage ? (
            <ChatSkeleton />
          ) : (
            <div className="mx-auto max-w-3xl space-y-2">
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}
              <TranscriptRenderer grouped={grouped} />
              {showThinking && <TypingBubble />}
              <div ref={bottomRef as RefObject<HTMLDivElement>} />
            </div>
          )}
        </div>

        <div
          className="shrink-0 px-4 pt-4 pb-4"
          style={{ background: "#FBEAF0" }}
        >
          <div className="mx-auto max-w-3xl space-y-3">
            {/* Quick reply chips · M1 固定 4 個（階段 2 改 Eva 動態生成） */}
            <QuickReplies
              onPick={onQuickReply}
              disabled={sending || isActive}
            />

            {/* 輸入框 */}
            <div
              className="border border-border/60 bg-background/95 shadow-lg backdrop-blur transition-shadow focus-within:border-primary/60 focus-within:shadow-xl"
              style={{ borderRadius: 22 }}
            >
              <textarea
                value={text}
                onChange={(e) => onTextChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSend();
                  }
                }}
                placeholder="跟 Eva 說點什麼..."
                rows={1}
                disabled={sending || isActive}
                className="max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-5 pt-3.5 pb-1 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
                style={{ height: "auto", overflow: "hidden" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
                  el.style.overflow = el.scrollHeight > 200 ? "auto" : "hidden";
                }}
              />
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="emoji"
                    className="flex size-8 items-center justify-center rounded-full text-xl opacity-70 transition hover:bg-secondary hover:opacity-100"
                  >
                    <span aria-hidden="true">😊</span>
                  </button>
                  <button
                    type="button"
                    aria-label="upload image (coming in phase 2)"
                    disabled
                    className="flex size-8 cursor-not-allowed items-center justify-center rounded-full text-xl opacity-30"
                  >
                    <span aria-hidden="true">📷</span>
                  </button>
                </div>
                <button
                  type="button"
                  aria-label="Send message"
                  onClick={onSend}
                  disabled={sending || !text.trim()}
                  className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-30"
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowUp className="size-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
