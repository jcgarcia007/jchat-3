# Fase D · prueba como revisor (2026-11-06) — INCOMPLETA: el interruptor está apagado

Lectura en producción (solo SELECT, 10:03 EST): `review_mode.enabled_until = NULL`, `updated_at` = 14:40 UTC (el momento de aplicar la 262; `enabled_by` nulo), `review_bypass_log` vacío. Es decir, el modo **nunca se ha encendido**.
Ninguna acción de la lista que exige el modo (pruebas 2–6 y 8) pudo hacerse.

| # | Prueba | Resultado |
|---|---|---|
| 1 | Mapa / Cerca de mí | **Con el modo apagado el Demo Lounge NO aparece** para `@test002` (Android, Cerca de mí: Bar XZX, caminata, Correr 5K, el patio, Restaurante el golpe) ni para un usuario sin sesión (Mapa). Es lo esperado sin el modo. Falta comprobar que `@jchatreview2` lo ve con el modo encendido. |
| 2–6 | Chat, Match, ToD, Ofertas, Stripe con `@jchatreview2` | **No hechas**: requieren el interruptor. Tampoco usé la cuenta (credenciales sin tocar). |
| 7 | QA (`@test002` en Android, `@test1` en iOS) y Bar XZX | **OK.** Android: "No estás en Bar XZX. Estás a 4108.9 km" (respuesta del servidor, `outside_radius`). iOS: "Entrar al chat" desactivado, "Estás a 2553 mi…". |
| 8 | `review_bypass_log` | Vacío (ninguna cuenta, del grupo o no). Coherente con modo apagado. |

Capturas: `screenshots/fase-d/`. Nota: la captura iOS del Demo Lounge con `@test1` a las 9:52 salió de datos que la app ya tenía en memoria desde antes de aplicar la 262 (el pin no se actualizó); no cuenta como prueba.
