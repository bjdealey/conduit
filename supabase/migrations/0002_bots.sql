-- Domain cache table for the `bots` capability. The `sync` Edge Function normalises
-- vendor payloads into these rows; the frontend reads them via PostgREST. Columns are
-- snake_case; the read layer maps them to the camelCase `Bot` DTO. `id` is the
-- namespaced domain id `${connector_id}:${source_id}` so two Control Rooms never collide.

create table if not exists public.bots (
  id           text primary key,
  source_id    text not null,
  platform     text not null,
  connector_id text not null references public.connector_instances(id) on delete cascade,
  title        text not null,
  state        text not null,
  owner        text not null,
  synced_at    timestamptz not null default now()
);

create index if not exists bots_connector_id_idx on public.bots (connector_id);
create index if not exists bots_platform_idx on public.bots (platform);

comment on table public.bots is
  'Normalised domain cache for the bots capability, populated by the sync Edge Function.';

-- RLS: authenticated users may read the domain cache (no secrets here). Writes happen
-- only from the service-role `sync` function, which bypasses RLS.
alter table public.bots enable row level security;

drop policy if exists bots_read on public.bots;
create policy bots_read
  on public.bots
  for select
  to authenticated
  using (true);
