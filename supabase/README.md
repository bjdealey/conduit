# Supabase backend — runbook

The backend for Conduit's integration layer: Postgres (registry + domain cache) with RLS,
Supabase Vault for connector credentials, and Edge Functions (Deno) for orchestration.
Reads are served by PostgREST over the domain tables; the Edge Functions are the write/
orchestration surface.

**Nothing here contains a secret.** Credentials go into Vault and function env at deploy
time, from your machine — never committed. This repo/session never holds your keys.

## What's here

```
supabase/
  config.toml                 # project + per-function config (verify_jwt, import map)
  migrations/
    0001_connector_instances.sql   # instance registry (+ RLS, updated_at trigger)
    0002_bots.sql                  # workflows domain cache (+ RLS: authenticated read)
    0003_vault.sql                 # Vault + service-role-only RPCs (read/write/metadata/delete)
    0004_cron_sync.sql             # pg_cron → sync every 15 min (reads URL+token from Vault)
  functions/
    import_map.json             # maps @conduit/* to the workspace TS + npm:@supabase/supabase-js
    _shared/                    # service client, Vault client, registry loader, auth guard
    connectors/                 # admin CRUD + write-only credential path
    sync/                       # pull → normalise → upsert workflows (cron + on-demand)
    capabilities/               # union of enabled connectors' declared capabilities
    health/                     # per-instance health probes
```

The functions consume the same `packages/*` and `connectors/*` TypeScript the tests use, via
the import map. The connector layer resolves credentials through the `SecretStore` seam;
here it's backed by `SupabaseVaultClient` → the Vault RPCs.

## Quick deploy (one command)

```bash
./supabase/deploy.sh <your-project-ref>
```

`<your-project-ref>` is the ref in your dashboard URL
(`https://supabase.com/dashboard/project/<ref>`). The script logs in, links, pushes the
schema, and deploys all five functions, then prints the frontend env values. Prereqs: the
Supabase CLI and Docker. The steps it runs, if you'd rather do them by hand:

## One-time setup

```bash
# 1. Install the CLI (see supabase.com/docs) and link your project:
supabase link --project-ref <your-project-ref>

# 2. Apply the schema (creates tables, RLS, Vault RPCs, cron):
supabase db push

# 3. Deploy the functions:
supabase functions deploy connectors capabilities health sync

# 4. Point the cron job at your project (values go into Vault, not into git):
#    Run in the SQL editor / psql:
#      select vault.create_secret('https://<your-project-ref>.supabase.co/functions/v1/sync', 'edge_sync_url');
#      select vault.create_secret('<service-role-key>', 'edge_sync_token');
#    (0004_cron_sync.sql reads both from Vault at run time.)
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions automatically —
you do not set them by hand.

## Register a connector (write-only credentials)

Credentials are sent once to the `connectors` function and stored in Vault; they are never
returned by any endpoint.

```bash
curl -X POST https://<ref>.supabase.co/functions/v1/connectors \
  -H "Authorization: Bearer <admin-jwt-or-service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{
        "id": "a360-prod-eu",
        "type": "automation-anywhere",
        "name": "Prod EU Control Room",
        "config": { "controlRoomUrl": "https://prod-eu.my.automationanywhere.digital" },
        "credentials": { "username": "svc-account", "apiKey": "<api-key>" }
      }'
```

Then trigger a sync (or wait for cron), and read normalised workflows via PostgREST:

```bash
curl -X POST https://<ref>.supabase.co/functions/v1/sync -H "Authorization: Bearer <service-role-key>"
curl "https://<ref>.supabase.co/rest/v1/workflows?select=*" -H "Authorization: Bearer <anon-or-user-jwt>" -H "apikey: <anon-key>"
```

`GET /functions/v1/connectors` lists instances with **secret presence + field names only** —
never values.

## Smoke test (after deploy)

Point the frontend at the project and confirm the API answers. Use the **anon** key.

```bash
REF=<your-project-ref>; ANON=<anon-key>
# capabilities: empty [] until a workflows-capable connector is enabled
curl -s "https://$REF.supabase.co/functions/v1/capabilities" -H "Authorization: Bearer $ANON" -H "apikey: $ANON"
# workflows: [] until a connector has synced
curl -s "https://$REF.supabase.co/functions/v1/workflows" -H "Authorization: Bearer $ANON" -H "apikey: $ANON"
```

Then wire the frontend (`.env`, git-ignored) and run it:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

```bash
npm run dev   # Settings → Integrations flips from "Seed data" to "Live · Supabase"
```

### See live data without a real Control Room

A real A360 sync needs live Control Room credentials. To watch the pipeline light up
without one, seed a demo connector + rows directly (Dashboard → SQL editor), then reload
Integrations. The connector needs a `secret_ref` (the A360 connector won't build without
one), so create a throwaway Vault secret for it:

```sql
-- throwaway credential bundle so the connector validates (never actually used here)
select vault.create_secret('{"username":"demo","apiKey":"demo"}', 'connector/demo-eu', 'conduit demo');

-- register the connector (enabled, declares workflows)
insert into public.connector_instances (id, type, name, enabled, config, secret_ref)
values ('demo-eu', 'automation-anywhere', 'Demo EU', true,
        '{"controlRoomUrl":"https://demo"}', 'connector/demo-eu');

-- seed the workflows cache directly (stands in for a real sync)
insert into public.workflows (id, source_id, platform, connector_id, title, state, owner) values
  ('demo-eu:1','1','automation-anywhere','demo-eu','Invoice Workflow','Running','Brad'),
  ('demo-eu:2','2','automation-anywhere','demo-eu','Payment Recon','Idle','Dana');
```

`capabilities` now returns `["workflows"]` (a valid workflows-capable connector is enabled) and
`workflows` returns the two rows. To go real, register an A360 instance with live credentials
via the write-only `POST /functions/v1/connectors` path above and run `sync` (which will
replace these demo rows with real workflows).

## Local development

```bash
supabase start                     # local stack (Docker)
supabase functions serve --env-file supabase/.env   # .env is gitignored; never commit it
```

## Verification status & open items

- The connector/SecretStore/mapping logic is unit-tested in the Node suite (`npm test`),
  including `SupabaseVaultSecretStore` against a fake Vault matching these RPCs' contract.
- The Deno functions and SQL are **not** executed in CI here (no Deno/Postgres-with-Vault in
  the sandbox); they are validated by `supabase db push` / `supabase functions deploy` and
  `deno check supabase/functions/**/*.ts` on your machine.
- **TODO(supabase)** flags in-tree: `pg_net` availability + Edge Function URL shape for cron
  (`0004_cron_sync.sql`); the admin role claim source (`_shared/auth.ts`); stale-workflow pruning
  in `sync`; and the production import-map bundling assumption (the deploy bundler must
  include the workspace TS the import map points to — verify with a first `functions deploy`).
- **TODO(a360)** flags remain from the connector stage (endpoints/field shapes unverified
  against a live Control Room) — see the connector source.

## The runner protocol

`supabase/functions/runner` serves the four messages in `packages/domain/src/protocol.ts`:
`register`, `heartbeat`, `claim`, `ingest`. Runners are **not** `authenticated` users and must
never be given a user JWT — they present a shared secret instead:

```bash
supabase secrets set RUNNER_TOKEN="$(openssl rand -hex 32)"
supabase functions deploy runner
```

A runner then posts to `/functions/v1/runner/<action>` with `x-runner-token`. Ingest is
idempotent on `(run_id, sequence)`, so retrying a batch after a timeout is safe.

**`claim` returns no work today.** Placement is decided by `pickRunner` in the control plane, but
handing a run over needs an atomic claim-once so two runners can't take the same one. Until that
lands, returning "nothing to do" is the honest answer rather than dispatching work nothing
reconciles. Flagged `TODO(runner)` in the function.

`0006` adds `runners` and `run_events` and publishes `run_events` to `supabase_realtime`, which is
what lets the run viewer light up nodes as they happen instead of polling.
