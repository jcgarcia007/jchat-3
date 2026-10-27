-- 192: JChat Match — reportes con doble destino, ayuda discreta al local, expulsión, gente nueva, borrado efímero (salir / vencimiento / cron).
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-03). Este archivo solo la versiona.

-- 1) Reportes: negocio de contexto + lectura del dueño
alter table public.reports add column if not exists business_id uuid references public.businesses(id) on delete set null;
create index if not exists reports_business_idx on public.reports (business_id, created_at desc);
drop policy if exists reports_read_owner on public.reports;
create policy reports_read_owner on public.reports for select to authenticated
  using (business_id is not null and exists (select 1 from public.businesses b where b.id = reports.business_id and b.owner_id = auth.uid()));

create or replace function public.match_report(p_business_id uuid, p_reported_user_id uuid, p_reason text, p_details text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_owner uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_reason not in ('harassment','explicit','minor','scam','other') then raise exception 'invalid_reason' using errcode = '22023'; end if;
  if p_reported_user_id = v_uid then raise exception 'invalid_target' using errcode = '22023'; end if;
  insert into public.reports (reporter_id, reported_user_id, content_type, content_id, reason, status, business_id)
  values (v_uid, p_reported_user_id, 'match', null, p_reason || coalesce(': ' || left(p_details, 500), ''), 'pending', p_business_id)
  returning id into v_id;
  -- doble destino: cola del superadmin (ya lee reports) + aviso al dueño del local
  select owner_id into v_owner from public.businesses where id = p_business_id;
  if v_owner is not null and v_owner <> v_uid then
    insert into public.notifications (user_id, type, payload)
    values (v_owner, 'work_alert', jsonb_build_object('kind','match_report','business_id', p_business_id, 'report_id', v_id, 'reason', p_reason, 'reported_user_id', p_reported_user_id));
  end if;
  return v_id;
end;
$$;
revoke all on function public.match_report(uuid, uuid, text, text) from public, anon;
grant execute on function public.match_report(uuid, uuid, text, text) to authenticated;

-- 2) Borrado de todo lo de un usuario en un local (efímero). NO toca: reportes, bloqueos, mensajes del chat grupal, cuota de super likes, fotos propias.
create or replace function public.match_wipe_user_venue(p_user_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  -- matches y sus chats efímeros (sobreviven si hay solicitud de follow pendiente entre los dos)
  for r in select m.* from public.matches m where m.business_id = p_business_id and p_user_id in (m.user_a, m.user_b) loop
    if exists (select 1 from public.follow_requests fr where fr.status = 'pending'
               and ((fr.requester_id = r.user_a and fr.target_id = r.user_b) or (fr.requester_id = r.user_b and fr.target_id = r.user_a))) then
      continue;  -- la conversación espera la decisión del follow
    end if;
    perform public.match_remove_pair(p_business_id, r.user_a, r.user_b);
  end loop;
  -- conversaciones efímeras del local sin match (p. ej. match ya borrado) donde participa
  delete from public.dm_conversations c where c.ephemeral_business_id = p_business_id and p_user_id in (c.user_a, c.user_b)
    and not exists (select 1 from public.follow_requests fr where fr.status = 'pending'
                    and ((fr.requester_id = c.user_a and fr.target_id = c.user_b) or (fr.requester_id = c.user_b and fr.target_id = c.user_a)));
  -- swipes dados y recibidos, notificaciones de Match (propias y sobre él), opt-in y presencia
  delete from public.notifications n where n.type in ('match_like','match_super','match_match','match_new_people')
    and (n.payload->>'business_id')::uuid = p_business_id
    and (n.user_id = p_user_id or (n.payload->>'from_user_id')::uuid = p_user_id or (n.payload->>'other_user_id')::uuid = p_user_id);
  delete from public.match_swipes s where s.business_id = p_business_id and p_user_id in (s.swiper_id, s.target_id);
  delete from public.game_optins o where o.user_id = p_user_id and o.business_id = p_business_id;
  delete from public.match_presence p where p.user_id = p_user_id and p.business_id = p_business_id;
end;
$$;
revoke all on function public.match_wipe_user_venue(uuid, uuid) from public, anon, authenticated;

-- 3) Salir del local (botón) y apagar Match en este local (interruptor): mismo efecto, silencioso para los demás
create or replace function public.match_leave_venue(p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.match_wipe_user_venue(auth.uid(), p_business_id);
end;
$$;
revoke all on function public.match_leave_venue(uuid) from public, anon;
grant execute on function public.match_leave_venue(uuid) to authenticated;

-- 4) Expulsión por el dueño: excluye de Match en su local y borra lo del usuario ahí
create or replace function public.match_kick(p_business_id uuid, p_user_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid) then raise exception 'not_owner' using errcode = '42501'; end if;
  insert into public.match_kicks (business_id, user_id, kicked_by, reason) values (p_business_id, p_user_id, v_uid, p_reason)
  on conflict (business_id, user_id) do update set kicked_by = excluded.kicked_by, reason = excluded.reason, created_at = now();
  perform public.match_wipe_user_venue(p_user_id, p_business_id);
end;
$$;
create or replace function public.match_unkick(p_business_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid()) then raise exception 'not_owner' using errcode = '42501'; end if;
  delete from public.match_kicks where business_id = p_business_id and user_id = p_user_id;
end;
$$;
revoke all on function public.match_kick(uuid, uuid, text) from public, anon;
revoke all on function public.match_unkick(uuid, uuid) from public, anon;
grant execute on function public.match_kick(uuid, uuid, text), public.match_unkick(uuid, uuid) to authenticated;

-- 5) Pedir ayuda al local: llamada de servicio discreta + alerta al dueño y al personal activo (modo trabajo reciente)
create or replace function public.match_request_help(p_business_id uuid, p_room_id uuid default null, p_table_label text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_room uuid; r record;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_room := coalesce(p_room_id, (select r2.id from public.rooms r2 where r2.business_id = p_business_id and r2.is_active order by r2.is_main desc nulls last, r2.sort limit 1));
  insert into public.service_calls (room_id, business_id, user_id, status, type, notes, table_label)
  values (v_room, p_business_id, v_uid, 'pending', 'help', 'Un cliente pide ayuda discreta', left(p_table_label, 40))
  returning id into v_id;
  for r in
    select b.owner_id as user_id from public.businesses b where b.id = p_business_id
    union
    select e.user_id from public.employees e where e.business_id = p_business_id and e.status = 'active' and e.last_active_at > now() - interval '2 hours'
  loop
    if r.user_id is not null and r.user_id <> v_uid then
      insert into public.notifications (user_id, type, payload)
      values (r.user_id, 'work_alert', jsonb_build_object('kind','help','business_id', p_business_id, 'service_call_id', v_id, 'room_id', v_room, 'table_label', left(p_table_label, 40)));
    end if;
  end loop;
  return v_id;
end;
$$;
revoke all on function public.match_request_help(uuid, uuid, text) from public, anon;
grant execute on function public.match_request_help(uuid, uuid, text) to authenticated;

-- 6) Gente nueva en el local (opt-in, genérica, máx. 1 aviso cada 10 min por persona)
create or replace function public.match_notify_new_people()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active_since is null or (old.active_since is not null) then return new; end if;
  insert into public.notifications (user_id, type, payload)
  select p.user_id, 'match_new_people', jsonb_build_object('business_id', new.business_id)
  from public.match_presence p join public.users u on u.id = p.user_id
  where p.business_id = new.business_id and p.user_id <> new.user_id and p.active_since is not null and p.expires_at > now()
    and coalesce((u.settings->>'matchNotifyNewPeople')::boolean, false)
    and not exists (select 1 from public.notifications n where n.user_id = p.user_id and n.type = 'match_new_people'
                    and (n.payload->>'business_id')::uuid = new.business_id and n.created_at > now() - interval '10 minutes');
  return new;
end;
$$;
drop trigger if exists trg_match_notify_new_people on public.match_presence;
create trigger trg_match_notify_new_people after insert or update of active_since on public.match_presence for each row execute function public.match_notify_new_people();

-- 7) Vencimiento: presencia vencida hace > 15 min → borrado (cron cada 2 min)
create or replace function public.match_wipe_expired()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select p.user_id, p.business_id from public.match_presence p where p.expires_at < now() - interval '15 minutes' loop
    perform public.match_wipe_user_venue(r.user_id, r.business_id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.match_wipe_expired() from public, anon, authenticated;
select cron.unschedule('match-wipe-expired') where exists (select 1 from cron.job where jobname = 'match-wipe-expired');
select cron.schedule('match-wipe-expired', '*/2 * * * *', $$select public.match_wipe_expired()$$);
