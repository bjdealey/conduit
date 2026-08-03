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
the brief therefore resolve to *"none yet"* — choosing them was decision #1 in §7.

> **Decided (2026-07): the backend is Supabase.** This settles the secrets store (Supabase
> **Vault**) and the config source (a Postgres table). The backend runtime is **Supabase
> Edge Functions** (Deno + TypeScript); **PostgREST** over normalised domain tables is the
> frontend read API; **`pg_cron`** drives scheduled syncs; **Supabase Auth** can replace the
> prototype's fake sign-in and back the existing `admin/developer/user` role gating via RLS.
> The sections below reflect this choice. See §7 for the one sub-decision it introduces
> (connectors in Edge Functions vs. a dedicated worker).

| Concern the brief asks about | What is actually in the repo | Evidence |
|---|---|---|
| HTTP client setup | **None.** No `fetch`, `axios`, `XMLHttpRequest`, or env-var read anywhere in `src`. | `grep` over `src` returns nothing |
| Config / secrets handling | **None.** `.env`/`.env.*` are git-ignored but unused; no config loader; secrets appear only as *mock UI rows* (`Credential`, and `GlobalValue.secret`). | `.gitignore:11-13`, `src/data/manage.ts` (`Credential`, `GlobalValue`) |
| DI / registration | **None** in the backend sense. The only "registry" is the React context store that hands seed arrays to components. | `src/store.tsx:130-176` |
| Existing API controllers | **None.** No server, no routes. Deploy target is **GitHub Pages** (static only). | `.github/workflows/deploy.yml` |
| Frontend data calls | Components call `useStore()`; the store imports seed arrays from `src/data/*.ts` and serves them synchronously. No network boundary exists. | `src/store.tsx:2-8,130-176`; consumers via `useStore()` |
| Domain models (already present) | `Automation`, `Run`, `Folder`, `Issue`, `Member` (`types.ts`); `Schedule`, `EventTrigger`, `Credential`, `Package`, `GlobalValue` (`manage.ts`); `Environment` (`environments.ts`). | `src/data/types.ts`, `src/data/manage.ts`, `src/data/environments.ts` |
| Stack conventions | TypeScript strict + ESM; PascalCase types, camelCase values; JSDoc on every type; string ids (`wf_reset_audit`, `run_1043`, `cred_ses`); domain types in `data/types.ts`, seed data in `data/*.ts`, helpers in `lib/*.ts`. | `tsconfig.json`, `src/data/types.ts`, `src/data/automations.ts` |
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

2. **Global ids will collide across instances.** Ids like `wf_reset_audit` (`automations.ts`)
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

Introduce npm workspaces so frontend, connectors, and shared code share one TypeScript domain
package, plus a `supabase/` project directory for the backend. Deno Edge Functions consume the
shared packages via `npm:`/import-map specifiers. Phase 1 keeps the existing SPA where it is to
minimise churn; the target end-state moves it under `apps/web`.

```
conduit/
  package.json                 # workspaces: ["apps/*", "packages/*", "connectors/*"]
  supabase/
    config.toml
    migrations/                # domain cache tables, connector_instances, RLS, pg_cron, Vault
    functions/                 # Edge Functions (Deno + TypeScript) — the API + orchestration
      _shared/                 # registry loader, capability services, SecretStore, normalise-guard
      bots/  schedules/ …      # (optional) per-capability read functions if not served by PostgREST
      connectors/              # instance CRUD + enable/disable + health + sync trigger
      sync/                    # pull → normalise → upsert into domain tables (pg_cron + on-demand)
      capabilities/            # union of declared capabilities across enabled instances
  apps/
    web/                       # existing Vite SPA (moved from ./src; unchanged behaviour)
  packages/
    domain/                    # canonical domain models + capability enum + DTOs (shared FE/Edge)
    connector-sdk/             # Connector interface, capability provider interfaces,
                               # defineConnector(), conformance test kit
  connectors/
    automation-anywhere/       # A360 adapter (first connector)
    azure-devops/  jira/  servicenow/  sql-server/  rest/   # later, each self-contained
```

Conventions preserved from the repo: TS strict + ESM, PascalCase types / camelCase values,
JSDoc on every exported type, string ids, domain types centralised (now in `packages/domain`
instead of `src/data/types.ts`). Postgres tables/columns use `snake_case`; the PostgREST layer
or a thin mapper renders them as the `camelCase` domain DTOs the frontend consumes.

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
live in a **Supabase Postgres table** `connector_instances`, guarded by RLS (admins read/write;
Edge Functions use the service role) — pure data:

```sql
-- one row per configured instance — add/enable/disable/remove = a row mutation, no redeploy
create table connector_instances (
  id          text primary key,        -- instance id, e.g. 'a360-prod-eu'
  type        text not null,           -- connector type / platform
  name        text not null,           -- 'Prod EU Control Room'
  enabled     boolean not null default true,
  config      jsonb not null default '{}',  -- non-secret connection config
  secret_ref  text,                    -- pointer into Supabase Vault (never a secret value)
  created_at  timestamptz not null default now()
);
```

Per invocation (Edge Functions are stateless), the **loader** reads enabled instance rows, looks
up the factory by `type` from the code-side type registry, resolves `secret_ref` via the
SecretStore (Vault), calls `create()` and `connect()`, and hands the live connector to the
capability services. **Runtime CRUD** (the `connectors` Edge Function → `connector_instances`
mutations) enables, disables, adds, or removes a connector with no code change and no deploy.
Multiple instances of one type are just multiple rows (the two-Control-Rooms requirement). Because
Edge Functions don't persist memory, `connect()/disconnect()` are per-invocation setup/teardown and
the **domain cache tables are the durable registry state**, not an in-process object.

### 3.6 Secrets (`apps/api/src/secrets`)

```ts
interface SecretStore { get(ref: string): Promise<Record<string,string>>; }
```

Default provider: **`SupabaseVaultSecretStore`** — secrets are stored with `vault.create_secret()`
and read from `vault.decrypted_secrets` **only inside Edge Functions using the service-role key**;
the `anon` role and PostgREST never see them. `EnvSecretStore` (from `.env`) remains for local dev;
the interface keeps AWS Secrets Manager / HashiCorp Vault swappable. Rules enforced by design:

- Instance config (`connector_instances.config`) holds only a **`secret_ref` pointer**, never a
  secret value.
- Secrets are resolved **at `connect()` time, server-side in the Edge Function**, and injected
  into the connector.
- The domain `Credential` model is **metadata only**; a contract test asserts no secret-shaped
  field is ever serialised (§4). RLS + the service-role boundary mean nothing token-shaped can
  reach the browser.

### 3.7 Internal API surface

Two layers, both under the Supabase project URL — the frontend calls **our** API, never a vendor.

**Reads → PostgREST** over the normalised domain cache tables (RLS: `authenticated` read-only).
This gives the domain-model read API — and realtime subscriptions — for free:

```
GET  /rest/v1/bots?platform=eq.automation-anywhere&connector_id=eq.a360-prod-eu
GET  /rest/v1/{schedules,devices,credentials,activity,audit,packages,queues}
```

**Orchestration & writes → Edge Functions** (service role, admin-gated):

```
GET    /functions/v1/capabilities        # union of enabled capabilities → drives UI features
GET    /functions/v1/connectors          # instances + health + declared capabilities
POST   /functions/v1/connectors          # register an instance (row insert)
PATCH  /functions/v1/connectors/:id      # enable / disable / reconfigure
DELETE /functions/v1/connectors/:id      # remove
POST   /functions/v1/connectors/:id/sync
GET    /functions/v1/connectors/:id/health
```

Every response is a domain DTO from `packages/domain` (PostgREST rows mapped to `camelCase`). No
route returns a vendor payload. Reads may alternatively be served by thin per-capability Edge
Functions if row-level PostgREST proves too coarse — see §7 decision 3b.

### 3.8 Frontend seam (later phase — no code now)

`src/store.tsx` stops importing `data/*.ts` and instead uses `supabase-js` (`apps/web/src/lib/api.ts`),
typed against `packages/domain`: PostgREST/realtime for reads, Edge Function calls for connector
admin, and Supabase Auth for sign-in (replacing the fake `signIn` in `src/store.tsx:213`). Loading
becomes async; capability-gating reads `/functions/v1/capabilities`. The existing seed data
(`automations.ts`, `manage.ts`, …) is retargeted as the fixture behind a `fake`/`conduit-native`
connector so the prototype keeps rendering with zero vendor dependency during migration.

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

1. **Scaffold** workspaces + `supabase/` project, `packages/domain`, `packages/connector-sdk`,
   the domain cache tables + `connector_instances` migration, and a `capabilities` + `sync` Edge
   Function backed by a **fake connector over existing seed data**; PostgREST reads on `bots`.
2. **Registry + secrets**: code-side type registry, instance loader, `SupabaseVaultSecretStore`,
   the `connectors` Edge Function for runtime CRUD, `pg_cron`-scheduled `sync`.
3. **A360 connector**: real adapter for `bots`+`activity` first, passing the conformance kit.
4. **Frontend seam**: `store.tsx` → `supabase-js`; Supabase Auth; capability-driven UI gating;
   seed data becomes the fake connector's fixture.
5. **Breadth**: remaining A360 capabilities, then Azure DevOps / Jira / ServiceNow / SQL / REST.
6. **Deploy**: Supabase project (hosted or self-hosted) for the API/DB; the Pages SPA points at
   the Supabase URL via a build-time env var. If a connector's `sync` outgrows Edge Function
   limits, graduate it to a dedicated worker (§7 decision 1b) without changing the contract.

---

## 6. Open decisions (repo did not settle these) — recommendations in §7

Consolidated list at the end of the reply; each has a recommended default and reason.

---

## 7. Decisions needing your input (recommended defaults)

**Settled by your Supabase choice:** ~~#1 backend stack~~ → Supabase Edge Functions (Deno/TS).
~~#2 secrets store~~ → Supabase Vault. ~~#3 config source~~ → Postgres `connector_instances`.
The remaining and newly-surfaced decisions:

| # | Decision | Recommended default | Reason |
|---|---|---|---|
| 1b | **Where connectors run** (new, from Supabase) | **Inside Edge Functions for v1; graduate a connector to a dedicated Node worker only if its `sync` outgrows the limits** | All-in on Supabase is the lowest-ops path and satisfies every rule; Edge Functions' ~150s wall + stateless model only bite on large/long syncs, which chunk via `pg_cron` until a worker is justified. |
| 3b | **Read API: PostgREST vs Edge Functions** (new) | **PostgREST over domain cache tables, with RLS** | Gives the domain-model read API + realtime for free and keeps reads off the Edge Function budget; swap a capability to a thin function only if row-level access proves too coarse. |
| 4 | **"Automation" vs "Bot" naming** | **Domain/API type = `Bot`; keep the UI label "Automation"** | Canonical model + A360 say *bot*; the existing UI copy is heavy and user-facing. Align the contract, leave the prototype's wording. |
| 5 | **`queues` capability** | **Include it as a capability with no seed data** | Brief lists `QueueService` but not `queues` in the capability list, and A360 marks Queues "Not Used"; define the seam now, leave it empty until a connector needs it. |
| 6 | **Monorepo migration timing** | **Add `supabase/` + `packages/*` now; move SPA to `apps/web` in phase 4** | Standing up the backend shouldn't block on relocating the working SPA and its Pages pipeline. |
| 7 | **Data freshness model** (`sync` pull-cache vs live pass-through) | **Cache-on-`sync` into Postgres with live fallback per capability** | Vendor APIs are rate-limited and slow; the domain cache tables make aggregation across instances viable and fit the stateless Edge Function model. Revisit per capability. |
| 8 | **Write operations** (run a bot, disable a schedule) | **Read-only in v1; add capability-scoped writes later** | The brief specifies read/normalise flows (`connect/disconnect/sync/health` + list); writes are a separate contract surface. |
| 9 | **Auth** (new — Supabase includes it) | **Adopt Supabase Auth; map `admin/developer/user` to JWT claims + RLS, replacing the fake local sign-in** | The app already has the role enum (`src/store.tsx`); Supabase Auth turns the prototype gate into a real one and secures the connector-admin surface. |
