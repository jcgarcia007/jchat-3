-- 239 — comprobación DESPUÉS de aplicar supabase/migrations/239_w0_web_base.sql.
-- SOLO LECTURA: no modifica ninguna tabla ni función del esquema public. Se corre en el SQL Editor (todo el script junto:
-- la sección (d) crea una función TEMPORAL en pg_temp que desaparece al cerrar la sesión).
-- Cada sección dice qué resultado se espera.

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (a) Permisos.   Esperado:  vieja_authenticated = false · vieja_anon = false · nueva_authenticated = true ·
--                            vencimiento_authenticated = false · vencimiento_anon = false
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select
  has_function_privilege('authenticated', 'public.join_room_via_qr(text)', 'execute')                                 as vieja_authenticated,
  has_function_privilege('anon',          'public.join_room_via_qr(text)', 'execute')                                 as vieja_anon,
  has_function_privilege('authenticated', 'public.join_room_via_qr(text, double precision, double precision)', 'execute') as nueva_authenticated,
  has_function_privilege('authenticated', 'public.venue_session_expires_at(uuid)', 'execute')                         as vencimiento_authenticated,
  has_function_privilege('anon',          'public.venue_session_expires_at(uuid)', 'execute')                         as vencimiento_anon;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (b) Bar XZX (slug bar-xzx-omd2: cierra 02:00 vie/sáb y 22:00 entre semana) con la fecha y hora de AHORA.
--     Esperado: timezone = America/New_York; vence_local = la hora de cierre de hoy (22:00 entre semana; 02:00 del día
--     siguiente en vie/sáb); si faltara menos de 1 h para ese cierre, dentro_de ≈ 24:00:00.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select
  b.name, b.slug, b.timezone,
  now() at time zone b.timezone                                          as ahora_local,
  public.venue_session_expires_at(b.id)                                  as vence,
  public.venue_session_expires_at(b.id) at time zone b.timezone          as vence_local,
  public.venue_session_expires_at(b.id) - now()                          as dentro_de,
  b.hours
from public.businesses b
where b.slug = 'bar-xzx-omd2';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (c) Un negocio SIN horario (hours vacío).   Esperado: dentro_de ≈ 24:00:00 (menos unos milisegundos).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select
  b.name, b.slug, b.hours,
  public.venue_session_expires_at(b.id) - now() as dentro_de
from public.businesses b
where b.hours is null or b.hours = '{}'::jsonb
order by b.created_at
limit 3;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (d) Escenarios con horas FIJAS (la función real usa now(), así que no se puede probar otra hora con ella).
--     pg_temp.exp_at es una COPIA TEMPORAL de la lógica de venue_session_expires_at con la hora de ahora como parámetro.
--     Primero se comprueba que la copia y la función real dan lo mismo para Bar XZX con la hora de ahora; después se
--     recorren los casos. Esperado: la columna ok es true en TODAS las filas y la última consulta devuelve true.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function pg_temp.exp_at(p_hours jsonb, p_tz text, p_now timestamptz)
returns timestamptz
language plpgsql
as $$
declare
  c_fallback constant timestamptz := p_now + interval '24 hours';
  c_keys     constant text[] := array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  v_now      timestamptz := p_now;
  v_hours    jsonb := p_hours;
  v_tz       text := p_tz;
  v_today    date;
  v_date     date;
  v_day      jsonb;
  v_open     time;
  v_close    time;
  v_end      timestamptz;
  v_result   timestamptz;
  v_i        int;
begin
  if v_hours is null or v_hours = '{}'::jsonb then
    return c_fallback;
  end if;

  begin
    v_tz    := coalesce(nullif(btrim(v_tz), ''), 'America/New_York');
    v_today := (v_now at time zone v_tz)::date;

    for v_i in -1..7 loop
      v_date := v_today + v_i;
      v_day  := v_hours -> c_keys[extract(dow from v_date)::int + 1];

      if v_day is null
         or coalesce((v_day ->> 'closed')::boolean, false)
         or v_day ->> 'open' is null
         or v_day ->> 'close' is null then
        if v_i = 0 then
          return c_fallback;
        end if;
        continue;
      end if;

      v_open  := (v_day ->> 'open')::time;
      v_close := (v_day ->> 'close')::time;

      if v_close <= v_open then
        v_end := ((v_date + 1) + v_close) at time zone v_tz;
      else
        v_end := (v_date + v_close) at time zone v_tz;
      end if;

      if v_i = -1 then
        if v_close <= v_open and v_end > v_now then
          v_result := v_end;
          exit;
        end if;
        continue;
      end if;

      if v_end > v_now then
        v_result := v_end;
        exit;
      end if;
    end loop;
  exception when others then
    return c_fallback;
  end;

  if v_result is null or v_result < v_now + interval '1 hour' then
    return c_fallback;
  end if;
  return v_result;
end;
$$;

-- La copia y la función real coinciden para Bar XZX con la hora de ahora (esperado: true).
select
  pg_temp.exp_at(b.hours, b.timezone, now()) is not distinct from public.venue_session_expires_at(b.id) as copia_igual_a_real
from public.businesses b
where b.slug = 'bar-xzx-omd2';

-- Casos. Horario de prueba: lun–jue 11:00–22:00 · vie y sáb 17:00–02:00 · domingo cerrado. Semana del 19 al 25 de
-- octubre de 2026 (todos los días en horario de verano, -04:00). "ahora" y "esperado" en America/New_York.
with h as (
  select '{"mon":{"open":"11:00","close":"22:00","closed":false},
           "tue":{"open":"11:00","close":"22:00","closed":false},
           "wed":{"open":"11:00","close":"22:00","closed":false},
           "thu":{"open":"11:00","close":"22:00","closed":false},
           "fri":{"open":"17:00","close":"02:00","closed":false},
           "sat":{"open":"17:00","close":"02:00","closed":false},
           "sun":{"closed":true}}'::jsonb as hours
),
casos (n, caso, ahora, hours_json, tz, esperado) as (
  select 1,  'lun 15:00 → cierra lun 22:00',                              timestamptz '2026-10-19 15:00-04', (select hours from h), 'America/New_York', timestamptz '2026-10-19 22:00-04' union all
  select 2,  'lun 08:00 (antes de abrir) → lun 22:00',                    timestamptz '2026-10-19 08:00-04', (select hours from h), 'America/New_York', timestamptz '2026-10-19 22:00-04' union all
  select 3,  'vie 20:00 → sáb 02:00',                                     timestamptz '2026-10-23 20:00-04', (select hours from h), 'America/New_York', timestamptz '2026-10-24 02:00-04' union all
  select 4,  'sáb 00:30 (aún en la jornada del viernes) → sáb 02:00',     timestamptz '2026-10-24 00:30-04', (select hours from h), 'America/New_York', timestamptz '2026-10-24 02:00-04' union all
  select 5,  'sáb 01:30 (faltan 30 min, menos de 1 h) → ahora + 24 h',    timestamptz '2026-10-24 01:30-04', (select hours from h), 'America/New_York', timestamptz '2026-10-24 01:30-04' + interval '24 hours' union all
  select 6,  'jue 23:00 (ya cerró) → cierre del viernes: sáb 02:00',      timestamptz '2026-10-22 23:00-04', (select hours from h), 'America/New_York', timestamptz '2026-10-24 02:00-04' union all
  select 7,  'sáb 20:00 → dom 02:00',                                     timestamptz '2026-10-24 20:00-04', (select hours from h), 'America/New_York', timestamptz '2026-10-25 02:00-04' union all
  select 8,  'dom 12:00 (domingo cerrado) → ahora + 24 h',                timestamptz '2026-10-25 12:00-04', (select hours from h), 'America/New_York', timestamptz '2026-10-25 12:00-04' + interval '24 hours' union all
  select 9,  'hours vacío → ahora + 24 h',                                timestamptz '2026-10-19 15:00-04', '{}'::jsonb,           'America/New_York', timestamptz '2026-10-19 15:00-04' + interval '24 hours' union all
  select 10, 'hora mal escrita → ahora + 24 h',                           timestamptz '2026-10-19 15:00-04', '{"mon":{"open":"xx","close":"22:00","closed":false}}'::jsonb, 'America/New_York', timestamptz '2026-10-19 15:00-04' + interval '24 hours' union all
  select 11, 'zona desconocida → ahora + 24 h',                           timestamptz '2026-10-19 15:00-04', (select hours from h), 'Nowhere/Land',      timestamptz '2026-10-19 15:00-04' + interval '24 hours'
)
select
  n, caso,
  ahora at time zone 'America/New_York'                                   as ahora_local,
  pg_temp.exp_at(hours_json, tz, ahora) at time zone 'America/New_York'   as resultado_local,
  esperado at time zone 'America/New_York'                                as esperado_local,
  pg_temp.exp_at(hours_json, tz, ahora) = esperado                        as ok
from casos
order by n;

-- Resumen (esperado: true).
with h as (
  select '{"mon":{"open":"11:00","close":"22:00","closed":false},"tue":{"open":"11:00","close":"22:00","closed":false},"wed":{"open":"11:00","close":"22:00","closed":false},"thu":{"open":"11:00","close":"22:00","closed":false},"fri":{"open":"17:00","close":"02:00","closed":false},"sat":{"open":"17:00","close":"02:00","closed":false},"sun":{"closed":true}}'::jsonb as hours
)
select
      pg_temp.exp_at((select hours from h), 'America/New_York', timestamptz '2026-10-19 15:00-04') = timestamptz '2026-10-19 22:00-04'
  and pg_temp.exp_at((select hours from h), 'America/New_York', timestamptz '2026-10-23 20:00-04') = timestamptz '2026-10-24 02:00-04'
  and pg_temp.exp_at((select hours from h), 'America/New_York', timestamptz '2026-10-24 00:30-04') = timestamptz '2026-10-24 02:00-04'
  and pg_temp.exp_at((select hours from h), 'America/New_York', timestamptz '2026-10-22 23:00-04') = timestamptz '2026-10-24 02:00-04'
  and pg_temp.exp_at((select hours from h), 'America/New_York', timestamptz '2026-10-24 20:00-04') = timestamptz '2026-10-25 02:00-04'
  as todos_los_casos_clave_ok;
