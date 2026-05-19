/**
 * Supabase middleware helper · 給 Next.js middleware（本專案叫 proxy.ts）用
 *
 * 標準寫法來源：Supabase 官方 @supabase/ssr Next.js App Router docs。
 * Middleware 上下文跟 server component 不同 — middleware 用 NextRequest /
 * NextResponse 操作 cookie（不是 next/headers 的 cookies()），且 setAll
 * 必須同步把 cookie 寫進 request 跟 response 兩邊。
 *
 * IMPORTANT（Supabase 官方警告）：
 *   不要在 createServerClient 和 supabase.auth.getUser() 之間寫任何 Supabase
 *   查詢、不要動 NextResponse 物件 — 否則可能導致 user 被隨機登出（cookie
 *   refresh 順序錯亂）。
 *
 * Returns:
 *   - supabase: 已配 cookie 介面的 server client（middleware 上下文）
 *   - user: 當前 Supabase auth user，未登入為 null
 *   - response: NextResponse — 已含 Supabase 寫入的 refresh cookie；
 *     呼叫端應在「放行」case return 此 response，讓 cookie refresh 生效
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do NOT add Supabase queries or NextResponse mutations between this line
  // and the getUser() call below. — Per Supabase official docs.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user, response: supabaseResponse };
}
