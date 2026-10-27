-- baseline_extras: lo que `supabase db dump --linked` NO incluye y que una base nueva necesita para funcionar como producción.
-- Sacado de producción (klfsgcfoahdtkojyqspd) el 2026-10-27 con consultas de SOLO LECTURA sobre storage.buckets, pg_policies,
-- cron.job y pg_trigger. No contiene datos de usuarios, secretos ni claves (los 11 comandos de cron solo llaman a funciones public.*).
-- Idempotente: on conflict do nothing / drop ... if exists + create / unschedule si existe + schedule.
-- Va DESPUÉS del baseline (necesita las funciones public.* que usan las políticas, los crons y el trigger).
-- NO se ejecuta en producción (allí ya existe todo): solo en bases nuevas (local, ramas de Supabase).

-- ── 9 BUCKETS ───────────────────────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('avatars', 'avatars', true, 5242880, '{image/jpeg,image/png,image/webp}'::text[]) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('covers', 'covers', true, 10485760, '{image/jpeg,image/png,image/webp}'::text[]) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('dm-media', 'dm-media', false, 10485760, '{image/jpeg,image/png,image/webp,image/heic,image/heif,audio/m4a,audio/mp4,audio/x-m4a,audio/aac,audio/mpeg}'::text[]) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('match-photos', 'match-photos', false, 5242880, '{image/jpeg,image/png,image/webp}'::text[]) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('menu-photos', 'menu-photos', true, 10485760, '{image/jpeg,image/png,image/webp}'::text[]) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('post-media', 'post-media', true, 10485760, '{image/jpeg,image/png,image/webp,video/mp4}'::text[]) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('profile-media', 'profile-media', true, 10485760, '{image/jpeg,image/png,image/webp}'::text[]) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('verification-selfies', 'verification-selfies', false, 5242880, '{image/jpeg,image/png}'::text[]) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('voice-notes', 'voice-notes', false, 5242880, '{audio/m4a,audio/mp4,audio/mpeg,audio/aac,audio/x-m4a}'::text[]) on conflict (id) do nothing;

-- ── 26 POLÍTICAS DE storage.objects (no hay políticas en otras tablas de storage) ─────────────────────────────
drop policy if exists "dm_media: block rejected" on storage.objects;
create policy "dm_media: block rejected" on storage.objects as RESTRICTIVE for SELECT to authenticated using (((bucket_id <> 'dm-media'::text) OR ((storage.foldername(name))[2] = (( SELECT auth.uid() AS uid))::text) OR public.is_platform_admin() OR (NOT public.dm_media_is_blocked(name))));
drop policy if exists dm_media_delete on storage.objects;
create policy dm_media_delete on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'dm-media'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
drop policy if exists dm_media_insert on storage.objects;
create policy dm_media_insert on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'dm-media'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM public.dm_conversations c
  WHERE (((c.id)::text = (storage.foldername(objects.name))[1]) AND ((c.user_a = auth.uid()) OR (c.user_b = auth.uid())) AND (NOT public.is_blocked(c.user_a, c.user_b)))))));
drop policy if exists dm_media_select on storage.objects;
create policy dm_media_select on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'dm-media'::text) AND (EXISTS ( SELECT 1
   FROM public.dm_conversations c
  WHERE (((c.id)::text = (storage.foldername(objects.name))[1]) AND ((c.user_a = auth.uid()) OR (c.user_b = auth.uid())) AND (NOT public.is_blocked(c.user_a, c.user_b)))))));
drop policy if exists match_photos_storage_admin on storage.objects;
create policy match_photos_storage_admin on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'match-photos'::text) AND public.is_platform_admin()));
drop policy if exists match_photos_storage_delete on storage.objects;
create policy match_photos_storage_delete on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'match-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
drop policy if exists match_photos_storage_insert on storage.objects;
create policy match_photos_storage_insert on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'match-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
drop policy if exists match_photos_storage_own on storage.objects;
create policy match_photos_storage_own on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'match-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
drop policy if exists match_photos_storage_visible on storage.objects;
create policy match_photos_storage_visible on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'match-photos'::text) AND (EXISTS ( SELECT 1
   FROM public.match_photos p
  WHERE ((p.path = objects.name) AND (p.status = 'approved'::text) AND (public.match_common_business(auth.uid(), p.user_id) IS NOT NULL))))));
drop policy if exists "storage: auth delete menu photos" on storage.objects;
create policy "storage: auth delete menu photos" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'menu-photos'::text) AND (EXISTS ( SELECT 1
   FROM public.businesses b
  WHERE (((b.id)::text = (storage.foldername(objects.name))[1]) AND (b.owner_id = auth.uid()))))));
drop policy if exists "storage: auth update menu photos" on storage.objects;
create policy "storage: auth update menu photos" on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = 'menu-photos'::text) AND (EXISTS ( SELECT 1
   FROM public.businesses b
  WHERE (((b.id)::text = (storage.foldername(objects.name))[1]) AND (b.owner_id = auth.uid())))))) with check (((bucket_id = 'menu-photos'::text) AND (EXISTS ( SELECT 1
   FROM public.businesses b
  WHERE (((b.id)::text = (storage.foldername(objects.name))[1]) AND (b.owner_id = auth.uid()))))));
drop policy if exists "storage: auth upload menu photos" on storage.objects;
create policy "storage: auth upload menu photos" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'menu-photos'::text) AND (EXISTS ( SELECT 1
   FROM public.businesses b
  WHERE (((b.id)::text = (storage.foldername(objects.name))[1]) AND (b.owner_id = auth.uid()))))));
drop policy if exists "storage: owner read own profile-media" on storage.objects;
create policy "storage: owner read own profile-media" on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'profile-media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
drop policy if exists "storage: public read public buckets" on storage.objects;
create policy "storage: public read public buckets" on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = ANY (ARRAY['avatars'::text, 'covers'::text, 'post-media'::text, 'menu-photos'::text])));
drop policy if exists "storage: user delete own media" on storage.objects;
create policy "storage: user delete own media" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = ANY (ARRAY['avatars'::text, 'covers'::text, 'post-media'::text])) AND (owner = auth.uid())));
drop policy if exists "storage: user delete profile-media" on storage.objects;
create policy "storage: user delete profile-media" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'profile-media'::text) AND (owner = auth.uid())));
drop policy if exists "storage: user delete voice-notes" on storage.objects;
create policy "storage: user delete voice-notes" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'voice-notes'::text) AND (owner = auth.uid())));
drop policy if exists "storage: user read own selfie" on storage.objects;
create policy "storage: user read own selfie" on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'verification-selfies'::text) AND (owner = auth.uid())));
drop policy if exists "storage: user update own media" on storage.objects;
create policy "storage: user update own media" on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = ANY (ARRAY['avatars'::text, 'covers'::text, 'post-media'::text])) AND (owner = auth.uid())));
drop policy if exists "storage: user update profile-media" on storage.objects;
create policy "storage: user update profile-media" on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = 'profile-media'::text) AND (owner = auth.uid())));
drop policy if exists "storage: user update voice-notes" on storage.objects;
create policy "storage: user update voice-notes" on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = 'voice-notes'::text) AND (owner = auth.uid())));
drop policy if exists "storage: user upload own media" on storage.objects;
create policy "storage: user upload own media" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = ANY (ARRAY['avatars'::text, 'covers'::text, 'post-media'::text])) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
drop policy if exists "storage: user upload own selfie" on storage.objects;
create policy "storage: user upload own selfie" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'verification-selfies'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
drop policy if exists "storage: user upload profile-media" on storage.objects;
create policy "storage: user upload profile-media" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'profile-media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
drop policy if exists voice_notes_room_insert on storage.objects;
create policy voice_notes_room_insert on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'voice-notes'::text) AND ((storage.foldername(name))[1] = 'room'::text) AND ((storage.foldername(name))[3] = (auth.uid())::text) AND public.can_access_room(((storage.foldername(name))[2])::uuid) AND (NOT public.is_muted_in_room(((storage.foldername(name))[2])::uuid, auth.uid()))));
drop policy if exists voice_notes_room_select on storage.objects;
create policy voice_notes_room_select on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'voice-notes'::text) AND ((owner = auth.uid()) OR (((storage.foldername(name))[1] = 'room'::text) AND public.can_access_room(((storage.foldername(name))[2])::uuid)))));

-- ── 11 TRABAJOS DE pg_cron (solo llaman a funciones public.*; ninguna clave) ─────────────────────────────────
select cron.unschedule('cleanup-anon-users') where exists (select 1 from cron.job where jobname = 'cleanup-anon-users');
select cron.schedule('cleanup-anon-users', '0 5 * * *', 'select public.cleanup_anonymous_users()');
select cron.unschedule('dm-photo-retry-moderation') where exists (select 1 from cron.job where jobname = 'dm-photo-retry-moderation');
select cron.schedule('dm-photo-retry-moderation', '*/10 * * * *', 'select public.dm_photo_retry_moderation()');
select cron.unschedule('gift-offers-expire') where exists (select 1 from cron.job where jobname = 'gift-offers-expire');
select cron.schedule('gift-offers-expire', '*/2 * * * *', 'select public.gift_offers_expire()');
select cron.unschedule('gift-offers-reconcile') where exists (select 1 from cron.job where jobname = 'gift-offers-reconcile');
select cron.schedule('gift-offers-reconcile', '*/10 * * * *', 'select public.gift_offers_reconcile()');
select cron.unschedule('match-photo-retry-moderation') where exists (select 1 from cron.job where jobname = 'match-photo-retry-moderation');
select cron.schedule('match-photo-retry-moderation', '*/10 * * * *', 'select public.match_photo_retry_moderation()');
select cron.unschedule('match-wipe-expired') where exists (select 1 from cron.job where jobname = 'match-wipe-expired');
select cron.schedule('match-wipe-expired', '*/2 * * * *', 'select public.match_wipe_expired()');
select cron.unschedule('purge-expired-messages') where exists (select 1 from cron.job where jobname = 'purge-expired-messages');
select cron.schedule('purge-expired-messages', '*/15 * * * *', 'select public.purge_expired_messages()');
select cron.unschedule('purge-stale-pending-carts') where exists (select 1 from cron.job where jobname = 'purge-stale-pending-carts');
select cron.schedule('purge-stale-pending-carts', '30 4 * * *', 'select public.purge_stale_pending_carts()');
select cron.unschedule('tod-expire') where exists (select 1 from cron.job where jobname = 'tod-expire');
select cron.schedule('tod-expire', '*/2 * * * *', 'select public.tod_expire()');
select cron.unschedule('tod-purge') where exists (select 1 from cron.job where jobname = 'tod-purge');
select cron.schedule('tod-purge', '15 4 * * *', 'select public.tod_purge()');
select cron.unschedule('venue-exits-purge') where exists (select 1 from cron.job where jobname = 'venue-exits-purge');
select cron.schedule('venue-exits-purge', '*/5 * * * *', 'select public.venue_exits_purge()');

-- ── TRIGGER DE auth.users (crea la fila de public.users al registrarse) ──────────────────────────────────────
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();
