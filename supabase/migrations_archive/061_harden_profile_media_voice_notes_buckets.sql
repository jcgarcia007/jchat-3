-- 061: endurecer buckets profile-media y voice-notes (hallazgo #7)
-- Ambos buckets están vacíos → cambio seguro, sin migración de datos.
-- Patrón: igual que avatars/covers/menu-photos (límites + MIME allow-list) y
-- dm-media (privado). D-41: negar explícito, no por omisión.

begin;

-- 1. Límites y MIME allow-list (hoy NULL = cualquier tipo y tamaño)
update storage.buckets
   set public = true,
       file_size_limit = 10485760,  -- 10 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'profile-media';

update storage.buckets
   set public = false,              -- notas de voz de DMs: privadas (signed URLs)
       file_size_limit = 5242880,   -- 5 MB
       allowed_mime_types = array['audio/m4a','audio/mp4','audio/mpeg','audio/aac','audio/x-m4a']
 where id = 'voice-notes';

-- 2. Rehacer las políticas: el owner solo escribe en SU carpeta (<uid>/...)
drop policy if exists "storage: user upload profile-media" on storage.objects;
drop policy if exists "storage: user upload voice-notes" on storage.objects;

create policy "storage: user upload profile-media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage: user upload voice-notes"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. voice-notes deja de ser legible por el mundo (era SELECT para {} = anon incluido)
drop policy if exists "storage: public read voice-notes" on storage.objects;

create policy "storage: owner read voice-notes"
  on storage.objects for select to authenticated
  using (bucket_id = 'voice-notes' and owner = auth.uid());

-- NOTA: cuando se implemente la UI de notas de voz en DMs, el destinatario NO podrá
-- leer el objeto con esta política. El acceso del destinatario se hará por signed URL
-- generada en el servidor (service_role) tras comprobar que pertenece al DM — o se
-- ampliará esta política con un EXISTS contra la tabla de participantes del DM.
-- Se deja restrictivo a propósito (D-41): mejor negar de más en un bucket sin uso.

commit;
