-- ============================================================
-- JChat 3.0 — Custom Roles system (Task 2.9 extension)
-- Owners can define named roles with granular permission toggles.
-- Existing employees.role (free-text) is preserved; custom_role_id
-- is additive — no existing data is affected.
-- ============================================================

-- ── Permission keys (22 total) ────────────────────────────────────────────
-- Stored in custom_roles.permissions as { "<key>": true | false }.
-- Absence of a key is treated as false by the application.
--
--  orders_view            — view the order queue
--  orders_process         — accept / start / complete orders
--  orders_mark_delivered  — mark an order as delivered
--  orders_assigned_only   — see only orders assigned to self
--  kds_view               — view the Kitchen Display System
--  kds_mark_ready         — mark KDS items ready
--  menu_edit              — add / edit / delete menu items
--  inventory_manage       — manage inventory stock levels
--  offers_manage          — create / edit / delete offers
--  availability_toggle    — toggle item availability on/off
--  chat_moderate          — warn / mute users in chat rooms
--  chat_ban               — ban users from chat rooms
--  chat_pin               — pin / unpin messages
--  rooms_passwords        — set / change room passwords
--  rooms_manage           — create / edit chat rooms
--  service_receive        — receive service alerts and tickets
--  alerts_view            — view the operational alerts dashboard
--  reservations_manage    — manage table reservations
--  reports_view           — view sales and activity reports
--  analytics_view         — view the analytics dashboard
--  exports_manage         — export data (CSV, PDF)
--  loyalty_manage         — manage loyalty programs and rewards
--
-- Billing and payout permissions are intentionally omitted — those
-- are always owner-only and must never be delegated.
-- ============================================================


-- ── Table: custom_roles ───────────────────────────────────────────────────

create table if not exists public.custom_roles (
  id            uuid        primary key default gen_random_uuid(),
  business_id   uuid        not null references public.businesses(id) on delete cascade,
  name          text        not null,
  permissions   jsonb       not null default '{}',
  base_template text,                              -- originating template name, or null
  created_at    timestamptz not null default now(),

  constraint custom_roles_business_name_unique unique (business_id, name)
);

create index if not exists idx_custom_roles_business_id
  on public.custom_roles (business_id);

alter table public.custom_roles enable row level security;

-- The business owner, any employee of the business, and platform admins
-- may read the roles defined for that business.
create policy "custom_roles: read"
  on public.custom_roles for select
  to authenticated
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id
        and b.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.employees e
      where e.business_id = custom_roles.business_id
        and e.user_id = auth.uid()
    )
    or public.is_platform_admin()
  );

-- Only the business owner may create custom roles.
create policy "custom_roles: owner insert"
  on public.custom_roles for insert
  to authenticated
  with check (
    exists (
      select 1 from public.businesses b
      where b.id = business_id
        and b.owner_id = auth.uid()
    )
  );

-- Only the business owner may update custom roles.
create policy "custom_roles: owner update"
  on public.custom_roles for update
  to authenticated
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id
        and b.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.businesses b
      where b.id = business_id
        and b.owner_id = auth.uid()
    )
  );

-- Only the business owner may delete custom roles.
create policy "custom_roles: owner delete"
  on public.custom_roles for delete
  to authenticated
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id
        and b.owner_id = auth.uid()
    )
  );


-- ── Column: employees.custom_role_id ─────────────────────────────────────
-- on delete set null: deleting a custom role does not remove employees;
-- they simply revert to relying on the plain-text role column.

alter table public.employees
  add column if not exists custom_role_id uuid
    references public.custom_roles(id) on delete set null;
