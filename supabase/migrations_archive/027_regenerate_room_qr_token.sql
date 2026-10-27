-- ============================================================
-- JChat 3.0 — Renew room QR token (migration 027)
--
-- Adds a single owner-only RPC:
--   regenerate_room_qr_token(_room_id uuid) RETURNS text
--
-- Design:
--   • Only the business owner (businesses.owner_id) may call this.
--     TODO: extend to super_admin (users.role = 'super_admin') when
--     the super-admin management UI for QR codes is built.
--   • Generates a new unique token by reusing generate_room_qr_token()
--     from migration 026 — same format, same anti-collision loop.
--   • UPDATE rooms.qr_token → new token; old token stops resolving
--     immediately (resolve_room_qr / join_room_via_qr look up by token).
--   • Existing room_members rows are NOT deleted — members who joined
--     via the old QR keep their session until their 24h expires.
--
-- NOT touched: columns, other functions, triggers, or membership rows.
-- ============================================================

create or replace function public.regenerate_room_qr_token(
  _room_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  _business_id    uuid;
  _parent_room_id uuid;
  _owner_id       uuid;
  _new_token      text;
begin
  -- Require a live session
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  -- Resolve room → business + parent
  select r.business_id, r.parent_room_id
  into   _business_id, _parent_room_id
  from   public.rooms r
  where  r.id = _room_id;

  if _business_id is null then
    raise exception 'room_not_found';
  end if;

  -- Verify caller is the business owner
  select b.owner_id
  into   _owner_id
  from   public.businesses b
  where  b.id = _business_id;

  if _owner_id is distinct from auth.uid() then
    raise exception 'not_authorized';
  end if;

  -- Generate a fresh unique token (reuses 026 helper — same format + anti-collision)
  _new_token := public.generate_room_qr_token(
                  _business_id,
                  _parent_room_id is not null
                );

  -- Rotate: old token stops working the moment this UPDATE commits
  update public.rooms
  set    qr_token = _new_token
  where  id = _room_id;

  return _new_token;
end;
$$;

grant execute on function public.regenerate_room_qr_token(uuid) to authenticated;
