-- 146_purchase_order_settings.sql
-- Tabla de configuración del encabezado de órdenes de compra por negocio.
-- Aplicada a producción por Planning vía MCP el 2026-08-23.

CREATE TABLE IF NOT EXISTS public.purchase_order_settings (
  business_id uuid NOT NULL,
  legal_name  text,
  address     text,
  phone       text,
  email       text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_settings_pkey
    PRIMARY KEY (business_id),
  CONSTRAINT purchase_order_settings_business_id_fkey
    FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE
);

ALTER TABLE public.purchase_order_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_settings owner all"
  ON public.purchase_order_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = purchase_order_settings.business_id
        AND b.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = purchase_order_settings.business_id
        AND b.owner_id = auth.uid()
    )
  );

GRANT INSERT, SELECT, UPDATE, DELETE ON public.purchase_order_settings TO authenticated;
