-- 107_reconcile_active_business_users
-- Drift: aplicada en prod por "add_active_business_to_users" (v20260703192444), sin archivo.
-- Verificado: users.active_business_id + idx_users_active_business existen.
alter table public.users
  add column if not exists active_business_id uuid
  references public.businesses(id) on delete set null;

create index if not exists idx_users_active_business on public.users (active_business_id);
