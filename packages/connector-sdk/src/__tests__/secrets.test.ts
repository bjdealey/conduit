import { describe, expect, it } from "vitest";
import {
  InMemorySecretStore,
  SecretNotFoundError,
  SupabaseVaultSecretStore,
  type VaultClient,
} from "../index";

/** A fake VaultClient that mimics the Supabase RPC contract: it stores the bundle as
 *  an opaque object and its metadata path returns field names, never values. This is
 *  exactly the seam the Deno `SupabaseVaultClient` implements against the Vault RPCs. */
function fakeVault(): VaultClient {
  const store = new Map<string, Record<string, string>>();
  return {
    async read(name) {
      return store.get(name) ?? null;
    },
    async write(name, value) {
      store.set(name, { ...value });
    },
    async remove(name) {
      store.delete(name);
    },
    async metadata(name) {
      const v = store.get(name);
      return { present: Boolean(v), keys: v ? Object.keys(v) : [], updatedAt: v ? "2026-01-01T00:00:00Z" : undefined };
    },
  };
}

describe("SupabaseVaultSecretStore adapts the Vault seam without leaking values", () => {
  it("round-trips a bundle through get() and throws when absent", async () => {
    const store = new SupabaseVaultSecretStore(fakeVault());
    await store.set("connector/acme-eu", { username: "svc", apiKey: "SECRET" });
    expect(await store.get("connector/acme-eu")).toEqual({ username: "svc", apiKey: "SECRET" });
    await expect(store.get("connector/missing")).rejects.toBeInstanceOf(SecretNotFoundError);
  });

  it("describe() returns presence + field names, never the values", async () => {
    const store = new SupabaseVaultSecretStore(fakeVault());
    await store.set("connector/acme-eu", { username: "svc", apiKey: "SECRET_VALUE" });

    const meta = await store.describe("connector/acme-eu");
    expect(meta).toMatchObject({ ref: "connector/acme-eu", present: true, keys: ["username", "apiKey"] });
    expect(JSON.stringify(meta)).not.toContain("SECRET_VALUE");
    expect(JSON.stringify(meta)).not.toContain("svc");

    expect(await store.describe("connector/none")).toMatchObject({ present: false, keys: [] });
  });

  it("InMemorySecretStore honours the same describe() contract", async () => {
    const store = new InMemorySecretStore({ "connector/x": { token: "T0P" } });
    const meta = await store.describe("connector/x");
    expect(meta).toMatchObject({ present: true, keys: ["token"] });
    expect(JSON.stringify(meta)).not.toContain("T0P");
  });
});
