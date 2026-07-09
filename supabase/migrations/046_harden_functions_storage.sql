-- 046_harden_functions_storage.sql
-- Auditoría senior 2026-07-09 — remediación S2 / S3 / S6 / S7.
-- NO se tocan los helpers STABLE (is_blocked, can_view_profile, can_view_user_content,
-- can_access_room) ni admin_set_business_status (ya con anon revocado) ni dm-media.

-- ─────────────────────────────────────────────────────────────────────────────
-- S2 — REVOKE EXECUTE de funciones que no deben llamarse por API pública.
--
-- ⚠️ IMPORTANTE: el EXECUTE de estas funciones viene de un grant a PUBLIC (proacl
-- muestra `=X`). anon/authenticated lo heredan vía PUBLIC, así que un
-- `REVOKE ... FROM anon, authenticated` es NO-OP. Hay que revocar de PUBLIC.
--
-- Grupo A (cron/trigger): revocar de PUBLIC → solo postgres/service_role ejecutan.
-- Los triggers siguen disparándose (no dependen del grant EXECUTE al rol invocador)
-- y pg_cron corre como su propio owner.
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public.purge_expired_messages() from public, anon, authenticated;
revoke execute on function public.enforce_business_limit() from public, anon, authenticated;
revoke execute on function public.enforce_business_radius_cap() from public, anon, authenticated;
revoke execute on function public.enforce_service_call_cooldown() from public, anon, authenticated;
revoke execute on function public.trg_fn_assign_room_qr_token() from public, anon, authenticated;

-- Grupo B (requieren identidad): revocar de PUBLIC (quita anon) + grant explícito a
-- authenticated (que la seguirá usando).
revoke execute on function public.set_room_password(uuid, text) from public, anon;
grant  execute on function public.set_room_password(uuid, text) to authenticated;
revoke execute on function public.remove_follower(uuid) from public, anon;
grant  execute on function public.remove_follower(uuid) to authenticated;
revoke execute on function public.block_user(uuid) from public, anon;
grant  execute on function public.block_user(uuid) to authenticated;
revoke execute on function public.unblock_user(uuid) from public, anon;
grant  execute on function public.unblock_user(uuid) to authenticated;
revoke execute on function public.request_or_follow(uuid) from public, anon;
grant  execute on function public.request_or_follow(uuid) to authenticated;
revoke execute on function public.accept_follow_request(uuid) from public, anon;
grant  execute on function public.accept_follow_request(uuid) to authenticated;
revoke execute on function public.start_dm(uuid) from public, anon;
grant  execute on function public.start_dm(uuid) to authenticated;
revoke execute on function public.regenerate_room_qr_token(uuid) from public, anon;
grant  execute on function public.regenerate_room_qr_token(uuid) to authenticated;
revoke execute on function public.generate_room_qr_token(uuid, boolean) from public, anon;
grant  execute on function public.generate_room_qr_token(uuid, boolean) to authenticated;

-- Cierre del no-op de S1 (migración 045): get_room_qr_token quedó ejecutable por
-- PUBLIC (su revoke-from-anon no quitó el grant a PUBLIC). Se revoca de PUBLIC y se
-- garantiza el grant a authenticated (el dashboard la usa vía RPC).
revoke execute on function public.get_room_qr_token(uuid) from public, anon;
grant  execute on function public.get_room_qr_token(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- S3 — public_profiles: se MANTIENE SECURITY DEFINER (intencional).
-- La RLS de `users` es restrictiva (own-row + platform admin). La vista existe
-- PARA exponer un subset público de columnas saltándose esa RLS — es el mecanismo
-- de exposición pública controlada, no un bug. Solo expone columnas públicas
-- (nunca city / privacy_settings / push_token / stripe_customer_id / role / plan).
-- El linter marca "security_definer_view" (S3) como ERROR, pero aquí es un
-- WARNING ACEPTADO/intencional. Se añade is_private para que el cliente aplique
-- el gate de privacidad (sistema social Fase A/B).
-- ─────────────────────────────────────────────────────────────────────────────
drop view if exists public.public_profiles;
create view public.public_profiles as
  select
    id, username, display_name, avatar_url, bio,
    profile_theme_id, is_verified, is_private, created_at
  from public.users;

-- DROP VIEW quita los grants → re-otorgar solo SELECT (la vista es de solo lectura).
grant select on public.public_profiles to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- S7 — processed_stripe_events: deny-all explícito (defense-in-depth).
-- RLS ya estaba activo sin policies (deny-all de facto); se hace explícito.
-- service_role sigue accediendo por bypass de RLS.
-- ─────────────────────────────────────────────────────────────────────────────
create policy "deny_all" on public.processed_stripe_events
  for all to anon, authenticated
  using (false) with check (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- S6 — Storage menu-photos: la policy previa era ALL con solo bucket_id →
-- cualquier authenticated podía borrar/sobrescribir fotos de menú de CUALQUIER
-- negocio. Se scopea por OWNER del negocio: el primer segmento del path es el
-- business_id (los uploads reales usan `${businessId}/...`), y debe pertenecer a
-- auth.uid().
--
-- NOTA (modelo actual = dashboard owner-only): se asume que solo el owner del
-- negocio sube/gestiona fotos de menú. Si en el futuro hay EMPLEADOS con acceso al
-- dashboard que también suban fotos, ampliar estas policies para incluir el rol de
-- empleado (tabla business_employees / role check).
--
-- SELECT (lectura pública) ya está cubierto por "storage: public read public
-- buckets" (incluye menu-photos) — NO se crea una policy SELECT nueva.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "storage: auth manage menu photos" on storage.objects;

create policy "storage: auth upload menu photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'menu-photos'
    and exists (
      select 1 from public.businesses b
      where b.id::text = (storage.foldername(name))[1]
        and b.owner_id = auth.uid()
    )
  );

create policy "storage: auth update menu photos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'menu-photos'
    and exists (
      select 1 from public.businesses b
      where b.id::text = (storage.foldername(name))[1]
        and b.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'menu-photos'
    and exists (
      select 1 from public.businesses b
      where b.id::text = (storage.foldername(name))[1]
        and b.owner_id = auth.uid()
    )
  );

create policy "storage: auth delete menu photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'menu-photos'
    and exists (
      select 1 from public.businesses b
      where b.id::text = (storage.foldername(name))[1]
        and b.owner_id = auth.uid()
    )
  );
