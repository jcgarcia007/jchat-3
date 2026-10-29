-- 251: tablas nuevas de `public` sin TRUNCATE / REFERENCES / TRIGGER para anon y authenticated, las cree el rol que las cree.
-- BORRADOR PARA REVISIÓN: NO está aplicada en Supabase. La aplica Juan Carlos por MCP.
-- Reversión: supabase/rollbacks/251_default_privileges_rollback.sql · Comprobación: supabase/scripts/251_check.sql · Prueba local: supabase/tests/12_default_privileges.sql
--
-- Contexto: la 248 quitó esos tres permisos de las tablas EXISTENTES y de los permisos por defecto del rol `postgres`. Queda el rol
-- `supabase_admin`, cuyos permisos por defecto en `public` siguen dando arwdDxtm (incluidos TRUNCATE, REFERENCES y TRIGGER) a anon y
-- authenticated. Solo importa para tablas que cree `supabase_admin` (la plataforma, no nosotros: todas las tablas actuales son de `postgres`).
--
-- Por qué no es un `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin …`: el rol que usa MCP y el SQL Editor (`postgres`) NO puede ejecutarlo
-- (en local da "permission denied to change default privileges": no es superusuario ni miembro de supabase_admin). Esta migración usa un
-- EVENT TRIGGER que, al terminar un CREATE TABLE en `public`, revoca esos tres permisos de la tabla nueva. Cubre cualquier rol que cree
-- tablas (hoy solo hay permisos por defecto en `public` para `postgres` y `supabase_admin`; ningún otro rol los tiene).
--
-- No destructiva e idempotente: create or replace + un create event trigger protegido por una comprobación en pg_event_trigger.
-- Si en producción `postgres` no pudiera crear event triggers, el `create event trigger` falla y la migración entera se revierte (nada cambia).
-- El trigger nunca bloquea un CREATE TABLE: si el revoke fallara, lo deja como aviso (warning).

create or replace function public.revoke_dangerous_table_grants()
returns event_trigger
language plpgsql
as $$
declare
  r record;
begin
  for r in
    select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type = 'table'
      and schema_name = 'public'
  loop
    begin
      execute format('revoke truncate, references, trigger on table %s from anon, authenticated', r.object_identity);
    exception when others then
      raise warning 'revoke_dangerous_table_grants: % (%)', r.object_identity, sqlerrm;
    end;
  end loop;
end
$$;

-- no es una función para la API: nadie la llama a mano (y un event trigger no se puede invocar como RPC)
revoke execute on function public.revoke_dangerous_table_grants() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'revoke_dangerous_table_grants') then
    create event trigger revoke_dangerous_table_grants
      on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.revoke_dangerous_table_grants();
  end if;
end
$$;
