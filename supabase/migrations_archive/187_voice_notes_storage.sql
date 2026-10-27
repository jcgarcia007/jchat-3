-- 187: notas de voz — almacenamiento seguro para salas (voice-notes) y DMs (dm-media) + duración en DMs

-- 1) Duración de la nota de voz en DMs (las salas usan messages.metadata.duration_s)
alter table public.dm_messages
  add column if not exists voice_duration_s smallint;
alter table public.dm_messages drop constraint if exists dm_messages_voice_duration_check;
alter table public.dm_messages add constraint dm_messages_voice_duration_check
  check (voice_duration_s is null or voice_duration_s between 1 and 60);

-- 2) dm-media: límite de tamaño y tipos permitidos (fotos + audio)
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array[
      'image/jpeg','image/png','image/webp','image/heic','image/heif',
      'audio/m4a','audio/mp4','audio/x-m4a','audio/aac','audio/mpeg'
    ]
where id = 'dm-media';

-- 3) dm-media: además de ser participante, que no haya bloqueo entre los dos
drop policy if exists dm_media_select on storage.objects;
create policy dm_media_select on storage.objects for select to authenticated
  using (
    bucket_id = 'dm-media'
    and exists (
      select 1 from public.dm_conversations c
      where c.id::text = (storage.foldername(objects.name))[1]
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
        and not public.is_blocked(c.user_a, c.user_b)
    )
  );

drop policy if exists dm_media_insert on storage.objects;
create policy dm_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dm-media'
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (
      select 1 from public.dm_conversations c
      where c.id::text = (storage.foldername(objects.name))[1]
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
        and not public.is_blocked(c.user_a, c.user_b)
    )
  );

-- 4) voice-notes (salas): ruta room/{room_id}/{uid}/{archivo}
--    Sube: quien tiene acceso a la sala, no está silenciado, y solo en su carpeta.
--    Escucha: cualquiera con acceso a la sala (presencia vigente o dueño).
drop policy if exists "storage: user upload voice-notes" on storage.objects;
drop policy if exists "storage: owner read voice-notes" on storage.objects;

create policy voice_notes_room_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] = 'room'
    and (storage.foldername(name))[3] = auth.uid()::text
    and public.can_access_room(((storage.foldername(name))[2])::uuid)
    and not public.is_muted_in_room(((storage.foldername(name))[2])::uuid, auth.uid())
  );

create policy voice_notes_room_select on storage.objects for select to authenticated
  using (
    bucket_id = 'voice-notes'
    and (
      owner = auth.uid()
      or (
        (storage.foldername(name))[1] = 'room'
        and public.can_access_room(((storage.foldername(name))[2])::uuid)
      )
    )
  );
-- UPDATE/DELETE de voice-notes siguen siendo solo del dueño (políticas existentes).
