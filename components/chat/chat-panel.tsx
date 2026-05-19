"use client";

/**
 * ChatPanel — controller 元件
 *
 * 職責：管 state（events / text / loading / error / SSE connection）+ API 呼叫，
 * 把所有視覺渲染委派給 <ChatView>。
 *
 * 視覺層 → components/chat/chat-view.tsx
 * 預覽頁 → app/preview/chat/page.tsx（用同一個 ChatView，吃 mock data）
 */

import { useEffect, useRef, useState } from "react";
import { consumePendingMessage } from "@/lib/pending-message";
import { useSidebar } from "@/lib/sidebar-context";
import {
  ChatView,
  textFromContent,
  type TranscriptEvent,
} from "./chat-view";

export function ChatPanel({ sessionId }: { sessionId: string }) {
  const sidebar = useSidebar();
  const [pending] = useState(() => consumePendingMessage(sessionId));
  const [events, setEvents] = useState<TranscriptEvent[]>(() => {
    if (!pending) return [];
    return [
      {
        id: "optimistic-initial",
        type: "user.message",
        payload: { content: [{ type: "text", text: pending }] },
        occurredAt: new Date().toISOString(),
      },
    ];
  });
  const [tailing, setTailing] = useState(!!pending);
  const [, setTitle] = useState<string | null>(null); // tracked for future use; not displayed in Eva header
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const seenIdsRef = useRef(new Set<string>());
  const runIdRef = useRef<string | null>(null);

  function connectToStream(runId: string) {
    eventSourceRef.current?.close();
    runIdRef.current = runId;

    const es = new EventSource(`/api/readable/${runId}`);
    eventSourceRef.current = es;
    setTailing(true);

    es.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data) as TranscriptEvent;
        if (seenIdsRef.current.has(ev.id)) return;
        seenIdsRef.current.add(ev.id);

        setEvents((prev) => {
          if (prev.some((e) => e.id === ev.id)) return prev;

          const withoutOptimistic =
            ev.type === "user.message"
              ? prev.filter((e) => {
                  if (!e.id.startsWith("optimistic-")) return true;
                  return (
                    textFromContent(e.payload.content) !==
                    textFromContent(ev.payload.content)
                  );
                })
              : prev;
          return [...withoutOptimistic, ev];
        });
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
    };
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const res = await fetch(
          `/api/managed-agents/transcript?sessionId=${encodeURIComponent(sessionId)}`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ?? "Failed to load",
          );
        }
        const data = (await res.json()) as {
          title: string | null;
          workflowRunId: string | null;
        };
        if (cancelled) return;

        setTitle(data.title);

        if (data.workflowRunId) {
          connectToStream(data.workflowRunId);
        } else {
          setTailing(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load transcript",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();

    return () => {
      cancelled = true;
      eventSourceRef.current?.close();
    };
  }, [sessionId]);

  // Inner send pipeline — same logic as before; extracted so handleSend and
  // handleQuickReply both call the same code path (no logic change).
  async function sendText(textToSend: string) {
    const trimmed = textToSend.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setTailing(true);
    setError(null);

    const optimisticId = `optimistic-${Date.now()}`;
    setEvents((prev) => [
      ...prev,
      {
        id: optimisticId,
        type: "user.message",
        payload: { content: [{ type: "text", text: trimmed }] },
        occurredAt: new Date().toISOString(),
      },
    ]);
    setText("");

    try {
      const res = await fetch("/api/managed-agents/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, text: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Send failed");
      }

      if (runIdRef.current) {
        connectToStream(runIdRef.current);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
      setTailing(false);
      setEvents((prev) => prev.filter((ev) => ev.id !== optimisticId));
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    await sendText(text);
  }

  async function handleQuickReply(reply: string) {
    if (sending || tailing) return;
    await sendText(reply);
  }

  const lastUserIdx = events.findLastIndex((e) => e.type === "user.message");
  const agentDoneAfterLastMsg = lastUserIdx >= 0 && events.slice(lastUserIdx + 1).some((ev) => {
    if (ev.type === "session.status_terminated" || ev.type === "session.deleted") return true;
    if (ev.type === "session.status_idle") {
      const sr = (ev.payload as { stop_reason?: { type?: string } }).stop_reason;
      return sr?.type === "end_turn" || sr?.type === "retries_exhausted";
    }
    return false;
  });

  const isActive = (tailing || sending) && !agentDoneAfterLastMsg;
  const showThinking = isActive && lastUserIdx >= 0;

  return (
    <ChatView
      events={events}
      text={text}
      onTextChange={setText}
      onSend={() => void handleSend()}
      onQuickReply={(reply) => void handleQuickReply(reply)}
      sending={sending}
      isActive={isActive}
      showThinking={showThinking}
      loading={loading}
      pendingMessage={pending}
      error={error}
      showSidebarToggle={!sidebar.open}
      onSidebarToggle={sidebar.toggle}
    />
  );
}
