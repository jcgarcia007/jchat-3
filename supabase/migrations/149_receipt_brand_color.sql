-- 149_receipt_brand_color.sql
-- Añade receipt_brand_color a businesses para personalizar el recibo digital.
-- Aplicada a producción por Planning vía MCP el 2026-08-23.

alter table public.businesses add column if not exists receipt_brand_color text;
