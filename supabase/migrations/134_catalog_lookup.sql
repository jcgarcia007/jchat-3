-- 134_catalog_lookup.sql
-- Ladrillo 2: búsqueda de producto por código de barras (normalizado) en el catálogo compartido.
-- YA APLICADO A PRODUCCIÓN por Planning Claude (MCP, 2026-08-19). Idempotente. NO re-aplicar.
create or replace function public.catalog_lookup(p_barcode text)
returns table(
  barcode text, brand text, name text, size_value numeric, size_unit text,
  packaging text, category text, subcategory text, image_url text
)
language plpgsql stable set search_path to 'public'
as $function$
declare
  v_digits text := regexp_replace(coalesce(p_barcode, ''), '\D', '', 'g');
  v_candidates text[];
begin
  if length(v_digits) < 6 then return; end if;
  v_candidates := array[v_digits];
  if length(v_digits) = 12 then v_candidates := v_candidates || ('0' || v_digits); end if;
  if length(v_digits) = 13 and left(v_digits, 1) = '0' then v_candidates := v_candidates || substr(v_digits, 2); end if;
  return query
  select pc.barcode, pc.brand, pc.name, pc.size_value, pc.size_unit,
         pc.packaging, pc.category, pc.subcategory, pc.image_url
  from product_catalog pc
  where pc.is_active and pc.barcode = any(v_candidates)
  order by pc.verified desc nulls last
  limit 1;
end
$function$;
revoke all on function public.catalog_lookup(text) from public, anon;
grant execute on function public.catalog_lookup(text) to authenticated;
