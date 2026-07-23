# Pluggable integration layer — implementation plan

Planning-only document. **No application code was written or modified to produce it.**
Every claim about the current codebase cites a file and line. The design that follows is
a proposal for review; nothing here is built yet.

> **Goal.** The frontend never calls a vendor API. It calls *our* API, which returns *our*
> domain models. Vendor systems (Automation Anywhere A360 first; then Azure DevOps, Jira,
> ServiceNow, SQL Server, custom REST) are **pluggable connectors** that can be added,
> enabled, disabled, or removed at runtime with no frontend change.

```
Frontend ──▶ Internal API ──▶ Capability services ──▶ Connector adapters ──▶ Vendor APIs
   React        our HTTP        BotService, …           A360, ADO, Jira …
   (our DTOs)   (our DTOs)      (dispatch + merge)      (normalise at the boundary)
```

---

## 1. Inventory — what exists that is relevant

The single most important finding: **there is no backend.** Conduit is a static, in-memory
React/Vite/TypeScript prototype. The `{{BACKEND}}` and `{{SECRETS_STORE}}` placeholders in
the brief therefore resolve to *"none yet"* — choosing them is decision #1 in §7.

| Concern the brief asks about | What is actually in the repo | Evidence |
|---|---|---|
| HTTP client setup | **None.** No `fetch`, `axios`, `XMLHttpRequest`, or env-var read anywhere in `src`. | `grep` over `src` returns nothing |
| Config / secrets handling | **None.** `.env`/`.env.*` are git-ignored but unused; no config loader; secrets appear only as *mock UI rows* (`Credential`, and `GlobalValue.secret`). | `.gitignore:11-13`, `src/data/manage.ts` (`Credential`, `GlobalValue`) |
| DI / registration | **None** in the backend sense. The only "registry" is the React context store that hands seed arrays to components. | `src/store.tsx:130-176` |
| Existing API controllers | **None.** No server, no routes. Deploy target is **GitHub Pages** (static only). | `.github/workflows/deploy.yml` |
| Frontend data calls | Components call `useStore()`; the store imports seed arrays from `src/data/*.ts` and serves them synchronously. No network boundary exists. | `src/store.tsx:2-8,130-176`; consumers via `useStore()` |
| Domain models (already present) | `Automation`, `Run`, `Folder`, `Issue`, `Member` (`types.ts`); `Schedule`, `EventTrigger`, `Credential`, `Package`, `GlobalValue` (`manage.ts`); `Environment` (`environments.ts`). | `src/data/types.ts`, `src/data/manage.ts`, `src/data/environments.ts` |
| Stack conventions | TypeScript strict + ESM; PascalCase types, camelCase values; JSDoc on every type; string ids (`aut_reset_audit`, `run_1043`, `cred_ses`); domain types in `data/types.ts`, seed data in `data/*.ts`, helpers in `lib/*.ts`. | `tsconfig.json`, `src/data/types.ts`, `src/data/automations.ts` |
| Prior analysis | `docs/structure-map.md` already maps A360 reference surfaces onto Conduit entities and settled the entity graph (`Automation`→`Run`→`Issue`). | `docs/structure-map.md` |

**Why the domain is already a head start.** The requested capabilities map almost 1:1 onto
entities that already exist as seed models — the integration layer mostly needs to (a) put an
API in front of them and (b) make an adapter *produce* them from a vendor:

| Capability (brief) | Existing seed model | Evidence |
|---|---|---|
| `bots` | `Automation` | `src/data/types.ts` (`Automation`) |
| `schedules` | `Schedule` | `src/data/manage.ts` (`Schedule`) |
| `devices` | `Environment` / run `target` | `src/data/environments.ts`, `Run.target` in `types.ts` |
| `credentials` | `Credential` (metadata only — good) | `src/data/manage.ts` (`Credential`) |
| `activity` | `Run` + `ActivityEvent[]` timeline | `src/data/types.ts` (`Run`, `ActivityEvent`) |
| `audit` | `Issue` / activity feed | `src/data/types.ts` (`Issue`, `ActivityEvent`) |
| `packages` | `Package` | `src/data/manage.ts` (`Package`) |
| `queues` | *(none — "Not Used" in reference)* | `docs/structure-map.md` §B |

---

## 2. Conflicts with the target architecture

1. **No source-system field on any model.** The canonical model requires `platform` (source
   system) *always present*; today no model has it (`src/data/types.ts`, `src/data/manage.ts`).
   Multi-connector output is indistinguishable. **Must add `platform` + `connectorId` to every
   domain model.**

2. **Global ids will collide across instances.** Ids like `aut_reset_audit` (`automations.ts`)
   are globally unique *within one seed file*. With two A360 Control Rooms the same vendor id can
   appear twice. **Domain `id` must be namespaced by connector instance** (`connectorId` + vendor
   `sourceId`), with the raw vendor id preserved separately.

3. **Frontend reads seed data directly.** The store imports `data/*.ts` and serves arrays
   synchronously (`src/store.tsx:2-8,130-176`); there is no API seam at all. The rule "frontend
   calls our API" has nothing to call. **A client boundary + async loading must be introduced**,
   and the seed data repurposed as the fixture behind a *fake connector* so the UI keeps working.

4. **Static-only deployment.** `deploy.yml` builds to GitHub Pages, which cannot host a server.
   **A backend needs a separate runtime/host and a second pipeline** (the Pages site keeps serving
   the SPA; the API deploys elsewhere).

5. **No secrets boundary.** Credentials exist only as display rows; there is no server side to
   hold real tokens and no secret store. The whole server-only-secrets rule is greenfield.

6. **Naming drift: "Automation" vs "bot".** The app calls a bot an `Automation` throughout the UI
   and store. The brief/canonical model and A360 call it a *bot*. This is a naming reconciliation,
   flagged in §7.

None of these are blockers; they are the work.

---

## 3. Proposed layout, interfaces, domain models, registration

### 3.1 Repository layout (npm workspaces)

Introduce npm workspaces so backend, frontend, and connectors share one TypeScript domain
package. Phase 1 keeps the existing SPA where it is to minimise churn; the target end-state
moves it under `apps/web`.

```
conduit/
  package.json                 # workspaces: ["apps/*", "packages/*", "connectors/*"]
  apps/
    web/                       # existing Vite SPA (moved from ./src; unchanged behaviour)
    api/                       # NEW backend (Fastify + TypeScript)
      src/
        server.ts              # bootstrap: load config, build registry, mount routes
        routes/                # thin controllers per capability + /connectors, /capabilities
        services/              # capability services (dispatch + merge + normalise-guard)
        registry/              # type registry, instance registry, loader/lifecycle
        secrets/               # SecretStore interface + providers
        config/                # config loader (env + instance config source)
  packages/
    domain/                    # canonical domain models + capability enum + DTOs (shared FE/BE)
    connector-sdk/             # Connector interface, capability provider interfaces,
                               # defineConnector(), conformance test kit
  connectors/
    automation-anywhere/       # A360 adapter (first connector)
    azure-devops/  jira/  servicenow/  sql-server/  rest/   # later, each self-contained
```

Conventions preserved from the repo: TS strict + ESM, PascalCase types / camelCase values,
JSDoc on every exported type, string ids, domain types centralised (now in `packages/domain`
instead of `src/data/types.ts`).

### 3.2 Canonical domain models (`packages/domain`)

Every model follows the brief's reference shape — normalised, flat, **`platform` always
present** — plus the two fields the multi-instance and namespacing conflicts (§2) require:

```ts
/** Fields every domain model carries, so nothing is ambiguous about its origin. */
type SourceStamped = {
  id: string;          // our namespaced id: `${connectorId}:${sourceId}`
  sourceId: string;    // raw vendor id, preserved for round-trips
  platform: string;    // connector TYPE, e.g. "automation-anywhere" (canonical model's field)
  connectorId: string; // connector INSTANCE, e.g. "a360-prod-eu" (which Control Room)
};

type Bot = SourceStamped & {
  title: string;                                  // canonical example: "Invoice Bot"
  state: "Running" | "Idle" | "Disabled" | "Unknown";
  owner: string;                                  // canonical example: "Brad"
  // richer optional fields the existing UI already renders (successRate, folder, …)
};

type Schedule   = SourceStamped & { botId: string; cadence: string; nextRun?: string; enabled: boolean };
type Device     = SourceStamped & { name: string; state: "Online"|"Offline"|"Busy"|"Unknown"; region?: string };
type Credential = SourceStamped & { name: string; kind: string; scope: string; lastUsed?: string };
                  //  ^ METADATA ONLY. Never a secret value — enforced by a contract test (§4).
type ActivityEntry = SourceStamped & { botId?: string; state: string; startedAt: string; trigger?: string; log?: LogLine[] };
type AuditEntry = SourceStamped & { actor: string; action: string; target: string; at: string };
type Package    = SourceStamped & { name: string; version: string; publisher?: string };
type QueueItem  = SourceStamped & { name: string; status: string; depth?: number };
```

The canonical example (`{id, title, state, platform, owner}`) is the exact `Bot` reference
shape; every other model mirrors its style. The existing seed models are the fixture the A360
fake/adapter normalises *into* these — they are not exported to the frontend as-is.

### 3.3 Connector contract (`packages/connector-sdk`)

Two layers: a lifecycle interface every connector implements, and one provider interface per
capability that a connector implements **only for the capabilities it declares**.

```ts
enum Capability {
  Bots = "bots", Schedules = "schedules", Devices = "devices", Credentials = "credentials",
  Activity = "activity", Audit = "audit", Packages = "packages", Queues = "queues",
}

/** Every connector implements this. Instance identity + lifecycle + declared capabilities. */
interface Connector {
  readonly id: string;             // instance id, e.g. "a360-prod-eu"
  readonly type: string;           // connector type / platform, e.g. "automation-anywhere"
  readonly capabilities: Capability[];
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sync(): Promise<SyncResult>;     // pull-and-cache; returns counts per capability
  health(): Promise<HealthStatus>; // { ok, latencyMs, checkedAt, detail? }
}

/** Capability providers — a connector implements exactly the ones it declares. */
interface BotProvider        { listBots(): Promise<Bot[]>; getBot(id: string): Promise<Bot> }
interface ScheduleProvider   { listSchedules(): Promise<Schedule[]> }
interface DeviceProvider     { listDevices(): Promise<Device[]> }
interface CredentialProvider { listCredentials(): Promise<Credential[]> }   // metadata only
interface ActivityProvider   { listActivity(query?: ActivityQuery): Promise<ActivityEntry[]> }
interface AuditProvider      { listAudit(query?: AuditQuery): Promise<AuditEntry[]> }
interface PackageProvider    { listPackages(): Promise<Package[]> }
interface QueueProvider      { listQueue(name?: string): Promise<QueueItem[]> }
```

The **capability list drives the UI** (per the intent): the API exposes the union of declared
capabilities across enabled instances, and the frontend enables features from that — never from
`connector.type`.

### 3.4 Capability services (`apps/api/src/services`)

One service per capability, 1:1 with `Capability`. Each service:

1. asks the **instance registry** for enabled connectors declaring its capability,
2. fans out to each provider,
3. merges results, and
4. **guards the boundary** — validates every item against the domain schema and asserts nothing
   vendor-shaped leaks (extra keys rejected in dev; stripped + logged in prod).

```ts
class BotService {
  constructor(private registry: ConnectorRegistry) {}
  async list(filter?: { platform?: string; connectorId?: string }): Promise<Bot[]> {
    const providers = this.registry.enabledWith(Capability.Bots, filter);
    const batches = await Promise.allSettled(providers.map(p => p.listBots()));
    return batches.flatMap(settled).map(assertDomainShape); // failures degrade, not crash
  }
}
```

This is the only place fan-out/merge lives; adding a connector never touches a service (that is
the point of the registry below).

### 3.5 Registration mechanism — data-driven, two registries

The brief's hard constraint: *"Connector registration must be data-driven, not compiled in."*
Two distinct registries satisfy it:

**A. Type registry (what kinds of connector exist).** Each connector package self-describes via
`defineConnector()` and is discovered at boot (workspace glob / manifest), never imported by a
service:

```ts
// connectors/automation-anywhere/index.ts
export default defineConnector({
  type: "automation-anywhere",
  capabilities: [Capability.Bots, Capability.Schedules, Capability.Devices,
                 Capability.Credentials, Capability.Activity, Capability.Audit, Capability.Packages],
  configSchema: A360ConfigSchema,     // non-secret connection config (JSON Schema / Zod)
  secretKeys: ["clientSecret", "apiKey"], // resolved from the SecretStore, never in config
  create: (cfg, secrets) => new A360Connector(cfg, secrets),
});
```

**B. Instance registry (which connectors are configured, and their on/off state).** Instances
live in a **config source** (a DB table for prod, a JSON/YAML file for dev) — pure data:

```jsonc
// one row per configured instance — add/enable/disable/remove = data mutation, no redeploy
{ "instanceId": "a360-prod-eu", "type": "automation-anywhere", "name": "Prod EU Control Room",
  "enabled": true, "config": { "baseUrl": "https://eu.cr.example" }, "secretRef": "a360/prod-eu" }
```

At boot and on change, the **loader** reads instance rows, looks up the factory by `type`,
resolves `secretRef` via the SecretStore, calls `create()`, `connect()`, and registers the live
connector with each capability service. **Runtime CRUD** (`POST/PATCH/DELETE /api/connectors`)
mutates instance rows and calls `connect`/`disconnect` — enabling, disabling, adding, or removing
a connector with no code change and no deploy. Multiple instances of one type are just multiple
rows (the two-Control-Rooms requirement).

### 3.6 Secrets (`apps/api/src/secrets`)

```ts
interface SecretStore { get(ref: string): Promise<Record<string,string>>; }
```

Providers: `EnvSecretStore` (dev, from `.env`), `AzureKeyVaultSecretStore`, `AwsSecretsManagerStore`,
`VaultSecretStore`. Rules enforced by design:

- Instance config holds only a **`secretRef` pointer**, never a secret value.
- Secrets are resolved **at `connect()` time, server-side**, and injected into the connector.
- The domain `Credential` model is **metadata only**; a contract test asserts no secret-shaped
  field is ever serialised (§4). Nothing token-shaped can reach the browser.

### 3.7 Internal API surface (`apps/api/src/routes`)

```
GET    /api/capabilities                 # union of enabled capabilities → drives UI features
GET    /api/bots        ?platform&connectorId
GET    /api/schedules   /api/devices  /api/credentials  /api/activity  /api/audit  /api/packages  /api/queues
GET    /api/connectors                   # instances + health + declared capabilities
POST   /api/connectors                   # register an instance (data-driven)
PATCH  /api/connectors/:id               # enable / disable / reconfigure
DELETE /api/connectors/:id               # remove
POST   /api/connectors/:id/sync
GET    /api/connectors/:id/health
```

Every response is a domain DTO from `packages/domain`. No route returns a vendor payload.

### 3.8 Frontend seam (later phase — no code now)

`src/store.tsx` stops importing `data/*.ts` and instead calls an API client (`apps/web/src/lib/api.ts`)
typed against `packages/domain`. Loading becomes async; capability-gating reads `/api/capabilities`.
The existing seed data (`automations.ts`, `manage.ts`, …) is retargeted as the fixture behind a
`fake`/`conduit-native` connector so the prototype keeps rendering with zero backend dependency
during migration.

---

## 4. Test strategy

**Unit — against fakes (fast, no network).**
- Capability services: dispatch/merge/degradation using in-memory fake connectors that declare
  chosen capabilities (e.g. two fakes both declaring `bots` → merged, namespaced, deduped).
- Registry + loader: type discovery, instance enable/disable/remove, multi-instance of one type,
  secret resolution via a fake `SecretStore`.
- Normalisers: vendor fixture → domain model, asserting `platform`/`connectorId` stamped and ids
  namespaced.

**Contract — one conformance suite every connector must pass (`connector-sdk` test kit).**
A single parameterised suite run per connector package:
- lifecycle: `connect`/`disconnect`/`sync`/`health` behave and are idempotent;
- for each **declared** capability, the provider exists and returns items validating against the
  domain schema; for each **undeclared** capability, the provider is absent;
- **no vendor-shaped leakage**: every item has exactly the domain keys, `platform === type`;
- **secret safety**: no `Credential` (or any DTO) carries a secret-shaped field.
Run against recorded vendor fixtures (nock/msw) in CI, and optionally against a live sandbox
(gated, out of the default run).

**Integration — API → service → connector → DTO.**
- End-to-end route tests with connectors backed by mocked vendor HTTP; assert aggregation across
  two instances, runtime enable/disable changes `/api/capabilities`, and health surfaces failures.
- A dedicated **security integration test**: no response body from any route contains a token /
  secret / password field.

**Frontend.**
- Type-level test that the API client matches `packages/domain` DTOs (compile-time contract).
- Store loads from the API client (fake server) and renders; capability-gated features hide when
  the capability is absent.

---

## 5. Phased delivery (suggested)

1. **Scaffold** workspaces, `packages/domain`, `packages/connector-sdk`, `apps/api` (Fastify),
   `/api/capabilities` + `/api/bots` backed by a **fake connector over existing seed data**.
2. **Registry + secrets**: type/instance registries, loader, `SecretStore` (env provider),
   runtime connector CRUD.
3. **A360 connector**: real adapter for `bots`+`activity` first, passing the conformance kit.
4. **Frontend seam**: `store.tsx` → API client; capability-driven UI gating; seed data becomes the
   fake connector's fixture.
5. **Breadth**: remaining A360 capabilities, then Azure DevOps / Jira / ServiceNow / SQL / REST.
6. **Deploy**: separate API host + pipeline; Pages SPA points at it via build-time base URL.

---

## 6. Open decisions (repo did not settle these) — recommendations in §7

Consolidated list at the end of the reply; each has a recommended default and reason.

---

## 7. Decisions needing your input (recommended defaults)

| # | Decision | Recommended default | Reason |
|---|---|---|---|
| 1 | **Backend stack** (`{{BACKEND}}` was unresolved — no backend exists) | **Node.js + TypeScript, Fastify** | One language across FE/BE lets `packages/domain` types be shared verbatim; matches strict-ESM-TS repo conventions; Fastify is TS-first, light, with a plugin model that fits the registry. Alternatives: Hono (edge), NestJS (heavier DI). |
| 2 | **Secrets store** (`{{SECRETS_STORE}}` unresolved) | **`SecretStore` interface; env provider for dev, Azure Key Vault default for prod** | Azure DevOps is already a target vendor, so Key Vault is likely in the org; the interface keeps AWS/Vault swappable. |
| 3 | **Instance config source** | **JSON file in dev, Postgres table in prod** | Data-driven registration needs a store; Postgres is the conventional choice and supports runtime CRUD; file keeps dev zero-infra. |
| 4 | **"Automation" vs "Bot" naming** | **Domain/API type = `Bot`; keep the UI label "Automation"** | Canonical model + A360 say *bot*; the existing UI copy is heavy and user-facing. Align the contract, leave the prototype's wording. |
| 5 | **`queues` capability** | **Include it as a capability with no seed data** | Brief lists `QueueService` but not `queues` in the capability list, and A360 marks Queues "Not Used"; define the seam now, leave it empty until a connector needs it. |
| 6 | **Monorepo migration timing** | **Add `apps/api` + `packages/*` now; move SPA to `apps/web` in phase 4** | Standing up the API shouldn't block on relocating the working SPA and its Pages pipeline. |
| 7 | **Data freshness model** (`sync` pull-cache vs live pass-through) | **Cache-on-`sync` with live fallback per capability** | Vendor APIs are rate-limited and slow; a cache makes aggregation across instances viable. Revisit per capability. |
| 8 | **Write operations** (run a bot, disable a schedule) | **Read-only in v1; add capability-scoped writes later** | The brief specifies read/normalise flows (`connect/disconnect/sync/health` + list); writes are a separate contract surface. |
