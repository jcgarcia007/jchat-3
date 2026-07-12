-- 050: server-resolved cart for a PaymentIntent, read by stripe-webhook.
-- Stripe metadata caps values at 500 chars; with modifier groups the packed items
-- overflow and the webhook can't parse them → orders with no items. The cart lives
-- here instead: prices/labels are SERVER-RESOLVED (never the client's).
create table if not exists public.pending_order_carts (
  payment_intent_id text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  items       jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.pending_order_carts enable row level security;
-- No policies on purpose: only service_role (the Edge Functions) may read/write.
-- The client never touches this table.

create index if not exists pending_order_carts_created_at_idx
  on public.pending_order_carts (created_at);

comment on table public.pending_order_carts is
  'Server-resolved cart per PaymentIntent. Written by payments EF, read+deleted by stripe-webhook. Rows older than a few days can be purged.';
