-- guest_request_service_by_label (240): the number a guest types ("mesa 1", "Table 1", "T1", " 1 ") finds the table; invalid numbers
-- are counted and blocked. Needs guest_device_blocks / guest_service_attempts (migration 161, which does NOT replay on a fresh database:
-- see the report) and guest_request_service (the real one is replaced here by a stub that returns the token it received, so the test
-- checks only what THIS function decides: which table a typed label resolves to). The stubs live in this rolled-back transaction only.
do $t$
declare
  biz constant uuid := pg_temp.seed_venue();
  dev constant text := 'device-12345678';
  i int;
begin
  if to_regclass('public.guest_device_blocks') is null then
    create table public.guest_device_blocks (business_id uuid, device_id text, reason text, blocked_until timestamptz, unblocked_at timestamptz);
    create unique index on public.guest_device_blocks (business_id, device_id) where unblocked_at is null;
    grant all on public.guest_device_blocks to public;
  end if;
  if to_regclass('public.guest_service_attempts') is null then
    create table public.guest_service_attempts (business_id uuid, device_id text, reason text, created_at timestamptz default now());
    grant all on public.guest_service_attempts to public;
  end if;
  create or replace function public.guest_request_service(p_table_token text, p_lat double precision, p_lng double precision, p_device_id text, p_notes text default null)
  returns jsonb language sql as $f$ select jsonb_build_object('ok', true, 'token', p_table_token) $f$;

  insert into public.tables (business_id, label, qr_token, is_active) values
    (biz, '1', 'tok-1', true), (biz, 'Mesa 7', 'tok-7', true), (biz, 'T12', 'tok-12', true), (biz, 'Barra', 'tok-barra', true), (biz, '5', 'tok-5-off', false);

  -- typed forms that all mean table "1"
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, '1', 40.0, -74.0, dev)->>'token' = 'tok-1', '"1" → table 1');
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, 'mesa 1', 40.0, -74.0, dev)->>'token' = 'tok-1', '"mesa 1" → table 1');
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, 'MESA1', 40.0, -74.0, dev)->>'token' = 'tok-1', '"MESA1" → table 1');
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, 'Table 1', 40.0, -74.0, dev)->>'token' = 'tok-1', '"Table 1" → table 1');
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, 'T1', 40.0, -74.0, dev)->>'token' = 'tok-1', '"T1" → table 1');
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, 't 1', 40.0, -74.0, dev)->>'token' = 'tok-1', '"t 1" → table 1');
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, '   1   ', 40.0, -74.0, dev)->>'token' = 'tok-1', '" 1 " (spaces) → table 1');

  -- the table's own label is normalised too ("Mesa 7", "T12")
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, '7', 40.0, -74.0, dev)->>'token' = 'tok-7', '"7" → the table labelled "Mesa 7"');
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, 'mesa 7', 40.0, -74.0, dev)->>'token' = 'tok-7', '"mesa 7" → "Mesa 7"');
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, '12', 40.0, -74.0, dev)->>'token' = 'tok-12', '"12" → the table labelled "T12"');
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, 'barra', 40.0, -74.0, dev)->>'token' = 'tok-barra', 'a non-numeric label ("Barra") matches by name');

  -- two tables normalise to 1 ("1" and "T1"): the exact label "1" is preferred
  insert into public.tables (business_id, label, qr_token, is_active) values (biz, 'T1', 'tok-t1', true);
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, '1', 40.0, -74.0, dev)->>'token' = 'tok-1', 'two tables normalise to 1: the exact label "1" is preferred');

  -- bad input that never counts as an attempt
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, '', 40.0, -74.0, dev)->>'error' = 'invalid_table', 'empty → invalid_table');
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, repeat('9', 21), 40.0, -74.0, dev)->>'error' = 'invalid_table', 'longer than 20 characters → invalid_table');
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, 'mesa', 40.0, -74.0, dev)->>'error' = 'invalid_table', 'only the prefix ("mesa") → invalid_table');
  perform pg_temp.t_ok(public.guest_request_service_by_label(null, '1', 40.0, -74.0, dev)->>'error' = 'invalid_table', 'null business → invalid_table');
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, '1', 40.0, -74.0, 'short')->>'error' = 'device_required', 'device id under 8 characters → device_required');
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, '1', 40.0, -74.0, null)->>'error' = 'device_required', 'no device id → device_required');
  update public.businesses set is_active = false where id = biz;
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, '1', 40.0, -74.0, dev)->>'error' = 'invalid_table', 'inactive business → invalid_table');
  update public.businesses set is_active = true where id = biz;

  -- from OUTSIDE the venue an unknown number answers outside_venue (numbers cannot be probed) and is not counted
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, '99', 41.0, -74.0, dev)->>'error' = 'outside_venue', 'unknown number from OUTSIDE the venue → outside_venue');
  perform pg_temp.t_ok((select count(*) from public.guest_service_attempts where device_id = dev) = 0, '… and is not counted as an attempt');

  -- from inside: an inactive table and an unknown number are invalid_table AND counted
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, '5', 40.0, -74.0, dev)->>'error' = 'invalid_table', 'an INACTIVE table does not match → invalid_table');
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, '99', 40.0, -74.0, dev)->>'error' = 'invalid_table', 'unknown number from inside → invalid_table');
  perform pg_temp.t_ok((select count(*) from public.guest_service_attempts where device_id = dev) = 2, 'the two inside tries are counted', (select count(*) from public.guest_service_attempts)::text);

  -- 6 invalid tries in 10 minutes → the device is blocked for 24 h in that venue
  for i in 1..3 loop perform public.guest_request_service_by_label(biz, '98', 40.0, -74.0, dev); end loop;   -- 5 tries so far
  perform pg_temp.t_ok(not exists (select 1 from public.guest_device_blocks where device_id = dev), '5 invalid tries: not blocked yet');
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, '1', 40.0, -74.0, dev)->>'token' = 'tok-1', '… and a valid table still works');
  perform public.guest_request_service_by_label(biz, '97', 40.0, -74.0, dev);                                 -- the 6th
  perform pg_temp.t_ok(exists (select 1 from public.guest_device_blocks where business_id = biz and device_id = dev and blocked_until > now() + interval '23 hours'), '6th invalid try → device blocked for 24 h');
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, '1', 40.0, -74.0, dev)->>'error' = 'blocked_24h', 'a blocked device gets blocked_24h even for a VALID table');
  perform pg_temp.t_ok(public.guest_request_service_by_label(biz, '1', 40.0, -74.0, 'another-device-1')->>'token' = 'tok-1', 'another device is not affected');

  perform pg_temp.as_user(pg_temp.uid(1));
  perform pg_temp.t_raises($q$select public.guest_request_service_by_label('10000000-0000-4000-8000-000000000001', '1', 40.0, -74.0, 'device-12345678')$q$, 'permission denied', 'an authenticated user cannot call it directly');
  perform pg_temp.as_service();
end
$t$;
