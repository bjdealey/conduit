// Small HTTP helpers shared by the Edge Functions.

export const cors: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
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
