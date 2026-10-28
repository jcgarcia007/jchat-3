-- 249 — índices para las consultas más usadas de la app (BORRADOR, sin aplicar).
-- Medido en local con 1,2 M notificaciones y 150 k pedidos (más 2,6 M mensajes de DM, 600 k de sala, 400 k regalos): ver
-- docs/audits/2026-10-28/rendimiento.md. Solo se dejan los dos índices que mejoraron de verdad; otros cuatro probados no ayudaron
-- (contador de no leídas, regalos recibidos, último mensaje/hilo de DM, pedidos activos del KDS) y NO se incluyen.
-- Solo índices nuevos con `if not exists`; no se borra ni se cambia nada.
-- Nota: `create index` bloquea escrituras en la tabla mientras se construye. Con las tablas de hoy en producción (pequeñas) dura
-- milisegundos; si alguna ya es grande el día que se aplique, crear con `create index concurrently` desde el SQL Editor, una a una
-- (no se puede dentro de una migración con transacción).

-- Notificaciones: lista de las últimas 50 de una persona (user_id + más recientes primero). 4,7 ms -> 0,35 ms con 1200 filas por persona.
create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

-- Pedidos propios (más recientes primero). 1,1 ms -> 0,4 ms con 150 filas por persona.
create index if not exists idx_orders_user_created
  on public.orders (user_id, created_at desc);
