-- 084: settle_tab_payment — liquidar un tap de forma ATÓMICA (Cobro parte A).
--
-- Un cobro exitoso hace TRES escrituras: marca el tab_payment 'succeeded', sella
-- paid_at en todos los pedidos del tap, y cierra el tap si ya no queda saldo.
-- Desde una Edge Function eso serían tres llamadas PostgREST SIN transacción común:
-- si la segunda falla, el cobro queda 'succeeded' con pedidos sin sellar (dinero
-- cobrado que no cuenta como venta). Metiéndolo en UNA función todo va en una sola
-- transacción — o pasa entero o no pasa nada.
--
-- La usan las DOS vías (efectivo desde payments, tarjeta desde el webhook), así que
-- la liquidación no se duplica. Solo service_role la ejecuta (vía EF).

begin;

create or replace function public.settle_tab_payment(p_tab_payment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_tab    uuid;
  v_status text;
  v_due    int;
begin
  -- Bloquea la fila del cobro: serializa reintentos/entregas concurrentes del
  -- mismo pago y hace la comprobación de idempotencia segura.
  select tab_id, status into v_tab, v_status
  from public.tab_payments
  where id = p_tab_payment_id
  for update;

  if v_tab is null then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  -- Idempotente: si ya se liquidó, no repite nada (Stripe reenvía eventos).
  if v_status = 'succeeded' then
    return jsonb_build_object('already_settled', true, 'tab_id', v_tab);
  end if;

  -- 1) el cobro pasa a 'succeeded'
  update public.tab_payments
  set status = 'succeeded', paid_at = now()
  where id = p_tab_payment_id;

  -- 2) sella paid_at en los pedidos del tap aún sin pagar → ahora SÍ son venta
  update public.orders
  set paid_at = now()
  where tab_id = v_tab
    and paid_at is null
    and status not in ('cancelled', 'refunded');

  -- 3) ¿queda saldo? Si no, el tap queda 'paid'; si sí (cobro parcial), sigue 'open'
  select coalesce(sum(o.total_cents), 0) into v_due
  from public.orders o
  where o.tab_id = v_tab
    and o.paid_at is null
    and o.status not in ('cancelled', 'refunded');

  if v_due = 0 then
    update public.table_tabs
    set status = 'paid', paid_at = now()
    where id = v_tab and status = 'open';
  end if;

  return jsonb_build_object('settled', true, 'remaining_due_cents', v_due, 'tab_id', v_tab);
end $$;

revoke execute on function public.settle_tab_payment(uuid) from public, anon, authenticated;
grant  execute on function public.settle_tab_payment(uuid) to service_role;

commit;
