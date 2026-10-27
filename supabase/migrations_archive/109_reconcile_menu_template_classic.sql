-- 109_reconcile_menu_template_classic
-- Drift: aplicada en prod por "menu_template_add_classic_default" (v20260705002239), sin archivo.
-- 033_menu_template_id tiene el CHECK viejo (20 slugs, default bottom-nav); prod tiene el CHECK con 'classic'
-- + default 'classic' (verificado). El UPDATE de datos del original es no-op en un rebuild (sin filas) → omitido.
alter table public.businesses drop constraint if exists businesses_menu_template_id_check;

alter table public.businesses
  add constraint businesses_menu_template_id_check
  check (menu_template_id in (
    'classic',
    'bottom-nav','left-drawer','icon-rail','sticky-tabs','category-sidebar',
    'fullscreen-type','glass-chips','infinite-feed','carousel','masonry-search',
    'magazine','store-sections','streaming-rows','timeline','stories',
    'gesture','card-stack','ai-personalized','immersive','luxury'));

alter table public.businesses alter column menu_template_id set default 'classic';
