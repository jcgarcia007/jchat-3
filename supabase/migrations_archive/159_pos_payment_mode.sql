-- 159: Modo de cobro del POS por negocio (Tab POS · Fase F1 · MIG-A · D-01).
--
-- 1. businesses.pos_payment_mode: 'stripe' (default, cobros por Stripe; el cliente
--    puede pagar por QR) | 'external' (el dueño cobra por fuera: efectivo / tarjeta
--    externa; el cliente nunca paga por teléfono).
-- 2. Allow-list de UPDATE de businesses para `authenticated`: se reemplaza con la
--    lista REAL leída de la BD el 2026-09-09 (42 columnas) + pos_payment_mode
--    + kds_settings. kds_settings NO estaba en el grant → el toggle "clientes ven
--    estado" y las alertas de expedición del dashboard fallaban con 42501.
-- 3. RPC pos_business_settings(p_business_id): {pos_payment_mode, kds_settings}
--    para el handheld (F4/F6). Gate: pos_can_access o dueño del negocio.
-- 4. Higiene: anon/authenticated tenían TRUNCATE/TRIGGER/REFERENCES a nivel tabla
--    en businesses (TRUNCATE no pasa por RLS). Se revocan solo esos tres.
--
-- Aplicada por Planning vía MCP. Codex solo versiona el archivo.

begin;

-- ── 1. Columna + CHECK ────────────────────────────────────────────────────────
alter table public.businesses
  add column if not exists pos_payment_mode text not null default 'stripe';

alter table public.businesses
  drop constraint if exists businesses_pos_payment_mode_chk;
alter table public.businesses
  add constraint businesses_pos_payment_mode_chk
  check (pos_payment_mode in ('stripe','external'));

comment on column public.businesses.pos_payment_mode is
  'Modo de cobro del POS: stripe = cobros por Stripe (cliente puede pagar por QR); external = el dueño cobra por fuera (efectivo/tarjeta externa), cliente nunca paga por teléfono. D-01.';

-- ── 2. Allow-list de UPDATE (lista literal leída de la BD + 2 columnas) ───────
-- Convención 036/038/117: revoke total + grant por columnas. Cualquier columna
-- omitida rompe el guardado de otra sección del dashboard: NO reconstruir de memoria.
revoke update on public.businesses from authenticated, anon;

grant update (
  address, brand_kit, category, city, country, cover_url, created_at,
  dashboard_theme_id, description, event_ends_at, event_starts_at,
  external_menu_url, gallery_urls, geofence_polygon, geofence_radius_m, hours,
  icon_emoji, id, is_active, is_temporary, lat, latitude, lng, logo_url,
  longitude, menu_card_effect, menu_enabled, menu_mode, menu_palette_id,
  menu_template_id, name, payout_frequency, phone, radius_m, slug, state,
  table_subchat_base_name, table_subchats_enabled, tip_percentages, tips_enabled,
  updated_at, website,
  -- nuevas en 159
  pos_payment_mode, kds_settings
) on public.businesses to authenticated;

-- ── 3. RPC pos_business_settings ─────────────────────────────────────────────
-- Devuelve el modo de cobro y kds_settings al staff del POS. `pos_can_access`
-- excluye al dueño sin fila de empleado, por eso se añade el check de owner_id
-- (mismo criterio que owns_business_of_table).
create or replace function public.pos_business_settings(p_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select case
    when public.pos_can_access(p_business_id)
      or exists (
        select 1 from public.businesses o
        where o.id = p_business_id and o.owner_id = auth.uid()
      )
    then (
      select jsonb_build_object(
        'pos_payment_mode', b.pos_payment_mode,
        'kds_settings',     coalesce(b.kds_settings, '{}'::jsonb)
      )
      from public.businesses b
      where b.id = p_business_id
    )
    else null
  end;
$$;

comment on function public.pos_business_settings(uuid) is
  'Ajustes del negocio para el handheld: {pos_payment_mode, kds_settings}. Solo staff con pos_access o el dueño; null si no hay acceso. F1.';

revoke all on function public.pos_business_settings(uuid) from public, anon, authenticated;
grant execute on function public.pos_business_settings(uuid) to authenticated;

-- ── 4. Higiene de privilegios de tabla (solo businesses, solo estos tres) ─────
revoke truncate, trigger, references on public.businesses from anon, authenticated;

commit;
