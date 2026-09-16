-- 167: Vale de conciliación por pago — Tab POS · F7 · D-41.
begin;

-- Datos del vale para un pago (solo staff del negocio). No expone nada de otros negocios.
create or replace function public.pos_payment_voucher(p_payment_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_biz uuid; v_out jsonb;
begin
  select pp.business_id into v_biz from public.pos_payments pp where pp.id = p_payment_id;
  if v_biz is null then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if not (public.pos_can_access(v_biz)
          or exists (select 1 from public.businesses b where b.id = v_biz and b.owner_id = auth.uid())) then
    raise exception 'NOT_ALLOWED';
  end if;
  select jsonb_build_object(
    'payment_id',      pp.id,
    'business_name',   b.name,
    'table_label',     coalesce(t.label, pp.table_id::text),
    'payment_method',  pp.payment_method,
    'source',          pp.source,
    'kind',            pp.kind,
    'amount_cents',    pp.amount_cents,
    'tip_cents',       coalesce(pp.tip_cents, 0),
    'total_cents',     pp.amount_cents + coalesce(pp.tip_cents, 0),
    'status',          pp.status,
    'receipt_code',    pp.receipt_code,
    'paid_at',         pp.updated_at,
    'session_opened_at', pp.session_opened_at,
    'waiter_name',     coalesce(e.receipt_display_name, u.display_name, 'Staff'),
    -- Para partes de split: posición y total de partes de la sesión (informativo)
    'split_index',     (select count(*) from public.pos_payments q
                         where q.table_id = pp.table_id and q.session_opened_at = pp.session_opened_at
                           and q.source = 'pos' and q.kind = pp.kind and q.status = 'succeeded' and q.updated_at <= pp.updated_at),
    'split_total',     (select count(*) from public.pos_payments q
                         where q.table_id = pp.table_id and q.session_opened_at = pp.session_opened_at
                           and q.source = 'pos' and q.kind = pp.kind and q.status in ('pending','processing','succeeded')),
    -- Ítems cubiertos (si el pago fue por ítems); vacío para pagos por monto
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', mi.name, 'qty', oi.qty, 'line_cents', oi.price_cents * oi.qty) order by oi.id)
      from public.order_items oi join public.menu_items mi on mi.id = oi.menu_item_id
      where pp.order_item_ids is not null and oi.id = any(pp.order_item_ids)
    ), '[]'::jsonb)
  ) into v_out
  from public.pos_payments pp
  join public.businesses b on b.id = pp.business_id
  left join public.tables t on t.id = pp.table_id
  left join public.employees e on e.user_id = pp.paid_by and e.business_id = pp.business_id
  left join public.users u on u.id = pp.paid_by
  where pp.id = p_payment_id;
  return v_out;
end $$;
revoke all on function public.pos_payment_voucher(uuid) from public, anon;
grant execute on function public.pos_payment_voucher(uuid) to authenticated;

commit;
