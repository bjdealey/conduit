// connectors — admin CRUD over the connector_instances registry, plus the write-only
// credential path. Credentials arrive in a request body (server-side, over HTTPS), are
// written straight to Vault, and are NEVER returned: the read path exposes presence and
// field names only. Runtime add/enable/disable/remove here means no redeploy.
import { serviceClient } from "../_shared/supabase.ts";
import { secretStore, type InstanceRow } from "../_shared/registry.ts";
import { requireAdminOrService } from "../_shared/auth.ts";
import { json, preflight } from "../_shared/http.ts";

/** Vault ref for an instance's credential bundle — namespaced per instance. */
const secretRefFor = (id: string) => `connector/${id}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const supabase = serviceClient();
  const denied = await requireAdminOrService(req, supabase);
  if (denied) return denied;

  const secrets = secretStore(supabase);

  try {
    switch (req.method) {
      case "GET": {
        const { data, error } = await supabase.from("connector_instances").select("*");
        if (error) return json(500, { error: error.message });
        const instances = await Promise.all(
          ((data ?? []) as InstanceRow[]).map(async (row) => ({
            id: row.id,
            type: row.type,
            name: row.name,
            enabled: row.enabled,
            config: row.config,
            // Secret presence + field names only — never values.
            secret: row.secret_ref ? await secrets.describe(row.secret_ref) : { present: false, keys: [] },
          })),
        );
        return json(200, { instances });
      }

      case "POST": {
        const body = (await req.json()) as {
          id?: string;
          type?: string;
          name?: string;
          config?: Record<string, unknown>;
          credentials?: Record<string, string>;
        };
        if (!body.id || !body.type || !body.name) {
          return json(400, { error: "id, type and name are required" });
        }
        const secretRef = secretRefFor(body.id);
        // Write-only: the credential bundle goes straight to Vault; the row stores a pointer.
        if (body.credentials) await secrets.set(secretRef, body.credentials);

        const { error } = await supabase.from("connector_instances").insert({
          id: body.id,
          type: body.type,
          name: body.name,
          enabled: true,
          config: body.config ?? {},
          secret_ref: body.credentials ? secretRef : null,
        });
        if (error) return json(409, { error: error.message });
        return json(201, { id: body.id });
      }

      case "PATCH": {
        const body = (await req.json()) as {
          id?: string;
          name?: string;
          enabled?: boolean;
          config?: Record<string, unknown>;
          credentials?: Record<string, string>;
        };
        if (!body.id) return json(400, { error: "id is required" });

        if (body.credentials) await secrets.set(secretRefFor(body.id), body.credentials);

        const patch: Record<string, unknown> = {};
        if (body.name !== undefined) patch.name = body.name;
        if (body.enabled !== undefined) patch.enabled = body.enabled;
        if (body.config !== undefined) patch.config = body.config;
        if (body.credentials) patch.secret_ref = secretRefFor(body.id);

        if (Object.keys(patch).length > 0) {
          const { error } = await supabase.from("connector_instances").update(patch).eq("id", body.id);
          if (error) return json(500, { error: error.message });
        }
        return json(200, { id: body.id });
      }

      case "DELETE": {
        const id = new URL(req.url).searchParams.get("id");
        if (!id) return json(400, { error: "id query param is required" });
        // Remove the credential bundle first, then the row.
        await secrets.delete(secretRefFor(id));
        const { error } = await supabase.from("connector_instances").delete().eq("id", id);
        if (error) return json(500, { error: error.message });
        return json(200, { id });
      }

      default:
        return json(405, { error: `method ${req.method} not allowed` });
    }
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
