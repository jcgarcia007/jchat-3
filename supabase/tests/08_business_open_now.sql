-- business_is_open_now (257): is the venue open at an instant, from businesses.hours read in businesses.timezone. Same cases as
-- mobile/scripts/hours-timezone.test.mjs (the app and the database must agree). 2026-01-07 is a WEDNESDAY, in winter (New York = UTC-5).
do $t$
declare
  biz constant uuid := pg_temp.seed_venue();
  keys text[] := array['sun','mon','tue','wed','thu','fri','sat'];
  h jsonb;
  closed_all jsonb;
  all_day jsonb;
  -- local New York wall-clock instants
  wed_0859 timestamptz := timestamp '2026-01-07 08:59' at time zone 'America/New_York';
  wed_0900 timestamptz := timestamp '2026-01-07 09:00' at time zone 'America/New_York';
  wed_1400 timestamptz := timestamp '2026-01-07 14:00' at time zone 'America/New_York';
  wed_1700 timestamptz := timestamp '2026-01-07 17:00' at time zone 'America/New_York';
  wed_1800 timestamptz := timestamp '2026-01-07 18:00' at time zone 'America/New_York';
  wed_2159 timestamptz := timestamp '2026-01-07 21:59' at time zone 'America/New_York';
  wed_2300 timestamptz := timestamp '2026-01-07 23:00' at time zone 'America/New_York';
  thu_0100 timestamptz := timestamp '2026-01-08 01:00' at time zone 'America/New_York';
  thu_0200 timestamptz := timestamp '2026-01-08 02:00' at time zone 'America/New_York';
  wed_0300 timestamptz := timestamp '2026-01-07 03:00' at time zone 'America/New_York';
  wed_2359 timestamptz := timestamp '2026-01-07 23:59' at time zone 'America/New_York';
  tue_2200_ny timestamptz := timestamp '2026-01-06 22:00' at time zone 'America/New_York';   -- = Wed 12:00 in Tokyo
begin
  if to_regprocedure('public.business_is_open_now(uuid,timestamptz)') is null then
    perform pg_temp.t_skip('business_is_open_now', 'migration 257 not applied in this database');
    return;
  end if;

  select jsonb_object_agg(x, '{"open":"09:00","close":"17:00"}'::jsonb) into h from unnest(keys) x;
  select jsonb_object_agg(x, '{"closed":true}'::jsonb) into closed_all from unnest(keys) x;
  update public.businesses set timezone = 'America/New_York' where id = biz;

  -- 1. open / closed inside one day (09:00–17:00; the closing minute is closed)
  update public.businesses set hours = h where id = biz;
  perform pg_temp.t_ok(public.business_is_open_now(biz, wed_1400) is true,  'open at 14:00');
  perform pg_temp.t_ok(public.business_is_open_now(biz, wed_0900) is true,  'open at the opening minute 09:00');
  perform pg_temp.t_ok(public.business_is_open_now(biz, wed_0859) is false, 'closed at 08:59');
  perform pg_temp.t_ok(public.business_is_open_now(biz, wed_1700) is false, 'closed at the closing minute 17:00');
  perform pg_temp.t_ok(public.business_is_open_now(biz, wed_1800) is false, 'closed at 18:00');

  -- 2. across midnight: Wed 22:00–02:00 is open Wed 23:00 and Thu 01:00, closed Thu 02:00 (Thursday is closed) and Wed 21:59
  update public.businesses set hours = jsonb_set(closed_all, array['wed'], '{"open":"22:00","close":"02:00"}') where id = biz;
  perform pg_temp.t_ok(public.business_is_open_now(biz, wed_2300) is true,  'overnight shift: open Wed 23:00');
  perform pg_temp.t_ok(public.business_is_open_now(biz, thu_0100) is true,  'overnight shift: still open Thu 01:00');
  perform pg_temp.t_ok(public.business_is_open_now(biz, thu_0200) is false, 'overnight shift: closed Thu 02:00');
  perform pg_temp.t_ok(public.business_is_open_now(biz, wed_2159) is false, 'overnight shift: closed Wed 21:59');

  -- 3. all day (00:00–23:59)
  update public.businesses set hours = jsonb_set(closed_all, array['wed'], '{"open":"00:00","close":"23:59"}') where id = biz;
  perform pg_temp.t_ok(public.business_is_open_now(biz, wed_0300) is true, 'all day: open at 03:00');
  perform pg_temp.t_ok(public.business_is_open_now(biz, wed_2359) is true, 'all day: open at 23:59');

  -- 4. a closed day
  update public.businesses set hours = closed_all where id = biz;
  perform pg_temp.t_ok(public.business_is_open_now(biz, wed_1400) is false, 'day marked closed → closed');

  -- 5. unknown hours → NULL (nothing is blocked)
  update public.businesses set hours = '{}' where id = biz;
  perform pg_temp.t_ok(public.business_is_open_now(biz, wed_1400) is null, 'empty hours → NULL');
  update public.businesses set hours = jsonb_set(h, array['wed'], '{"open":"9am","close":"5pm"}') where id = biz;
  perform pg_temp.t_ok(public.business_is_open_now(biz, wed_1400) is null, 'unreadable times → NULL');
  update public.businesses set hours = jsonb_set(h, array['wed'], '{"open":"10:00","close":"10:00"}') where id = biz;
  perform pg_temp.t_ok(public.business_is_open_now(biz, wed_1400) is null, 'open = close → NULL');
  update public.businesses set hours = '"not an object"'::jsonb where id = biz;
  perform pg_temp.t_ok(public.business_is_open_now(biz, wed_1400) is null, 'hours that are not an object → NULL');
  perform pg_temp.t_ok(public.business_is_open_now('99999999-0000-4000-8000-000000000000', wed_1400) is null, 'unknown business → NULL');

  -- 6. the venue's zone, not the server's: the same instant is Tue 22:00 in New York (closed) and Wed 12:00 in Tokyo (open)
  update public.businesses set hours = h, timezone = 'America/New_York' where id = biz;
  perform pg_temp.t_ok(public.business_is_open_now(biz, tue_2200_ny) is false, 'New York at Tue 22:00 → closed');
  update public.businesses set timezone = 'Asia/Tokyo' where id = biz;
  perform pg_temp.t_ok(public.business_is_open_now(biz, tue_2200_ny) is true, 'same instant in Tokyo (Wed 12:00) → open');
  update public.businesses set timezone = '' where id = biz;
  perform pg_temp.t_ok(public.business_is_open_now(biz, tue_2200_ny) is false, 'blank timezone → America/New_York');
  update public.businesses set timezone = 'Mars/Phobos' where id = biz;
  perform pg_temp.t_ok(public.business_is_open_now(biz, tue_2200_ny) is null, 'unknown timezone → NULL (not blocked)');

  -- 7. orders: a closed venue rejects with venue_closed (P0001); POS and staff are not blocked; unknown hours is not blocked
  update public.businesses set timezone = 'America/New_York', hours = closed_all where id = biz;
  perform pg_temp.t_raises(format('select public.assert_venue_order_allowed(%L, %L, ''dine_in'', 40.0, -74.0, ''customer_stripe'', null)', biz, pg_temp.uid(2)),
    'venue_closed', 'assert_venue_order_allowed: closed venue → venue_closed');
  begin
    perform public.assert_venue_order_allowed(biz, pg_temp.uid(2), 'dine_in', 40.0, -74.0, 'pos_waiter', pg_temp.uid(1));
    perform pg_temp.t_ok(true, 'assert_venue_order_allowed: a POS order (taken_by) is not blocked by a closed venue');
  exception when others then
    perform pg_temp.t_ok(false, 'assert_venue_order_allowed: a POS order (taken_by) is not blocked by a closed venue', sqlerrm);
  end;
  begin
    perform public.assert_venue_order_allowed(biz, pg_temp.uid(1), 'dine_in', 40.0, -74.0, 'customer_stripe', null);
    perform pg_temp.t_ok(true, 'assert_venue_order_allowed: the owner (staff) is not blocked by a closed venue');
  exception when others then
    perform pg_temp.t_ok(false, 'assert_venue_order_allowed: the owner (staff) is not blocked by a closed venue', sqlerrm);
  end;
  -- unknown hours: not blocked. Inside the venue (its own coordinates) the order passes; far away the golden rule answers outside_venue, never venue_closed
  update public.businesses set hours = '{}' where id = biz;
  begin
    perform public.assert_venue_order_allowed(biz, pg_temp.uid(2), 'dine_in', 40.0, -74.0, 'customer_stripe', null);
    perform pg_temp.t_ok(true, 'assert_venue_order_allowed: unknown hours inside the venue → not blocked');
  exception when others then
    perform pg_temp.t_ok(false, 'assert_venue_order_allowed: unknown hours inside the venue → not blocked', sqlerrm);
  end;
  perform pg_temp.t_raises(format('select public.assert_venue_order_allowed(%L, %L, ''dine_in'', 10.0, 10.0, ''customer_stripe'', null)', biz, pg_temp.uid(2)),
    'outside_venue', 'assert_venue_order_allowed: unknown hours far away → outside_venue (the golden rule), not venue_closed');

  -- 8. create_paid_order: an UNPAID order to a closed venue is rejected; one that is already charged (stripe_pi_id) never is
  update public.businesses set hours = closed_all where id = biz;
  perform pg_temp.t_raises(
    format('select * from public.create_paid_order(jsonb_build_object(''business_id'', %L, ''order_type'', ''counter''), jsonb_build_array(jsonb_build_object(''menu_item_id'', ''10000000-0000-4000-8000-0000000000b1'', ''qty'', 1, ''price_cents'', 500)))', biz),
    'venue_closed', 'create_paid_order: an unpaid order to a closed venue → venue_closed');
  begin
    perform * from public.create_paid_order(
      jsonb_build_object('business_id', biz, 'order_type', 'counter', 'stripe_pi_id', 'pi_test_257', 'total_cents', 500),
      jsonb_build_array(jsonb_build_object('menu_item_id', '10000000-0000-4000-8000-0000000000b1', 'qty', 1, 'price_cents', 500)));
    perform pg_temp.t_ok(true, 'create_paid_order: an order that is already charged is never rejected, even if the venue closed meanwhile');
  exception when others then
    perform pg_temp.t_ok(false, 'create_paid_order: an order that is already charged is never rejected, even if the venue closed meanwhile', sqlerrm);
  end;
end
$t$;
