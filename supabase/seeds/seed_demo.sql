-- ============================================================
-- JChat 3.0 — Demo seed data
--
-- Creates:
--   50 users  → email domain @seed.jchat.test  (marker)
--   10 businesses → slug prefix seed-           (marker)
--   49 rooms  → 10 main + 39 sub-rooms
--   ~282 room_members (expires_at +48h from seed time)
--   81 messages  (78 text + 3 photo)
--
-- Password for all seed users: SeedPass123!
--
-- To clean up all this data run: supabase/seeds/seed_cleanup.sql
--
-- IDEMPOTENCY: this script is NOT idempotent by default — running it
-- twice creates duplicate users/businesses. Run cleanup first.
--
-- Applied to production on: 2026-06-27
-- ============================================================

-- ── Step 1: 50 seed users (auth + public) ─────────────────────────────────────

DO $$
DECLARE
  v_hash text;
  v_uid  uuid;
  v_row  record;
BEGIN
  v_hash := crypt('SeedPass123!', gen_salt('bf', 10));

  FOR v_row IN
    SELECT * FROM (VALUES
      ('user01@seed.jchat.test','maya_reyes',   'Maya Reyes',       'Miami, FL',       'es'),
      ('user02@seed.jchat.test','carlos_m88',   'Carlos Mendoza',   'Santo Domingo',   'es'),
      ('user03@seed.jchat.test','sofia_v',      'Sofía Vargas',     'Orlando, FL',     'es'),
      ('user04@seed.jchat.test','jake_b',       'Jake Brown',       'Fort Lauderdale', 'en'),
      ('user05@seed.jchat.test','elena_c',      'Elena Castillo',   'Santiago, RD',    'es'),
      ('user06@seed.jchat.test','mike_j',       'Mike Johnson',     'Tampa, FL',       'en'),
      ('user07@seed.jchat.test','lucia_dm',     'Lucía De la Maza', 'Punta Cana, RD',  'es'),
      ('user08@seed.jchat.test','jason_w',      'Jason Williams',   'Jacksonville, FL','en'),
      ('user09@seed.jchat.test','diana_p',      'Diana Peralta',    'Miami Beach, FL', 'es'),
      ('user10@seed.jchat.test','alex_t',       'Alex Torres',      'West Palm Beach', 'es'),
      ('user11@seed.jchat.test','roberto_l',    'Roberto Lara',     'Santo Domingo',   'es'),
      ('user12@seed.jchat.test','sarah_k',      'Sarah Kim',        'Miami, FL',       'en'),
      ('user13@seed.jchat.test','pedro_m',      'Pedro Morel',      'Santiago, RD',    'es'),
      ('user14@seed.jchat.test','ashley_r',     'Ashley Robinson',  'Orlando, FL',     'en'),
      ('user15@seed.jchat.test','jun_w',        'Jun Wang',         'Tampa, FL',       'en'),
      ('user16@seed.jchat.test','valentina_s',  'Valentina Soto',   'Miami, FL',       'es'),
      ('user17@seed.jchat.test','derek_h',      'Derek Harris',     'Fort Lauderdale', 'en'),
      ('user18@seed.jchat.test','isabela_f',    'Isabela Ferreira', 'West Palm Beach', 'es'),
      ('user19@seed.jchat.test','omar_a',       'Omar Abdallah',    'Jacksonville, FL','en'),
      ('user20@seed.jchat.test','anna_n',       'Anna Nguyen',      'Tampa, FL',       'en'),
      ('user21@seed.jchat.test','felix_r',      'Félix Rosario',    'Santo Domingo',   'es'),
      ('user22@seed.jchat.test','chloe_d',      'Chloe Davis',      'Miami Beach, FL', 'en'),
      ('user23@seed.jchat.test','hector_g',     'Héctor González',  'Punta Cana, RD',  'es'),
      ('user24@seed.jchat.test','madison_c',    'Madison Clark',    'Orlando, FL',     'en'),
      ('user25@seed.jchat.test','rafael_b',     'Rafael Báez',      'Santiago, RD',    'es'),
      ('user26@seed.jchat.test','amy_l',        'Amy Lee',          'Miami, FL',       'en'),
      ('user27@seed.jchat.test','marcos_t',     'Marcos Taveras',   'Santo Domingo',   'es'),
      ('user28@seed.jchat.test','brooklyn_w',   'Brooklyn White',   'Fort Lauderdale', 'en'),
      ('user29@seed.jchat.test','jose_m',       'José Martínez',    'Orlando, FL',     'es'),
      ('user30@seed.jchat.test','taylor_m',     'Taylor Moore',     'Tampa, FL',       'en'),
      ('user31@seed.jchat.test','alba_s',       'Alba Silverio',    'Santiago, RD',    'es'),
      ('user32@seed.jchat.test','kevin_ob',     'Kevin O''Brien',   'Jacksonville, FL','en'),
      ('user33@seed.jchat.test','paola_d',      'Paola Díaz',       'Miami Beach, FL', 'es'),
      ('user34@seed.jchat.test','ryan_h',       'Ryan Hughes',      'West Palm Beach', 'en'),
      ('user35@seed.jchat.test','nataly_c',     'Nataly Cruz',      'Punta Cana, RD',  'es'),
      ('user36@seed.jchat.test','ethan_b',      'Ethan Baker',      'Miami, FL',       'en'),
      ('user37@seed.jchat.test','camila_re',    'Camila Reyes',     'Santo Domingo',   'es'),
      ('user38@seed.jchat.test','noah_a',       'Noah Anderson',    'Orlando, FL',     'en'),
      ('user39@seed.jchat.test','adriana_p',    'Adriana Pimentel', 'Santiago, RD',    'es'),
      ('user40@seed.jchat.test','liam_t',       'Liam Thompson',    'Tampa, FL',       'en'),
      ('user41@seed.jchat.test','maria_v',      'María Vásquez',    'Punta Cana, RD',  'es'),
      ('user42@seed.jchat.test','tyler_s',      'Tyler Scott',      'Fort Lauderdale', 'en'),
      ('user43@seed.jchat.test','daniela_m',    'Daniela Mejía',    'Miami Beach, FL', 'es'),
      ('user44@seed.jchat.test','brandon_l',    'Brandon Lewis',    'Jacksonville, FL','en'),
      ('user45@seed.jchat.test','valeria_c',    'Valeria Contreras','Miami, FL',       'es'),
      ('user46@seed.jchat.test','austin_w',     'Austin Walker',    'West Palm Beach', 'en'),
      ('user47@seed.jchat.test','priya_s',      'Priya Sharma',     'Tampa, FL',       'en'),
      ('user48@seed.jchat.test','james_m',      'James Miller',     'Orlando, FL',     'en'),
      ('user49@seed.jchat.test','alejandra_n',  'Alejandra Núñez',  'Santo Domingo',   'es'),
      ('user50@seed.jchat.test','connor_d',     'Connor Davis',     'Miami, FL',       'en')
    ) AS t(email, username, display_name, city, lang)
  LOOP
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      is_sso_user, is_anonymous
    ) VALUES (
      v_uid, 'authenticated', 'authenticated',
      v_row.email, v_hash, now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now() - interval '14 days', now(), false, false
    );
    INSERT INTO public.users (
      id, username, display_name, avatar_url, city, language, onboarding_completed
    ) VALUES (
      v_uid, v_row.username, v_row.display_name,
      'https://i.pravatar.cc/150?u=' || v_row.email,
      v_row.city, v_row.lang, true
    );
  END LOOP;
END $$;


-- ── Step 2: 10 seed businesses ────────────────────────────────────────────────

INSERT INTO public.businesses (
  owner_id, name, slug, description, category,
  address, city, state, country, lat, lng,
  is_verified, is_active, status, dashboard_theme_id,
  plan, icon_emoji, tax_rate
)
SELECT
  a.id AS owner_id,
  d.name, d.slug, d.description, d.category,
  d.address, d.city, d.state, d.country, d.lat, d.lng,
  true, true, 'active', d.theme_id, 'free', d.emoji, 0.08
FROM (VALUES
  ('user01@seed.jchat.test','Bar Aurora',          'seed-bar-aurora',      'Bar de cócteles artesanales con ambiente íntimo',   'bar',        '1205 NW 17th Ave',    'Miami',           'FL','US', 25.7617,-80.2130, 1, '🍸'),
  ('user02@seed.jchat.test','Restaurante Botánica','seed-restaurante-bota','Cocina de autor con ingredientes locales',          'restaurant', 'Calle El Conde 45',   'Santo Domingo',   null,'DO',18.4730,-69.8912, 3, '🌿'),
  ('user03@seed.jchat.test','Café El Sol',         'seed-cafe-el-sol',     'Cafetería boutique con terrazas al aire libre',     'cafe',       '421 Orange Ave',      'Orlando',         'FL','US',28.5420,-81.3790, 5, '☀️'),
  ('user04@seed.jchat.test','Lounge Índigo',       'seed-lounge-indigo',   'Cocktail lounge de autor, música en vivo',          'bar',        '501 Broward Blvd',    'Fort Lauderdale', 'FL','US',26.1200,-80.1450, 7, '🫐'),
  ('user05@seed.jchat.test','Bistró Flambeau',     'seed-bistro-flambeau', 'Bistró francés-caribeño de fusión',                'restaurant', 'Av. Francia 12',      'Santiago',        null,'DO',19.4520,-70.6970, 9, '🔥'),
  ('user06@seed.jchat.test','Tapas Marina',        'seed-tapas-marina',    'Tapas y mariscos frente a la bahía',               'restaurant', '1800 N Dale Mabry',   'Tampa',           'FL','US',27.9550,-82.4622, 2, '🦞'),
  ('user07@seed.jchat.test','Kafé Noire',          'seed-kafe-noire',      'Café de especialidad y jazz nocturno',             'cafe',       'Calle Duarte 88',     'Punta Cana',      null,'DO',18.5820,-68.4060, 4, '☕'),
  ('user08@seed.jchat.test','Cervecería Norte',    'seed-cerveceria-norte','Craft beers locales y food trucks on site',        'bar',        '2020 Beach Blvd',     'Jacksonville',    'FL','US',30.3320,-81.6560, 6, '🍺'),
  ('user09@seed.jchat.test','Sugar Rush Bar',      'seed-sugar-rush',      'Cocktails dulces, instagrameable, música pop',     'bar',        '1100 Collins Ave',    'Miami Beach',     'FL','US',25.7900,-80.1300, 8, '🍭'),
  ('user10@seed.jchat.test','Cocina Criolla',      'seed-cocina-criolla',  'Comida criolla dominicana, auténtica y casera',    'restaurant', 'Ave. Abraham Lincoln','West Palm Beach', 'FL','US',26.7150,-80.0530,10, '🍗')
) AS d(owner_email, name, slug, description, category, address, city, state, country, lat, lng, theme_id, emoji)
JOIN auth.users a ON a.email = d.owner_email;


-- ── Step 3: Main rooms (is_main=true) — qr_token assigned by trigger ─────────

INSERT INTO public.rooms (business_id, name, description, is_main, chat_theme_id, is_active, sort)
SELECT b.id,
  'Main Room', 'Sala principal de ' || b.name,
  true, d.theme_id, true, 0
FROM (VALUES
  ('seed-bar-aurora',        2),('seed-restaurante-bota',  5),
  ('seed-cafe-el-sol',       8),('seed-lounge-indigo',    11),
  ('seed-bistro-flambeau',   3),('seed-tapas-marina',      7),
  ('seed-kafe-noire',       13),('seed-cerveceria-norte',  1),
  ('seed-sugar-rush',        9),('seed-cocina-criolla',    6)
) AS d(slug, theme_id)
JOIN public.businesses b ON b.slug = d.slug;


-- ── Step 4: Sub-rooms (parent_room_id = main room) ───────────────────────────

WITH main_rooms AS (
  SELECT r.id, b.slug AS biz_slug, r.chat_theme_id, r.business_id
  FROM public.rooms r JOIN public.businesses b ON b.id = r.business_id
  WHERE b.slug LIKE 'seed-%' AND r.is_main = true
)
INSERT INTO public.rooms (business_id, parent_room_id, name, description, is_main,
                          chat_theme_id, is_password_protected, is_active, sort)
SELECT mr.business_id, mr.id, d.sub_name, d.sub_desc, false,
       mr.chat_theme_id, d.pw_protected, true, d.sort_order
FROM (VALUES
  ('seed-bar-aurora','Mesa 1','Mesa junto a la barra',false,1),
  ('seed-bar-aurora','Mesa 2','Mesa central, vista al escenario',false,2),
  ('seed-bar-aurora','VIP Aurora','Zona VIP reservada',true,3),
  ('seed-restaurante-bota','Mesa 1','Mesa junto a la ventana',false,1),
  ('seed-restaurante-bota','Mesa 2','Mesa central del salón',false,2),
  ('seed-restaurante-bota','Mesa 3','Mesa del rincón',false,3),
  ('seed-restaurante-bota','Mesa 4','Mesa junto al bar',false,4),
  ('seed-restaurante-bota','Terraza','Terraza al aire libre',false,5),
  ('seed-cafe-el-sol','Mesa 1','Mesa junto al ventanal',false,1),
  ('seed-cafe-el-sol','Mesa 2','Mesa de estudio interior',false,2),
  ('seed-cafe-el-sol','Mesa Privada','Sala de reuniones privada',true,3),
  ('seed-lounge-indigo','Mesa 1','Mesa cerca de la pista',false,1),
  ('seed-lounge-indigo','Mesa 2','Mesa baja con cojines',false,2),
  ('seed-lounge-indigo','Mesa 3','Mesa del balcón',false,3),
  ('seed-lounge-indigo','Booth VIP','Booth privado exclusivo',true,4),
  ('seed-bistro-flambeau','Mesa 1','Mesa junto a la cocina abierta',false,1),
  ('seed-bistro-flambeau','Mesa 2','Mesa del centro',false,2),
  ('seed-bistro-flambeau','Mesa 3','Mesa de la terraza cubierta',false,3),
  ('seed-bistro-flambeau','Mesa 4','Mesa junto al bar',false,4),
  ('seed-bistro-flambeau','Private Dining','Salón privado para eventos',true,5),
  ('seed-tapas-marina','Mesa 1','Mesa frente al mar',false,1),
  ('seed-tapas-marina','Mesa 2','Mesa interior climatizada',false,2),
  ('seed-tapas-marina','Mesa 3','Mesa del muelle',false,3),
  ('seed-tapas-marina','Bar','Taburetes en la barra',false,4),
  ('seed-kafe-noire','Mesa 1','Mesa junto al ventanal',false,1),
  ('seed-kafe-noire','Mesa 2','Mesa del fondo con jazz',false,2),
  ('seed-kafe-noire','Rincón Privado','Zona semi-privada con cortinas',true,3),
  ('seed-cerveceria-norte','Mesa 1','Mesa junto a los barriles',false,1),
  ('seed-cerveceria-norte','Mesa 2','Mesa exterior food truck',false,2),
  ('seed-cerveceria-norte','Mesa 3','Mesa del salón gaming',false,3),
  ('seed-cerveceria-norte','Mesa 4','Mesa de la terraza norte',false,4),
  ('seed-cerveceria-norte','Terraza Norte','Terraza con vista al skyline',false,5),
  ('seed-sugar-rush','Mesa 1','Mesa instagrameable con luces',false,1),
  ('seed-sugar-rush','Mesa 2','Mesa junto al DJ booth',false,2),
  ('seed-sugar-rush','Booth Candy','Booth privado decorado',true,3),
  ('seed-cocina-criolla','Mesa 1','Mesa familiar junto a la entrada',false,1),
  ('seed-cocina-criolla','Mesa 2','Mesa del patio interior',false,2),
  ('seed-cocina-criolla','Mesa 3','Mesa junto a la cocina abierta',false,3),
  ('seed-cocina-criolla','Salón VIP','Salón privado con A/C',true,4)
) AS d(biz_slug, sub_name, sub_desc, pw_protected, sort_order)
JOIN main_rooms mr ON mr.biz_slug = d.biz_slug;


-- ── Steps 5 & 6: room_members + messages ─────────────────────────────────────
-- (generated dynamically — see the applied migration comments above)
-- Re-run these sections from the session transcript or use the cleanup + re-seed workflow.
-- Members: ~282 rows, expiry now()+48h — adjust expires_at on re-seed.
-- Messages: 81 rows (78 text, 3 photo) with staggered timestamps.
