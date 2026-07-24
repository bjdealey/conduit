/**
 * The Automation Anywhere A360 connector. Declares only the `bots` capability this
 * stage. The backend is the only caller of the A360 API: credentials are resolved
 * from the SecretStore inside `connect()`, held only in the in-process session, and
 * never returned from any method or serialised onto the instance.
 */
import { Capability } from "@conduit/domain";
import type { Bot, MapContext } from "@conduit/domain";
import type { BotProvider, Connector, HealthStatus, SyncResult, SecretStore } from "@conduit/connector-sdk";
import { A360_CAPABILITIES, A360_TYPE, assertA360Config, type A360Config, type A360Credentials } from "./config.ts";
import { fetchTransport, joinUrl, type HttpTransport } from "./http.ts";
import { A360Session } from "./session.ts";
import { AUTH_HEADER, BOT_LIST_PATH, botListRequestBody } from "./endpoints.ts";
import { extractBotRecords, mapA360Bot } from "./map.ts";

export type A360ConnectorDeps = {
  /** HTTP transport; defaults to `fetch`. Tests inject a fake Control Room here. */
  transport?: HttpTransport;
  /** Clock, for testable token-expiry behaviour. Defaults to `Date.now`. */
  now?: () => number;
  /** Optional call-fact logger. Receives no credential material — ever. */
  logCall?: (event: string, meta: { connectorId: string }) => void;
};

export class A360Connector implements Connector, BotProvider {
  readonly id: string;
  readonly type = A360_TYPE;
  readonly capabilities = [...A360_CAPABILITIES];

  private readonly config: A360Config;
  private readonly secrets: SecretStore;
  private readonly transport: HttpTransport;
  private readonly now: () => number;
  private readonly logCall: (event: string, meta: { connectorId: string }) => void;
  private session: A360Session | null = null;

  constructor(id: string, config: unknown, secrets: SecretStore, deps: A360ConnectorDeps = {}) {
    this.id = id;
    this.config = assertA360Config(config);
    this.secrets = secrets;
    this.transport = deps.transport ?? fetchTransport;
    this.now = deps.now ?? (() => Date.now());
    this.logCall = deps.logCall ?? (() => {});
  }

  /** Resolve this instance's credentials (server-side) and build a session. */
  async connect(): Promise<void> {
    // Scoped read: only this instance's own secretRef is ever resolved.
    const credentials = (await this.secrets.get(this.config.secretRef)) as unknown as A360Credentials;
    this.session = new A360Session(this.config, credentials, this.transport, this.now);
  }

  async disconnect(): Promise<void> {
    this.session = null;
  }

  async health(): Promise<HealthStatus> {
    const checkedAt = new Date(this.now()).toISOString();
    try {
      const session = await this.ensureSession();
      const started = this.now();
      // Acquiring/refreshing the token is the health probe. A refresh failure is
      // reported here as an unhealthy status — it does not crash the listing path.
      await session.token();
      this.logCall("health.ok", { connectorId: this.id });
      return { ok: true, checkedAt, latencyMs: this.now() - started };
    } catch (e) {
      // Log the fact of the failure; never the credential material.
      this.logCall("health.fail", { connectorId: this.id });
      return { ok: false, checkedAt, detail: `A360 auth/refresh failed: ${messageOf(e)}` };
    }
  }

  async sync(): Promise<SyncResult> {
    const bots = await this.listBots();
    return { synced: { [Capability.Bots]: bots.length } };
  }

  async listBots(): Promise<Bot[]> {
    const session = await this.ensureSession();
    const token = await session.token(); // refresh-on-expiry happens transparently here
    this.logCall("bots.list", { connectorId: this.id });

    const res = await this.transport.request({
      url: joinUrl(this.config.controlRoomUrl, BOT_LIST_PATH),
      method: "POST",
      headers: {
        "content-type": "application/json",
        [AUTH_HEADER]: token,
        // TODO(a360): confirm header; sending Bearer too until verified (see endpoints.ts).
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(botListRequestBody()),
    });
    if (!res.ok) throw new Error(`A360 bot list failed (status ${res.status})`);

    const ctx: MapContext = { connectorId: this.id, platform: this.type, capability: "bots" };
    const records = extractBotRecords(await res.json(), ctx);
    return records.map((record) => mapA360Bot(record, ctx));
  }

  private async ensureSession(): Promise<A360Session> {
    if (!this.session) await this.connect();
    return this.session as A360Session;
  }

  /**
   * Explicit, allow-listed serialisation. Even if an internal field held credential
   * material, only these safe fields are ever emitted — the config carries the
   * `secretRef` pointer, never a secret value.
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      type: this.type,
      capabilities: this.capabilities,
      controlRoomUrl: this.config.controlRoomUrl,
      secretRef: this.config.secretRef,
    };
  }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
