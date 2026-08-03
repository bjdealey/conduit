-- Runs, and handing one to a runner exactly once.
--
-- Two runners polling a second apart both see the same queued run. If both take it,
-- the workflow executes twice — which for a payment reconciliation or an email
-- dispatch is not a degraded experience but a real-world incident. So the claim is a
-- single statement holding a row lock, not a read followed by a write.

create table if not exists public.runs (
  id               text primary key,
  workflow_id      text not null,
  -- The exact version to execute. Never "latest": the latest may carry no approval.
  workflow_version integer not null,
  state            text not null default 'queued'
                     check (state in ('queued','running','completed','failed','abandoned')),
  -- What the flow needs, so the claim can match without joining the workflow.
  requirements     jsonb not null,
  -- The flow as it was when queued, in the schema version stated. Snapshotted rather
  -- than resolved at claim time: a workflow edited mid-queue must not change what an
  -- already-queued run executes.
  schema_version   integer not null default 1,
  steps            jsonb not null default '[]',
  runner_id        text references public.runners (id) on delete set null,
  attempts         integer not null default 0,
  queued_at        timestamptz not null default now(),
  claimed_at       timestamptz,
  finished_at      timestamptz
);

create index if not exists runs_queue_idx on public.runs (state, queued_at) where state = 'queued';
create index if not exists runs_runner_idx on public.runs (runner_id);

comment on table public.runs is
  'Run records. Queued rows are the dispatch queue; app_claim_run hands one out atomically.';

alter table public.runs enable row level security;
drop policy if exists runs_read on public.runs;
create policy runs_read on public.runs for select to authenticated using (true);

-- How many times a run may be handed out before it stops being offered. Mirrors
-- MAX_ATTEMPTS in packages/domain/src/dispatch.ts — the two must move together.
create or replace function public.app_max_attempts() returns integer
  language sql immutable as $$ select 3 $$;

/*
 * Claim one queued run for a runner, atomically.
 *
 * `for update skip locked` is the whole point: concurrent claimers take a row lock on
 * the candidate and anyone who can't get it skips straight past to the next, rather
 * than blocking or — far worse — reading the same row and both proceeding.
 *
 * The eligibility test mirrors `runnerFits` in packages/domain: a runner may take work
 * below its class but never above it, must be able to present the required auth model,
 * must be Windows if the work is, and must be headed if the work drives a UI. Stated
 * twice, in SQL and TypeScript, with the TypeScript half under test — if they ever
 * diverge, a run gets claimed by a runner the placement rules would never have chosen.
 */
create or replace function public.app_claim_run(p_runner_id text)
returns setof public.runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_runner public.runners%rowtype;
  v_rank   integer;
begin
  select * into v_runner from public.runners where id = p_runner_id;
  if not found then
    raise exception 'unknown runner %', p_runner_id using errcode = 'no_data_found';
  end if;

  -- A busy or draining runner asking for work is a bug in the runner, not an
  -- invitation to give it more.
  if v_runner.state not in ('idle', 'starting') then
    return;
  end if;

  v_rank := case v_runner.runner_class
              when 'lightweight' then 0
              when 'windows-service-account' then 1
              when 'windows-interactive' then 2
            end;

  return query
  update public.runs r
     set state      = 'running',
         runner_id  = p_runner_id,
         attempts   = r.attempts + 1,
         claimed_at = now()
   where r.id = (
     select c.id
       from public.runs c
      where c.state = 'queued'
        and c.attempts < public.app_max_attempts()
        -- Required class rank, from the same rules as requiredRunnerClass().
        and v_rank >= case
              when c.requirements ->> 'ui' = 'headed' then 2
              when c.requirements ->> 'auth' = 'windows-integrated' then 1
              when c.requirements ->> 'platform' = 'windows' then 1
              else 0
            end
        and (c.requirements ->> 'ui' is distinct from 'headed' or v_runner.headed)
        and (c.requirements ->> 'platform' is distinct from 'windows' or v_runner.platform = 'windows')
        and (c.requirements ->> 'auth') = any (v_runner.auth_models)
      -- Oldest first, so nothing starves; id breaks ties reproducibly.
      order by c.queued_at, c.id
      for update skip locked
      limit 1
   )
  returning r.*;
end;
$$;

revoke all on function public.app_claim_run(text) from public;
grant execute on function public.app_claim_run(text) to service_role;

comment on function public.app_claim_run(text) is
  'Atomically hand one eligible queued run to a runner. Service-role only.';
