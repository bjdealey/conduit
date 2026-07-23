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
