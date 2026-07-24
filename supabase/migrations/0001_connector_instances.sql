-- Connector instance registry: one row per configured connector instance. This is the
-- data-driven registration surface — adding/enabling/disabling/removing a connector is a
-- row mutation, no redeploy. `config` is non-secret; `secret_ref` is a Vault pointer only,
-- never a secret value.

create table if not exists public.connector_instances (
  id          text primary key,
  type        text not null,
  name        text not null,
  enabled     boolean not null default true,
  config      jsonb not null default '{}'::jsonb,
  secret_ref  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.connector_instances is
  'Configured connector instances. config is non-secret; secret_ref points into Vault.';

-- Keep updated_at fresh.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists connector_instances_updated_at on public.connector_instances;
create trigger connector_instances_updated_at
  before update on public.connector_instances
  for each row execute function public.set_updated_at();

-- RLS: authenticated users may read the instance list (non-secret metadata + the
-- secret_ref pointer). All writes go through the service-role `connectors` Edge Function,
-- which bypasses RLS — so no INSERT/UPDATE/DELETE policy is granted to anon/authenticated.
alter table public.connector_instances enable row level security;

drop policy if exists connector_instances_read on public.connector_instances;
create policy connector_instances_read
  on public.connector_instances
  for select
  to authenticated
  using (true);
