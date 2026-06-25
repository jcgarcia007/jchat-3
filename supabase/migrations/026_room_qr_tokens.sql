-- ============================================================
-- JChat 3.0 — QR access tokens for rooms (migration 026)
--
-- Adds opaque per-room QR tokens and two RPCs:
--   resolve_room_qr(token)   — public preview (anon + authenticated)
--   join_room_via_qr(token)  — creates 24h membership (authenticated only)
--
-- Design:
--   Token format: {biz-slug}-{main|sub}-{8 hex chars}   (e.g. bar-xzx-main-a8f3c2b1)
--   QR access = 24h membership, same as verify_room_password.
--   Sub-room QR grants membership in sub-room AND its parent_room_id.
--   QR skips password check (QR is proof of physical presence).
--
-- NOT touched: verify_room_password, can_access_room, room_members schema.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION 1 — qr_token column + auto-generation
-- ────────────────────────────────────────────────────────────

alter table public.rooms
  add column if not exists qr_token text unique;

-- Helper: generates a unique opaque token for a room.
-- Called by both the backfill DO block and the BEFORE INSERT trigger.
create or replace function public.generate_room_qr_token(
  _business_id uuid,
  _is_sub_room boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  _raw_slug  text;
  _slug      text;
  _room_type text;
  _token     text;
begin
  select lower(regexp_replace(b.name, '[^a-zA-Z0-9]+', '-', 'g'))
  into _raw_slug
  from public.businesses b where b.id = _business_id;

  _slug      := coalesce(
                  nullif(trim(both '-' from left(coalesce(_raw_slug, ''), 16)), ''),
                  'room'
                );
  _room_type := case when _is_sub_room then 'sub' else 'main' end;

  -- Loop until unique (collision probability negligible with 8 hex chars,
  -- but the loop makes it safe for large deployments).
  loop
    _token := _slug || '-' || _room_type || '-'
              || left(replace(gen_random_uuid()::text, '-', ''), 8);
    exit when not exists (
      select 1 from public.rooms where qr_token = _token
    );
  end loop;

  return _token;
end;
$$;

-- Backfill: assign tokens to all existing rooms that have qr_token IS NULL.
do $$
declare
  _r record;
begin
  for _r in
    select id, business_id, parent_room_id
    from public.rooms
    where qr_token is null
  loop
    update public.rooms
    set    qr_token = public.generate_room_qr_token(
                        _r.business_id,
                        _r.parent_room_id is not null
                      )
    where  id = _r.id;
  end loop;
end;
$$;

-- Trigger: auto-assign qr_token on INSERT when caller leaves it null.
create or replace function public.trg_fn_assign_room_qr_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.qr_token is null then
    new.qr_token := public.generate_room_qr_token(
                      new.business_id,
                      new.parent_room_id is not null
                    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_room_qr_token on public.rooms;
create trigger trg_assign_room_qr_token
  before insert on public.rooms
  for each row
  execute function public.trg_fn_assign_room_qr_token();

-- ────────────────────────────────────────────────────────────
-- SECTION 2 — resolve_room_qr(token): public preview RPC
-- ────────────────────────────────────────────────────────────
-- Callable by anon so a user can see "you are joining Bar XZX — Main Room"
-- BEFORE being asked to log in. Does NOT expose password_hash or UUIDs
-- beyond what is needed for navigation.

create or replace function public.resolve_room_qr(token text)
returns table(
  room_id        uuid,
  parent_room_id uuid,
  business_id    uuid,
  business_name  text,
  room_name      text,
  is_sub_room    boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id                            as room_id,
    r.parent_room_id                as parent_room_id,
    r.business_id                   as business_id,
    b.name                          as business_name,
    r.name                          as room_name,
    (r.parent_room_id is not null)  as is_sub_room
  from public.rooms r
  join public.businesses b on b.id = r.business_id
  where r.qr_token = token
    and r.is_active = true;
$$;

grant execute on function public.resolve_room_qr(text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- SECTION 3 — join_room_via_qr(token): membership RPC
-- ────────────────────────────────────────────────────────────
-- Requires a live session (auth.uid() not null).
-- Creates/renews 24h membership — identical pattern to verify_room_password.
-- QR bypasses password: is_password_protected is intentionally NOT checked.
-- Sub-room QR also grants membership in the parent (parent_room_id).

create or replace function public.join_room_via_qr(token text)
returns table(room_id uuid, parent_room_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  _room_id        uuid;
  _parent_room_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  -- Resolve token → room (active rooms only)
  select r.id, r.parent_room_id
  into   _room_id, _parent_room_id
  from   public.rooms r
  where  r.qr_token = token
    and  r.is_active = true;

  if _room_id is null then
    raise exception 'invalid_qr';
  end if;

  -- Membership 24h in this room (skips password even if is_password_protected = true)
  insert into public.room_members (room_id, user_id, expires_at)
    values (_room_id, auth.uid(), now() + interval '24 hours')
  on conflict on constraint room_members_pkey
    do update set expires_at = now() + interval '24 hours';

  -- If sub-room: also grant 24h membership in the parent room
  if _parent_room_id is not null then
    insert into public.room_members (room_id, user_id, expires_at)
      values (_parent_room_id, auth.uid(), now() + interval '24 hours')
    on conflict on constraint room_members_pkey
      do update set expires_at = now() + interval '24 hours';
  end if;

  return query select _room_id, _parent_room_id;
end;
$$;

grant execute on function public.join_room_via_qr(text) to authenticated;
