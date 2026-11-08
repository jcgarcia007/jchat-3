-- 272_check.sql — comprobación de SOLO LECTURA tras aplicar 272 (outbound_emails para suscripciones y ventas@). Sin efectos.
select pg_get_constraintdef(oid) as kind_chk   -- esperado: los 4 kinds
  from pg_constraint where conrelid = 'public.outbound_emails'::regclass and conname = 'outbound_emails_kind_chk';
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'outbound_emails' and column_name in ('to_email', 'reply_to', 'dedupe_key') order by 1;   -- 3 filas
select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'outbound_emails' and indexname = 'outbound_emails_dedupe_key_uq';   -- unique, sin WHERE
select tgname, tgenabled from pg_trigger where tgrelid = 'public.outbound_emails'::regclass and tgname = 'trg_outbound_emails_require_recipient';   -- O (habilitado)
select p.proname, p.prosecdef as security_definer, p.proconfig as config,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec, has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
  from pg_proc p where p.proname = 'submit_business_plan_request';   -- t / {search_path=public, extensions} / t / t
select position('business_plan_request' in pg_get_functiondef('public.submit_business_plan_request(text,integer,text,text,text,text,text)'::regprocedure)) > 0 as rpc_encola_correo;   -- t
select count(*) filter (where status = 'pending') as pendientes, count(*) as total from public.outbound_emails;   -- solo lectura
