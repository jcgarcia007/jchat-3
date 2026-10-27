-- 073: per-table QR token + optional per-table subchat room (Mesas/Taps B5).
--
-- Every table gets an opaque qr_token (same scheme as rooms, migration 026):
--   {biz-slug}-table-{8 hex}. A table MAY link a sub-room (rooms.parent_room_id
--   = the business main room) via tables.room_id.
--
-- anon has ZERO grants on tables (069), so the public QR page can't read tables
-- directly — it goes through resolve_table_qr() (SECURITY DEFINER, anon-callable)
-- which exposes ONLY {label, business slug, room qr token}. tables.qr_token and
-- tables.room_id are NOT client-writable: qr_token is trigger-generated, and
-- room_id is set only by set_table_subchat() (owner-only RPC).

begin;

-- ── token generator (mirrors 026 generate_room_qr_token, 'table' type) ───────
create or replace function public.generate_table_qr_token(_business_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  _raw_slug text;
  _slug     text;
  _token    text;
begin
  select lower(regexp_replace(b.name, '[^a-zA-Z0-9]+', '-', 'g'))
  into _raw_slug from public.businesses b where b.id = _business_id;
  _slug := coalesce(nullif(trim(both '-' from left(coalesce(_raw_slug, ''), 16)), ''), 'table');
  loop
    _token := _slug || '-table-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
    exit when not exists (select 1 from public.tables where qr_token = _token);
  end loop;
  return _token;
end $$;
revoke execute on function public.generate_table_qr_token(uuid) from public, anon;

-- ── columns ──────────────────────────────────────────────────────────────────
alter table public.tables add column if not exists qr_token text;
alter table public.tables add column if not exists room_id uuid references public.rooms(id) on delete set null;

-- backfill existing rows before NOT NULL
do $$
declare r record;
begin
  for r in select id, business_id from public.tables where qr_token is null loop
    update public.tables set qr_token = public.generate_table_qr_token(r.business_id) where id = r.id;
  end loop;
end $$;

alter table public.tables alter column qr_token set not null;
create unique index if not exists uq_tables_qr_token on public.tables (qr_token);

-- auto-assign qr_token on INSERT when the caller leaves it null (clients can't
-- write it — the 069 insert allow-list excludes qr_token — so this always fills).
create or replace function public.trg_fn_assign_table_qr_token()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.qr_token is null then
    new.qr_token := public.generate_table_qr_token(new.business_id);
  end if;
  return new;
end $$;
revoke execute on function public.trg_fn_assign_table_qr_token() from public, anon;

drop trigger if exists trg_assign_table_qr_token on public.tables;
create trigger trg_assign_table_qr_token
  before insert on public.tables
  for each row execute function public.trg_fn_assign_table_qr_token();

-- ── resolve_table_qr: public QR resolver (anon can call) ─────────────────────
-- Exposes ONLY what the public page needs. Sub-room token is returned only when
-- the linked room is still active (an inactive room shouldn't grant membership).
create or replace function public.resolve_table_qr(p_token text)
returns table (table_label text, business_slug text, room_qr_token text)
language sql stable security definer set search_path = '' as $$
  select t.label, b.slug, r.qr_token
  from public.tables t
  join public.businesses b on b.id = t.business_id
  left join public.rooms r on r.id = t.room_id and r.is_active = true
  where t.qr_token = p_token and t.is_active = true;
$$;
revoke execute on function public.resolve_table_qr(text) from public;
grant execute on function public.resolve_table_qr(text) to anon, authenticated;

-- ── set_table_subchat: owner-only create+link / unlink+deactivate ────────────
-- room_id isn't client-writable, so linking happens here. Enabling creates a
-- sub-room under the business main room and links it. Disabling deactivates the
-- room (never deleted — it may hold messages) and clears the link. Returns the
-- resulting room_id (null when disabled).
create or replace function public.set_table_subchat(p_table_id uuid, p_enable boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_biz   uuid;
  v_room  uuid;
  v_main  uuid;
  v_label text;
begin
  select business_id, room_id, label into v_biz, v_room, v_label
  from public.tables where id = p_table_id;
  if v_biz is null then raise exception 'TABLE_NOT_FOUND'; end if;

  if not (public.owns_business_of_table(p_table_id) or public.is_platform_admin()) then
    raise exception 'NOT_ALLOWED';
  end if;

  if p_enable then
    if v_room is not null then return v_room; end if; -- already has a subchat
    select id into v_main from public.rooms
    where business_id = v_biz and is_main = true and is_active = true
    limit 1;
    if v_main is null then raise exception 'NO_MAIN_ROOM'; end if;

    insert into public.rooms (business_id, name, parent_room_id, is_main, is_active)
    values (v_biz, 'Mesa ' || v_label, v_main, false, true)
    returning id into v_room;

    update public.tables set room_id = v_room where id = p_table_id;
    return v_room;
  else
    if v_room is not null then
      update public.rooms set is_active = false where id = v_room;
      update public.tables set room_id = null where id = p_table_id;
    end if;
    return null;
  end if;
end $$;
revoke execute on function public.set_table_subchat(uuid, boolean) from public, anon;
grant execute on function public.set_table_subchat(uuid, boolean) to authenticated;

commit;
