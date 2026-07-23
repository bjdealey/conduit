import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * A service-role Supabase client. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
 * injected into Edge Functions by the platform. The service role bypasses RLS and is the
 * only identity that may call the Vault RPCs — it must never be exposed to the browser.
 */
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
