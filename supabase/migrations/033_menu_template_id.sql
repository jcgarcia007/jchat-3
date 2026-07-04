-- Migration 033: add menu_template_id to businesses
-- Lets owners pick which navigation/layout template their public JChat web menu
-- (menu_mode = 'web', served at /m/[slug]) uses. Twenty templates ported from the
-- "Menu Systems Board" design exploration. Events are temporary businesses, so
-- this applies to events too. Default 'bottom-nav' = the safe, familiar layout.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS menu_template_id text NOT NULL DEFAULT 'bottom-nav'
    CHECK (menu_template_id IN (
      'bottom-nav','left-drawer','icon-rail','sticky-tabs','category-sidebar',
      'fullscreen-type','glass-chips','infinite-feed','carousel','masonry-search',
      'magazine','store-sections','streaming-rows','timeline','stories',
      'gesture','card-stack','ai-personalized','immersive','luxury'
    ));

comment on column public.businesses.menu_template_id is
  'Navigation/layout template for the public JChat web menu (menu_mode = ''web''). One of 20 slugs from the Menu Systems Board exploration. Default ''bottom-nav''.';
