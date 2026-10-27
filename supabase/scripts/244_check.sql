-- 244 — comprobación DESPUÉS de aplicar supabase/migrations/244_gift_failure_rate_limit.sql.
-- Las secciones (a) a (d) NO ESCRIBEN NADA: solo select. La (e) es OPCIONAL y escribe SOLO dentro de una transacción que se DESHACE.

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (a) Permisos.   Esperado: anon = false · authenticated = true
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select
  has_function_privilege('anon',          'public.gift_offer_create(uuid, uuid, jsonb, text, uuid)', 'execute') as create_anon,
  has_function_privilege('authenticated', 'public.gift_offer_create(uuid, uuid, jsonb, text, uuid)', 'execute') as create_authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (b) El tope nuevo está en la función y las reglas de la 242 siguen (se lee el texto; no se ejecuta nada).
--     Esperado: todo true.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select
  position('coalesce(sum(g.payment_failures), 0)' in def) > 0                                              as tope_rechazos_presente,
  position('g.created_at > now() - interval ''1 hour''' in def) > 0                                         as ventana_1_hora,
  position(') >= 5 then' in def) > 0                                                                        as limite_5,
  position('g.held_at > now() - interval ''1 hour''' in def) > 0                                            as sigue_limite_3_por_held_at,
  position('g.status in (''held'',''accepted'')' in def) > 0                                                as sigue_pendiente_held_y_accepted,
  position('set status = ''cancelled'' where from_user_id = v_uid' in def) > 0                              as sigue_cancelando_las_abiertas,
  position('now() + interval ''15 minutes''' in def) > 0                                                    as sigue_caducando_a_15_min,
  -- el tope va DESPUÉS del límite de 3 por hora
  position('g.held_at > now() - interval ''1 hour''' in def) < position('coalesce(sum(g.payment_failures), 0)' in def) as tope_va_despues_del_limite_de_3
from (select pg_get_functiondef('public.gift_offer_create(uuid, uuid, jsonb, text, uuid)'::regprocedure) as def) f;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (c) Quién se acercaría al tope hoy (solo lectura): rechazos en la última hora por usuario, de mayor a menor.
--     Esperado: nadie con 5 o más salvo que de verdad esté probando tarjetas.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select from_user_id, sum(payment_failures) as rechazos_1h, count(*) as ofertas_1h
from public.gift_offers
where created_at > now() - interval '1 hour'
group by from_user_id
having sum(payment_failures) > 0
order by rechazos_1h desc
limit 10;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (d) Cómo queda el estado de las ofertas hoy (solo lectura).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select status, count(*) as ofertas, coalesce(sum(payment_failures), 0) as rechazos
from public.gift_offers
group by status
order by ofertas desc;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (e) OPCIONAL · ESCRIBE Y DESHACE. Quita los "-- " de las líneas de abajo, cambia <UID> (alguien con presencia vigente en un local),
--     <OTRO_UID> (otra persona presente en ese mismo local) y <BUSINESS_ID>, selecciona de "begin;" a "rollback;" y ejecútalo junto.
--     Crea dos ofertas inventadas del usuario con 3 + 2 rechazos y llama a gift_offer_create como ese usuario.
--     Esperado: ERROR gift_rate_limit (42501). Al final el rollback no deja nada.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- begin;
-- insert into public.gift_offers (business_id, from_user_id, to_user_id, items, status, payment_failures)
-- values ('<BUSINESS_ID>', '<UID>', '<OTRO_UID>', '[]'::jsonb, 'cancelled', 3), ('<BUSINESS_ID>', '<UID>', '<OTRO_UID>', '[]'::jsonb, 'cancelled', 2);
-- select set_config('request.jwt.claims', json_build_object('sub', '<UID>', 'role', 'authenticated')::text, true);
-- set local role authenticated;
-- select public.gift_offer_create('<BUSINESS_ID>'::uuid, '<OTRO_UID>'::uuid, '[{"menu_item_id":"00000000-0000-0000-0000-000000000000","qty":1}]'::jsonb);
-- rollback;
