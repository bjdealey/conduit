// sync — pull workflows from every enabled connector instance, normalise, and upsert into the
// `workflows` cache table. Invoked by pg_cron on a schedule and on demand by admins.
//
// Credentials are resolved from Vault inside each connector's connect(), server-side; no
// secret is logged or returned. The response carries counts and per-connector errors only.
import { WorkflowService } from "@conduit/connector-sdk";
import { serviceClient } from "../_shared/supabase.ts";
import { buildRegistry, secretStore } from "../_shared/registry.ts";
import { requireAdminOrService } from "../_shared/auth.ts";
import { json, preflight } from "../_shared/http.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const supabase = serviceClient();
  const denied = await requireAdminOrService(req, supabase);
  if (denied) return denied;

  const secrets = secretStore(supabase);
  const { registry, skipped, invalid } = await buildRegistry(supabase, secrets);

  // WorkflowService health-gates each connector and never throws; a failing upstream
  // becomes an error entry, not a crash.
  const result = await new WorkflowService(registry).list();

  if (result.items.length > 0) {
    const rows = result.items.map((b) => ({
      id: b.id,
      source_id: b.sourceId,
      platform: b.platform,
      connector_id: b.connectorId,
      title: b.title,
      state: b.state,
      owner: b.owner,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("workflows").upsert(rows, { onConflict: "id" });
    if (error) return json(500, { error: `workflows upsert failed: ${error.message}` });
  }

  // TODO(supabase): prune workflows that disappeared from a successfully-synced connector.
  // Deferred deliberately so a partial/failed sync can never delete good rows; add a
  // per-connector "delete rows not in this run's id set" once the sync is proven.

  return json(200, {
    synced: result.items.length,
    errors: result.errors,
    skippedTypes: skipped.map((s) => ({ id: s.id, type: s.type })),
    invalid,
  });
});
