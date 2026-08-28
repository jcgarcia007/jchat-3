create table if not exists public.pos_printers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  label text not null,
  connection text not null default 'network',
  host text,
  port int not null default 9100,
  width_mm int not null default 80,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_printers_business on public.pos_printers(business_id);

alter table public.pos_printers enable row level security;

create policy pos_printers_select_employee on public.pos_printers
  for select using (public.is_employee_of_business(business_id));

create policy pos_printers_owner_all on public.pos_printers
  for all
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
