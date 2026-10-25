-- 241: las mesas del local, solo sus etiquetas, para quien está DENTRO del local (hoja "¿Cuál es tu mesa?" al aceptar un regalo).
-- BORRADOR PARA REVISIÓN: NO está aplicada en Supabase. La aplica Juan Carlos cuando dé el OK (SQL Editor / MCP).
-- Reversión: supabase/rollbacks/241_venue_table_labels_rollback.sql (fuera de migrations/ a propósito: el CLI aplicaría
-- cualquier archivo de esta carpeta, también uno de reversión).
-- Comprobación (sin escribir nada): supabase/scripts/241_check.sql
-- Orden de despliegue: 1) aplicar esta migración · 2) publicar el cliente (GiftCard). Si el cliente sale antes, la hoja no recibe
--     etiquetas y muestra directamente el campo de número, como hasta ahora.
--
-- POR QUÉ ASÍ:
--   public.tables solo la leen el dueño del negocio y los administradores (RLS de la 069): quien recibe un regalo no puede
--   listar las mesas con un select. Esta función las entrega con dos garantías:
--     · Devuelve SOLO la etiqueta (label). Nunca qr_token, short_code ni access_code: el token de la mesa es lo que prueba que se
--       escaneó el QR de ESA mesa (abre pedidos, cuenta y llamada) y no sale nunca de la base de datos.
--     · Solo responde a una persona con sesión (auth.uid() no nulo) que está físicamente en el local (venue_presence_ok, la misma
--       regla de oro de la 197). Si no se cumple, devuelve una lista vacía, sin error: no revela si el negocio existe ni tiene mesas.
--
-- ORDEN: natural, para que T10 vaya después de T9 y no después de T1. Primero el número que contenga la etiqueta (las primeras
-- 9 cifras del primer grupo de dígitos: así una etiqueta larga no desborda el entero), después el texto. Las etiquetas sin
-- ningún número van al final.
--
-- Solo mesas ACTIVAS (is_active). Idempotente: create or replace + grants repetibles.

create or replace function public.venue_table_labels(p_business_id uuid)
returns table (label text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.label
  from public.tables t
  where auth.uid() is not null
    and t.business_id = p_business_id
    and t.is_active
    and public.venue_presence_ok(p_business_id, auth.uid())
  order by (substring(t.label from '\d{1,9}'))::int asc nulls last, lower(t.label), t.label;
$$;

comment on function public.venue_table_labels(uuid) is
  'Etiquetas (solo label) de las mesas activas del negocio, en orden natural, para una persona con sesión que está dentro del '
  'local (venue_presence_ok). Si no: lista vacía, sin error. Nunca devuelve tokens ni códigos de la mesa.';

-- Solo personas con sesión: anon y el público no la ejecutan.
revoke all on function public.venue_table_labels(uuid) from public, anon;
grant execute on function public.venue_table_labels(uuid) to authenticated;
