// node-types — the builder palette, served from the catalogue table.
//
// Mirrors the `capabilities` function: a GET returning our own shape, coerced
// defensively on the client. The frontend keeps a compiled-in fallback so the static
// prototype still runs with no backend — same pattern `seedConnectedWorkflows` uses
// for workflows, so there is one code path either way.
import { serviceClient } from "../_shared/supabase.ts";
import { json, methodNotAllowed } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method !== "GET") return methodNotAllowed(["GET"]);

  const { data, error } = await serviceClient()
    .from("node_types")
    .select("*")
    .eq("enabled", true)
    .order("sort_order")
    .order("id");
  if (error) return json(500, { error: error.message });

  const nodeTypes = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id,
    label: r.label,
    package: r.package,
    summary: r.summary,
    fields: r.fields ?? [],
    requires: r.requires ?? undefined,
    readiness: r.readiness,
  }));
  return json(200, { nodeTypes });
});
