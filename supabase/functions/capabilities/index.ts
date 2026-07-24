// capabilities — the union of capabilities declared by enabled connectors. The frontend
// enables features from this set, never from a connector's vendor identity. No secret is
// touched: building the registry does not call connect().
import { CAPABILITIES } from "@conduit/domain";
import { serviceClient } from "../_shared/supabase.ts";
import { buildRegistry, secretStore } from "../_shared/registry.ts";
import { json, preflight } from "../_shared/http.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const supabase = serviceClient();
  const secrets = secretStore(supabase);
  const { registry } = await buildRegistry(supabase, secrets);

  const supported = CAPABILITIES.filter((capability) => registry.enabledWith(capability).length > 0);
  return json(200, { capabilities: supported });
});
