# Auditoría de rendimiento — JChat 3.0 (2026-10-28)

Todo **en local** (Supabase en Docker, `loadtest/local-up.sh`), nada contra producción. Consultas ejecutadas como rol `authenticated` con `request.jwt.claims`, es decir **con RLS puesta**, igual que las ve PostgREST.

Rama: `fix/perf-indexes`. Migración **249 = BORRADOR, sin aplicar** (`supabase/migrations/249_perf_indexes.sql`), con rollback (`supabase/rollbacks/249_perf_indexes_rollback.sql`) y comprobación (`supabase/scripts/249_check.sql`).

## Conclusión corta

El esquema ya está bien indexado para lo que la app hace hoy. Con 1000 usuarios y mucho volumen (ver abajo), casi todo responde en **< 5 ms**, y 100 usuarios simultáneos en k6 dan **p95 ≈ 6–8 ms sin fallos**. Solo **dos** índices mejoran algo medible y se proponen; otros cuatro que probé **no ayudaron** y no entran. No hay urgencia de rendimiento antes del lanzamiento; lo que sí conviene es asegurarse de que autovacuum esté activo (ver "Lección").

## Datos de la prueba

Semilla de `loadtest/` (1001 usuarios, 1 local con sala, 20 platos) más un volumen sintético que añadí solo en local:

| Tabla | Filas |
|-------|------:|
| messages (50 salas, una "caliente") | 600 200 |
| dm_conversations | 275 000 |
| dm_messages | 2 637 000 |
| notifications (≈1200 por persona) | 1 200 000 |
| gifts | 400 000 |
| orders (un local; 40 activos, el resto entregados/cancelados) | 150 000 |
| order_items | 450 000 |

Es mucho más de lo que tendrá la app el día del lanzamiento: el objetivo es ver qué se rompe primero.

## EXPLAIN ANALYZE — antes y después (mediana de 5 ejecuciones, ms)

Tras `vacuum analyze`, con y sin los índices de la 249:

| Consulta de la app | Antes | Después | Índice que usa después |
|---|---:|---:|---|
| Sala: últimos 50 mensajes | 3,05 | 3,38 | (igual; ver nota 1) |
| Sala: salas de un local | 0,05 | 0,05 | — |
| Menú: platos de un local | 0,02 | 0,02 | — |
| DMs: mis conversaciones | 3,29 | 2,24 | (igual: user_a / user_b) |
| DMs: último mensaje de una conversación | 0,10 | 0,06 | — |
| DMs: contador de no leídos | 0,07 | 0,07 | — |
| DMs: abrir un hilo | 0,11 | 0,06 | — |
| **Notificaciones: mis últimas 50** | **4,72** | **0,35** | `idx_notifications_user_created` |
| Notificaciones: contador de no leídas | 4,24 | 5,82 | no mejora |
| Regalos recibidos | 0,47 | 0,67 | no mejora |
| **Pedidos: mis pedidos** | **1,12** | **0,38** | `idx_orders_user_created` |
| POS: pedidos abiertos de una mesa | 1,67 | 1,99 | — |
| POS/KDS: pedidos activos de un local | 1,76 | 1,73 | — |
| POS: líneas de un pedido | 3,91 | 4,05 | — |

(Esta tabla es de la prueba con los seis índices probados; la migración final solo conserva los dos en negrita. Los demás no mejoraron y los quité.)

Notas:
1. La consulta de mensajes de sala usa `idx_messages_created_at` (solo fecha) en vez de `idx_messages_room_created (room_id, created_at desc)`, que existe. Con pocas salas da igual (3 ms); con muchas salas activas el planificador debería pasar al índice por sala. Vigilar, no tocar ahora.
2. Los 14 ms que medí al principio en notificaciones y los 349 ms del KDS eran **artefactos** de mi carga (el KDS devolvía 75 000 filas porque la mitad de mis pedidos estaban "activos"; luego un `update` masivo dejó tuplas muertas). Los repetí con datos realistas y tras `vacuum`.

## k6 (100 usuarios, 20 s de subida + 60 s sostenido)

Escenario existente `read` (sala, menú, presencia, regalos) y uno nuevo, `read-hot` (`loadtest/scenarios/read-hot.js`: notificaciones, conversaciones, último mensaje, regalos, mis pedidos), que sí toca las tablas indexadas.

| Escenario | p95 antes | p95 después | Fallos |
|---|---:|---:|---:|
| `read` 100 VUs | 7,5 ms | 5,6 ms | 0 % |
| `read-hot` 100 VUs (global) | 6,4 ms | 6,1 ms | 0 % |
| · notificaciones (lista) | 8,3 ms | 6,7 ms | 0 % |
| · mis pedidos | 6,4 ms | 6,9 ms | 0 % |
| · conversaciones de DM | 5,4 ms | 5,8 ms | 0 % |

La diferencia entre antes y después está dentro del ruido: a esta escala el cuello de botella no son los índices. Los 100 usuarios simultáneos no saturan nada (umbral: p95 < 500 ms). El informe anterior de carga (`loadtest/results/INFORME.md`) sigue siendo la referencia para 1000 usuarios y Realtime.

## Lección

Cuando una carga masiva de datos o `update`s grandes dejan tuplas muertas, las mismas consultas pasan de 1 ms a 40 ms y los índices parciales se inflan. En producción lo evita **autovacuum**; comprobar que sigue activo en el proyecto y no hacer cargas masivas sin `vacuum analyze` después.

## Qué hacer

1. Opcional y sin prisa: aplicar la 249 por MCP (milisegundos con las tablas de hoy) y correr `249_check.sql`.
2. Más adelante, en un archivo `NNN_destructive.sql` aparte: índices que la 249 deja redundantes (`idx_notifications_user_id` queda cubierto por `idx_notifications_user_created`; `idx_orders_user_id` por `idx_orders_user_created`). No se tocan ahora.
3. Vigilar la consulta de mensajes de sala (nota 1) cuando haya decenas de salas activas.
