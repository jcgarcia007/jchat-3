-- 236 · businesses: the columns the owner edits from the dashboard were missing from the UPDATE allowlist
--
-- APPLIED BY PLANNING on 2026-10-17 through the Supabase MCP (migration version 20261017183617, name
-- 236_businesses_owner_column_grants). This file MIRRORS what is live; it is not applied from the repo.
--
-- Symptom: Dashboard → Configuración → Portada e ícono answered 403 "permission denied for table businesses" and the owner did
-- not notice (the save looked silent).
--
-- Cause: UPDATE on public.businesses for `authenticated` is a COLUMN ALLOWLIST (036, 038, 117 and 159 each re-create it: revoke
-- update, then grant update (…) on the allowed columns). A column that is not in the list cannot be written by the owner even when
-- the RLS policy lets them touch the row. icon_url, dashboard_palette_id, pickup_enabled, receipt_brand_color and
-- receipt_template_id were added by later migrations (115, 116, 149, 151, …) without joining the list.
--
-- Fix: additive and idempotent (a repeated GRANT changes nothing); no revoke, nothing destructive. RLS still decides which rows.
--
-- RULE FOR THE FUTURE: every new column of public.businesses that the owner edits from the app must be added to the
-- `grant update (…) on public.businesses to authenticated` in the SAME migration that creates it. Server-managed columns
-- (owner_id, plan, status, stripe_*, verified_*) must NOT. mobile/scripts/migrations-businesses-grants.test.mjs fails when a
-- column is added without a grant and without an entry (with a reason) in its NOT_OWNER_EDITABLE list.
--
-- Check (read-only), as of 2026-10-17 after this migration:
--   select column_name from information_schema.column_privileges
--   where table_schema = 'public' and table_name = 'businesses' and grantee = 'authenticated' and privilege_type = 'UPDATE';

grant update (
  icon_url,
  dashboard_palette_id,
  pickup_enabled,
  receipt_brand_color,
  receipt_template_id
) on public.businesses to authenticated;
