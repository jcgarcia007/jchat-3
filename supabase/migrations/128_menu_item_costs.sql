-- 128_menu_item_costs.sql
-- Fase A2: costo por unidad (confidencial, SOLO dueño). Tabla aparte para no filtrar el costo
-- por el SELECT publico de menu_items. YA APLICADO A PRODUCCIÓN por Planning Claude (MCP, 2026-08-18).
-- Solo control de versiones. Idempotente. NO re-aplicar manualmente.
create table if not exists public.menu_item_costs (
  menu_item_id uuid primary key references public.menu_items(id) on delete cascade,
  business_id  uuid not null references public.businesses(id) on delete cascade,
  cost_cents   integer check (cost_cents is null or cost_cents >= 0),
  updated_at   timestamptz not null default now()
);
create index if not exists menu_item_costs_business_idx on public.menu_item_costs(business_id);
alter table public.menu_item_costs enable row level security;
drop policy if exists "menu_item_costs owner all" on public.menu_item_costs;
create policy "menu_item_costs owner all" on public.menu_item_costs
  for all to authenticated
  using  (exists (select 1 from public.businesses b where b.id = menu_item_costs.business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = menu_item_costs.business_id and b.owner_id = auth.uid()));
grant select, insert, update, delete on public.menu_item_costs to authenticated;
revoke all on public.menu_item_costs from anon;
drop trigger if exists trg_menu_item_costs_updated_at on public.menu_item_costs;
create trigger trg_menu_item_costs_updated_at before update on public.menu_item_costs
  for each row execute function public.set_updated_at();
