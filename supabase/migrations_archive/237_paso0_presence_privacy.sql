-- 237: PASO 0 — conteo de personas por local, salida confirmada (ocultar 1 h y luego borrar) y reservas seguras.
-- BORRADOR PARA REVISIÓN: NO está aplicada en Supabase. La aplica Juan cuando dé el OK.
-- Reversión: supabase/rollbacks/237_paso0_presence_privacy_rollback.sql (fuera de migrations/ a propósito: el CLI aplicaría
-- cualquier archivo de esta carpeta, también uno de reversión).
--
-- Bloques y la decisión que origina cada uno:
--   BLOQUE 1  (decisión A.1)  venue_people_counts   → solo números por local, nunca quién.
--   BLOQUE 2  (decisión C)    venue_exits + venue_session_end / venue_session_resume / venue_exits_purge
--                             → al CONFIRMAR la salida: se oculta lo efímero 1 hora y luego se borra.
--   BLOQUE 3  (decisión "reservas seguras") reservation_capacity, políticas de reservations, trigger guard,
--                             reservation_slot_load → el cliente no puede cambiar su propio estado (solo cancelar) y
--                             la app sabe si un día está lleno sin ver reservas ajenas.
--   (BLOQUE 4 — fotos de DM sin moderar — NO va aquí: scripts/moderate-legacy-dm-photos.sql, lo ejecuta Juan.)
--   (BLOQUE 5 — coordenadas en Stripe — es solo código de Edge Functions, sin base.)
--   (BLOQUE 6 — precisión ligada al radio — es solo móvil, sin base.)
--
-- Verificado leyendo las migraciones del repo (no la base en vivo):
--   * dm_conversations.hidden_at_a / hidden_at_b existen (172_dm_hide_and_notification_delete.sql) y services/dms.ts ya los usa.
--   * dm_messages.conversation_id referencia dm_conversations ON DELETE CASCADE (002_social_schema.sql:75): borrar la
--     conversación borra sus mensajes; no hace falta borrarlos antes.
--   * match_wipe_user_venue(uuid, uuid) existe con esa firma (192_match_moderation_wipe.sql:34); match_leave_venue la usa.
--   * match_presence(user_id, business_id, expires_at, …) y room_members(room_id, user_id, expires_at) existen.
--   * Estados de reserva en el código: 'pending', 'confirmed' (móvil), 'arrived', 'no_show', 'cancelled' (panel web:
--     web/app/dashboard/reservations/page.tsx:46). No hay CHECK sobre status. El panel no usa 'confirmed': una reserva
--     'arrived' sigue ocupando cupo, por eso el conteo de cupo incluye pending, confirmed y arrived.
--
-- Estilo de CLAUDE.md: formas idempotentes; las políticas y el cron se crean solo si no existen. Esta migración NO tiene
-- ninguna sentencia destructiva: el DROP POLICY reservations_customer está en 238_destructive.sql (orden: 237, luego 238).
-- Hasta que corra la 238, la política antigua FOR ALL sigue permitiendo al cliente cambiar su estado (el trigger guard ya
-- lo frena); la 238 cierra esa puerta.
--
-- Notas:
--   (1) Ocultar por salida usa columnas PROPIAS (exit_hidden_at_a / _b), no hidden_at_a / _b: hidden_at es un corte que el
--       usuario pone a mano y el resume lo habría borrado. Solo venue_session_end / resume / purge tocan las exit_*.
--       La ocultación por salida es pegajosa (un mensaje nuevo no la deshace); el purge respeta los follow pendientes.
--   (2) venue_people_counts no tiene umbral mínimo (decisión A.1): un "1" revela que hay alguien, no quién.
--   (3) "el día" de reservation_slot_load se calcula en America/New_York (TODO(timezone) abajo).

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 1 (decisión A.1) — Conteo de personas: solo números, nunca quién
-- La app pasa los ids de los locales visibles en el mapa (máximo 200, lo aplica el cliente). Nunca devuelve user_id.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.venue_people_counts(p_business_ids uuid[])
returns table (business_id uuid, people integer)
language sql stable security definer set search_path = public as $$
  select r.business_id, count(distinct g.user_id)::int
  from public.room_geo_presence g
  join public.rooms r on r.id = g.room_id
  where r.business_id = any (p_business_ids) and g.expires_at > now()
  group by r.business_id
$$;
revoke all on function public.venue_people_counts(uuid[]) from public, anon;
grant execute on function public.venue_people_counts(uuid[]) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 2 (decisión C) — Salida confirmada: ocultar 1 hora, luego borrar
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.venue_exits (
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  exited_at timestamptz not null default now(),
  purge_at timestamptz not null default now() + interval '1 hour',
  reason text,
  primary key (user_id, business_id)
);
create index if not exists venue_exits_purge_idx on public.venue_exits (purge_at);
alter table public.venue_exits enable row level security;
-- Sin políticas: solo las funciones security definer la tocan. Además se quitan los privilegios de tabla por defecto.
revoke all on public.venue_exits from anon, authenticated;

-- Ocultar por salida: columnas separadas de hidden_at (que es el corte manual del usuario, migración 172). exit_hidden_at_x es PEGAJOSA: con
-- ella puesta la bandeja oculta la conversación por completo aunque llegue un mensaje nuevo; hidden_at_x sigue siendo un corte.
-- Solo venue_session_resume (o el purge) la limpia.
alter table public.dm_conversations add column if not exists exit_hidden_at_a timestamptz;
alter table public.dm_conversations add column if not exists exit_hidden_at_b timestamptz;

-- Copia de match_wipe_user_venue (192) SIN el borrado de DMs: ni el de dm_conversations del final ni el que hace
-- match_remove_pair (191:125-137, que borra el match Y su conversación efímera). Aquí el match se borra solo a sí mismo.
-- match_wipe_user_venue queda intacta (la sigue usando match_leave_venue, salida a mano).
create or replace function public.match_wipe_user_venue_keep_dms(p_user_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  -- matches (sobreviven si hay solicitud de follow pendiente entre los dos); las conversaciones NO se tocan
  for r in select m.* from public.matches m where m.business_id = p_business_id and p_user_id in (m.user_a, m.user_b) loop
    if exists (select 1 from public.follow_requests fr where fr.status = 'pending'
               and ((fr.requester_id = r.user_a and fr.target_id = r.user_b) or (fr.requester_id = r.user_b and fr.target_id = r.user_a))) then
      continue;
    end if;
    delete from public.matches m where m.id = r.id;
  end loop;
  -- swipes dados y recibidos, notificaciones de Match (propias y sobre él), opt-in y presencia
  delete from public.notifications n where n.type in ('match_like','match_super','match_match','match_new_people')
    and (n.payload->>'business_id')::uuid = p_business_id
    and (n.user_id = p_user_id or (n.payload->>'from_user_id')::uuid = p_user_id or (n.payload->>'other_user_id')::uuid = p_user_id);
  delete from public.match_swipes s where s.business_id = p_business_id and p_user_id in (s.swiper_id, s.target_id);
  delete from public.game_optins o where o.user_id = p_user_id and o.business_id = p_business_id;
  delete from public.match_presence p where p.user_id = p_user_id and p.business_id = p_business_id;
end;
$$;
revoke all on function public.match_wipe_user_venue_keep_dms(uuid, uuid) from public, anon, authenticated;

create or replace function public.venue_session_end(p_business_id uuid, p_reason text default 'outside_radius')
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'auth_required'; end if;
  delete from public.room_geo_presence g using public.rooms r
    where r.id = g.room_id and r.business_id = p_business_id and g.user_id = v_uid;
  delete from public.room_members m using public.rooms r
    where r.id = m.room_id and r.business_id = p_business_id and m.user_id = v_uid;
  update public.dm_conversations set exit_hidden_at_a = now()
    where ephemeral_business_id = p_business_id and user_a = v_uid;
  update public.dm_conversations set exit_hidden_at_b = now()
    where ephemeral_business_id = p_business_id and user_b = v_uid;
  update public.match_presence set expires_at = now()
    where user_id = v_uid and business_id = p_business_id and expires_at > now();
  insert into public.venue_exits (user_id, business_id, reason) values (v_uid, p_business_id, p_reason)
    on conflict (user_id, business_id) do update
      set exited_at = now(), purge_at = now() + interval '1 hour', reason = excluded.reason;
end $$;

create or replace function public.venue_session_resume(p_business_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_found boolean;
begin
  if v_uid is null then raise exception 'auth_required'; end if;
  delete from public.venue_exits where user_id = v_uid and business_id = p_business_id and purge_at > now()
    returning true into v_found;
  if coalesce(v_found, false) then
    update public.dm_conversations set exit_hidden_at_a = null
      where ephemeral_business_id = p_business_id and user_a = v_uid;
    update public.dm_conversations set exit_hidden_at_b = null
      where ephemeral_business_id = p_business_id and user_b = v_uid;
  end if;
  return coalesce(v_found, false);
end $$;
-- Devuelve true si recuperó una salida pendiente (la app muestra el historial de nuevo).

create or replace function public.venue_exits_purge()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select user_id, business_id from public.venue_exits where purge_at <= now() loop
    -- DMs efímeros: se borran solo si LOS DOS participantes ya salieron (exit_hidden en ambos lados); si el otro sigue en
    -- el local, la conversación sigue y la borra el purge de 24 h que ya existe. El resto del borrado de Match NO toca DMs.
    delete from public.dm_conversations c
      where c.ephemeral_business_id = r.business_id
        and (c.user_a = r.user_id or c.user_b = r.user_id)
        and c.exit_hidden_at_a is not null and c.exit_hidden_at_b is not null
        and not exists (select 1 from public.follow_requests fr where fr.status = 'pending'
          and ((fr.requester_id = c.user_a and fr.target_id = c.user_b) or (fr.requester_id = c.user_b and fr.target_id = c.user_a)));
    perform public.match_wipe_user_venue_keep_dms(r.user_id, r.business_id);
    delete from public.venue_exits where user_id = r.user_id and business_id = r.business_id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.venue_session_end(uuid, text) from public, anon;
revoke all on function public.venue_session_resume(uuid) from public, anon;
revoke all on function public.venue_exits_purge() from public, anon, authenticated;
grant execute on function public.venue_session_end(uuid, text) to authenticated;
grant execute on function public.venue_session_resume(uuid) to authenticated;
-- Cron (cada 5 min). Solo se crea si no existe (patrón de 222/223); el cron corre como postgres.
select cron.schedule('venue-exits-purge', '*/5 * * * *', 'select public.venue_exits_purge()')
where not exists (select 1 from cron.job where jobname = 'venue-exits-purge');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 3 (reservas seguras) — el cliente no puede cambiar su propio estado
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3a. Capacidad por día. null = sin límite. Es una columna que el dueño edita desde la app: entra al grant update de
--     businesses EN ESTA MISMA migración (lo exige mobile/scripts/migrations-businesses-grants.test.mjs).
alter table public.businesses add column if not exists reservation_capacity integer;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'businesses_reservation_capacity_chk') then
    alter table public.businesses add constraint businesses_reservation_capacity_chk
      check (reservation_capacity is null or reservation_capacity > 0);
  end if;
end $$;
grant update (reservation_capacity) on public.businesses to authenticated;

-- 3b. Políticas nuevas: una del dueño (todo) y tres del cliente (ver, crear 'pending', actualizar). La política FOR ALL
--     antigua de 007 (reservations_customer) se elimina en 238_destructive.sql, que se aplica DESPUÉS de esta.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reservations' and policyname = 'reservations_owner_all') then
    create policy reservations_owner_all on public.reservations for all to authenticated
      using (exists (select 1 from public.businesses b where b.id = reservations.business_id and b.owner_id = auth.uid()))
      with check (exists (select 1 from public.businesses b where b.id = reservations.business_id and b.owner_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reservations' and policyname = 'reservations_customer_select') then
    create policy reservations_customer_select on public.reservations for select to authenticated
      using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reservations' and policyname = 'reservations_customer_insert') then
    create policy reservations_customer_insert on public.reservations for insert to authenticated
      with check (user_id = auth.uid() and status = 'pending');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reservations' and policyname = 'reservations_customer_update') then
    create policy reservations_customer_update on public.reservations for update to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

-- 3c. Guard: un cliente (que no es el dueño del local) solo puede cancelar su reserva; no cambia el negocio, la persona,
--     la hora, el tamaño del grupo ni la lista de espera. (101 ya limita el UPDATE de authenticated a la columna status;
--     el trigger es la segunda barrera y también cubre un futuro grant más amplio.) service_role: auth.uid() es NULL, no aplica.
create or replace function public.reservations_customer_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() = old.user_id
     and not exists (select 1 from public.businesses b where b.id = old.business_id and b.owner_id = auth.uid()) then
    if new.status is distinct from old.status and new.status <> 'cancelled' then
      raise exception 'customer_cannot_change_status';
    end if;
    if new.business_id is distinct from old.business_id or new.user_id is distinct from old.user_id
       or new.reserved_at is distinct from old.reserved_at or new.party_size is distinct from old.party_size
       or new.is_waitlist is distinct from old.is_waitlist then
      raise exception 'customer_can_only_cancel_or_edit_requests';
    end if;
  end if;
  return new;
end $$;
create or replace trigger reservations_customer_guard before update on public.reservations
  for each row execute function public.reservations_customer_guard();

-- 3d. Cupo del día SIN exponer reservas ajenas: devuelve solo cuántas hay y la capacidad (null = sin límite).
--     Cuentan pending, confirmed y arrived que no sean lista de espera. La app lo usa en lugar de la constante 20 del cliente.
--     TODO(timezone): pasar a la zona horaria del local cuando exista la columna (hoy fija en America/New_York).
create or replace function public.reservation_slot_load(p_business_id uuid, p_reserved_at timestamptz)
returns table (reserved integer, capacity integer)
language sql stable security definer set search_path = public as $$
  select (count(*) filter (where r.status in ('pending', 'confirmed', 'arrived') and not r.is_waitlist))::int,
         (select b.reservation_capacity from public.businesses b where b.id = p_business_id)
  from public.reservations r
  where r.business_id = p_business_id
    and (r.reserved_at at time zone 'America/New_York')::date = (p_reserved_at at time zone 'America/New_York')::date
$$;
revoke all on function public.reservation_slot_load(uuid, timestamptz) from public, anon;
grant execute on function public.reservation_slot_load(uuid, timestamptz) to authenticated;

notify pgrst, 'reload schema';
