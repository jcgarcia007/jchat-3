-- moderate-legacy-dm-photos.sql — manda a moderación las 3 fotos de DM antiguas que quedaron sin moderar.
-- DECISIÓN D del Paso 0. NO es una migración: es un arreglo de datos de una sola vez que ejecuta Juan en el SQL Editor
-- de Supabase (rol postgres, auth.uid() es NULL, así que el trigger trg_dm_media_guard de 214 deja pasar el UPDATE).
-- No ejecutar sin el OK de Juan.
--
-- Por qué hace falta (214_dm_photo_moderation.sql):
--   * el trigger de envío a moderación solo corre en INSERT, así que un UPDATE por sí solo no manda nada;
--   * dm_photo_retry_moderation() (cron cada 10 min) solo recoge filas 'pending' de MENOS de 2 días y estas tienen
--     más (7–8 oct), así que el cron nunca las tomará: hay que llamar a la función de moderación a mano (paso 2);
--   * la función moderate-dm-photo solo modera un mensaje que esté 'pending' (idempotente) y escribe el veredicto con
--     dm_photo_set_verdict ('clear' | 'blurred' | 'rejected'; 'rejected' crea un reporte urgente del sistema).
--
-- Comprobado en solo lectura (SELECT, sin escribir) el 2026-10-23: exactamente 3 filas con media_url y
-- media_moderation NULL: 92020098-…, e431d103-…, e218b004-… (07 y 08 de octubre).
-- Una URL antigua que sea http(s)/file/content/data la marca 'clear' la propia función sin llamar a Vision (legacy);
-- una ruta de storage se descarga de dm-media y se analiza.

-- ── Paso 0 — conteo (solo lectura). Debe devolver 3. Si no devuelve 3, PARAR y avisar. ────────────────────────────
select count(*) as sin_moderar
from public.dm_messages
where media_url is not null and media_moderation is null;

-- ── Paso 1 — pasar SOLO esas 3 filas a 'pending' ─────────────────────────────────────────────────────────────────
-- (Las condiciones del where hacen que nada más se toque, aunque llegara una foto nueva sin moderar.)
update public.dm_messages
   set media_moderation = 'pending'
 where id in (
         '92020098-a889-4085-8465-27345d265aff',
         'e431d103-7ebe-483e-8a3d-cc6921fb6137',
         'e218b004-9546-467a-b4e4-7add94d1ca22'
       )
   and media_url is not null
   and media_moderation is null;
-- Debe decir "UPDATE 3".

-- ── Paso 2 — pedir la moderación de cada una (misma llamada que dm_photo_retry_moderation, 214:111-115) ────────────
-- El secreto sale de vault (no se escribe aquí). Si el secreto no existe, las llamadas fallan sin efecto.
select net.http_post(
  url     := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/moderate-dm-photo',
  body    := jsonb_build_object('message_id', '92020098-a889-4085-8465-27345d265aff'),
  headers := jsonb_build_object('Content-Type', 'application/json',
             'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1)),
  timeout_milliseconds := 20000);

select net.http_post(
  url     := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/moderate-dm-photo',
  body    := jsonb_build_object('message_id', 'e431d103-7ebe-483e-8a3d-cc6921fb6137'),
  headers := jsonb_build_object('Content-Type', 'application/json',
             'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1)),
  timeout_milliseconds := 20000);

select net.http_post(
  url     := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/moderate-dm-photo',
  body    := jsonb_build_object('message_id', 'e218b004-9546-467a-b4e4-7add94d1ca22'),
  headers := jsonb_build_object('Content-Type', 'application/json',
             'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1)),
  timeout_milliseconds := 20000);

-- ── Paso 3 — comprobar el resultado (esperar ~30 s y ejecutar) ───────────────────────────────────────────────────
-- Esperado: las 3 en 'clear', 'blurred' o 'rejected' con media_moderated_at lleno.
select id, media_moderation, media_moderated_at
from public.dm_messages
where id in (
        '92020098-a889-4085-8465-27345d265aff',
        'e431d103-7ebe-483e-8a3d-cc6921fb6137',
        'e218b004-9546-467a-b4e4-7add94d1ca22'
      )
order by created_at;

-- Si alguna sigue en 'pending' (por ejemplo, Vision falló): repetir SOLO el paso 2 de esa fila. El cron no la
-- recogerá (tiene más de 2 días) y el cliente la muestra desenfocada mientras esté 'pending'.
-- Si alguna salió 'rejected': se creó un reporte urgente automático (reports, priority 'urgent'): revisarlo en la cola.

-- ── Reversión (solo si algo salió mal y la fila sigue en 'pending'; deja la foto sin moderar como estaba) ────────
-- update public.dm_messages set media_moderation = null
--  where id in ('92020098-a889-4085-8465-27345d265aff','e431d103-7ebe-483e-8a3d-cc6921fb6137','e218b004-9546-467a-b4e4-7add94d1ca22')
--    and media_moderation = 'pending';
-- (Un veredicto ya escrito no se revierte: es el resultado de la moderación, no un error.)
