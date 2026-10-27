-- ============================================================
-- JChat 3.0 — Storage buckets + RLS (deployment)
-- Buckets used by uploads across the app. Public buckets serve via public URL;
-- verification-selfies is PRIVATE (sensitive, server/owner only).
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',              'avatars',              true,  5242880,  array['image/jpeg','image/png','image/webp']),
  ('covers',               'covers',               true,  10485760, array['image/jpeg','image/png','image/webp']),
  ('post-media',           'post-media',           true,  10485760, array['image/jpeg','image/png','image/webp','video/mp4']),
  ('menu-photos',          'menu-photos',          true,  5242880,  array['image/jpeg','image/png','image/webp']),
  ('verification-selfies', 'verification-selfies', false, 5242880,  array['image/jpeg','image/png'])
on conflict (id) do nothing;

-- ── storage.objects policies (RLS is already enabled by Supabase) ──

-- Public read for the 4 public buckets.
create policy "storage: public read public buckets"
  on storage.objects for select
  using (bucket_id in ('avatars','covers','post-media','menu-photos'));

-- Users manage files in their own folder ("<auth.uid>/...") for personal media.
create policy "storage: user upload own media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('avatars','covers','post-media')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "storage: user update own media"
  on storage.objects for update to authenticated
  using (bucket_id in ('avatars','covers','post-media') and owner = auth.uid());
create policy "storage: user delete own media"
  on storage.objects for delete to authenticated
  using (bucket_id in ('avatars','covers','post-media') and owner = auth.uid());

-- menu-photos: authenticated upload (business ownership enforced at app + path).
-- TODO(rls): tighten to verify the path's business_id belongs to auth.uid().
create policy "storage: auth manage menu photos"
  on storage.objects for all to authenticated
  using (bucket_id = 'menu-photos')
  with check (bucket_id = 'menu-photos');

-- verification-selfies: PRIVATE. Owner uploads to own folder; reads are
-- owner-only here (Super Admin review happens via the service role server-side).
create policy "storage: user upload own selfie"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'verification-selfies'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "storage: user read own selfie"
  on storage.objects for select to authenticated
  using (bucket_id = 'verification-selfies' and owner = auth.uid());
