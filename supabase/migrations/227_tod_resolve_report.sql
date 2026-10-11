-- 227_tod_resolve_report.sql
-- Truth or Dare · el dueño del local resuelve/descarta reportes sobre mensajes tod_* de su local
-- (espejo de match_resolve_report, 194). Registra en tod_moderation_log.

create or replace function public.tod_resolve_report(p_report_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_biz uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_status not in ('resolved','dismissed') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select r.business_id into v_biz
    from public.reports r
    join public.messages m on m.id = r.content_id
   where r.id = p_report_id and r.content_type = 'message' and m.type in ('tod_round','tod_draw')
     and exists (select 1 from public.businesses b where b.id = r.business_id and b.owner_id = v_uid);
  if v_biz is null then raise exception 'not_owner_or_not_found' using errcode = '42501'; end if;
  update public.reports
     set status = p_status, resolved_by = v_uid, resolved_at = now(),
         resolution = coalesce(resolution, case when p_status = 'resolved' then 'venue_owner_resolved' else 'venue_owner_dismissed' end)
   where id = p_report_id;
  insert into public.tod_moderation_log (business_id, actor_id, action, target_type, target_id, detail)
  values (v_biz, v_uid, 'report_' || p_status, 'report', p_report_id, '{}'::jsonb);
end $$;
revoke all on function public.tod_resolve_report(uuid, text) from public;
grant execute on function public.tod_resolve_report(uuid, text) to authenticated;
