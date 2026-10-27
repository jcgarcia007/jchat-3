-- 235 — check-in decided by the SERVER. Until now the client inserted into check_ins after its own radius / 24 h checks
-- (both bypassable: the RLS policy only asked for auth.uid() = user_id). Now:
--   * check_in(p_business_id) is the only way in: it needs the person to be physically at the venue (venue_presence_ok —
--     no client coordinates are trusted), excludes the owner, and allows one check-in per venue per 24 h (advisory lock per
--     (user, venue) so two taps cannot both pass);
--   * the INSERT policy on check_ins is `with check (false)`: nobody inserts directly any more.
-- Returns (ok, reason, check_in_id, visit_count). reason: checked_in | auth_required | invalid_business |
-- business_inactive | owner | not_present | already_checked_in_24h.
-- Aplicada por Planning el 2026-10-14 vía MCP (mirrored here; NOT applied from the repo).

create or replace function public.check_in(p_business_id uuid)
 returns table(ok boolean, reason text, check_in_id uuid, visit_count integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_active boolean;
  v_id uuid;
  v_count integer;
begin
  if v_uid is null then
    return query select false, 'auth_required', null::uuid, null::integer; return;
  end if;
  select b.owner_id, b.is_active into v_owner, v_active from public.businesses b where b.id = p_business_id;
  if v_owner is null then
    return query select false, 'invalid_business', null::uuid, null::integer; return;
  end if;
  if not coalesce(v_active, false) then
    return query select false, 'business_inactive', null::uuid, null::integer; return;
  end if;
  if v_owner = v_uid then
    return query select false, 'owner', null::uuid, null::integer; return;
  end if;
  -- Golden rule: physically at the venue, proven by the server (no client coordinates are trusted here).
  if not public.venue_presence_ok(p_business_id, v_uid) then
    return query select false, 'not_present', null::uuid, null::integer; return;
  end if;
  -- One check-in per venue per 24 h, serialised per (user, venue) so two taps cannot both pass.
  perform pg_advisory_xact_lock(hashtext('check_in:' || v_uid::text || ':' || p_business_id::text));
  select count(*)::integer into v_count from public.check_ins c where c.user_id = v_uid and c.business_id = p_business_id;
  if exists (
    select 1 from public.check_ins c
    where c.user_id = v_uid and c.business_id = p_business_id and c.created_at > now() - interval '24 hours'
  ) then
    return query select false, 'already_checked_in_24h', null::uuid, v_count; return;
  end if;
  insert into public.check_ins (user_id, business_id) values (v_uid, p_business_id) returning id into v_id;
  return query select true, 'checked_in', v_id, v_count + 1;
end;
$function$;

revoke execute on function public.check_in(uuid) from public, anon;
grant execute on function public.check_in(uuid) to authenticated;

-- Direct inserts are closed: the RPC (security definer) is the only writer.
alter policy "check_ins: authenticated insert" on public.check_ins with check (false);
