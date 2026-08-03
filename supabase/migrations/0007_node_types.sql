-- The node-type catalogue.
--
-- The vision's claim is that "new node types appear in the builder by adding
-- metadata, not by rewriting the canvas". Until now the palette was a hardcoded array
-- in the frontend bundle, so a new node type meant a frontend edit and a redeploy —
-- which is the one place the app contradicted its own extensibility story, while the
-- connector layer next door did it correctly.
--
-- A row here is a node type. Adding one is an insert.

create table if not exists public.node_types (
  id           text primary key,          -- e.g. "http.request"
  label        text not null,
  package      text not null,             -- matches Workflow.packages and Manage → Packages
  summary      text not null,
  -- The per-step form the builder renders: [{ id, label, kind, options?, placeholder?, value? }]
  fields       jsonb not null default '[]',
  -- What this node needs from a runner, so requirements stay derivable from content:
  -- { auth?, ui?, platform? }. Null means it adds no requirement of its own.
  requires     jsonb,
  -- Surfaces the node in the palette but marks it unbuilt. AI nodes ship this way:
  -- the point is proving the interface holds, not shipping the feature.
  readiness    text not null default 'live' check (readiness in ('live','roadmap')),
  sort_order   integer not null default 100,
  enabled      boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists node_types_package_idx on public.node_types (package);

comment on table public.node_types is
  'The builder palette. A new node type is a row, not a frontend redeploy.';

-- RLS: the catalogue is not secret — it is the menu. Authenticated users read it;
-- writes go through the service role.
alter table public.node_types enable row level security;

drop policy if exists node_types_read on public.node_types;
create policy node_types_read on public.node_types for select to authenticated using (true);
