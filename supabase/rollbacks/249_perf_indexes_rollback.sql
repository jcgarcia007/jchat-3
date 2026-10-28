-- 249 — REVERSIÓN: quita los índices que creó supabase/migrations/249_perf_indexes.sql (solo ellos). La aplica Juan Carlos si hace falta.
drop index if exists public.idx_notifications_user_created;
drop index if exists public.idx_orders_user_created;
