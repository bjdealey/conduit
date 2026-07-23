import type { SupabaseClient } from "@supabase/supabase-js";
import { json } from "./http.ts";

function bearer(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

/**
 * Gate a mutating/administrative request. Allows the service-role key (used by pg_cron and
 * backend callers) or an authenticated user with the admin role.
 *
 * Returns a 401/403 `Response` to short-circuit, or `null` when the caller is allowed.
 *
 * TODO(supabase): confirm the admin role source once Supabase Auth is wired for the
 * frontend — this reads `app_metadata.role === "admin"`; it may instead live in a
 * `user_roles` table or a custom JWT claim. Until then, service-role callers are the
 * reliable path.
 */
export async function requireAdminOrService(req: Request, supabase: SupabaseClient): Promise<Response | null> {
  const token = bearer(req);
  if (!token) return json(401, { error: "missing bearer token" });

  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return null; // service-role / cron

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return json(401, { error: "invalid token" });

  const role = (data.user.app_metadata as { role?: string } | null)?.role;
  if (role !== "admin") return json(403, { error: "admin role required" });
  return null;
}
