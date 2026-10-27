-- 140_suppliers_account_number.sql — número de cuenta del negocio con el proveedor. Aplicada por MCP 2026-08-22.
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS account_number text;
