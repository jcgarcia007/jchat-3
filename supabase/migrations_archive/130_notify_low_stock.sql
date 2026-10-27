-- 130_notify_low_stock.sql
-- Fase A4: alerta de stock bajo (notificación push al dueño). YA APLICADO A PRODUCCIÓN
-- por Planning Claude (MCP, 2026-08-19). Solo control de versiones. Idempotente. NO re-aplicar.
create or replace function public.notify_low_stock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_biz_name text;
begin
  if NEW.stock_count is null then return NEW; end if;
  if coalesce(NEW.low_stock_threshold, 0) <= 0 then return NEW; end if;

  if NEW.stock_count < NEW.low_stock_threshold
     and (OLD.stock_count is null or OLD.stock_count >= NEW.low_stock_threshold) then

    select b.owner_id, b.name into v_owner, v_biz_name
    from businesses b where b.id = NEW.business_id;

    if v_owner is not null then
      insert into notifications (user_id, type, payload)
      values (
        v_owner, 'low_stock',
        jsonb_build_object(
          'menu_item_id', NEW.id,
          'item_name',    NEW.name,
          'stock',        NEW.stock_count,
          'threshold',    NEW.low_stock_threshold,
          'business_id',  NEW.business_id,
          'business_name', v_biz_name
        )
      );
    end if;
  end if;

  return NEW;
end
$function$;

drop trigger if exists trg_notify_low_stock on public.menu_items;
create trigger trg_notify_low_stock
  after update of stock_count on public.menu_items
  for each row execute function public.notify_low_stock();
