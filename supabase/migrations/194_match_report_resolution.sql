-- 194: JChat Match — el dueño resuelve o descarta reportes de su local; expulsar resuelve los pendientes de esa persona.
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-03). Este archivo solo la versiona.

create or replace function public.match_resolve_report(p_report_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_status not in ('resolved','dismissed') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.reports r set status = p_status
  where r.id = p_report_id and r.content_type = 'match'
    and exists (select 1 from public.businesses b where b.id = r.business_id and b.owner_id = v_uid);
  if not found then raise exception 'not_owner_or_not_found' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.match_resolve_report(uuid, text) from public, anon;
grant execute on function public.match_resolve_report(uuid, text) to authenticated;

-- Expulsar también resuelve los reportes pendientes de esa persona en ese local
create or replace function public.match_kick(p_business_id uuid, p_user_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid) then raise exception 'not_owner' using errcode = '42501'; end if;
  insert into public.match_kicks (business_id, user_id, kicked_by, reason) values (p_business_id, p_user_id, v_uid, p_reason)
  on conflict (business_id, user_id) do update set kicked_by = excluded.kicked_by, reason = excluded.reason, created_at = now();
  update public.reports set status = 'resolved'
  where business_id = p_business_id and reported_user_id = p_user_id and content_type = 'match' and status in ('pending','reviewing');
  perform public.match_wipe_user_venue(p_user_id, p_business_id);
end;
$$;
