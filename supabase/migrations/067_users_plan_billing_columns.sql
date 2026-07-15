-- 067: columnas de facturación de plan en users (modelo plan-por-usuario, opción B)
-- El estado del plan vive en users (ver docs/PLAN_MONETIZACION.md). billing/page.tsx y las
-- pantallas de super-admin leían estos datos de la tabla `subscriptions` (que se jubila).
-- NO se añade grace_day: plan_status='past_due' ya comunica el problema de pago; Stripe
-- gestiona los reintentos.

begin;

alter table public.users
  add column if not exists plan_renews_at timestamptz,
  add column if not exists stripe_subscription_id text;

commit;
