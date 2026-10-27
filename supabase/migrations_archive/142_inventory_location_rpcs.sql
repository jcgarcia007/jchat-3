-- 142_inventory_location_rpcs.sql
-- RPCs de gestión de ubicaciones de inventario (SECURITY DEFINER).
-- Aplicada a producción por Planning vía MCP el 2026-08-22.

-- ─── inv_can_manage ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.inv_can_manage(p_business_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = p_business_id AND b.owner_id = auth.uid())
$function$;

-- inv_can_manage es usada internamente por las demás RPCs (no requiere REVOKE de public/anon)

-- ─── inventory_create_location ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.inventory_create_location(p_business_id uuid, p_name text, p_is_sales boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.inv_can_manage(p_business_id) THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'name required'; END IF;

  INSERT INTO public.inventory_locations (business_id, name, is_sales_location)
  VALUES (p_business_id, btrim(p_name), COALESCE(p_is_sales, false))
  RETURNING id INTO v_id;

  -- Si se marca como ubicación de venta, desmarcar las demás y fijarla en businesses
  IF COALESCE(p_is_sales, false) THEN
    UPDATE public.inventory_locations SET is_sales_location = false
     WHERE business_id = p_business_id AND id <> v_id;
    UPDATE public.inventory_locations SET is_sales_location = true WHERE id = v_id;
    UPDATE public.businesses SET sales_location_id = v_id WHERE id = p_business_id;
  END IF;
  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.inventory_create_location(uuid, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.inventory_create_location(uuid, text, boolean) TO authenticated;

-- ─── inventory_rename_location ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.inventory_rename_location(p_business_id uuid, p_location_id uuid, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.inv_can_manage(p_business_id) THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'name required'; END IF;
  UPDATE public.inventory_locations SET name = btrim(p_name), updated_at = now()
   WHERE id = p_location_id AND business_id = p_business_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.inventory_rename_location(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.inventory_rename_location(uuid, uuid, text) TO authenticated;

-- ─── inventory_set_sales_location ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.inventory_set_sales_location(p_business_id uuid, p_location_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.inv_can_manage(p_business_id) THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id = p_location_id AND business_id = p_business_id) THEN
    RAISE EXCEPTION 'location not in this business';
  END IF;
  UPDATE public.inventory_locations SET is_sales_location = (id = p_location_id), updated_at = now()
   WHERE business_id = p_business_id;
  UPDATE public.businesses SET sales_location_id = p_location_id WHERE id = p_business_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.inventory_set_sales_location(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.inventory_set_sales_location(uuid, uuid) TO authenticated;

-- ─── inventory_archive_location ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.inventory_archive_location(p_business_id uuid, p_location_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_qty integer;
BEGIN
  IF NOT public.inv_can_manage(p_business_id) THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  SELECT COALESCE(SUM(qty),0) INTO v_qty FROM public.stock_by_location
    WHERE location_id = p_location_id AND business_id = p_business_id;
  IF v_qty > 0 THEN RAISE EXCEPTION 'location has stock; move it first'; END IF;
  UPDATE public.inventory_locations SET is_active = false, is_sales_location = false, updated_at = now()
   WHERE id = p_location_id AND business_id = p_business_id;
  UPDATE public.businesses SET sales_location_id = NULL
   WHERE id = p_business_id AND sales_location_id = p_location_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.inventory_archive_location(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.inventory_archive_location(uuid, uuid) TO authenticated;

-- ─── inventory_set_location_qty ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.inventory_set_location_qty(p_business_id uuid, p_menu_item_id uuid, p_location_id uuid, p_qty integer, p_reason text DEFAULT 'count'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old integer; v_delta integer;
BEGIN
  IF NOT public.inv_can_manage(p_business_id) THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  IF p_qty < 0 THEN RAISE EXCEPTION 'qty must be >= 0'; END IF;

  SELECT qty INTO v_old FROM public.stock_by_location
   WHERE menu_item_id = p_menu_item_id AND location_id = p_location_id;

  IF v_old IS NULL THEN
    INSERT INTO public.stock_by_location (business_id, menu_item_id, location_id, qty)
    VALUES (p_business_id, p_menu_item_id, p_location_id, p_qty);
    v_delta := p_qty;
  ELSE
    UPDATE public.stock_by_location SET qty = p_qty, updated_at = now()
     WHERE menu_item_id = p_menu_item_id AND location_id = p_location_id;
    v_delta := p_qty - v_old;
  END IF;

  IF v_delta <> 0 THEN
    INSERT INTO public.stock_movements (menu_item_id, business_id, delta, reason, created_by)
    VALUES (p_menu_item_id, p_business_id, v_delta, 'count_adj:'||COALESCE(p_reason,'count'), auth.uid());
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.inventory_set_location_qty(uuid, uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.inventory_set_location_qty(uuid, uuid, uuid, integer, text) TO authenticated;

-- ─── inventory_transfer ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.inventory_transfer(p_business_id uuid, p_menu_item_id uuid, p_from_location uuid, p_to_location uuid, p_qty integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_from integer;
BEGIN
  IF NOT public.inv_can_manage(p_business_id) THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'qty must be > 0'; END IF;
  IF p_from_location = p_to_location THEN RAISE EXCEPTION 'from and to must differ'; END IF;

  SELECT qty INTO v_from FROM public.stock_by_location
   WHERE menu_item_id = p_menu_item_id AND location_id = p_from_location;
  IF v_from IS NULL OR v_from < p_qty THEN RAISE EXCEPTION 'insufficient stock at source'; END IF;

  -- Restar del origen
  UPDATE public.stock_by_location SET qty = qty - p_qty, updated_at = now()
   WHERE menu_item_id = p_menu_item_id AND location_id = p_from_location;

  -- Sumar al destino (upsert)
  INSERT INTO public.stock_by_location (business_id, menu_item_id, location_id, qty)
  VALUES (p_business_id, p_menu_item_id, p_to_location, p_qty)
  ON CONFLICT (menu_item_id, location_id)
  DO UPDATE SET qty = public.stock_by_location.qty + EXCLUDED.qty, updated_at = now();

  -- Registrar los dos movimientos (el total no cambia; el trigger recalcula igual)
  INSERT INTO public.stock_movements (menu_item_id, business_id, delta, reason, created_by)
  VALUES (p_menu_item_id, p_business_id, -p_qty, 'transfer_out', auth.uid()),
         (p_menu_item_id, p_business_id,  p_qty, 'transfer_in',  auth.uid());
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.inventory_transfer(uuid, uuid, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.inventory_transfer(uuid, uuid, uuid, uuid, integer) TO authenticated;
