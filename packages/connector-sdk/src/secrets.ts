/**
 * Server-side secret resolution. Credential values live only in a `SecretStore` and
 * are used only server-side (in a connector's `connect()`), never serialised into an
 * API response or reachable by the frontend.
 *
 * The store models a **write-only** credential path: `set` writes a bundle, `get`
 * resolves it for server-side use, and the *read* surface (`describe`) returns
 * presence + field names only — never the values.
 */

/** A credential bundle. Opaque string map (e.g. `{ username, apiKey }`). */
export type SecretRecord = Readonly<Record<string, string>>;

/** The read-path view of a secret: presence and shape, never values. */
export type SecretMetadata = {
  ref: string;
  present: boolean;
  /** Field names stored (e.g. ["username","apiKey"]) — never their values. */
  keys: string[];
  updatedAt?: string;
};

export interface SecretStore {
  /**
   * Resolve the full credential bundle. **Server-side only** — never call this from a
   * path whose result reaches the frontend.
   */
  get(ref: string): Promise<SecretRecord>;
  /** Write-only path: store or replace a bundle. */
  set(ref: string, value: SecretRecord): Promise<void>;
  /** Read path: presence + metadata only, never values. */
  describe(ref: string): Promise<SecretMetadata>;
  /** Remove a bundle. */
  delete(ref: string): Promise<void>;
}

export class SecretNotFoundError extends Error {
  constructor(readonly ref: string) {
    super(`No secret stored at ref "${ref}"`);
    this.name = "SecretNotFoundError";
  }
}

/** In-memory `SecretStore` for dev and tests. Refs are isolated by key, so one
 *  connector instance's `secretRef` never resolves another's bundle. */
export class InMemorySecretStore implements SecretStore {
  private readonly store = new Map<string, { value: SecretRecord; updatedAt: string }>();

  constructor(seed?: Record<string, SecretRecord>, now: () => string = () => new Date().toISOString()) {
    if (seed) for (const [ref, value] of Object.entries(seed)) this.store.set(ref, { value: { ...value }, updatedAt: now() });
  }

  async get(ref: string): Promise<SecretRecord> {
    const entry = this.store.get(ref);
    if (!entry) throw new SecretNotFoundError(ref);
    return { ...entry.value };
  }

  async set(ref: string, value: SecretRecord): Promise<void> {
    this.store.set(ref, { value: { ...value }, updatedAt: new Date().toISOString() });
  }

  async describe(ref: string): Promise<SecretMetadata> {
    const entry = this.store.get(ref);
    return { ref, present: Boolean(entry), keys: entry ? Object.keys(entry.value) : [], updatedAt: entry?.updatedAt };
  }

  async delete(ref: string): Promise<void> {
    this.store.delete(ref);
  }
}

/**
 * Supabase Vault-backed `SecretStore`. It depends on a small injected `VaultClient`
 * seam rather than a Supabase client library, so this package pulls in no new
 * dependency; the real client is wired at deploy time.
 *
 * TODO(supabase): provide the production `VaultClient` that reads
 * `vault.decrypted_secrets` (and writes via `vault.create_secret`) with the
 * service-role key, inside an Edge Function. Not built this stage (no Supabase wiring).
 */
export interface VaultClient {
  read(name: string): Promise<Record<string, string> | null>;
  write(name: string, value: Record<string, string>): Promise<void>;
  remove(name: string): Promise<void>;
  metadata(name: string): Promise<{ present: boolean; keys: string[]; updatedAt?: string }>;
}

export class SupabaseVaultSecretStore implements SecretStore {
  constructor(private readonly vault: VaultClient) {}

  async get(ref: string): Promise<SecretRecord> {
    const value = await this.vault.read(ref);
    if (!value) throw new SecretNotFoundError(ref);
    return { ...value };
  }

  async set(ref: string, value: SecretRecord): Promise<void> {
    await this.vault.write(ref, { ...value });
  }

  async describe(ref: string): Promise<SecretMetadata> {
    const meta = await this.vault.metadata(ref);
    return { ref, ...meta };
  }

  async delete(ref: string): Promise<void> {
    await this.vault.remove(ref);
  }
}
