-- ============================================================
-- JChat 3.0 — Stage 3 schema (POS & Payments)
-- Columns/tables required by Tasks 3.1–3.16. Numbered migration (Rule 3).
-- ============================================================

-- ---------- menu_categories ----------
alter table public.menu_categories add column if not exists icon         text;
alter table public.menu_categories add column if not exists is_published boolean not null default true;

-- ---------- menu_items ----------
alter table public.menu_items add column if not exists description         text;
alter table public.menu_items add column if not exists photo_url           text;
alter table public.menu_items add column if not exists dietary_tags        text[] not null default '{}';
alter table public.menu_items add column if not exists id_required         boolean not null default false;
alter table public.menu_items add column if not exists badge               text; -- best_seller|new|hot|null
alter table public.menu_items add column if not exists is_published        boolean not null default true;
alter table public.menu_items add column if not exists stock_count         int;
alter table public.menu_items add column if not exists low_stock_threshold int not null default 5;
alter table public.menu_items add column if not exists options             jsonb not null default '{}'::jsonb; -- { sizes:[{label,price_cents}], extras:[{label,price_cents}] }
alter table public.menu_items add column if not exists sort                int not null default 0;

-- ---------- orders ----------
alter table public.orders add column if not exists order_type          text not null default 'counter'; -- table|counter|gift
alter table public.orders add column if not exists gift_recipient_id   uuid references public.users(id) on delete set null;
alter table public.orders add column if not exists subtotal_cents      int not null default 0;
alter table public.orders add column if not exists tax_cents           int not null default 0;
alter table public.orders add column if not exists discount_cents      int not null default 0;
alter table public.orders add column if not exists promo_code          text;
alter table public.orders add column if not exists eta_minutes         int;
alter table public.orders add column if not exists special_instructions text;

-- ---------- order_items ----------
alter table public.order_items add column if not exists options              jsonb not null default '{}'::jsonb;
alter table public.order_items add column if not exists special_instructions text;
alter table public.order_items add column if not exists item_status          text not null default 'cooking'; -- cooking|ready

-- ---------- users: Stripe customer ----------
alter table public.users add column if not exists stripe_customer_id    text;
alter table public.users add column if not exists default_payment_method text;
alter table public.users add column if not exists role                  text; -- null|super_admin|comms_admin|log_viewer|...

-- ---------- disputes ----------
alter table public.disputes add column if not exists description  text;
alter table public.disputes add column if not exists resolution   text;
alter table public.disputes add column if not exists amount_cents int;
alter table public.disputes add column if not exists escalated_at timestamptz;
alter table public.disputes add column if not exists refund_id    text;

-- ---------- offers: dashboard builder ----------
alter table public.offers add column if not exists start_at         timestamptz;
alter table public.offers add column if not exists status           text not null default 'active'; -- active|paused|scheduled|ended
alter table public.offers add column if not exists targeting        text not null default 'all'; -- all|verified|new
alter table public.offers add column if not exists redemption_count int not null default 0;
alter table public.offers add column if not exists views            int not null default 0;
alter table public.offers add column if not exists taps             int not null default 0;
alter table public.offers add column if not exists code             text;

-- ---------- reservations ----------
create table if not exists public.reservations (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  reserved_at     timestamptz not null,
  party_size      int not null default 2,
  special_requests text,
  status          text not null default 'pending', -- pending|confirmed|rejected|no_show
  is_waitlist     boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists idx_reservations_business_id on public.reservations(business_id);
create index if not exists idx_reservations_reserved_at on public.reservations(reserved_at);

-- ---------- inventory: stock movements ----------
create table if not exists public.stock_movements (
  id           uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  business_id  uuid references public.businesses(id) on delete cascade,
  delta        int not null,
  reason       text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_stock_movements_menu_item_id on public.stock_movements(menu_item_id);

-- ---------- subscriptions ----------
create table if not exists public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references public.businesses(id) on delete cascade,
  stripe_subscription_id text,
  plan                 text not null default 'regular', -- regular|verified|business|pro
  status               text not null default 'active', -- active|past_due|suspended|trialing|canceled
  current_period_end   timestamptz,
  trial_end            timestamptz,
  grace_day            int not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (business_id)
);

-- ---------- super admin: security logs, announcements, admin roles ----------
create table if not exists public.security_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.users(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   uuid,
  detail      text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_security_logs_created_at on public.security_logs(created_at desc);

create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  created_by uuid references public.users(id) on delete set null,
  segment    jsonb not null default '{}'::jsonb,
  title      text not null,
  body       text,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  role        text not null, -- super_admin|comms_admin|log_viewer|finance|support
  permissions text[] not null default '{}',
  created_at  timestamptz not null default now(),
  unique (user_id, role)
);

-- ---------- RLS ----------
alter table public.reservations enable row level security;
alter table public.stock_movements enable row level security;
alter table public.subscriptions enable row level security;
alter table public.security_logs enable row level security;
alter table public.announcements enable row level security;
alter table public.admin_roles enable row level security;

-- Reservations: the customer and the business owner can see/manage.
create policy "reservations_customer" on public.reservations for all to authenticated
  using (user_id = auth.uid()
    or exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (user_id = auth.uid()
    or exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

create policy "stock_movements_owner" on public.stock_movements for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

create policy "subscriptions_owner_read" on public.subscriptions for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
-- Writes to subscriptions happen server-side (service_role via webhooks); no client write policy.

-- Super-admin tables: no client policies (service_role / role-gated server access only).
-- TODO(roles): add policies keyed off admin_roles / users.role when the role system lands.

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.reservations;
