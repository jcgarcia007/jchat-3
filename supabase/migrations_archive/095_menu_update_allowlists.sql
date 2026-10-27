-- 095_menu_update_allowlists
-- D-54 Batch 2 (subsistema menú). Verificado por MCP + lectura de web/app/dashboard/menu/page.tsx.

-- menu_items: el editor comparte dbPayload (incluye business_id) para INSERT y UPDATE.
revoke update on public.menu_items from authenticated;
grant update (category_id, business_id, name, description, price_cents, photo_url,
              dietary_tags, id_required, badge, is_available, is_published,
              stock_count, low_stock_threshold, options)
  on public.menu_items to authenticated;

-- menu_categories: reorder(sort) + edit(name, icon, icon_url) + toggle(is_published).
revoke update on public.menu_categories from authenticated;
grant update (sort, name, icon, icon_url, is_published)
  on public.menu_categories to authenticated;

-- modifier_groups: edit(label, type, min_select, max_select, choices). key/sort solo INSERT.
revoke update on public.modifier_groups from authenticated;
grant update (label, type, min_select, max_select, choices)
  on public.modifier_groups to authenticated;

-- menu_item_photos: la app nunca hace UPDATE (INSERT + DELETE).
revoke update on public.menu_item_photos from authenticated;

-- menu_item_modifier_groups: la app nunca hace UPDATE (DELETE + INSERT).
revoke update on public.menu_item_modifier_groups from authenticated;
