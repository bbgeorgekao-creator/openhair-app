"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Ellipsis,
  LogIn,
  PanelLeft,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserMenu } from "@/components/user-menu";
import { SignInModal } from "@/components/sign-in-modal";
import { cn } from "@/lib/utils";

interface SessionListItem {
  id: string;
  title: string | null;
  updatedAt: string;
}

interface ViewerData {
  name: string;
  email: string;
  image?: string | null;
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(dateStr).toLocaleDateString();
}

export function DashboardSidebar({
  viewer,
  initialSessions,
  onNavigate,
  onToggleSidebar,
  className,
}: {
  viewer: ViewerData | null;
  initialSessions: SessionListItem[];
  onNavigate?: () => void;
  onToggleSidebar?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sessionItems, setSessionItems] = useState(initialSessions);
  const [showSignIn, setShowSignIn] = useState(false);

  useEffect(() => {
    setSessionItems(initialSessions);
  }, [initialSessions]);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/managed-agents/sessions");
      if (!res.ok) return;
      const data: { sessions?: SessionListItem[] } = await res.json();
      const latest = data.sessions ?? [];
      setSessionItems(latest);
    } catch {
      // best effort
    }
  }, []);

  useEffect(() => {
    if (!viewer) return;
    void refreshSessions();
    const interval = setInterval(() => void refreshSessions(), 5_000);
    return () => clearInterval(interval);
  }, [viewer, refreshSessions]);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        const res = await fetch(
          `/api/managed-agents/session?sessionId=${encodeURIComponent(sessionId)}`,
          { method: "DELETE" },
        );
        if (!res.ok) return;
        setSessionItems((prev) => prev.filter((s) => s.id !== sessionId));
        if (pathname === `/chat/${sessionId}`) {
          router.push("/");
        }
      } catch {
        // best effort
      }
    },
    [pathname, router],
  );

  const selectedSessionId = pathname.startsWith("/chat/")
    ? pathname.split("/")[2] ?? null
    : null;

  return (
    <aside
      className={cn(
        "flex h-full w-64 shrink-0 flex-col border-r border-border bg-background",
        className,
      )}
    >
      <div className="flex flex-col gap-1 px-2 pt-2 pb-1">
        <div className="flex items-center justify-between px-2 py-1">
          <Link
            href="/"
            className="flex items-center gap-2"
            onClick={onNavigate}
            aria-label="Open Hair 首頁"
          >
            {/* Eva 漸層圓「E」+ Open Hair 文字 · 跟 chat 頁 Eva 頭像同 motif */}
            <span
              className="flex size-7 items-center justify-center rounded-full text-[13px] font-bold text-white"
              style={{
                background: "linear-gradient(135deg, #534AB7, #8074C1)",
              }}
              aria-hidden="true"
            >
              E
            </span>
            <span className="text-sm font-semibold text-foreground">
              Open Hair
            </span>
          </Link>
          {onToggleSidebar && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close sidebar"
              onClick={onToggleSidebar}
            >
              <PanelLeft className="size-4" />
            </Button>
          )}
        </div>
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
        >
          <Plus className="size-4" />
          新對話
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {sessionItems.map((session) => {
          const active = selectedSessionId === session.id;
          return (
            <div
              key={session.id}
              className={cn(
                "group/session relative mb-0.5 rounded-lg transition-colors",
                active
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <Link
                href={`/chat/${session.id}`}
                onClick={onNavigate}
                className="block px-2 py-1.5 pr-8 text-sm"
              >
                <div className="truncate text-sm font-medium">
                  {session.title || "未命名對話"}
                </div>
                <div
                  className="truncate text-[11px] text-muted-foreground"
                  suppressHydrationWarning
                >
                  {formatTimeAgo(session.updatedAt)}
                </div>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1 opacity-0 transition-opacity hover:bg-muted group-hover/session:opacity-100 data-[popup-open]:opacity-100 cursor-pointer"
                  aria-label="Session options"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Ellipsis className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="bottom">
                  <DropdownMenuItem
                    className="text-red-500"
                    onClick={() => void deleteSession(session.id)}
                  >
                    <Trash2 className="size-4" />
                    刪除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border px-2 py-2">
        {viewer ? (
          <UserMenu user={viewer} />
        ) : (
          <>
            <Button
              variant="ghost"
              className="w-full justify-between"
              onClick={() => setShowSignIn(true)}
            >
              <span className="flex items-center gap-2">
                <LogIn className="size-4" />
                登入
              </span>
              <ArrowRight className="size-3.5 text-muted-foreground" />
            </Button>
            <SignInModal open={showSignIn} onOpenChange={setShowSignIn} />
          </>
        )}
      </div>
    </aside>
  );
}
