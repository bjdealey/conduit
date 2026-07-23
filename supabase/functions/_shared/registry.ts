import type { SupabaseClient } from "@supabase/supabase-js";
import { ConnectorRegistry, SupabaseVaultSecretStore, type SecretStore } from "@conduit/connector-sdk";
import { a360ConnectorFactory } from "@conduit/connector-automation-anywhere";
import { SupabaseVaultClient } from "./vault.ts";

/** A `connector_instances` row. */
export type InstanceRow = {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  secret_ref: string | null;
};

/** The SecretStore backed by Supabase Vault (server-side only). */
export function secretStore(supabase: SupabaseClient): SecretStore {
  return new SupabaseVaultSecretStore(new SupabaseVaultClient(supabase));
}

/** The set of connector types this deployment knows how to build. */
export function defineKnownTypes(registry: ConnectorRegistry, secrets: SecretStore): void {
  registry.defineType(a360ConnectorFactory(secrets));
  // Future connector types self-register here (azure-devops, jira, …).
}

/**
 * Build a live `ConnectorRegistry` from the `connector_instances` table. The registry is
 * rebuilt per invocation — Edge Functions are stateless; the domain cache tables hold
 * durable state. The `secret_ref` column is merged into each instance's config as
 * `secretRef`, so the connector resolves only its own credentials at `connect()` time.
 * Rows of an unknown type are skipped and returned for the caller to report.
 */
export async function buildRegistry(
  supabase: SupabaseClient,
  secrets: SecretStore,
): Promise<{ registry: ConnectorRegistry; skipped: InstanceRow[]; invalid: { id: string; reason: string }[] }> {
  const { data, error } = await supabase.from("connector_instances").select("*");
  if (error) throw new Error(`failed to read connector_instances: ${error.message}`);

  const registry = new ConnectorRegistry();
  defineKnownTypes(registry, secrets);

  const skipped: InstanceRow[] = [];
  const invalid: { id: string; reason: string }[] = [];
  for (const row of (data ?? []) as InstanceRow[]) {
    if (!registry.hasType(row.type)) {
      skipped.push(row);
      continue;
    }
    // A single malformed row (e.g. missing controlRoomUrl/secret_ref) must not fail the
    // whole build — record it and carry on with the healthy instances.
    try {
      registry.add({
        id: row.id,
        type: row.type,
        name: row.name,
        enabled: row.enabled,
        config: { ...row.config, secretRef: row.secret_ref ?? undefined },
      });
    } catch (e) {
      invalid.push({ id: row.id, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { registry, skipped, invalid };
}
