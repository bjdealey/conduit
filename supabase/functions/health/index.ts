// health — per-instance health probes. Admin/service gated because a probe triggers an
// auth/refresh against the vendor. Detail strings carry no credential material.
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
  const { registry } = await buildRegistry(supabase, secrets);

  const statuses = await Promise.all(
    registry.list().map(async (connector) => ({
      connectorId: connector.id,
      type: connector.type,
      enabled: registry.isEnabled(connector.id),
      health: await connector.health(),
    })),
  );
  return json(200, { instances: statuses });
});
