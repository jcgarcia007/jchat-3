# Modo revisión (Fase D1 · migración 262)

> Borrador para Juan · 2026-11-06 · rama `fix/d1-review-mode` · **la migración 262 NO está aplicada** (la aplica Juan por MCP).

## Qué es
Un **grupo de prueba** en base de datos (cuentas del revisor y de QA + locales de demo) y un **interruptor general** con caducidad (1 a 30 días). La única excepción a la regla de oro ("estar físicamente en el local") es:

> interruptor encendido **y** cuenta activa del grupo **y** local activo del grupo

Todo lo demás sigue igual: nadie más entra a esos locales (ni estando físicamente dentro), nadie más los ve, y las cuentas del grupo no salen en mazos de Match ni en "presentes" de locales que no son del grupo. Cada uso del bypass queda en `review_bypass_log`.

## Cómo se usa
1. **Añadir cuentas y locales** (super-admin, `/super-admin/review-mode`, o por SQL como `service_role`):
   - cuenta: `select review_group_add_member('jchatreview', 'reviewer');` (`'reviewer'` o `'qa'`; la cuenta debe existir)
   - local: `select review_group_add_business('jchat-demo-lounge-y7of');`
2. **Encender:** botón "Activar 30 días" (`review_mode_set(30)`; máximo 30). Caduca solo; si hay que alargarlo, se vuelve a pulsar.
3. **Apagar:** botón "Apagar" (`review_mode_off()`). Con el interruptor apagado o caducado, `review_bypass` devuelve `false` sin escribir nada y todo vuelve a la regla de oro.
4. **Pausar / retirar** una cuenta o un local: botones de la lista (`review_group_set_status`). `paused` = sin bypass pero el local sigue oculto; `retired` = sale del grupo y vuelve a ser un local/cuenta normal.
5. **Qué se registra:** usuario, local, función (`venue_inside`, `check_geofence_and_join_room`, `review_join_room`) y hora. Una misma (persona, local, función) se anota una vez cada 10 minutos para que las comprobaciones de pedidos no llenen el log. Lo lee solo `is_platform_admin()` (últimos 50 en la página).

## Dónde engancha (y dónde no)
**Cambiadas** (cuerpos de producción de 2026-11-06, mismo md5 que la base local, más una rama):

| Función | Cambio |
|---|---|
| `check_geofence_and_join_room` | local del grupo → solo bypass (reason `review_bypass`, crea la presencia de siempre); cualquier otra persona → `not_available` aunque esté dentro |
| `venue_inside` | local del grupo → solo bypass; ahora es plpgsql (antes sql) por el registro |
| `resolve_venue_entry` | no resuelve un local del grupo para quien no lo ve |
| `match_get_deck`, `venue_people_counts`, `venue_present_users` | las cuentas del grupo no salen en locales fuera del grupo |
| `megaphone_feed` (Ofertas) | los miembros ven las ofertas de los locales del grupo desde cualquier distancia |
| política `businesses: public read` | de `true` a `business_visible_to(id)`: Mapa, Cerca de mí, búsqueda y lo que se lee de `businesses` ocultan los locales del grupo a quien no es del grupo |

**Nuevas:** `review_mode`, `review_group_members`, `review_group_businesses`, `review_bypass_log` (RLS: lectura solo super-admin; escritura solo servidor), funciones de apoyo `review_*`, `business_visible_to`, y para la app `review_join_room(room)` y `review_bypass_businesses()`.

**Corrección a la especificación:** el texto pedía enganchar `check_in`. En producción `check_in(p_business_id)` es el **check-in de fidelidad** (una vez cada 24 h, ya exige `venue_presence_ok`, sin coordenadas) y **no se toca**. La función que mide la distancia y crea la presencia en `room_geo_presence` es `check_geofence_and_join_room`, y es ahí donde está la rama. `room_geo_presence` no tiene columna `method`, así que no se inventó ninguna: el rastro es el log.

**No tocadas, y por qué funcionan:** `assert_venue_order_allowed` y `venue_order_access` usan `venue_presence_ok`/`venue_inside`; `match_presence_core` exige `venue_presence_ok` (la presencia que crea el bypass). `check_in` (fidelidad) igual.

## Otros sitios que miden distancia por su cuenta
| Sitio | Qué hace | Qué se hizo |
|---|---|---|
| `venue_order_access`, `assert_venue_order_allowed`, `guest_request_service*` | llaman a `venue_inside` | cubiertos por el cambio de `venue_inside` |
| `match_presence_core` | `venue_presence_ok` | cubierto (la presencia existe) |
| `useGeofenceGate.runGeoCheck` (cliente) | sin permiso o sin lectura salía antes de llamar al servidor; fuera de radio dependía solo de la respuesta | tras un fallo **interactivo** (Entrar / Reintentar) llama a `review_join_room(room)`: el servidor decide; para el resto de personas devuelve `false` y no escribe nada |
| `useGeofenceGate.runSilentGeoCheck` (cliente) | tras 3 lecturas lejos durante ≥ 3 min confirma salida y cierra la sesión | si la sala es del grupo no lee GPS y renueva por `review_join_room`; antes de confirmar una salida pregunta una vez al servidor (también tras reiniciar la app) |
| `BusinessCardSheet` / `MapScreen` (cliente) | calculan `inside_radius` con haversine y desactivan "Entrar al chat" | para los locales de `review_bypass_businesses()` pasan `inside_radius = null` (sin aviso, decide el servidor) |
| `NearbyScreen` / `MapScreen` / `OffersScreen` | solo calculan la etiqueta de distancia o el radio del feed | sin cambios; Mapa y Cerca de mí cargan todos los locales verificados (sin filtro de distancia), Ofertas se ensancha en el servidor |
| `VenueSessionContext` | geometría del local para la verificación silenciosa | sin cambios (usa el mismo `runAutoSilentCheck`) |

Limitación conocida: `match_presence_core` rechaza el "viaje imposible" (> 2 km entre dos locales en 5 min); una cuenta QA que salte de un local real al de demo en menos de 5 min no entra a Match hasta pasado ese tiempo.

## Decisiones tomadas (revísalas)
- Un local `paused` sigue oculto para el resto del mundo; solo `retired` lo devuelve a la vida normal.
- Un local del grupo sin dueño-miembro: el dueño lo ve y entra por la vía de dueño de siempre, sin necesitar el modo.
- Un usuario real físicamente dentro del radio de un local del grupo recibe `not_available` (antes entraba). Es lo que hace que "nadie fuera del grupo aparezca en sus mazos".
- Super-admin: etiqueta "Prueba" en `/super-admin/businesses`. **No** se tocaron las métricas de plataforma (`/super-admin`, `/revenue`): excluir los locales del grupo de los totales queda pendiente (necesita decidir si cuentan pedidos de demo).

## Cómo se probó
`supabase/tests/14_review_mode.sql` (54 comprobaciones, transacción con ROLLBACK): miembro + local + modo → `venue_inside` true y `check_geofence_and_join_room` crea presencia y log; miembro + local real → false; usuario real + local del grupo → false (también dentro del radio); caducado / apagado / en pausa → false; usuario real no ve el local, el miembro sí (a 5.000 km), dueño y super-admin sí; tablas cerradas; `review_bypass` no es llamable desde la API; cuentas del grupo fuera de `venue_people_counts` / `venue_present_users` de locales reales. `supabase/scripts/262_check.sql` (72 filas, todas `true` tras aplicar en local). `supabase/rollbacks/262_review_mode_rollback.sql` devuelve las 7 funciones a su md5 de producción y quita todo lo nuevo. Aplicada dos veces seguidas sin error (idempotente).
No hay test SQL del mazo de Match (`match_get_deck`): la cláusula añadida es la misma que la de `venue_people_counts`, que sí está probada.

## Párrafo para las notas de revisión

**ES**
> JChat abre el chat de un local solo cuando el teléfono está dentro. Para que pueda probarlo sin viajar, hemos preparado un **modo de revisión**: durante la revisión, las cuentas de prueba que le damos (@jchatreview y @jchatreview2) pueden entrar al local de demostración "JChat Demo Lounge" desde cualquier lugar, aunque no tengan activada la ubicación. Esta excepción la controla el servidor, solo existe mientras nuestro interruptor está encendido (caduca solo, máximo 30 días), solo vale para esas cuentas y ese local, y cada uso queda registrado. El local de demostración no aparece para ningún otro usuario. Para todos los demás usuarios y locales, la app sigue exigiendo la presencia física.

**EN**
> JChat opens a venue's chat only when the phone is inside the venue. So that you can test without travelling, we prepared a **review mode**: during the review, the test accounts we give you (@jchatreview and @jchatreview2) can enter the demo venue "JChat Demo Lounge" from anywhere, even with location turned off. The server controls this exception: it exists only while our switch is on (it expires by itself, 30 days at most), applies only to those accounts and that venue, and every use is logged. The demo venue is not visible to any other user. For every other user and venue the app still requires physical presence.
