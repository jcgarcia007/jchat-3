# Fase 3 — La Regla de Oro: diseño de la barrera server-side

> Sub-documento de docs/EPICA_GEOCERCA_ACCESO_CHAT.md (§3).
> **Estado: PROPUESTA DE DISEÑO — pendiente de aprobación de Juan + reconocimiento 3.0 antes de construir.**
> Fecha: 2026-07-28

---

## Decisiones de Juan ya integradas

1. **Opción A:** reutilizar el mecanismo existente (`room_members` + patrón `join_room_via_qr` +
   gate `can_access_room`), no una barrera aislada.
2. **La regla de oro aplica a TODAS las salas de negocio** (con o sin contraseña).
3. **El dueño del negocio SIEMPRE entra** a su chat, sin importar su ubicación.

---

## 1. Cómo funciona el acceso HOY (leído del código real)

- Única barrera al leer/escribir mensajes: `can_access_room(_room_id)` (SECURITY DEFINER,
  `019_room_membership.sql`), evaluada por la RLS de `messages` en SELECT e INSERT.
- Da acceso si: `sala.is_password_protected = false` **OR** existe `room_members` vigente
  **OR** `auth.uid()` es el dueño del negocio.
- `room_members(room_id, user_id, expires_at)` — **PK = (room_id, user_id)** → un usuario tiene
  como máximo UNA fila por sala. Las membresías solo las crea el servidor (RPC SECURITY DEFINER).
- Dos vías de membresía hoy, ambas 24h: `verify_room_password` (contraseña ok) y
  `join_room_via_qr` (QR válido).

## 2. El agujero que cierra la regla de oro

Hoy, una sala de negocio **sin contraseña** → `is_password_protected = false` → **acceso libre a
cualquiera, esté donde esté**. Ese es el agujero. La regla de oro exige que, para salas de
negocio, el acceso libre-por-no-tener-contraseña se sustituya por acceso-si-estás-en-el-radio.

## 3. El problema de diseño central: la geo NO es una membresía intercambiable

| Vía de acceso | Expiración | ¿Depende de ubicación? |
|---|---|---|
| Contraseña (`verify_room_password`) | 24h fijo | No |
| QR (`join_room_via_qr` → Fase 5: 12h) | 12h fijo | No (presencia física por escaneo) |
| **Geo (nueva)** | **corta (~heartbeat + gracia)** | **Sí — se renueva solo mientras estés dentro** |
| Dueño | — (siempre) | No |

La geo-membresía tiene expiración corta **a propósito**: esa expiración es el mecanismo que saca
al usuario cuando deja de renovar (porque salió del radio). Si la metemos en la misma
`room_members.expires_at` intercambiable, se rompe la regla de oro (una membresía de contraseña de
24h dejaría entrar sin importar ubicación).

**Conclusión:** hay que **distinguir el tipo de acceso**. Sigue siendo Opción A (mismo mecanismo,
mismo gate), pero `room_members` necesita saber el *origen* de cada acceso.

## 4. Propuesta concreta

### 4.1 Distinguir el tipo de acceso
Dos alternativas (a decidir con el reconocimiento 3.0, según el uso real de contraseñas):

- **Alternativa 1 — columna `access_kind` + PK ampliado.** `room_members` gana columna
  `access_kind text check (access_kind in ('password','qr','geo'))`, y el PK pasa a
  `(room_id, user_id, access_kind)`. Así un usuario puede tener a la vez, en la misma sala, una
  membresía de contraseña (24h) Y una geo (corta) sin pisarse. `can_access_room` evalúa según el
  tipo. **Más flexible, permite "contraseña Y geo" en salas que tengan ambas.**
- **Alternativa 2 — tabla separada `room_geo_presence(room_id, user_id, expires_at, last_seen_at)`.**
  La geo vive aparte; `room_members` queda intacto para password/qr. `can_access_room` consulta
  ambas. **Más aislado, cero riesgo de romper el flujo password/qr existente.**

**Recomendación:** Alternativa 2 (tabla separada) si el reconocimiento confirma que romper
`room_members` es arriesgado; Alternativa 1 si se prefiere un solo lugar. Ambas respetan Opción A.
Decisión final tras reconocimiento.

### 4.2 La matriz de acceso (nuevo `can_access_room`)
Para una sala **con `business_id`** (sala de negocio):

```
acceso =
     es_dueño_del_negocio                          -- SIEMPRE (decisión 3)
  OR geo_presencia_vigente(room, user)             -- dentro del radio, renovada por heartbeat
  OR qr_membresia_vigente(room, user)              -- QR 12h (presencia física)
  -- y si la sala TIENE contraseña, además haber pasado la contraseña
  --   (la contraseña es capa ADICIONAL, no sustituye a la geo — decisión 2)
```

Para una sala **sin `business_id`** (si existen — DMs, salas de sistema): la regla de oro **NO
aplica** (no tienen ubicación). Se mantiene el comportamiento actual. **⚠️ SUPUESTO A VERIFICAR:
¿todas las salas tienen business_id? ¿los DMs son `rooms` o un sistema aparte?**

### 4.3 La nueva RPC (patrón `join_room_via_qr`)
```
check_geofence_and_join_room(_room_id uuid, _lat float8, _lng float8) returns ...
  SECURITY DEFINER:
  1. auth.uid() no null, si no → 'auth_required'
  2. resolver el negocio de la sala → businesses.lat/lng + geofence_radius_m
     (fiables tras Fase 1.0)
  3. si el usuario es el dueño → otorgar acceso sin chequear distancia (decisión 3)
  4. calcular distancia Haversine SERVER-SIDE entre (_lat,_lng) y (business.lat,lng)
  5. si distancia <= radio → crear/renovar geo-presencia con expiración corta
     si distancia > radio → NO otorgar (o revocar la geo-presencia existente) → 'outside_radius'
  6. devolver estado (dentro/fuera, distancia, expiración)
```
- **El cliente envía sus coordenadas; el servidor calcula y decide.** El cliente NUNCA decide si
  está dentro (podría mentir) — solo reporta lat/lng; el Haversine y la comparación con el radio
  son server-side. Esa es la barrera real.
- Haversine en SQL: fórmula estándar con `earthdistance`/`cube` (extensión Postgres) o cálculo
  manual con `acos/sin/cos`. **⚠️ VERIFICAR:** ¿está `earthdistance` disponible, o se calcula a
  mano? (el cliente ya tiene un Haversine en `geofence.ts` — el server necesita el suyo propio).

### 4.4 El heartbeat (cliente — Fase 3.2, después de la barrera)
- Permiso GPS **una vez**. Check al entrar (llama a la RPC). Si `outside_radius` → no entra.
- Mientras el chat está abierto en primer plano: cada ~5 min, re-llamar la RPC con la ubicación
  actual → renueva la geo-presencia (expiración corta). Si sale del radio → aviso + gracia ~2 min
  → si no vuelve, la geo-presencia expira sola y `can_access_room` deja de dar acceso.
- El heartbeat es SOLO UX (dispara la renovación). La barrera real es la RPC + `can_access_room`.

## 5. Supuestos a verificar en el reconocimiento 3.0 (ANTES de construir)

1. **Modelo de `rooms`:** ¿todas tienen `business_id`? ¿hay salas sin negocio (DMs, sistema) a
   las que la regla de oro NO debe aplicar? ¿Los DMs son `rooms` o un sistema aparte (parece que
   sí, por `DMChat`)?
2. **Uso real de contraseñas en salas de negocio:** ¿las salas de negocio usan `is_password_protected`
   en la práctica, o es una feature poco usada? Esto decide si "contraseña Y geo" necesita
   soportarse plenamente (Alternativa 1) o casi nunca ocurre (Alternativa 2 basta).
3. **Cadena de entrada exacta (móvil y web):** ¿dónde exactamente se entra al chat de un negocio
   hoy? (Fase 0 vio `NearbyScreen:467 → ChatRoom` sin chequeo). Es el punto donde inyectar la
   llamada a la nueva RPC antes de mostrar el chat.
4. **`expo-location`:** ¿está instalado y con permisos configurados en el móvil? ¿Cómo se pide hoy
   el permiso? (Fase 0 vio que se usa para GPS, confirmar estado del permiso y del `app.config`).
5. **Haversine server-side:** ¿está la extensión `earthdistance`/`cube` en la BD, o se calcula a
   mano en SQL? El cliente ya tiene `isWithinRadius` en `geofence.ts`.
6. **`check_ins`:** existe pero nunca se activa (call-sites pasan `undefined`). ¿Se conecta a este
   flujo (registrar el check-in al entrar por geo) o se deja como está?
7. **Web:** ¿el acceso al chat de negocio desde web (aparte del QR) necesita el mismo gate geo? El
   navegador también puede dar geolocalización (`navigator.geolocation`). ¿O el chat de negocio en
   web es solo vía QR (presencia física ya probada)?

## 6. Orden de construcción (sub-fases de Fase 3)

- **3.0 — Reconocimiento** (cierra los 7 supuestos de §5). Solo lectura.
- **3.1 — Barrera server-side:** migración (estructura de geo-presencia elegida en §4.1) + RPC
  `check_geofence_and_join_room` (Haversine server-side) + `can_access_room` revisado con la matriz
  de §4.2. **Es el corazón — la barrera real.** Se prueba server-side (SQL) antes de tocar cliente.
- **3.2 — Cliente móvil:** permiso GPS una vez, check al entrar, heartbeat 5min solo-chat-abierto,
  aviso + gracia 2min, estados UX. i18n bilingüe.
- **3.3 — Cliente web** (si §5.7 lo requiere): gate geo en el acceso web al chat de negocio.

## 7. Principios (no negociables)

- **El cliente reporta ubicación; el servidor decide.** Nunca confiar en un "estoy dentro" del
  cliente. Haversine + comparación con radio = server-side.
- **Degradar con seguridad, no con permisividad:** si algo falla (sin GPS, error), el default es
  NO dar acceso (la regla de oro es restrictiva por diseño), salvo dueño y salvo QR.
- **No romper el acceso existente:** password, QR y dueño deben seguir funcionando exactamente
  igual. La geo se AÑADE, no reemplaza esas vías.
- **Fase 1.0 hace fiables lat/lng + geofence_radius_m** — la barrera lee esos con confianza.
