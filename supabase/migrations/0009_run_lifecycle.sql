-- The rest of a run's life: queued, and finished.
--
-- 0008 built the middle — `app_claim_run` hands a queued run to a runner exactly once
-- — but nothing put a run into the queue and nothing ever took it out. A run therefore
-- sat in `running` forever, `attempts` could never exceed 1, and the queue only grew.
-- This closes both ends.

/*
 * Queue a run.
 *
 * The flow is *snapshotted* here, not resolved at claim time: a workflow edited while
 * its run is queued must not change what that run executes. The version is stamped for
 * the same reason — "the latest" may carry no approval.
 *
 * `requirements` arrives from the caller because deriving it means reading the node
 * catalogue, which is the control plane's job (`effectiveRequirements` in the app, and
 * the floor it raises the declared value to). What this function guarantees is that
 * whatever was decided is frozen onto the row.
 */
create or replace function public.app_enqueue_run(
  p_run_id           text,
  p_workflow_id      text,
  p_workflow_version integer,
  p_requirements     jsonb,
  p_schema_version   integer,
  p_steps            jsonb
)
returns public.runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.runs;
begin
  insert into public.runs (id, workflow_id, workflow_version, state, requirements, schema_version, steps)
  values (p_run_id, p_workflow_id, p_workflow_version, 'queued', p_requirements, p_schema_version, p_steps)
  returning * into v_run;
  return v_run;
end;
$$;

revoke all on function public.app_enqueue_run(text, text, integer, jsonb, integer, jsonb) from public;
grant execute on function public.app_enqueue_run(text, text, integer, jsonb, integer, jsonb) to service_role;

comment on function public.app_enqueue_run(text, text, integer, jsonb, integer, jsonb) is
  'Queue a run with its flow snapshotted. Service-role only.';

/*
 * Finish a run, and free the runner that was carrying it.
 *
 * Called when a *terminal event* is ingested rather than from a separate "I am done"
 * call, because a runner that posts its last event and then dies would otherwise leave
 * a run that visibly completed sitting in `running` forever. The log is the source of
 * truth about the run's outcome; this reads it.
 *
 * Both halves happen together on purpose: releasing the runner without recording the
 * outcome, or vice versa, leaves the pool lying about itself.
 */
create or replace function public.app_finish_run(p_run_id text, p_state text)
returns public.runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.runs;
begin
  if p_state not in ('completed', 'failed') then
    raise exception 'run state % is not terminal', p_state using errcode = 'check_violation';
  end if;

  update public.runs
     set state       = p_state,
         finished_at = now()
   where id = p_run_id
     -- Terminal is terminal: a late duplicate of the last event must not reopen a run
     -- or move it from completed to failed.
     and state not in ('completed', 'failed')
  returning * into v_run;

  if v_run.id is null then
    return null;
  end if;

  update public.runners
     set state          = 'idle',
         current_run_id = null,
         runs_completed = runs_completed + 1,
         last_seen_at   = now()
   where id = v_run.runner_id;

  return v_run;
end;
$$;

revoke all on function public.app_finish_run(text, text) from public;
grant execute on function public.app_finish_run(text, text) to service_role;

comment on function public.app_finish_run(text, text) is
  'Record a run''s outcome and free its runner. Idempotent: a finished run stays finished.';

/*
 * Requeue runs whose runner went away.
 *
 * An ephemeral runner can be reclaimed mid-run — that is the model, not an incident —
 * and the run it was carrying has to come back to the queue rather than being lost.
 * `attempts` already counts hand-outs and `app_claim_run` already refuses anything past
 * the ceiling, so a run that keeps killing its runner surfaces as exhausted instead of
 * cycling forever.
 *
 * Staleness is measured from the runner's heartbeat, not from the run's age: a long run
 * is not a stuck run, and evicting on duration would kill exactly the workloads that
 * most need finishing.
 */
create or replace function public.app_requeue_abandoned_runs(p_stale_seconds integer default 60)
returns setof public.runs
language sql
security definer
set search_path = public
as $$
  update public.runs r
     set state     = 'queued',
         runner_id = null
   where r.state = 'running'
     and r.runner_id is not null
     and exists (
       select 1 from public.runners n
        where n.id = r.runner_id
          and n.last_seen_at < now() - make_interval(secs => p_stale_seconds)
     )
  returning r.*;
$$;

revoke all on function public.app_requeue_abandoned_runs(integer) from public;
grant execute on function public.app_requeue_abandoned_runs(integer) to service_role;

comment on function public.app_requeue_abandoned_runs(integer) is
  'Return runs whose runner stopped heartbeating to the queue. Service-role only.';

-- Every minute, because a run stuck behind a dead runner is capacity nobody is using.
-- 60s is three missed 15s heartbeats — the same tolerance `isStale` applies in
-- packages/domain/src/protocol.ts, and the two should move together.
select cron.unschedule('conduit-requeue-abandoned')
where exists (select 1 from cron.job where jobname = 'conduit-requeue-abandoned');

select cron.schedule(
  'conduit-requeue-abandoned',
  '* * * * *',
  $cron$ select public.app_requeue_abandoned_runs(60); $cron$
);
