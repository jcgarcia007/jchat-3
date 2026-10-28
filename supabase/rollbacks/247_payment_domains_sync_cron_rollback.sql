-- 247 — REVERSIÓN de supabase/migrations/247_payment_domains_sync_cron.sql.
-- Quita el trabajo de pg_cron y la función. No toca nada más (ni la Edge Function, ni los dominios ya registrados en Stripe, ni el vault).
-- Destructivo a propósito (es una reversión): la aplica Juan Carlos por MCP solo si hay que deshacer la 247.

select cron.unschedule('payment-domains-sync') where exists (select 1 from cron.job where jobname = 'payment-domains-sync');
drop function if exists public.payment_domains_sync_cron();
