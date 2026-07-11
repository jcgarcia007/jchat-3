-- 049: table/location label for table orders (e.g. "5", "barra", "terraza").
-- Written by the stripe-webhook (service_role) from PaymentIntent metadata.
alter table public.orders
  add column if not exists table_label text;

alter table public.orders
  add constraint orders_table_label_len
  check (table_label is null or char_length(table_label) <= 40);

comment on column public.orders.table_label is
  'Free-text table/location for order_type = table (e.g. 5, barra, terraza). Max 40 chars.';
