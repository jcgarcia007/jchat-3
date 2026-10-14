-- 234 — security hardening: (1) trigger functions and tod_resolve_report were callable by anon / public; (2) functions
-- without a fixed search_path. Idempotent and non-destructive (revoke / alter function only).
-- Aplicada por Planning el 2026-10-14 vía MCP (mirrored here; NOT applied from the repo).

-- 1. No EXECUTE for public / anon (authenticated keeps it; trigger functions run as the table owner anyway).
revoke execute on function public.dm_photo_dispatch_moderation() from public, anon;
revoke execute on function public.reports_set_business_from_tod_message() from public, anon;
revoke execute on function public.gift_offer_notify_response() from public, anon;
revoke execute on function public.order_auto_delivered() from public, anon;
revoke execute on function public.notify_order_status() from public, anon;
revoke execute on function public.match_notify_new_people() from public, anon;
revoke execute on function public.match_photo_dispatch_moderation() from public, anon;
revoke execute on function public.enforce_service_call_golden_rule() from public, anon;
revoke execute on function public.dm_first_message_guard() from public, anon;
revoke execute on function public.match_detect() from public, anon;
revoke execute on function public.match_follow_survival() from public, anon;
revoke execute on function public.reports_urgent_alert() from public, anon;
revoke execute on function public.gift_offer_dispatch() from public, anon;
revoke execute on function public.match_relikes_wipe_on_leave() from public, anon;
revoke execute on function public.tod_resolve_report(uuid, text) from public, anon;

-- 2. Fixed search_path (no behaviour change: they already resolve everything in public).
alter function public.gen_short_code(integer) set search_path = public;
alter function public.validate_business_subdomain() set search_path = public;
alter function public.tables_set_short_code() set search_path = public;
alter function public.gift_offers_touch() set search_path = public;
alter function public.geo_distance_m(double precision, double precision, double precision, double precision) set search_path = public;
alter function public.match_photos_guard() set search_path = public;
alter function public.match_photos_limit() set search_path = public;
alter function public.match_today() set search_path = public;
