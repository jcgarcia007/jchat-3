-- JChat — datos de prueba para la revisión de Apple y Google (Fase D2). NO ES UNA MIGRACIÓN: lo ejecuta Juan por MCP/SQL Editor, DESPUÉS de aplicar
-- la migración 262 (modo revisión). Es IDEMPOTENTE: se puede repetir (renueva las presencias de 14 días y las ofertas de 30 días).
-- Reversión: supabase/scripts/review_unseed.sql · Prueba local: bash supabase/scripts/test_review_seed_local.sh
--
-- ANTES DE EJECUTARLO
--   1. @jchatreview2 debe existir (se crea en la app: ver docs/app-review/RUNBOOK-revisor.md, "Cuenta 2"). Si falta alguna de las 5 cuentas el script se detiene
--      con un mensaje y no escribe nada.
--   2. Sube los 4 avatares de supabase/scripts/review-seed-avatars/demo-1..4.png al bucket PRIVADO `match-photos`, con las rutas
--         demo/review-seed/demo-1.png … demo-4.png
--      (Storage → match-photos → crear carpeta demo/review-seed → subir). Sin ese paso el mazo de Match funciona igual, pero las fotos salen vacías.
--      Son siluetas generadas (sin fotos reales de nadie).
--
-- QUÉ HACE (todo sobre JChat Demo Lounge, slug jchat-demo-lounge-y7of)
--   · Grupo de prueba (262): @jchatreview y @jchatreview2 como 'reviewer'; @test, @test1, @test002 como 'qa'; el local como activo del grupo.
--     NO enciende el interruptor: eso se hace en /super-admin/review-mode ("Activar 30 días") cuando toque.
--   · Activa Match y Verdad o Reto en el local (business_games).
--   · 4 personas ficticias (users.is_test = true, nombres inventados, también en el grupo como 'qa'), presentes 14 días, con perfil de Match,
--     intereses y una foto aprobada (la silueta), y su alta en Match.
--   · 3 mensajes en el chat, 2 ofertas (30 días) y, si el local tiene menos de 6 productos, los que falten hasta 6.
--   · Verdad o Reto: NO se siembran cartas. El catálogo es global (tod_cards: 1.000 cartas activas en inglés y otras tantas en español) y el local ya las usa; las rondas las
--     crea quien juega desde la app (la cuenta 2 las abre desde "Juegos").
--   · De @jchatreview2 solo toca su perfil de Match (género 'nonbinary' y busca 'all') SI aún no tiene uno, para que el mazo no la filtre por orientación.
--   · No toca Stripe, ni planes, ni el dueño del local, ni nada de las cuentas reales salvo lo dicho.
-- Todo lo sembrado lleva ids d4000000-0000-4000-8000-… (excepto las filas del grupo de las cuentas reales y los game flags): review_unseed.sql borra solo eso.

do $seed$
declare
  c_slug constant text := 'jchat-demo-lounge-y7of';
  v_biz  uuid;
  v_room uuid;
  v_uid  uuid;
  v_n    int;
  v_acc  record;
  v_person jsonb;
  v_item jsonb;
  v_msg  jsonb;
  v_off  jsonb;
  v_cat  constant uuid := 'd4000000-0000-4000-8000-0000000000c1';
  v_have int;
  v_reviewer2 uuid;
begin
  if to_regclass('public.review_group_members') is null then
    raise exception 'Falta la migración 262 (modo revisión): aplícala primero.';
  end if;
  select id into v_biz from public.businesses where slug = c_slug;
  if v_biz is null then raise exception 'No existe el local % en esta base.', c_slug; end if;
  select r.id into v_room from public.rooms r where r.business_id = v_biz and r.parent_room_id is null and r.is_active order by r.is_main desc, r.sort asc nulls last, r.created_at asc limit 1;
  if v_room is null then raise exception 'El local % no tiene sala principal.', c_slug; end if;

  -- 0. las cinco cuentas deben existir ANTES de escribir nada
  for v_acc in select * from (values ('jchatreview', 'reviewer'), ('jchatreview2', 'reviewer'), ('test', 'qa'), ('test1', 'qa'), ('test002', 'qa')) as t(u, k) loop
    if not exists (select 1 from public.users where lower(username) = v_acc.u) then
      raise exception 'No existe la cuenta @% : créala primero (ver RUNBOOK-revisor.md).', v_acc.u;
    end if;
  end loop;

  -- 1. grupo de prueba: cuentas reales y el local (directo en las tablas: este script corre como postgres, sin sesión de super-admin)
  for v_acc in select * from (values ('jchatreview', 'reviewer'), ('jchatreview2', 'reviewer'), ('test', 'qa'), ('test1', 'qa'), ('test002', 'qa')) as t(u, k) loop
    select id into v_uid from public.users where lower(username) = v_acc.u;
    insert into public.review_group_members (user_id, kind, status, note) values (v_uid, v_acc.k, 'active', 'review-seed')
    on conflict (user_id) do update set kind = excluded.kind, status = 'active';
  end loop;
  insert into public.review_group_businesses (business_id, status) values (v_biz, 'active')
  on conflict (business_id) do update set status = 'active';

  -- 2. juegos activados en el local (solo los que el catálogo tiene)
  insert into public.business_games (business_id, game_key, enabled)
  select v_biz, g.key, true from public.games g where g.key in ('match', 'truth_or_dare')
  on conflict (business_id, game_key) do update set enabled = true, updated_at = now();

  -- 3. cuatro personas ficticias
  for v_person in select * from jsonb_array_elements('[
    {"n":1,"user":"demo_alex","name":"Alex D.","gender":"man","bio":"Coffee, vinyl and bad puns.","interests":["music","coffee","movies"]},
    {"n":2,"user":"demo_sam","name":"Sam R.","gender":"woman","bio":"Here for the food and the playlist.","interests":["food","music","travel"]},
    {"n":3,"user":"demo_jordan","name":"Jordan K.","gender":"nonbinary","bio":"Board games and long walks.","interests":["gaming","nature","books"]},
    {"n":4,"user":"demo_riley","name":"Riley M.","gender":"woman","bio":"Always up for karaoke.","interests":["karaoke","dancing","wine"]}]'::jsonb) loop
    v_uid := ('d4000000-0000-4000-8000-0000000003' || lpad(v_person->>'n', 2, '0'))::uuid;
    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            (v_person->>'user') || '@review-seed.invalid', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
    on conflict (id) do nothing;
    insert into public.users (id, username, display_name, bio, language, onboarding_completed, birth_year, age_confirmed_at, terms_accepted_at, terms_version, is_test)
    values (v_uid, v_person->>'user', v_person->>'name', v_person->>'bio', 'en', true, 1994, now(), now(), 'review-seed', true)
    on conflict (id) do update set username = excluded.username, display_name = excluded.display_name, bio = excluded.bio, is_test = true;
    insert into public.review_group_members (user_id, kind, status, note) values (v_uid, 'qa', 'active', 'review-seed fictional person')
    on conflict (user_id) do update set status = 'active';
    insert into public.match_profiles (user_id, gender, seeking) values (v_uid, v_person->>'gender', 'all')
    on conflict (user_id) do update set gender = excluded.gender, seeking = 'all';
    insert into public.user_interests (user_id, interest_key)
    select v_uid, k from jsonb_array_elements_text(v_person->'interests') k where exists (select 1 from public.interests i where i.key = k)
    on conflict do nothing;
    insert into public.match_photos (id, user_id, path, sort, status, reviewed_at)
    values (('d4000000-0000-4000-8000-0000000006' || lpad(v_person->>'n', 2, '0'))::uuid, v_uid, 'demo/review-seed/demo-' || (v_person->>'n') || '.png', 0, 'approved', now())
    on conflict (id) do update set status = 'approved';
    -- presencia 14 días (chat, Match) y alta en Match
    insert into public.room_geo_presence (room_id, user_id, expires_at, last_seen_at) values (v_room, v_uid, now() + interval '14 days', now())
    on conflict (room_id, user_id) do update set expires_at = excluded.expires_at, last_seen_at = excluded.last_seen_at;
    insert into public.game_optins (user_id, business_id, game_key) select v_uid, v_biz, 'match' where exists (select 1 from public.games where key = 'match')
    on conflict do nothing;
    insert into public.match_presence (user_id, business_id, entered_at, last_seen_at, expires_at, active_since, method)
    values (v_uid, v_biz, now(), now(), now() + interval '14 days', now(), 'geo')
    on conflict (user_id, business_id) do update set expires_at = excluded.expires_at, last_seen_at = excluded.last_seen_at, active_since = coalesce(public.match_presence.active_since, now());
  end loop;

  -- 4. la cuenta 2: perfil de Match mínimo, solo si no tiene
  select id into v_reviewer2 from public.users where lower(username) = 'jchatreview2';
  insert into public.match_profiles (user_id, gender, seeking) values (v_reviewer2, 'nonbinary', 'all') on conflict (user_id) do nothing;

  -- 5. tres mensajes en el chat
  for v_msg in select * from jsonb_array_elements('[
    {"n":1,"u":1,"m":40,"b":"Welcome to JChat Demo Lounge! 👋"},
    {"n":2,"u":2,"m":22,"b":"The lemonade here is great, try it."},
    {"n":3,"u":4,"m":9,"b":"Anyone up for Truth or Dare later?"}]'::jsonb) loop
    insert into public.messages (id, room_id, user_id, body, type, created_at)
    values (('d4000000-0000-4000-8000-0000000004' || lpad(v_msg->>'n', 2, '0'))::uuid, v_room,
            ('d4000000-0000-4000-8000-0000000003' || lpad(v_msg->>'u', 2, '0'))::uuid, v_msg->>'b', 'text', now() - ((v_msg->>'m')::int * interval '1 minute'))
    on conflict (id) do nothing;
  end loop;

  -- 6. dos ofertas (30 días; repetir el script las renueva)
  for v_off in select * from jsonb_array_elements('[
    {"n":1,"title":"2x1 Lemonade","body":"Two lemonades for the price of one. Review demo.","discount":"2x1","code":"DEMO2X1"},
    {"n":2,"title":"10% off your first order","body":"Valid on any food item. Review demo.","discount":"10%","code":"DEMO10"}]'::jsonb) loop
    insert into public.offers (id, business_id, room_id, title, description, discount, code, is_active, status, expires_at)
    values (('d4000000-0000-4000-8000-0000000005' || lpad(v_off->>'n', 2, '0'))::uuid, v_biz, v_room, v_off->>'title', v_off->>'body', v_off->>'discount', v_off->>'code',
            true, 'active', now() + interval '30 days')
    on conflict (id) do update set is_active = true, status = 'active', expires_at = excluded.expires_at;
  end loop;

  -- 7. menú: hasta 6 productos en total (solo si faltan)
  select count(*) into v_have from public.menu_items where business_id = v_biz and not (id::text like 'd4000000-%');
  if v_have < 6 then
    insert into public.menu_categories (id, business_id, name, sort, is_published) values (v_cat, v_biz, 'Demo menu', 99, true) on conflict (id) do nothing;
    v_n := 0;
    for v_item in select * from jsonb_array_elements('[
      {"n":1,"name":"Margherita Pizza","d":"Tomato, mozzarella and basil.","p":1200},
      {"n":2,"name":"Chicken Wings","d":"Six wings with house sauce.","p":1100},
      {"n":3,"name":"Caesar Salad","d":"Romaine, parmesan and croutons.","p":900},
      {"n":4,"name":"French Fries","d":"Crispy, with ketchup.","p":500},
      {"n":5,"name":"Lemonade","d":"Fresh lemonade.","p":400},
      {"n":6,"name":"Sparkling Water","d":"330 ml bottle.","p":300}]'::jsonb) loop
      exit when v_have + v_n >= 6;
      insert into public.menu_items (id, category_id, business_id, name, description, price_cents, is_available, is_published, id_required, sort)
      values (('d4000000-0000-4000-8000-0000000002' || lpad(v_item->>'n', 2, '0'))::uuid, v_cat, v_biz, v_item->>'name', v_item->>'d', (v_item->>'p')::int, true, true, false, (v_item->>'n')::bigint)
      on conflict (id) do nothing;
      v_n := v_n + 1;
    end loop;
  end if;
end
$seed$;
