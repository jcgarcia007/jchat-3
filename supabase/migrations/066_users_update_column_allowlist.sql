-- 066: allow-list de columnas en users (patrón de migr 060/064/065; D-54)
-- AGUJERO CRÍTICO: "users: update own" (auth.uid()=id) + grant de UPDATE de TABLA COMPLETA
-- a authenticated Y anon → cualquiera podía PATCH su propia fila con {plan:'pro',
-- plan_status:'active'} y auto-regalarse Pro, o role:'super_admin' (is_platform_admin()
-- lee users.role='super_admin') y auto-nombrarse admin.
--
-- Allow-list = SOLO columnas de perfil/preferencias que el cliente escribe hoy (verificado
-- en el código, PASO 0b): profile (username/display_name/avatar_url/bio/profile_theme_id),
-- prefs (language/settings/privacy_settings/onboarding_completed/push_token), y
-- active_business_id (setActiveBusiness) + updated_at (EditProfileScreen lo escribe).
-- NUNCA: id, plan, plan_status, plan_trial_end, role, is_verified, stripe_customer_id,
-- default_payment_method, created_at. Esas las escribe solo service_role (webhooks/EF/admin).

begin;

revoke update on table public.users from authenticated;
revoke update on table public.users from anon;
revoke delete, truncate, references, trigger on table public.users from anon;
revoke delete, truncate, references, trigger on table public.users from authenticated;

grant update (
  username,
  display_name,
  avatar_url,
  bio,
  language,
  profile_theme_id,
  settings,
  privacy_settings,
  onboarding_completed,
  push_token,
  active_business_id,
  updated_at
) on table public.users to authenticated;

-- Añade el with_check que faltaba: evita que alguien reescriba su propio id a otro.
drop policy if exists "users: update own" on public.users;
create policy "users: update own"
  on public.users for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

commit;
