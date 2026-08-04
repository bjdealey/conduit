// Small HTTP helpers shared by the Edge Functions.

export const cors: Record<string, string> = {
  "access-control-allow-origin": "*",
  // supabase-js sends apikey + x-client-info on every invoke; all must be allow-listed
  // or the browser blocks the request at preflight.
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

export function preflight(): Response {
  return new Response("ok", { headers: cors });
}

/**
 * 405 with the `Allow` header the status is meaningless without.
 *
 * `node-types` and `runner` were already importing this; it did not exist, so both
 * functions failed to load rather than failing on a wrong method. That is the failure
 * mode of an import that is never type-checked — see the runbook's verification note.
 */
export function methodNotAllowed(methods: readonly string[]): Response {
  return new Response(JSON.stringify({ error: `use ${methods.join(" or ")}` }), {
    status: 405,
    headers: { "content-type": "application/json", allow: methods.join(", "), ...cors },
  });
}
