-- 059: add the guest-checkout contact columns the webhook already writes (2026-07-12).
-- PRODUCTION BUG: stripe-webhook handlePaymentSucceeded inserts orders.contact_email and
-- orders.contact_phone (from PaymentIntent metadata, guest checkout D-37), but those
-- columns never existed → every payment_intent.succeeded threw
--   ERROR 42703: column "contact_email" of relation "orders" does not exist
-- → 500 → order never created → customer charged, kitchen never sees the order.
-- The webhook code is correct; the schema was missing. Adding the columns lets Stripe's
-- automatic retry create the pending order(s) on the next delivery.
alter table public.orders add column if not exists contact_email text;
alter table public.orders add column if not exists contact_phone text;

-- Length caps mirror the sanitisation in payments/index.ts (email ≤120, phone ≤30),
-- same shape as the existing orders_table_label_len check. Guarded so the migration is
-- idempotent (ADD CONSTRAINT has no IF NOT EXISTS).
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'orders_contact_email_len'
                   and conrelid = 'public.orders'::regclass) then
    alter table public.orders
      add constraint orders_contact_email_len
      check (contact_email is null or char_length(contact_email) <= 120);
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'orders_contact_phone_len'
                   and conrelid = 'public.orders'::regclass) then
    alter table public.orders
      add constraint orders_contact_phone_len
      check (contact_phone is null or char_length(contact_phone) <= 30);
  end if;
end $$;

comment on column public.orders.contact_email is
  'Optional guest-checkout contact (D-37) for receipt/refund. NULL for signed-in users. '
  'Written only by stripe-webhook (service_role) on order creation.';
comment on column public.orders.contact_phone is
  'Optional guest-checkout contact (D-37) for receipt/refund. NULL for signed-in users. '
  'Written only by stripe-webhook (service_role) on order creation.';

-- NOTE: the businesses financial-column allow-list (migrations 034/036) governs the
-- BUSINESSES table only — it does not apply to orders. orders has no client INSERT
-- policy (only the service_role webhook inserts), so these columns are never client-set
-- on creation.
