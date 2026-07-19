-- 080: waiter orders — per-dish SEAT + who TOOK the order (B6 "tomar pedidos", parte A).
--
-- A waiter order differs from a customer order in three ways:
--   · it has NO customer            → orders.user_id must be nullable
--   · it was taken BY an employee   → orders.taken_by
--   · each dish belongs to a SEAT   → order_items.seat (needed to split by seat later)
--
-- Money rule (078): a waiter order is created with paid_at NULL — the kitchen sees
-- it immediately, but it does NOT count as a sale until it's collected.

begin;

-- ── order_items.seat ─────────────────────────────────────────────────────────
alter table public.order_items
  add column if not exists seat int;

alter table public.order_items
  drop constraint if exists order_items_seat_range;
alter table public.order_items
  add constraint order_items_seat_range
  check (seat is null or (seat between 1 and 50));

comment on column public.order_items.seat is
  'Seat number (1..N) this dish belongs to, for splitting the bill by seat. '
  'NULL for customer/QR orders, which have no seat concept.';

-- ── orders.taken_by ──────────────────────────────────────────────────────────
-- Mirrors table_tabs.created_by (auth.users, ON DELETE SET NULL): identity of the
-- ACTOR, kept for "my sales" and for the audit trail. NULL on customer orders.
alter table public.orders
  add column if not exists taken_by uuid references auth.users(id) on delete set null;

comment on column public.orders.taken_by is
  'Employee (auth user) who TOOK this order in the terminal. NULL for customer '
  'orders. orders.user_id stays the CUSTOMER — the two are not interchangeable.';

create index if not exists idx_orders_taken_by on public.orders (taken_by);

-- ── orders.user_id becomes nullable ──────────────────────────────────────────
-- A waiter order has no customer. This ALSO fixes a latent contradiction that
-- predates this migration: orders_user_id_fkey is ON DELETE SET NULL while the
-- column was NOT NULL, so deleting a user who had orders raised a not-null
-- violation — which would break the daily anonymous-user cleanup (074) for any
-- anon user that had ordered.
alter table public.orders
  alter column user_id drop not null;

-- ── Grants ───────────────────────────────────────────────────────────────────
-- orders: authenticated already has UPDATE only on (status, status_updated_at)
-- and NO insert, so taken_by is non-writable by construction — nothing to do.
--
-- order_items: authenticated held a TABLE-LEVEL update grant, which would cover
-- `seat` automatically (and already exposed price_cents/qty/options to client
-- writes — the recurring column-grant hole, D-54). Narrow it to the only column a
-- client legitimately flips. No app code updates order_items today (all call sites
-- are SELECT; the webhook inserts as service_role), so this breaks nothing.
revoke update on table public.order_items from authenticated;
grant update (item_status) on table public.order_items to authenticated;

commit;
