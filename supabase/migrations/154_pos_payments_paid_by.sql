-- Fase 4B: Add paid_by column to pos_payments.
-- Tracks which employee collected the payment (filled server-side only — never from client).
-- ALREADY APPLIED IN PRODUCTION via Supabase MCP on 2026-08-27.

alter table public.pos_payments
  add column if not exists paid_by uuid references auth.users(id);

comment on column public.pos_payments.paid_by is
  'Employee who collected this payment. Set server-side (JWT auth.uid()) only — never from client.';
