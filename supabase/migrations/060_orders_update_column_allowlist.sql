-- 060: orders UPDATE column allow-list (D-42/D-41; patrón de 034/036)
-- El dueño solo puede actualizar columnas OPERATIVAS de sus pedidos.
-- Las financieras/identidad quedan solo para service_role (webhook/EF).
--
-- Allow-list = SOLO las columnas que el cliente escribe hoy (verificado 2026-07-12):
--   mobile/services/orders.ts:147 y web/app/dashboard/kds/page.tsx:175
--   ambos hacen .update({ status, status_updated_at }).
-- eta_minutes es READ-ONLY en el código (se muestra, nunca se escribe) → fuera.

begin;

-- 1. Quitar el UPDATE de tabla completa
revoke update on table public.orders from authenticated;
revoke update on table public.orders from anon;

-- 2. Grants residuales peligrosos/inútiles para clientes (D-41: negar explícito)
revoke delete, truncate, references, trigger on table public.orders from anon;
revoke delete, truncate, references, trigger on table public.orders from authenticated;

-- 3. Allow-list operativa (verificada en PASO 0)
grant update (status, status_updated_at)
  on table public.orders to authenticated;

commit;
