-- 039 — FIX #5 (Tanda 3): tabla común de idempotencia para AMBOS webhooks
-- (stripe-webhook de órdenes y subscriptions). event.id es único global por cuenta
-- Stripe → una sola tabla sirve a ambos endpoints sin colisión. Los webhooks hacen
-- INSERT-FIRST: si el event.id ya existe (23505) → 200 sin reprocesar; si el handler
-- lanza, borran el marcador para que el reintento de Stripe reprocese (delete-on-error).
-- Sin policies RLS → solo service_role (los webhooks) accede; el cliente no.
create table if not exists public.processed_stripe_events (
  event_id     text primary key,
  type         text,
  processed_at timestamptz not null default now()
);

alter table public.processed_stripe_events enable row level security;
