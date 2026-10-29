-- JChat Demo — local de demostración para los revisores de Apple y Google. NO ES UNA MIGRACIÓN: lo ejecuta Juan Carlos por MCP DESPUÉS de revisarlo.
-- Reversión: supabase/scripts/demo_venue_teardown.sql · Prueba local: bash supabase/scripts/test_demo_venue_local.sh
--
-- ANTES DE EJECUTARLO (dos marcadores a sustituir en el texto, con el valor entre comillas simples tal cual):
--   :reviewer_user_id        el user_id de la cuenta del revisor (se crea por Auth/la app, NO por SQL). Pasa a ser DUEÑA de "JChat Demo".
--   :stripe_test_account_id  (opcional) el acct_… de una cuenta Stripe Connect en MODO TEST ya creada por ti; si lo dejas tal cual, el local se crea
--                            sin cuenta de pagos y los pedidos con tarjeta no funcionarán hasta que la pongas (ver docs/app-review/notas-revisor-apple.md).
--
-- Por qué la dueña entra sin GPS: check_geofence_and_join_room (245_baseline.sql:568) devuelve acceso con reason 'owner' si
-- businesses.owner_id = auth.uid(), sin comprobar distancia ("única excepción de la regla de oro: el dueño de ESE negocio").
--
-- Qué crea (ids fijos d3…, así que es idempotente: se puede ejecutar varias veces):
--   · el local "JChat Demo" (subdominio jchat-demo), verificado, abierto 24 h, en Apple Park (Cupertino), radio por defecto
--   · sala principal, 6 mesas T1–T6, 2 categorías y 10 productos (2 con id_required: cerveza y vino)
--   · 4 personas ficticias (users.is_test = true, sin foto: la app muestra iniciales) y 8 mensajes de bienvenida en el chat
--   · Match y Verdad o Reto activados en el local, y PRESENCIA de 14 días para la revisora y las 4 personas (room_geo_presence + match_presence).
--     Por qué: el dueño entra al chat sin GPS pero eso NO le da presencia (venue_presence_ok mira room_geo_presence), y los regalos, Match y
--     Verdad o Reto exigen presencia. Sin estas filas la revisora vería el chat pero no podría probar nada más. Vuelve a ejecutar el seed para renovar los 14 días.
-- Qué toca de la cuenta del revisor: SOLO su plan (users.plan = 'business'), porque el límite de locales por plan (enforce_business_limit) da 0 locales
-- a una cuenta 'regular'. No toca nada más de ella.

do $demo$
declare
  v_reviewer_txt text := ':reviewer_user_id';
  v_stripe_txt   text := ':stripe_test_account_id';
  v_reviewer     uuid;
  v_stripe       text;
  v_biz  constant uuid := 'd3000000-0000-4000-8000-000000000001';
  v_room constant uuid := 'd3000000-0000-4000-8000-000000000002';
  v_cat_food constant uuid := 'd3000000-0000-4000-8000-0000000000c1';
  v_cat_drink constant uuid := 'd3000000-0000-4000-8000-0000000000c2';
  v_day text;
  v_hours jsonb := '{}'::jsonb;
  v_people constant jsonb := '[
    {"n":1,"user":"demo_alex","name":"Alex D."},
    {"n":2,"user":"demo_sam","name":"Sam R."},
    {"n":3,"user":"demo_jordan","name":"Jordan K."},
    {"n":4,"user":"demo_riley","name":"Riley M."}]';
  v_person jsonb;
  v_uid uuid;
  v_item jsonb;
  v_msg jsonb;
begin
  -- 1. the reviewer
  if v_reviewer_txt !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'Sustituye :reviewer_user_id por el user_id (uuid) de la cuenta del revisor, entre comillas simples.';
  end if;
  v_reviewer := v_reviewer_txt::uuid;
  if not exists (select 1 from public.users where id = v_reviewer) then
    raise exception 'No existe public.users para % : crea primero la cuenta del revisor desde la app o Auth.', v_reviewer;
  end if;
  v_stripe := case when v_stripe_txt ~ '^acct_[A-Za-z0-9]+$' then v_stripe_txt else null end;

  -- 2. plan of the reviewer (the business-limit trigger gives a 'regular' account 0 businesses)
  update public.users set plan = 'business', plan_status = 'active'
   where id = v_reviewer and coalesce(role, '') <> 'super_admin' and coalesce(plan, '') not in ('business', 'pro');

  -- 3. opening hours: every day 00:00–23:59 (the dashboard's "all day")
  foreach v_day in array array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] loop
    v_hours := v_hours || jsonb_build_object(v_day, jsonb_build_object('open', '00:00', 'close', '23:59', 'closed', false));
  end loop;

  -- 4. the business (owner = the reviewer)
  -- (insert OR update, not "on conflict do update": the business-limit trigger runs before the conflict is resolved and would count the row itself)
  if not exists (select 1 from public.businesses where id = v_biz) then
    insert into public.businesses (id, owner_id, name, slug, subdomain, description, category, address, city, state, country, lat, lng, geofence_radius_m,
                                   is_active, is_verified, status, verified_at, hours, timezone, menu_enabled, menu_mode, pickup_enabled, tips_enabled,
                                   icon_emoji, stripe_account_id)
    values (v_biz, v_reviewer, 'JChat Demo', 'jchat-demo', 'jchat-demo',
            'Demo venue for the App Store and Google Play review. Not a real business.', 'restaurant',
            'One Apple Park Way', 'Cupertino', 'CA', 'US', 37.3349, -122.0090, 50,
            true, true, 'verified', now(), v_hours, 'America/Los_Angeles', true, 'web', true, true, '🍽️', v_stripe);
  else
    update public.businesses
       set owner_id = v_reviewer, is_active = true, is_verified = true, status = 'verified', hours = v_hours,
           menu_enabled = true, pickup_enabled = true, stripe_account_id = coalesce(v_stripe, stripe_account_id)
     where id = v_biz;
  end if;

  -- 5. main room
  insert into public.rooms (id, business_id, name, is_main, chat_theme_id, slug)
  values (v_room, v_biz, 'Main Room', true, 1, 'jchat-demo-main')
  on conflict (id) do nothing;

  -- 6. tables T1–T6 (qr_token and short_code are filled by their triggers)
  for i in 1..6 loop
    insert into public.tables (id, business_id, label, seats, sort, is_active, room_id)
    values (('d3000000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid, v_biz, 'T' || i, 4, i, true, v_room)
    on conflict (id) do nothing;
  end loop;

  -- 7. menu
  insert into public.menu_categories (id, business_id, name, sort, is_published) values
    (v_cat_food, v_biz, 'Food', 1, true), (v_cat_drink, v_biz, 'Drinks', 2, true)
  on conflict (id) do nothing;
  for v_item in select * from jsonb_array_elements('[
    {"n":1,"cat":"f","name":"Margherita Pizza","d":"Tomato, mozzarella and basil.","p":1200,"id":false},
    {"n":2,"cat":"f","name":"Chicken Wings","d":"Six wings with house sauce.","p":1100,"id":false},
    {"n":3,"cat":"f","name":"Caesar Salad","d":"Romaine, parmesan and croutons.","p":900,"id":false},
    {"n":4,"cat":"f","name":"Veggie Burger","d":"Plant-based patty with fries.","p":1300,"id":false},
    {"n":5,"cat":"f","name":"French Fries","d":"Crispy, with ketchup.","p":500,"id":false},
    {"n":6,"cat":"d","name":"Lemonade","d":"Fresh lemonade.","p":400,"id":false},
    {"n":7,"cat":"d","name":"Iced Tea","d":"Unsweetened.","p":400,"id":false},
    {"n":8,"cat":"d","name":"Sparkling Water","d":"330 ml bottle.","p":300,"id":false},
    {"n":9,"cat":"d","name":"Draft Beer","d":"Pint. 21+ with ID.","p":700,"id":true},
    {"n":10,"cat":"d","name":"Glass of Red Wine","d":"House red. 21+ with ID.","p":900,"id":true}]'::jsonb) loop
    insert into public.menu_items (id, category_id, business_id, name, description, price_cents, is_available, is_published, id_required, sort)
    values (('d3000000-0000-4000-8000-0000000002' || lpad((v_item->>'n'), 2, '0'))::uuid,
            case when v_item->>'cat' = 'f' then v_cat_food else v_cat_drink end, v_biz,
            v_item->>'name', v_item->>'d', (v_item->>'p')::int, true, true, (v_item->>'id')::boolean, (v_item->>'n')::bigint)
    on conflict (id) do nothing;
  end loop;

  -- 8. four fictional people (is_test = true; no photo → the app draws initials)
  for v_person in select * from jsonb_array_elements(v_people) loop
    v_uid := ('d3000000-0000-4000-8000-0000000003' || lpad(v_person->>'n', 2, '0'))::uuid;
    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            (v_person->>'user') || '@jchat-demo.invalid', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
    on conflict (id) do nothing;
    insert into public.users (id, username, display_name, bio, language, onboarding_completed, birth_year, age_confirmed_at, terms_accepted_at, terms_version, is_test)
    values (v_uid, v_person->>'user', v_person->>'name', 'Demo person for the app review.', 'en', true, 1995, now(), now(), 'demo', true)
    on conflict (id) do update set display_name = excluded.display_name, is_test = true;
  end loop;

  -- 9. a few messages so the chat is not empty
  for v_msg in select * from jsonb_array_elements('[
    {"n":1,"u":1,"m":45,"b":"Welcome to JChat Demo! 👋"},
    {"n":2,"u":2,"m":38,"b":"Hi everyone, first time here."},
    {"n":3,"u":3,"m":31,"b":"The veggie burger is great."},
    {"n":4,"u":4,"m":24,"b":"Anyone up for a round of Truth or Dare later?"},
    {"n":5,"u":1,"m":18,"b":"Sure! I will start one in a bit."},
    {"n":6,"u":2,"m":12,"b":"Table 3 is free if you want to join us."},
    {"n":7,"u":3,"m":7,"b":"Thanks! Coming over."},
    {"n":8,"u":4,"m":3,"b":"Lemonade here is really good too."}]'::jsonb) loop
    insert into public.messages (id, room_id, user_id, body, type, created_at)
    values (('d3000000-0000-4000-8000-0000000004' || lpad(v_msg->>'n', 2, '0'))::uuid, v_room,
            ('d3000000-0000-4000-8000-0000000003' || lpad(v_msg->>'u', 2, '0'))::uuid, v_msg->>'b', 'text',
            now() - ((v_msg->>'m')::int * interval '1 minute'))
    on conflict (id) do nothing;
  end loop;

  -- 10. games on, and 14 days of presence so a remote reviewer can try gifts, Match and Truth or Dare (see the header)
  -- only for the games the catalog (public.games) really has: production has both; a bare local database may not
  insert into public.business_games (business_id, game_key, enabled)
  select v_biz, g.key, true from public.games g where g.key in ('match', 'truth_or_dare')
  on conflict (business_id, game_key) do update set enabled = true, updated_at = now();
  insert into public.room_geo_presence (room_id, user_id, expires_at, last_seen_at)
  select v_room, u, now() + interval '14 days', now()
    from unnest(array[v_reviewer,
      'd3000000-0000-4000-8000-000000000301'::uuid, 'd3000000-0000-4000-8000-000000000302'::uuid,
      'd3000000-0000-4000-8000-000000000303'::uuid, 'd3000000-0000-4000-8000-000000000304'::uuid]) as u
  on conflict (room_id, user_id) do update set expires_at = excluded.expires_at, last_seen_at = excluded.last_seen_at;
  insert into public.game_optins (user_id, business_id, game_key)
  select u, v_biz, 'match' from unnest(array[
      'd3000000-0000-4000-8000-000000000301'::uuid, 'd3000000-0000-4000-8000-000000000302'::uuid,
      'd3000000-0000-4000-8000-000000000303'::uuid, 'd3000000-0000-4000-8000-000000000304'::uuid]) as u
  where exists (select 1 from public.games where key = 'match')
  on conflict do nothing;
  insert into public.match_presence (user_id, business_id, entered_at, last_seen_at, expires_at, active_since, method)
  select u, v_biz, now(), now(), now() + interval '14 days', now(), 'geo' from unnest(array[
      'd3000000-0000-4000-8000-000000000301'::uuid, 'd3000000-0000-4000-8000-000000000302'::uuid,
      'd3000000-0000-4000-8000-000000000303'::uuid, 'd3000000-0000-4000-8000-000000000304'::uuid]) as u
  on conflict (user_id, business_id) do update set expires_at = excluded.expires_at, last_seen_at = excluded.last_seen_at, active_since = coalesce(public.match_presence.active_since, now());
end
$demo$;
