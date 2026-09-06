-- Ya aplicado en producción por Planning (MCP). Este archivo sincroniza el repo.
alter table public.pos_printers
  add column if not exists role text not null default 'receipt'
  check (role in ('kitchen', 'bar', 'receipt'));

create index if not exists idx_pos_printers_business_role
  on public.pos_printers (business_id, role) where is_active = true;

create unique index if not exists pos_printers_biz_role_unique
  on public.pos_printers (business_id, role)
  where role in ('kitchen', 'bar');
