-- 058: persist Stripe Connect onboarding state on businesses (2026-07-12, FIX #3).
-- Before this, businesses only had stripe_account_id, so JChat couldn't tell whether a
-- connected account had actually finished onboarding — a half-onboarded account would
-- fail the PaymentIntent at checkout, in front of the customer. These flags are kept in
-- sync by stripe-webhook (account.updated) and stripe-connect (get_account_status).
alter table public.businesses
  add column if not exists stripe_charges_enabled   boolean not null default false,
  add column if not exists stripe_payouts_enabled   boolean not null default false,
  add column if not exists stripe_details_submitted boolean not null default false;

comment on column public.businesses.stripe_charges_enabled is
  'Stripe account.charges_enabled — the business can accept charges. Synced from Stripe '
  '(webhook account.updated / stripe-connect get_account_status). Server-role writable only.';

-- These columns are NOT in the migration 036 column allow-list, so authenticated/anon
-- cannot UPDATE them (only service_role + the Edge Functions). Verified post-apply.

-- Transition backfill: any business that ALREADY has a connected Stripe account is
-- assumed onboarded (the pre-gate code let it charge), so it keeps charging the instant
-- the new payments gate goes live — without this they'd all flip to false=blocked. Today
-- that is exactly one row (Bar XZX). The first real account.updated / get_account_status
-- sync reconciles these to Stripe's true values.
update public.businesses
  set stripe_charges_enabled = true,
      stripe_payouts_enabled = true,
      stripe_details_submitted = true
  where stripe_account_id is not null;
