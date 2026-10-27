-- 078: orders.paid_at — separate "money entered" from the kitchen stage (B6.3a).
--
-- Today orders.status='confirmed' means BOTH "kitchen can start" AND "the customer
-- paid" — because the only way an order is born is the Stripe webhook, AFTER
-- payment. The waiter breaks that: they take the order, the kitchen starts, and
-- nobody has paid yet. So we split the two meanings:
--   · status  = kitchen stage (pending → confirmed → preparing → ready → delivered)
--   · paid_at = whether the money entered, and when (NULL = not paid yet)
--
-- Grants: paid_at is written by service_role only (the webhook), exactly like
-- table_id (075) and tab_id (072). authenticated has a TABLE-level SELECT on
-- orders (so it can already READ paid_at — no new SELECT grant), UPDATE only on
-- (status, status_updated_at), and NO INSERT grant. A new column is therefore
-- non-writable by authenticated by construction — we add no write grant here.

begin;

alter table public.orders
  add column if not exists paid_at timestamptz;

comment on column public.orders.paid_at is
  'When the money entered (service_role/webhook only). NULL = not paid yet. A '
  'waiter order goes to the kitchen unpaid and gets paid_at stamped at checkout.';

-- Sales queries filter by (business_id, paid_at) within a month window.
create index if not exists idx_orders_business_paid_at
  on public.orders (business_id, paid_at);

-- BACKFILL: every existing order was created by the webhook AFTER a successful
-- payment, so all of them are paid. Stamp paid_at = created_at for the rows that
-- predate this column. (Verified: no pending/cancelled/refunded rows exist, so
-- this matches the old SALE_STATUSES set exactly.)
update public.orders
set paid_at = created_at
where paid_at is null;

commit;
