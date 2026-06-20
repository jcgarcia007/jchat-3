-- ============================================================
-- JChat 3.0 — Security hardening (advisor: function_search_path_mutable)
-- Pin an immutable empty search_path on trigger functions. They only use
-- pg_catalog built-ins (now()) + NEW, so '' is safe.
-- ============================================================

alter function public.set_updated_at() set search_path = '';
alter function public.orders_status_changed() set search_path = '';
