-- ============================================================
-- JChat 3.0 — Chunk A1: tabla platform_config + trigger dinámico
--
-- Introduce una tabla singleton para configuración de plataforma.
-- El primer uso es el rango configurable de radio de geofence
-- (business_radius_min_m / business_radius_max_m), de modo que el
-- admin pueda ajustarlo sin desplegar código.
--
-- El trigger enforce_business_radius_cap se actualiza para leer el
-- cap real de platform_config en lugar del hardcodeado 50.
-- El comportamiento predeterminado (min=50, max=50) es idéntico al
-- actual — este chunk no cambia nada visible hasta que el admin
-- edite el rango (Chunk A2 — LocationEditor slider + panel admin).
--
-- RETROACTIVIDAD: el trigger solo se dispara en INSERT o UPDATE de
-- geofence_radius_m. Bajar el max global NO recorta radios que ya
-- existen — solo impide nuevos cambios que superen el cap. Esto
-- protege el acceso al chat de negocios en producción (un recorte
-- silencioso rompería la geo-presencia de salas existentes).
-- ============================================================

-- ── 1. Tabla platform_config (singleton) ──────────────────────

create table public.platform_config (
  id                    bool primary key default true,
  business_radius_min_m integer not null default 50,
  business_radius_max_m integer not null default 50,

  -- La tabla es un singleton: id siempre = true.
  constraint platform_config_singleton
    check (id = true),

  -- Ambos radios deben ser positivos.
  constraint platform_config_radius_positive
    check (business_radius_min_m > 0 and business_radius_max_m > 0),

  -- El rango debe ser coherente (min no puede superar max).
  constraint platform_config_radius_range
    check (business_radius_min_m <= business_radius_max_m)
);

comment on table public.platform_config is
  'Singleton de configuración de plataforma. Exactamente una fila (id = true).';
comment on column public.platform_config.business_radius_min_m is
  'Radio mínimo de geofence sugerido al UI (slider). No se valida server-side — es guía UX.';
comment on column public.platform_config.business_radius_max_m is
  'Radio máximo de geofence permitido por el trigger enforce_business_radius_cap.';

-- Índice no necesario (tabla de una sola fila).

-- ── 2. Fila singleton ─────────────────────────────────────────
-- min=50 / max=50 reproduce exactamente el comportamiento actual
-- (cap fijo de 50 m). ON CONFLICT DO NOTHING: seguro en re-ejecuciones.

insert into public.platform_config (id, business_radius_min_m, business_radius_max_m)
values (true, 50, 50)
on conflict (id) do nothing;

-- ── 3. RLS ────────────────────────────────────────────────────

alter table public.platform_config enable row level security;

-- SELECT: cualquier authenticated puede leer.
-- LocationEditor (Chunk A2) necesita leer business_radius_min_m / max_m
-- para construir los límites del slider sin hacer una llamada server-side.
create policy "platform_config: authenticated can read"
  on public.platform_config
  for select
  to authenticated
  using (true);

-- UPDATE: solo platform admins.
-- using + with check idénticos (la fila singleton nunca cambia de id = true).
create policy "platform_config: admin can update"
  on public.platform_config
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- INSERT / DELETE: nadie. La fila ya existe y no debe borrarse ni
-- duplicarse. Los grants predeterminados de Supabase para authenticated
-- no incluyen INSERT/DELETE, por lo que no se necesita una policy
-- restrictiva explícita — pero la ausencia de policy ya lo impide con
-- RLS activa.

-- ── 4. Trigger — cap dinámico desde platform_config ──────────

-- Reemplaza la función de 021_enforce_business_radius_cap.sql,
-- cambiando SOLO la fuente del cap: en vez de `cap constant integer := 50`
-- se lee business_radius_max_m de platform_config.
--
-- Comportamiento idéntico al actual:
--   · is_platform_admin()                              → siempre permitido.
--   · radius_increase_requests con status='approved'
--     que cubra el valor solicitado                   → permitido.
--   · cualquier otro caso que supere el cap            → rechazado.
--
-- Fallback defensivo: si la fila singleton no existe o el valor es null,
-- el cap cae a 50 — NUNCA a null (que permitiría cualquier radio).
--
-- RETROACTIVIDAD: este trigger solo se dispara en INSERT o UPDATE de
-- geofence_radius_m. Negocios que ya tienen un radio mayor al cap global
-- NO se recortan — sus filas no se tocan. Solo se valida cuando alguien
-- intenta cambiar el campo geofence_radius_m. Bajar el max global en
-- platform_config no afecta la geo-presencia de negocios existentes.

create or replace function public.enforce_business_radius_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap       integer;
  has_grant boolean;
begin
  -- Leer el cap desde platform_config.
  -- COALESCE defiende contra null en la columna; el segundo coalesce fuera
  -- del select defiende contra que la fila no exista (select sin resultado
  -- deja cap = null).
  select coalesce(business_radius_max_m, 50)
    into cap
    from public.platform_config
   where id = true;

  -- Fallback si la fila singleton no existe.
  cap := coalesce(cap, 50);

  if new.geofence_radius_m is null or new.geofence_radius_m <= cap then
    return new;
  end if;

  -- Platform admins pueden exceder cualquier cap.
  if public.is_platform_admin() then
    return new;
  end if;

  -- Override por solicitud aprobada que cubra el valor pedido.
  select exists (
    select 1
      from public.radius_increase_requests r
     where r.business_id = new.id
       and r.status = 'approved'
       and r.requested_radius_m >= new.geofence_radius_m
  ) into has_grant;

  if has_grant then
    return new;
  end if;

  raise exception
    'geofence_radius_m % exceeds the % m cap without an approved radius increase request',
    new.geofence_radius_m, cap
    using errcode = 'check_violation';
end;
$$;

-- Recrear el trigger (ya existía desde 021) para asegurar que apunta a la
-- versión actualizada de la función.
drop trigger if exists trg_enforce_business_radius_cap on public.businesses;
create trigger trg_enforce_business_radius_cap
  before insert or update of geofence_radius_m on public.businesses
  for each row execute function public.enforce_business_radius_cap();
