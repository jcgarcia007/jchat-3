# Plan Maestro — Sistema Social de JChat (Stage 1, estilo Instagram)

> **SOLO DISEÑO. Nada implementado.** Auditoría del estado real (proyecto
> `klfsgcfoahdtkojyqspd`, esquema en vivo + código) el 2026-07-08 + diseño de los 4
> módulos. Base: decisiones de producto ya tomadas (follow unidireccional Instagram,
> público por defecto, gate de DM por setting del receptor, unfollow NO borra DMs /
> bloqueo sí corta, posts foto+texto+likes+comentarios, bucket separado para posts
> permanentes, móvil primero). Reutiliza `docs/SPEC.md` §13 (privacidad) y §6.5
> (interacciones) y `docs/DIAGNOSTICO_TTL_CHAT.md` (canal efímero vs permanente).

---

## TL;DR — el hallazgo que cambia el enfoque

**El sistema social NO es greenfield: está ~70% andamiado a nivel de BD y pantallas,
pero SIN aplicar (unenforced) y a medio cablear.** Las tablas `posts`, `post_likes`,
`comments`, `follows`, `follow_requests`, `blocks`, `dm_conversations`, `dm_messages`
**ya existen** (migraciones `002_social_schema.sql` + `003_schema_catchup.sql`), con RLS.
`PrivacyScreen` (963 líneas) **ya persiste los 17 settings del spec §13** en
`users.privacy_settings` (jsonb). `posts.ts` ya tiene feed/crear/like/comentar.

⇒ El trabajo de Stage 1 **no es crear el modelo, es APLICARLO**: (1) el gate de cuenta
privada (existe `follow_requests` pero nadie lo usa), (2) **la aplicación de privacidad
en RLS** — hoy `posts_read`, `comments_read`, `post_likes_read` y `follows read` son
todas **`qual = true`** (todo público, los settings de §13 se guardan pero **no se
respetan**), (3) el **gate de DM** (hoy inexistente), (4) **separar el bucket** de posts
del chat efímero, (5) construir los servicios/pantallas que faltan (follow_requests,
blocks, FriendsScreen).

---

# PASO 1 — Auditoría del estado real

## 1.1 Tablas (todas existen; todas vacías salvo `follows`=1)

| Tabla | Columnas reales | Constraints | Estado |
|---|---|---|---|
| `follows` | `id, follower_id, following_id, created_at` | UNIQUE(follower,following) | ✅ existe. **Unidireccional, SIN estado pending.** 1 fila. |
| `follow_requests` | `id, requester_id, target_id, status default 'pending', created_at` | UNIQUE(requester,target) | ✅ **existe** (para cuentas privadas) — 0 filas, **sin usar**. |
| `blocks` | `id, blocker_id, blocked_id, created_at` | UNIQUE(blocker,blocked) | ✅ existe — 0 filas, **sin usar**. |
| `posts` | `id, user_id, caption, media_urls text[], geotag, created_at` | PK | ✅ existe. **NO tiene columna `visibility`.** 0 filas. |
| `post_likes` | `id, post_id, user_id, created_at` | UNIQUE(post,user) | ✅ existe. |
| `comments` | `id, post_id, user_id, body, created_at` | PK (sin unique — múltiples ok) | ✅ existe. (Nombre real: `comments`, no `post_comments`.) |
| `dm_conversations` | `id, user_a, user_b, last_message_at, created_at` | user_a = id menor | ✅ existe. `dm_messages` cae por CASCADE. |
| `dm_messages` | `id, conversation_id, sender_id, body, media_url, voice_url, read_at, created_at` | FK CASCADE desde conv | ✅ existe. |
| `stories`, `story_views` | — | — | ✅ existen pero **fuera de v1** (stories = después). |

## 1.2 RLS actual — **el gran hueco: privacidad NO aplicada**

| Tabla · policy | cmd | qual / with_check | Lectura |
|---|---|---|---|
| `posts_read` | SELECT | **`true`** | 🔴 cualquiera lee cualquier post |
| `comments_read` | SELECT | **`true`** | 🔴 público |
| `post_likes_read` | SELECT | **`true`** | 🔴 público |
| `follows: authenticated read` | SELECT | **`true`** | 🔴 cualquiera ve followers/following de cualquiera |
| `posts_insert/update/delete_own` | — | `user_id = auth.uid()` | ✅ correcto |
| `comments_write_own`, `post_likes_write_own` | ALL | `user_id = auth.uid()` | ✅ |
| `follow_requests_create` | INSERT | `requester_id = auth.uid()` | ✅ |
| `follow_requests_target_update` | UPDATE | `target_id = auth.uid()` | ✅ (el dueño acepta/rechaza) |
| `follow_requests_requester_delete` | DELETE | `requester_id = auth.uid()` | ✅ (cancelar solicitud) |
| `follow_requests_visible` | SELECT | `requester_id = auth.uid() OR target_id = auth.uid()` | ✅ |
| `blocks_own` | ALL | `blocker_id = auth.uid()` | ✅ (cada quien gestiona sus bloqueos) |
| `dm_conv_participants` | ALL | `user_a=uid OR user_b=uid` | ⚠️ solo participante, **sin gate de amistad/DM** |
| `dm_msg_send` | INSERT | `sender_id=uid AND participante` | ⚠️ sin gate |

**Conclusión RLS:** el andamiaje de escritura está bien; **la LECTURA no respeta
privacidad** (todo `true`) y **el DM no tiene gate**. Ese es el núcleo del trabajo.

## 1.3 `users` — columnas de perfil y settings (verificado)

Presentes: `id, username, display_name, avatar_url, bio, cover_url, city,
profile_theme_id (default 1), is_incognito, is_verified, push_token, language,
privacy_settings jsonb default '{}', settings jsonb default '{}', onboarding_completed,
role, plan, …`.

- ✅ Tiene `bio`, `cover_url`, `city`, `profile_theme_id`.
- 🔴 **NO tiene `is_private` / `account_visibility` como columna.** La visibilidad vive
  (hoy) dentro de `privacy_settings.accountVisibility` (jsonb). Para RLS conviene una
  **columna booleana top-level** (ver Módulo B).
- `privacy_settings` (jsonb) **ya existe** (los `TODO(schema): add users.privacy_settings`
  en `PrivacyScreen.tsx` están **obsoletos** — la columna ya está).

## 1.4 Pantallas / servicios (código)

| Pieza | Estado |
|---|---|
| `mobile/screens/settings/PrivacyScreen.tsx` (963 líneas) | ✅ **implementada**. Persiste los 17 settings del §13 a `users.privacy_settings` (debounce 800ms). Lee `blockedCount`. **Falta:** que esos settings se **apliquen** en RLS/queries. |
| `mobile/screens/profile/ProfileScreen.tsx` (623) | ✅ implementada. **5 tabs** ya definidos: `posts, reels, places, gifts, saved` (con underline accent). (Spec §13 lista Posts/Stories/Places/Gifts/Saved → aquí "reels" ≠ "stories".) |
| `mobile/screens/profile/EditProfileScreen.tsx` (1063) | ✅ implementada. |
| `mobile/screens/feed/FeedScreen.tsx` (426) + `components/feed/PostCard.tsx` | ✅ implementada. |
| `mobile/services/posts.ts` | ✅ `listFeed(followingIds)`, `getUserPosts`, `createPost`, `likePost/unlikePost`, `getComments/addComment`, `uploadPostMedia`. **Sube a `post-media`** (línea 109) 🔴. Sin filtro de visibilidad. |
| `mobile/services/users.ts` (follows) | ⚠️ solo `followUser` (upsert directo), `unfollowUser`, `isFollowing`, `getFollowerCount/getFollowingCount`. **Unidireccional simple, sin pending, sin blocks, sin removeFollower.** |
| `mobile/services/dms.ts` | ⚠️ `getOrCreateConversation` **sin gate**; `listConversations`, `sendMessage`, `markRead`. |
| `mobile/screens/friends/FriendsScreen.tsx` (26) | 🔴 **STUB** ("Coming — Task 1.15"). |
| Servicios `follow_requests`, `blocks` | 🔴 **no existen**. |
| `mobile/theme/profileThemes.ts` | ✅ `PROFILE_THEMES` con **15 temas** (Task 0.5). |

## 1.5 Buckets de Storage (verificado)

`avatars(public)`, `covers(public)`, `menu-photos(public)`, **`post-media(public)`**,
`verification-selfies(private)`, `voice-notes(public)`. **No hay bucket dedicado de
posts.** 🔴 **`post-media` lo usan HOY dos cosas: los posts permanentes
(`posts.ts:uploadPostMedia`) Y el chat efímero de sala (`ChatRoomScreen` →
`uploadImage(...,'post-media')`).** ⇒ la purga TTL 24h del chat y los posts permanentes
comparten bucket (riesgo directo — decisión de producto #6).

## 1.6 Cobertura del SPEC (§13 privacidad · §6.5 interacciones · §14 temas)

| Spec | Definición | Estado |
|---|---|---|
| §13 Account visibility | Public / Private (requests aprobados) | Setting guardado ✅ · **enforcement 🔴** · `follow_requests` existe ✅ |
| §13 Who sees my posts | Everyone / Followers / Nobody | Setting ✅ · **enforcement 🔴** (`posts_read=true`) |
| §13 Who can DM me | Everyone / Followers / Nobody | Setting ✅ · **gate 🔴** (sin lógica) |
| §13 Places/Gifts tabs, Visible tabs | Everyone/Followers/Nobody + toggles | Settings ✅ · enforcement 🔴 |
| §13 Active status / Offline / Read receipts / Mentions / City | varios | Settings ✅ · enforcement parcial/🔴 |
| §13 Real-time location | **siempre off, locked** | ✅ respetado (regla CLAUDE.md; sin toggle) |
| §6.5 Follow/Add friend, Send DM, Personal block, Report | acciones de usuario | Follow ⚠️ (sin private), DM ⚠️ (sin gate), Block 🔴 (tabla sí, UI/servicio parcial), Report (tabla `reports` existe) |
| §14 Profile themes | 15, usuario elige | `profileThemes.ts` ✅ 15 · selector en EditProfile ✅ |

---

# PASO 2 — Diseño de los 4 módulos

## MÓDULO A — Follow (la base)

### Decisión de esquema: **NO tocar `follows`; usar `follow_requests` (ya existe) para pending**
`follows` queda como **grafo de aristas ACEPTADAS** únicamente (unidireccional, tal cual
hoy). Las solicitudes pendientes de cuentas privadas van a `follow_requests(status)` que
**ya existe con su RLS**. Justificación:
- **Preserva los follows existentes sin migración** (la fila actual es, por definición, un
  follow aceptado). No hay `ALTER TABLE follows` → cero riesgo sobre datos vivos.
- Separa responsabilidades: `follows` = "quién sigue a quién (efectivo)"; `follow_requests`
  = "solicitudes en curso". Los feeds/contadores leen solo `follows` (simple y rápido).
- El andamiaje de RLS de `follow_requests` (create/visible/target_update/requester_delete)
  ya soporta exactamente el flujo pedido.
- *(Alternativa descartada: añadir `follows.status`. Obligaría a filtrar `status='accepted'`
  en TODAS las queries existentes y a migrar la fila viva; más superficie de error por
  cero beneficio.)*

### Flujos
| Acción | Cuenta pública del target | Cuenta privada del target |
|---|---|---|
| **Seguir** | insert directo en `follows` (follower=yo) | insert en `follow_requests` (pending); **no** aparece en `follows` aún |
| **Aceptar solicitud** | — | RPC `accept_follow_request`: inserta la arista en `follows` + borra el request (atómico) |
| **Rechazar** | — | `update follow_requests set status='rejected'` o delete (target) |
| **Cancelar mi solicitud** | delete `follow_requests` (requester) | idem |
| **Dejar de seguir** | delete `follows` (follower=yo) | idem |
| **Quitar seguidor** (que me sigue) | RPC `remove_follower`: borra la arista donde following=yo | idem |
| **Bloquear** | insert `blocks` + **borrar aristas en ambos sentidos** + borrar requests pendientes | idem |
| **Desbloquear** | delete `blocks` | idem |

> **RPC `accept_follow_request` (SECURITY DEFINER) es necesaria:** al aceptar, quien
> ejecuta es el **target**, pero la arista a crear tiene `follower_id = requester` (≠ target)
> → la RLS `follows insert (follower_id = auth.uid())` **bloquea** al target. La RPC inserta
> la arista + borra el request en una transacción, con guard `target_id = auth.uid()`.
> Igual para `remove_follower` (borra arista donde `following_id = auth.uid()`, que la RLS
> `delete own` (follower) no permite).

### Contadores (followers / following)
**Recomendación: `count` queries ahora, denormalizar después.**
- A escala de lanzamiento (usuarios ~miles, no millones) `select count(*) from follows
  where following_id=?` con índice es barato. Ya hay `getFollowerCount/getFollowingCount`.
- **Plan de denormalización (cuando el perfil sea hot):** columnas
  `users.followers_count / following_count` mantenidas por trigger `AFTER INSERT/DELETE ON
  follows`. Dejar anotado; no construir en v1.
- Índices necesarios: `follows(following_id)` y `follows(follower_id)` (confirmar que
  existen; si no, añadirlos en la migración del módulo).

### RLS (lo que hay que cambiar)
- **`follows read` (hoy `true`) → gate estilo Instagram:** ver la lista de followers/following
  de X si: **X es público**, **o** yo sigo a X (aceptado), **o** soy X. Y **excluir bloqueos**
  en ambos sentidos. Se implementa con un helper `can_view_profile(viewer, target)`.
- `follow_requests`: RLS actual ya correcta.
- `blocks`: `blocks_own` correcta. Todas las lecturas sociales deben **filtrar bloqueos**
  (helper `is_blocked(a,b)` usado en policies de posts/dm/follows).

### Servicios/pantallas a construir
`mobile/services/follows.ts` (nuevo, o extender `users.ts`): `requestOrFollow(target)`
(branch por `is_private`), `acceptRequest`, `rejectRequest`, `cancelRequest`,
`removeFollower`, `listPendingRequests`. `mobile/services/blocks.ts`: `block/unblock/
listBlocked/isBlocked`. **`FriendsScreen`** (hoy stub) → tabs Followers / Following /
Requests. `follow_requests` alimenta notificaciones (tabla `notifications` existe).

---

## MÓDULO B — Perfil + privacidad

### Columna nueva: `users.is_private boolean NOT NULL default false`
- **Público por defecto** (decisión #2, JChat 18+).
- **Fuente de verdad para RLS.** Justificación: las policies de `follows/posts/dm` necesitan
  chequear "¿la cuenta del autor es privada?" barato; leer `privacy_settings->>'accountVisibility'`
  (jsonb) en cada policy es frágil y lento. Una **columna booleana indexable** es lo correcto.
- Sincronización: `PrivacyScreen` sigue escribiendo `privacy_settings.accountVisibility`
  (UI intacta) **y además** setea `is_private`. Recomendado: hacer `is_private` la fuente y
  que el toggle escriba la columna; mantener el jsonb para el resto de settings. (Un trigger
  `BEFORE UPDATE` puede derivar `is_private` desde el jsonb para no tocar la UI de golpe.)

### Resto de privacidad: **ya modelado en `users.privacy_settings` (jsonb)** — falta APLICAR
`PrivacyScreen` ya persiste (verificado) las claves del §13:
`accountVisibility, showCity, showActiveStatus, offlineMode, whoSeesMyPosts,
whoSeesMyStories, whoSeesPlacesTab, whoSeesGiftsTab, geotagEnabled, tabPosts/Stories/
Places/Gifts/Saved, whoCanDMMe, showReadReceipts, whoCanMentionMe`.
- **No hay que rediseñar el settings-store.** Hay que **enforcar** cada dimensión:
  - `whoSeesMyPosts` → RLS de `posts_read` (Módulo C).
  - `whoCanDMMe` → gate de DM (Módulo D).
  - `whoSeesPlacesTab/GiftsTab` + `tab*` → gating de los tabs del perfil (lectura de
    `check_ins`/`gifts`/`saved` según relación follower).
  - `showActiveStatus/offlineMode/showReadReceipts` → presencia y `read_at` (fuera del
    núcleo de esta tanda; anotar).
  - `showCity` → exponer/ocultar `users.city` en `public_profiles`.
- **Helper central `can_view_user_content(viewer, owner, dimension)`** (SECURITY DEFINER):
  dado un setting `everyone/followers/nobody`, resuelve visible si:
  `everyone` → sí (salvo bloqueo); `followers` → `viewer` sigue a `owner` (aceptado) o es
  el dueño; `nobody` → solo el dueño. Reutilizado por posts, places, gifts, stories.

### 15 temas de perfil
`mobile/theme/profileThemes.ts` (`PROFILE_THEMES`, 15) ✅ + selector en `EditProfileScreen`
✅ + `users.profile_theme_id` ✅. **Nada que hacer** salvo confirmar que el perfil aplica
`PROFILE_THEMES[profile_theme_id]` (ProfileScreen ya usa accent). ✅ listo.

### Pantalla de perfil con tabs
`ProfileScreen` ya tiene 5 tabs (`posts, reels, places, gifts, saved`). Ajustes de diseño:
- **Alinear con spec §13** (Posts/Stories/Places/Gifts/Saved). "reels" del código no está en
  el spec y stories está fuera de v1 → decidir: dejar Posts/Places/Gifts/Saved activos en v1,
  Stories/Reels ocultos hasta su fase. Respetar `tab*` toggles + `whoSees*Tab`.
- **Places tab:** usa `getCheckInHistory()` que **ya quita `created_at`** (regla: nunca
  timestamps de ubicación — spec §13 "no timestamps ever shown"). ✅ preservar.
- **Gifts tab:** `gifts` (tabla existe) gated por `whoSeesGiftsTab`.
- **Saved tab:** requiere tabla `saved_posts(user_id, post_id)` — **no existe** → crear
  (Módulo C opcional).

---

## MÓDULO C — Posts + feed

### Estado: esquema + servicio ya existen; falta visibilidad + bucket
`posts/post_likes/comments` ✅ y `posts.ts` ✅ (crear/feed/like/comentar). Gaps:

### C.1 Bucket separado (decisión #6) — **crítico por la purga TTL del chat**
- **Crear bucket `profile-media` (public)** para fotos de posts permanentes.
- Repuntar `posts.ts:uploadPostMedia` de `post-media` → `profile-media` (mismo path
  `{userId}/{ts}.jpg`, mismas RLS de Storage por prefijo de usuario).
- **Dejar `post-media` exclusivo del chat efímero** (mensajes de sala, TTL 24h). Así la
  Edge Function de purga (ver `DIAGNOSTICO_TTL_CHAT.md`) puede borrar objetos de `post-media`
  **sin riesgo de tocar posts permanentes**.
- Migración de datos: `posts` tiene **0 filas** → **no hay nada que migrar**. Limpio.
- RLS de Storage del bucket nuevo: leer público, escribir/borrar solo dueño por prefijo
  `{auth.uid()}/…` (patrón ya usado en `post-media`/`avatars`).

### C.2 Visibilidad de posts
El spec modela "Who sees my posts" como **setting global del usuario** (no por-post). Diseño:
- **Enforcement por el setting global** vía `posts_read` reescrita con
  `can_view_user_content(auth.uid(), posts.user_id, 'whoSeesMyPosts')` **AND NOT
  is_blocked(...)**. Esto sustituye el `qual=true` actual.
- **Opcional (recomendado, barato):** columna `posts.visibility text default 'inherit'`
  (`inherit|everyone|followers|nobody`) para override por-post; `inherit` usa el setting
  global. Da flexibilidad tipo "close friends" a futuro sin rediseñar. Default `inherit`
  no cambia el comportamiento.

### C.3 Feed
- Hoy `listFeed(followingIds)` recibe los IDs desde el cliente y hace `IN`. Debe:
  1. Tomar `followingIds` = `follows` **aceptados** de auth.uid() (el módulo A ya deja
     `follows`=aceptados, así que es directo).
  2. **Respetar visibilidad** (RLS ya lo hará tras C.2) y **excluir bloqueados** (ambos
     sentidos) — vía la RLS reescrita, el `IN` del cliente queda como filtro, y RLS como
     autoridad.
  3. Paginación ya existe (`range`, PAGE_SIZE=20).
- **Muro personal** = `getUserPosts(userId)` (ya existe) gated por la misma RLS (yo siempre
  veo lo mío; otros según setting/relación).
- Contadores de like/comentario: hoy `getLikeCount`/count. Igual que follows: count queries
  ahora, denormalizar `posts.like_count/comment_count` por trigger si se vuelve hot.

### C.4 Comentarios / likes
Ya funcionan. Solo heredan el gate de lectura del post (si no puedo ver el post, no debo ver
sus comentarios/likes → las policies `comments_read`/`post_likes_read` deben pasar de `true`
a "puedo ver el post padre" con un EXISTS sobre `posts` visible).

---

## MÓDULO D — DMs con gate de privacidad

### Estado: canal permanente, participante-only, **sin gate** (verificado)
`getOrCreateConversation` crea conversación entre cualquier par; RLS solo exige ser
participante. Los DMs son **permanentes** (no TTL) y **unfollow NO los borra** (decisión #4).

### Diseño del gate `whoCanDMMe` (Everyone / Followers only / Nobody)
Aplicar en **dos capas** (defensa en profundidad):
1. **RPC `start_dm(target)` (SECURITY DEFINER)** que reemplaza el insert directo de
   `getOrCreateConversation`. Verifica, con la identidad del caller:
   - **No bloqueo** en ningún sentido (`is_blocked(caller, target)` / inverso) → si hay, 403.
   - Setting `target.privacy_settings.whoCanDMMe`:
     - `everyone` → permitido.
     - `followers` → permitido solo si **el caller es seguidor del target** (`follows` donde
       follower=caller, following=target, aceptado). *(Interpretación Instagram: "mis
       seguidores pueden escribirme". Confirmar en decisiones abiertas.)*
     - `nobody` → denegado (salvo conversación ya existente previa).
   - Si pasa: get-or-create la conversación (convención `user_a` = id menor) y la devuelve.
2. **RLS `dm_conversations` INSERT (with_check)** endurecida con el mismo predicado
   (bloqueo + whoCanDMMe), para que aunque alguien llame a la tabla directo no se salte el
   gate. La RPC es la vía "bonita" (mensajes de error claros); la RLS es la red.
3. **`dm_msg_send`**: añadir al `with_check` que **no exista bloqueo** entre participantes
   (si me bloquean después, dejo de poder escribir).

### Bloqueo corta todo (decisión #4)
Al **bloquear** (Módulo A): borra aristas de `follows` en ambos sentidos, borra
`follow_requests` pendientes, y **oculta las conversaciones/mensajes** — opción A: soft
(las policies de lectura de `dm_*` excluyen pares bloqueados → desaparece de la lista sin
borrar historial); opción B: hard (borrar la conversación). **Recomendado: soft-hide**
(no destruir historial; si se desbloquea, reaparece). Los DMs **no** se borran por unfollow.

### Fotos de DM
`dm_messages.media_url` → deben ir al **bucket permanente** (`profile-media` o uno propio
`dm-media`), **no** a `post-media` efímero, por la misma razón de la purga. Recomendado:
`profile-media` (o `dm-media` privado si se quiere aislar). Anotar como parte de C.1.

---

# PASO 3 — Plan de fases (orden, dependencias, tipo)

Leyenda tipo: 🗄️ migración BD · 📱 código móvil · 🪣 Storage · ⚡ Edge/RPC.

### Fase A+B (juntas) — Fundamento: identidad social + privacidad aplicada
Van juntas porque el enforcement de A (ver followers) y de todo lo demás depende de
`is_private` + los helpers de B.
- 🗄️ `users.is_private` (default false) + sync desde `privacy_settings`. (migración)
- 🗄️ Helpers SECURITY DEFINER: `is_blocked(a,b)`, `can_view_profile(viewer,target)`,
  `can_view_user_content(viewer,owner,dimension)`. (migración)
- 🗄️ RPCs: `request_or_follow(target)`, `accept_follow_request`, `remove_follower`,
  `block_user`/`unblock_user` (con limpieza de aristas/requests). (migración)
- 🗄️ Reescribir RLS `follows read` (gate privado + bloqueo). Índices `follows(follower_id)`,
  `follows(following_id)`. (migración)
- 📱 `services/follows.ts` + `services/blocks.ts`; **FriendsScreen** (Followers/Following/
  Requests); enganchar toggle de cuenta privada; notificaciones de solicitud.
- **Dependencia:** ninguna previa (usa tablas existentes). Es la base de C y D.

### Fase C — Posts + feed con visibilidad + bucket separado
- 🪣 Crear bucket `profile-media` (public) + RLS de Storage por prefijo de usuario.
- 📱 Repuntar `posts.ts:uploadPostMedia` a `profile-media` (posts=0 → sin migración de datos).
- 🗄️ (opcional) `posts.visibility` default `'inherit'`; tabla `saved_posts` para el tab Saved.
- 🗄️ Reescribir RLS `posts_read`, `comments_read`, `post_likes_read` con
  `can_view_user_content(...,'whoSeesMyPosts')` + `NOT is_blocked`. (migración)
- 📱 `listFeed` toma followingIds de `follows` aceptados; PostCard/Feed ya existen.
- **Dependencia:** A+B (helpers + follows aceptados + is_private).

### Fase D — Gate de DM + bloqueo corta
- ⚡/🗄️ RPC `start_dm(target)` (whoCanDMMe + bloqueo). (migración/función)
- 🗄️ Endurecer RLS `dm_conversations INSERT` y `dm_msg_send` con el gate + bloqueo;
  soft-hide de conversaciones con pares bloqueados en las policies de lectura. (migración)
- 📱 `dms.ts:getOrCreateConversation` → llamar `start_dm`; manejar 403 (UI "no puedes
  escribir a este usuario").
- 🪣 fotos de DM → bucket permanente.
- **Dependencia:** A+B (follows/blocks + helpers).

### Resumen de dependencias
```
A+B (identidad + privacidad aplicada + helpers)
   ├──> C (posts/feed usan can_view_user_content + follows aceptados)
   └──> D (DM gate usa whoCanDMMe + follows + blocks)
```
C y D son **paralelizables** una vez cerrada A+B. **Móvil primero**; web después reutiliza
las mismas RPC/RLS (la autoridad está en BD, no en el cliente).

---

## Qué del spec ya está vs. qué falta (resumen)
- ✅ **Ya está:** tablas sociales + RLS de escritura, `follow_requests`/`blocks` (schema),
  `PrivacyScreen` con los 17 settings §13, `posts.ts` (feed/crear/like/comentar),
  ProfileScreen/EditProfile/FeedScreen, 15 profile themes, regla de ubicación locked.
- 🔴 **Falta (el trabajo real de Stage 1):** (1) **aplicar** privacidad en RLS de lectura
  (hoy todo `true`), (2) flujo de cuenta privada (usar `follow_requests` + RPCs), (3) gate de
  DM (`whoCanDMMe`), (4) **separar el bucket** de posts del chat efímero, (5) servicios
  `follows`(v2)/`blocks` + **FriendsScreen**, (6) gating de tabs Places/Gifts/Saved + tabla
  `saved_posts`.

## Integración con el chat efímero
- **Chat de sala = efímero (TTL 24h, `post-media`).** **DMs = permanentes (canal aparte,
  bucket permanente).** La separación de bucket (Fase C.1) es lo que hace **seguro** el purge
  TTL: tras ella, la Edge Function de purga borra objetos de `post-media` sin tocar posts ni
  fotos de DM. Ver `docs/DIAGNOSTICO_TTL_CHAT.md`.

## Decisiones cerradas (confirmadas por el usuario 2026-07-08)
1. ✅ **RESUELTO — "Followers only" en DM** = **"mis seguidores pueden escribirme"**
   (interpretación Instagram estándar). El gate `whoCanDMMe='followers'` permite escribir solo
   a quienes siguen (aceptado) al receptor.
2. ✅ **RESUELTO — Bloqueo = SOFT-HIDE de DMs.** Oculta la conversación/mensajes pero **conserva
   el historial**; **reaparece al desbloquear**. NO borrado duro. (Los DMs tampoco se borran por
   unfollow — decisión #4 de producto.)
3. ✅ **RESUELTO — Tabs del perfil v1** = **Posts / Places / Gifts / Saved** activos.
   **Stories/Reels ocultos** hasta su fase.
4. ✅ **RESUELTO — Bucket de fotos de DM** = **bucket PROPIO `dm-media` PRIVADO** (los DMs son
   privados, no van al bucket público de posts `profile-media`).
5. ✅ **RESUELTO — `posts.visibility` por-post = NO en v1.** Solo el setting global
   `whoSeesMyPosts`. El override por-post se añade después sin rediseñar.
6. ✅ **RESUELTO — Contadores = count-queries en v1.** Denormalización
   (`followers_count`/`following_count` por trigger) **diferida** hasta que el perfil sea hot.
