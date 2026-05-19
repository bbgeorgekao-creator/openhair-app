"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SignInModal } from "@/components/sign-in-modal";
import {
  ArrowUp,
  ChevronDown,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { GitHubIcon, NotionIcon, SlackIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { setPendingMessage } from "@/lib/pending-message";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// 首頁中央輪播大標題（4 秒換一句）·「破冰」場合的柔軟邀請
// 70 顧問的專業留到對話真的開始後才出場；對齊概念圖 03 onboard 的氣質
const HEADING_PROMPTS = [
  "想聊聊妳的頭髮嗎？",
  "今天的頭髮，還順手嗎？",
  "Eva 在這，妳想說點什麼？",
  "最近髮況有沒有什麼想問？",
  "告訴我妳今天的頭髮故事",
];

// 6 個常見入口 pill · 互補 chat 頁的 4 個 quick reply chips（不重複）
// chat chips：先試染看看 / 介紹設計師 / 推薦洗髮精 / 我只想聊聊
// 階段 2-3 可改 Eva 動態生成
const SUGGESTION_PILLS = [
  { label: "🌱 染色建議", prompt: "我想換顏色，給我點建議" },
  { label: "💆 看看我的頭髮", prompt: "幫我看看我最近的髮況" },
  { label: "🧴 推薦產品", prompt: "推薦適合我的洗髮精" },
  { label: "✂️ 想找設計師", prompt: "我想找設計師，幫我介紹" },
  { label: "🌿 頭皮問題", prompt: "我的頭皮最近有點不舒服" },
  { label: "✨ 想換風格", prompt: "想換個造型但沒方向" },
];

// MCP integrations dropdown · M1 階段 1 隱藏，元件本身保留（階段 2-3 可能用到）
const SHOW_INTEGRATIONS = false;

export function NewChatComposer({
  isAuthenticated = true,
  mcpConnections = {},
}: {
  isAuthenticated?: boolean;
  mcpConnections?: Record<string, boolean>;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showSlackSetup, setShowSlackSetup] = useState(false);
  const [headingIndex, setHeadingIndex] = useState(0);
  const [mcpState, setMcpState] = useState<Record<string, boolean>>(() => ({
    github: !!mcpConnections.github,
    notion: !!mcpConnections.notion,
    slack: !!mcpConnections.slack,
  }));
  const toggleMcp = useCallback((name: string, enabled: boolean) => {
    setMcpState((prev) => ({ ...prev, [name]: enabled }));
  }, []);

  useEffect(() => {
    const id = setInterval(
      () => setHeadingIndex((i) => (i + 1) % HEADING_PROMPTS.length),
      4000,
    );
    return () => clearInterval(id);
  }, []);

  const startSession = useCallback(
    async (text?: string) => {
      const message = text ?? prompt;
      if (!isAuthenticated) {
        setShowSignIn(true);
        return;
      }
      if (!message.trim()) return;
      setCreating(true);
      setError(null);
      try {
        const trimmed = message.trim();
        const res = await fetch("/api/managed-agents/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(
            (body as { error?: string }).error ?? "Failed to create session",
          );
          return;
        }
        const data = (await res.json()) as { id: string };
        setPrompt("");
        setPendingMessage(data.id, trimmed);
        router.push(`/chat/${data.id}`);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create session",
        );
      } finally {
        setCreating(false);
      }
    },
    [isAuthenticated, prompt, router],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void startSession();
      }
    },
    [startSession],
  );

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void startSession();
    },
    [startSession],
  );

  return (
    <div className="relative flex h-full items-center justify-center px-4 pb-4 md:px-8 md:pb-8">
      <form onSubmit={onSubmit} className="w-full max-w-2xl space-y-5">
        <h1
          key={headingIndex}
          className="animate-in fade-in slide-in-from-bottom-2 mb-6 text-center text-2xl font-medium tracking-tight duration-500 md:text-3xl"
        >
          {HEADING_PROMPTS[headingIndex]}
        </h1>

        <div className="rounded-2xl border border-border bg-muted/30 shadow-sm transition-shadow focus-within:shadow-md focus-within:ring-1 focus-within:ring-primary/20">
          <textarea
            ref={textareaRef}
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="跟 Eva 說點什麼..."
            rows={2}
            disabled={creating}
            className="max-h-[160px] min-h-[72px] w-full resize-none bg-transparent px-5 pt-4 pb-2 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
          />

          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-1.5">
              {SHOW_INTEGRATIONS && (
                <IntegrationsDropdown
                  mcpState={mcpState}
                  mcpConnections={mcpConnections}
                  onToggle={toggleMcp}
                  onLogin={(serverName) => {
                    if (serverName === "slack") {
                      setShowSlackSetup(true);
                    } else {
                      window.location.href = `/api/mcp-auth/${serverName}`;
                    }
                  }}
                  onLogout={async (serverName) => {
                    await fetch(`/api/mcp-auth/${serverName}`, {
                      method: "DELETE",
                    });
                    window.location.reload();
                  }}
                />
              )}
            </div>
            <button
              type="submit"
              aria-label="Send message"
              disabled={!prompt.trim() || creating}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-30"
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </button>
          </div>
        </div>

        {error && <p className="px-1 text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center justify-center gap-2">
          {SUGGESTION_PILLS.map((pill) => (
            <button
              key={pill.label}
              type="button"
              onClick={() => {
                setPrompt(pill.prompt);
                textareaRef.current?.focus();
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
            >
              {pill.label}
            </button>
          ))}
        </div>
      </form>

      <SignInModal open={showSignIn} onOpenChange={setShowSignIn} />
      <SlackSetupModal
        open={showSlackSetup}
        onOpenChange={setShowSlackSetup}
      />
    </div>
  );
}

interface IntegrationDef {
  name: string;
  label: string;
  icon: React.ReactNode;
}

const INTEGRATIONS: IntegrationDef[] = [
  { name: "github", label: "GitHub", icon: <GitHubIcon className="size-4" /> },
  { name: "slack", label: "Slack", icon: <SlackIcon className="size-4" /> },
  { name: "notion", label: "Notion", icon: <NotionIcon className="size-4" /> },
];

function IntegrationsDropdown({
  mcpState,
  mcpConnections,
  onToggle,
  onLogin,
  onLogout,
}: {
  mcpState: Record<string, boolean>;
  mcpConnections: Record<string, boolean>;
  onToggle: (name: string, enabled: boolean) => void;
  onLogin: (serverName: string) => void;
  onLogout: (serverName: string) => void;
}) {
  const enabledIcons = INTEGRATIONS.filter(
    (s) => mcpState[s.name] && mcpConnections[s.name],
  );

  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        {enabledIcons.length > 0 ? (
          <span className="flex items-center gap-1.5">
            {enabledIcons.map((s) => (
              <span
                key={s.name}
                className="inline-flex size-3.5 [&>svg]:size-3.5"
              >
                {s.icon}
              </span>
            ))}
          </span>
        ) : (
          <span>Integrations</span>
        )}
        <ChevronDown className="size-3 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-64 p-0">
        <div className="py-1">
          {INTEGRATIONS.map((server) => {
            const connected = mcpConnections[server.name] ?? false;
            const enabled = mcpState[server.name] ?? false;
            return (
              <IntegrationRow
                key={server.name}
                server={server}
                connected={connected}
                enabled={enabled}
                onToggle={onToggle}
                onLogin={onLogin}
                onLogout={onLogout}
              />
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SlackSetupModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full border border-border bg-muted">
            <SlackIcon className="size-5" />
          </div>
          <DialogTitle>Slack requires setup</DialogTitle>
          <DialogDescription>
            Slack integration requires a Slack app with OAuth credentials. Clone
            this template and deploy with your own Slack app ID and secret to
            search your team conversations.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-2">
          <a
            href="https://github.com/vercel-labs/claude-managed-agents"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            <GitHubIcon className="size-3.5" />
            Clone template
            <ExternalLink className="size-3" />
          </a>
          <a
            href="https://api.slack.com/apps"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium transition-colors hover:bg-muted"
          >
            Create a Slack app
            <ExternalLink className="size-3" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IntegrationRow({
  server,
  connected,
  enabled,
  onToggle,
  onLogin,
  onLogout,
}: {
  server: IntegrationDef;
  connected: boolean;
  enabled: boolean;
  onToggle: (name: string, enabled: boolean) => void;
  onLogin: (serverName: string) => void;
  onLogout: (serverName: string) => void;
}) {
  function handleToggle(checked: boolean) {
    onToggle(server.name, checked);
    if (checked && !connected) {
      onLogin(server.name);
    }
  }

  return (
    <div className="group/row flex items-center justify-between px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="relative flex size-7 items-center justify-center rounded-md border border-border/60 bg-muted/60">
          {server.icon}
          <span
            className={cn(
              "absolute -right-0.5 -bottom-0.5 size-2 rounded-full border border-background",
              connected && enabled
                ? "bg-primary"
                : connected
                  ? "bg-muted-foreground/40"
                  : "bg-muted-foreground/20",
            )}
          />
        </div>
        <span className="text-sm">{server.label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {enabled && !connected && (
          <button
            type="button"
            onClick={() => onLogin(server.name)}
            className="cursor-pointer rounded px-2 py-0.5 text-xs text-muted-foreground ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground"
          >
            Login
          </button>
        )}
        {connected && (
          <button
            type="button"
            onClick={() => onLogout(server.name)}
            className="cursor-pointer rounded px-2 py-0.5 text-xs text-muted-foreground/0 ring-0 ring-border transition-all group-hover/row:text-muted-foreground group-hover/row:ring-1 hover:bg-muted! hover:text-foreground!"
          >
            Logout
          </button>
        )}
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          size="sm"
        />
      </div>
    </div>
  );
}
