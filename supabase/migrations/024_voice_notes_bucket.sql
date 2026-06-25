-- ============================================================
-- JChat 3.0 — voice-notes Storage bucket (Tanda D1)
--
-- New bucket for voice message recordings uploaded by chat users.
-- expo-audio on iOS produces .m4a (AAC); we also accept mp4/mpeg/aac
-- wrappers that different OS versions may report.
--
-- Policies mirror the post-media pattern from migration 011:
--   - Public read (bucket is public=true)
--   - Authenticated insert into own folder  (<uid>/...)
--   - Authenticated update/delete own objects (owner = auth.uid())
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-notes',
  'voice-notes',
  true,
  10485760, -- 10 MB per file (generously covers up to ~10 min of compressed AAC)
  array['audio/m4a','audio/mp4','audio/mpeg','audio/aac','audio/x-m4a']
)
on conflict (id) do nothing;

-- Public read — voice-notes are embedded in chat messages (already visible to
-- room members); serving them publicly avoids a signed-URL round-trip.
create policy "storage: public read voice-notes"
  on storage.objects for select
  using (bucket_id = 'voice-notes');

-- Upload: authenticated users may insert into their own folder only.
create policy "storage: user upload voice-notes"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update: authenticated users may update only objects they own.
create policy "storage: user update voice-notes"
  on storage.objects for update to authenticated
  using (bucket_id = 'voice-notes' and owner = auth.uid());

-- Delete: authenticated users may delete only objects they own.
create policy "storage: user delete voice-notes"
  on storage.objects for delete to authenticated
  using (bucket_id = 'voice-notes' and owner = auth.uid());
