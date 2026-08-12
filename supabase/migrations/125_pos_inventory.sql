-- 125_pos_inventory.sql
-- POS Inventory feature — schema additions & RPCs.
--
-- IMPORTANT: The RPCs (pos_apply_stock_movement, pos_link_barcode) were
-- applied to production by Planning Claude. This migration is for version
-- control only. DO NOT re-apply to production.
--
-- Idempotent: all DDL uses IF NOT EXISTS / OR REPLACE.

-- ─── menu_items.barcode ───────────────────────────────────────────────────────

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS barcode text;

-- Partial unique index: (business_id, barcode) only when barcode is not null.
-- Two items in different businesses may share a barcode (legit); same business cannot.
CREATE UNIQUE INDEX IF NOT EXISTS menu_items_business_barcode_ux
  ON public.menu_items (business_id, barcode)
  WHERE barcode IS NOT NULL;

-- ─── stock_movements.created_by ───────────────────────────────────────────────

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id);

-- ─── Column-level grants ──────────────────────────────────────────────────────
-- Grant only the columns needed by authenticated employees — not table-wide.

GRANT SELECT (barcode), UPDATE (barcode) ON public.menu_items TO authenticated;
GRANT SELECT (created_by) ON public.stock_movements TO authenticated;

-- ─── pos_apply_stock_movement ─────────────────────────────────────────────────
-- Exact copy from production (Planning Claude, 2026-08). For version control.

CREATE OR REPLACE FUNCTION public.pos_apply_stock_movement(
  p_business_id  uuid,
  p_menu_item_id uuid,
  p_mode         text,
  p_quantity     integer,
  p_note         text DEFAULT NULL
)
RETURNS TABLE(new_stock integer, movement_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid        uuid := auth.uid();
  v_has_perm   boolean;
  v_current    integer;
  v_delta      integer;
  v_reason     text;
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity < 0 or p_quantity > 1000000 then
    raise exception 'bad_quantity';
  end if;

  -- Permission: owner OR employee with inventory_manage
  select exists (
    select 1 from employees e
    join custom_roles cr on cr.id = e.custom_role_id
    where e.business_id = p_business_id
      and e.user_id     = v_uid
      and e.status      = 'accepted'
      and coalesce((cr.permissions->>'inventory_manage')::boolean, false)
  ) or exists (
    select 1 from businesses b
    where b.id = p_business_id and b.owner_id = v_uid
  ) into v_has_perm;

  if not v_has_perm then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select stock_count into v_current
  from menu_items
  where id = p_menu_item_id and business_id = p_business_id
  for update;

  if not found then
    raise exception 'item_not_found';
  end if;

  if p_mode = 'count' then
    v_delta  := p_quantity - coalesce(v_current, 0);
    v_reason := 'count';
  elsif p_mode = 'receive' then
    v_delta  := p_quantity;
    v_reason := 'received';
  elsif p_mode = 'waste' then
    v_delta  := -p_quantity;
    v_reason := 'waste';
  else
    raise exception 'bad_mode';
  end if;

  update menu_items
  set stock_count = greatest(0, coalesce(stock_count, 0) + v_delta)
  where id = p_menu_item_id
  returning stock_count into v_current;

  insert into stock_movements (menu_item_id, business_id, delta, reason, created_by)
  values (
    p_menu_item_id,
    p_business_id,
    v_delta,
    case
      when p_note is not null and length(trim(p_note)) > 0
        then v_reason || ': ' || left(trim(p_note), 200)
      else v_reason
    end,
    v_uid
  )
  returning id into movement_id;

  new_stock := v_current;
  return next;
end;
$function$;

REVOKE ALL ON FUNCTION public.pos_apply_stock_movement(uuid, uuid, text, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pos_apply_stock_movement(uuid, uuid, text, integer, text) TO authenticated;

-- ─── pos_link_barcode ─────────────────────────────────────────────────────────
-- Exact copy from production (Planning Claude, 2026-08). For version control.

CREATE OR REPLACE FUNCTION public.pos_link_barcode(
  p_business_id  uuid,
  p_menu_item_id uuid,
  p_barcode      text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid      uuid := auth.uid();
  v_has_perm boolean;
  v_code     text := trim(p_barcode);
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_code is null or length(v_code) < 6 or length(v_code) > 20
     or v_code !~ '^[0-9]+$' then
    raise exception 'bad_barcode';
  end if;

  -- Permission: owner OR employee with inventory_manage
  select exists (
    select 1 from employees e
    join custom_roles cr on cr.id = e.custom_role_id
    where e.business_id = p_business_id
      and e.user_id     = v_uid
      and e.status      = 'accepted'
      and coalesce((cr.permissions->>'inventory_manage')::boolean, false)
  ) or exists (
    select 1 from businesses b
    where b.id = p_business_id and b.owner_id = v_uid
  ) into v_has_perm;

  if not v_has_perm then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update menu_items
  set barcode = v_code
  where id = p_menu_item_id and business_id = p_business_id;

  if not found then
    raise exception 'item_not_found';
  end if;

  return true;
end;
$function$;

REVOKE ALL ON FUNCTION public.pos_link_barcode(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pos_link_barcode(uuid, uuid, text) TO authenticated;
