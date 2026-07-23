// bots — read the normalised bots cache and return domain models (camelCase). Served by
// a service-role function so the current (pre-Supabase-Auth) frontend can read via the
// anon key without loosening the table's RLS. Once Supabase Auth is wired, the frontend
// can switch to a direct PostgREST read of `bots` (RLS: authenticated).
import { serviceClient } from "../_shared/supabase.ts";
import { json, preflight } from "../_shared/http.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const supabase = serviceClient();
  const { data, error } = await supabase
    .from("bots")
    .select("id,source_id,platform,connector_id,title,state,owner")
    .order("title");
  if (error) return json(500, { error: error.message });

  const bots = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id,
    sourceId: r.source_id,
    platform: r.platform,
    connectorId: r.connector_id,
    title: r.title,
    state: r.state,
    owner: r.owner,
  }));
  return json(200, { bots });
});
