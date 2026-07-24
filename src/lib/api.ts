/**
 * The internal API client. The frontend calls *our* API — PostgREST-backed Edge
 * Functions on our Supabase project — and gets back *our* domain models. It never talks
 * to a vendor. Responses are defensively coerced at this boundary: a malformed row is
 * dropped rather than trusted (the loud-failure guarantee lives server-side, at the
 * adapter; here we just don't render junk).
 */
import { BOT_STATES, CAPABILITIES, Capability, type Bot, type BotState } from "@conduit/domain";
import { supabase } from "./supabase";

function nonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Coerce an untrusted API object into a domain `Bot`, or null if it isn't one. */
export function coerceBot(raw: unknown): Bot | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = nonEmptyString(r.id);
  const sourceId = nonEmptyString(r.sourceId);
  const platform = nonEmptyString(r.platform);
  const connectorId = nonEmptyString(r.connectorId);
  const title = nonEmptyString(r.title);
  const owner = nonEmptyString(r.owner);
  if (!id || !sourceId || !platform || !connectorId || !title || !owner) return null;
  const state: BotState =
    typeof r.state === "string" && (BOT_STATES as readonly string[]).includes(r.state)
      ? (r.state as BotState)
      : "Unknown";
  return { id, sourceId, platform, connectorId, title, state, owner };
}

export function coerceBots(list: unknown): Bot[] {
  return Array.isArray(list) ? list.map(coerceBot).filter((b): b is Bot => b !== null) : [];
}

/** Keep only recognised capability ids from an untrusted list. */
export function coerceCapabilities(list: unknown): Capability[] {
  const known = new Set<string>(CAPABILITIES);
  return Array.isArray(list) ? list.filter((c): c is Capability => typeof c === "string" && known.has(c)) : [];
}

/** The capabilities the enabled connectors declare — drives which UI features light up. */
export async function getCapabilities(): Promise<Capability[]> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.functions.invoke("capabilities", { method: "GET" });
  if (error) throw error;
  return coerceCapabilities((data as { capabilities?: unknown } | null)?.capabilities);
}

/**
 * Normalised bots from every enabled connector. Served by the `bots` Edge Function
 * (service-role read over the cache table) so it works before Supabase Auth is wired;
 * once it is, this can move to a direct PostgREST read.
 */
export async function getBots(): Promise<Bot[]> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.functions.invoke("bots", { method: "GET" });
  if (error) throw error;
  return coerceBots((data as { bots?: unknown } | null)?.bots);
}
