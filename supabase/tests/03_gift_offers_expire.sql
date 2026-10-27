-- gift_offers_expire: held offers expire after expires_at; unpaid ones (draft / awaiting_payment) are cancelled, never "expired".
do $t$
declare
  biz constant uuid := pg_temp.seed_venue();
  u1 uuid := pg_temp.uid(1); u2 uuid := pg_temp.seed_user(2);
  n int;
begin
  insert into public.gift_offers (business_id, from_user_id, to_user_id, items, status, expires_at, stripe_pi_id) values
    (biz, u2, u1, '[]', 'held',             now() - interval '1 minute',  'pi_e1'),
    (biz, u2, u1, '[]', 'held',             now() + interval '1 minute',  'pi_e2'),
    (biz, u2, u1, '[]', 'accepted',         now() - interval '1 hour',    'pi_e3'),
    (biz, u2, u1, '[]', 'draft',            now() - interval '1 minute',  null),
    (biz, u2, u1, '[]', 'awaiting_payment', now() - interval '1 minute',  'pi_e5'),
    (biz, u2, u1, '[]', 'awaiting_payment', now() + interval '5 minutes', 'pi_e6'),
    (biz, u2, u1, '[]', 'paid',             now() - interval '1 hour',    'pi_e7');
  -- drafts with no expires_at fall back to created_at + 15 min
  insert into public.gift_offers (business_id, from_user_id, to_user_id, items, status, created_at) values
    (biz, u2, u1, '[]', 'draft', now() - interval '20 minutes'), (biz, u2, u1, '[]', 'draft', now() - interval '5 minutes');

  n := public.gift_offers_expire();
  perform pg_temp.t_ok(n = 1, 'returns the number of HELD offers that expired (only those)', n::text);
  perform pg_temp.t_ok((select status from public.gift_offers where stripe_pi_id = 'pi_e1') = 'expired', 'held + past expires_at → expired');
  perform pg_temp.t_ok((select status from public.gift_offers where stripe_pi_id = 'pi_e2') = 'held', 'held + still in time → untouched');
  perform pg_temp.t_ok((select status from public.gift_offers where stripe_pi_id = 'pi_e3') = 'accepted', 'accepted is never expired by the sweep');
  perform pg_temp.t_ok((select status from public.gift_offers where stripe_pi_id = 'pi_e7') = 'paid', 'paid is never touched');
  perform pg_temp.t_ok((select status from public.gift_offers where stripe_pi_id = 'pi_e5') = 'cancelled', 'awaiting_payment past expiry → cancelled (not expired)');
  perform pg_temp.t_ok((select status from public.gift_offers where stripe_pi_id = 'pi_e6') = 'awaiting_payment', 'awaiting_payment in time → untouched');
  perform pg_temp.t_ok((select count(*) from public.gift_offers where status = 'cancelled' and stripe_pi_id is null and created_at < now() - interval '15 minutes') = 1, 'draft with no expires_at older than 15 min → cancelled');
  perform pg_temp.t_ok((select count(*) from public.gift_offers where status = 'draft' and expires_at is null) = 1, '… and the 5-minute-old one stays a draft');
  perform pg_temp.t_ok((select count(*) from public.gift_offers where status = 'cancelled') = 3, 'exactly 3 cancelled (draft with date, awaiting_payment, old draft)');
  n := public.gift_offers_expire();
  perform pg_temp.t_ok(n = 0, 'a second sweep finds nothing (idempotent)');

  perform pg_temp.as_user(u2);
  perform pg_temp.t_raises($q$select public.gift_offers_expire()$q$, 'permission denied', 'an authenticated user cannot run the sweep');
  perform pg_temp.as_service();
end
$t$;
