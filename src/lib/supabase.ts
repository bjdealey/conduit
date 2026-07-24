import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The frontend's handle on our backend. Reads come from PostgREST / Edge Functions on
 * this Supabase project — never from a vendor API. When the two env vars are unset (the
 * default for the static prototype), `supabase` is null and the app falls back to seed
 * data, so nothing needs a backend to run.
 *
 * These are the *anon* URL + key only — public, RLS-guarded values. No service-role key
 * or secret ever reaches the browser.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured: boolean = Boolean(url && anonKey);

export const supabaseUrl: string | null = url ?? null;

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, { auth: { persistSession: false } })
  : null;
