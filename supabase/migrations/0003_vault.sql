-- Supabase Vault access, wrapped in SECURITY DEFINER RPCs so the Edge Functions (service
-- role) are the ONLY callers that can touch secrets. The `anon`/`authenticated` roles and
-- PostgREST can never read `vault.decrypted_secrets`.
--
-- A connector credential bundle (e.g. { username, apiKey }) is stored as a single JSON
-- Vault secret named by the connector's `secret_ref`. The read path returns the JSON; the
-- metadata path returns field NAMES and presence only — never values.

create extension if not exists supabase_vault with schema vault;

-- Write / replace a bundle.
create or replace function public.app_vault_write(p_ref text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = p_ref;
  if v_id is null then
    perform vault.create_secret(p_payload::text, p_ref, 'conduit connector credentials');
  else
    perform vault.update_secret(v_id, p_payload::text, p_ref, 'conduit connector credentials');
  end if;
end;
$$;

-- Resolve a bundle (server-side only).
create or replace function public.app_vault_read(p_ref text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret::jsonb
  from vault.decrypted_secrets
  where name = p_ref;
$$;

-- Metadata: presence + field names + updated_at. Never returns values.
create or replace function public.app_vault_metadata(p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated timestamptz;
  v_payload jsonb;
  v_keys jsonb;
begin
  select updated_at into v_updated from vault.secrets where name = p_ref;
  if not found then
    return jsonb_build_object('present', false, 'keys', '[]'::jsonb);
  end if;
  select decrypted_secret::jsonb into v_payload from vault.decrypted_secrets where name = p_ref;
  select coalesce(jsonb_agg(k), '[]'::jsonb) into v_keys from jsonb_object_keys(v_payload) as k;
  return jsonb_build_object('present', true, 'keys', v_keys, 'updatedAt', v_updated);
end;
$$;

-- Delete a bundle.
create or replace function public.app_vault_delete(p_ref text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = p_ref;
  if v_id is not null then
    delete from vault.secrets where id = v_id;
  end if;
end;
$$;

-- Lock the RPCs down to the service role only. This is the enforcement point for
-- "the anon role and PostgREST never see secrets".
revoke all on function public.app_vault_write(text, jsonb) from public;
revoke all on function public.app_vault_read(text) from public;
revoke all on function public.app_vault_metadata(text) from public;
revoke all on function public.app_vault_delete(text) from public;

grant execute on function public.app_vault_write(text, jsonb) to service_role;
grant execute on function public.app_vault_read(text) to service_role;
grant execute on function public.app_vault_metadata(text) to service_role;
grant execute on function public.app_vault_delete(text) to service_role;
