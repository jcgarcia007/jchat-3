-- 075: orders.table_id — the REAL table an order belongs to (Mesas/Taps C2).
--
-- Resolved SERVER-SIDE from the table QR token (never trusted from the client):
-- the payments EF validates the token belongs to the same business and puts
-- table_id in the PaymentIntent metadata; the webhook writes it on the order.
--
-- Nullable: counter orders, mobile orders, and legacy orders have no table.
-- table_label stays as-is (legacy/informative free text), NOT migrated.
--
-- Grants: table_id is NOT added to any authenticated write grant. The orders
-- UPDATE allow-list (060) stays {status, status_updated_at}, and INSERT is
-- service_role only (033) — so table_id is written ONLY by service_role, exactly
-- like tab_id (070/072).

begin;

alter table public.orders
  add column if not exists table_id uuid references public.tables(id) on delete set null;

create index if not exists idx_orders_table_id on public.orders (table_id);

commit;
