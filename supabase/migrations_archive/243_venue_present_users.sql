-- 243: venue_present_users — de una lista de personas (la del realtime presence de la sala), cuáles siguen CONFIRMADAS en el local.
-- BORRADOR PARA REVISIÓN: NO está aplicada en Supabase. La aplica Juan Carlos (le pone el número definitivo, SQL Editor / MCP).
-- Reversión: supabase/rollbacks/243_venue_present_users_rollback.sql · Comprobación: supabase/scripts/243_check.sql
--
-- POR QUÉ: la cabecera de la sala ("N people here" + avatares) sale del realtime presence, que lo publica cada dispositivo y no se
-- retira en segundo plano; el botón Regalar sale de gift_available, que exige room_geo_presence VIGENTE (caduca a los 10 min) para los
-- dos. Alguien con la presencia de geo caducada seguía en la cabecera y no se le podía regalar. Esta función deja que la app filtre
-- esa lista con el reloj del SERVIDOR, aunque el dispositivo del otro esté dormido.
--
-- PRIVACIDAD (norma de Apple y Google: nadie revela dónde está otra persona más allá de lo que la lista ya muestra):
--   · Solo responde a quien está confirmado en ESE mismo local (venue_presence_ok del que pregunta). Desde fuera, o con la presencia
--     caducada, devuelve un array vacío: no se puede averiguar desde fuera si alguien está en un local.
--   · Solo DEVUELVE ids que el que pregunta ya mandó: es un filtro (quita nombres), nunca añade a nadie ni devuelve coordenadas ni
--     tiempos. Un id que no está en la lista de entrada no puede aparecer en la salida.
--   · Aplica la misma regla de bloqueos que gift_available: quien tiene un bloqueo con el que pregunta (en cualquier sentido) no
--     sale, ni siquiera si está presente.
--   · Máx. 100 ids por llamada (el resto se corta) y sin duplicados.
--
-- Solo lectura (no escribe nada), idempotente: create or replace + grants repetibles. Sin tablas ni columnas nuevas.

create or replace function public.venue_present_users(p_business_id uuid, p_user_ids uuid[])
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_business_id is null or p_user_ids is null then
    return '{}'::uuid[];
  end if;

  -- Quien pregunta tiene que estar presente en este mismo local: si no, nadie puede usar la función para sondear un local.
  if not public.venue_presence_ok(p_business_id, v_uid) then
    return '{}'::uuid[];
  end if;

  return coalesce((
    select array_agg(c.id)
    from (
      select distinct x.id
      from unnest(p_user_ids[1:100]) as x(id)  -- como mucho 100 (se corta el resto) y sin duplicados
      where x.id is not null
    ) c
    where public.venue_presence_ok(p_business_id, c.id)
      and not exists (  -- misma regla que gift_available: sin bloqueo en ningún sentido con quien pregunta
        select 1 from public.blocks b
        where (b.blocker_id = v_uid and b.blocked_id = c.id) or (b.blocker_id = c.id and b.blocked_id = v_uid)
      )
  ), '{}'::uuid[]);
end;
$$;

comment on function public.venue_present_users(uuid, uuid[]) is
  'Filtro de la lista de la sala: de los ids dados (máx. 100), los que tienen presencia de geo vigente en el local y ningún bloqueo con quien pregunta. Vacío si quien pregunta no está presente en el local. Nunca devuelve un id que no se le haya pasado.';

revoke all on function public.venue_present_users(uuid, uuid[]) from public, anon;
grant execute on function public.venue_present_users(uuid, uuid[]) to authenticated;
