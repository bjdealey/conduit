-- Scheduled sync via pg_cron + pg_net. Every 15 minutes, invoke the `sync` Edge Function
-- so the domain cache tables stay fresh. The function URL and an invocation bearer are read
-- from Vault at run time, so this migration stores NO secret and no project-specific URL.
--
-- Prerequisites (see supabase/README.md — run once, values never committed):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/sync', 'edge_sync_url');
--   select vault.create_secret('<service-role-key-or-scheduler-jwt>', 'edge_sync_token');
--
-- TODO(supabase): confirm pg_net is enabled on the project and that the Edge Function URL
-- shape matches your project. Adjust the cadence to taste.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent (re)scheduling: drop an existing job with this name first.
select cron.unschedule('conduit-sync-bots')
where exists (select 1 from cron.job where jobname = 'conduit-sync-bots');

select cron.schedule(
  'conduit-sync-bots',
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
