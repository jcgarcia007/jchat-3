-- ============================================================
-- JChat 3.0 — Épica Geocerca, Fase 3.1: barrera server-side de
-- la Regla de Oro (docs/EPICA_GEOCERCA_ACCESO_CHAT.md §3,
-- docs/FASE3_BARRERA_SERVERSIDE.md).
--
-- Regla absoluta: solo el dueño del negocio entra a su chat sin
-- estar en el radio. Todos los demás necesitan geo-presencia
-- vigente (dentro del radio, verificado server-side) + contraseña
-- si la sala la tiene. QR y contraseña YA NO eximen de la geo por
-- sí solos — room_members (que hoy llenan tanto join_room_via_qr
-- como verify_room_password, sin distinguir origen) deja de ser
-- un tercer OR independiente en can_access_room; solo cuenta como
-- la pieza de "contraseña pasada" cuando la sala la tiene. No se
-- añade access_kind ni se toca el schema de room_members: con la
-- regla absoluta (nadie exime de geo salvo el dueño) no hace falta
-- distinguir el origen de la fila, solo si existe una vigente.
--
-- Aditivo puro: NO se toca room_members, verify_room_password,
-- join_room_via_qr, ni sus grants. NO se toca RLS/columnas de
-- businesses ni el trigger de sync de coords/radio (Fase 1.0).
-- can_access_room se reemplaza manteniendo firma y las mismas 2
-- policies de messages que ya lo usan (SELECT/INSERT) intactas.
-- ============================================================

-- ── 1. room_geo_presence — última posición conocida, sin historial ──
-- Sigue el patrón exacto de room_members (019_room_membership.sql):
-- misma PK compuesta, mismo estilo de FKs on delete cascade, RLS
-- de solo-lectura-propia, y CERO policy de insert/update/delete
-- para authenticated — la única vía de escritura es la RPC
-- SECURITY DEFINER de abajo. No se guardan coordenadas (privacidad,
-- mismo principio que mobile/services/geofence.ts): cada fila es
-- solo "presente y vigente", se sobreescribe, nunca se acumula.

create table public.room_geo_presence (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index idx_room_geo_presence_expires_at on public.room_geo_presence (expires_at);

alter table public.room_geo_presence enable row level security;

create policy "room_geo_presence: select own"
  on public.room_geo_presence
  for select
  to authenticated
  using (user_id = auth.uid());

-- ── 2. check_geofence_and_join_room — el corazón: el cliente ────
-- envía sus coordenadas, el servidor calcula Haversine y decide.
-- Ventana de 10 minutos: el heartbeat de Fase 3.2 re-llama esta
-- RPC cada ~5 min mientras el chat está abierto; 10 min da margen
-- de red/reintento sin dejar geo-presencia "colgada" mucho tiempo
-- tras cerrar el chat o salir del radio sin que el cliente llegue
-- a limpiarla explícitamente.
--
-- Fórmula: réplica exacta de haversineMeters en
-- mobile/services/geofence.ts:114-135 — forma atan2 (no la
-- variante acos, menos estable cerca de distancia 0), R = 6 371 000 m.

create or replace function public.check_geofence_and_join_room(
  _room_id uuid,
  _lat float8,
  _lng float8
)
returns table(access_granted boolean, is_owner boolean, distance_m float8, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid;
  _business_id uuid;
  _owner_id uuid;
  _biz_lat float8;
  _biz_lng float8;
  _radius_m float8;
  _dlat float8;
  _dlng float8;
  _a float8;
  _dist float8;
begin
  _uid := auth.uid();

  if _uid is null then
    return query select false, false, null::float8, 'auth_required';
    return;
  end if;

  select r.business_id into _business_id
  from public.rooms r
  where r.id = _room_id and r.is_active = true;

  if _business_id is null then
    return query select false, false, null::float8, 'invalid_room';
    return;
  end if;

  select b.owner_id, b.lat, b.lng, b.geofence_radius_m
  into _owner_id, _biz_lat, _biz_lng, _radius_m
  from public.businesses b
  where b.id = _business_id;

  -- Única excepción de la regla de oro: el dueño de ESE negocio, sin chequeo de distancia.
  if _owner_id = _uid then
    return query select true, true, null::float8, 'owner';
    return;
  end if;

  -- Sin geocerca válida configurada → default restrictivo, NO acceso.
  if _biz_lat is null or _biz_lng is null or _radius_m is null then
    return query select false, false, null::float8, 'no_geofence';
    return;
  end if;

  _dlat := radians(_biz_lat - _lat);
  _dlng := radians(_biz_lng - _lng);
  _a := power(sin(_dlat / 2), 2)
      + cos(radians(_lat)) * cos(radians(_biz_lat)) * power(sin(_dlng / 2), 2);
  _dist := 6371000 * 2 * atan2(sqrt(_a), sqrt(1 - _a));

  if _dist <= _radius_m then
    insert into public.room_geo_presence (room_id, user_id, expires_at, last_seen_at)
    values (_room_id, _uid, now() + interval '10 minutes', now())
    on conflict (room_id, user_id)
    do update set expires_at = excluded.expires_at, last_seen_at = excluded.last_seen_at;

    return query select true, false, _dist, 'inside_radius';
    return;
  else
    -- Fuera del radio: revoca cualquier geo-presencia previa, no solo "no crear una nueva".
    delete from public.room_geo_presence
    where room_id = _room_id and user_id = _uid;

    return query select false, false, _dist, 'outside_radius';
    return;
  end if;
end;
$$;

grant execute on function public.check_geofence_and_join_room(uuid, float8, float8) to authenticated;

-- ── 3. can_access_room — la matriz nueva ─────────────────────────
-- Misma firma (returns boolean, language sql, stable, security
-- definer, search_path vacío) → las 2 policies de messages
-- (SELECT/INSERT) que ya lo usan siguen funcionando sin tocarlas.
--
-- Cambio central: una sala SIN contraseña YA NO da acceso libre
-- (antes: is_password_protected = false → true). Ahora exige
-- geo-presencia vigente igual que una sala con contraseña. Una
-- fila de room_members vigente (de cualquier origen, QR o
-- contraseña) ya no es un OR independiente — solo cuenta para
-- satisfacer "la sala tiene contraseña y el usuario la pasó",
-- dentro del AND de geo-presencia.

create or replace function public.can_access_room(_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rooms r where r.id = _room_id and (
      exists (
        select 1 from public.businesses b
        where b.id = r.business_id and b.owner_id = auth.uid()
      )
      or (
        exists (
          select 1 from public.room_geo_presence g
          where g.room_id = _room_id and g.user_id = auth.uid() and g.expires_at > now()
        )
        and (
          r.is_password_protected = false
          or exists (
            select 1 from public.room_members m
            where m.room_id = _room_id and m.user_id = auth.uid() and m.expires_at > now()
          )
        )
      )
    )
  );
$$;
