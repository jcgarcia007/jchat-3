-- 079: opening a tab on an UNASSIGNED table claims it for the waiter (option C,
-- Juan's decision 2026-07-20). Reverses the earlier "no implicit assignment" rule
-- in docs/TERMINAL_MESERO.md.
--
-- Why an RPC: two writes the waiter cannot do from the client —
--   1. table_tabs INSERT requires is_waiter_of_table (policy 071), which is FALSE
--      on an unassigned table.
--   2. table_waiters is written only by owner/admin (policy 070) — a waiter can't
--      assign themselves.
-- Both need elevated rights + must happen atomically, so this is a SECURITY
-- DEFINER function (same pattern as attach_order_to_tab 072). The table_tabs
-- INSERT policy is NOT loosened — it stays waiter-only, and this RPC is the
-- sanctioned path, exactly as the customer-tap flow works.
--
-- business_id: NOT passed on either insert. The set_tab_business_id() trigger (070)
-- fires before insert on BOTH table_tabs and table_waiters and fills business_id
-- from table_id — passing it would be overwritten anyway.

begin;

create or replace function public.open_tab_on_table(p_table_id uuid, p_name text)
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
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'NAME_REQUIRED'; end if;
  if char_length(btrim(p_name)) > 40 then raise exception 'NAME_TOO_LONG'; end if;

  select t.business_id into v_biz
  from public.tables t
  where t.id = p_table_id and t.is_active = true;
  if v_biz is null then raise exception 'TABLE_NOT_FOUND'; end if;

  -- Must be an ACCEPTED employee of that business.
  select e.id into v_emp
  from public.employees e
  where e.business_id = v_biz and e.user_id = v_uid and e.status = 'accepted';
  if v_emp is null then raise exception 'NOT_EMPLOYEE'; end if;

  -- Serialize concurrent claims on THIS table so two waiters can't both read
  -- "0 assigned" and both claim it (atomicity, transaction-scoped).
  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));

  select count(*) into v_waiters
  from public.table_waiters w
  where w.table_id = p_table_id;

  if v_waiters = 0 then
    -- Unassigned table: the first employee to open a tab CLAIMS it.
    insert into public.table_waiters (table_id, employee_id)
    values (p_table_id, v_emp);
    v_claimed := true;
  elsif not public.is_waiter_of_table(p_table_id) then
    raise exception 'NOT_ASSIGNED';
  end if;

  insert into public.table_tabs (table_id, name, created_by, kind, status)
  values (p_table_id, btrim(p_name), v_uid, 'waiter', 'open')
  returning id into v_tab_id;

  return jsonb_build_object('tab_id', v_tab_id, 'claimed_table', v_claimed);
end $$;

revoke execute on function public.open_tab_on_table(uuid, text) from public, anon;
grant execute on function public.open_tab_on_table(uuid, text) to authenticated;

commit;
