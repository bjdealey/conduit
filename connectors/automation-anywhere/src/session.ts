/**
 * A360 token lifecycle: acquire a bearer token, cache it with its expiry, and
 * refresh it on expiry with no user re-entry. "Refresh" is a re-authentication with
 * the stored API key (long-lived) or an OAuth refresh-token grant — the credential
 * bundle already lives in the SecretStore, so neither path prompts a human.
 */
import type { A360Config, A360Credentials, A360ApiKeyCredentials, A360OAuthCredentials } from "./config";
import { AUTH_PATH, OAUTH_TOKEN_PATH } from "./endpoints";
import { joinUrl, type HttpTransport } from "./http";

export class A360AuthError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "A360AuthError";
  }
}

type CachedToken = { token: string; expiresAtMs: number };

export class A360Session {
  // True private fields (#) — unlike TS `private`, these are non-enumerable and are
  // never serialised by JSON.stringify, so credentials/tokens cannot leak that way.
  readonly #credentials: A360Credentials;
  #cached: CachedToken | null = null;
  private readonly config: A360Config;
  private readonly transport: HttpTransport;
  private readonly now: () => number;

  constructor(
    config: A360Config,
    credentials: A360Credentials,
    transport: HttpTransport,
    now: () => number = () => Date.now(),
  ) {
    this.config = config;
    this.#credentials = credentials;
    this.transport = transport;
    this.now = now;
  }

  /** A valid bearer token, acquiring or refreshing as needed. */
  async token(): Promise<string> {
    const skewMs = (this.config.expirySkewSeconds ?? 30) * 1000;
    if (this.#cached && this.#cached.expiresAtMs - skewMs > this.now()) {
      return this.#cached.token;
    }
    return this.refresh();
  }

  /** Force a fresh token. Throws `A360AuthError` on failure — never leaks credentials. */
  async refresh(): Promise<string> {
    const mode = this.config.authMode ?? "apiKey";
    const token =
      mode === "oauth"
        ? await this.oauthRefresh(this.#credentials as A360OAuthCredentials)
        : await this.apiKeyAuth(this.#credentials as A360ApiKeyCredentials);
    this.#cached = { token, expiresAtMs: this.computeExpiry(token) };
    return token;
  }

  private async apiKeyAuth(cred: A360ApiKeyCredentials): Promise<string> {
    const res = await this.transport.request({
      url: joinUrl(this.config.controlRoomUrl, AUTH_PATH),
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: cred.username, apiKey: cred.apiKey }),
    });
    if (!res.ok) throw new A360AuthError(`authentication failed (status ${res.status})`, res.status);
    return this.readToken(await res.json());
  }

  private async oauthRefresh(cred: A360OAuthCredentials): Promise<string> {
    // TODO(a360): verify OAuth refresh endpoint + params (see endpoints.ts). UNVERIFIED.
    const res = await this.transport.request({
      url: joinUrl(this.config.controlRoomUrl, OAUTH_TOKEN_PATH),
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "refresh_token",
        clientId: cred.clientId,
        clientSecret: cred.clientSecret,
        refreshToken: cred.refreshToken,
      }),
    });
    if (!res.ok) throw new A360AuthError(`token refresh failed (status ${res.status})`, res.status);
    return this.readToken(await res.json());
  }

  private readToken(payload: unknown): string {
    const token = (payload as { token?: unknown } | null)?.token;
    if (typeof token !== "string" || token.length === 0) {
      throw new A360AuthError("authentication response contained no token");
    }
    return token;
  }

  private computeExpiry(token: string): number {
    const expMs = jwtExpiryMs(token);
    if (expMs) return expMs;
    // TODO(a360): confirm the Control Room token TTL for the fallback when the JWT
    // carries no `exp`. Using a conservative default.
    const ttlMs = (this.config.tokenTtlSeconds ?? 20 * 60) * 1000;
    return this.now() + ttlMs;
  }
}

/** Read the `exp` claim (seconds) from a JWT and return it in ms, or null if absent. */
export function jwtExpiryMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}
