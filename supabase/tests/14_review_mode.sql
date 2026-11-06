-- @apply 262_review_mode.sql
-- Modo revisión (262): la única excepción a la regla de oro es interruptor encendido + cuenta activa del grupo + local activo del grupo.
-- La migración borrador se aplica dentro de esta transacción con ROLLBACK por la línea de arriba.
do $t$
declare
  biz constant uuid := pg_temp.seed_venue();                        -- local del grupo de prueba (lat 40, lng -74, radio 50 m); dueño: usuario 1
  room constant uuid := '10000000-0000-4000-8000-0000000000a1';
  biz2 constant uuid := '20000000-0000-4000-8000-000000000001';     -- local REAL (fuera del grupo)
  room2 constant uuid := '20000000-0000-4000-8000-0000000000a1';
  u2 uuid := pg_temp.seed_user(2);   -- revisor (miembro activo)
  u3 uuid := pg_temp.seed_user(3);   -- usuario real
  u4 uuid := pg_temp.seed_user(4);   -- QA (miembro)
  u5 uuid := pg_temp.seed_user(5);   -- super-admin
  r record; n int; v_until timestamptz; ok boolean;
begin
  set local session_replication_role = replica;
  insert into public.businesses (id, owner_id, name, slug, lat, lng) values (biz2, pg_temp.uid(1), 'Real Venue', 'real-venue-sql-test', 41.0, -75.0);
  set local session_replication_role = origin;
  insert into public.rooms (id, business_id, name) values (room2, biz2, 'Main');
  insert into public.admin_roles (user_id, role) values (u5, 'super_admin');
  insert into public.review_group_members (user_id, kind) values (u2, 'reviewer'), (u4, 'qa');
  insert into public.review_group_businesses (business_id) values (biz);

  -- 0) sin interruptor encendido nada cambia: ni el miembro entra desde lejos
  perform pg_temp.as_user(u2);
  perform pg_temp.t_ok(not public.venue_inside(biz, 0, 0), 'interruptor apagado: miembro lejos -> venue_inside false');
  perform pg_temp.t_ok((select not access_granted and reason = 'not_available' from public.check_geofence_and_join_room(room, 0, 0)), 'interruptor apagado: la sala del grupo no se abre');

  -- 1) administración: solo super-admin
  perform pg_temp.as_user(u3);
  perform pg_temp.t_raises('select public.review_mode_set(30)', 'forbidden', 'un usuario normal no enciende el modo');
  perform pg_temp.t_raises('select public.review_group_add_member(''x'', ''qa'')', 'forbidden', 'un usuario normal no añade cuentas');
  perform pg_temp.t_raises('select public.review_group_overview()', 'forbidden', 'un usuario normal no lee el resumen');
  perform pg_temp.as_user(u5);
  perform pg_temp.t_raises('select public.review_mode_set(31)', 'invalid_days', 'el máximo son 30 días');
  perform pg_temp.t_raises('select public.review_mode_set(0)', 'invalid_days', 'el mínimo es 1 día');
  select public.review_mode_set(30) into v_until;
  perform pg_temp.t_ok(v_until > now() + interval '29 days', 'el super-admin enciende 30 días');
  perform pg_temp.t_ok((public.review_group_overview()->>'active')::boolean, 'el resumen dice activo');

  -- 2) miembro + local del grupo + interruptor
  perform pg_temp.as_user(u2);
  perform pg_temp.t_ok(public.venue_inside(biz, 0, 0), 'miembro + local del grupo + activo: venue_inside true desde (0,0)');
  select * into r from public.check_geofence_and_join_room(room, 0, 0);
  perform pg_temp.t_ok(r.access_granted and r.reason = 'review_bypass' and not r.is_owner, 'check_geofence: entra con reason review_bypass');
  perform pg_temp.as_service();
  perform pg_temp.t_ok(public.venue_presence_ok(biz, u2), 'se creó la presencia igual que dentro (venue_presence_ok)');
  perform pg_temp.t_ok((select count(*) from public.review_bypass_log where user_id = u2 and business_id = biz and fn = 'check_geofence_and_join_room') = 1, 'queda una fila en review_bypass_log');
  perform pg_temp.as_user(u2);
  perform public.venue_inside(biz, 0, 0); perform public.venue_inside(biz, 0, 0);
  perform pg_temp.as_service();
  perform pg_temp.t_ok((select count(*) from public.review_bypass_log where user_id = u2 and fn = 'venue_inside') = 1, 'dos llamadas seguidas registran una sola fila (10 min)');
  perform pg_temp.as_user(u4);
  perform pg_temp.t_ok(public.venue_inside(biz, 0, 0), 'la cuenta QA también');

  perform pg_temp.as_user(u2);
  perform pg_temp.as_service();
  delete from public.room_geo_presence where user_id = u2 and room_id = room;
  perform pg_temp.as_user(u2);
  perform pg_temp.t_ok(public.review_join_room(room), 'review_join_room: el miembro entra sin coordenadas');
  perform pg_temp.t_ok(exists (select 1 from public.review_bypass_businesses() b where b = biz), 'review_bypass_businesses lista el local del grupo');
  perform pg_temp.t_ok(not public.review_join_room(room2), 'review_join_room: una sala de un local real devuelve false');
  perform pg_temp.as_user(u3);
  perform pg_temp.t_ok(not public.review_join_room(room), 'review_join_room: un usuario real recibe false');
  perform pg_temp.t_ok(not exists (select 1 from public.review_bypass_businesses()), 'review_bypass_businesses vacío para un usuario real');
  perform pg_temp.as_service();
  perform pg_temp.t_ok(not public.venue_presence_ok(biz, u3), 'review_join_room no dejó presencia al usuario real');

  -- 3) miembro + local REAL: la regla de oro sigue entera
  perform pg_temp.as_user(u2);
  perform pg_temp.t_ok(not public.venue_inside(biz2, 0, 0), 'miembro + local real lejos -> false');
  perform pg_temp.t_ok((select not access_granted and reason = 'outside_radius' from public.check_geofence_and_join_room(room2, 0, 0)), 'miembro + sala real lejos -> outside_radius');
  perform pg_temp.t_ok((select access_granted and reason = 'inside_radius' from public.check_geofence_and_join_room(room2, 41.0, -75.0)), 'miembro dentro del radio real entra por la vía normal');

  -- 4) usuario real + local del grupo: nunca, ni estando físicamente dentro
  perform pg_temp.as_user(u3);
  perform pg_temp.t_ok(not public.venue_inside(biz, 0, 0), 'usuario real lejos -> false');
  perform pg_temp.t_ok(not public.venue_inside(biz, 40.0, -74.0), 'usuario real EN el local del grupo -> false');
  perform pg_temp.t_ok((select not access_granted and reason = 'not_available' from public.check_geofence_and_join_room(room, 40.0, -74.0)), 'usuario real dentro del radio del local del grupo: not_available');
  perform pg_temp.as_service();
  perform pg_temp.t_ok(not public.venue_presence_ok(biz, u3), 'sin presencia para el usuario real');
  perform pg_temp.t_ok((select count(*) from public.review_bypass_log where user_id = u3) = 0, 'el usuario real no deja registro');
  perform pg_temp.t_ok(not public.venue_inside(biz, 0, 0), 'sin sesión (auth.uid null) no hay bypass');

  -- 5) visibilidad
  perform pg_temp.as_user(u3);
  perform pg_temp.t_ok((select count(*) from public.businesses where id = biz) = 0, 'usuario real no ve el local del grupo');
  perform pg_temp.t_ok((select count(*) from public.businesses where id = biz2) = 1, 'usuario real sí ve un local normal');
  perform pg_temp.t_ok(not exists (select 1 from public.resolve_venue_entry('bar-sql-test')), 'resolve_venue_entry no resuelve el local del grupo para un usuario real');
  perform pg_temp.as_user(u2);
  perform pg_temp.t_ok((select count(*) from public.businesses where id = biz) = 1, 'miembro ve el local del grupo (sin filtro de distancia)');
  perform pg_temp.t_ok(exists (select 1 from public.resolve_venue_entry('bar-sql-test')), 'miembro resuelve el local del grupo');
  perform pg_temp.as_user(pg_temp.uid(1));
  perform pg_temp.t_ok((select count(*) from public.businesses where id = biz) = 1, 'el dueño ve su local aunque no sea miembro');
  perform pg_temp.as_user(u5);
  perform pg_temp.t_ok((select count(*) from public.businesses where id = biz) = 1, 'el super-admin ve el local');

  -- 6) personas del grupo fuera de locales que no son del grupo
  perform pg_temp.as_service();
  insert into public.room_geo_presence (room_id, user_id, expires_at) values (room2, u2, now() + interval '10 min'), (room2, u3, now() + interval '10 min') on conflict do nothing;
  perform pg_temp.t_ok((select people from public.venue_people_counts(array[biz2]) where business_id = biz2) = 1, 'venue_people_counts de un local real no cuenta al miembro');
  perform pg_temp.as_user(u3);
  perform pg_temp.t_ok(not (u2 = any (public.venue_present_users(biz2, array[u2, u3]))), 'venue_present_users no lista al miembro en un local real');
  perform pg_temp.t_ok(u3 <> all (public.venue_present_users(biz2, array[u2])) , 'venue_present_users sin el miembro');

  -- 7) tablas cerradas
  perform pg_temp.as_user(u3);
  perform pg_temp.t_ok((select count(*) from public.review_group_members) = 0 and (select count(*) from public.review_bypass_log) = 0 and (select count(*) from public.review_mode) = 0, 'un usuario normal no lee las tablas');
  perform pg_temp.t_raises('insert into public.review_group_members (user_id, kind) values (pg_temp.uid(3), ''qa'')', 'permission denied', 'un usuario normal no escribe en el grupo');
  perform pg_temp.t_raises('select public.review_bypass(''10000000-0000-4000-8000-000000000001'', pg_temp.uid(3), ''x'')', 'permission denied', 'review_bypass no se llama desde la API');
  perform pg_temp.as_user(u5);
  perform pg_temp.t_ok((select count(*) from public.review_bypass_log) >= 2, 'el super-admin lee el log');
  perform pg_temp.t_ok(jsonb_array_length(public.review_group_overview()->'log') >= 2, 'el resumen trae el log');

  -- 8) pausa, retiro, caducidad, apagado
  perform public.review_group_set_status('member', (select username from public.users where id = u2), 'paused');
  perform pg_temp.as_user(u2);
  perform pg_temp.t_ok(not public.venue_inside(biz, 0, 0), 'miembro en pausa -> false');
  perform pg_temp.t_ok((select count(*) from public.businesses where id = biz) = 0, 'miembro en pausa no ve el local');
  perform pg_temp.as_user(u5);
  perform public.review_group_set_status('member', (select username from public.users where id = u2), 'active');
  perform public.review_group_set_status('business', 'bar-sql-test', 'paused');
  perform pg_temp.as_user(u2);
  perform pg_temp.t_ok(not public.venue_inside(biz, 0, 0), 'local en pausa -> false');
  perform pg_temp.as_user(u5);
  perform public.review_group_set_status('business', 'bar-sql-test', 'active');
  perform pg_temp.as_user(u2);
  perform pg_temp.t_ok(public.venue_inside(biz, 0, 0), 'reactivados vuelve a funcionar');
  perform pg_temp.as_service();
  update public.review_mode set enabled_until = now() - interval '1 second' where id;
  perform pg_temp.as_user(u2);
  perform pg_temp.t_ok(not public.venue_inside(biz, 0, 0), 'interruptor caducado -> false');
  perform pg_temp.t_ok((select not access_granted from public.check_geofence_and_join_room(room, 0, 0)), 'caducado: la sala no se abre');
  perform pg_temp.t_ok((select count(*) from public.businesses where id = biz) = 0, 'caducado: el miembro ya no ve el local');
  perform pg_temp.as_user(u5);
  perform public.review_mode_set(1);
  perform public.review_mode_off();
  perform pg_temp.as_user(u2);
  perform pg_temp.t_ok(not public.venue_inside(biz, 0, 0), 'apagado a mano -> false');
  perform pg_temp.as_service();
  perform pg_temp.t_ok(not public.review_mode_active(), 'review_mode_active false');
end
$t$;
