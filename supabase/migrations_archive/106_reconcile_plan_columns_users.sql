-- 106_reconcile_plan_columns_users
-- Drift: aplicada en prod por "add_plan_columns_to_users" (schema_migrations v20260702025727), sin archivo.
-- Verificado contra prod: users.plan/plan_status/plan_trial_end + checks + idx_users_plan existen tal cual.
alter table public.users
  add column if not exists plan text not null default 'regular',
  add column if not exists plan_status text not null default 'active',
  add column if not exists plan_trial_end timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_plan_check') then
    alter table public.users add constraint users_plan_check
      check (plan in ('regular','verified','business','pro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'users_plan_status_check') then
    alter table public.users add constraint users_plan_status_check
      check (plan_status in ('active','trialing','expired','canceled'));
  end if;
end $$;

create index if not exists idx_users_plan on public.users (plan, plan_status);
