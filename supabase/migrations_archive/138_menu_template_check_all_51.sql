-- 138_menu_template_check_all_51.sql
-- Reconcilia el CHECK constraint de businesses.menu_template_id con las 51
-- plantillas del renderer (Lotes 1-8, sin 'catalog' que fue descartada).
-- Aplicada a producción por Planning via MCP el 2026-08-22.

ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_menu_template_id_check;

ALTER TABLE businesses ADD CONSTRAINT businesses_menu_template_id_check CHECK (
  menu_template_id = ANY (ARRAY[
    'classic','left-drawer','icon-rail','sticky-tabs','category-sidebar',
    'store-sections','glass-chips','infinite-feed','magazine','streaming-rows',
    'masonry-search','fullscreen-type','timeline','luxury','carousel',
    'immersive','stories','card-stack','gesture','ai-personalized','bottom-nav',
    'bento','hero-list','split-diagonal','polaroid',
    'photo-spotlight','arch-crop','peek-carousel','full-bleed-reel','film-strip',
    'magazine-cover','gallery-print','organic-circles','hexagon-honeycomb','spotlight-stage',
    'framed-gallery','poster-wall','double-page-spread','curved-hero','coverflow-3d',
    'full-bleed-swipe','featured-grid','story-chapters','duotone-spotlight','radial-fan',
    'blob-mask','horizontal-filmstrip','diagonal-mosaic','sticky-hero-sheet','top-arc-dial',
    'bento-deluxe'
  ]::text[])
);
