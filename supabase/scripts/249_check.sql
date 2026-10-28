-- 249 — comprobación DESPUÉS de aplicar supabase/migrations/249_perf_indexes.sql. NO ESCRIBE NADA: todo es select.
-- Esperado: 2 filas, ambas con indisvalid = true.
select c.relname as indice, i.indisvalid, pg_size_pretty(pg_relation_size(c.oid)) as tamano
from pg_index i join pg_class c on c.oid = i.indexrelid
where c.relname in ('idx_notifications_user_created', 'idx_orders_user_created')
order by 1;
