# Inventario — Layout de la pantalla de chat del usuario final

**Fecha:** 2026-07-05
**Objetivo:** entender el layout ACTUAL antes de reorganizarlo al nuevo orden vertical deseado:
1. SUB-CHATS (scroll horizontal) · 2. USUARIOS EN LÍNEA · 3. MAIN CHAT ROOM (mensajes) · 4. Input.

> ⚠️ **Nota de ubicación del código:** el código real vive en `/Users/jcgarcia/Projects/JchatVer3.0`
> (repo git en `main`), **no** en `/Users/jcgarcia/Projects/Jchat Ver 3.0` (con espacios, casi vacío).
> Existen además carpetas duplicadas (`Jchat Ver 3.0 copy`, `jchat-main`, `jchat-main copy`).
> Esta pantalla NO tiene equivalente en `mobile/` dentro del working dir actual.

---

## Resumen ejecutivo (qué existe / qué falta)

| Sección deseada            | ¿Existe hoy? | Dónde                                          |
|----------------------------|--------------|------------------------------------------------|
| 1. SUB-CHATS (nav horiz.)  | ❌ **NO existe** en el chat del usuario | Hay que **construirla**. El modelo de datos existe (`rooms.parent_room_id`, `is_sub_room`) y el **dashboard del negocio** ya lista sub-salas, pero el lado del cliente (`/c/[token]`) sólo resuelve **una** sala. |
| 2. USUARIOS EN LÍNEA       | ✅ **SÍ existe** | `ChatRoom.tsx` — "presence bar" (tira horizontal de avatares) vía Supabase Presence. |
| 3. MAIN CHAT ROOM (msgs)   | ✅ **SÍ existe** | `ChatRoom.tsx` — lista de mensajes con realtime. |
| 4. Input de mensaje        | ✅ **SÍ existe** | `ChatRoom.tsx` — input row (textarea + adjuntar + enviar). |

**Conclusión:** las secciones 2, 3 y 4 ya existen **y ya están en ese orden**. Lo único que falta CREAR es la **sección 1 (SUB-CHATS scroll horizontal)** y colocarla arriba del todo (encima de la presence bar).

---

## Archivos de la ruta `/c/[token]`

```
web/app/c/[token]/
├── page.tsx           # QR entry (server): resuelve token → RoomHub / pantalla QR inválido
├── RoomHub.tsx        # (client) hub post-login: Menú · Servicio · Entrar al chat
├── JoinRoomButton.tsx
└── room/
    ├── page.tsx       # (server) gate de acceso → renderiza <ChatRoom>
    └── ChatRoom.tsx   # (client) LA PANTALLA DE CHAT (header, presencia, mensajes, input)
```

`ChatRoom.tsx` **es** el componente completo de la pantalla de chat (ocupa `100svh`, flex column).
El `room/page.tsx` padre sólo hace de Server Component: resuelve el token, verifica sesión/acceso,
obtiene `chat_theme_id`, y le pasa props (`roomId`, `roomName`, `businessName`, `businessId`, `userId`, `chatThemeId`).
**No aporta UI de sub-canales ni de rooms.**

---

## 1) SUB-CHATS / SUB-CANALES

### ¿Existe navegación entre chat principal y sub-canales en la pantalla del usuario?
**No.** El flujo del cliente resuelve el QR a **una sola sala** mediante el RPC `resolve_room_qr(token)`,
que devuelve un único registro:

```ts
// web/app/c/[token]/room/page.tsx:15-22
interface ResolvedRoom {
  room_id: string;
  parent_room_id: string | null;
  business_id: string;
  business_name: string;
  room_name: string;
  is_sub_room: boolean;   // ← sólo un flag, NO una lista de hermanas/hijas
}
```

```ts
// web/app/c/[token]/room/page.tsx:48-54
const [{ data: rpcData }, { data: authData }] = await Promise.all([
  supabase.rpc("resolve_room_qr", { token }),
  supabase.auth.getUser(),
]);
const room = (rpcData as ResolvedRoom[] | null)?.[0] ?? null;
```

Lo único que hace hoy con `is_sub_room` es mostrar un texto informativo ("También tendrás acceso a la
sala principal del lugar") en `page.tsx:225` y `RoomHub.tsx:190`. **No hay tabs, ni dropdown, ni lista,
ni cambio de sala dentro de `ChatRoom.tsx`.**

### ¿El modelo de datos soporta sub-salas? — Sí
La tabla `rooms` tiene `parent_room_id` (FK a sí misma). Confirmado en:
- `web/lib/database.types.ts:2535` (`parent_room_id: string | null`, FK `rooms_parent_room_id_fkey`)
- `supabase/migrations/001_initial_schema.sql` (tabla `rooms`)
- RPC `resolve_room_qr` (migración `026_room_qr_tokens.sql`)

### ¿Dónde SÍ se listan sub-salas hoy? — En el dashboard del NEGOCIO (no del usuario)
`web/app/dashboard/chat/page.tsx` sí construye y renderiza la lista de sub-salas para el dueño:

```ts
// web/app/dashboard/chat/page.tsx:1292-1293
const subRooms = rooms.filter((r) => !r.is_main);
const subRoomCount = subRooms.length;
// ...
// :1421  {subRooms.map((room) => ( ... ))}
```

Esa query trae todas las rooms del negocio:
```ts
// web/app/dashboard/chat/page.tsx:1076
"id, business_id, parent_room_id, name, description, icon, color, slug, ..."
```

### ¿Hay un RPC para listar sub-salas del lado del cliente? — No
Funciones disponibles (de `database.types.ts:3045-3079`): `can_access_room`, `generate_room_qr_token`,
`join_room_via_qr`, `regenerate_room_qr_token`, `resolve_room_qr`, `set_room_password`,
`verify_room_password`, `username_available`, `is_platform_admin`.
**Ninguna devuelve la lista de sub-salas accesibles por un usuario.** Para la nav horizontal habría que:
- crear una query/RPC que traiga las salas del `business_id` (o hijas de `parent_room_id`) accesibles
  por el usuario (respetando RLS / `can_access_room` / `room_members`), y
- un componente de tira horizontal + estado de "sala activa" + navegación (`router.push(/c/{token}/room)`
  o carga in-place cambiando `roomId`).

---

## 2) USUARIOS EN LÍNEA / PRESENCIA — **SÍ existe**

Implementado en `ChatRoom.tsx` con **Supabase Presence** (canal `presence:${roomId}`).

- **Suscripción:** `ChatRoom.tsx:302-378` (`setupPresence`): obtiene el perfil del usuario, hace
  `channel(...).track({ user_id, display_name, avatar_url, is_incognito, nickname })` y escucha
  `sync`/`join`/`leave`.
- **Estado:** `presentUsers: PresenceUser[]` (`ChatRoom.tsx:138`), construido con `buildPresentUsers()`
  (`:88-114`) que deduplica por `user_id` y respeta incógnito.
- **Modo demo** (sin Supabase): muestra sólo al usuario actual (`:305-308`).
- **También lee `room_members`** en la carga inicial (`:204`) pero sólo para **gatear acceso** (membresía
  vigente), no para pintar presencia.

### UI actual de presencia
`ChatRoom.tsx:763-845` — "presence bar": tira horizontal (`overflowX: auto`) de avatares circulares (34px),
con anillo en el avatar propio, 🎭 para incógnito, y contador `{n} en línea` (`:841`). Va **entre el header
y la lista de mensajes**.

---

## 3) LAYOUT ACTUAL de `ChatRoom.tsx` (JSX de nivel superior)

El `return` principal (estado `ok`, `ChatRoom.tsx:712-1491`) es un `<div style={s.wrap}>` con
`height:100svh; display:flex; flexDirection:column`, y contiene **en este orden**:

```
<div s.wrap>  (flex column, 100svh)
├── <div s.header>                      ← HEADER  (:715-761)
│     back button + roomName + businessName
│
├── <div presence bar>                  ← USUARIOS EN LÍNEA  (:763-845)
│     tira horizontal de avatares + "{n} en línea"
│
├── <div s.msgList> (flex:1)            ← MAIN CHAT ROOM (mensajes)  (:848-1041)
│     empty-state / mensajes (texto|imagen, badges Dueño/Staff, hora) + <bottomRef>
│
└── <div s.inputRow>                    ← INPUT  (:1044-1291)
      [+ adjuntar] textarea [enviar]
      · panel flotante de adjuntos (Foto/Menú/Servicio/Match)  (:1076-1214)
      · sendError toast
</div>

<Waiter sheet overlay>                  ← bottom-sheet "Llamar al mesero"  (:1293-1489, position:absolute)
```

Estados no-ok (returns tempranos, mismo `s.wrap`): `loading` (:614), `no_access` (:631), `error` (:694).

### Estilos de layout relevantes (`ChatRoom.tsx:571-611`)
- `wrap`: `height:100svh`, flex column, `overflow:hidden`, `position:relative`.
- `header`: `flexShrink:0`.
- `msgList`: `flex:1`, `overflowY:auto` (ocupa el resto).
- `inputRow`: `flexShrink:0`.
- La presence bar (inline, no en `s`): `flexShrink:0`, `overflowX:auto`, `minHeight:46`.

---

## 4) ¿ChatRoom es la pantalla completa o hay layout padre?

`ChatRoom.tsx` **es** la pantalla completa (dueña de `100svh`, mensajes, realtime, presencia, input).
El único padre es `room/page.tsx` (Server Component) que **sólo** resuelve datos y hace de gate de acceso;
**no** aporta UI de rooms/sub-canales. (Su contenido completo está transcrito en la sección de archivos.)

---

## Implicaciones para la reorganización

Orden **deseado**:  `1 SUB-CHATS → 2 USUARIOS EN LÍNEA → 3 MENSAJES → 4 INPUT`
Orden **actual**:   `HEADER → 2 USUARIOS EN LÍNEA → 3 MENSAJES → 4 INPUT`

- **2, 3 y 4 ya existen y ya están en el orden correcto** → sólo reubicar/mantener.
- **Falta CREAR la sección 1 (SUB-CHATS scroll horizontal)** e insertarla arriba de la presence bar.
  Requiere: (a) fuente de datos nueva (query/RPC de sub-salas accesibles), (b) componente de tira
  horizontal, (c) lógica de "sala activa" + navegación entre salas.
- **Decisión pendiente:** ¿qué pasa con el `HEADER` actual (back + nombre de sala + negocio)? El nuevo
  orden no lo menciona; probablemente se conserva arriba del todo o su info se integra en la nav de sub-chats.
