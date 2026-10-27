-- 139_suppliers.sql — Fase 1: proveedores por negocio + asignación a productos. Aplicada por MCP 2026-08-22.
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL, contact_name text, email text, phone text, notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_business ON public.suppliers(business_id);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppliers owner all" ON public.suppliers;
CREATE POLICY "suppliers owner all" ON public.suppliers FOR ALL
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = suppliers.business_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = suppliers.business_id AND b.owner_id = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_menu_items_supplier ON public.menu_items(supplier_id);
