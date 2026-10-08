# Propuesta (solo diseño, NO implementada): difuminar fotos explícitas en DMs

Fecha: 2026-10-08 · Lote D, parte 1 · Estado: para revisión de Juan/Planning.

## Problema
Las fotos de DM se suben a `dm-media` (bucket privado) y nada las revisa (`mobile/services/dms.ts` `uploadDmPhoto`;
verificado en la auditoría). La moderación con Google Vision existe solo para fotos de Match
(`supabase/migrations/193_match_photo_moderation.sql` + `supabase/functions/moderate-match-photo`).

## Idea
Reutilizar la misma llamada a Vision `SAFE_SEARCH_DETECTION` para cada foto de DM, **sin bloquear el envío**:
el receptor ve la foto **difuminada** si es probable que sea explícita, con un toque "Ver de todos modos" y la opción
"Reportar". Quien envía no nota nada (salvo rechazo duro).

## Flujo
1. `uploadDmPhoto` sube la foto y `sendMessage` inserta `dm_messages` con `media_url` (igual que hoy).
2. Trigger `AFTER INSERT ON dm_messages WHEN (new.media_url IS NOT NULL)` → `pg_net` → Edge Function de moderación
   (mismo patrón y secreto `x-push-secret` que 193).
3. La función descarga la imagen con la llave secreta, llama a Vision y escribe el veredicto en `dm_messages.media_moderation`.
4. El cliente del receptor pinta según el estado y se actualiza solo por Realtime (UPDATE de `dm_messages`).

## Veredicto (misma escala que `decide()` de moderate-match-photo)
| Resultado de Vision | `media_moderation` | Qué ve el receptor |
|---|---|---|
| adult ≥ LIKELY o racy ≥ LIKELY | `blurred` | foto difuminada + "Ver de todos modos" + "Reportar" |
| violence ≥ LIKELY | `blurred` | igual, con aviso de contenido violento |
| adult = VERY_LIKELY | `rejected` | no se muestra; cola de revisión para super-admin; strike al remitente |
| resto | `clear` | normal |
| sin resultado todavía / Vision caído | `pending` | **difuminada hasta que haya veredicto** (falla cerrado para el receptor) |

## SQL necesario (a escribir como `pending/2xx_dm_photo_moderation.sql` cuando se apruebe)
- `alter table dm_messages add column media_moderation text check (media_moderation in ('pending','clear','blurred','rejected'))`
  (NULL = mensaje sin foto; las filas con `media_url` nuevas nacen `pending` por trigger BEFORE INSERT).
- Trigger de solo lectura para clientes: ningún `UPDATE` de `media_moderation` salvo `service_role` (patrón
  `match_photo_fields_readonly` de 193).
- Trigger `AFTER INSERT` que llama a la función por `pg_net` + cron de reintento cada 10 min para `pending` > 5 min (copia de 193).
- Opcional: tabla `dm_media_reviews` o reutilizar `reports` (`content_type='message'`) para la cola de revisión de `rejected`.

## Cambios de código
- Edge Function: extraer `safeSearch()`/`decide()` de `moderate-match-photo` a `supabase/functions/_shared/safesearch.ts`
  y crear `moderate-dm-photo` (o añadir `kind: 'dm'` a la actual con bucket `dm-media`). Secreto existente `GOOGLE_VISION_API_KEY`.
- Mobile: en la burbuja de foto de `DMChatScreen.tsx`, si `media_moderation !== 'clear'` (y el usuario no es el remitente):
  `<Image blurRadius={40}>` + capa con botón "Ver de todos modos" (confirmación) y "Reportar". i18n es/en.
- Reporte: usar `ReportReasonSheet` con `content_type='message'` y `content_id` = id del mensaje (hoy no existe reporte por mensaje).
- Privacidad: añadir a la Política que las imágenes de DM se envían a Google Cloud Vision para detectar contenido explícito.

## Costo aproximado
Google Cloud Vision `SAFE_SEARCH_DETECTION` = 1 unidad por imagen: primeras 1.000 unidades/mes gratis, después
**≈ US$ 1,50 por cada 1.000 fotos (≈ US$ 0,0015 por foto)** — confirmar en la tarifa vigente de Google.
| Fotos de DM al mes | Costo Vision aprox. |
|---|---|
| 1.000 | 0 (gratis) |
| 10.000 | ≈ US$ 13,50 |
| 100.000 | ≈ US$ 148,50 |
Más: una invocación de Edge Function y una descarga de Storage por foto (dentro del plan, despreciable). Reintentos del cron
repiten la llamada solo si falló.

## Límites (decir la verdad al revisor de la tienda)
- SafeSearch detecta desnudez/violencia probable, **no es detección de CSAM**. Para CSAM hace falta hash-matching
  (p. ej. Google Content Safety API / PhotoDNA vía NCMEC); queda como siguiente paso del programa CSAE.
- Falsos positivos (playa, arte): por eso se difumina y se deja ver, en vez de borrar.
- Las fotos en chats de local (`messages`, tipo imagen) y avatares/posts/stories tampoco se revisan hoy; el mismo diseño
  sirve cambiando bucket y tabla.

## Esfuerzo estimado
SQL + EF: 0,5 día · Cliente (blur, ver, reportar, i18n): 0,5 día · Pruebas con fotos de muestra: 0,5 día.
