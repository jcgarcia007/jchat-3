-- 117: Subchats por mesa automáticos con toggle a nivel negocio (F7).
--
-- 1. Agrega dos columnas a businesses:
--      table_subchats_enabled boolean  → master switch: al crear mesa nueva, se auto-crea subchat.
--      table_subchat_base_name text     → prefijo del nombre (default "Mesa" en la RPC).
-- 2. Actualiza el allow-list de UPDATE de businesses para incluir las nuevas columnas.
-- 3. Actualiza set_table_subchat() para aceptar un nombre base opcional (p_base_name text DEFAULT null),
--    manteniendo compatibilidad con todas las llamadas existentes (dos argumentos siguen funcionando).

begin;

-- ── 1. Columnas nuevas en businesses ─────────────────────────────────────────
alter table public.businesses
  add column if not exists table_subchats_enabled  boolean not null default false,
  add column if not exists table_subchat_base_name text;

-- ── 2. Allow-list de UPDATE de businesses ────────────────────────────────────
-- La 038 es la última revoke+grant completo de businesses. Se replica aquí con
-- las dos columnas nuevas añadidas a la lista. Misma convención que 036/038.
revoke update on public.businesses from authenticated, anon;

grant update (
  address, category, city, country, cover_url, created_at, dashboard_theme_id,
  description, event_ends_at, event_starts_at, external_menu_url, gallery_urls,
  geofence_polygon, geofence_radius_m, hours, icon_emoji, icon_url, id, is_active,
  is_temporary, lat, latitude, lng, logo_url, longitude,
  menu_card_effect, menu_enabled, menu_mode, menu_palette_id, menu_template_id,
  name, payout_frequency, phone, radius_m, slug, state, table_subchat_base_name,
  table_subchats_enabled, tip_percentages, tips_enabled, updated_at, website
) on public.businesses to authenticated;

-- ── 3. Actualizar set_table_subchat: acepta nombre base opcional ──────────────
-- p_base_name DEFAULT null → la firma de dos argumentos existente sigue funcionando.
-- Solo cambia la línea del INSERT: name = coalesce(nullif(trim(p_base_name),''),'Mesa') || ' ' || v_label
create or replace function public.set_table_subchat(
  p_table_id  uuid,
  p_enable    boolean,
  p_base_name text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_biz   uuid;
  v_room  uuid;
  v_main  uuid;
  v_label text;
begin
  select business_id, room_id, label into v_biz, v_room, v_label
  from public.tables where id = p_table_id;
  if v_biz is null then raise exception 'TABLE_NOT_FOUND'; end if;

  if not (public.owns_business_of_table(p_table_id) or public.is_platform_admin()) then
    raise exception 'NOT_ALLOWED';
  end if;

  if p_enable then
    if v_room is not null then return v_room; end if; -- idempotente: ya tiene subchat
    select id into v_main from public.rooms
    where business_id = v_biz and is_main = true and is_active = true
    limit 1;
    if v_main is null then raise exception 'NO_MAIN_ROOM'; end if;

    insert into public.rooms (business_id, name, parent_room_id, is_main, is_active)
    values (
      v_biz,
      coalesce(nullif(trim(p_base_name), ''), 'Mesa') || ' ' || v_label,
      v_main, false, true
    )
    returning id into v_room;

    update public.tables set room_id = v_room where id = p_table_id;
    return v_room;
  else
    if v_room is not null then
      update public.rooms set is_active = false where id = v_room;
      update public.tables set room_id = null where id = p_table_id;
    end if;
    return null;
  end if;
end $$;

revoke execute on function public.set_table_subchat(uuid, boolean, text) from public, anon;
grant execute on function public.set_table_subchat(uuid, boolean, text) to authenticated;

commit;
