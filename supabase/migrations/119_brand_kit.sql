-- Migration 119: brand_kit — jsonb column on businesses for AI reference images
--
-- Stores the business owner's brand image kit used by the AI photo generator.
-- Shape: { "enabled": bool, "plates": [url...], "drinkware": [url...] }
--   enabled   — whether to pass kit images as reference to the edits endpoint
--   plates    — public URLs of food/plate reference photos (station=kitchen)
--   drinkware — public URLs of drink/glass reference photos (station=bar)
--
-- Storage: images live in the menu-photos bucket under {business_id}/brand/.
-- RLS for menu-photos is enforced at the bucket level; the jsonb column here
-- holds only public URLs, so no RLS change is needed for this migration.

alter table public.businesses
  add column if not exists brand_kit jsonb;

comment on column public.businesses.brand_kit is
  'AI brand image kit. Shape: {"enabled":bool,"plates":[url...],"drinkware":[url...]}';
