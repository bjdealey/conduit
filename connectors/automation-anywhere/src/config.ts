/**
 * Per-instance configuration and credential shapes for an A360 Control Room.
 *
 * Config is non-secret and safe to persist in `connector_instances.config`: it holds
 * the Control Room URL and a `secretRef` pointer — never a credential value. The
 * credential *bundle* is resolved from the `SecretStore` at `connect()` time, server-side.
 */
import { Capability } from "@conduit/domain";

/** Connector type / platform id (lowercase-kebab, per conventions). */
export const A360_TYPE = "automation-anywhere";

/** Capabilities implemented this stage. Declare only what is actually wired. */
export const A360_CAPABILITIES: Capability[] = [Capability.Workflows];

export type A360AuthMode = "apiKey" | "oauth";

/** Non-secret, per-instance connector configuration. */
export type A360Config = {
  /** Control Room base URL, e.g. "https://prod-eu.my.automationanywhere.digital". */
  controlRoomUrl: string;
  /** Pointer into the SecretStore for this instance's credentials. Never a secret. */
  secretRef: string;
  /** "apiKey" (username + API key) or "oauth" (refresh-token grant). Default "apiKey". */
  authMode?: A360AuthMode;
  /** Fallback token lifetime when the returned JWT carries no `exp` claim. */
  tokenTtlSeconds?: number;
  /** Clock-skew margin subtracted from expiry when deciding to refresh. Default 30s. */
  expirySkewSeconds?: number;
};

/** Credential bundle for username + API-key auth (resolved from the SecretStore). */
export type A360ApiKeyCredentials = { username: string; apiKey: string };

/** Credential bundle for OAuth refresh-token auth (resolved from the SecretStore). */
export type A360OAuthCredentials = {
  username: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

export type A360Credentials = A360ApiKeyCredentials | A360OAuthCredentials;

/** Validate the non-secret config, failing loudly on a malformed instance row. */
export function assertA360Config(raw: unknown): A360Config {
  const c = raw as Partial<A360Config>;
  if (!c || typeof c.controlRoomUrl !== "string" || c.controlRoomUrl.length === 0) {
    throw new Error(`A360 config requires a non-empty "controlRoomUrl"`);
  }
  if (typeof c.secretRef !== "string" || c.secretRef.length === 0) {
    throw new Error(`A360 config requires a non-empty "secretRef"`);
  }
  return c as A360Config;
}
