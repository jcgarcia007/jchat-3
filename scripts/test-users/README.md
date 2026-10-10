# Usuarios de prueba (seed · simulate · cleanup)

> **Estado: escritos, NO ejecutados.** Nada de esto se ha corrido contra ninguna base de datos. Revisa los cuatro scripts y empieza
> por `--dry-run`.

Cuatro scripts para tener una población de usuarios de prueba en el entorno, con la actividad de una app viva, y poder borrarla sin
tocar nada real. Todos leen la llave de servidor **`SB_SECRET_KEY` de `web/.env.local`** (o del entorno) y **nunca la imprimen**.

| Script | Qué hace | Seguro por defecto |
|---|---|---|
| `seed.mjs` | Crea N usuarios `<nombre>NN@test.jchat.cloud` | `--dry-run` solo lista |
| `match-setup.mjs` | Les sube 3 fotos ilustradas, intereses y hace el check-in de Match (todo con su sesión) | `--dry-run` solo muestra el plan y los requisitos |
| `simulate.mjs` | Los hace entrar al local (y salir en la barra de perfiles), escribir, mandarse DM, publicar, dar likes y hacer swipe en Match | `--dry-run` solo muestra el plan |
| `cleanup.mjs` | Borra SOLO usuarios `@test.jchat.cloud` (y su contenido por cascada) | **Dry-run es el modo normal**; borrar exige `--apply` |

## 1. `seed.mjs`
```bash
node scripts/test-users/seed.mjs --dry-run                         # lista lo que crearía
node scripts/test-users/seed.mjs --count 20 --venue bar-xzx-omd2 # crea 20 (por defecto 20; máx. 200)
```
- Crea cada cuenta con el correo `<nombre>NN@test.jchat.cloud` (ej. `lucia01@test.jchat.cloud`), correo ya confirmado, nombre, bio
  ("Cuenta de prueba · …") y **avatar generado** (DiceBear *adventurer*, un dibujo; **nunca fotos de personas reales**). El avatar se
  descarga una vez y se re-aloja en nuestro bucket `avatars` (`<id>/avatar.png`): la app no depende de DiceBear en tiempo de ejecución.
- **Contraseña aleatoria** (18 bytes, base64url) por usuario, guardada **solo** en `scripts/test-users/out/credentials.json`
  (carpeta `out/` ignorada por git; el archivo se escribe con `chmod 600`). No se imprime nunca.
- **Mayores de 18:** llama al RPC `confirm_age` *como el propio usuario* (año de nacimiento aleatorio entre 1985 y 1999; el servidor
  guarda solo el año) con el `TERMS_VERSION` actual de `web/lib/terms.ts`.
- `--venue <slug>` (por defecto `bar-xzx-omd2`): comprueba que el local existe y lo guarda en `credentials.json` para que `simulate` lo use.
- Es **idempotente**: si el correo ya existe no lo duplica (si falta en `credentials.json`, le pone una contraseña nueva).
- **Marca de prueba:** el dominio del correo siempre; y, como la `supabase/migrations/215_test_users_flag.sql` ya está aplicada, además
  `users.is_test = true` (el script lo detecta solo; sin la columna funcionaría igual solo con el dominio).

## 2. `simulate.mjs`
```bash
node scripts/test-users/simulate.mjs --dry-run
node scripts/test-users/simulate.mjs --minutes 10 --users 8 --actions chat,dm,post,like
```
Opciones: `--minutes` (5), `--users` (8, mínimo 2), `--actions` (`chat,dm,post,like`), `--venue`, `--min-gap`/`--max-gap` (ms entre acciones, 3000–9000).
- **Cada acción la hace el propio usuario con su sesión** (no con la llave de servidor), así que **RLS y las reglas del servidor aplican
  igual que en la app**. Si el servidor rechaza algo (enfriamiento, privacidad, presencia, límites) se cuenta y se reporta al final; **no se
  rodea**.
- Para actuar en el chat del local, cada usuario "entra" con `check_geofence_and_join_room` enviando la posición del local (la misma que
  mandan los simuladores con `adb emu geo fix`); se repite cada 4 min por el TTL de presencia.
- Acciones: `chat` (mensaje en la sala principal), `dm` (`start_dm` + mensaje), `post` (publicación de texto, sin foto), `like` (a una de las
  últimas 20 publicaciones).
- **Cómo abre sesión sin contraseña ni captcha** (`lib.mjs`, en este orden):
  1. **Reusa el `refresh_token` guardado** en `out/credentials.json` (`refreshSession`): no es un inicio de sesión nuevo, así que no
     gasta el límite de Supabase Auth ("no session for …" en 5 de 12 usuarios por ese límite).
  2. **Solo si eso falla**, pide con la API de admin un enlace mágico de un solo uso y lo canjea con `verifyOtp` (ese canje no lleva captcha).
  3. Por último prueba la contraseña (puede llevar hCaptcha, que un script no resuelve).

  El `refresh_token` va en el mismo archivo `out/credentials.json` (git-ignorado, `chmod 600`) y **no se imprime nunca**. Rota: cada vez que
  se renueva la sesión (al abrirla y cada hora mientras el script corre) se guarda el nuevo. Si no hay ninguna vía, `simulate` avisa
  "no session for …" y no hace nada para ese usuario.
- Al final imprime una tabla `acción:resultado → n` (por ejemplo `chat:ok: 12`, `dm:42501: 3`) y, si hubo `swipe`, un **resumen de Match**:
  likes y pases a cuentas reales y de prueba, swipes rechazados por ya existir, errores por código, **los matches creados** (con quién) y lo
  que `match_get_activity` ve en ese momento. Se imprime al terminar porque **Match borra los swipes del local cuando vence la presencia**
  y después ya no se pueden revisar.

### Barra de perfiles del chat del local
La barra horizontal de perfiles **sale del canal Realtime de *presence* `presence:<id de la sala principal>`**, con la clave de
presencia igual al id del usuario y este payload: `{ user_id, display_name, avatar_url, is_incognito, nickname }`
(`mobile/screens/chat/usePresenceChannels.ts`, y lo mismo en `web/app/c/[token]/room/ChatRoom.tsx`). **No** sale de `room_members` ni de
`room_geo_presence`: esas tablas solo son la barrera del servidor para poder entrar. Por eso, antes, los usuarios simulados escribían pero
no aparecían: nadie hacía `track()` en ese canal.

Ahora `simulate.mjs`, tras entrar por la geocerca, **se une a ese canal con la sesión del propio usuario (sin la llave de servidor) y
hace `track()` con el mismo payload que la app** (nombre y avatar de su `public_profiles`). Se renueva cada 4 min y se retira al terminar el
script. **Aparecen en la barra solo mientras el script está corriendo** (la presencia vive mientras el socket está abierto). `--no-presence`
lo desactiva.

### Acción `swipe` (Match)
```bash
node scripts/test-users/simulate.mjs --minutes 15 --users 20 --actions chat,swipe
```
Cada acción de un usuario: pide su mazo con `match_get_deck` y hace `like` o `pass` a una carta al azar con `match_swipe` (nunca `super`).
Probabilidad de like: **0,85 hacia cuentas reales** (`is_test = false`, para que `test` y `test1` reciban matches) y **0,35 entre cuentas de
prueba**. Mientras dure la simulación se **renueva el check-in** de Match cada 4 min (junto con la geocerca y la barra), porque el servidor
lo vence a los 15 min. El resultado de cada llamada se cuenta (`swipe:like-real:ok`, `swipe:like-real:match`, `swipe:deck:42501`…).
Sin presencia **activa** el mazo responde `42501 not_present`: ver `JCHAT_QR_TOKEN` en la sección de `match-setup`.

## 3. `match-setup.mjs`
```bash
node scripts/test-users/match-setup.mjs --dry-run                  # plan + requisitos; no necesita llaves ni red
node scripts/test-users/match-setup.mjs --users 20 --photos 3 --wait 90
```
Todo **como el propio usuario** (su sesión), igual que la app (`mobile/services/matchProfile.ts`, `match.ts`):
1. **Fotos:** por usuario, 3 **ilustraciones DiceBear** (estilos `lorelei`, `notionists`, `adventurer`, semillas distintas; dibujos, **nunca
   fotos de personas reales**) bajadas como WebP, subidas a `match-photos/{uid}/{uuid}.webp` (`image/webp`) e insertadas en `match_photos` como
   `pending`. **El script nunca fija el estado**: la moderación normal (trigger → `moderate-match-photo`) las aprueba o no. Espera `--wait`
   segundos los veredictos y los cuenta. Es idempotente (no re-sube si ya tiene `--photos`).
2. **Intereses:** 4 neutrales si no tiene (solo ordenan el mazo).
3. **Local + Match:** `check_geofence_and_join_room` con la posición del local y luego `match_check_in`. El check-in **es** el opt-in
   (el servidor inserta `game_optins`); no hay otra llamada.
4. Revisa que el perfil tenga lo que enseña la tarjeta (edad confirmada, nombre, bio, avatar) y avisa de huecos.

**Requisitos para aparecer en el mazo de otra persona** (migraciones 189–197):
1. Match **encendido** en el local por su dueño (`business_games`); el script nunca lo enciende.
2. Edad confirmada y "participar en juegos" no desactivado (`settings.gamesEnabled`, por defecto sí).
3. No estar expulsado de Match en ese local (`match_kicks`).
4. Estar dentro del local según el servidor (`room_geo_presence`, geocerca + 25 m, TTL 10 min).
5. Presencia de Match **activa** (`match_check_in`): con **QR del local**, o con GPS **sin** marca de ubicación simulada; se renueva cada ≤ 15 min.
6. Opt-in del local (`game_optins`), que crea el propio check-in.
7. **Al menos una foto aprobada** (solo la fija la moderación o el superadmin). Máximo 6, bucket `match-photos`, `image/webp`, ≤ 5 MB.
8. Sin bloqueo en ningún sentido ni swipe previo de quien mira; filtro de edad ±1 año solo si quien mira fijó `matchAgeMin/Max`.
9. Campos de la tarjeta (no obligatorios): `display_name`, `username`, `avatar_url`, `bio`, intereses.
10. Para hacer swipe, quien mira necesita también presencia **activa** en el mismo local.

### Check-in de Match con el QR real del local (`JCHAT_QR_TOKEN`)
`match_check_in` recibe `p_mocked`. Las coordenadas de un script **se le dan, no se miden**, así que el valor honesto es `true`
(`SCRIPT_LOCATION_IS_SIMULATED` en `lib.mjs`, no se cambia). Con eso el servidor deja la presencia en **`pending`
(`mocked_location`)** hasta que se escanee el QR del local, y el mazo exige presencia **activa**. La forma honesta de resolverlo es que
**el dueño entregue el QR real de la sala principal**: `match-setup.mjs` y `simulate.mjs` lo mandan como `p_qr_token` en cada check-in.

**Sin `JCHAT_QR_TOKEN` todo sigue como antes:** la presencia queda `pending`, el script imprime `BLOCKED` y no rodea nada (ni manda
`p_mocked = false`, ni lee el token de la base con la llave de servidor).

**Dónde ve el dueño el QR de la sala principal.** En el dashboard web: **Salas de chat** (`/dashboard/chat-rooms`) → fila de la sala
**Main** → botón **QR**. El modal enseña la imagen del QR y botones de descarga (PNG/PDF); **no muestra la URL como texto**. Se lee
apuntando la cámara del teléfono (o cualquier lector de QR) al QR en pantalla o al impreso, y da una URL con este formato:

```
https://jchat.cloud/c/<token>
```

El **token es el tramo que va después de `/c/`** (letras, números, `-` y `_`; de 6 a 128 caracteres), p. ej. en `https://jchat.cloud/c/AbC123_xyz-9`
el token es `AbC123_xyz-9`. Se puede pasar **la URL completa o solo el token**: el script extrae el token con la misma regla que la app
(`mobile/utils/venueQr.ts`). Una URL de **mesa** (`/t/…`) no vale; tiene que ser la de una sala (`/c/…`) del mismo local.

**Cómo pasarlo sin que quede en el historial** (nunca como argumento; el script solo lo lee del entorno):
```bash
read -s JCHAT_QR_TOKEN && export JCHAT_QR_TOKEN     # pega la URL o el token y Enter (no se ve al escribir)
node scripts/test-users/match-setup.mjs --dry-run   # imprime solo "QR token: provided" o "missing"
node scripts/test-users/match-setup.mjs --users 20
unset JCHAT_QR_TOKEN                                # al terminar
```
El valor **nunca se imprime**: ni en logs, ni en errores, ni en `--dry-run` (solo `QR token: provided` / `missing`).

**Vencimiento.** La presencia de Match **vence a los 15 min** sin latido, y la de la geocerca a los 10. `match-setup.mjs` hace **un** check-in
por usuario; para mantenerlos en el mazo hay que dejar corriendo `simulate.mjs --actions …,swipe`, que **renueva el check-in (y la
geocerca y la barra) cada 4 min** mientras corre, enviando el mismo token. Si el dueño pulsa **Renovar código** en el dashboard, el token
anterior deja de valer (`denied/invalid_qr`): hay que leer el QR nuevo.

**Trátalo como un secreto del local:** quien tenga ese token puede activar Match en el local sin estar allí. Si se filtra, renueva el código.

## 4. `cleanup.mjs`
```bash
node scripts/test-users/cleanup.mjs            # DRY RUN: lista, no borra
node scripts/test-users/cleanup.mjs --apply    # borra
```
Reglas de seguridad:
- Coincidencia **exacta** del dominio `@test.jchat.cloud` (nunca una subcadena).
- Si existe `users.is_test`, además debe ser `true` (las cuentas con el dominio pero sin la marca se omiten y se avisa).
- **Omite** cuentas que sean dueñas de un negocio (borrarlas se llevaría el local).
- Tope `--max` (200 por defecto): si la lista es mayor, aborta.
- **Fotos de Match:** antes de borrar la cuenta elimina del bucket `match-photos` todo lo que haya bajo `{uid}/` (las rutas de `match_photos`
  y también archivos huérfanos). Las filas se van por cascada, **los archivos de Storage no**. El dry-run muestra cuántos archivos hay por cuenta.
- Para cada cuenta repite los pasos previos de `delete-account` (referencias `NO ACTION` de `radius_increase_requests`), borra su avatar y
  hace `auth.admin.deleteUser` (la cascada elimina perfil, mensajes, publicaciones, likes, DM…). Al terminar, si borró todo, elimina
  `credentials.json`.
- Los reportes, mensajes de otras personas y pedidos **no** de estas cuentas no se tocan; lo que las cuentas de prueba reportaron o
  escribieron se va con ellas por las claves foráneas `on delete cascade` (o queda anonimizado donde la clave es `set null`).

## Lo que debes saber antes de ejecutarlos
1. **Producción o no:** estos scripts usan la llave de servidor del proyecto configurado en `web/.env.local`. Si ese es el proyecto de
   producción, `seed` y `simulate` crean cuentas y contenido **reales en producción** (visibles en Bar XZX, notificaciones, métricas).
   Valora un proyecto/rama de pruebas o limpia justo después.
2. Los correos `@test.jchat.cloud` no existen como buzones: no recibirán nada (correo ya confirmado por el script).
3. Cuidado con el chat y los DM: el filtro de insultos y la moderación aplican también a estas cuentas; los textos son neutros.
4. `simulate` envía la posición del local a la geocerca. Es el mismo mecanismo de las pruebas con simuladores, pero hazlo solo en
   entornos de prueba.
5. **SQL ya aplicado:** `supabase/migrations/215_test_users_flag.sql` añadió `users.is_test` (solo `service_role` puede
   cambiarlo), así que `seed` marca las cuentas con la doble marca (dominio + `is_test`).
6. Los scripts usan solo `@supabase/supabase-js` ya instalado en `web/node_modules` (y el `WebSocket` y `fetch` de Node 22+); no hay
   dependencias nuevas.
7. `match-setup` descarga las ilustraciones de `api.dicebear.com` (red necesaria al ejecutarlo; la app no depende de DiceBear porque las
   fotos quedan alojadas en nuestro bucket). Las fotos pasan por la moderación real (Google Vision): cuestan lo mismo que cualquier foto.
8. La barra de perfiles solo muestra a los simulados **mientras `simulate.mjs` sigue corriendo**; si lo detienes, salen del canal.
9. Existe además `scripts/match-test/` (cuentas `seedNN@jchat.test`, hecho con la llave de servidor y fotos aprobadas a mano). Es otra
   herramienta distinta; `match-setup` no la usa ni la sustituye.
