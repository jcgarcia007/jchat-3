-- 247 — comprobación DESPUÉS de aplicar supabase/migrations/247_payment_domains_sync_cron.sql.
-- NO ESCRIBE NADA: todo lo de abajo es select. Cada sección dice qué resultado se espera.

-- (a) El trabajo de cron.   Esperado: 1 fila · schedule = '0 * * * *' · active = true · command llama a public.payment_domains_sync_cron()
select jobname, schedule, active, command from cron.job where jobname = 'payment-domains-sync';

-- (b) Permisos de la función.   Esperado: anon = false · authenticated = false (solo pg_cron, que corre como postgres, y service_role la pueden ejecutar)
select
  has_function_privilege('anon',          'public.payment_domains_sync_cron()', 'execute') as anon_puede,
  has_function_privilege('authenticated', 'public.payment_domains_sync_cron()', 'execute') as authenticated_puede;

-- (c) Definición.   Esperado: security_definer = true · search_path = public, extensions · devuelve bigint
select p.prosecdef as security_definer, p.proconfig as config, pg_get_function_result(p.oid) as devuelve
from pg_proc p where p.oid = 'public.payment_domains_sync_cron()'::regprocedure;

-- (d) Está en el texto de la función (se lee, no se ejecuta).   Esperado: todo true.
select
  position('vault.decrypted_secrets where name = ''push_webhook_secret''' in def) > 0 as lee_el_secreto_del_vault_por_nombre,
  position('if v_secret is null then return null' in def) > 0                         as sin_secreto_no_hace_nada,
  position('functions/v1/payment-domains-sync' in def) > 0                            as llama_a_la_funcion,
  position('x-push-secret' in def) > 0                                                as con_la_cabecera_x_push_secret,
  position('sk_' in def) = 0 and position('eyJ' in def) = 0                           as sin_claves_en_el_texto
from (select pg_get_functiondef('public.payment_domains_sync_cron()'::regprocedure) as def) d;

-- (e) La última respuesta de pg_net (solo lectura; tras la primera hora en punto).   Esperado: status_code 200 una vez desplegada la Edge Function
-- (401 = el secreto del vault no coincide con PUSH_WEBHOOK_SECRET · 404 = la función aún no está desplegada).
select id, status_code, left(content::text, 300) as respuesta, created
from net._http_response order by created desc limit 3;
