-- 137_menu_template_check_add_lote2
-- Adds Lote 1 (bento, hero-list) and Lote 2 (split-diagonal, polaroid, catalog)
-- template slugs to the businesses.menu_template_id CHECK constraint.
--
-- Current constraint (from 109_reconcile_menu_template_classic) covers 21 slugs.
-- This DROP+ADD replaces it with the full set of 26 slugs.
--
-- NOTE: Planning applies this via MCP. Do not apply manually.

alter table public.businesses
  drop constraint if exists businesses_menu_template_id_check;

alter table public.businesses
  add constraint businesses_menu_template_id_check
  check (menu_template_id in (
    -- Lote 0 / original set (21)
    'classic',
    'bottom-nav', 'left-drawer', 'icon-rail', 'sticky-tabs', 'category-sidebar',
    'fullscreen-type', 'glass-chips', 'infinite-feed', 'carousel', 'masonry-search',
    'magazine', 'store-sections', 'streaming-rows', 'timeline', 'stories',
    'gesture', 'card-stack', 'ai-personalized', 'immersive', 'luxury',
    -- Lote 1 (2)
    'bento', 'hero-list',
    -- Lote 2 (3)
    'split-diagonal', 'polaroid', 'catalog'
  ));
