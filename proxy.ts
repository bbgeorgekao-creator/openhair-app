/**
 * Next.js middleware (本專案用 export name `proxy`，對齊 starter 既有命名)
 *
 * D-1-b: 從 better-auth 的 getSessionCookie 換成 Supabase Auth (via @supabase/ssr)。
 * 路徑清單 isPublicPath / needsAuth 一字不變 — 只換「怎麼檢查 session」。
 *
 * - public path → 直接放行
 * - 不在 needsAuth 清單 → 直接放行
 * - 其他 → 走 Supabase updateSession 拿 user：
 *     - 沒 user → 重導 /
 *     - 有 user → return supabase 修過的 response（含 refresh 後的 cookie）
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

function isPublicPath(pathname: string) {
  if (pathname === "/") return true;
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname === "/auth/error" || pathname.startsWith("/auth/error/"))
    return true;
  if (pathname.startsWith("/.well-known/workflow")) return true;
  return false;
}

function needsAuth(pathname: string) {
  return (
    pathname.startsWith("/chat") ||
    pathname.startsWith("/api/managed-agents") ||
    pathname.startsWith("/api/github")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!needsAuth(pathname)) {
    return NextResponse.next();
  }

  const { user, response } = await updateSession(request);

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.well-known/workflow/).*)",
  ],
};
