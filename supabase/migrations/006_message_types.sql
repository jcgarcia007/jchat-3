-- ============================================================
-- JChat 3.0 — Message types (Stage 2 Wave 5, Task 2.4 Chat Room)
-- The chat room supports text, photo, voice, GIF, system, and offer messages.
-- ============================================================

alter table public.messages add column if not exists type      text not null default 'text'; -- text|photo|voice|gif|system|offer
alter table public.messages add column if not exists media_url  text;
alter table public.messages add column if not exists metadata   jsonb not null default '{}'::jsonb; -- offer_id, gif url, voice duration, system kind, etc.
alter table public.messages add column if not exists is_system  boolean not null default false;

create index if not exists idx_messages_room_created on public.messages(room_id, created_at desc);
