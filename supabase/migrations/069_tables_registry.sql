-- 069: table registry (Mesas — Fase A). Business-owned dining tables.
--
-- Unblocks the visual floor plan (Fase B) and POS flow (Fase C), and turns
-- "% occupancy" into a real metric by cross-referencing orders.table_label.
--
-- RLS/grants copy the menu_items owner pattern (001) + admin-read (013), with a
-- column allow-list per D-54 (060-066 style): NO full-table write grants;
-- authenticated writes only operational columns, never repointing business_id.

begin;

create table if not exists public.tables (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  label       text not null,                    -- "T1", "Mesa 5"
  floor       text not null default 'Principal', -- piso/zona
  seats       int  not null default 4,
  sort        int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tables_label_len   check (char_length(label) between 1 and 20),
  constraint tables_seats_range check (seats between 1 and 50)
);

-- One label per business (case-insensitive) — avoids ambiguity when crossing
-- with orders.table_label (free text today).
create unique index if not exists uq_tables_business_label
  on public.tables (business_id, lower(label));

create index if not exists idx_tables_business_floor_sort
  on public.tables (business_id, floor, sort);

alter table public.tables enable row level security;

-- Owner manages their own tables. USING + WITH CHECK both, so a foreign
-- business_id is rejected on INSERT and UPDATE alike.
create policy "tables: business owner manage"
  on public.tables for all
  to authenticated
  using (
    exists (
      select 1 from public.businesses b
      where b.id = tables.business_id and b.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.businesses b
      where b.id = tables.business_id and b.owner_id = auth.uid()
    )
  );

-- Platform admins read everything (parity with 013 admin-read policies).
create policy "tables: admin read"
  on public.tables for select
  to authenticated
  using (public.is_platform_admin());

-- ── Column allow-list (D-54) ────────────────────────────────────────────────
-- Supabase default privileges grant CRUD on new public tables to anon +
-- authenticated. Revoke all, then re-grant only what clients need.
revoke all on table public.tables from anon;
revoke all on table public.tables from authenticated;

-- authenticated: read own/admin rows (RLS-gated), insert + update operational
-- columns, delete own rows. business_id is grantable on INSERT (needed to create,
-- guarded by WITH CHECK) but NOT on UPDATE, so an existing table can't be moved
-- to another business.
grant select on table public.tables to authenticated;
grant insert (business_id, label, floor, seats, sort, is_active)
  on table public.tables to authenticated;
grant update (label, floor, seats, sort, is_active)
  on table public.tables to authenticated;
grant delete on table public.tables to authenticated;

-- Reuse the shared updated_at trigger function (001).
create trigger trg_tables_updated_at
  before update on public.tables
  for each row execute function set_updated_at();

commit;
