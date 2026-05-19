/**
 * Auth session 接縫 · D-1-b: better-auth → Supabase Auth
 *
 * 「換引擎不換車體」紀律：
 *   - getSession() 回傳結構嚴格不變 — { user: { id, name, email, image } } 或 null
 *     上層讀 session?.user?.{id,name,email,image}（dashboard layout / page）
 *   - requireUserId() 回傳結構嚴格不變 — { userId } 或 { error: Response(401) }
 *     上層用 if ("error" in authz) return authz.error pattern（4 個 managed-agents routes）
 *
 * Supabase SupabaseUser → 我們的 viewer shape mapping:
 *   id     → user.id  （Supabase UUID）
 *   name   → user_metadata.name ?? phone ?? email ?? "User"
 *   email  → email ?? phone ?? ""  （手機登入 email 可能空）
 *   image  → user_metadata.avatar_url ?? null
 */

import { createClient } from "@/lib/supabase/server";

type Viewer = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

type Session = { user: Viewer };

export async function getSession(): Promise<Session | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const metaName = typeof meta.name === "string" ? meta.name : null;
    const metaAvatar =
      typeof meta.avatar_url === "string" ? meta.avatar_url : null;

    return {
      user: {
        id: user.id,
        name: metaName ?? user.phone ?? user.email ?? "User",
        email: user.email ?? user.phone ?? "",
        image: metaAvatar,
      },
    };
  } catch {
    return null;
  }
}

export async function requireUserId(): Promise<
  { userId: string } | { error: Response }
> {
  const session = await getSession();
  if (!session?.user?.id) {
    return {
      error: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  return { userId: session.user.id };
}
