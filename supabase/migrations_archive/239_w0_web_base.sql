-- 239: W0 — base de la web: retirar la entrada por QR sin ubicación, zona horaria del local y vencimiento de la
-- membresía a la hora de cierre.
-- BORRADOR PARA REVISIÓN: NO está aplicada en Supabase. La aplica Juan Carlos cuando dé el OK (SQL Editor / MCP).
-- Reversión: supabase/rollbacks/239_w0_web_base_rollback.sql (fuera de migrations/ a propósito: el CLI aplicaría
-- cualquier archivo de esta carpeta, también uno de reversión).
-- Comprobación (solo lectura, después de aplicar): supabase/scripts/239_w0_check.sql
--
-- Bloques y la decisión que origina cada uno:
--   (a) Se quita EXECUTE a la función vieja join_room_via_qr(text): entraba a la sala SIN verificar ubicación. Nadie la
--       llama (web/app/c/[token]/JoinRoomButton.tsx no lo importa nadie). La función NO se borra.
--   (b) businesses.timezone: zona horaria IANA del local (hoy todos en America/New_York).
--   (c) venue_session_expires_at(business_id): a qué hora vence una sesión de local (hora de cierre; 24 h sin horario).
--   (d) join_room_via_qr(token, lat, lng): igual que antes, pero room_members.expires_at usa (c) en vez de 24 h fijas.
--
-- Todo es idempotente: se puede ejecutar dos veces sin error y sin cambiar el resultado.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- (a) Función vieja sin ubicación: nadie la puede llamar
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 183 le había quitado EXECUTE a PUBLIC y anon y se lo había dado a authenticated y service_role. Aquí se le quita a
-- authenticated también (y, por claridad, se repite PUBLIC y anon). service_role la conserva (no la llama ningún cliente).
revoke execute on function public.join_room_via_qr(text) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- (b) Zona horaria del local
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Sin esta columna el horario (businesses.hours, 'HH:MM' sin zona) no se puede convertir a un instante. No la edita el
-- dueño desde la app (se rellenará por lat/lng en una fase posterior): por eso NO entra al grant update de authenticated
-- (CLAUDE.md, columnas de businesses) y va a NOT_OWNER_EDITABLE en mobile/scripts/migrations-businesses-grants.test.mjs.
alter table public.businesses add column if not exists timezone text not null default 'America/New_York';

comment on column public.businesses.timezone is
  'Zona horaria IANA del local (p. ej. America/New_York). Hoy todos están en America/New_York; se rellenará por lat/lng '
  'en una fase posterior. La usa venue_session_expires_at para convertir businesses.hours a un instante.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- (c) A qué hora vence la sesión de un local
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Lee businesses.hours  { mon|tue|wed|thu|fri|sat|sun : { open:'HH:MM', close:'HH:MM', closed:bool } }
-- y businesses.timezone. Devuelve el instante en que cierra el local para quien entra AHORA.
--
-- Regla:
--   * Sin horario (hours vacío), local inexistente, o el día de HOY cerrado / ausente  →  now() + 24 horas.
--   * Con horario: cierre = hoy a la hora `close` en la zona del local. Si close <= open el local cierra pasada la
--     medianoche (p. ej. 02:00): el cierre es MAÑANA a esa hora.
--   * Si ese cierre de hoy YA pasó (estamos después de cerrar), se usa el cierre de la próxima jornada abierta
--     (se recorren hasta 7 días; los días cerrados o ausentes se saltan).
--   * Guarda: si el cierre calculado cae a menos de 1 hora de ahora, se devuelve now() + 24 horas (un horario mal
--     cargado no corta sesiones; tampoco se expulsa a alguien 5 minutos después de entrar).
--   * Cualquier dato inválido (hora mal escrita, zona desconocida) → now() + 24 horas. Nunca lanza error: la usa
--     join_room_via_qr y un horario roto no puede impedir que alguien entre a una sala.
--
-- ÚNICO AÑADIDO a la regla escrita (marcado como (1) abajo): la jornada de AYER que cruza la medianoche. Sin esto, a la
-- 00:30 de un sábado (todavía dentro de la jornada del viernes, que cierra el sábado a las 02:00) la regla leería el
-- horario del sábado y daría el cierre del domingo a las 02:00, ~26 h después. Con (1) da el sábado a las 02:00.
create or replace function public.venue_session_expires_at(p_business_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c_fallback constant timestamptz := now() + interval '24 hours';
  -- extract(dow): 0 = domingo … 6 = sábado  →  índice + 1
  c_keys     constant text[] := array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  v_now      timestamptz := now();
  v_hours    jsonb;
  v_tz       text;
  v_today    date;
  v_date     date;
  v_day      jsonb;
  v_open     time;
  v_close    time;
  v_end      timestamptz;
  v_result   timestamptz;
  v_i        int;
begin
  select b.hours, b.timezone into v_hours, v_tz
  from public.businesses b
  where b.id = p_business_id;

  if not found or v_hours is null or v_hours = '{}'::jsonb then
    return c_fallback;
  end if;

  begin
    v_tz    := coalesce(nullif(btrim(v_tz), ''), 'America/New_York');
    v_today := (v_now at time zone v_tz)::date;   -- la fecha de hoy EN LA ZONA DEL LOCAL

    -- i = -1: ayer · i = 0: hoy · i = 1..7: los próximos días
    for v_i in -1..7 loop
      v_date := v_today + v_i;
      v_day  := v_hours -> c_keys[extract(dow from v_date)::int + 1];

      if v_day is null
         or coalesce((v_day ->> 'closed')::boolean, false)
         or v_day ->> 'open' is null
         or v_day ->> 'close' is null then
        if v_i = 0 then
          return c_fallback;      -- hoy cerrado o sin horario → 24 h
        end if;
        continue;                 -- ayer o un día futuro cerrado: se salta
      end if;

      v_open  := (v_day ->> 'open')::time;
      v_close := (v_day ->> 'close')::time;

      -- Cierre de esa jornada: el mismo día, o el siguiente si cierra pasada la medianoche (close <= open).
      if v_close <= v_open then
        v_end := ((v_date + 1) + v_close) at time zone v_tz;
      else
        v_end := (v_date + v_close) at time zone v_tz;
      end if;

      if v_i = -1 then
        -- (1) Jornada de ayer: solo cuenta si cruzaba la medianoche y todavía no cerró.
        if v_close <= v_open and v_end > v_now then
          v_result := v_end;
          exit;
        end if;
        continue;
      end if;

      -- Hoy (i = 0): si su cierre ya pasó se sigue con el siguiente día abierto. Días futuros: su cierre siempre es futuro.
      if v_end > v_now then
        v_result := v_end;
        exit;
      end if;
    end loop;
  exception when others then
    return c_fallback;           -- hora mal escrita, zona desconocida, 'closed' que no es booleano…
  end;

  if v_result is null or v_result < v_now + interval '1 hour' then
    return c_fallback;
  end if;
  return v_result;
end;
$$;

comment on function public.venue_session_expires_at(uuid) is
  'Instante en que vence una sesión de local entrando ahora: hora de cierre según businesses.hours y businesses.timezone; '
  '24 h si no hay horario, hoy está cerrado, el dato es inválido o el cierre cae a menos de 1 h. Solo la usan otras funciones definer.';

-- Solo la llaman otras funciones SECURITY DEFINER (join_room_via_qr): nadie más.
revoke execute on function public.venue_session_expires_at(uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- (d) join_room_via_qr(token, lat, lng): la membresía vence a la hora de cierre
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- COPIA de la definición vigente (197_golden_rule_presence.sql; ninguna migración posterior la redefine: 045, 055, 112 y
-- 183 solo la mencionan o cambian grants). ÚNICOS cambios:
--   · declare: se añaden v_business y v_expires.
--   · el select de la sala también lee r.business_id (into v_business).
--   · después de confirmar el acceso: v_expires := public.venue_session_expires_at(v_business).
--   · las 4 apariciones de  now() + interval '24 hours'  de room_members.expires_at pasan a v_expires.
-- Todo lo demás (firma, retorno, geofence, mensajes de error, search_path) queda igual.
create or replace function public.join_room_via_qr(token text, p_lat float8, p_lng float8)
returns table (room_id uuid, parent_room_id uuid, access_granted boolean, is_owner boolean, distance_m float8, reason text)
language plpgsql security definer set search_path = public as $$
declare v_room uuid; v_parent uuid; v_res record; v_business uuid; v_expires timestamptz;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  select r.id, r.parent_room_id, r.business_id into v_room, v_parent, v_business from public.rooms r where r.qr_token = token and r.is_active = true;
  if v_room is null then raise exception 'invalid_qr'; end if;
  select * into v_res from public.check_geofence_and_join_room(v_room, p_lat, p_lng);
  if not v_res.access_granted then
    return query select v_room, v_parent, false, false, v_res.distance_m, v_res.reason;
    return;
  end if;
  v_expires := public.venue_session_expires_at(v_business);
  insert into public.room_members (room_id, user_id, expires_at) values (v_room, auth.uid(), v_expires)
  on conflict on constraint room_members_pkey do update set expires_at = v_expires;
  if v_parent is not null then
    insert into public.room_members (room_id, user_id, expires_at) values (v_parent, auth.uid(), v_expires)
    on conflict on constraint room_members_pkey do update set expires_at = v_expires;
  end if;
  return query select v_room, v_parent, true, v_res.is_owner, v_res.distance_m, v_res.reason;
end;
$$;

-- (e) Grants: los mismos que tenía (197): solo usuarios con sesión.
revoke all on function public.join_room_via_qr(text, float8, float8) from public, anon;
grant execute on function public.join_room_via_qr(text, float8, float8) to authenticated;
