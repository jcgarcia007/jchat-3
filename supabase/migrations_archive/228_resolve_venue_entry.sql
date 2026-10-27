-- 228: Entrada por QR (Fase 2 web/app) — resuelve a qué local y sala lleva una URL de entrada.
-- Formatos: <venue>.jchat.cloud/                 → sala principal del local
--           <venue>.jchat.cloud/<mesa>-<código>  → sala principal + contexto de mesa
--           (jchat.cloud | <venue>.jchat.cloud)/c/<qr_token> → la sala de ese token (QR ya impresos)
-- <venue> = businesses.subdomain o, si no tiene, businesses.slug.
-- Solo datos públicos (nombre, logo, id de sala). La presencia la sigue exigiendo check_geofence_and_join_room.
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-11). Este archivo solo la versiona.

create or replace function public.resolve_venue_entry(
  p_venue text default null,
  p_label text default null,
  p_code  text default null,
  p_token text default null
) returns table (
  business_id uuid,
  business_name text,
  business_slug text,
  logo_url text,
  room_id uuid,
  table_label text,
  table_qr_token text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_venue text := nullif(lower(btrim(p_venue)), '');
  v_biz   uuid;
  v_room  uuid;
  v_label text;
  v_ttok  text;
begin
  if nullif(btrim(p_token), '') is not null then
    -- QR de sala (formato /c/<token>). Si llega también el subdominio, debe ser del mismo local.
    select r.business_id, r.id into v_biz, v_room
    from public.rooms r
    join public.businesses b on b.id = r.business_id
    where r.qr_token = btrim(p_token) and r.is_active and b.is_active
      and (v_venue is null or b.subdomain = v_venue or b.slug = v_venue);
  elsif v_venue is not null then
    select b.id into v_biz
    from public.businesses b
    where b.is_active and (b.subdomain = v_venue or b.slug = v_venue)
    order by (b.subdomain = v_venue) desc nulls last
    limit 1;

    if v_biz is not null and nullif(btrim(p_label), '') is not null and nullif(btrim(p_code), '') is not null then
      -- QR de mesa: número + código corto secreto. Código incorrecto → no resuelve (sin pista de cuál falló).
      select t.label, t.qr_token into v_label, v_ttok
      from public.tables t
      where t.business_id = v_biz and t.is_active
        and lower(t.label) in (lower(btrim(p_label)), 't' || lower(btrim(p_label)), 'mesa ' || lower(btrim(p_label)))
        and t.short_code = lower(btrim(p_code))
      limit 1;
      if v_label is null then
        return;
      end if;
    end if;
  end if;

  if v_biz is null then
    return;
  end if;

  if v_room is null then
    select r.id into v_room
    from public.rooms r
    where r.business_id = v_biz and r.is_active and r.parent_room_id is null
    order by r.is_main desc, r.sort asc nulls last, r.created_at asc
    limit 1;
  end if;

  if v_room is null then
    return;
  end if;

  return query
    select b.id, b.name, b.slug, b.logo_url, v_room, v_label, v_ttok
    from public.businesses b where b.id = v_biz;
end;
$$;

revoke all on function public.resolve_venue_entry(text, text, text, text) from public;
grant execute on function public.resolve_venue_entry(text, text, text, text) to anon, authenticated;
