# Diagnóstico — Chat Fase 2: TTL 24h de mensajes + unfriend borra DMs

> **Solo investigación. NADA cambiado.** Verificado contra el esquema real en vivo
> (proyecto `klfsgcfoahdtkojyqspd`) y el código actual el 2026-07-08.
> Foco: (a) cómo purgar `messages` + fotos por `created_at`+24h, (b) el modelo REAL de
> amistad y si soporta "amigos mutuos", (c) dónde enganchar unfriend→borrar DMs,
> (d) disponibilidad de pg_cron.

---

## TL;DR
1. **Purga TTL:** trivial a nivel de fila (`messages.created_at`, 191 filas hoy, las 191 con +24h).
   El detalle está en las **fotos**: se suben al bucket **`post-media`** (compartido con los
   posts del feed) en path `{user_id}/{timestamp}.ext`. Borrar la fila no borra el archivo →
   hay que remover el objeto de Storage por su path, **solo el de mensajes** (no tocar posts).
2. **Amistad — HALLAZGO CRÍTICO:** el modelo real es **`follows` UNIDIRECCIONAL** (seguir).
   **No existe** amistad mutua, ni `friend_requests`, ni `friendships`, ni tabla de amigos.
   La pestaña **Friends es un stub** ("Coming — Task 1.15"). Los DMs **no tienen gate de
   "solo amigos"** (ni en RLS ni en el código). Hay que **definir** qué es "ser amigos" antes
   de implementar "unfriend borra DMs".
3. **unfriend→borrar DMs:** técnicamente limpio — `dm_messages` cae por **CASCADE** al borrar
   la `dm_conversation`. El enganche natural es un **trigger `AFTER DELETE ON follows`** (o el
   servicio `unfollowUser`).
4. **pg_cron:** **NO instalado**, pero **disponible** (`pg_available_extensions`). `pg_net`
   también disponible. Hay que habilitarlos para el job periódico.

---

## 1. Tabla `messages` (mensajes de sala)

### Esquema real (verificado)
| columna | tipo | null |
|---|---|---|
| `id` | uuid | NO |
| `room_id` | uuid | NO |
| `user_id` | uuid | NO |
| `body` | text | NO |
| `is_deleted` | boolean | NO |
| `reply_to` | uuid | YES |
| `created_at` | timestamptz | NO ✅ |
| `type` | text | NO |
| `media_url` | text | YES |
| `metadata` | jsonb | NO |
| `is_system` | boolean | NO |

- **Tiene `created_at`** (por fila) → la purga por antigüedad individual es directa.
- **Tiene `room_id`** y **`media_url`** (foto/media).
- `type` toma valores **`text`, `image`, `photo`** (inconsistencia: hay dos etiquetas para
  foto). ⇒ La detección de "tiene foto" debe basarse en **`media_url IS NOT NULL`**, no en `type`.

### Volumen hoy
- **191 mensajes** totales; **191** con `created_at < now() - 24h` (todos expirados — data vieja de dev).
- **29** mensajes con `media_url`: **25** son `https://…/post-media/…` (subidas reales) y **4**
  son `file:///…ImagePicker/…` (artefactos de modo demo / simulador, sin objeto en Storage).

### ¿Dónde viven las fotos de mensajes? — bucket `post-media` (compartido)
- `mobile/screens/chat/ChatRoomScreen.tsx:583` → `uploadImage(user.id, uri, 'post-media')`.
- `mobile/services/storage.ts` sube a `{userId}/{Date.now()}.{ext}` y guarda el
  **`getPublicUrl` completo** en `messages.media_url`:
  `https://klfsgcfoahdtkojyqspd.supabase.co/storage/v1/object/public/post-media/{userId}/{ts}.{ext}`.
- ⚠️ **`post-media` es COMPARTIDO con los posts del feed** (mismo bucket, mismo helper). Al
  purgar fotos de mensajes **NO se puede borrar por carpeta de usuario** ni vaciar el bucket:
  hay que borrar **exactamente el objeto** cuyo path sale del `media_url` del mensaje purgado.
  Cada path es único (`{ts}`), así que borrar el objeto puntual del mensaje es seguro y no toca
  posts. (`storage.objects` en `post-media`: 23 objetos hoy.)
- Nota técnica: borrar la fila `messages` **no** borra el archivo; y borrar la fila de
  `storage.objects` por SQL deja el binario huérfano en el backend. La forma correcta de liberar
  el archivo es la **Storage API** (`storage.from('post-media').remove([paths])`), lo que empuja
  la limpieza hacia una **Edge Function** (ver recomendación).

### ¿Mecanismo de purga/TTL ya existente? — NO
- Sin columna `expires_at` en `messages` (sí existe en `stories`, no aquí).
- **Sin triggers** en `messages`.
- **Sin `pg_cron`** (schema `cron` no existe).
- RLS de `messages`: `authenticated insert`, `authenticated read`, `author or business owner
  delete`. La purga irá por **service_role** (bypassa RLS), no por estas policies.

---

## 2. Sistema de amistad — el modelo REAL

### Es SEGUIR (unidireccional), NO amistad mutua
- **Única tabla:** `follows(id, follower_id, following_id, created_at)` con **UNIQUE
  (follower_id, following_id)**. No hay `friend_requests`, `friendships`, `friends`, ni
  `dm_participants`.
- Servicio (`mobile/services/users.ts`):
  - `followUser(me, target)` → upsert `follows` (unidireccional, asume cuenta pública).
  - `unfollowUser(me, target)` → delete de la fila. **Esta es la única acción tipo "unfriend" que
    existe hoy** (líneas 157-167).
  - `isFollowing(me, target)`, `getFollowerCount`, `getFollowingCount`.
- **No existe** `areFriends` / `isMutual` / concepto de "amigos" en el código.
- La pestaña **Friends** (`mobile/screens/friends/FriendsScreen.tsx`) es un **placeholder de 26
  líneas** ("Coming — Task 1.15"). No hay UI de amigos ni de unfriend.
- Web: no hay flujo de follows/friends/unfriend/DM (los hits de grep en web son falsos positivos).

### ⇒ El producto pide amistad MUTUA, el esquema no la tiene
"Si dos personas dejan de ser amigos" **presupone** una relación de amistad que hoy no está
modelada. Antes de implementar hay que **definir "son amigos"**. Dos caminos (ver recomendación):
- **A (mínimo, reutiliza lo que hay):** *amigos = follow mutuo* (existe `A→B` **y** `B→A`).
  "unfriend" = quitar el follow (una dirección) → rompe el mutuo. Ya hay `unfollowUser`.
- **B (correcto a largo plazo):** tabla `friendships` con solicitud + aceptación bidireccional.
  Cambio mayor; no necesario para esta tanda si se acepta A.

### ¿Cómo se determina hoy "pueden mandar DM"? — NO se determina
No hay gate de amistad. Ver §3.

---

## 3. DMs (`dm_conversations`, `dm_messages`)

### Esquema real
`dm_conversations(id, user_a uuid, user_b uuid, last_message_at, created_at)` — los dos
participantes son las columnas **`user_a` / `user_b`**, con convención **`user_a` = id
lexicográficamente menor** (evita duplicados; `mobile/services/dms.ts:148-166`). UNIQUE efectivo
por el patrón de `getOrCreateConversation` (find-by user_a+user_b, luego insert).

`dm_messages(id, conversation_id uuid, sender_id uuid, body text, media_url text, voice_url text,
read_at, created_at)`.

### FKs / cascada (clave para el unfriend)
- `dm_messages.conversation_id → dm_conversations` **ON DELETE CASCADE** ✅
  ⇒ **borrar la conversación borra todos sus mensajes automáticamente.**
- `dm_conversations.user_a/user_b → users` ON DELETE CASCADE (si se borra el usuario).
- `dm_messages.sender_id → users` ON DELETE CASCADE.

### Gate "solo amigos pueden mandar DM" — NO EXISTE
- RLS `dm_conversations` (`dm_conv_participants`, ALL): `user_a = auth.uid() OR user_b =
  auth.uid()`. Solo exige ser **participante**, no ser amigo.
- RLS `dm_messages`: read/insert exigen ser participante de la conversación (`dm_msg_participants_read`,
  `dm_msg_send`). Sin check de amistad.
- `getOrCreateConversation` (`dms.ts:150`) **crea la conversación entre cualquier par de usuarios
  sin verificar follow/amistad**. ⇒ Hoy cualquiera puede abrir DM con cualquiera.
- **Implicación:** "unfriend borra DMs" y "solo amigos mandan DM" son la **misma pieza de
  producto sin construir**. Este diagnóstico cubre el borrado; el gate de creación es trabajo
  adyacente a decidir.

### Fotos en DMs
- `dm_messages.media_url` existe (hoy 0 conversaciones, 0 mensajes → sin muestras). Por paridad
  con el chat de sala, subiría también a **`post-media`**. La limpieza de fotos al borrar DMs
  sigue el mismo patrón que §1 (remover el objeto por path).

---

## 4. pg_cron

- **NO instalado.** `select from pg_extension` → `plpgsql, pg_stat_statements, uuid-ossp,
  pgcrypto, supabase_vault`. El schema `cron` **no existe** (⇒ no hay `cron.job`).
- **Disponible** para instalar: `pg_available_extensions` lista `pg_cron` = true.
- **`pg_net`** también disponible (útil si el cron debe invocar una Edge Function por HTTP).
- Alternativa sin pg_cron: **Supabase Scheduled Edge Functions** (cron administrado desde el
  dashboard / `supabase/functions` con schedule), que invoca la función de purga directamente.

---

## 5. Horario del negocio (nota para la tanda futura de "borrado al cierre")
- `businesses.hours` **existe** (confirmado). Guardará el horario para el borrado por cierre de
  local (fuera de alcance de esta tanda; solo se deja anotado, junto con el borrado por salir del
  perímetro que depende de geo).

---

## Recomendación de implementación

### Pieza 1 — Purga TTL 24h de `messages` (+ fotos huérfanas)
**Opción recomendada: Edge Function `purge-expired-messages` + cron.**
1. Habilitar `pg_cron` (+ `pg_net`) por migración, **o** usar un Scheduled Edge Function de Supabase.
2. Edge Function (service_role):
   - `select id, media_url from messages where created_at < now() - interval '24 hours'`.
   - De los `media_url` que empiezan por la URL pública de `post-media`, extraer el **path**
     (lo que sigue a `/post-media/`) e invocar `storage.from('post-media').remove(paths)` **en
     lotes**. Ignorar los `file://` (no son objetos). **Nunca** borrar por carpeta de usuario.
   - `delete from messages where created_at < now() - interval '24 hours'` (borra en bloque;
     `metadata`/`reply_to` caen con la fila).
   - Correr cada 10–15 min (el TTL es por-fila, no hace falta exactitud al minuto).
3. Frecuencia y borrado por-fila garantizan que cada mensaje muere ~24h tras **su** `created_at`.

**Alternativa más simple (si se acepta dejar archivos huérfanos por ahora):** un cron SQL puro
`delete from messages where created_at < now() - interval '24h'`. Limpia filas pero **deja los
binarios en `post-media`** (ocupan espacio, no se sirven). No recomendada para producción.

> Sub-punto a decidir: ¿los mensajes `is_system` / anclados (pinned) también expiran? Hoy el
> diseño dice "todo mensaje de sala +24h se borra". Si hay pins que deban sobrevivir, excluirlos
> (`and is_system = false and id not in (select message_id from pinned_messages)`), pero eso
> añade dependencia — confirmar antes.

### Pieza 2 — unfriend borra DMs
**Definir primero "amigos".** Recomendación: **amigos = follow mutuo** (Opción A), reutilizando
`follows` y `unfollowUser` que ya existen — evita construir un sistema de solicitudes ahora.

**Enganche recomendado: trigger `AFTER DELETE ON follows`** (robusto: cubre unfollow desde
cualquier ruta — app, futura web, admin):
```
-- al quitar CUALQUIER dirección del follow, se rompe la amistad mutua →
-- borrar la conversación del par (dm_messages cae por CASCADE).
after delete on follows:
  delete from dm_conversations
   where (user_a = least(OLD.follower_id, OLD.following_id)
      and user_b = greatest(OLD.follower_id, OLD.following_id));
```
- Aprovecha `user_a = menor id` (convención existente) → un solo predicado.
- `dm_messages` se borra solo (CASCADE ✅). Las **fotos** de esos DMs deben limpiarse igual que
  §1: como el trigger SQL no puede llamar a la Storage API, la limpieza de objetos conviene
  hacerla en la **misma Edge Function de purga** (barrido de objetos `post-media` sin fila que los
  referencie) o en el servicio `unfollowUser` (recoger `media_url` de los DMs antes de borrar y
  removerlos). **Decisión pendiente:** trigger (borra filas ya) + barrido de huérfanos en la
  Edge Function, vs. hacer todo el flujo en `unfollowUser` (app-level, pierde robustez ante otras
  rutas de unfollow).
- **Ojo con el modelo "mutuo":** con la definición A, borrar los DMs al quitar **una** dirección
  del follow es coherente con "dejaron de ser amigos" (ya no es mutuo). Si en el futuro se adopta
  amistad con aceptación (Opción B), el trigger se reengancha a esa tabla.

**Gate adyacente (no pedido, pero relacionado):** si se quiere "solo amigos mandan DM", hay que
añadir el check de follow-mutuo en `getOrCreateConversation` **y** en las RLS de
`dm_conversations`/`dm_messages` (hoy solo validan participante). Se puede planificar aparte.

### Prioridad de piezas
| Pieza | Tipo | Bloqueadores |
|---|---|---|
| Purga TTL messages | Edge Function + cron (pg_cron/pg_net o Scheduled EF) | habilitar extensiones; decidir pins/system |
| unfriend borra DMs | migración (trigger en `follows`) + limpieza de fotos | **definir "amigos" (mutuo)**; decidir dónde se limpian las fotos de DM |

### Notas / decisiones abiertas para el usuario
1. Confirmar **"amigos = follow mutuo"** (Opción A) para esta tanda, o pedir sistema de
   solicitudes (Opción B, mayor).
2. ¿Los mensajes anclados/`is_system` **también** expiran a las 24h? (afecta el `WHERE` de purga).
3. ¿Limpieza de fotos por **Edge Function** (recomendado, libera el binario) o se acepta de
   momento solo borrar filas?
4. `pg_cron` propio vs. **Scheduled Edge Function** de Supabase para disparar la purga.
