-- 147_receipt_code_and_card.sql
-- Agrega receipt_code, card_brand y card_last4 a pos_payments.
-- receipt_code: código único URL-safe generado en la Edge Function tras cobro exitoso.
-- Aplicada a producción por Planning vía MCP el 2026-08-23.

alter table public.pos_payments
  add column if not exists receipt_code text,
  add column if not exists card_brand   text,
  add column if not exists card_last4   text;

create unique index if not exists pos_payments_receipt_code_key
  on public.pos_payments (receipt_code)
  where receipt_code is not null;
