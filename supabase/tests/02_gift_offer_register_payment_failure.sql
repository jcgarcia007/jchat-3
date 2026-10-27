-- gift_offer_register_payment_failure: 1 and 2 refusals keep the offer open; the 3rd cancels it; terminal / unknown / accepted cases.
do $t$
declare
  biz constant uuid := pg_temp.seed_venue();
  u1 uuid := pg_temp.uid(1); u2 uuid := pg_temp.seed_user(2);
  r jsonb; id1 uuid;
begin
  insert into public.gift_offers (business_id, from_user_id, to_user_id, items, status, stripe_pi_id) values (biz, u2, u1, '[]', 'awaiting_payment', 'pi_t1') returning id into id1;

  r := public.gift_offer_register_payment_failure('pi_t1', 'Your card was declined.');
  perform pg_temp.t_ok(r = '{"ok":true,"status":"awaiting_payment","failures":1}'::jsonb, '1st refusal: stays awaiting_payment, failures = 1', r::text);
  r := public.gift_offer_register_payment_failure('pi_t1', 'Insufficient funds');
  perform pg_temp.t_ok(r = '{"ok":true,"status":"awaiting_payment","failures":2}'::jsonb, '2nd refusal: stays awaiting_payment, failures = 2', r::text);
  perform pg_temp.t_ok((select last_payment_error from public.gift_offers where id = id1) = 'Insufficient funds', 'the last error is kept');
  r := public.gift_offer_register_payment_failure('pi_t1', repeat('x', 500));
  perform pg_temp.t_ok(r = '{"ok":true,"status":"cancelled","failures":3}'::jsonb, '3rd refusal: the offer is cancelled', r::text);
  perform pg_temp.t_ok((select length(last_payment_error) from public.gift_offers where id = id1) = 200, 'the error text is cut at 200 characters');
  r := public.gift_offer_register_payment_failure('pi_t1', 'late event');
  perform pg_temp.t_ok(r = '{"ok":true,"status":"cancelled","failures":3}'::jsonb, '4th event on a cancelled offer: no change, no 4th failure', r::text);

  r := public.gift_offer_register_payment_failure('pi_nope', 'x');
  perform pg_temp.t_ok(r = '{"ok":false,"error":"not_found"}'::jsonb, 'unknown PaymentIntent → not_found', r::text);

  -- after the recipient accepted, a failed capture marks the offer failed (not cancelled)
  insert into public.gift_offers (business_id, from_user_id, to_user_id, items, status, stripe_pi_id, payment_failures) values (biz, u2, u1, '[]', 'accepted', 'pi_t2', 1);
  r := public.gift_offer_register_payment_failure('pi_t2', 'capture failed');
  perform pg_temp.t_ok(r = '{"ok":true,"status":"failed","failures":1}'::jsonb, 'accepted offer: status → failed', r::text);

  -- held / paid / declined: untouched by a late refusal
  insert into public.gift_offers (business_id, from_user_id, to_user_id, items, status, stripe_pi_id) values
    (biz, u2, u1, '[]', 'held', 'pi_t3'), (biz, u2, u1, '[]', 'paid', 'pi_t4'), (biz, u2, u1, '[]', 'declined', 'pi_t5');
  perform public.gift_offer_register_payment_failure(p, 'x') from unnest(array['pi_t3','pi_t4','pi_t5']) p;
  perform pg_temp.t_ok((select array_agg(status order by stripe_pi_id) from public.gift_offers where stripe_pi_id in ('pi_t3','pi_t4','pi_t5')) = array['held','paid','declined'], 'held / paid / declined are not touched by a late refusal');
  perform pg_temp.t_ok((select sum(payment_failures) from public.gift_offers where stripe_pi_id in ('pi_t3','pi_t4','pi_t5')) = 0, '… and their failure counter does not move');

  -- only the server may call it
  perform pg_temp.as_user(u2);
  perform pg_temp.t_raises($q$select public.gift_offer_register_payment_failure('pi_t1','x')$q$, 'permission denied', 'an authenticated user cannot call it');
  perform pg_temp.as_service();
end
$t$;
