-- 242 — comprobación DESPUÉS de aplicar supabase/migrations/242_gift_server_rules.sql.
-- Las secciones (a) a (d) NO ESCRIBEN NADA: solo select. La (e) es OPCIONAL y SÍ escribe, pero dentro de una transacción que se
-- DESHACE (rollback) al final: prueba el contador de rechazos con una oferta inventada. Cada sección dice qué resultado se espera.

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (a) Permisos.   Esperado: register: anon = false · authenticated = false · service_role = true
--                           create:   anon = false · authenticated = true
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select
  has_function_privilege('anon',          'public.gift_offer_register_payment_failure(text, text)', 'execute') as register_anon,
  has_function_privilege('authenticated', 'public.gift_offer_register_payment_failure(text, text)', 'execute') as register_authenticated,
  has_function_privilege('service_role',  'public.gift_offer_register_payment_failure(text, text)', 'execute') as register_service_role,
  has_function_privilege('anon',          'public.gift_offer_create(uuid, uuid, jsonb, text, uuid)', 'execute') as create_anon,
  has_function_privilege('authenticated', 'public.gift_offer_create(uuid, uuid, jsonb, text, uuid)', 'execute') as create_authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (b) Columnas nuevas.   Esperado: last_payment_error (text, nullable) · payment_failures (integer, NOT NULL, default 0)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'gift_offers' and column_name in ('last_payment_error', 'payment_failures')
order by column_name;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (c) Las reglas están en las funciones (se lee su texto; no se ejecuta nada).
--     Esperado:  limite_cuenta_held_at = true · pendiente_solo_held_y_accepted = true · cancela_las_abiertas = true ·
--                caduca_a_los_15_min_al_crear = true · expire_usa_expires_at = true · expire_ya_no_usa_30_min = true
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select
  position('g.held_at > now() - interval ''1 hour''' in pg_get_functiondef('public.gift_offer_create(uuid, uuid, jsonb, text, uuid)'::regprocedure)) > 0 as limite_cuenta_held_at,
  position('g.status in (''held'',''accepted'')'     in pg_get_functiondef('public.gift_offer_create(uuid, uuid, jsonb, text, uuid)'::regprocedure)) > 0 as pendiente_solo_held_y_accepted,
  position('set status = ''cancelled'' where from_user_id = v_uid' in pg_get_functiondef('public.gift_offer_create(uuid, uuid, jsonb, text, uuid)'::regprocedure)) > 0 as cancela_las_abiertas,
  position('now() + interval ''15 minutes''' in pg_get_functiondef('public.gift_offer_create(uuid, uuid, jsonb, text, uuid)'::regprocedure)) > 0 as caduca_a_los_15_min_al_crear,
  position('coalesce(expires_at, created_at + interval ''15 minutes'')' in pg_get_functiondef('public.gift_offers_expire()'::regprocedure)) > 0 as expire_usa_expires_at,
  position('30 minutes' in pg_get_functiondef('public.gift_offers_expire()'::regprocedure)) = 0 as expire_ya_no_usa_30_min;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (d) Lo que hay hoy y cómo lo vería la regla nueva (solo lectura).
--     Esperado: las ofertas 'cancelled' sin held_at (las de las pruebas) YA NO cuentan para el límite de 3 por hora.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select status,
       count(*)                                            as ofertas,
       count(*) filter (where held_at is not null)         as con_held_at,
       count(*) filter (where held_at > now() - interval '1 hour') as cuentan_para_el_limite_ahora
from public.gift_offers
group by status
order by ofertas desc;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (e) OPCIONAL · ESCRIBE Y DESHACE. Quita los "-- " de las líneas de abajo, selecciónalas TODAS (de "begin;" a "rollback;") y
--     ejecútalas juntas, en una sola ejecución.
--     Crea una oferta inventada en awaiting_payment y le registra 4 rechazos; al final se hace rollback: no queda nada.
--     Esperado, en este orden:
--       1) {"ok":true,"status":"awaiting_payment","failures":1}
--       2) {"ok":true,"status":"awaiting_payment","failures":2}
--       3) {"ok":true,"status":"cancelled","failures":3}
--       4) un 4.º rechazo ya no cambia nada: {"ok":true,"status":"cancelled","failures":3}
--     (El trigger de cancelación intenta avisar a gift-worker con el PaymentIntent inventado 'pi_check_242'; esa petición forma parte de la
--      transacción, así que el rollback la descarta. Si llegara a salir, gift-worker responde error porque ese PaymentIntent no existe.)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- begin;
-- insert into public.gift_offers (business_id, from_user_id, to_user_id, items, status, stripe_pi_id, expires_at)
-- select b.id,
--        (select id from public.users order by created_at, id limit 1),
--        (select id from public.users order by created_at, id offset 1 limit 1),
--        '[]'::jsonb, 'awaiting_payment', 'pi_check_242', now() + interval '15 minutes'
-- from public.businesses b where b.slug = 'bar-xzx-omd2';
-- select public.gift_offer_register_payment_failure('pi_check_242', 'card_declined: Your card was declined.');
-- select public.gift_offer_register_payment_failure('pi_check_242', 'card_declined: Your card was declined.');
-- select public.gift_offer_register_payment_failure('pi_check_242', 'card_declined: Your card was declined.');
-- select public.gift_offer_register_payment_failure('pi_check_242', 'card_declined: Your card was declined.');
-- rollback;
