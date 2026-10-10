-- Versionada tal cual está en producción (supabase_migrations.schema_migrations, versión 20261010014302). APLICADA 2026-10-10.
-- 215: marca de usuario de prueba (scripts/test-users). Reescrita sin DROP.
-- users.is_test lo pone solo service_role (script seed). Un cliente autenticado no puede cambiarlo.
-- Rollback (SQL Editor): drop trigger trg_users_is_test_guard on public.users; drop function public.users_is_test_guard();
--   drop index if exists public.users_is_test_idx; alter table public.users drop column is_test;

alter table public.users add column if not exists is_test boolean not null default false;
create index if not exists users_is_test_idx on public.users (id) where is_test;

create or replace function public.users_is_test_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and new.is_test is distinct from old.is_test then
    raise exception 'is_test_readonly' using errcode = '42501';
  end if;
  return new;
end;
$$;
create or replace trigger trg_users_is_test_guard before update on public.users
  for each row execute function public.users_is_test_guard();

notify pgrst, 'reload schema';
