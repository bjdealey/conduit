# CLAUDE.md — Conduit

Guidance for AI sessions working in this repo. Read this before proposing or writing code for
the integration layer. The full plan lives in `docs/integration-layer-plan.md`; the vision gap
analysis in `docs/vision-alignment.md`. (`docs/structure-map.md` maps a legacy A360 Control Room
and is kept only as historical background — **no A360 connector exists in this repo**; see
"Vendor independence" below.)

## Product framing (settled — read this first)

**Conduit is a control plane for automation.** It is not the execution runtime. Three artefacts,
clean boundaries:

| Plane | Owns | Lives |
|---|---|---|
| **Control plane — Conduit** | Authoring, the library, scheduling, **distribution**, the runner pool, credentials, node types, activity, audit, governance | This repo |
| **Execution plane — runners** | Executing a workflow and reporting events. Stateless, ephemeral, cross-platform | Separate artefact |
| **Integration bridge — connectors** | Normalising other platforms into our domain so every estate renders through one UI | `packages/connector-sdk`, `connectors/*` (**currently empty**) |

### Vendor independence (settled — this reverses an earlier decision)

**No connector ships with Conduit, and no vendor is named anywhere in the product.** The repo
previously carried an Automation Anywhere A360 connector and the strategy "replace the Control
Room by first wrapping it". That connector has been **deleted in full** — the package, the
`automation-anywhere` platform value, the mirrored seed rows, and the framing.

What survives, and matters, is the *mechanism*: `packages/connector-sdk`, the capability
services, and the `connector_instances` registry. A connector is still how another platform's
estate is mirrored into this library, still distinguished only by `Workflow.platform`, and
migration is still one reversible attribute on one row. There simply isn't one in the box.

Consequences to respect:

- **`WorkflowPlatform` is `string`, not a union.** Connectors are added at runtime with no
  frontend change, so the set of platforms is *data the UI reads off the estate*
  (`platformsIn`), never a list it is compiled against. `platformLabel` humanises an unknown id
  rather than rendering `undefined`, so a new connector reads correctly with no edit.
- **`defineKnownTypes` (`supabase/functions/_shared/registry.ts`) is deliberately empty.** A
  `connector_instances` row of an unregistered type is reported as `skipped`, never silently
  dropped.
- **Don't reintroduce a vendor name** in a type, a label, a seed row, or a doc example. Use a
  neutral placeholder (`acme-cloud`) where an example needs one.
- UI that only makes sense with two estates — the Platform and Migration filters, Home's
  migration breakdown — **appears only when a second platform is actually present**. On a
  native-only install those controls narrow nothing and assert a move that never happened.

**Parity where the incumbent tools are right; deliberate inversion where they are wrong.** Three
inversions carry the product, and none of them may be quietly un-done:

1. **No assignment.** Workflows declare `requirements`; `pickRunner` places them. Never add a UI
   that pins a workflow to a named machine — not on a schedule, not on a runner, not anywhere.
2. **No drift.** Runners are ephemeral and carry only an `image`. There is no agent-version or
   patch surface to build, by construction.
3. **Three tiers, not one.** Consumers trigger, citizen builders submit, professionals review and
   promote. `packages/domain/src/review.ts` holds the permission table and the transition rules;
   gates read `allowed(permission)`, never `role === "…"`.

## What this repo is today

A frontend-only interactive prototype: **React 18 + TypeScript (strict, ESM) + Vite**, deployed
as a static site to GitHub Pages (`.github/workflows/deploy.yml`). Data is **in-memory** in
`src/data/*.ts`, served through a React context store (`src/store.tsx`).

**The app boots empty.** `src/data/dataset.ts` is the single place that answers "what does the
app start with": `CLEAN` (the default) is a fresh install, `SAMPLE` is the demo estate behind
the Settings → Integrations "Sample data" switch. The seed modules themselves are untouched and
are still what the tests read. See "Stage 12" below before changing how any view gets its data.

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
  with no frontend change**. None ships in the box (see "Vendor independence"); candidates are
  Azure DevOps, Jira, ServiceNow, SQL Server, custom REST.
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
  readonly id: string;             // instance id, e.g. "acme-prod-eu"
  readonly type: string;           // connector type / platform, e.g. "acme-cloud"
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
{ "id": "123", "title": "Invoice Workflow", "state": "Running", "platform": "acme-cloud", "owner": "Brad" }
```

Every domain model additionally carries `sourceId` (raw vendor id), `platform` (connector type),
and `connectorId` (connector instance); `id` is namespaced as `${connectorId}:${sourceId}` so
two instances of the same connector type (e.g. two tenants of one vendor) never collide. Domain
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
- Capability ids and connector `type`/`platform` values are **lowercase-kebab** (`acme-cloud`).
- Postgres tables/columns are `snake_case`; the read layer maps them to the `camelCase` domain DTOs.
- **One word for the central object: workflow.** UI label, domain type, capability id, cache
  table and Edge Function are all `workflow(s)`. `bot` was an incumbent tool's word for the same
  thing; with the A360 connector gone it appears nowhere in this repo, and a connector that meets
  it on the wire should keep it inside its own adapter, describing *that vendor's* payloads.

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

## Implemented so far — stage 2: SecretStore (the A360 connector is gone)

⚠️ **This stage originally shipped an Automation Anywhere A360 connector. It has been deleted
in full** (see "Vendor independence" at the top). What remains from stage 2 is the `SecretStore`
seam and the connector-facing contracts the deleted connector was the first to exercise. They are
still authoritative — the next connector written must satisfy them.

**Layout (what survives)**
- `packages/connector-sdk` — `SecretStore` (interface + `InMemorySecretStore` for dev/tests +
  `SupabaseVaultSecretStore` over an injected `VaultClient` — no Supabase dep) and
  `queryCapability()` (structured supported/unsupported, never throws).
- `connectors/` — **empty.** The npm workspace glob and the Vitest test glob still point at it, so
  a new connector package is a directory, not a build change.

**Contract details that remain authoritative for any connector**
- **Declare only implemented capabilities.** Asking a connector for one it doesn't declare returns
  `queryCapability(...).supported === false`, never an exception.
- **Secrets are write-only through the store.** `SecretStore.get()` is server-side only;
  `describe()` is the read path and returns `{ ref, present, keys, updatedAt }` — field names,
  never values. Instance `config` holds a `secretRef` pointer only.
- **No secret is serialisable.** Credentials belong behind ECMAScript `#private` fields
  (non-enumerable, never `JSON.stringify`-ed), and a connector's `toJSON()` should allow-list the
  non-secret fields explicitly rather than excluding the secret ones.
- **Per-instance credential scoping.** A connector only ever resolves its own `config.secretRef`,
  so two instances of one type cannot read each other's credentials; their workflows stay
  attributed by `connectorId` (ids namespaced `${connectorId}:${sourceId}`).
- **Token lifecycle.** Cache a token with an expiry taken from the JWT `exp` (configurable
  fallback TTL) and refresh on expiry with no user re-entry. A **refresh failure must surface as
  an unhealthy `health()`**, so `WorkflowService`'s health-gate skips the connector rather than
  crashing the listing path.
- **Status normalisation is total.** Fold vendor status tokens onto the domain state; anything
  unrecognised or absent maps to `Unknown` — an explicit state, not a silent partial.
- **Testing seams.** Inject an `HttpTransport` and a `now()` clock so refresh/expiry are testable
  with no live upstream. Only the fake transport should ever carry vendor-shaped payloads.

**Still open:** the production Supabase `VaultClient` (`TODO(supabase)`).

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
  `WorkflowService`, the connector mapper, the Postgres cache table, its Edge Function, the API client,
  the store, the library view and the UI label are all `workflow`. Ids moved `aut_` → `wf_`.
- `bot` survived only inside the A360 adapter, describing *their* payloads. That adapter is gone,
  so the word now appears nowhere in the repo.
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

## Implemented so far — stage 8: dispatch, autoscaling, and conditionals

**Atomic dispatch.** `0008` adds `runs` + `app_claim_run`, which claims one queued run inside a
single statement holding a row lock (`for update skip locked`). Two runners polling a second apart
cannot execute the same workflow twice. The run **snapshots** its steps and the exact version, so a
workflow edited mid-queue can't change what an already-queued run executes.
- ⚠️ **The eligibility test is stated twice** — in `app_claim_run` (SQL) and `claimableBy`
  (`packages/domain/src/dispatch.ts`, under test). If they diverge, a run gets claimed by a runner
  the placement rules would never have chosen. **Change them together.**
- `unservable` separates "nothing free right now" from "no runner of that class exists"; `exhausted`
  surfaces runs retried past `MAX_ATTEMPTS` rather than growing the queue silently.

**Autoscaling** (`packages/domain/src/autoscale.ts`). `scalePlan(pool, queue)` is pure and
reproducible. Demand is per class, computed from each run's requirements. Scaling up counts only
idle capacity; scaling down **never touches a busy runner**. `lightweight` keeps one warm (a cold
start sits on every trigger's critical path); the Windows classes keep none. Hitting the per-class
ceiling is reported (`capped`), never silently absorbed. `drain` is recomputed per heartbeat rather
than stored — a stored flag goes stale the moment demand changes.

**Conditionals — schema v2.** `WorkflowStep` is now `ActionStep | BranchStep`; a branch carries
`condition` plus nested `then`/`else` lists, so a flow is a tree.
- `migrateWorkflow` grew its first real step (v1→v2 tags every step `kind: "action"`), and the
  **seed literals are still written in v1 and migrated on load** — so the migration is exercised on
  every page load, not only in its unit test.
- **Derivation walks the whole tree** (`flattenSteps`): a package used only on the unhappy path is
  still a dependency, and a headed step inside an `else` still makes the flow headed, because
  placement happens before anyone knows which way it goes.
- The walkers discriminate on *is it a branch*, not *is it an action* — a step arriving without a
  `kind` is likelier a v1 action that missed migration than a branch, and reading `.then` off it
  would take the page down.
- Builder: `StepList` recurses, arms are labelled and indented, and adding an action while a branch
  is selected puts it in that branch's `then`. `moveStep` only ever moves within the containing
  list — crossing a branch boundary would silently change whether a step is conditional.

**Not yet built after stage 8** (do not assume these exist): any real execution runtime — that is a
separate artefact by design (see the framing at the top). Conduit dispatches and observes.

## Implemented so far — stage 9: the library is a real tree

Folders became destinations, then the tree became editable and mixed. Verified in a real browser
(Chromium): rename / move / delete / create all drive end to end, 225 tests pass, no page errors.

**Folders open.** A folder row carries two actions: the chevron expands it, the label opens it.
Only the second is a selection, so expanding never changes the detail pane. `FolderDetail` counts
the whole subtree but lists direct contents — a folder of subfolders still holds work, and "0" over
five nested workflows would be a lie. The breadcrumb walks the ancestry back up, every crumb
clickable. One thing is open at a time (workflow · folder · file), enforced in the store.

**Files.** `LibraryFile` (`src/data/files.ts`) — XML configs and markdown documents filed in the
same folders as the workflows, so the tree is genuinely mixed. **A file's kind is read from its
extension, never stored** (`kindOfFile`), so a rename re-types it and the icon can't disagree with
the label. Row icons say what a row *is*; the workflow status dot moved to the trailing cluster.
`FileDetail` shows source, not a rendered preview — a second markdown implementation to keep honest
is a cost the prototype gets nothing for.

**Editing** (`src/lib/library.ts`, 28 tests). Rename / move / delete / create as pure functions over
`{folders, workflows, files}`, returning a new tree or a refusal in the words the UI shows. Rules
worth not re-deciding:
- **Mirrored workflows are read-only.** They're authored on their platform and the next sync would
  overwrite anything changed here, so the edit is refused rather than silently lost — and a folder
  holding one can't be deleted either, or the cascade becomes a way round the rule. Their row menu
  explains instead of offering items that always fail.
- **A folder can't move into its own subtree.** That detaches the branch from every screen.
  `moveTargets` is what the move menu is built from, so a destination the rules would refuse is
  never offered — a test asserts every offered target is one `moveNode` accepts.
- **A move inherits the destination's visibility, cascading through the subtree.** A private folder
  holding public children lies about who can see what.
- **Sibling names are unique per folder, case-insensitively, across all three kinds.** Two rows with
  one name in one folder is a tree nobody can read out loud.
- Ids come from `nextId` (derived from what's there), not a clock — the same tree yields the same id.
- Every edit writes an audit entry; deletion files as `governance`, the rest as `lifecycle`.

**UI notes.** `ActionMenu` swaps its own panel for "Move to…" and "Delete" rather than opening a
submenu or a modal (`keepOpen` marks the items that swap rather than act). Renaming is inline in the
tree — Enter commits, Escape abandons, and the field keeps focus when a name is refused. The row
menu takes the metadata's slot on hover instead of a reserved column, which would cost every name
~30px of a 20rem pane. The tree is a `<nav aria-label="Library tree">`, because the breadcrumb names
the same folders and "Onboarding" would otherwise mean two different controls.

**Breadcrumb carries the path for every kind.** Workflow, folder and file all render the folder
trail (`Workflows › Shared › Monitoring › Synthetics › …`), every ancestor clickable. "Workflows ›
Bulk invoice export" named the thing without saying where it lived.

⚠️ **A portal propagates events through the React tree, not the DOM tree.** `ActionMenu`'s dismissal
overlay therefore needs `stopPropagation`: without it the click that closes a menu also reached the
row the menu is mounted inside, so dismissing a folder's menu silently collapsed the folder. The
panel had it; the overlay didn't. Anything portalled out of an interactive parent has this problem.

**Selection and hover must never share a colour.** They did, so the selected row and the row under
the pointer were indistinguishable — two rows reading as hovered at once. Selection is now a stronger
fill *plus* a brand bar down its leading edge (through `--row-ring`, so it composes with the focus
ring); hover is the faint fill alone. The bar is what actually carries it: the two fills differ by 6%
in light mode but only 2% in dark, so tone alone would be a distinction that disappears for half the
users.

**Hover lives in `WorkflowLibrary`, not per row** (`hoveredId` in the tree context), so it is single
by construction — two rows cannot each believe they are hovered. The `…` follows the same rule: the
pointer wins when it is in the tree, and the focused cursor row shows it only when no row is hovered,
so the keyboard still gets the affordance without a second row lighting up beside the mouse.

**An open menu keeps its row lit** (`menuOpen` feeds the row background, and opening a menu moves the
keyboard cursor to that row). The panel is portalled out of the row, so the pointer leaves the row the
instant it reaches the menu — without this the highlight drops off the one row you are demonstrably
acting on.

**A menu item that binds a key says so, trailing** (`ActionItem.shortcut`, from `src/lib/keys.ts`).
Two labels come out of `shortcutFor`, not one: `label` is the glyph the keycap draws, `keys` is the
`aria-keyshortcuts` token — always a key *name*, because a screen reader handed "⌫" is reading a
picture of a key rather than naming it. The glyph is `aria-hidden` for the same reason.
- **The hint names the key the keyboard in front of you has.** The tree's handler takes `Delete` and
  `Backspace` both, so the hint is free to read `⌫` on an Apple platform and `Del` everywhere else. A
  MacBook has no Del key, and a hint pointing at a key that isn't there is worse than no hint.
- Only bound keys get one: "Move to…" has no shortcut and shows none. The batch `Delete N items` does
  show `Del`, because Del on a row inside the selection opens exactly that confirm.
- **The phone shell draws no keycaps** (`useIsMobile` in `ActionMenu`) — same reason. `aria-keyshortcuts`
  stays on the item either way, since a paired keyboard is still a keyboard.
- ⚠️ **A shortcut the menu advertises must not strand the keyboard.** F2's input unmounts when the
  rename ends, and an unmounted element's focus falls to `<body>` — so every arrow key and Del after
  it went nowhere. Focus returns to the row, but **on the next frame, not immediately**: a rename
  that ends by clicking away unmounts during `focusout`, *before* the browser focuses what was
  clicked, so at that instant `activeElement` reads as `<body>` either way and the two cases are
  indistinguishable. One frame later they aren't, and "nothing took focus" is finally a fact.

**Row menus are portalled, and must stay that way.** `ActionMenu`'s panel renders into `document.body`
positioned `fixed`, not absolutely inside the row. A tree row sits inside a scrolling pane and inside
one `overflow: hidden` per `<Reveal>` nesting level — five clipping ancestors deep in places — and an
absolutely positioned panel is clipped by every one of them (this sliced "Delete" off the bottom of a
menu). **z-index cannot fix that: overflow clips regardless of stacking**; leaving the box is the only
fix. The panel measures its trigger before paint, pins an edge rather than computing a left from a
width it doesn't know yet, flips above when it wouldn't fit below, and closes on any scroll *except*
one inside its own destination list.

**`<Reveal>`** (`src/components/Reveal.tsx`) animates a branch open and closed with the grid trick —
a one-row grid interpolating `0fr → 1fr`, which reaches the content's natural height with no ref
measuring, no ResizeObserver, and no `max-height` guess that clips tall content or animates empty
space. The price is that children stay **mounted while closed** — there is nothing to animate out of
a subtree React has unmounted — so closed content is made `inert`, or a collapsed branch would still
be tabbable and still read out by a screen reader. Note `grid-template-rows` is not a
compositor-animated property: it needs main-thread style recalc, so it can't be timed from a
throttled headless browser (the transition is observable there, its wall-clock duration isn't).

**The tree is a real ARIA tree** (`role="tree"` / `treeitem` / `group`, with `aria-expanded`,
`aria-level`, `aria-selected`). One tab stop, roving `tabIndex`: 35 rows of three buttons each was
~75 tab stops to get *past* a navigation pane, and a screen reader read it as "button, button,
button". The row itself is the only focusable thing in it — the chevron and the "…" are
`tabIndex={-1}`, since `aria-expanded` already says what the chevron says.
- Keys: ↑/↓ move, → expands then steps in, ← collapses then steps out, Home/End, Enter opens, F2
  renames, Delete opens the confirm, Shift+F10 / ContextMenu / right-click open the row menu, and
  typing does prefix typeahead with a 600ms buffer (so "sy" reaches Synthetics).
- **`visibleRows` in `src/lib/tree.ts` is the single source of row order**, used by both the renderer
  and the arrow keys. Two implementations of "the next row" drift the first time someone reorders a
  section; one cannot.

**Search keeps the tree** (`narrowTree`): the matches, every folder on the path down to one, and a
name-matched folder's whole subtree. It used to flatten — a deliberate decision, but one that fought
the breadcrumb work, which exists precisely because where a thing lives is half of what you need.

**Drag to move.** Drop targets come from `moveTargets`, the same call the move menu is built from, so
a destination the rules refuse never lights up. `readOnlyReason` is the one gate for "can this be
edited at all" — the menu's explain panel, `draggable`, and the F2/Delete shortcuts all ask it.

**One level of undo**, offered in a bar above the tree. The edits are pure and return a *new* tree,
so the previous one is still intact and is the whole of what undo needs; it restores the selection
too. The trail stays append-only — undoing writes a new entry, it never removes the one it reverses.

**Expansion persists** (`tree-expanded` in localStorage, via the store) — it was component state, so
navigating away and back re-expanded everything. A never-opened branch is **not mounted**: `<Reveal>`
has to keep children mounted to animate closed, which would otherwise put the whole library in the
DOM whether or not anyone looked at it.

**Sibling folders sort by name** (`childFolders`). They were in insertion order, so a folder created
today landed at the bottom of its siblings rather than where its name says it belongs.

**Indent guides, and the two reading preferences** (`src/data/libraryView.ts`, 6 tests). Layout
(`tree` · `list`) and density (`comfortable` · `cosy` · `compact`) are declared as one table, so the
settings pickers, the store's persistence and the tree's CSS read the same list rather than three
copies of it. Both persist to localStorage and are narrowed on the way *in* as well as out — a
stored value is only as trustworthy as the version of the app that wrote it.
- **A guide line per ancestor, drawn as the row's own background** — not a border on the containing
  `<Reveal>`, not a span per level. A background costs no DOM on a tree that can run to hundreds of
  rows, it is clipped by the reveal animation exactly as the row is, and it needs nothing to know how
  tall a branch is. `--row-depth` is the ancestor count; a top-level row paints a zero-width image
  and draws nothing.
- ⚠️ **The row's fill must be `backgroundColor`, never the `background` shorthand** — the shorthand
  resets `background-image`, which is where the guides live.
- ⚠️ **A density's custom properties are set on the tree *container*, and their fallbacks live at the
  point of use** (`var(--tree-indent, 14px)`), never as declarations on `.tree-row`. A property
  declared on the element itself beats the container's inherited value, so every density would have
  silently rendered as the default.
- **The row height is a floor, and the padding inside it is part of the density.** Compact's 26px
  first shipped doing nothing: the label's line box plus a fixed 4px was already 28px. `min-height`
  rather than `height` is also what lets a flat-list row carry its second line. The phone overrides
  the floor outright — Compact asks for more rows, not for a target a thumb keeps missing.
- **The flat list is a layout, never a filter.** `visibleRows` grew a `layout` argument rather than
  the renderer growing a second order, for the same reason the function exists: the arrow keys and
  the eye have to agree about the next row. A test pins that both layouts show the same matches for
  the same search.
- **Flat rows carry their folder path** as a second line — where a thing lives is half of what you
  need, the same reason every breadcrumb carries the trail, and a layout with no folder rows has
  nowhere else to say it. The incoming order is kept, not re-sorted: the workspace header's sort
  already governs it.
- **Folders aren't rows in the flat layout, and the setting says so.** The estate's "New folder" is
  hidden there, because the rename it opens with would have nowhere to land — and `renamingId` is
  cleared whenever its row isn't in `rows`, since `onKeyDown` returns early while renaming and a
  rename aimed at an undrawn row would silently jam every arrow key.

**Clicking a folder row toggles it** as well as selecting it — a second click closes what the first
revealed. Enter does the same, so pointer and keyboard agree. Navigating to a folder from anywhere
*else* (a detail pane, a breadcrumb crumb) only ever reveals it: you asked to go there, not to toggle
it.

⚠️ **Nothing inside a tree row may use an outline for focus.** `.tree-row:focus-visible` *and*
`.tree-row .focusable:focus-visible` both take an INSET ring, not `.focusable`'s outline. An outline is drawn *outside* the border box (`outline-offset: 2px`) and `<Reveal>`'s
`overflow: hidden` clips it — visibly, on every nested row, while Public/Private looked fine because
they sit outside any `<Reveal>`. Same root cause as the portalled menus. The drag drop-target ring
rides on a `--row-ring` custom property so the two compose in one `box-shadow` instead of the inline
style silently replacing the class. Note the fallback is `0 0 0 0 transparent`, **not `none`**: `none`
is only legal as the sole value of `box-shadow`, so `inset …, none` is invalid and the whole
declaration is dropped — which is exactly what happened on the first attempt, and it fails silently.
The rule covers the row's descendants too: the "…" trigger sits inside the same clipping ancestors,
so fixing only the row left its ring shaved. It also takes `tabbable={false}`, since a `<button>`
with no `tabindex` attribute is a tab stop — which is how it stayed in the tab order while a check
that only counted `[tabindex]` elements reported the tree as one stop. **Count what Tab can reach,
not what carries the attribute.**

**New work lands where you are.** `newWorkflow(folderId)` takes a destination; the header passes the
open folder (or the folder of whatever is open), falling back to Drafts. A folder's row menu offers
it too.

⚠️ **Don't set state from a ref mutated during render.** `ActionMenu`'s "open onto this panel" was
written that way and silently did nothing: StrictMode's double invocation ran the guard twice, the
first pass set the ref, the second pass saw it set and skipped the update — and React keeps the
second pass. It's a `useLayoutEffect` keyed on `[isOpen, openTo]` now.

**Multi-select, and the two ideas it forced apart.** The tree now keeps `treeSelection` (what a bulk
action would act on) separately from the `selected*Id` fields (what the detail pane is showing). They
were one thing; they can't be, because the row's **info button** opens a row *without* touching the
selection — the whole point being to read something without losing a selection that took several
clicks to build. A plain click sets both, a ⌘/Ctrl-click only the selection, the info button only the
open item. `peeking` marks the third case and outranks the selection summary in both the pane and the
breadcrumb, or the button couldn't serve the one case it exists for.
- Shift-click and Shift+Arrow take a range **in `visibleRows` order** — the same single source the
  arrow keys use, so the range is what the eye sees between the two rows.
- The two facts compose visually rather than ranking: selection is the fill, the open row is the
  leading bar. A plain click sets both, so the ordinary single-selection case looks exactly as before.
- **A menu opened on a selected row acts on the whole selection** (`Move 2 items to…`), and its
  trigger says so. Right-clicking one of four selected rows and getting an action that touches only
  that one is a good way to delete the wrong three.
- `withoutCovered` drops nodes already covered by a selected folder — the cascade reaches them
  anyway, and acting twice turns "3 moved" into "3 moved, 2 refused because they no longer exist".
- Bulk edits apply **in sequence over the accumulating tree**, so a collision between two moved
  siblings is caught rather than allowed. Partial success is normal and reported: losing the
  successes because one node was mirrored would be the wrong trade. `sharedMoveTargets` is the
  intersection, so a batch never offers somewhere only half of it could go.

**Still seed-backed.** Edits live in React state: they survive navigation, not a reload — except the
expansion set, which is persisted. The persistence path is the same one the library's reads will take
(PostgREST/Edge Functions), and the rules in `src/lib/library.ts` are the ones a server would have to
enforce too.

## Implemented so far — stage 10: the phone shell

One breakpoint, two shells. Verified in a real browser at 390×844 (Chromium, iPhone 13 emulation),
light and dark: no page errors, no horizontal overflow on any view, 252 tests pass, and the desktop
shell is unchanged at 1440×900.

**One breakpoint, written twice, kept in step.** `MOBILE_MAX_PX = 767` in `src/lib/responsive.ts`
and the `@media (max-width: 767px)` block in `app.css`. Structure is a React decision (which nav
renders, which pane is on screen), scaling is a CSS one; neither language can do the other's half.
Anything wider is the desktop shell, which already has controls for having less room.
- `useIsMobile()` is live — rotating a phone or dragging a window narrow swaps shells with no reload.
- `isMobileNow()` is the synchronous read, for `useState` initialisers that must be right on the
  *first* paint. **On a phone nothing starts open**: the seeded first-row selections (`selectedId`,
  `selectedWorkflowId`, `selectedUserId`, `selectedRunnerId`, `treeSelection`) are desktop-only, or
  Workflows would land you inside the first workflow instead of on the library.

**Bottom bar, not a rail** (`BottomNav.tsx`, `MOBILE_BAR` in `data/nav`). The rail costs 56px of a
390px screen permanently and puts its destinations furthest from the thumb. Four destinations plus
"More"; the rest live in the overflow sheet with search, the account row and the theme switch.
- `splitDestinations` is pure and tested. It runs on the **already gated** list, so a destination the
  tier or capability set hides never takes a slot — and a named-but-hidden item doesn't leave a gap.
- "More" carries the active state when the open view is in the overflow (or is the builder), so the
  bar never claims nothing is open.
- Icons moved to `data/navIcons.tsx` and are shared with the rail. Two records would drift.

**Drill-in belongs to the layout primitives, not the views.** `<SplitView mobile={selected ?
"detail" : "list"}>` is the whole declaration; `Pane`, `DetailPane` and `EmptyDetail` read it from
context. The hidden half is **not rendered**, so a 200-row list isn't sitting in the DOM under the
detail. Thirteen views each inventing this is thirteen answers to keep in step.
- A view with no drill (a board, a dashboard) declares nothing and keeps every pane on both shells.
- Activity declares `mobile="detail"` unconditionally: its leading pane is a *scoping* rail, not a
  list you drill into, and the runs are what the page is for.
- `viewMode()` returns the first mode on a phone. Every alternate (board, grid, timeline, diagram)
  is multi-column by definition. The preference is kept, not cleared.

**The context pane becomes a bottom sheet** (`Sheet.tsx`, portalled to `<body>` — the panes it opens
over are clipping scroll boxes several levels deep, and z-index does not survive `overflow: hidden`).
Same titlebar toggle, same `infoPaneOpen` flag, but **the phone's state is never persisted and always
starts closed**, and it closes on navigation and on a shell swap — a modal that outlives what opened
it is a dialog nobody opened. `contextLabel` is one string for the toggle and the sheet title.

**The builder still works on a phone.** The flow is the screen; `PaletteBody` was split out of
`Palette` so the catalogue can live in a sheet opened from the footer's "Add step", and selecting a
step opens the configuration sheet — otherwise tapping a step does nothing you can see, and the one
thing the builder is for has no way in.

**Back is one tap to the section, not one level up the trail.** The phone breadcrumb collapses to
where you are plus an arrow firing the **first** clickable crumb. Climbing a folder at a time would
land you on a series of folder details you never asked for; where a trail is two crumbs long the two
readings are the same crumb anyway.

**A folder tap only toggles on a phone.** The tree *is* the screen there, so opening a folder would
replace it — and browsing two levels down would be impossible, because every tap out of the tree is
a tap out of the tree. A folder is a container you look inside; a workflow or a file is where you go.
Its detail is still one tap up the breadcrumb from anything filed in it.

**No hover means no hover-revealed controls.** Tree rows show their metadata *and* their menu
together rather than swapping one for the other; the peek button isn't among them, because a tap on
the row is already the way in. Rail tooltips and flyouts are `display: none`.

**Rows that were columns become two lines.** A run row is six columns and an issue row five; at
390px the one column that must survive (the name) is the one that truncates. Both keep everything —
id, placement, timing, priority, reach — on a second line under the title.

⚠️ **A grid item's automatic minimum size is its content, not zero.** Home's panels sized their
implicit column to their widest row, so the page laid out ~600px wide inside a 390px screen with the
right-hand side simply cut off — and `scrollWidth` still read 390, so nothing scrolled to reveal it.
`min-w-0` on the item is the fix. This also bit every desktop window narrower than the `lg`
breakpoint, where that column is implicit rather than declared.

**Tab strips scroll sideways** rather than wrapping or clipping — a tab you cannot reach is a section
of the page you cannot reach. Settings needs it most: its pages navigate from the sidebar rail, which
the phone shell doesn't mount, so `SettingsContent` renders the same strip to reach them at all.

**Type scales from one place.** The mobile block raises `--font-scale-03/04/05` (13→14px body-sm,
15→16px body-base — also the size iOS uses to decide whether to zoom a focused input). Headings are
untouched: already large, and scaling them costs more of the screen than it buys. Tap targets follow:
`.tap-target` is 44px, tree rows 42px, bar items 56px, sheet rows 48px.

## Implemented so far — stage 11: workflows actually run

The first three inversions were about *where* work goes. This is the one about work happening:
a workflow authored in Conduit now executes, start to finish, headless, over HTTP. Verified in a
real browser (Chromium) against a local API — the builder's **Test run** and the library's
**Run now** both make a real request and render a real log — and by a real process, `conduit-runner`,
executing the shipped example flow end to end. 324 tests pass, no page errors.

**The boundary held, and that is the point.** The vision's §6 says *"no execution engine in this
repo"*, and the engine is still not part of the control plane: it is a **separate artefact kept at
arm's length**. `packages/runtime` imports `@conduit/domain` and nothing else — no React, no
Supabase, no `src/`, no Node or Deno API — and `runner/` is the host process around it. Both could be
lifted into the runtime team's repository tomorrow and the control plane would not notice. What
changed is that Conduit now ships runner #1 rather than only describing it.

**Layout**
- `packages/runtime` — the engine. `values` (JSON values, path lookup, loose equality, truthiness),
  `expression` (`{{ }}` interpolation + branch conditions), `context` (run state + secret masking),
  `http` (transport seam + URL policy), `nodes/*` (one executor per node type), `engine` (walks the
  tree, emits protocol events), `testing` (fake transport, ticking clock — tests only).
- `runner/` — the host: `config` (environment only), `client` (the four protocol calls), `loop`
  (register → heartbeat → claim → execute → ingest), `local` (a flow file, no backend), `cli`.
  `runner/examples/invoice-check.json` is the flow the end-to-end test executes.
- `supabase/migrations/0009_run_lifecycle.sql` + `supabase/functions/runs` — the two ends of a run
  0008 left open: queuing one, and finishing one.

**What executes, and what says it doesn't.** Stage 1 is the headless API-first set: `http.request`,
`assert.equals`, `assert.resolves`, `data.set` (new), `metrics.record`, plus conditionals in the
engine. A node with no executor **fails the run at that step**, naming the node and what this runner
does run. A browser step reported as fine by a runner with no browser is the worst outcome available
here — the flow would look green and have done nothing. The palette says so before the run: a
`no runner` chip beside the node and a line in the builder's footer.

**Contract details that concretized**
- **An expression cannot reach the host.** No `eval`, no `Function`, and there must never be one:
  workflow text is authored by citizen builders, so an expression that reached the host language
  would make the authoring surface an RCE surface with the review queue as the only guard.
- **Interpolation fails loudly; a condition does not.** `{{ invoice.id }}` missing in a URL throws —
  `POST /invoices/` is a request to a different endpoint and it will often succeed. The same path
  missing in a branch condition is simply false: a condition is a *question*, and "is there an error
  field" is a fair one to ask of a response that may not have one.
- **A non-2xx response is an answer, not a failure.** `http.request` records a 404 and carries on; an
  assertion is where an author says a status was unacceptable. The transport failing (DNS, TLS,
  timeout) is the failure, because then there is no answer at all.
- **Secrets come from the runner, never from the workflow.** `{{ env.NAME }}` resolves from values the
  *runner* holds (`CONDUIT_ENV_*`, prefixed so a flow can't read the runner's own token), and every
  event is masked on the way out. ⚠️ Masking is **by name** (`SECRET_NAME` in `context.ts`): the first
  attempt masked every injected value and turned the log into `GET ••••/invoices → 200`, throwing away
  the only forensic record a headless run leaves. A credential hidden in a value named `API_URL` is
  therefore not caught — a real limit, stated rather than assumed.
- **Protocol v2: the flow is a tree.** `ClaimResponse.work` carries `ExecutableStep[]` with branches,
  because schema v2 made a flow a tree in stage 8 and the wire still said list. A flow with no
  branches serialises identically in v1 and v2, so `SUPPORTED_PROTOCOL_VERSIONS` is `[1, 2]`; the only
  thing a v1 runner cannot execute is a branching flow, and it finds out by meeting a `kind` it does
  not know. A step arriving with no `kind` is an action — the same rule the control plane's walkers use.
- **A run's outcome is derived from its log.** Ingesting a terminal event calls `app_finish_run`,
  rather than the runner making a separate "I'm done" call: a runner that posts its last event and
  then dies — exactly what an ephemeral runner is entitled to do — would otherwise leave a visibly
  completed run sitting in `running` forever. `app_requeue_abandoned_runs` (cron, every minute) does
  the same job for a runner that died mid-run, measuring staleness from the *heartbeat* and not from
  the run's age: a long run is not a stuck run.
- **The runner declares only what it can present.** `CONDUIT_AUTH_MODELS` defaults to `none,api-key`,
  and it checks `runnerFits` against the work's echoed requirements before starting. Claiming an auth
  model the image cannot actually present means being handed work it must fail — the pool would show
  capacity it hasn't got.
- **Private addresses are refused by default** in `serve` mode (`blockPrivateNetworks`). A workflow
  authored by someone else runs on your infrastructure, and without this
  `GET http://169.254.169.254/…` is a legal workflow step. `--allow-private-hosts` is the deliberate
  opt-out for a runner whose job *is* an internal API.

**The app runs its own flows.** With no backend the browser tab **is** the runner: Test run and Run
now execute through the same engine and emit the same events, so there is one code path and one
viewer. With a backend the app *queues* the run and watches `run_events` — and if the control plane
refuses the trigger (today it will: the browser has no admin identity until Supabase Auth is wired),
the run says so **in its own log** and executes locally rather than failing silently or pretending it
went to the pool. `fakeRunnerEvents` is gone: a flow that really executes does not need a plausible
log written from its step list, and a log that was written rather than observed is worse than none.

⚠️ **Everything the execution plane imports must be free of TypeScript that *emits* code.** The runner
runs `.ts` directly under Node's type stripping, which refuses `enum`, parameter properties and
namespaces, and keeps any import not marked `type`. That is why `Capability` is now a frozen object
plus a union type (every call site reads identically), why the runtime's error classes assign their
fields in the constructor body, and why `mapping.ts` imports `type MapContext`. The domain package is
the file the runtime team codes against; it has to load in the thing they are building.
`tsconfig.packages.json` keeps `types: []` to prove the packages are host-free; `runner/` has its own
project with Node's types.

⚠️ **A prefilled placeholder stops being harmless the moment steps execute.** `defaultConfig` starts a
step on its placeholder, which was right when nothing ran — but `https://api.conduit.com/v1/…` is not
a URL and `{{ record.id }}` is not a value, so every new HTTP step's first run would have failed. The
executable node's fields (`url`, `headers`, `body`) now start empty with the placeholder as the hint
it always was; the rest of the palette is unchanged.

**Two Edge Function bugs the wiring surfaced.** `runner/index.ts` imported `methodNotAllowed`, which
did not exist, and called `json(body, status)` with the arguments reversed — it could never have
booted. Both are fixed, and it is worth knowing why they survived: the Deno functions are the one part
of this repo that neither `tsc` nor Vitest ever sees (`supabase/README.md` says so). Anything written
there is unverified until `deno check` runs on deploy.

**Not yet built after stage 11** (do not assume these exist): the browser/Windows node executors and
the runner images that would carry them, OAuth/credential resolution inside a run (a runner presents
what its environment holds — there is no per-workflow credential binding yet), retries or resumption
inside a run, run cancellation, and a scheduler that actually fires `pg_cron` → `runs`.

## Implemented so far — stage 12: vendor independence and a clean slate

Two changes that belong together: the A360 connector is gone, and the app now **boots empty**.
Verified in a real browser (Chromium): a clean install renders every view with no page errors,
the Sample data switch restores the demo estate, and 318 tests pass.

**The connector is deleted, the mechanism is not.** `connectors/automation-anywhere` — package,
tests, workspace link, Edge Function import-map entry and registry factory — is removed, along
with the `automation-anywhere` platform value, the ten mirrored seed workflows, the "Automation
Anywhere" folder, its three files, and the mirrored audit entries. `packages/connector-sdk` and
the capability services are untouched. See "Vendor independence" at the top for the rules this
imposes; the short version is **don't name a vendor, anywhere.**
- **`WorkflowPlatform` became `string`.** A closed union meant installing a connector required
  editing and redeploying the frontend, which contradicts the whole registration design. The UI
  now reads platforms off the estate (`platformsIn`) and labels an unknown id by humanising it
  (`platformLabel`), so a new connector needs no edit here.
- **Two-estate UI is conditional, not deleted.** Home's migration breakdown and the library's
  Platform/Migration filters appear only when a non-`conduit` platform is actually present.
  Deleting them would have thrown away the migration story; showing them on a native-only
  install asserts a move that never happened and offers a filter that narrows nothing.
- The library's read-only rule for mirrored workflows is **unchanged and still tested** — the
  fixtures moved into the tests (`MIRRORED_WORKFLOW` in `library.test.ts`) rather than relying on
  a seed row, which also states the rule's real precondition: it turns on `platform`, not on any
  particular vendor.

**One place decides what the app boots with** (`src/data/dataset.ts`). `CLEAN` is the default;
`SAMPLE` is the seed modules, unchanged, behind Settings → Integrations → "Sample data"
(persisted as `demo-data`).
- **Empty is not zero.** A freshly set-up platform still has the two visibility roots (the
  library needs somewhere to file the first thing you author), the four tier definitions, the
  policy catalogue, and exactly one account — yours, derived from `currentUser`. Everything that
  is somebody's *data* starts empty.
- **The seed modules are untouched**, so the tests still read the full sample estate and "what
  the app boots with" is one decision in one file rather than a property smeared across fifteen.
- ⚠️ **Eleven components imported `src/data/*` directly at module scope** and so could not see
  the switch at all. They read from the store now (`runners`, `endUsers`, `schedules`,
  `eventTriggers`, `credentials`, `packages`, `globalValues`, `surfaces`, `platformUsers`,
  `licenses`, plus `roleDefs`/`policies`). **Don't reintroduce a module-scope seed import in a
  component** — whether a collection holds anything is a runtime question now, and a module-scope
  import answers it once, at load, and is wrong for the rest of the session.
- `seedConnectedWorkflows(workflows, members)` takes its inputs for the same reason, and
  `connectedWorkflows` is derived rather than snapshotted so a just-authored workflow appears on
  the Integrations page as it would through the API.
- **Switching the dataset resets the selections too.** A selection is an id into a dataset that
  no longer exists; keeping it points the detail pane at a workflow that isn't in the library,
  which renders as an empty pane that looks broken rather than as the clean slate it is.

**Empty states are the first screen, not an edge case** (`src/components/EmptyState.tsx`).
`EmptyState` fills a pane, `EmptyPanel` sits in a dashboard card, `EmptyRow` is a list slot.
- Each says **what** is missing in the page's own words and offers the one action that fills it —
  and only when there *is* one. Activity and Audit fill themselves, so they explain instead of
  offering a button that can do nothing.
- **An empty collection and a narrowed one must never share a message.** Runners now distinguish
  "no runners registered" (a new install) from "the pool has scaled to zero" (an autoscaler
  decision) from "nothing matches the current search" — three different facts that had been one
  sentence. Manage and Administration got per-tab messages for the same reason: "Nothing to show
  yet" is true of all nine tabs and useful on none of them.
- ⚠️ **`SurfacesView` read `surfaces[0]` unguarded** and took the page down on a clean install
  rather than rendering an empty one. Any view that reads one row out of a collection to drive a
  whole screen needs the same guard.
- `SurfacesView`'s local `EmptyState` (for unbuilt prototype tabs) is now `UnbuiltTab`. The two
  are genuinely different claims — "nobody has written this yet" versus "this workspace holds no
  data" — and saying which is the point.

**Filter menus take their options from the data** (`ControlFacets` in `data/workspaceControls`).
Platform and Country used to be built from a compiled-in list and a seed import; both are now
passed in by `<WorkspaceHeader>` from the store. A filter that offers a country nobody is in is
worse than no filter.

**You are not a fixture** (`src/data/user.ts`). `currentUser` was a hardcoded person — Keith
Kennedy — and it was the one piece of someone else's data the clean slate missed, on the first
screen, next to your work. It is now persisted state seeded from **the address you sign in with**:
`userFromEmail("ada.lovelace@acme.com")` → "Ada Lovelace", initials "AL". The login screen already
collected an email and threw it away; wiring it is what turns a gate into setup.
- **Settings → Profile Name and Email actually save.** `TextInput` now takes either
  `value`+`onChange` (a field that persists) or `defaultValue` (one that doesn't yet) — most of
  that page is still shaped-not-wired, and a field that silently discards what you typed is worse
  than one that is visibly inert.
- **Initials are derived from the name, never entered** (`initialsOf`), the same rule a file's kind
  follows: rename yourself and the avatar follows, with nothing to disagree about.
- ⚠️ **A profile edit must reach the rows that name you**, not just the account menu.
  `applyProfile` patches `members[me]` and `platformUsers[pu_me]` too — every avatar and assignee
  resolves through the member row and Administration lists the platform-user row, so without this,
  renaming yourself leaves the old name on the one screen you'd open to check it worked. Both
  patches are deliberate no-ops on the sample estate, which has no `me` row: that is a fictional
  team, and writing your name into it would have the demo claim you authored someone else's work.
- **`CLEAN` became `cleanDataset(user)`** so the one account a fresh install has is you. `SAMPLE`
  does not absorb you, for the reason above.
- A provider button (Google/GitHub/Apple) has no address to offer here, so it signs in as
  `NEW_USER` and Profile is where that stops being a placeholder. An unset email renders as
  "No email set" (`emailLine`) rather than a blank second line, and "Not set" in the admin table —
  an empty cell reads as a value that failed to load rather than one nobody has entered.
- ⚠️ **`onClick={signIn}` hands the click event to `signIn` as its `email` argument.** The social
  buttons take `() => signIn()`. TypeScript caught this one; an untyped handler would not have.

## Implemented so far — stage 13: five destinations, and a `Section` key

The rail carried **eleven destinations plus Settings**, and the count was four separate problems
wearing one shape. Verified in a real browser (Chromium) at 1440×900 and 390×844, on both the
clean install and the sample estate: every section renders, the console is clean, and 338 tests
pass.

**What the eleven actually were**

1. **A name collision.** `Users` (end-user session monitoring) and `Administration → Users`
   (platform accounts) were two nav-level things called Users meaning two populations.
2. **Template residue.** `readiness.ts` already said it: Users and Surfaces were *"the two
   surfaces inherited from the marketing template that have no vision counterpart yet"*, both
   `roadmap`. Surfaces was a frontend-observability product (Events/Keys/Environments/Releases)
   inside an automation control plane.
3. **Four queues that are one idea.** Activity, Inbox, Review and Audit — and Review and Audit
   carried the *identical* role gate, while `ActivityView` already rendered an incidents rail
   over the same `issues` collection the Inbox showed.
4. **Manage was two concepts and duplicated Settings.** Schedules and event triggers are *how a
   workflow starts*; credentials, packages and global values are *what a run consumes*. Meanwhile
   Settings → Team duplicated Administration → Users/Roles, and Settings → Billing duplicated
   Administration → Licenses.

**The shape now** — five destinations plus Settings:

| Destination | Subpages |
|---|---|
| **Home** | — |
| **Workflows** | Library · Triggers |
| **Activity** | Runs · Issues |
| **Runners** | — |
| **Governance** | Review · Audit · Administration |
| *Settings* | Profile · Workspace details · Resources · Alerts · Integrations · Developer |

`View` went from 13 members to 7. Users and Surfaces are **deleted** — views, seed modules, store
fields and dataset entries. `SurfaceChart` survived as `TimeSeriesChart`: Activity's Insights tab
("Runs over time") reads it, and a component named for a page that no longer exists names a screen
nobody can find.

**`Section` is the new key, and it is the load-bearing part** (`src/data/nav.ts`). A section is a
destination without subpages, or one of a destination's subpages (`"governance/audit"`). Six
mechanisms were keyed by `View` and are now keyed by this: `workspaceControls`, the store's
`controls` and `sectionTabs`, `VIEW_MODES`, `CONTEXT_LABEL`, and `readinessOf`.
- **`View` stopped being the right granularity the moment a destination held more than one
  screen.** Governance's Review and Audit need different search placeholders, different tab memory
  and different readiness; one entry per destination gives all three whichever was written last.
- The type is **derived from the nav table** (`SectionOf<(typeof NAV)[number]>`), so adding a
  subpage without giving it controls or a readiness is a compile error rather than a screen that
  silently falls back to its neighbour's. `navItems` is the widened `readonly NavItemDef[]` view of
  the same table, so consumers see optional `roles`/`capability`/`subpages` rather than keys that
  exist only on the items declaring them.
- ⚠️ **`subview` is only a nav subpage on the destinations that declare them.** Settings reuses the
  same store field for its own page list, so `sectionOf` reads the subview off `navItems` rather
  than trusting it — an early version minted `"settings/resources"`, a section that exists nowhere,
  and the first total record indexed by it (`readinessOf` → `READINESS_META[undefined]`) took the
  titlebar down. A regression test pins that `sectionOf` only ever returns a real section.

**The subpage machinery already existed and had never been used.** `NavItemDef.subpages`,
`NavGroup`'s chevron-expanded list and `RailFlyout`'s collapsed-rail hover flyout were all built
and wired to `openSubview`; nothing in `navItems` declared subpages. This spends it.
- **Clicking a parent goes to its first subpage, not to a bare view.** `setView` clears the
  subview, which renders that subpage anyway but leaves every row in the group unlit —
  `defaultSubpage` keeps the rail and the screen in step. Same rule in `BottomNav`.
- **A destination with subpages is never itself the active row**; one of its subpages always is.
  Lighting both claims two places at once.
- The **breadcrumb contributes two crumbs** for such a destination (`Governance › Administration`).
  "Governance" alone doesn't say whether you're on the review queue or the audit trail.

**Two placements are deliberate.**
- **Triggers sits under Workflows, not beside Runners.** A trigger is `{workflowId, …}` and its
  first column is the workflow. Filing *when* something runs next to *the machines it runs on*
  re-associates the two, which is the habit the no-assignment inversion exists to remove — so the
  table carries a Placement column reading "Chosen at run time" rather than leaving the gap where
  a target goes in the tools this replaces.
- **Schedules and event triggers are one table** with a Kind column. Both answer "what starts this
  workflow"; the only real difference is cadence-vs-event, which is a value in a row rather than a
  page you have to be on. An event has no next run and a schedule has no condition, so those cells
  are an explicit em-dash — a blank reads as a value that failed to load.

**The phone needed a third way in.** Subpages navigate from the rail, which the phone doesn't
mount, and the bottom bar gives a destination one slot that lands on its first subpage — so
Triggers and Issues were briefly *unreachable* on a phone. `SubpageTabs` in `App` renders a
scrolling tab strip on mobile only: the same control Settings already uses for exactly this reason
(its pages navigate from the rail too), so it costs the reader no new vocabulary. The overflow
sheet also lists an overflowed destination's subpages as indented rows, so Governance's Audit is
one tap rather than two.

**Everything is built from the nav table now.** The command palette was a hand-written list of
destinations beside `navItems` and had drifted into naming screens that no longer existed — the
worst possible place for that, since the palette is where you go when you can't find something. It
is generated from `navItems` with the rail's gating, one entry per subpage
("Go to Governance → Audit").

**Manage's two halves went to the two places they belonged.** The front half is Workflows →
Triggers; the back half is Settings → **Resources** (Credentials · Packages · Global values).
Settings dropped Team and Billing, which were placeholders describing what Governance →
Administration already does. `ManageView.tsx` is deleted.

Naming note: `AUDIT_CATEGORIES` includes a `governance` value, so the Audit tab strip shows a
"Governance" tab inside the Governance destination. It reads as a category among Lifecycle,
Execution and Connector rather than a section, so it was left alone — but it is the one echo in
the scheme.
