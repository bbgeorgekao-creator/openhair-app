/**
 * Supabase server client · 給 server components / API routes / Server Actions 用
 *
 * 標準寫法來源：Supabase 官方 Next.js App Router docs。Next.js 15+ 把 cookies()
 * 改成 async，所以這個 createClient 也是 async。不要自己發明，照 Supabase
 * 官方 setAll try/catch 模板（Server Component 寫 cookie 會 throw、middleware
 * 寫 cookie 不會 throw — 兩種呼叫場景共用此 client，靠 try/catch 吞掉
 * Server Component 寫 cookie 的限制錯誤，由 middleware 負責 refresh）。
 *
 * 使用範例：
 *   import { createClient } from "@/lib/supabase/server";
 *   const supabase = await createClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll was called from a Server Component (Server Components
            // cannot mutate cookies). Safe to ignore when a middleware client
            // is refreshing the session on every request.
            // — Per Supabase official @supabase/ssr docs for Next.js App Router
          }
        },
      },
    },
  );
}
