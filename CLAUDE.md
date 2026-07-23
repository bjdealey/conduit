# CLAUDE.md — Conduit

Guidance for AI sessions working in this repo. Read this before proposing or writing code for
the integration layer. The full plan lives in `docs/integration-layer-plan.md`; the pre-existing
A360 mapping in `docs/structure-map.md`.

## What this repo is today

A frontend-only interactive prototype: **React 18 + TypeScript (strict, ESM) + Vite**, deployed
as a static site to GitHub Pages (`.github/workflows/deploy.yml`). All data is **in-memory seed
data** in `src/data/*.ts`, served synchronously through a React context store (`src/store.tsx`).
There is **no backend, no HTTP client, no secrets handling, and no DI** yet — the integration
layer introduces all of them.

**Backend = Supabase** (decided). Runtime: **Edge Functions** (Deno + TypeScript). Read API:
**PostgREST** over normalised domain tables with RLS. Secrets: **Supabase Vault**. Config/registry:
Postgres tables. Scheduling: **`pg_cron`**. Auth: **Supabase Auth** (maps to the existing
`admin/developer/user` roles). Connectors run inside Edge Functions in v1; graduate to a dedicated
worker only if a `sync` outgrows the ~150s/stateless limits. Shared TS (`packages/*`) is consumed
from Deno via `npm:`/import-map specifiers.

## Architecture intent (the target)

```
Frontend ──▶ Internal API ──▶ Capability services ──▶ Connector adapters ──▶ Vendor APIs
```

- **The frontend never calls a vendor API.** It calls our API, which returns our domain models.
- Vendor systems are **pluggable connectors** — added, enabled, disabled, or removed **at runtime,
  with no frontend change**. First connector: Automation Anywhere A360. Then Azure DevOps, Jira,
  ServiceNow, SQL Server, custom REST.
- **Capabilities, not vendor identity, drive the UI.** Each connector declares which capabilities
  it supports; the UI enables features from the declared-capability union, never from the
  connector's type.
- **Nothing vendor-shaped escapes the adapter.** Vendor payloads are normalised into domain models
  at the adapter boundary and validated by the capability service.

## Connector contract

Every connector implements a lifecycle interface; it implements one capability-provider interface
**per capability it declares** (and only those).

```ts
interface Connector {
  readonly id: string;             // instance id, e.g. "a360-prod-eu"
  readonly type: string;           // connector type / platform, e.g. "automation-anywhere"
  readonly capabilities: Capability[];
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sync(): Promise<SyncResult>;
  health(): Promise<HealthStatus>;
}
```

Providers: `BotProvider`, `ScheduleProvider`, `DeviceProvider`, `CredentialProvider`,
`ActivityProvider`, `AuditProvider`, `PackageProvider`, `QueueProvider`.

## Capabilities

`bots · schedules · devices · credentials · activity · audit · packages · queues`

One capability ↔ one capability service (`BotService`, `ScheduleService`, `DeviceService`,
`CredentialService`, `ActivityService`, `AuditService`, `PackageService`, `QueueService`). A
service asks the registry for enabled connectors declaring its capability, fans out, merges,
and guards the domain boundary. Adding a connector must never require editing a service.

## Domain models

Follow the canonical shape — normalised, flat, **source system always present**:

```json
{ "id": "123", "title": "Invoice Bot", "state": "Running", "platform": "automation-anywhere", "owner": "Brad" }
```

Every domain model additionally carries `sourceId` (raw vendor id), `platform` (connector type),
and `connectorId` (connector instance); `id` is namespaced as `${connectorId}:${sourceId}` so
two instances of the same connector type (e.g. two A360 Control Rooms) never collide. Domain
models live in `packages/domain` and are shared by frontend and backend. Vendor DTOs never leave
the adapter.

## Registration — data-driven, not compiled in

- **Type registry**: each connector package self-registers via `defineConnector({ type,
  capabilities, configSchema, secretKeys, create })`, discovered at boot. Services never import a
  connector class.
- **Instance registry**: configured instances live in the Postgres table `connector_instances`
  (RLS-guarded) — one row per instance `{ id, type, name, enabled, config, secret_ref }`. The
  `connectors` Edge Function mutates rows; the loader rebuilds live connectors per invocation
  (Edge Functions are stateless — the domain cache tables hold durable state, not memory). Multiple
  instances of one type = multiple rows. No redeploy to add/enable/disable/remove a connector.

## Security rules (non-negotiable)

- **Credentials live only in Supabase Vault and are used only server-side.** Access tokens and
  client secrets reaching the browser is an unacceptable exposure.
- Instance config (`connector_instances.config`) holds a **`secret_ref` pointer only**, never a
  secret value.
- Secrets resolve via the `SecretStore` interface (default `SupabaseVaultSecretStore`, read from
  `vault.decrypted_secrets` with the service-role key) **at `connect()` time, inside the Edge
  Function**, and are injected into the connector. The `anon` role and PostgREST never see them.
- The domain `Credential` model is **metadata only** (name, kind, scope, lastUsed). A contract test
  asserts no secret-shaped field is ever serialised. No API response body may contain a
  token/secret/password field.

## Naming & conventions (match the existing repo)

- TypeScript strict, ESM, `.ts`/`.tsx`. PascalCase types, camelCase values.
- **JSDoc on every exported type** (see `src/data/types.ts` for the house style).
- Domain types centralised (today `src/data/types.ts`; target `packages/domain`); seed data in
  `src/data/*.ts`; helpers in `src/lib/*.ts`.
- String ids with a type prefix: `aut_`, `run_`, `cred_`, `pkg_`, `sch_`, `evt_`.
- Capability ids and connector `type`/`platform` values are **lowercase-kebab** (`automation-anywhere`).
- Postgres tables/columns are `snake_case`; the read layer maps them to the `camelCase` domain DTOs.
- UI keeps the label "Automation"; the domain/API type is `Bot` (see plan §7, decision 4).

## Guardrails for sessions

- Match existing structure and naming — read it from the repo, don't assume.
- Do not add a network call from the frontend to any vendor. Frontend → our API only.
- Do not put a secret in a domain model, a config row, a log line, or an API response.
- New connectors self-register; never wire a connector into a capability service by hand.
- When the repo doesn't settle a decision, pick the recommended default in
  `docs/integration-layer-plan.md` §7 and note it — don't silently invent a new one.

## Implemented so far — stage 1: core abstraction

Stack-agnostic TypeScript, no Supabase/vendor/frontend code yet. Tested with **Vitest**
(`npm test`); the packages typecheck with `npm run typecheck:packages`.

**Layout**
- `packages/domain` — `Capability` enum, `SourceStamped`/`Bot` models, `MappingError` +
  `MapContext`, and the mapping primitives `asRecord` / `requireString` / `requireEnum` / `stampId`.
- `packages/connector-sdk` — `Connector` + `BotProvider` interfaces and `isBotProvider` guard,
  `ConnectorRegistry` + `defineConnector`, the `ServiceResult`/`ConnectorError`/`Logger` seam,
  and `BotService`. `packages/connector-sdk/src/testing` holds `FakeConnector` (**tests only**).

**Contract details that concretized (authoritative for later stages)**
- **Capability providers return domain models, not vendor payloads.** `BotProvider.listBots()`
  returns `Bot[]`; mapping happens *inside* the adapter, at its boundary.
- **Mapping fails loudly.** A normaliser returns a complete valid model or throws `MappingError`
  (carrying `connectorId`/`platform`/`capability`/`field`/`received`). Never a partial model.
- **Services never throw for connector failure.** A capability service returns
  `ServiceResult<T> = { items: T[]; errors: ConnectorError[] }`. `ConnectorError.kind` is one of
  `health` | `mapping` | `unavailable`, and every error is also passed to the injected `Logger`.
- **Services health-gate per call.** Each connector's `health()` is checked before its provider
  is called; an unhealthy or throwing probe yields a `health` error entry and the connector is
  skipped — healthy connectors still return their items.
- **Registry API (data-driven):** `defineType(factory)` + `add(config)` build instances from plain
  config; `register(connector)` is the low-level path (tests/custom). Lifecycle: `enable(id)` /
  `disable(id)` / `remove(id)` / `health(id)`; `enabledWith(capability)` is the set a service
  dispatches to. Enable/disable take effect on the next call — no restart.
- **Connectors are stateless-friendly.** The registry does not auto-run `connect()`/`disconnect()`;
  those stay per-invocation (the Supabase Edge Function model). `connect()` is where a real
  connector will resolve its secret via the `SecretStore`.

**Not yet built after stage 1** (do not assume these exist): any real connector, `SecretStore`, the
other seven capability services, Supabase wiring, and any frontend change.

## Implemented so far — stage 2: A360 connector + SecretStore

The `SecretStore` seam and the first real connector (**Automation Anywhere A360**), wired to the
stage-1 interfaces. Still no Supabase/vendor-network/frontend code (tests use fakes).

**Layout**
- `packages/connector-sdk` gained `SecretStore` (interface + `InMemorySecretStore` for dev/tests +
  `SupabaseVaultSecretStore` over an injected `VaultClient` — no Supabase dep) and
  `queryCapability()` (structured supported/unsupported, never throws).
- `connectors/automation-anywhere` — the A360 connector: `config` (non-secret, holds `secretRef`),
  `http` (injectable `HttpTransport`, default `fetch`), `endpoints` (paths, TODO-flagged),
  `session` (token acquire/refresh/expiry), `map` (status normalisation + `mapA360Bot`),
  `connector` (`A360Connector`), and `a360ConnectorFactory(secrets, deps?)`.

**Contract details that concretized (authoritative for later stages)**
- **Declare only implemented capabilities.** A360 declares `[bots]` only; asking for anything else
  returns `queryCapability(...).supported === false`, never an exception.
- **Secrets are write-only through the store.** `SecretStore.get()` is server-side only;
  `describe()` is the read path and returns `{ ref, present, keys, updatedAt }` — field names, never
  values. Instance `config` holds a `secretRef` pointer only.
- **No secret is serialisable.** Credentials live in the session behind ECMAScript `#private`
  fields (non-enumerable, never `JSON.stringify`-ed); `A360Connector.toJSON()` additionally
  allow-lists only `{ id, type, capabilities, controlRoomUrl, secretRef }`. A test asserts no
  secret value appears on any public surface.
- **Per-instance credential scoping.** A connector only ever resolves its own `config.secretRef`;
  two Control Rooms cannot read each other's credentials, and their bots stay attributed by
  `connectorId` (ids namespaced `${connectorId}:${sourceId}`).
- **Token lifecycle.** `A360Session` caches a token with an expiry taken from the JWT `exp`
  (fallback TTL configurable), refreshes on expiry with no user re-entry (API-key re-auth or OAuth
  refresh grant). A **refresh failure surfaces as an unhealthy `health()`**, so `BotService`'s
  health-gate skips the connector rather than crashing the listing path.
- **Status normalisation.** `normalizeStatus()` folds A360 status tokens onto `BotState`; anything
  unrecognised or absent maps to `Unknown` (an explicit state, not a silent partial).
- **Testing seams.** Inject `HttpTransport` and a `now()` clock to test refresh/expiry without a
  live Control Room. Only the fake transport carries vendor-shaped payloads.

**Open TODO(a360) / TODO(supabase) flags** (endpoints/shapes not verified against a live Control
Room; do not treat as confirmed): OAuth refresh endpoint+params; bot-list endpoint + filter schema
+ list envelope; the auth header (`X-Authorization` vs `Bearer`); the per-bot status source field;
bot `name`/`createdBy` field names; token TTL fallback; and the production Supabase `VaultClient`.
See the connector source and the stage-2 report for the exact questions.

## Implemented so far — stage 3: Supabase wiring (all-in)

The Supabase backend for the `bots` data plane: schema + RLS, Vault-backed secrets, and Deno
Edge Functions consuming the workspace TS. Deploy is scaffold + runbook (`supabase/README.md`) —
you run `supabase db push` / `functions deploy` with your own credentials; **no secret is in the
repo or this session.**

**IMPORTANT convention change: relative imports in `packages/*` and `connectors/*` now carry
explicit `.ts` extensions** (e.g. `from "./connector.ts"`). Deno requires them; Vite/Vitest/tsc
(bundler + `allowImportingTsExtensions`) accept them. New shared-source files must follow suit.
Bare `@conduit/*` specifiers stay extensionless (resolved by the Vitest alias, tsc paths, and the
Deno import map). App code under `src/` is unchanged.

**Layout**
- `supabase/migrations` — `connector_instances` (+RLS, `updated_at`), `bots` cache (+RLS:
  authenticated read), Vault + service-role-only RPCs (`app_vault_read/write/metadata/delete`),
  and `pg_cron` → `sync` every 15 min (URL+token read from Vault).
- `supabase/functions` — Deno Edge Functions: `connectors` (admin CRUD + write-only credential
  path), `sync` (pull→normalise→upsert bots), `capabilities` (declared-capability union), `health`.
  `_shared` holds the service client, `SupabaseVaultClient`, the registry loader, and the auth guard.
  `import_map.json` maps `@conduit/*` → workspace TS and `@supabase/supabase-js` → `npm:`.

**Contract details that concretized**
- **Reads via PostgREST, writes/orchestration via Edge Functions.** The frontend will read
  `bots` (RLS: `authenticated`) directly; connector admin + sync go through functions (service role).
- **Secrets never leave the server.** Vault access is wrapped in `SECURITY DEFINER` RPCs granted to
  `service_role` only; `anon`/`authenticated`/PostgREST cannot read `vault.decrypted_secrets`. The
  `connectors` GET returns secret presence + field names (`describe()`), never values.
- **Registry is rebuilt per invocation** from `connector_instances`; `secret_ref` is merged into
  config as `secretRef`. A malformed row is recorded as `invalid`, never fails the whole build.
- **`SupabaseVaultSecretStore` is unit-tested** in Node against a fake `VaultClient` matching the
  RPC contract (round-trip + describe-hides-values).

**Verification boundary / open flags.** The Deno functions and SQL are **not** executed in this
sandbox (Deno egress is policy-blocked; no Postgres-with-Vault here) — validate with
`deno check` + `supabase db push` on deploy. New `TODO(supabase)`: `pg_net`/URL shape for cron;
admin role-claim source (`_shared/auth.ts`); stale-bot pruning in `sync`; and confirm the deploy
bundler includes the workspace TS the import map points to (verify on first `functions deploy`).

## Implemented so far — stage 4: frontend seam

The React app now reads through **our API** (never a vendor), with a seed fallback so the static
prototype still runs with no backend. Verified in a real browser (Chromium): the app mounts with
no errors, the capability-gated nav renders, and the Integrations page shows live domain models.

**Layout**
- The app can import the shared domain types: `@conduit/domain` is aliased in `vite.config.ts`
  and `tsconfig.json` (paths). `src/` code stays extensionless; the alias resolves to the package.
- `src/lib/supabase.ts` — optional `supabase-js` client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  (anon only; unset → seed mode). `src/lib/api.ts` — `getBots()` / `getCapabilities()` calling our
  Edge Functions, with defensive `coerceBot`/`coerceBots`/`coerceCapabilities` at the boundary.
- `src/data/toDomain.ts` — `seedBots()` maps the rich seed `Automation`s to canonical `Bot`s, so
  there is one domain code path with or without a backend.
- `src/store.tsx` gained `bots`, `capabilities`, `hasCapability(c)`, `dataSource`, `integrationError`;
  a mount effect loads live data when Supabase is configured, else keeps the seed fallback.
- Nav is capability-gated: `NavItemDef.capability` + a Sidebar filter (Automations → `bots`). Seed
  mode enables all capabilities, so the default prototype is unchanged.
- `supabase/functions/bots` — a service-role GET returning domain bots, so the frontend reads work
  with the anon key before Supabase Auth is wired (once it is, switch to a direct PostgREST read).
- Settings → **Integrations** renders the capabilities union + the live `bots` (title/state/platform/
  owner) — the first surface that actually consumes our-API domain models.

**Contract details that concretized**
- **The frontend calls our API, never a vendor.** Reads go through `supabase.functions.invoke`
  (`bots`, `capabilities`); responses are coerced to domain types (malformed rows dropped — the
  loud-failure guarantee lives server-side at the adapter).
- **Only the anon URL + key reach the browser** (`VITE_`-prefixed). No service-role key or secret is
  ever in a `VITE_` var. `.env.example` documents this; real `.env` is git-ignored.
- **Capabilities drive the UI.** The nav enables features from the declared-capability union, never
  from a connector's type.
- **New app dependency:** `@supabase/supabase-js` (the client for our API). Tests use Vitest; app
  tests live in `src/**/*.test.ts` (boundary coercion + seed→domain mapping).
