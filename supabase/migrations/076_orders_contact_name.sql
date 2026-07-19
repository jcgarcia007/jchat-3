-- 076: orders.contact_name — the name a QR-paying customer is served under (C3').
--
-- The customer who pays by QR does NOT create a tab. They only need the waiter to
-- know whom to hand the order to. The name travels exactly like contact_email /
-- contact_phone (052/059): client → payments EF (sanitised) → PaymentIntent
-- metadata → webhook → orders. NOT client-writable — INSERT is service_role and
-- the UPDATE allow-list (060) is {status, status_updated_at}, so a new column is
-- writable ONLY by service_role.

begin;

alter table public.orders add column if not exists contact_name text;

alter table public.orders
  add constraint orders_contact_name_len
  check (contact_name is null or char_length(contact_name) <= 60);

comment on column public.orders.contact_name is
  'Name the order is served under (guest name typed at QR checkout, or the profile name). From PaymentIntent metadata; nullable. Not client-writable.';

commit;
