import { describe, expect, it } from "vitest";
import { Capability } from "@conduit/domain";
import { BotService, ConnectorRegistry, InMemorySecretStore, queryCapability } from "@conduit/connector-sdk";
import { A360Connector, a360ConnectorFactory } from "../src/index";
import type { HttpRequest, HttpResponse, HttpTransport } from "../src/index";

/* ----------------------------------------------------------------- test helpers */

function jsonResponse(status: number, body: unknown): HttpResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

/** base64url encode (test-side JWT builder). */
function b64url(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A JWT whose only meaningful claim is `exp` (seconds since epoch). */
function makeJwt(expEpochSeconds: number): string {
  return `${b64url(JSON.stringify({ alg: "none" }))}.${b64url(JSON.stringify({ exp: expEpochSeconds }))}.sig`;
}

type FakeControlRoom = {
  transport: HttpTransport;
  calls: { auth: number; botList: number };
  authState: { fail: boolean };
};

/** A fake A360 Control Room bound to a base URL. It routes only its own URL, checks
 *  the API key it receives (proving credential scoping), and issues JWTs whose `exp`
 *  is derived from the shared test clock. */
function fakeControlRoom(opts: {
  baseUrl: string;
  expectedApiKey: string;
  bots: unknown[];
  now: () => number;
  tokenLifetimeSeconds?: number;
}): FakeControlRoom {
  const calls = { auth: 0, botList: 0 };
  const authState = { fail: false };
  const transport: HttpTransport = {
    async request(req: HttpRequest): Promise<HttpResponse> {
      if (!req.url.startsWith(opts.baseUrl)) return jsonResponse(404, { error: "routed to wrong control room" });
      const path = req.url.slice(opts.baseUrl.length);

      if (path === "/v2/authentication") {
        calls.auth++;
        if (authState.fail) return jsonResponse(401, { error: "auth disabled" });
        const body = JSON.parse(req.body ?? "{}") as { apiKey?: string };
        if (body.apiKey !== opts.expectedApiKey) return jsonResponse(401, { error: "wrong api key for this control room" });
        const exp = Math.floor(opts.now() / 1000) + (opts.tokenLifetimeSeconds ?? 20 * 60);
        return jsonResponse(200, { token: makeJwt(exp) });
      }

      if (path === "/v2/repository/file/list") {
        calls.botList++;
        const auth = req.headers?.["x-authorization"] ?? req.headers?.["authorization"];
        if (!auth) return jsonResponse(401, { error: "missing token" });
        return jsonResponse(200, { list: opts.bots });
      }

      return jsonResponse(404, { error: `unhandled ${path}` });
    },
  };
  return { transport, calls, authState };
}

const validBot = (over: Record<string, unknown> = {}) => ({
  id: "701",
  name: "Invoice Bot",
  createdBy: "Brad",
  status: "RUNNING",
  ...over,
});

/* --------------------------------------------------------------------- the tests */

describe("Acceptance 1: token refresh on expiry, and refresh failure surfaces as a health failure", () => {
  it("refreshes an expired token without re-entry and keeps listing bots", async () => {
    let clock = 1_000_000_000_000; // fixed start, ms
    const now = () => clock;
    const cr = fakeControlRoom({ baseUrl: "https://eu.cr", expectedApiKey: "KEY_EU", bots: [validBot()], now, tokenLifetimeSeconds: 60 });
    const secrets = new InMemorySecretStore({ "a360/eu": { username: "svc", apiKey: "KEY_EU" } });
    const c = new A360Connector("a360-eu", { controlRoomUrl: "https://eu.cr", secretRef: "a360/eu" }, secrets, { transport: cr.transport, now });

    await c.listBots();
    expect(cr.calls.auth).toBe(1); // first auth

    clock += 120_000; // advance past the 60s token lifetime
    await c.listBots();
    expect(cr.calls.auth).toBe(2); // transparently re-authenticated, no user re-entry
    expect(cr.calls.botList).toBe(2);
  });

  it("reports a refresh failure as an unhealthy status and never crashes the listing path", async () => {
    let clock = 1_000_000_000_000;
    const now = () => clock;
    const cr = fakeControlRoom({ baseUrl: "https://eu.cr", expectedApiKey: "KEY_EU", bots: [validBot()], now });
    const secrets = new InMemorySecretStore({ "a360/eu": { username: "svc", apiKey: "KEY_EU" } });
    const c = new A360Connector("a360-eu", { controlRoomUrl: "https://eu.cr", secretRef: "a360/eu" }, secrets, { transport: cr.transport, now });

    cr.authState.fail = true; // Control Room now rejects auth
    const health = await c.health();
    expect(health.ok).toBe(false);
    expect(health.detail).toContain("A360 auth/refresh failed");

    // The bot-listing path degrades via the service, not a crash: BotService health-gates.
    const registry = new ConnectorRegistry();
    registry.register(c);
    const result = await new BotService(registry, { error: () => {} }).list();
    expect(result.items).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ connectorId: "a360-eu", kind: "health" });
  });
});

describe("Acceptance 2: A360 bot payloads map to the domain model, with status normalisation", () => {
  it("maps ids/title/owner and folds A360 statuses onto BotState, unknown -> Unknown", async () => {
    const now = () => 1_000_000_000_000;
    const bots = [
      validBot({ id: 701, name: "Running Bot", status: "RUNNING", createdBy: "Brad" }),
      validBot({ id: "702", name: "Done Bot", status: "COMPLETED", createdBy: "Dana" }),
      validBot({ id: "703", name: "Off Bot", status: "DISABLED", createdBy: "Priya" }),
      validBot({ id: "704", name: "Weird Bot", status: "FROZEN_SOLID", createdBy: "Sam" }), // unknown status
    ];
    const cr = fakeControlRoom({ baseUrl: "https://eu.cr", expectedApiKey: "KEY_EU", bots, now });
    const secrets = new InMemorySecretStore({ "a360/eu": { username: "svc", apiKey: "KEY_EU" } });
    const c = new A360Connector("a360-eu", { controlRoomUrl: "https://eu.cr", secretRef: "a360/eu" }, secrets, { transport: cr.transport, now });

    const result = await c.listBots();
    expect(result.map((b) => [b.id, b.state])).toEqual([
      ["a360-eu:701", "Running"],
      ["a360-eu:702", "Idle"],
      ["a360-eu:703", "Disabled"],
      ["a360-eu:704", "Unknown"], // unmapped/unknown status
    ]);
    expect(result[0]).toMatchObject({ sourceId: "701", platform: "automation-anywhere", connectorId: "a360-eu", title: "Running Bot", owner: "Brad" });
  });
});

describe("Acceptance 3: requesting an undeclared capability returns a clear unsupported result, not an exception", () => {
  it("reports bots as supported and schedules as unsupported without throwing", async () => {
    const secrets = new InMemorySecretStore({ "a360/eu": { username: "svc", apiKey: "KEY_EU" } });
    const c = new A360Connector("a360-eu", { controlRoomUrl: "https://eu.cr", secretRef: "a360/eu" }, secrets);

    expect(queryCapability(c, Capability.Bots)).toMatchObject({ supported: true });
    const schedules = queryCapability(c, Capability.Schedules);
    expect(schedules.supported).toBe(false);
    if (!schedules.supported) expect(schedules.reason).toContain("does not declare capability");
  });
});

describe("Acceptance 4: no stored secret value is reachable through any public surface", () => {
  it("keeps username/apiKey out of config, serialisation, describe(), and results", async () => {
    const SECRET_KEY = "TOP_SECRET_API_KEY_value";
    const SECRET_USER = "service-account-name";
    const now = () => 1_000_000_000_000;
    const cr = fakeControlRoom({ baseUrl: "https://eu.cr", expectedApiKey: SECRET_KEY, bots: [validBot()], now });
    const secrets = new InMemorySecretStore({ "a360/eu": { username: SECRET_USER, apiKey: SECRET_KEY } });
    const c = new A360Connector("a360-eu", { controlRoomUrl: "https://eu.cr", secretRef: "a360/eu" }, secrets, { transport: cr.transport, now });

    await c.connect();
    await c.listBots();
    const failHealth = await new A360Connector("x", { controlRoomUrl: "https://eu.cr", secretRef: "a360/eu" }, secrets, { transport: cr.transport, now }).health();

    const surfaces = [JSON.stringify(c), JSON.stringify(await c.listBots()), JSON.stringify(failHealth), JSON.stringify(await secrets.describe("a360/eu"))].join("\n");
    expect(surfaces).not.toContain(SECRET_KEY);
    expect(surfaces).not.toContain(SECRET_USER);

    // The read path exposes presence + field names, never values.
    const meta = await secrets.describe("a360/eu");
    expect(meta).toMatchObject({ ref: "a360/eu", present: true, keys: ["username", "apiKey"] });

    // The instance's persisted config carries only a pointer, never the secret.
    expect(JSON.stringify(c)).toContain("a360/eu");
    expect(JSON.stringify(c)).not.toContain("apiKey");
  });
});

describe("Acceptance 5: two Control Rooms return correctly attributed, non-mixed results", () => {
  it("keeps each instance's bots attributed to its own connector, using its own credentials", async () => {
    const now = () => 1_000_000_000_000;
    const eu = fakeControlRoom({ baseUrl: "https://eu.cr", expectedApiKey: "KEY_EU", bots: [validBot({ id: "1", name: "EU Bot", createdBy: "Brad" })], now });
    const us = fakeControlRoom({ baseUrl: "https://us.cr", expectedApiKey: "KEY_US", bots: [validBot({ id: "1", name: "US Bot", createdBy: "Dana", status: "COMPLETED" })], now });
    const secrets = new InMemorySecretStore({
      "a360/eu": { username: "svc-eu", apiKey: "KEY_EU" },
      "a360/us": { username: "svc-us", apiKey: "KEY_US" },
    });

    const registry = new ConnectorRegistry();
    // Data-driven: same type, two instances, distinct config — each with its own transport.
    registry.defineType(a360ConnectorFactory(secrets, { transport: eu.transport, now }));
    registry.add({ id: "a360-eu", type: "automation-anywhere", config: { controlRoomUrl: "https://eu.cr", secretRef: "a360/eu" } });
    registry.register(new A360Connector("a360-us", { controlRoomUrl: "https://us.cr", secretRef: "a360/us" }, secrets, { transport: us.transport, now }));

    const { items, errors } = await new BotService(registry).list();
    expect(errors).toEqual([]);

    const byConnector = Object.fromEntries(items.map((b) => [b.connectorId, b]));
    expect(byConnector["a360-eu"]).toMatchObject({ id: "a360-eu:1", title: "EU Bot", state: "Running" });
    expect(byConnector["a360-us"]).toMatchObject({ id: "a360-us:1", title: "US Bot", state: "Idle" });
    // Same vendor id "1" on both, never collides or mixes.
    expect(new Set(items.map((b) => b.id))).toEqual(new Set(["a360-eu:1", "a360-us:1"]));

    // Each instance authenticated against its own Control Room with its own key.
    expect(eu.calls.auth).toBeGreaterThanOrEqual(1);
    expect(us.calls.auth).toBeGreaterThanOrEqual(1);

    // Independently addressable.
    const usOnly = await new BotService(registry).list({ connectorId: "a360-us" });
    expect(usOnly.items.map((b) => b.id)).toEqual(["a360-us:1"]);
  });
});
