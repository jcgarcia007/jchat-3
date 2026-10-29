-- 251 (draft): a new table of `public` does not give TRUNCATE / REFERENCES / TRIGGER to anon and authenticated, whoever creates it. LOCAL ONLY.
-- supabase_admin cannot be impersonated here, so its default privileges are emulated on the `postgres` role (rolled back with the transaction):
-- a table created under them gets the dangerous grants BEFORE 251 and does not AFTER it.
alter default privileges for role postgres in schema public grant truncate, references, trigger on tables to anon, authenticated;

create table public.t251_before (id int);
select pg_temp.t_ok(
  (select count(*) from information_schema.table_privileges where table_name = 't251_before' and grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')) = 6,
  'BEFORE · a table created under supabase_admin-like defaults gives TRUNCATE, REFERENCES and TRIGGER to anon and authenticated (flaw present today)');

-- @apply 251_default_privileges.sql

create table public.t251_after (id int);
select pg_temp.t_ok(
  (select count(*) from information_schema.table_privileges where table_name = 't251_after' and grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')) = 0,
  'AFTER · the same kind of table no longer gives them');
select pg_temp.t_ok(
  (select count(*) from information_schema.table_privileges where table_name = 't251_after' and grantee in ('anon', 'authenticated') and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')) = 8,
  'AFTER · SELECT, INSERT, UPDATE and DELETE (what RLS governs) are untouched');

create table public.t251_ctas as select 1 as id;
select pg_temp.t_ok(
  (select count(*) from information_schema.table_privileges where table_name = 't251_ctas' and grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')) = 0,
  'AFTER · CREATE TABLE AS is covered too');

select pg_temp.t_ok((select evtenabled from pg_event_trigger where evtname = 'revoke_dangerous_table_grants') = 'O', 'AFTER · the event trigger is enabled');
select pg_temp.t_ok(not has_function_privilege('authenticated', 'public.revoke_dangerous_table_grants()', 'execute'), 'AFTER · the function is not callable by the API roles');
