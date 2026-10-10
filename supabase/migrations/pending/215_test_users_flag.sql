-- 215 (PROPUESTA — NO APLICADA): marca de "usuario de prueba" (scripts/test-users).
--
-- Qué hace
--   1. users.is_test boolean not null default false: lo pone el script seed (service_role) en las cuentas
--      <nombre>@test.jchat.cloud. Sirve para distinguirlas en consultas, limpiezas y analítica.
--   2. Un cliente (authenticated) no puede cambiar su propio is_test (ni activarlo ni quitarlo): solo service_role.
--   3. Índice parcial para localizarlas rápido.
-- Los scripts funcionan SIN esta migración (usan el dominio del correo como marca); con ella además fijan is_test = true
-- y cleanup exige las dos condiciones (dominio Y is_test) cuando la columna existe.
--
-- Como probarlo (después de aplicar):
--   select count(*) from public.users where is_test;                       -- 0 antes de ejecutar seed
--   -- como usuario normal autenticado:  update public.users set is_test = true where id = auth.uid();  → ERROR is_test_readonly
--   -- tras `node scripts/test-users/seed.mjs`:  select count(*) from public.users where is_test;  → N
-- Rollback: drop trigger trg_users_is_test_guard on public.users; drop function public.users_is_test_guard();
--           drop index if exists users_is_test_idx; alter table public.users drop column is_test;

alter table public.users add column if not exists is_test boolean not null default false;
create index if not exists users_is_test_idx on public.users (id) where is_test;

create or replace function public.users_is_test_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  -- auth.uid() es NULL para service_role / funciones del servidor
  if auth.uid() is not null and new.is_test is distinct from old.is_test then
    raise exception 'is_test_readonly' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_users_is_test_guard on public.users;
create trigger trg_users_is_test_guard before update on public.users
  for each row execute function public.users_is_test_guard();

notify pgrst, 'reload schema';
