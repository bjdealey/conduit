# CLAUDE.md — Conduit

Guidance for AI sessions working in this repo. Read this before proposing or writing code for
the integration layer. The full plan lives in `docs/integration-layer-plan.md`; the pre-existing
A360 mapping in `docs/structure-map.md`; the vision gap analysis in `docs/vision-alignment.md`.

## Product framing (settled — read this first)

**Conduit is the control plane that replaces the Automation Anywhere Control Room.** It is not the
execution runtime. Three artefacts, clean boundaries:

| Plane | Owns | Lives |
|---|---|---|
| **Control plane — Conduit** | Authoring, the library, scheduling, **distribution**, the runner pool, credentials, node types, activity, audit, governance | This repo |
| **Execution plane — runners** | Executing a workflow and reporting events. Stateless, ephemeral, cross-platform | Separate artefact |
| **Migration bridge — connectors** | Normalising other platforms (A360 first) into our domain so both estates render through one UI | `packages/connector-sdk`, `connectors/*` |

**Conduit replaces the Control Room by first wrapping it.** The A360 connector makes Conduit a
mirror of the incumbent estate; native workloads land in the same library, distinguished only by
`Workflow.platform`. Migration is one attribute on one row, reversible, no cutover.

**Parity where the Control Room is right; deliberate inversion where it is wrong.** Three inversions
carry the product, and none of them may be quietly un-done:

1. **No assignment.** Workflows declare `requirements`; `pickRunner` places them. Never add a UI
   that pins a workflow to a named machine — not on a schedule, not on a runner, not anywhere.
2. **No drift.** Runners are ephemeral and carry only an `image`. There is no agent-version or
   patch surface to build, by construction.
3. **Three tiers, not one.** Consumers trigger, citizen builders submit, professionals review and
   promote. `packages/domain/src/review.ts` holds the permission table and the transition rules;
   gates read `allowed(permission)`, never `role === "…"`.

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

Providers: `WorkflowProvider`, `ScheduleProvider`, `DeviceProvider`, `CredentialProvider`,
`ActivityProvider`, `AuditProvider`, `PackageProvider`, `QueueProvider`.

## Capabilities

`workflows · schedules · devices · credentials · activity · audit · packages · queues`

One capability ↔ one capability service (`WorkflowService`, `ScheduleService`, `DeviceService`,
`CredentialService`, `ActivityService`, `AuditService`, `PackageService`, `QueueService`). A
service asks the registry for enabled connectors declaring its capability, fans out, merges,
and guards the domain boundary. Adding a connector must never require editing a service.

## Domain models

Follow the canonical shape — normalised, flat, **source system always present**:

```json
{ "id": "123", "title": "Invoice Workflow", "state": "Running", "platform": "automation-anywhere", "owner": "Brad" }
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
- String ids with a type prefix: `wf_`, `run_`, `cred_`, `pkg_`, `sch_`, `evt_`.
- Capability ids and connector `type`/`platform` values are **lowercase-kebab** (`automation-anywhere`).
- Postgres tables/columns are `snake_case`; the read layer maps them to the `camelCase` domain DTOs.
- **One word for the central object: workflow.** UI label, domain type, capability id, cache
  table and Edge Function are all `workflow(s)`. `bot` was the incumbent Control Room's word for
  the thing Conduit replaces; it survives only inside the A360 adapter, describing *their* payloads.

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
- `packages/domain` — `Capability` enum, `SourceStamped`/`Workflow` models, `MappingError` +
  `MapContext`, and the mapping primitives `asRecord` / `requireString` / `requireEnum` / `stampId`.
- `packages/connector-sdk` — `Connector` + `WorkflowProvider` interfaces and `isWorkflowProvider` guard,
  `ConnectorRegistry` + `defineConnector`, the `ServiceResult`/`ConnectorError`/`Logger` seam,
  and `WorkflowService`. `packages/connector-sdk/src/testing` holds `FakeConnector` (**tests only**).

**Contract details that concretized (authoritative for later stages)**
- **Capability providers return domain models, not vendor payloads.** `WorkflowProvider.listWorkflows()`
  returns `Workflow[]`; mapping happens *inside* the adapter, at its boundary.
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
  `session` (token acquire/refresh/expiry), `map` (status normalisation + `mapA360Workflow`),
  `connector` (`A360Connector`), and `a360ConnectorFactory(secrets, deps?)`.

**Contract details that concretized (authoritative for later stages)**
- **Declare only implemented capabilities.** A360 declares `[workflows]` only; asking for anything else
  returns `queryCapability(...).supported === false`, never an exception.
- **Secrets are write-only through the store.** `SecretStore.get()` is server-side only;
  `describe()` is the read path and returns `{ ref, present, keys, updatedAt }` — field names, never
  values. Instance `config` holds a `secretRef` pointer only.
- **No secret is serialisable.** Credentials live in the session behind ECMAScript `#private`
  fields (non-enumerable, never `JSON.stringify`-ed); `A360Connector.toJSON()` additionally
  allow-lists only `{ id, type, capabilities, controlRoomUrl, secretRef }`. A test asserts no
  secret value appears on any public surface.
- **Per-instance credential scoping.** A connector only ever resolves its own `config.secretRef`;
  two Control Rooms cannot read each other's credentials, and their workflows stay attributed by
  `connectorId` (ids namespaced `${connectorId}:${sourceId}`).
- **Token lifecycle.** `A360Session` caches a token with an expiry taken from the JWT `exp`
  (fallback TTL configurable), refreshes on expiry with no user re-entry (API-key re-auth or OAuth
  refresh grant). A **refresh failure surfaces as an unhealthy `health()`**, so `WorkflowService`'s
  health-gate skips the connector rather than crashing the listing path.
- **Status normalisation.** `normalizeStatus()` folds A360 status tokens onto `BotState`; anything
  unrecognised or absent maps to `Unknown` (an explicit state, not a silent partial).
- **Testing seams.** Inject `HttpTransport` and a `now()` clock to test refresh/expiry without a
  live Control Room. Only the fake transport carries vendor-shaped payloads.

**Open TODO(a360) / TODO(supabase) flags** (endpoints/shapes not verified against a live Control
Room; do not treat as confirmed): OAuth refresh endpoint+params; workflow-list endpoint + filter schema
+ list envelope; the auth header (`X-Authorization` vs `Bearer`); the per-workflow status source field;
workflow `name`/`createdBy` field names; token TTL fallback; and the production Supabase `VaultClient`.
See the connector source and the stage-2 report for the exact questions.

## Implemented so far — stage 3: Supabase wiring (all-in)

The Supabase backend for the `workflows` data plane: schema + RLS, Vault-backed secrets, and Deno
Edge Functions consuming the workspace TS. Deploy is scaffold + runbook (`supabase/README.md`) —
you run `supabase db push` / `functions deploy` with your own credentials; **no secret is in the
repo or this session.**

**IMPORTANT convention change: relative imports in `packages/*` and `connectors/*` now carry
explicit `.ts` extensions** (e.g. `from "./connector.ts"`). Deno requires them; Vite/Vitest/tsc
(bundler + `allowImportingTsExtensions`) accept them. New shared-source files must follow suit.
Bare `@conduit/*` specifiers stay extensionless (resolved by the Vitest alias, tsc paths, and the
Deno import map). App code under `src/` is unchanged.

**Layout**
- `supabase/migrations` — `connector_instances` (+RLS, `updated_at`), `workflows` cache (+RLS:
  authenticated read), Vault + service-role-only RPCs (`app_vault_read/write/metadata/delete`),
  and `pg_cron` → `sync` every 15 min (URL+token read from Vault).
- `supabase/functions` — Deno Edge Functions: `connectors` (admin CRUD + write-only credential
  path), `sync` (pull→normalise→upsert workflows), `capabilities` (declared-capability union), `health`.
  `_shared` holds the service client, `SupabaseVaultClient`, the registry loader, and the auth guard.
  `import_map.json` maps `@conduit/*` → workspace TS and `@supabase/supabase-js` → `npm:`.

**Contract details that concretized**
- **Reads via PostgREST, writes/orchestration via Edge Functions.** The frontend will read
  `workflows` (RLS: `authenticated`) directly; connector admin + sync go through functions (service role).
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
  (anon only; unset → seed mode). `src/lib/api.ts` — `getWorkflows()` / `getCapabilities()` calling our
  Edge Functions, with defensive `coerceWorkflow`/`coerceWorkflows`/`coerceCapabilities` at the boundary.
- `src/data/toDomain.ts` — `seedConnectedWorkflows()` maps the rich seed `Workflow`s to the canonical flat model, so
  there is one domain code path with or without a backend.
- `src/store.tsx` gained `workflows`, `capabilities`, `hasCapability(c)`, `dataSource`, `integrationError`;
  a mount effect loads live data when Supabase is configured, else keeps the seed fallback.
- Nav is capability-gated: `NavItemDef.capability` + a Sidebar filter (Workflows → `workflows`). Seed
  mode enables all capabilities, so the default prototype is unchanged.
- `supabase/functions/workflows` — a service-role GET returning domain workflows, so the frontend reads work
  with the anon key before Supabase Auth is wired (once it is, switch to a direct PostgREST read).
- Settings → **Integrations** renders the capabilities union + the live workflows (title/state/platform/
  owner) — the first surface that actually consumes our-API domain models.

**Contract details that concretized**
- **The frontend calls our API, never a vendor.** Reads go through `supabase.functions.invoke`
  (`workflows`, `capabilities`); responses are coerced to domain types (malformed rows dropped — the
  loud-failure guarantee lives server-side at the adapter).
- **Only the anon URL + key reach the browser** (`VITE_`-prefixed). No service-role key or secret is
  ever in a `VITE_` var. `.env.example` documents this; real `.env` is git-ignored.
- **Capabilities drive the UI.** The nav enables features from the declared-capability union, never
  from a connector's type.
- **New app dependency:** `@supabase/supabase-js` (the client for our API). Tests use Vitest; app
  tests live in `src/**/*.test.ts` (boundary coercion + seed→domain mapping).

## Implemented so far — stage 5: runner pool + distribution

The first two of the three inversions, made visible. Verified in a real browser (Chromium): no page
errors, Home/Runners/Activity/Automations all render, 104 tests pass.

**Layout**
- `packages/domain/src/runner.ts` — `Runner`, `RunnerClass` (`lightweight` ·
  `windows-service-account` · `windows-interactive`), `RunnerState`, `AuthModel`,
  `WorkflowRequirements`, and `readinessOf` / `requiredRunnerClass`.
- `packages/domain/src/distributor.ts` — `pickRunner(requirements, pool)` plus `runnerFits`,
  `explainRequirements`, `poolByClass`, `readinessMix`. Pure functions, 22 tests.
- `src/data/runners.ts` — the seed pool, deliberately mid-change (starting / draining / offline).
- `src/components/RunnersView.tsx` — the pool, replacing the old Environments view (deleted, along
  with `src/data/environments.ts`). Nav slot, breadcrumb, palette and controls renamed with it.
- `src/components/HomeView.tsx` — the landing view: pool, estate split, readiness mix, in-flight
  runs. `view` defaults to `home`.
- `Automation` gained `platform`, `migration`, `requirements`; `Run.target` became `Run.runnerId`;
  `Schedule.target` was **removed** (a schedule says when, never where).
- `StepAction.requires` + `requirementsForSteps` / `effectiveRequirements` in `src/data/actions.ts`.

**Contract details that concretized**
- **Requirements are derived, not trusted.** `commitDraft` raises a draft's declared requirements to
  the floor its steps impose (`effectiveRequirements`) — the same pattern `packagesForSteps` uses.
  A headed browser step makes the flow headed whether or not the author said so.
- **Placement is explained everywhere it appears.** `pickRunner` returns a `rationale`; Home, the
  run rows and the builder's test-run log all show it. A queued run is re-decided live against the
  current pool and rendered with a `→` so a proposal never reads as a placement.
- **The distributor falls up, never down.** A runner may take work below its class (an interactive
  runner can run API work) but never above it. Preference is cheapest-first, then already-up over
  starting, then least-used, then id — so the same pool and workflow always place identically.
- **Mirrored automations have no steps.** `platform !== "conduit"` means the flow lives on its own
  platform: `steps`/`packages` are empty and `editAutomation` refuses to open the builder. Tests
  pin both halves of this.
- **Seed placements are checked, not assumed.** A test asserts every seeded run sits on a runner
  that `runnerFits` its automation's requirements.

**Not yet built after stage 5** (do not assume these exist): the runner protocol (register /
heartbeat / dispatch / claim / ingest), `run_events` + Realtime streaming, tiers and the review
lifecycle, workflow versions, the audit surface, the backend-served node catalogue, and AI nodes.

## Implemented so far — stage 6: one word, tiers, and honest surfaces

The third inversion, the naming decision, and the readiness markers. Verified in a real browser
(Chromium): the review queue works end to end, tier gating hides what it should, and 120 tests pass.

**One word: workflow**
- `Bot` and `Automation` are gone. The domain type, the capability id, `WorkflowProvider` /
  `WorkflowService`, the A360 mapper, the Postgres cache table, its Edge Function, the API client,
  the store, the library view and the UI label are all `workflow`. Ids moved `aut_` → `wf_`.
- `bot` survives only inside the A360 adapter, describing *their* payloads — the one place it's
  still accurate.
- **Migrations are append-only.** `0005_rename_bots_to_workflows.sql` renames the table, its
  indexes and its read policy, and unschedules the old cron job before scheduling the renamed one.
  0002 and 0004 were left untouched because they may already have been applied.
- The local `Workflow` (rich, authored) and the domain `Workflow` (flat, crosses the API) share a
  name because they're the same entity at two fidelities. The store calls the API-side list
  `connectedWorkflows`; they converge when the library reads from the API.

**Tiers + the review lifecycle** (`packages/domain/src/review.ts`, 16 tests)
- `Role` = `consumer · builder · professional · admin`, with a permission table
  (`trigger · author · submit · review · publish · administer`) and `can(role, permission)`.
- `WorkflowStatus` = `Draft → In review → Changes requested → Approved → Published → Paused`.
  Transitions are a table; `availableTransitions(role, status)` is what both the buttons and the
  store's `reviewWorkflow` are built from, so the UI can't offer a move the rules refuse.
- **No path skips approval, for any tier.** `Draft → Published` doesn't exist: a professional walks
  their own work through in two clicks, but every published workflow carries an approval.
- `src/components/ReviewView.tsx` — the queue, on the Inbox chassis (grouped list → detail → act).
- Gates read `allowed(permission)`. There are no `role === "…"` comparisons left in the app.

**Surface readiness** (`src/data/readiness.ts`)
- Per-view `live | prototype | roadmap`, rendered as a Titlebar chip. `roadmap` marks exactly what
  the vision's §7 says the prototype doesn't prove — Manage, Administration, Users, Surfaces.
  `prototype` is unmarked, because that's the baseline; only the exceptions need saying.
- Named `SurfaceReadiness` to avoid colliding with the workload `Readiness` bands in the domain.

## Implemented so far — stage 7: versions, the runner protocol, audit, and the catalogue

The rest of the control plane's parity work, plus the contract the execution plane codes against.
Verified in a real browser (Chromium): 158 tests pass, no page errors.

**Workflow versions** (`packages/domain/src/version.ts`, 11 tests)
- `WorkflowVersion` history per workflow, appended on every save. Approving and publishing stamp
  the version they acted on, not the workflow — otherwise an approval silently covers a later edit.
- `hasUnpublishedChanges` surfaces the gap between what runs and what has been edited since.
- Seed history is *derived* from each row's status, so the seed can't drift into a state the
  lifecycle would never produce (a published workflow with no approval). A test pins that.
- `CURRENT_SCHEMA_VERSION` + `migrateWorkflow`: missing `schemaVersion` reads as v1; a
  future-versioned workflow is returned untouched rather than downgraded. The chain is empty at v1
  — it exists so adding v2 is one entry, and lands **before** the schema grows a conditional.

**The runner protocol** (`packages/domain/src/protocol.ts`, 12 tests) — **authoritative for the
runtime team.** `register` / `heartbeat` / `claim` / `ingest`, versioned because a runner in the
field is not redeployed in lockstep.
- **A runner states what it is, never what it wants.** No field for a workload, queue or workflow
  id, and there must never be one — placement is the platform's decision.
- Liveness tolerates 3 missed beats (`isStale`); events order and de-duplicate on the runner's
  `sequence`, never a timestamp (`orderEvents`).
- `0006` adds `runners` + append-only `run_events` keyed `(run_id, sequence)` — ingest is
  idempotent — and publishes `run_events` to `supabase_realtime`.
- `supabase/functions/runner` serves all four behind `RUNNER_TOKEN`. Runners are **not**
  `authenticated` users and must never hold a user JWT.
- **`claim` returns no work** (`TODO(runner)`): handing a run over needs an atomic claim-once.
- `testRun` emits protocol events via `fakeRunnerEvents` — a fake *runner*, not a fake log, so a
  real runner posting the same shapes needs no viewer change.

**Audit** (`packages/domain/src/audit.ts`, 7 tests) — `AuditEntry` is `SourceStamped`, so both
estates share one trail. Append-only by construction: no update or delete in the module or the
view. The store writes an entry on every lifecycle move.

**Node catalogue** — `0007` `node_types` + the `node-types` function; `ACTIONS` is now the
*fallback*, matching the `seedConnectedWorkflows` pattern. An empty catalogue keeps the fallback.
`coerceNodeType` states the honest limit: `requires` crosses as JSON, so a config-dependent
requirement (a browser step's headedness) stays compiled in.

**AI nodes** — `ai.extract` / `ai.classify` / `ai.summarise`, through the ordinary interface with
`readiness: "roadmap"`. Proving the interface holds an AI step without reshaping the runtime or the
canvas; none of them execute, and the palette says so.

**Not yet built after stage 7** (do not assume these exist): atomic run dispatch (`claim`), pool
autoscaling / `drain`, conditionals in the workflow schema, and any real execution runtime.
