/**
 * Supabase browser client · 給 client components / "use client" 元件用
 *
 * 標準寫法來源：Supabase 官方 Next.js App Router docs（createBrowserClient
 * 套用 SSR cookie 同步機制）。不要自己發明。
 *
 * 使用範例：
 *   "use client";
 *   import { createClient } from "@/lib/supabase/client";
 *   const supabase = createClient();
 *   await supabase.auth.signInWithOtp({ phone: "+8869..." });
 */

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
