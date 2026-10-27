-- 070: Mesas/Taps B1 — data model. table_tabs + orders.tab_id + table_waiters.
--
-- Product model: docs/MESAS_Y_TAPS.md (D-55). A table (069) holds several TABS
-- (per-person accounts). Orders attach to a tab. Waiters (employees) are
-- assigned to tables and may operate only their tables.
--
-- RECURSION TRAP: table_tabs RLS must ask "does this user have a tab at this
-- table?" — i.e. read table_tabs from a table_tabs policy → infinite recursion.
-- Fix: the check lives in SECURITY DEFINER helpers (like is_platform_admin);
-- policies call the function, never the table directly.
--
-- RLS/grants copy migration 069 + the D-54 column allow-list. anon gets nothing.

begin;

-- ── table_tabs ───────────────────────────────────────────────────────────────
create table if not exists public.table_tabs (
  id          uuid primary key default gen_random_uuid(),
  table_id    uuid not null references public.tables(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  owner_uid   uuid references auth.users(id) on delete set null,
  created_by  uuid references auth.users(id) on delete set null,
  kind        text not null check (kind in ('customer', 'waiter')),
  status      text not null default 'open' check (status in ('open', 'paid', 'closed')),
  paid_at     timestamptz,
  closed_at   timestamptz,
  closed_by   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint table_tabs_name_len check (char_length(name) between 1 and 40),
  -- customer taps carry an owner; waiter taps carry their creator.
  constraint table_tabs_kind_coherence check (
    (kind = 'customer' and owner_uid is not null)
    or (kind = 'waiter' and created_by is not null)
  )
);

create index if not exists idx_table_tabs_table_status    on public.table_tabs (table_id, status);
create index if not exists idx_table_tabs_business_status on public.table_tabs (business_id, status);
create index if not exists idx_table_tabs_owner_uid       on public.table_tabs (owner_uid);

-- ── table_waiters (assignment employee ↔ table) ──────────────────────────────
create table if not exists public.table_waiters (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  table_id    uuid not null references public.tables(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (table_id, employee_id)
);

create index if not exists idx_table_waiters_business on public.table_waiters (business_id);
create index if not exists idx_table_waiters_employee on public.table_waiters (employee_id);

-- ── orders.tab_id ────────────────────────────────────────────────────────────
-- Nullable: legacy + non-table orders have no tab. table_label stays as-is
-- (legacy free text), NOT migrated.
alter table public.orders
  add column if not exists tab_id uuid references public.table_tabs(id) on delete set null;

create index if not exists idx_orders_tab_id on public.orders (tab_id);

-- ── SECURITY DEFINER helpers (break the recursion; hardened like is_platform_admin) ──
create or replace function public.user_has_tab_at_table(p_table_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.table_tabs tt
    where tt.table_id = p_table_id and tt.owner_uid = auth.uid()
  );
$$;

create or replace function public.is_waiter_of_table(p_table_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.table_waiters tw
    join public.employees e on e.id = tw.employee_id
    where tw.table_id = p_table_id and e.user_id = auth.uid()
  );
$$;

create or replace function public.owns_business_of_table(p_table_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tables t
    join public.businesses b on b.id = t.business_id
    where t.id = p_table_id and b.owner_id = auth.uid()
  );
$$;

revoke execute on function public.user_has_tab_at_table(uuid) from public, anon;
revoke execute on function public.is_waiter_of_table(uuid)    from public, anon;
revoke execute on function public.owns_business_of_table(uuid) from public, anon;
grant execute on function public.user_has_tab_at_table(uuid) to authenticated;
grant execute on function public.is_waiter_of_table(uuid)    to authenticated;
grant execute on function public.owns_business_of_table(uuid) to authenticated;

-- ── Trigger: force business_id from the table (client never writes it) ───────
create or replace function public.set_tab_business_id()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select t.business_id into new.business_id
  from public.tables t where t.id = new.table_id;
  if new.business_id is null then
    raise exception 'table_id % not found', new.table_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.set_tab_business_id() from public, anon;

create trigger trg_table_tabs_business_id
  before insert on public.table_tabs
  for each row execute function public.set_tab_business_id();

create trigger trg_table_waiters_business_id
  before insert on public.table_waiters
  for each row execute function public.set_tab_business_id();

create trigger trg_table_tabs_updated_at
  before update on public.table_tabs
  for each row execute function public.set_updated_at();

-- ── RLS: table_tabs ──────────────────────────────────────────────────────────
alter table public.table_tabs enable row level security;

-- SELECT: full transparency INSIDE the table, but only for participants.
create policy "table_tabs: participants read"
  on public.table_tabs for select to authenticated
  using (
    public.owns_business_of_table(table_id)
    or public.is_waiter_of_table(table_id)
    or public.user_has_tab_at_table(table_id)
    or public.is_platform_admin()
  );

-- INSERT: own customer tap, OR waiter creating on an assigned table.
create policy "table_tabs: create own or as waiter"
  on public.table_tabs for insert to authenticated
  with check (
    (kind = 'customer' and owner_uid = auth.uid())
    or (kind = 'waiter' and created_by = auth.uid() and public.is_waiter_of_table(table_id))
  );

-- UPDATE: only waiter/owner/admin (mark paid / close). The CUSTOMER cannot
-- update (so it can never set status='paid' itself; payment is server-confirmed).
create policy "table_tabs: waiter/owner manage"
  on public.table_tabs for update to authenticated
  using (
    public.is_waiter_of_table(table_id)
    or public.owns_business_of_table(table_id)
    or public.is_platform_admin()
  )
  with check (
    public.is_waiter_of_table(table_id)
    or public.owns_business_of_table(table_id)
    or public.is_platform_admin()
  );

-- DELETE: only business owner / admin (taps are normally CLOSED, not deleted).
create policy "table_tabs: owner/admin delete"
  on public.table_tabs for delete to authenticated
  using (public.owns_business_of_table(table_id) or public.is_platform_admin());

-- ── RLS: table_waiters ───────────────────────────────────────────────────────
alter table public.table_waiters enable row level security;

-- SELECT: owner/admin, plus a waiter reading their OWN assignments.
create policy "table_waiters: owner/admin/self read"
  on public.table_waiters for select to authenticated
  using (
    public.owns_business_of_table(table_id)
    or public.is_platform_admin()
    or exists (
      select 1 from public.employees e
      where e.id = table_waiters.employee_id and e.user_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: only business owner / admin assign.
create policy "table_waiters: owner/admin insert"
  on public.table_waiters for insert to authenticated
  with check (public.owns_business_of_table(table_id) or public.is_platform_admin());

create policy "table_waiters: owner/admin update"
  on public.table_waiters for update to authenticated
  using (public.owns_business_of_table(table_id) or public.is_platform_admin())
  with check (public.owns_business_of_table(table_id) or public.is_platform_admin());

create policy "table_waiters: owner/admin delete"
  on public.table_waiters for delete to authenticated
  using (public.owns_business_of_table(table_id) or public.is_platform_admin());

-- ── Column allow-lists (D-54). anon: nothing. business_id: never client-written. ──
revoke all on table public.table_tabs from anon;
revoke all on table public.table_tabs from authenticated;
grant select on table public.table_tabs to authenticated;
-- business_id is set by the trigger, so it is NOT insertable by the client.
grant insert (table_id, name, owner_uid, created_by, kind) on table public.table_tabs to authenticated;
grant update (name, status, paid_at, closed_at, closed_by) on table public.table_tabs to authenticated;
grant delete on table public.table_tabs to authenticated;

revoke all on table public.table_waiters from anon;
revoke all on table public.table_waiters from authenticated;
grant select on table public.table_waiters to authenticated;
grant insert (table_id, employee_id) on table public.table_waiters to authenticated;
grant delete on table public.table_waiters to authenticated;

-- orders.tab_id: deliberately NOT added to any authenticated UPDATE grant.
-- The orders UPDATE allow-list (060) stays {status, status_updated_at}. tab_id
-- is written ONLY by service_role (payment Edge Function on confirm), so a
-- client can never move an order to another tap. A future phase can add a
-- narrow, is_waiter_of_table-guarded grant if the waiter panel needs it.

commit;
