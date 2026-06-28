-- Migration 031: add icon_url to menu_categories
-- Allows category icons to be a photo (Storage URL) in addition to emoji.
-- Priority rule (enforced in UI): icon_url wins over icon when both are set.
ALTER TABLE public.menu_categories ADD COLUMN IF NOT EXISTS icon_url text;
