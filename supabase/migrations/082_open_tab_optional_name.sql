-- 082: abrir cuenta SIN pedir nombre. El mesero nunca pregunta "¿a nombre de quién?"
-- para abrir una cuenta — pulsa un botón y listo.
--
-- p_name pasa a ser OPCIONAL. Si no viene (o viene vacío), el nombre se GENERA.
-- Se mantiene la posibilidad de pasarlo: el día que se quiera renombrar o nombrar
-- a mano, la puerta sigue abierta y no hay que tocar la firma.
--
-- CRITERIO DE NOMBRADO: "Cuenta N" con el MENOR N >= 1 que no esté ya usado por
-- una cuenta NO CERRADA (status <> 'closed') de ESA mesa.
--   · No puede duplicar nombre entre las cuentas que el mesero ve ahora en la mesa,
--     que es lo único que necesita distinguir.
--   · Reutiliza huecos: si se cierra "Cuenta 1", el siguiente grupo vuelve a ser
--     "Cuenta 1". Los números se mantienen pequeños y describen la mesa AHORA, en
--     vez de crecer sin fin con el histórico.
--   · Un simple count(*)+1 sería un BUG: con "Cuenta 1" y "Cuenta 2" abiertas, al
--     cerrar la 1 quedaría count=1 → generaría "Cuenta 2", duplicando la que ya
--     está abierta.
--
-- CONCURRENCIA: el conteo va DESPUÉS del pg_advisory_xact_lock por mesa que ya
-- existía (079), así que dos meseros pulsando a la vez se serializan y no pueden
-- calcular el mismo número.
--
-- La columna name NO cambia: sigue NOT NULL con su CHECK de 1..40. Lo único que
-- cambia es que ya no se le exige al usuario.

begin;

create or replace function public.open_tab_on_table(p_table_id uuid, p_name text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_biz uuid;
  v_emp uuid;
  v_waiters int;
  v_tab_id uuid;
  v_claimed boolean := false;
  v_name text;
  v_live int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  -- El nombre ya NO es obligatorio. Si lo mandan, se valida como antes.
  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is not null and char_length(v_name) > 40 then
    raise exception 'NAME_TOO_LONG';
  end if;

  select t.business_id into v_biz
  from public.tables t
  where t.id = p_table_id and t.is_active = true;
  if v_biz is null then raise exception 'TABLE_NOT_FOUND'; end if;

  select e.id into v_emp
  from public.employees e
  where e.business_id = v_biz and e.user_id = v_uid and e.status = 'accepted';
  if v_emp is null then raise exception 'NOT_EMPLOYEE'; end if;

  -- Serializa por mesa: protege TANTO el reparto de la mesa como el número de cuenta.
  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));

  select count(*) into v_waiters
  from public.table_waiters w
  where w.table_id = p_table_id;

  if v_waiters = 0 then
    insert into public.table_waiters (table_id, employee_id)
    values (p_table_id, v_emp);
    v_claimed := true;
  elsif not public.is_waiter_of_table(p_table_id) then
    raise exception 'NOT_ASSIGNED';
  end if;

  -- Nombre generado (dentro del lock). El menor hueco libre entre las no cerradas.
  if v_name is null then
    select count(*) into v_live
    from public.table_tabs t
    where t.table_id = p_table_id and t.status <> 'closed';

    select 'Cuenta ' || n into v_name
    from generate_series(1, v_live + 1) as n
    where not exists (
      select 1 from public.table_tabs t
      where t.table_id = p_table_id
        and t.status <> 'closed'
        and t.name = 'Cuenta ' || n
    )
    order by n
    limit 1;
  end if;

  insert into public.table_tabs (table_id, name, created_by, kind, status)
  values (p_table_id, v_name, v_uid, 'waiter', 'open')
  returning id into v_tab_id;

  return jsonb_build_object(
    'tab_id', v_tab_id,
    'tab_name', v_name,
    'claimed_table', v_claimed
  );
end $$;

revoke execute on function public.open_tab_on_table(uuid, text) from public, anon;
grant execute on function public.open_tab_on_table(uuid, text) to authenticated;

commit;
