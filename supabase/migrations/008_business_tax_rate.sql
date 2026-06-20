-- ============================================================
-- JChat 3.0 — Business tax rate (Stage 3 cleanup)
-- Localized sales tax: authoritative per-business rate set by the owner /
-- derived from location. Falls back to a region lookup in the client when null.
-- ============================================================

alter table public.businesses
  add column if not exists tax_rate numeric; -- e.g. 0.07 = 7%; null → client derives from address/region
