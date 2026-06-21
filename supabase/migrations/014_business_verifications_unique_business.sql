-- ============================================================
-- JChat 3.0 — business_verifications UNIQUE(business_id)
-- The verify flow (Step 1 identity, Step 2 daily code, selfie) upserts one
-- verification row per business with ON CONFLICT (business_id). That requires a
-- UNIQUE constraint on business_id, which was missing → "no unique or exclusion
-- constraint matching the ON CONFLICT specification". Add it (idempotent).
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.business_verifications'::regclass
      and conname = 'business_verifications_business_id_key'
  ) then
    alter table public.business_verifications
      add constraint business_verifications_business_id_key unique (business_id);
  end if;
end $$;
