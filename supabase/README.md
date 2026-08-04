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
    0005_rename_bots_to_workflows.sql  # one word for the central object
    0006_runners_and_run_events.sql    # the execution plane's footprint + Realtime
    0007_node_types.sql            # the builder palette, as rows
    0008_runs_and_claim.sql        # runs + app_claim_run (atomic hand-out)
    0009_run_lifecycle.sql         # app_enqueue_run / app_finish_run / requeue-abandoned cron
  functions/
    import_map.json             # maps @conduit/* to the workspace TS + npm:@supabase/supabase-js
    _shared/                    # service client, Vault client, registry loader, auth guard
    connectors/                 # admin CRUD + write-only credential path
    sync/                       # pull → normalise → upsert workflows (cron + on-demand)
    capabilities/               # union of enabled connectors' declared capabilities
    health/                     # per-instance health probes
    workflows/                  # service-role read of the workflows cache (domain models)
    node-types/                 # the builder palette (ACTIONS is the fallback)
    runner/                     # the runner protocol: register · heartbeat · claim · ingest
    runs/                       # trigger a run (POST) and read one (GET)
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
  in `sync`; the trigger gate on `runs` (admin-or-service today, the `trigger` permission once Auth
  is wired); and the production import-map bundling assumption (the deploy bundler must
  include the workspace TS the import map points to — verify with a first `functions deploy`).
- ⚠️ **What "not executed in CI here" costs.** `runner/index.ts` shipped importing a
  `methodNotAllowed` that did not exist and calling `json(body, status)` with the arguments
  reversed — it could never have booted. Both were found and fixed while wiring the run loop.
  Run `deno check supabase/functions/**/*.ts` before every deploy; nothing else in this repo
  will catch it.
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

**`claim` is atomic.** `0008` adds `runs` and `app_claim_run`, which hands out one queued run
inside a single statement holding a row lock (`for update skip locked`). Concurrent claimers skip
past a locked candidate rather than blocking or — far worse — both reading the same row and
proceeding. Two runners polling a second apart cannot execute the same workflow twice.

The eligibility test is stated **twice**: in `app_claim_run` and in `claimableBy` in
`packages/domain/src/dispatch.ts`. The TypeScript half is under test; if they diverge, a run gets
claimed by a runner the placement rules would never have chosen. Change them together.

**`drain` is recomputed per heartbeat** from the current pool and queue via `scalePlan`, rather
than stored per runner — a stored flag goes stale the moment demand changes, and a runner told to
wind down during a spike is exactly the wrong answer.

`0006` adds `runners` and `run_events` and publishes `run_events` to `supabase_realtime`, which is
what lets the run viewer light up nodes as they happen instead of polling.

### Queuing and finishing a run

`0008` built the middle of a run's life; `0009` builds both ends, because until it a run could
never be queued and never stopped being `running`.

- **`POST /functions/v1/runs`** queues one, with the flow *snapshotted* onto the row — a workflow
  edited while its run waits must not change what that run executes. It is guarded by
  `requireAdminOrService` (triggering runs work on your infrastructure). TODO(supabase): once
  Supabase Auth is wired, this becomes the `trigger` permission from `packages/domain/src/review.ts`,
  which is the whole point of the consumer tier. Nothing in the request names a runner — placement
  is the claim's decision, and the response's `placement` is explicitly a *proposal*.
- **`app_finish_run`** is called from `ingest` when a terminal event arrives, not by a separate call
  from the runner: a runner that posts its last event and then dies leaves a visibly completed run
  stuck in `running` otherwise. It is idempotent — terminal is terminal.
- **`app_requeue_abandoned_runs`** (cron, every minute) returns runs whose runner stopped
  heartbeating to the queue, measuring staleness from the heartbeat rather than the run's age: a
  long run is not a stuck run. `attempts` already caps the cycle.

```bash
# queue a run (service-role key, or an admin JWT)
curl -X POST "https://$REF.supabase.co/functions/v1/runs" \
  -H "Authorization: Bearer <service-role-key>" -H "Content-Type: application/json" \
  -d '{"workflowId":"wf_invoice_check","workflowVersion":1,"schemaVersion":2,
       "requirements":{"auth":"api-key","ui":"none","platform":"any"},
       "steps":[{"kind":"action","id":"stp_1","actionId":"http.request",
                 "config":{"method":"GET","url":"https://api.example.com/invoices"}}]}'
```

### Running a runner against this project

The execution plane lives in `runner/` (see its README). Pointed at a deployed project it
registers, claims, executes and posts its log back:

```bash
export CONDUIT_CONTROL_PLANE_URL="https://$REF.supabase.co/functions/v1/runner"
export CONDUIT_RUNNER_TOKEN="<the RUNNER_TOKEN you set above>"
export CONDUIT_ENV_API_TOKEN="<a credential workflows may use as {{ env.API_TOKEN }}>"
node runner/src/cli.ts serve
```

Workflow-visible values are `CONDUIT_ENV_*` only — never the whole environment, which is where the
runner's own token lives.
