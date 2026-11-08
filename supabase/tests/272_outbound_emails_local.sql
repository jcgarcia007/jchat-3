-- Prueba de 272 (outbound_emails para suscripciones + correo a ventas@). LOCAL ÚNICAMENTE; una transacción que termina en ROLLBACK.
-- Requiere un Postgres local con auth.users, los roles anon/authenticated, la tabla outbound_emails de la 265 y las migraciones 269 y 272 ya aplicadas.
-- El schema net (pg_net) no existe en ese Postgres: aquí net.http_post se SIMULA (dentro de la transacción) para ver qué dispararía la RPC; el vault es el real de la imagen.
--   docker exec -i <contenedor> psql -U supabase_admin -d postgres -f - < supabase/tests/272_outbound_emails_local.sql
-- Los "ERROR:" marcados como ESPERADO son lo correcto.
begin;
\set ON_ERROR_STOP off
create schema if not exists net;
create table public.zz_net_calls (url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds integer) returns bigint language sql as
  $f$ insert into public.zz_net_calls values (url, body, headers); select 1::bigint $f$;
select vault.create_secret('secreto-de-prueba', 'push_webhook_secret') is not null as secreto_en_el_vault;   -- el vault real de la imagen; se deshace con el ROLLBACK
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');

\echo '--- 1. el CHECK admite los 4 kinds y rechaza otro (ESPERADO: check_violation en el último)'
savepoint s1;
insert into public.outbound_emails (kind, to_email) values ('subscription_started', 'a@example.test');
insert into public.outbound_emails (kind, to_email) values ('trial_will_end', 'a@example.test');
insert into public.outbound_emails (kind, to_email) values ('business_plan_request', 'a@example.test');
insert into public.outbound_emails (kind, to_email) values ('reservation_cancelled_business_closed', 'a@example.test');
select count(*) as kinds_aceptados from public.outbound_emails where to_email = 'a@example.test';
insert into public.outbound_emails (kind, to_email) values ('otro_kind', 'a@example.test');
rollback to savepoint s1;

\echo '--- 2. destinatario obligatorio al insertar (ESPERADO: error sin user_id ni to_email; ok con to_email)'
savepoint s2;
insert into public.outbound_emails (kind, payload) values ('trial_will_end', '{}');
rollback to savepoint s2;
insert into public.outbound_emails (kind, to_email) values ('trial_will_end', 'b@example.test') returning kind, to_email;

\echo '--- 3. dedupe_key: misma clave dos veces -> una fila; el insert normal repetido da 23505 (ESPERADO); los NULL no chocan'
insert into public.outbound_emails (kind, to_email, dedupe_key) values ('subscription_started', 'c@example.test', 'subscription_started:sub_1') on conflict (dedupe_key) do nothing;
insert into public.outbound_emails (kind, to_email, dedupe_key) values ('subscription_started', 'c@example.test', 'subscription_started:sub_1') on conflict (dedupe_key) do nothing;
select count(*) as filas_con_la_clave from public.outbound_emails where dedupe_key = 'subscription_started:sub_1';
savepoint s3;
insert into public.outbound_emails (kind, to_email, dedupe_key) values ('subscription_started', 'c@example.test', 'subscription_started:sub_1');
rollback to savepoint s3;
insert into public.outbound_emails (kind, to_email) values ('trial_will_end', 'n1@example.test'), ('trial_will_end', 'n2@example.test');
select count(*) as filas_sin_clave_no_chocan from public.outbound_emails where to_email in ('n1@example.test', 'n2@example.test');

\echo '--- 4. una solicitud Custom (anon) -> 1 fila de solicitud + 1 correo a ventas@ con Reply-To y payload correctos'
truncate public.zz_net_calls;
set local role anon;
select public.submit_business_plan_request('Bar Uno', 3, '555-1234', 'Dueno@Example.com', 'hola', 'en', 'iphash-1') as rpc;
reset role;
select r.business_name, r.email from public.business_plan_requests r;
select kind, user_id, to_email, reply_to, dedupe_key, status,
       payload->>'business_name' as p_business, payload->>'locations_count' as p_locales, payload->>'phone' as p_phone, payload->>'email' as p_email,
       payload->>'message' as p_msg, payload->>'locale' as p_locale, (payload->>'request_id')::uuid = (select id from public.business_plan_requests) as request_id_coincide,
       (payload->>'created_at') is not null as tiene_created_at
  from public.outbound_emails where kind = 'business_plan_request' and to_email = 'ventas@jchat.cloud';
\echo '--- 4b. disparo inmediato: UNA llamada a la Edge Function con ese id y el secreto'
select url, body->'ids'->>0 = (select id::text from public.outbound_emails where to_email = 'ventas@jchat.cloud') as id_del_correo, headers->>'x-push-secret' as secreto, jsonb_array_length(body->'ids') as n_ids from public.zz_net_calls;

\echo '--- 5. sin secreto en el vault: el correo se encola y NO hay llamada (lo recoge el cron)'
truncate public.zz_net_calls;
delete from vault.secrets where name = 'push_webhook_secret';
set local role anon;
select public.submit_business_plan_request('Bar Dos', 1, null, 'dos@example.com', null, 'es', 'iphash-2') as rpc;
reset role;
select (select count(*) from public.outbound_emails where to_email = 'ventas@jchat.cloud') as correos_a_ventas_en_cola, (select count(*) from public.zz_net_calls) as llamadas;
select vault.create_secret('secreto-de-prueba', 'push_webhook_secret') is not null as secreto_restaurado;

\echo '--- 6. si el encolado FALLA, la solicitud NO se pierde y se devuelve ok (ESPERADO: WARNING en el log)'
create function public.zz_boom() returns trigger language plpgsql as $f$ begin raise exception 'cola caída'; end $f$;
create trigger zz_boom before insert on public.outbound_emails for each row when (new.kind = 'business_plan_request') execute function public.zz_boom();
set local role anon;
select public.submit_business_plan_request('Bar Tres', 1, null, 'tres@example.com', null, 'es', 'iphash-3') as rpc;
reset role;
select (select count(*) from public.business_plan_requests where email = 'tres@example.com') as solicitud_guardada, (select count(*) from public.outbound_emails where payload->>'business_name' = 'Bar Tres') as correo_encolado;
drop trigger zz_boom on public.outbound_emails;

\echo '--- 7. con sesión (authenticated): user_id de la solicitud; el límite de 3/hora y INVALID siguen como en la 269'
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000d1', true);
set local role authenticated;
select public.submit_business_plan_request('Con Sesion', 2, null, 'sesion@example.com', null, 'es', null) as rpc;
select public.submit_business_plan_request('x', 2, null, 'sesion@example.com', null, 'es', null) as rpc2;
select public.submit_business_plan_request('x', 2, null, 'sesion@example.com', null, 'es', null) as rpc3;
select public.submit_business_plan_request('x', 2, null, 'sesion@example.com', null, 'es', null) as rpc4_debe_ser_RATE_LIMIT;
select public.submit_business_plan_request('', 2, null, 'ok@example.com', null, 'es', null) as invalid_nombre_vacio;
reset role;
select user_id is not null as con_user_id from public.business_plan_requests where email = 'sesion@example.com' order by created_at limit 1;

\echo '--- 8. borrar la cuenta de un cliente con correos en la cola (user_id ON DELETE SET NULL): con el trigger funciona'
insert into public.outbound_emails (kind, user_id) values ('trial_will_end', '00000000-0000-4000-8000-0000000000d1');
savepoint s8;
delete from auth.users where id = '00000000-0000-4000-8000-0000000000d1';
select count(*) as correos_que_quedan_sin_user_id from public.outbound_emails where kind = 'trial_will_end' and user_id is null and to_email is null;
rollback to savepoint s8;
\echo '--- 8b. CONTRAPRUEBA: con el CHECK de tabla que pedía la instrucción, ese mismo borrado FALLA (ESPERADO: check_violation)'
savepoint s8b;
alter table public.outbound_emails add constraint zz_tmp_recipient_chk check (user_id is not null or to_email is not null) not valid;
delete from auth.users where id = '00000000-0000-4000-8000-0000000000d1';
rollback to savepoint s8b;
rollback;
