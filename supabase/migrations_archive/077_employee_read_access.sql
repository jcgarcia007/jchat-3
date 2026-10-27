-- 077: employee READ access (B6 PASO 1). Without this the waiter terminal is empty.
--
-- Business rule (D-60, docs/TERMINAL_MESERO.md): a waiter sees THEIR assigned
-- tables + the UNASSIGNED tables of their business — never tables assigned to
-- other waiters. Read-only in this batch (no insert/update/delete for employees).
--
-- The owner/admin/customer policies are UNTOUCHED; these SELECT policies ADD to
-- them (RLS combines by OR). businesses already has a public-read SELECT policy,
-- so an employee can already read their business row — no new policy there.
--
-- The helpers are SECURITY DEFINER (like is_waiter_of_table, 070): they are
-- called FROM policies on the same tables they query, so without SECURITY
-- DEFINER (which bypasses RLS) they would recurse infinitely.

begin;

-- a) accepted employee of a business?
create or replace function public.is_employee_of_business(p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees e
    where e.business_id = p_business_id
      and e.user_id = auth.uid()
      and e.status = 'accepted'
  );
$$;

-- b) can this employee SEE this table? (the business rule)
--    accepted employee of the table's business AND (assigned to it OR it has no
--    waiter assigned at all). "unassigned" = no table_waiters row for the table.
create or replace function public.can_employee_see_table(p_table_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tables t
    where t.id = p_table_id
      and public.is_employee_of_business(t.business_id)
      and (
        public.is_waiter_of_table(t.id)
        or not exists (select 1 from public.table_waiters tw where tw.table_id = t.id)
      )
  );
$$;

revoke execute on function public.is_employee_of_business(uuid) from public, anon;
revoke execute on function public.can_employee_see_table(uuid) from public, anon;
grant execute on function public.is_employee_of_business(uuid) to authenticated;
grant execute on function public.can_employee_see_table(uuid) to authenticated;

-- ── SELECT policies (add-only; owner/admin/customer stay intact) ─────────────

create policy "tables: employee read own/unassigned"
  on public.tables for select to authenticated
  using (public.can_employee_see_table(id));

-- An order reaches a visible table either directly (table_id, C2 customer QR) or
-- through a tab (tab_id). Orders with neither (counter, mobile) stay hidden.
create policy "orders: employee read for visible tables"
  on public.orders for select to authenticated
  using (
    (table_id is not null and public.can_employee_see_table(table_id))
    or (tab_id is not null and exists (
          select 1 from public.table_tabs tt
          where tt.id = orders.tab_id
            and public.can_employee_see_table(tt.table_id)))
  );

-- order_items: same criterion, reached via the item's order (mirrors the shape
-- of "order_items: read via order").
create policy "order_items: employee read via visible order"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (
          (o.table_id is not null and public.can_employee_see_table(o.table_id))
          or (o.tab_id is not null and exists (
                select 1 from public.table_tabs tt
                where tt.id = o.tab_id
                  and public.can_employee_see_table(tt.table_id)))
        )
    )
  );

commit;
