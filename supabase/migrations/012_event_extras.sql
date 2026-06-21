-- ============================================================
-- JChat 3.0 — Event extras (dedicated event wizard /dashboard/events/new)
-- The event creation wizard captures a category + icon emoji per event.
-- ============================================================

alter table public.events add column if not exists category   text;
alter table public.events add column if not exists icon_emoji  text;
