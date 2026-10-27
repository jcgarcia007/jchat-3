-- 045_lockdown_rooms_columns.sql
-- S1 (auditoría senior 2026-07-09): la tabla public.rooms exponía las columnas
-- password_hash y qr_token a los roles anon y authenticated. El qr_token otorga
-- membresía de sala vía join_room_via_qr SIN verificar presencia física → cualquiera
-- podía leerlo y entrar a cualquier sala (IDOR, rompe la "regla de oro" de geo).
--
-- ⚠️ IMPORTANTE: rooms tenía GRANTs a nivel de TABLA (SELECT/INSERT/UPDATE) para
-- anon/authenticated. Un `REVOKE (columna)` NO puede quitar columnas de un grant de
-- tabla (es no-op). Por eso hay que REVOCAR el grant de tabla y RE-OTORGAR solo las
-- columnas NO sensibles.
--
-- Las ESCRITURAS de las 2 columnas sensibles siguen funcionando por los RPCs
-- SECURITY DEFINER ya existentes (set_room_password, generate_room_qr_token,
-- regenerate_room_qr_token) y el trigger BEFORE INSERT trg_fn_assign_room_qr_token
-- (todos SECURITY DEFINER → no dependen del GRANT de columnas). El owner LEE su
-- qr_token por el nuevo RPC get_room_qr_token con guard de propiedad.
--
-- DELETE / REFERENCES no se tocan (el owner sigue pudiendo borrar salas).

-- (a) Revocar el grant de tabla y re-otorgar SOLO las 18 columnas no sensibles
--     (todo excepto password_hash y qr_token) para anon y authenticated.
revoke select, insert, update on public.rooms from anon, authenticated;

grant select (
  id, business_id, parent_room_id, name, description, chat_theme_id,
  is_password_protected, max_occupancy, is_active, created_at, updated_at,
  icon, color, slug, ttl_hours, notify_enabled, sort, is_main
) on public.rooms to anon, authenticated;

grant insert (
  id, business_id, parent_room_id, name, description, chat_theme_id,
  is_password_protected, max_occupancy, is_active, created_at, updated_at,
  icon, color, slug, ttl_hours, notify_enabled, sort, is_main
) on public.rooms to anon, authenticated;

grant update (
  id, business_id, parent_room_id, name, description, chat_theme_id,
  is_password_protected, max_occupancy, is_active, created_at, updated_at,
  icon, color, slug, ttl_hours, notify_enabled, sort, is_main
) on public.rooms to anon, authenticated;

-- (b) Endurecer la policy de lectura: exigir sala activa (no exponer salas inactivas).
--     Los owners siguen viendo sus salas inactivas por la policy "rooms: business owner
--     manage" (ALL con guard de owner), que se combina por OR.
drop policy if exists "rooms: authenticated read" on public.rooms;
create policy "rooms: authenticated read"
  on public.rooms
  for select
  to authenticated
  using (is_active = true);

-- (c) RPC owner-only para leer el qr_token desde el dashboard.
create or replace function public.get_room_qr_token(p_room_id uuid)
returns text
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_token text;
begin
  -- Solo el owner del negocio de esa sala O el platform admin.
  if not exists (
    select 1 from rooms r
    join businesses b on b.id = r.business_id
    where r.id = p_room_id
      and (b.owner_id = auth.uid() or is_platform_admin())
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select qr_token into v_token from rooms where id = p_room_id;
  return v_token;
end;
$$;

revoke execute on function public.get_room_qr_token(uuid) from anon;
grant execute on function public.get_room_qr_token(uuid) to authenticated;
