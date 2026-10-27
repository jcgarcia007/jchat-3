-- Migration 032: modifier_groups + menu_item_modifier_groups
-- Adds reusable modifier group tables for Uber Eats-style option system.
-- menu_items.options is NOT touched (kept for backward compat).

-- Tabla 1: grupos de opciones reutilizables (a nivel de negocio)
create table if not exists public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  key text not null,
  label text not null,
  type text not null default 'single' check (type in ('single','multi')),
  min_select int not null default 0,
  max_select int not null default 1,
  choices jsonb not null default '[]'::jsonb,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, key)
);

-- Tabla 2: enganche artículo <-> grupo (puente N:N)
create table if not exists public.menu_item_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  modifier_group_id uuid not null references public.modifier_groups(id) on delete cascade,
  sort int not null default 0,
  unique (menu_item_id, modifier_group_id)
);

-- Índices para lectura eficiente
create index if not exists idx_modifier_groups_business on public.modifier_groups(business_id);
create index if not exists idx_mimg_item on public.menu_item_modifier_groups(menu_item_id);
create index if not exists idx_mimg_group on public.menu_item_modifier_groups(modifier_group_id);

-- RLS
alter table public.modifier_groups enable row level security;
alter table public.menu_item_modifier_groups enable row level security;

-- SELECT público (el menú /m/[slug] es público sin login)
create policy "modifier_groups public read"
  on public.modifier_groups for select using (true);
create policy "mimg public read"
  on public.menu_item_modifier_groups for select using (true);

-- El dueño del negocio puede gestionar sus grupos
create policy "modifier_groups owner all"
  on public.modifier_groups for all
  using (exists (select 1 from public.businesses b where b.id = modifier_groups.business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = modifier_groups.business_id and b.owner_id = auth.uid()));

-- El dueño puede enganchar/desenganchar grupos en SUS artículos
create policy "mimg owner all"
  on public.menu_item_modifier_groups for all
  using (exists (
    select 1 from public.menu_items mi
    join public.businesses b on b.id = mi.business_id
    where mi.id = menu_item_modifier_groups.menu_item_id and b.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.menu_items mi
    join public.businesses b on b.id = mi.business_id
    where mi.id = menu_item_modifier_groups.menu_item_id and b.owner_id = auth.uid()
  ));
