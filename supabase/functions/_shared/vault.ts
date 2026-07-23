import type { SupabaseClient } from "@supabase/supabase-js";
import type { VaultClient } from "@conduit/connector-sdk";

/**
 * Concrete `VaultClient` over the Supabase Vault RPCs (see migration 0003). It is fed to
 * `SupabaseVaultSecretStore`, so the connector layer resolves credentials through the
 * same `SecretStore` seam it is unit-tested against — the only difference is where the
 * bytes live. All four RPCs are service-role only.
 */
export class SupabaseVaultClient implements VaultClient {
  constructor(private readonly supabase: SupabaseClient) {}

  async read(name: string): Promise<Record<string, string> | null> {
    const { data, error } = await this.supabase.rpc("app_vault_read", { p_ref: name });
    if (error) throw new Error(`vault read failed: ${error.message}`);
    return (data ?? null) as Record<string, string> | null;
  }

  async write(name: string, value: Record<string, string>): Promise<void> {
    const { error } = await this.supabase.rpc("app_vault_write", { p_ref: name, p_payload: value });
    if (error) throw new Error(`vault write failed: ${error.message}`);
  }

  async remove(name: string): Promise<void> {
    const { error } = await this.supabase.rpc("app_vault_delete", { p_ref: name });
    if (error) throw new Error(`vault delete failed: ${error.message}`);
  }

  async metadata(name: string): Promise<{ present: boolean; keys: string[]; updatedAt?: string }> {
    const { data, error } = await this.supabase.rpc("app_vault_metadata", { p_ref: name });
    if (error) throw new Error(`vault metadata failed: ${error.message}`);
    return data as { present: boolean; keys: string[]; updatedAt?: string };
  }
}
