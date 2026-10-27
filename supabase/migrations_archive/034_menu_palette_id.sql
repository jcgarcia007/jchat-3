-- Migration 034: add menu_palette_id to businesses
-- Lets owners override the color palette baked into their chosen menu template
-- (menu_template_id) with one of 40 curated palettes. The typography of each
-- template is unchanged — only colors are replaced (Option A). Events are
-- temporary businesses, so this applies to events too.
--
-- NULL (default) = keep the template's original board palette.
-- A slug (e.g. 'midnight-gold') = use that palette from the 40-palette catalog
--   defined in web/app/m/[slug]/templates/shared/colorPalettes.ts.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS menu_palette_id text DEFAULT NULL;

comment on column public.businesses.menu_palette_id is
  'Optional color-palette override for the public JChat web menu. NULL = use the template''s original board palette; otherwise a slug from the 40-palette catalog (colorPalettes.ts). Typography is never changed.';
