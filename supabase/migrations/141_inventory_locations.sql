-- 141_inventory_locations.sql
-- Tablas inventory_locations y stock_by_location, columna businesses.sales_location_id,
-- trigger trg_sbl_sync_total. Aplicada a producción por Planning vía MCP el 2026-08-22.

-- ─── Tabla: inventory_locations ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_locations (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid(),
  business_id        uuid        NOT NULL,
  name               text        NOT NULL,
  is_sales_location  boolean     NOT NULL DEFAULT false,
  sort               integer     NOT NULL DEFAULT 0,
  is_active          boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_locations_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_locations_business_id_fkey
    FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inv_locations_business
  ON public.inventory_locations USING btree (business_id);

ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inv_locations owner all" ON public.inventory_locations;
CREATE POLICY "inv_locations owner all" ON public.inventory_locations
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = inventory_locations.business_id AND b.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = inventory_locations.business_id AND b.owner_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_locations TO authenticated;

-- ─── Tabla: stock_by_location ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stock_by_location (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
  business_id          uuid        NOT NULL,
  menu_item_id         uuid        NOT NULL,
  location_id          uuid        NOT NULL,
  qty                  integer     NOT NULL DEFAULT 0,
  low_stock_threshold  integer,
  par_level            integer,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_by_location_pkey PRIMARY KEY (id),
  CONSTRAINT stock_by_location_menu_item_id_location_id_key
    UNIQUE (menu_item_id, location_id),
  CONSTRAINT stock_by_location_business_id_fkey
    FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE,
  CONSTRAINT stock_by_location_menu_item_id_fkey
    FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE,
  CONSTRAINT stock_by_location_location_id_fkey
    FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sbl_business
  ON public.stock_by_location USING btree (business_id);
CREATE INDEX IF NOT EXISTS idx_sbl_item
  ON public.stock_by_location USING btree (menu_item_id);
CREATE INDEX IF NOT EXISTS idx_sbl_location
  ON public.stock_by_location USING btree (location_id);

ALTER TABLE public.stock_by_location ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sbl owner all" ON public.stock_by_location;
CREATE POLICY "sbl owner all" ON public.stock_by_location
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = stock_by_location.business_id AND b.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = stock_by_location.business_id AND b.owner_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_by_location TO authenticated;

-- ─── Column: businesses.sales_location_id ────────────────────────────────────

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS sales_location_id uuid
  REFERENCES public.inventory_locations(id) ON DELETE SET NULL;

-- ─── Función trigger: sbl_sync_total ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sbl_sync_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item uuid;
  v_total integer;
BEGIN
  v_item := COALESCE(NEW.menu_item_id, OLD.menu_item_id);
  SELECT COALESCE(SUM(qty), 0) INTO v_total
  FROM public.stock_by_location WHERE menu_item_id = v_item;
  UPDATE public.menu_items SET stock_count = v_total WHERE id = v_item;
  RETURN NULL;
END;
$function$;

-- ─── Trigger: trg_sbl_sync_total ─────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_sbl_sync_total ON public.stock_by_location;
CREATE TRIGGER trg_sbl_sync_total
  AFTER INSERT OR DELETE OR UPDATE ON public.stock_by_location
  FOR EACH ROW EXECUTE FUNCTION sbl_sync_total();
