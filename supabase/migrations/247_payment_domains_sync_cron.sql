-- 247: payment_domains_sync_cron — once an hour, ask the payment-domains-sync Edge Function to register every verified venue's domain
-- (<subdomain||slug>.jchat.cloud) as a Stripe payment method domain, so Apple Pay / Google Pay can show on the gift's payment page.
-- BORRADOR PARA REVISIÓN: NO está aplicada en Supabase. La aplica Juan Carlos por MCP.  (La Edge Function NO está desplegada todavía.)
-- Reversión: supabase/rollbacks/247_payment_domains_sync_cron_rollback.sql · Comprobación: supabase/scripts/247_check.sql
--
-- Same pattern as gift_offers_reconcile (205): a SECURITY DEFINER function reads the shared secret from the vault by NAME ('push_webhook_secret';
-- the value is never in this file) and calls the function through pg_net with the x-push-secret header. Without that secret in the vault the
-- function does nothing (so a local or branch database never calls production). No body: the function's defaults apply (scope 'platform', first
-- 50 venues; the answer's `next` would continue from there — not needed while there are fewer than 50 verified venues).
--
-- Idempotent and non-destructive: create or replace + cron.schedule(name, …), which updates a job with the same name instead of duplicating it.

create or replace function public.payment_domains_sync_cron()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_request bigint;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return null; end if;

  select net.http_post(
    url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/payment-domains-sync',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 60000
  ) into v_request;
  return v_request;
exception when others then
  raise warning 'payment_domains_sync_cron failed: %', sqlerrm;  -- next hour tries again
  return null;
end;
$$;

comment on function public.payment_domains_sync_cron() is
  'Hourly (pg_cron "payment-domains-sync"): asks the payment-domains-sync Edge Function to register each verified venue domain with Stripe. Does nothing without the vault secret push_webhook_secret.';

revoke all on function public.payment_domains_sync_cron() from public, anon, authenticated;

select cron.schedule('payment-domains-sync', '0 * * * *', $$select public.payment_domains_sync_cron()$$);
