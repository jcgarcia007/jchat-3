-- ============================================================
-- JChat 3.0 — Business gallery column (Stage 2 Wave 3 follow-up)
-- Task 2.16 (Business Settings) manages a photo gallery as an array of URLs.
-- ============================================================

alter table public.businesses
  add column if not exists gallery_urls text[] not null default '{}';
