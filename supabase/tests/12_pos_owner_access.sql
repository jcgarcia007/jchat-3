-- @apply 260_pos_owner_access.sql
-- pos_owner_access (260): the owner of a venue gets the POS of that venue without being an employee; everybody else keeps today's rules.
-- The draft migration is applied inside this rolled-back transaction by the line above.
do $t$
declare
  biz constant uuid := pg_temp.seed_venue();                       -- owned by user 1, no employees
  owner_id constant uuid := pg_temp.uid(1);
  u3 uuid := pg_temp.seed_user(3);                                  -- nobody
  u4 uuid := pg_temp.seed_user(4);                                  -- accepted employee WITHOUT pos_access
  u5 uuid := pg_temp.seed_user(5);                                  -- owner of ANOTHER venue (and employee with pos_access there)
  u6 uuid := pg_temp.seed_user(6);                                  -- accepted employee WITH pos_access
  biz2 constant uuid := '20000000-0000-4000-8000-000000000001';
  role_no uuid; role_yes uuid; role_yes2 uuid;
  tbl uuid; item constant uuid := '10000000-0000-4000-8000-0000000000b1';
  items jsonb; r jsonb; n int; ok boolean; v_order uuid; v_taken uuid; v_paid uuid;
begin
  if to_regprocedure('public.pos_my_businesses()') is null then
    perform pg_temp.t_skip('pos_owner_access', 'POS functions not present in this database');
    return;
  end if;

  -- seeds (as postgres): a second venue owned by u5, roles, employees, an external-payment venue, one table
  set local session_replication_role = replica;
  insert into public.businesses (id, owner_id, name, slug, lat, lng) values (biz2, u5, 'Other Venue', 'other-venue-sql-test', 41.0, -75.0);
  set local session_replication_role = origin;
  insert into public.custom_roles (business_id, name, permissions) values (biz, 'no pos', '{"pos_access": false}') returning id into role_no;
  insert into public.custom_roles (business_id, name, permissions) values (biz, 'with pos', '{"pos_access": true}') returning id into role_yes;
  insert into public.custom_roles (business_id, name, permissions) values (biz2, 'with pos', '{"pos_access": true}') returning id into role_yes2;
  set local session_replication_role = replica;   -- the plan-limit trigger (enforce_employee_plan_limit) would refuse employees on a plan with none
  insert into public.employees (business_id, user_id, role, status, custom_role_id) values (biz, u4, 'staff', 'accepted', role_no), (biz, u6, 'staff', 'accepted', role_yes), (biz2, u5, 'staff', 'accepted', role_yes2);
  set local session_replication_role = origin;
  update public.businesses set pos_payment_mode = 'external' where id = biz;
  select id into tbl from public.tables where business_id = biz order by sort limit 1;
  if tbl is null then
    insert into public.tables (business_id, label, sort) values (biz, '1', 1) returning id into tbl;
  end if;
  items := jsonb_build_array(jsonb_build_object('menu_item_id', item, 'qty', 2));

  -- (a) the owner of a venue with NO employees: access, the venue in pos_my_businesses (role owner, employee_id NULL), and a PIN
  perform pg_temp.as_user(owner_id);
  perform pg_temp.t_ok(public.pos_can_access(biz) is true, 'owner without employees → pos_can_access');
  select count(*) into n from public.pos_my_businesses() where business_id = biz and role = 'owner' and employee_id is null and has_pin = false;
  perform pg_temp.t_ok(n = 1, 'owner: the venue is in pos_my_businesses (role owner, employee_id NULL, no pin yet)');
  perform public.pos_set_pin(biz, '1234');
  select count(*) into n from public.pos_my_businesses() where business_id = biz and has_pin = true;
  perform pg_temp.t_ok(n = 1, 'owner: after pos_set_pin, has_pin = true');
  perform pg_temp.t_ok(public.pos_verify_pin(biz, '1234') is true, 'owner: pos_verify_pin with the right pin → true');
  perform pg_temp.t_ok(public.pos_verify_pin(biz, '9999') is false, 'owner: pos_verify_pin with a wrong pin → false');
  perform pg_temp.as_service();

  -- (b) nobody (neither employee nor owner)
  perform pg_temp.as_user(u3);
  perform pg_temp.t_ok(public.pos_can_access(biz) is false, 'a person who is neither employee nor owner → no pos_can_access');
  perform pg_temp.t_raises(format('select public.pos_set_pin(%L, ''1234'')', biz), 'no pos access', 'a stranger cannot set a pin (no pos access)');
  select count(*) into n from public.pos_my_businesses();
  perform pg_temp.t_ok(n = 0, 'a stranger sees no venue in pos_my_businesses');
  perform pg_temp.as_service();

  -- (c) accepted employee WITHOUT pos_access
  perform pg_temp.as_user(u4);
  perform pg_temp.t_ok(public.pos_can_access(biz) is false, 'an accepted employee without pos_access → no access');
  perform pg_temp.t_raises(format('select public.pos_set_pin(%L, ''1234'')', biz), 'no pos access', 'an employee without pos_access cannot set a pin');
  perform pg_temp.t_raises(format('select public.pos_create_order(%L, %L, %L::jsonb)', biz, tbl, items::text), 'no pos access', 'pos_create_order: an employee without pos_access is still refused');
  perform pg_temp.as_service();

  -- (d) the owner of ANOTHER venue does not get this one
  perform pg_temp.as_user(u5);
  perform pg_temp.t_ok(public.pos_can_access(biz) is false, 'the owner of another venue → no access to this one');
  perform pg_temp.t_raises(format('select public.pos_create_order(%L, %L, %L::jsonb)', biz, tbl, items::text), 'not an active employee', 'pos_create_order: the owner of another venue is refused here');
  -- owner AND employee with pos_access of the same venue: ONE row (no duplicates)
  select count(*) into n from public.pos_my_businesses() where business_id = biz2;
  perform pg_temp.t_ok(n = 1, 'an owner who is also an employee with pos_access appears once');
  select count(*) into n from public.pos_my_businesses() where business_id = biz2 and employee_id is not null and role = 'staff';
  perform pg_temp.t_ok(n = 1, 'that single row is the employee row');
  perform pg_temp.as_service();

  -- (e) an employee WITH pos_access: nothing changes (regression)
  perform pg_temp.as_user(u6);
  perform pg_temp.t_ok(public.pos_can_access(biz) is true, 'an employee with pos_access still has access');
  select count(*) into n from public.pos_my_businesses() where business_id = biz and employee_id is not null;
  perform pg_temp.t_ok(n = 1, 'the employee still appears with an employee_id');
  perform pg_temp.as_service();

  -- (f) the owner creates an order: attributed to the owner's user id, no employee row needed
  perform pg_temp.as_user(owner_id);
  v_order := public.pos_create_order(biz, tbl, items, 'owner test order');
  perform pg_temp.as_service();
  select taken_by into v_taken from public.orders where id = v_order;
  perform pg_temp.t_ok(v_order is not null and v_taken = owner_id, 'pos_create_order by the owner: orders.taken_by = the owner''s user id', coalesce(v_taken::text, 'null'));

  -- (g) the owner collects it (external payment): pos_payments.paid_by = the owner
  perform pg_temp.as_user(owner_id);
  r := public.pos_apply_external_payment(biz, tbl, 'cash', 0, null);
  perform pg_temp.as_service();
  select paid_by into v_paid from public.pos_payments where business_id = biz and table_id = tbl and status = 'succeeded' order by created_at desc limit 1;
  perform pg_temp.t_ok(v_paid = owner_id, 'the owner''s payment: pos_payments.paid_by = the owner''s user id', coalesce(v_paid::text, r::text));

  -- (h) KDS metrics list the owner as a waiter (by taken_by)
  perform pg_temp.as_user(owner_id);
  r := public.pos_kds_metrics_v2(biz, now() - interval '1 day', now() + interval '1 day', null, null, 'America/New_York');
  perform pg_temp.as_service();
  perform pg_temp.t_ok(position(owner_id::text in r::text) > 0, 'pos_kds_metrics_v2 returns the owner''s order (by_waiter has the owner''s user id)');

  -- (i) receipts: the owner sees the collection, a stranger cannot read receipts
  perform pg_temp.as_user(owner_id);
  select count(*) into n from public.pos_receipts_today(biz) where paid_by = owner_id;
  perform pg_temp.t_ok(n >= 1, 'pos_receipts_today lists the owner''s payment for the owner', n::text);
  perform pg_temp.as_service();
  perform pg_temp.as_user(u3);
  perform pg_temp.t_raises(format('select * from public.pos_receipts_today(%L)', biz), 'no access', 'pos_receipts_today: a stranger is refused');
  perform pg_temp.as_service();

  -- (j) pos_tables_overview answers for the owner (no employee row → v_emp_id is NULL)
  perform pg_temp.as_user(owner_id);
  select count(*) into n from public.pos_tables_overview(biz);
  perform pg_temp.t_ok(n >= 1, 'pos_tables_overview answers for the owner without an employee row', n::text);
  select count(*) into n from public.pos_tables_overview(biz) where assignment = 'mine';
  perform pg_temp.t_ok(n = 0, 'the owner has no "mine" tables (nothing is assigned to someone who is not an employee)');
  perform pg_temp.as_service();

  -- (k) no side effects: no employees row and no table_waiters row for the owner
  select count(*) into n from public.employees where user_id = owner_id;
  perform pg_temp.t_ok(n = 0, 'no employees row was created for the owner');
  select count(*) into n from public.table_waiters tw join public.employees e on e.id = tw.employee_id where e.user_id = owner_id;
  perform pg_temp.t_ok(n = 0, 'no table_waiters row was created for the owner');

  -- (l) an unauthenticated session has no access at all
  perform pg_temp.as_service();
  perform pg_temp.t_ok(coalesce(public.pos_can_access(biz), false) is false, 'no session (auth.uid() NULL) → no access');
end
$t$;
