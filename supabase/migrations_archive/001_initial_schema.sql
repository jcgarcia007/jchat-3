-- ============================================================
-- JChat 3.0 — Initial Schema Migration
-- File: supabase/migrations/001_initial_schema.sql
-- ============================================================

-- Extensions
create extension if not exists pgcrypto;

-- ============================================================
-- SHARED TRIGGER FUNCTION — set_updated_at
-- ============================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- TABLE: users
-- References auth.users (Supabase auth integration)
-- ============================================================
create table if not exists users (
  id                  uuid        primary key references auth.users(id) on delete cascade,
  username            text        not null unique,
  display_name        text,
  avatar_url          text,
  bio                 text,
  profile_theme_id    int         not null default 1,
  is_incognito        boolean     not null default false,
  is_verified         boolean     not null default false,
  push_token          text,
  language            text        not null default 'en',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table users enable row level security;

create policy "users: select own or public"
  on users for select
  using (auth.uid() = id or true);          -- public profiles are readable

create policy "users: update own"
  on users for update
  using (auth.uid() = id);

create policy "users: insert own"
  on users for insert
  with check (auth.uid() = id);

create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();

create index if not exists idx_users_username on users (username);
create index if not exists idx_users_created_at on users (created_at);

-- ============================================================
-- TABLE: businesses
-- ============================================================
create table if not exists businesses (
  id                  uuid        primary key default gen_random_uuid(),
  owner_id            uuid        not null references users(id) on delete cascade,
  name                text        not null,
  slug                text        not null unique,
  description         text,
  category            text,
  address             text,
  city                text,
  state               text,
  country             text        not null default 'US',
  lat                 double precision,
  lng                 double precision,
  phone               text,
  website             text,
  logo_url            text,
  cover_url           text,
  is_verified         boolean     not null default false,
  is_active           boolean     not null default true,
  plan                text        not null default 'free',  -- free | starter | pro | enterprise
  dashboard_theme_id  int         not null default 1,
  stripe_account_id   text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table businesses enable row level security;

create policy "businesses: public read"
  on businesses for select
  using (true);

create policy "businesses: owner insert"
  on businesses for insert
  with check (auth.uid() = owner_id);

create policy "businesses: owner update"
  on businesses for update
  using (auth.uid() = owner_id);

create policy "businesses: owner delete"
  on businesses for delete
  using (auth.uid() = owner_id);

create trigger trg_businesses_updated_at
  before update on businesses
  for each row execute function set_updated_at();

create index if not exists idx_businesses_owner_id  on businesses (owner_id);
create index if not exists idx_businesses_slug       on businesses (slug);
create index if not exists idx_businesses_lat_lng    on businesses (lat, lng);
create index if not exists idx_businesses_created_at on businesses (created_at);

-- ============================================================
-- TABLE: trials
-- ============================================================
create table if not exists trials (
  id          uuid        primary key default gen_random_uuid(),
  business_id uuid        not null references businesses(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ends_at     timestamptz not null
);

alter table trials enable row level security;

create policy "trials: owner read"
  on trials for select
  using (
    exists (
      select 1 from businesses b
      where b.id = trials.business_id and b.owner_id = auth.uid()
    )
  );

create policy "trials: owner insert"
  on trials for insert
  with check (
    exists (
      select 1 from businesses b
      where b.id = business_id and b.owner_id = auth.uid()
    )
  );

create index if not exists idx_trials_business_id on trials (business_id);

-- ============================================================
-- TABLE: employees
-- ============================================================
create table if not exists employees (
  id          uuid        primary key default gen_random_uuid(),
  business_id uuid        not null references businesses(id) on delete cascade,
  user_id     uuid        not null references users(id) on delete cascade,
  role        text        not null default 'staff',  -- owner | manager | staff
  created_at  timestamptz not null default now(),
  unique (business_id, user_id)
);

alter table employees enable row level security;

create policy "employees: owner/manager read"
  on employees for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from businesses b
      where b.id = employees.business_id and b.owner_id = auth.uid()
    )
  );

create policy "employees: owner insert"
  on employees for insert
  with check (
    exists (
      select 1 from businesses b
      where b.id = business_id and b.owner_id = auth.uid()
    )
  );

create policy "employees: owner delete"
  on employees for delete
  using (
    exists (
      select 1 from businesses b
      where b.id = employees.business_id and b.owner_id = auth.uid()
    )
  );

create index if not exists idx_employees_business_id on employees (business_id);
create index if not exists idx_employees_user_id     on employees (user_id);

-- ============================================================
-- TABLE: rooms
-- ============================================================
create table if not exists rooms (
  id                    uuid        primary key default gen_random_uuid(),
  business_id           uuid        not null references businesses(id) on delete cascade,
  parent_room_id        uuid        references rooms(id) on delete cascade,
  name                  text        not null,
  description           text,
  chat_theme_id         int         not null default 1,
  is_password_protected boolean     not null default false,
  password_hash         text,                            -- bcrypt hash, nullable
  max_occupancy         int,
  is_active             boolean     not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table rooms enable row level security;

create policy "rooms: authenticated read"
  on rooms for select
  to authenticated
  using (true);

create policy "rooms: business owner manage"
  on rooms for all
  using (
    exists (
      select 1 from businesses b
      where b.id = rooms.business_id and b.owner_id = auth.uid()
    )
  );

create trigger trg_rooms_updated_at
  before update on rooms
  for each row execute function set_updated_at();

create index if not exists idx_rooms_business_id    on rooms (business_id);
create index if not exists idx_rooms_parent_room_id on rooms (parent_room_id);
create index if not exists idx_rooms_created_at     on rooms (created_at);

-- ============================================================
-- TABLE: messages
-- ============================================================
create table if not exists messages (
  id          uuid        primary key default gen_random_uuid(),
  room_id     uuid        not null references rooms(id) on delete cascade,
  user_id     uuid        not null references users(id) on delete set null,
  body        text        not null,
  is_deleted  boolean     not null default false,
  reply_to    uuid        references messages(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table messages enable row level security;

create policy "messages: authenticated read"
  on messages for select
  to authenticated
  using (true);

create policy "messages: authenticated insert"
  on messages for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "messages: author or business owner delete"
  on messages for update
  using (
    auth.uid() = user_id
    or exists (
      select 1 from rooms r
      join businesses b on b.id = r.business_id
      where r.id = messages.room_id and b.owner_id = auth.uid()
    )
  );

create index if not exists idx_messages_room_id    on messages (room_id);
create index if not exists idx_messages_user_id    on messages (user_id);
create index if not exists idx_messages_created_at on messages (created_at);

-- ============================================================
-- TABLE: pinned_messages
-- ============================================================
create table if not exists pinned_messages (
  id          uuid        primary key default gen_random_uuid(),
  room_id     uuid        not null references rooms(id) on delete cascade,
  message_id  uuid        not null references messages(id) on delete cascade,
  pinned_by   uuid        not null references users(id) on delete set null,
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (room_id, message_id)
);

alter table pinned_messages enable row level security;

create policy "pinned_messages: authenticated read"
  on pinned_messages for select
  to authenticated
  using (true);

create policy "pinned_messages: business owner manage"
  on pinned_messages for all
  using (
    exists (
      select 1 from rooms r
      join businesses b on b.id = r.business_id
      where r.id = pinned_messages.room_id and b.owner_id = auth.uid()
    )
  );

create index if not exists idx_pinned_messages_room_id on pinned_messages (room_id);

-- ============================================================
-- TABLE: offers
-- ============================================================
create table if not exists offers (
  id          uuid        primary key default gen_random_uuid(),
  business_id uuid        not null references businesses(id) on delete cascade,
  room_id     uuid        references rooms(id) on delete set null,
  title       text        not null,
  description text,
  discount    text,                  -- e.g. "20%" or "$5 off" — freeform
  expires_at  timestamptz,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

alter table offers enable row level security;

create policy "offers: authenticated read"
  on offers for select
  to authenticated
  using (true);

create policy "offers: business owner manage"
  on offers for all
  using (
    exists (
      select 1 from businesses b
      where b.id = offers.business_id and b.owner_id = auth.uid()
    )
  );

create index if not exists idx_offers_business_id on offers (business_id);
create index if not exists idx_offers_room_id     on offers (room_id);

-- ============================================================
-- TABLE: menu_categories
-- ============================================================
create table if not exists menu_categories (
  id          uuid        primary key default gen_random_uuid(),
  business_id uuid        not null references businesses(id) on delete cascade,
  name        text        not null,
  sort        int         not null default 0,
  created_at  timestamptz not null default now()
);

alter table menu_categories enable row level security;

create policy "menu_categories: public read"
  on menu_categories for select
  using (true);

create policy "menu_categories: business owner manage"
  on menu_categories for all
  using (
    exists (
      select 1 from businesses b
      where b.id = menu_categories.business_id and b.owner_id = auth.uid()
    )
  );

create index if not exists idx_menu_categories_business_id on menu_categories (business_id);

-- ============================================================
-- TABLE: menu_items
-- ============================================================
create table if not exists menu_items (
  id           uuid        primary key default gen_random_uuid(),
  category_id  uuid        not null references menu_categories(id) on delete cascade,
  business_id  uuid        not null references businesses(id) on delete cascade,
  name         text        not null,
  description  text,
  price_cents  int         not null default 0,
  image_url    text,
  is_available boolean     not null default true,
  sort         int         not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table menu_items enable row level security;

create policy "menu_items: public read"
  on menu_items for select
  using (true);

create policy "menu_items: business owner manage"
  on menu_items for all
  using (
    exists (
      select 1 from businesses b
      where b.id = menu_items.business_id and b.owner_id = auth.uid()
    )
  );

create trigger trg_menu_items_updated_at
  before update on menu_items
  for each row execute function set_updated_at();

create index if not exists idx_menu_items_business_id on menu_items (business_id);
create index if not exists idx_menu_items_category_id on menu_items (category_id);

-- ============================================================
-- TABLE: orders
-- ============================================================
create table if not exists orders (
  id              uuid        primary key default gen_random_uuid(),
  business_id     uuid        not null references businesses(id) on delete cascade,
  user_id         uuid        not null references users(id) on delete set null,
  room_id         uuid        references rooms(id) on delete set null,
  status          text        not null default 'pending',
    -- pending | confirmed | preparing | ready | delivered | cancelled | disputed
  total_cents     int         not null default 0,
  tip_cents       int         not null default 0,
  notes           text,
  stripe_pi_id    text,               -- Stripe PaymentIntent id
  status_updated_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table orders enable row level security;

create policy "orders: customer read own"
  on orders for select
  using (auth.uid() = user_id);

create policy "orders: business owner read"
  on orders for select
  using (
    exists (
      select 1 from businesses b
      where b.id = orders.business_id and b.owner_id = auth.uid()
    )
  );

create policy "orders: customer insert"
  on orders for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "orders: business owner or customer update"
  on orders for update
  using (
    auth.uid() = user_id
    or exists (
      select 1 from businesses b
      where b.id = orders.business_id and b.owner_id = auth.uid()
    )
  );

-- Trigger: stamp status_updated_at on status change
create or replace function orders_status_changed()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.status_updated_at = now();
  end if;
  return new;
end;
$$;

create trigger trg_orders_status_change
  before update on orders
  for each row execute function orders_status_changed();

create trigger trg_orders_updated_at
  before update on orders
  for each row execute function set_updated_at();

create index if not exists idx_orders_business_id on orders (business_id);
create index if not exists idx_orders_user_id     on orders (user_id);
create index if not exists idx_orders_room_id     on orders (room_id);
create index if not exists idx_orders_status      on orders (status);
create index if not exists idx_orders_created_at  on orders (created_at);

-- ============================================================
-- TABLE: order_items
-- ============================================================
create table if not exists order_items (
  id           uuid  primary key default gen_random_uuid(),
  order_id     uuid  not null references orders(id) on delete cascade,
  menu_item_id uuid  not null references menu_items(id) on delete restrict,
  qty          int   not null default 1,
  price_cents  int   not null,         -- snapshot at time of order
  notes        text,
  created_at   timestamptz not null default now()
);

alter table order_items enable row level security;

create policy "order_items: read via order"
  on order_items for select
  using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and (
          o.user_id = auth.uid()
          or exists (
            select 1 from businesses b
            where b.id = o.business_id and b.owner_id = auth.uid()
          )
        )
    )
  );

create policy "order_items: insert via order"
  on order_items for insert
  to authenticated
  with check (
    exists (
      select 1 from orders o
      where o.id = order_id and o.user_id = auth.uid()
    )
  );

create index if not exists idx_order_items_order_id     on order_items (order_id);
create index if not exists idx_order_items_menu_item_id on order_items (menu_item_id);

-- ============================================================
-- TABLE: gifts
-- ============================================================
create table if not exists gifts (
  id          uuid        primary key default gen_random_uuid(),
  from_user   uuid        not null references users(id) on delete set null,
  to_user     uuid        not null references users(id) on delete set null,
  room_id     uuid        references rooms(id) on delete set null,
  type        text        not null,        -- e.g. 'drink', 'beer', 'star', etc.
  amount_cents int        not null default 0,
  message     text,
  created_at  timestamptz not null default now()
);

alter table gifts enable row level security;

create policy "gifts: sender or recipient read"
  on gifts for select
  using (auth.uid() = from_user or auth.uid() = to_user);

create policy "gifts: authenticated insert"
  on gifts for insert
  to authenticated
  with check (auth.uid() = from_user);

create index if not exists idx_gifts_from_user  on gifts (from_user);
create index if not exists idx_gifts_to_user    on gifts (to_user);
create index if not exists idx_gifts_room_id    on gifts (room_id);
create index if not exists idx_gifts_created_at on gifts (created_at);

-- ============================================================
-- TABLE: check_ins
-- ============================================================
create table if not exists check_ins (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references users(id) on delete cascade,
  business_id uuid        not null references businesses(id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table check_ins enable row level security;

create policy "check_ins: user read own"
  on check_ins for select
  using (auth.uid() = user_id);

create policy "check_ins: business owner read"
  on check_ins for select
  using (
    exists (
      select 1 from businesses b
      where b.id = check_ins.business_id and b.owner_id = auth.uid()
    )
  );

create policy "check_ins: authenticated insert"
  on check_ins for insert
  to authenticated
  with check (auth.uid() = user_id);

create index if not exists idx_check_ins_user_id     on check_ins (user_id);
create index if not exists idx_check_ins_business_id on check_ins (business_id);
create index if not exists idx_check_ins_created_at  on check_ins (created_at);

-- ============================================================
-- TABLE: loyalty_points
-- ============================================================
create table if not exists loyalty_points (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references users(id) on delete cascade,
  business_id uuid        not null references businesses(id) on delete cascade,
  points      int         not null default 0,
  updated_at  timestamptz not null default now(),
  unique (user_id, business_id)
);

alter table loyalty_points enable row level security;

create policy "loyalty_points: user read own"
  on loyalty_points for select
  using (auth.uid() = user_id);

create policy "loyalty_points: business owner read"
  on loyalty_points for select
  using (
    exists (
      select 1 from businesses b
      where b.id = loyalty_points.business_id and b.owner_id = auth.uid()
    )
  );

-- Points are mutated by server-side functions only (upsert via RPC)
create policy "loyalty_points: service role upsert"
  on loyalty_points for all
  to service_role
  using (true);

create index if not exists idx_loyalty_points_user_id     on loyalty_points (user_id);
create index if not exists idx_loyalty_points_business_id on loyalty_points (business_id);

-- ============================================================
-- TABLE: reviews
-- ============================================================
create table if not exists reviews (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references users(id) on delete cascade,
  business_id uuid        not null references businesses(id) on delete cascade,
  rating      smallint    not null check (rating between 1 and 5),
  body        text,
  created_at  timestamptz not null default now(),
  unique (user_id, business_id)
);

alter table reviews enable row level security;

create policy "reviews: public read"
  on reviews for select
  using (true);

create policy "reviews: authenticated insert own"
  on reviews for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "reviews: author update"
  on reviews for update
  using (auth.uid() = user_id);

create policy "reviews: author delete"
  on reviews for delete
  using (auth.uid() = user_id);

create index if not exists idx_reviews_business_id on reviews (business_id);
create index if not exists idx_reviews_user_id     on reviews (user_id);
create index if not exists idx_reviews_created_at  on reviews (created_at);

-- ============================================================
-- TABLE: disputes
-- ============================================================
create table if not exists disputes (
  id          uuid        primary key default gen_random_uuid(),
  order_id    uuid        not null references orders(id) on delete cascade,
  opened_by   uuid        not null references users(id) on delete set null,
  status      text        not null default 'open',   -- open | in_review | resolved | closed
  reason      text        not null,
  resolution  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table disputes enable row level security;

create policy "disputes: parties read"
  on disputes for select
  using (
    auth.uid() = opened_by
    or exists (
      select 1 from orders o
      join businesses b on b.id = o.business_id
      where o.id = disputes.order_id and b.owner_id = auth.uid()
    )
  );

create policy "disputes: authenticated open"
  on disputes for insert
  to authenticated
  with check (auth.uid() = opened_by);

create policy "disputes: business owner update"
  on disputes for update
  using (
    exists (
      select 1 from orders o
      join businesses b on b.id = o.business_id
      where o.id = disputes.order_id and b.owner_id = auth.uid()
    )
  );

create trigger trg_disputes_updated_at
  before update on disputes
  for each row execute function set_updated_at();

create index if not exists idx_disputes_order_id   on disputes (order_id);
create index if not exists idx_disputes_opened_by  on disputes (opened_by);
create index if not exists idx_disputes_created_at on disputes (created_at);

-- ============================================================
-- TABLE: service_calls
-- Used by Realtime + dashboard Alerts/Service section
-- ============================================================
create table if not exists service_calls (
  id          uuid        primary key default gen_random_uuid(),
  room_id     uuid        not null references rooms(id) on delete cascade,
  business_id uuid        not null references businesses(id) on delete cascade,
  user_id     uuid        references users(id) on delete set null,
  status      text        not null default 'pending',  -- pending | acknowledged | resolved
  type        text        not null default 'waiter',   -- waiter | bill | other
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table service_calls enable row level security;

create policy "service_calls: business owner read"
  on service_calls for select
  using (
    exists (
      select 1 from businesses b
      where b.id = service_calls.business_id and b.owner_id = auth.uid()
    )
  );

create policy "service_calls: authenticated insert"
  on service_calls for insert
  to authenticated
  with check (true);

create policy "service_calls: business owner update"
  on service_calls for update
  using (
    exists (
      select 1 from businesses b
      where b.id = service_calls.business_id and b.owner_id = auth.uid()
    )
  );

create trigger trg_service_calls_updated_at
  before update on service_calls
  for each row execute function set_updated_at();

create index if not exists idx_service_calls_business_id on service_calls (business_id);
create index if not exists idx_service_calls_room_id     on service_calls (room_id);
create index if not exists idx_service_calls_user_id     on service_calls (user_id);
create index if not exists idx_service_calls_created_at  on service_calls (created_at);

-- ============================================================
-- TABLE: follows
-- Social graph — users following other users
-- ============================================================
create table if not exists follows (
  id          uuid        primary key default gen_random_uuid(),
  follower_id uuid        not null references users(id) on delete cascade,
  following_id uuid       not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (follower_id, following_id)
);

alter table follows enable row level security;

create policy "follows: authenticated read"
  on follows for select
  to authenticated
  using (true);

create policy "follows: authenticated insert own"
  on follows for insert
  to authenticated
  with check (auth.uid() = follower_id);

create policy "follows: delete own"
  on follows for delete
  using (auth.uid() = follower_id);

create index if not exists idx_follows_follower_id  on follows (follower_id);
create index if not exists idx_follows_following_id on follows (following_id);

-- ============================================================
-- TABLE: notifications
-- ============================================================
create table if not exists notifications (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references users(id) on delete cascade,
  type        text        not null,   -- follow | message | gift | offer | order_update | check_in
  payload     jsonb,
  is_read     boolean     not null default false,
  created_at  timestamptz not null default now()
);

alter table notifications enable row level security;

create policy "notifications: user read own"
  on notifications for select
  using (auth.uid() = user_id);

create policy "notifications: user update own"
  on notifications for update
  using (auth.uid() = user_id);

create policy "notifications: service role insert"
  on notifications for insert
  to service_role
  with check (true);

create index if not exists idx_notifications_user_id    on notifications (user_id);
create index if not exists idx_notifications_is_read    on notifications (user_id, is_read);
create index if not exists idx_notifications_created_at on notifications (created_at);

-- ============================================================
-- REALTIME PUBLICATION
-- ============================================================
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table service_calls;

-- ============================================================
-- END OF MIGRATION 001
-- ============================================================
