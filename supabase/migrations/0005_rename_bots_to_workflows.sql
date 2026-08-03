-- Rename the `bots` domain cache to `workflows`.
--
-- The platform settled on one word for its central object: a workflow. `bot` was the
-- incumbent Control Room's word for the thing Conduit replaces, so carrying it in our
-- own schema was the last place the old vocabulary survived.
--
-- This is a forward migration rather than an edit to 0002, because 0002 may already
-- have been applied. Renaming a table carries its indexes, constraints and policies
-- with it, so nothing below re-creates them — only the names that embed the old word
-- are corrected.

alter table if exists public.bots rename to workflows;

alter index if exists public.bots_connector_id_idx rename to workflows_connector_id_idx;
alter index if exists public.bots_platform_idx rename to workflows_platform_idx;

comment on table public.workflows is
  'Normalised domain cache for the workflows capability, populated by the sync Edge Function.';

-- The read policy travels with the table but keeps its old name; recreate it so an
-- operator listing policies sees the current vocabulary. Same rule as 0002: reads for
-- authenticated users, writes only from the service-role sync function.
drop policy if exists bots_read on public.workflows;
drop policy if exists workflows_read on public.workflows;
create policy workflows_read
  on public.workflows
  for select
  to authenticated
  using (true);

-- The scheduled sync job carries the old word in its name. Unschedule the old job
-- before scheduling the renamed one, or a database that already ran 0004 ends up with
-- two jobs posting to the same function every 15 minutes. Secret names match 0004.
select cron.unschedule('conduit-sync-bots')
where exists (select 1 from cron.job where jobname = 'conduit-sync-bots');

select cron.unschedule('conduit-sync-workflows')
where exists (select 1 from cron.job where jobname = 'conduit-sync-workflows');

select cron.schedule(
  'conduit-sync-workflows',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_sync_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_sync_token')
      ),
      body    := '{}'::jsonb
    );
  $cron$
);
