-- 162_orders_replica_identity_full.sql
--
-- Cambia REPLICA IDENTITY de orders a FULL para que el filtro de Realtime
-- por business_id entregue los eventos INSERT de forma fiable.
--
-- Contexto (D-24, F3):
--   La tabla `orders` estaba en REPLICA IDENTITY DEFAULT, mientras `tables` y
--   `order_items` ya están en FULL. Con DEFAULT, Supabase Realtime no incluye
--   todos los campos en el payload de INSERT filtrado, lo que puede impedir
--   que el cliente reciba el evento cuando hay un filtro de columna (business_id).
--   Con FULL el payload completo está disponible y el filtro funciona de forma
--   garantizada tanto para INSERT como para UPDATE/DELETE.

alter table public.orders replica identity full;
