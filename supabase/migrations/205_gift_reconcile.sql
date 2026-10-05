-- 205: conciliación de regalos. Cada 10 min se vuelve a avisar a gift-worker (idempotente) por:
--   - ofertas 'accepted' de hace > 2 min que no llegaron a 'paid' (captura pendiente)
--   - ofertas declined/expired/cancelled de las últimas 2 h (retención que quizá no se liberó)
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-05). Este archivo solo la versiona.
create or replace function public.gift_offers_reconcile()
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare r record; n int := 0; v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return 0; end if;
  for r in
    select id, status, stripe_pi_id from public.gift_offers
    where stripe_pi_id is not null and (
      (status = 'accepted' and updated_at < now() - interval '2 minutes' and updated_at > now() - interval '24 hours')
      or (status in ('declined','expired','cancelled') and updated_at > now() - interval '2 hours' and updated_at < now() - interval '2 minutes'))
    limit 50
  loop
    perform net.http_post(
      url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/gift-worker',
      body := jsonb_build_object('gift_offer_id', r.id, 'status', r.status, 'stripe_pi_id', r.stripe_pi_id),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', v_secret),
      timeout_milliseconds := 20000);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.gift_offers_reconcile() from public, anon, authenticated;
select cron.unschedule('gift-offers-reconcile') where exists (select 1 from cron.job where jobname = 'gift-offers-reconcile');
select cron.schedule('gift-offers-reconcile', '*/10 * * * *', $$select public.gift_offers_reconcile()$$);
