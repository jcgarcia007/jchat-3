-- 126_pos_sale_stock_depletion.sql
-- Inventario perpetuo (Fase A1): pos_create_order descuenta stock al ENVIAR A COCINA.
-- YA APLICADO A PRODUCCIÓN por Planning Claude (MCP, 2026-08-17). Solo control de versiones.
-- CREATE OR REPLACE = idempotente. NO re-aplicar manualmente a prod.

CREATE OR REPLACE FUNCTION public.pos_create_order(p_business_id uuid, p_table_id uuid, p_items jsonb, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid         uuid := auth.uid();
  v_emp         public.employees;
  v_has_pos     boolean;
  v_order_id    uuid;
  v_subtotal    bigint := 0;
  v_item        jsonb;
  v_mi_id       uuid;
  v_qty         integer;
  v_base        integer;
  v_unit        integer;
  v_upcharge    integer;
  v_options     jsonb;
  v_mod         jsonb;
  v_group_id    uuid;
  v_grp         record;
  v_label       text;
  v_choice      jsonb;
  v_found       boolean;
  v_cnt         integer;
  v_table_label text;
begin
  select e.* into v_emp
  from public.employees e
  where e.user_id = v_uid and e.business_id = p_business_id and e.status = 'accepted'
  limit 1;
  if not found then raise exception 'not an active employee of this business'; end if;

  select coalesce((cr.permissions->>'pos_access')::boolean, false) into v_has_pos
  from public.custom_roles cr where cr.id = v_emp.custom_role_id;
  if not coalesce(v_has_pos, false) then raise exception 'no pos access'; end if;

  if p_table_id is not null then
    select t.label into v_table_label
    from public.tables t
    where t.id = p_table_id and t.business_id = p_business_id;
    if not found then raise exception 'table not in this business'; end if;
  end if;

  insert into public.orders
    (business_id, table_id, table_label, order_type, status, taken_by, notes)
  values
    (p_business_id, p_table_id, v_table_label, 'table', 'preparing', v_uid, p_notes)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_mi_id := (v_item->>'menu_item_id')::uuid;
    v_qty   := greatest(coalesce((v_item->>'qty')::integer, 1), 1);

    select mi.price_cents into v_base
    from public.menu_items mi
    where mi.id = v_mi_id and mi.business_id = p_business_id and mi.is_available = true;
    if not found then raise exception 'menu item % not available', v_mi_id; end if;

    v_upcharge := 0;
    v_options  := coalesce(v_item->'options', '{}'::jsonb);

    -- Modificadores (opcional): validar y sumar recargos SERVER-SIDE.
    if v_options ? 'modifiers' then
      for v_mod in select * from jsonb_array_elements(v_options->'modifiers')
      loop
        v_group_id := (v_mod->>'group_id')::uuid;

        if not exists (
          select 1 from public.menu_item_modifier_groups l
          where l.menu_item_id = v_mi_id and l.modifier_group_id = v_group_id
        ) then
          raise exception 'modifier group % not linked to item', v_group_id;
        end if;

        select mg.type, mg.min_select, mg.max_select, mg.choices
          into v_grp
        from public.modifier_groups mg
        where mg.id = v_group_id and mg.business_id = p_business_id;
        if not found then raise exception 'modifier group % not found', v_group_id; end if;

        v_cnt := coalesce(jsonb_array_length(v_mod->'choice_labels'), 0);
        if v_cnt < v_grp.min_select or v_cnt > v_grp.max_select then
          raise exception 'invalid selection count for group %', v_group_id;
        end if;

        for v_label in select jsonb_array_elements_text(v_mod->'choice_labels')
        loop
          v_found := false;
          for v_choice in select * from jsonb_array_elements(v_grp.choices)
          loop
            if (v_choice->>'label') = v_label then
              v_upcharge := v_upcharge + coalesce((v_choice->>'price_cents')::integer, 0);
              v_found := true;
              exit;
            end if;
          end loop;
          if not v_found then raise exception 'invalid choice % for group %', v_label, v_group_id; end if;
        end loop;
      end loop;
    end if;

    v_unit := v_base + v_upcharge;

    insert into public.order_items
      (order_id, menu_item_id, qty, price_cents, options, special_instructions, seat)
    values
      (v_order_id, v_mi_id, v_qty, v_unit, v_options,
       nullif(v_item->>'special_instructions',''),
       (v_item->>'seat')::integer);

    -- Inventario perpetuo: al ENVIAR A COCINA descontar stock del producto vendido.
    -- Solo si el producto se rastrea (stock_count no nulo). Registra el movimiento con autor.
    -- El on-hand hace clamp a 0; el movimiento registra la cantidad vendida completa (uso teorico).
    update public.menu_items
       set stock_count = greatest(0, stock_count - v_qty)
     where id = v_mi_id and business_id = p_business_id and stock_count is not null;
    if found then
      insert into public.stock_movements (menu_item_id, business_id, delta, reason, created_by)
      values (v_mi_id, p_business_id, -v_qty, 'sale', v_uid);
    end if;

    v_subtotal := v_subtotal + (v_unit::bigint * v_qty);
  end loop;

  if v_subtotal = 0 then raise exception 'order has no valid items'; end if;

  update public.orders
  set subtotal_cents = v_subtotal, total_cents = v_subtotal
  where id = v_order_id;

  insert into public.notifications (user_id, type, payload)
  select distinct e2.user_id, 'pos_order_assist',
    jsonb_build_object(
      'order_id', v_order_id, 'table_id', p_table_id,
      'table_label', v_table_label, 'helper_user_id', v_uid, 'business_id', p_business_id
    )
  from public.table_waiters tw
  join public.employees e2 on e2.id = tw.employee_id
  where tw.table_id = p_table_id and tw.business_id = p_business_id
    and e2.user_id <> v_uid;

  return v_order_id;
end;
$function$;
