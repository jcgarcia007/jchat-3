-- ============================================================
-- JChat 3.0 — P0-4: users RLS hardening (push_token / column leak)
--
-- Problema: la policy "users: select own or public" usaba
--   using (auth.uid() = id or true)  → cualquier autenticado podía leer
--   push_token y TODAS las columnas de CUALQUIER usuario.
--
-- Enfoque:
--   1. Restringir la tabla `users` a lectura PROPIA.
--   2. Permitir lectura completa a platform admins (super-admin panel) vía el
--      helper SECURITY DEFINER public.is_platform_admin() (migración 013) —
--      no recursa porque la función bypassa RLS sobre `users`.
--   3. Exponer columnas NO sensibles de todos los perfiles vía una vista
--      `public_profiles` (sin push_token / language / email / role).
--   4. RPC username_available (case-insensitive) para el check de registro.
--   5. Índice único case-insensitive en username.
--
-- Aplicada a klfsgcfoahdtkojyqspd el 2026-06-24 (0 duplicados pre-existentes).
-- ============================================================

-- 1 — Restringe la tabla users a lectura propia ---------------------------------
drop policy if exists "users: select own or public" on public.users;

create policy "users: select own"
  on public.users for select to authenticated
  using (auth.uid() = id);

-- 2 — Platform admins pueden leer todas las filas (super-admin panel) ------------
-- is_platform_admin() es SECURITY DEFINER (migración 013) → evita recursión RLS.
create policy "users: select platform admin"
  on public.users for select to authenticated
  using (public.is_platform_admin());

-- 3 — Vista pública SOLO con columnas no sensibles (sin push_token) --------------
-- security_invoker = off → la vista corre con privilegios del owner y bypassa la
-- RLS restrictiva de `users`, devolviendo las columnas públicas de todos.
create or replace view public.public_profiles
with (security_invoker = off) as
  select id, username, display_name, avatar_url, bio, profile_theme_id,
         is_verified, created_at
  from public.users;

grant select on public.public_profiles to authenticated;

-- 4 — Check puntual de disponibilidad de @username para anon -------------------
-- El registro verifica el username ANTES del signUp (sin sesión). En vez de
-- abrir la vista a anon (lectura/enumeración de perfiles), exponemos una RPC
-- que NO devuelve datos — solo un boolean (true = libre). SECURITY DEFINER para
-- poder consultar `users` bajo la nueva RLS restrictiva.
create or replace function public.username_available(check_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.users
    where lower(username) = lower(trim(check_username))
  );
$$;

grant execute on function public.username_available(text) to anon, authenticated;

-- 5 — Unicidad REAL case-insensitive a nivel BD --------------------------------
-- El `unique` de users.username (001) es case-sensitive: dejaría coexistir
-- 'Juan' y 'juan', que la RPC cree bloquear. Este índice lo garantiza en la BD.
-- OJO: FALLA si ya existen duplicados case-insensitive — detectarlos ANTES de
-- aplicar (ver query de detección en el PR/checklist).
create unique index if not exists users_username_lower_unique
  on public.users (lower(username));
