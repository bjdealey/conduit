-- The execution plane's footprint in the control plane: registered runners and the
-- events they report.
--
-- Two tables, because they have opposite lifecycles. A runner row is mutable and
-- short-lived — it registers, heartbeats, and goes quiet. A run event is immutable and
-- append-only: it is the record of what happened, and nothing should ever update one.

create table if not exists public.runners (
  id             text primary key,
  name           text not null,
  runner_class   text not null check (runner_class in ('lightweight','windows-service-account','windows-interactive')),
  platform       text not null check (platform in ('linux','windows','macos')),
  auth_models    text[] not null default '{}',
  headed         boolean not null default false,
  ephemeral      boolean not null default true,
  image          text not null,
  state          text not null default 'idle' check (state in ('starting','idle','busy','draining','offline')),
  current_run_id text,
  runs_completed integer not null default 0,
  -- Absence is information: a runner that stops beating is gone. The pool view reads
  -- staleness from this rather than waiting for a goodbye a killed process never sends.
  last_seen_at   timestamptz not null default now(),
  registered_at  timestamptz not null default now()
);

create index if not exists runners_state_idx on public.runners (state);
create index if not exists runners_last_seen_idx on public.runners (last_seen_at);

comment on table public.runners is
  'Registered execution-plane runners. Rows are written only by the runner protocol functions.';

-- Append-only. `(run_id, sequence)` is the identity, so a retried ingest batch after a
-- timeout is idempotent rather than duplicated — at-least-once delivery is the normal
-- case over a flaky link, not an error path.
create table if not exists public.run_events (
  run_id     text not null,
  sequence   integer not null,
  kind       text not null check (kind in ('started','step-started','step-finished','log','failed','finished')),
  step_id    text,
  message    text not null,
  at         timestamptz not null,
  ingested_at timestamptz not null default now(),
  primary key (run_id, sequence)
);

create index if not exists run_events_run_idx on public.run_events (run_id, sequence);

comment on table public.run_events is
  'Append-only run log reported by runners. Never updated; (run_id, sequence) makes ingest idempotent.';

-- RLS: the frontend reads both (no secrets in either); writes come only from the
-- service-role protocol functions, which bypass RLS.
alter table public.runners enable row level security;
alter table public.run_events enable row level security;

drop policy if exists runners_read on public.runners;
create policy runners_read on public.runners for select to authenticated using (true);

drop policy if exists run_events_read on public.run_events;
create policy run_events_read on public.run_events for select to authenticated using (true);

-- Realtime: the run viewer subscribes to inserts so nodes light up as they happen,
-- rather than polling a table that is quiet most of the time.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.run_events;
  end if;
exception
  when duplicate_object then null;
end $$;
