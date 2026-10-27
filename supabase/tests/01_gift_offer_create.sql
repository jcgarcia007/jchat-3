-- gift_offer_create: validations, 3 held gifts / hour, one pending per person, one open offer per sender, 5 refusals / hour (244).
do $t$
declare
  biz constant uuid := pg_temp.seed_venue();
  item constant text := '10000000-0000-4000-8000-0000000000b1';
  u1 uuid := pg_temp.uid(1); u2 uuid := pg_temp.seed_user(2); u3 uuid := pg_temp.seed_user(3); u4 uuid := pg_temp.seed_user(4);
  r jsonb; v_status text; v_exp timestamptz; v_def text;
  items1 text := format('[{"menu_item_id":"%s","qty":1}]', item);
begin
  perform pg_temp.present(u1); perform pg_temp.present(u2); perform pg_temp.present(u3); perform pg_temp.present(u4);

  -- no session
  perform pg_temp.t_raises(format('select public.gift_offer_create(%L, %L, %L::jsonb)', biz, u1, items1), 'not_authenticated', 'no session → not_authenticated');

  perform pg_temp.as_user(u2);
  r := public.gift_offer_create(biz, u1, items1::jsonb, '  hola  ');
  perform pg_temp.as_service();
  select status, expires_at into v_status, v_exp from public.gift_offers where id = (r->>'id')::uuid;
  perform pg_temp.t_ok((r->>'subtotal_cents')::int = 500, 'happy path: subtotal = price × qty', r::text);
  perform pg_temp.t_ok(v_status = 'draft', 'a new offer starts as draft');
  perform pg_temp.t_ok(v_exp between now() + interval '14 minutes 55 seconds' and now() + interval '15 minutes 5 seconds', 'expires 15 minutes from now');
  perform pg_temp.t_ok((select note from public.gift_offers where id = (r->>'id')::uuid) = 'hola', 'note is trimmed');

  -- quantity is clamped to 1..10
  perform pg_temp.as_user(u2);
  r := public.gift_offer_create(biz, u1, format('[{"menu_item_id":"%s","qty":99}]', item)::jsonb);
  perform pg_temp.as_service();
  perform pg_temp.t_ok((r->>'subtotal_cents')::int = 5000, 'qty 99 is clamped to 10', r->>'subtotal_cents');

  -- one open offer per sender: the previous draft was cancelled by the new one
  perform pg_temp.t_ok((select count(*) from public.gift_offers where from_user_id = u2 and status = 'draft') = 1, 'only ONE draft stays open per sender');
  perform pg_temp.t_ok((select count(*) from public.gift_offers where from_user_id = u2 and status = 'cancelled') = 1, 'the earlier draft was cancelled');

  -- unavailable: self / not present / blocked / my own presence expired
  perform pg_temp.as_user(u2);
  perform pg_temp.t_raises(format('select public.gift_offer_create(%L, %L, %L::jsonb)', biz, u2, items1), 'gift_unavailable', 'to myself → gift_unavailable');
  perform pg_temp.as_service();
  perform pg_temp.seed_user(9);
  perform pg_temp.as_user(u2);
  perform pg_temp.t_raises(format('select public.gift_offer_create(%L, %L, %L::jsonb)', biz, pg_temp.uid(9), items1), 'gift_unavailable', 'recipient not present in the venue → gift_unavailable');
  perform pg_temp.as_service();
  insert into public.blocks (blocker_id, blocked_id) values (u3, u2);
  perform pg_temp.as_user(u2);
  perform pg_temp.t_raises(format('select public.gift_offer_create(%L, %L, %L::jsonb)', biz, u3, items1), 'gift_unavailable', 'blocked by the recipient → gift_unavailable');
  perform pg_temp.as_service();
  delete from public.blocks;
  update public.room_geo_presence set expires_at = now() - interval '1 minute' where user_id = u2;
  perform pg_temp.as_user(u2);
  perform pg_temp.t_raises(format('select public.gift_offer_create(%L, %L, %L::jsonb)', biz, u1, items1), 'gift_unavailable', 'MY presence expired → gift_unavailable');
  perform pg_temp.as_service();
  update public.room_geo_presence set expires_at = now() + interval '10 minutes' where user_id = u2;

  -- invalid items
  perform pg_temp.as_user(u2);
  perform pg_temp.t_raises(format('select public.gift_offer_create(%L, %L, %L::jsonb)', biz, u1, '[]'), 'invalid_items', 'empty list → invalid_items');
  perform pg_temp.t_raises(format('select public.gift_offer_create(%L, %L, %L::jsonb)', biz, u1, '{"a":1}'), 'invalid_items', 'not an array → invalid_items');
  perform pg_temp.t_raises(format('select public.gift_offer_create(%L, %L, %L::jsonb)', biz, u1, (select jsonb_agg(jsonb_build_object('menu_item_id', item, 'qty', 1)) from generate_series(1, 11))::text), 'invalid_items', '11 lines → invalid_items');
  perform pg_temp.t_raises(format('select public.gift_offer_create(%L, %L, %L::jsonb)', biz, u1, '[{"menu_item_id":"99999999-0000-4000-8000-000000000000","qty":1}]'), 'invalid_items', 'unknown item → invalid_items');
  perform pg_temp.as_service();
  update public.menu_items set is_available = false where id = item::uuid;
  perform pg_temp.as_user(u2);
  perform pg_temp.t_raises(format('select public.gift_offer_create(%L, %L, %L::jsonb)', biz, u1, items1), 'invalid_items', 'unavailable item → invalid_items');
  perform pg_temp.as_service();
  update public.menu_items set is_available = true where id = item::uuid;

  -- a pending gift (held / accepted) to the same person blocks a second one; to someone else it does not
  delete from public.gift_offers;
  insert into public.gift_offers (business_id, from_user_id, to_user_id, items, status, held_at) values (biz, u2, u1, '[]', 'held', now());
  perform pg_temp.as_user(u2);
  perform pg_temp.t_raises(format('select public.gift_offer_create(%L, %L, %L::jsonb)', biz, u1, items1), 'gift_pending', 'held gift to the same person → gift_pending');
  r := public.gift_offer_create(biz, u3, items1::jsonb);
  perform pg_temp.as_service();
  perform pg_temp.t_ok(r ? 'id', 'a held gift to ANOTHER person does not block');
  update public.gift_offers set status = 'accepted' where from_user_id = u2 and to_user_id = u1;
  perform pg_temp.as_user(u2);
  perform pg_temp.t_raises(format('select public.gift_offer_create(%L, %L, %L::jsonb)', biz, u1, items1), 'gift_pending', 'accepted gift to the same person → gift_pending');
  perform pg_temp.as_service();
  update public.gift_offers set status = 'paid' where from_user_id = u2 and to_user_id = u1;
  perform pg_temp.as_user(u2);
  r := public.gift_offer_create(biz, u1, items1::jsonb);
  perform pg_temp.as_service();
  perform pg_temp.t_ok(r ? 'id', 'once the earlier gift is paid the same person can be gifted again');

  -- 3 held gifts per hour (only held_at counts; draft / cancelled do not)
  delete from public.gift_offers;
  insert into public.gift_offers (business_id, from_user_id, to_user_id, items, status, held_at)
    select biz, u2, u4, '[]', 'paid', now() - (g * interval '10 minutes') from generate_series(1, 2) g;
  insert into public.gift_offers (business_id, from_user_id, to_user_id, items, status) values (biz, u2, u4, '[]', 'cancelled'), (biz, u2, u4, '[]', 'draft');
  perform pg_temp.as_user(u2);
  r := public.gift_offer_create(biz, u1, items1::jsonb);
  perform pg_temp.as_service();
  perform pg_temp.t_ok(r ? 'id', '2 held in the hour (+ drafts / cancelled that do not count) → still allowed');
  insert into public.gift_offers (business_id, from_user_id, to_user_id, items, status, held_at) values (biz, u2, u4, '[]', 'paid', now() - interval '5 minutes');
  perform pg_temp.as_user(u2);
  perform pg_temp.t_raises(format('select public.gift_offer_create(%L, %L, %L::jsonb)', biz, u1, items1), 'gift_rate_limit', '3 held in the hour → gift_rate_limit');
  perform pg_temp.as_service();
  update public.gift_offers set held_at = now() - interval '61 minutes' where held_at is not null;
  perform pg_temp.as_user(u2);
  r := public.gift_offer_create(biz, u1, items1::jsonb);
  perform pg_temp.as_service();
  perform pg_temp.t_ok(r ? 'id', 'held gifts older than one hour stop counting');
  perform pg_temp.t_ok((select count(*) from public.gift_offers where from_user_id = u1) = 0, 'the limit is per sender (nobody else was affected)');

  -- 5 payment refusals per hour across ALL the sender's offers (migration 244, only on the branch that carries it)
  select pg_get_functiondef('public.gift_offer_create(uuid,uuid,jsonb,text,uuid)'::regprocedure) into v_def;
  if v_def !~ 'payment_failures' then
    perform pg_temp.t_skip('5 refusals per hour (244)', 'gift_offer_create in this database has no refusal limit (migration 244 not applied; it lives on feat/web-express-pay)');
  else
    delete from public.gift_offers;
    insert into public.gift_offers (business_id, from_user_id, to_user_id, items, status, payment_failures) values (biz, u2, u4, '[]', 'cancelled', 3), (biz, u2, u3, '[]', 'awaiting_payment', 1);
    perform pg_temp.as_user(u2);
    r := public.gift_offer_create(biz, u1, items1::jsonb);
    perform pg_temp.as_service();
    perform pg_temp.t_ok(r ? 'id', '4 refusals in the hour → still allowed');
    update public.gift_offers set payment_failures = payment_failures + 1 where to_user_id = u3;
    perform pg_temp.as_user(u2);
    perform pg_temp.t_raises(format('select public.gift_offer_create(%L, %L, %L::jsonb)', biz, u1, items1), 'gift_rate_limit', '5 refusals in the hour (across offers) → gift_rate_limit');
    perform pg_temp.as_service();
    update public.gift_offers set created_at = now() - interval '61 minutes';
    perform pg_temp.as_user(u2);
    r := public.gift_offer_create(biz, u1, items1::jsonb);
    perform pg_temp.as_service();
    perform pg_temp.t_ok(r ? 'id', 'refusals on offers created over an hour ago stop counting');
  end if;
end
$t$;
