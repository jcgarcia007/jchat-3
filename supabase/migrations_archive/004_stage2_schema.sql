-- ============================================================
-- JChat 3.0 — Stage 2 schema (Businesses & Chat)
-- Columns/tables required by Tasks 2.1–2.20. Mirrors 001–003
-- conventions (RLS, indexes, realtime). Migrations are numbered (Rule 4).
-- ============================================================

-- ---------- businesses: extra columns ----------
alter table public.businesses add column if not exists status            text not null default 'pending_verification'; -- pending_verification|pending|verified|rejected
alter table public.businesses add column if not exists category          text;
alter table public.businesses add column if not exists description       text;
alter table public.businesses add column if not exists cover_url         text;
alter table public.businesses add column if not exists icon_emoji        text;
alter table public.businesses add column if not exists hours             jsonb not null default '{}'::jsonb; -- { mon:{open,close,closed}, ... }
alter table public.businesses add column if not exists radius_m          int   not null default 100;
alter table public.businesses add column if not exists phone             text;
alter table public.businesses add column if not exists website           text;
alter table public.businesses add column if not exists logo_url          text;
alter table public.businesses add column if not exists menu_enabled      boolean not null default false;
alter table public.businesses add column if not exists tips_enabled      boolean not null default false;
alter table public.businesses add column if not exists tip_percentages   int[]   not null default '{10,15,20}';
alter table public.businesses add column if not exists payout_frequency  text    not null default 'weekly'; -- daily|weekly|monthly

-- ---------- rooms: extra columns ----------
alter table public.rooms add column if not exists description   text;
alter table public.rooms add column if not exists icon          text;
alter table public.rooms add column if not exists color         text;
alter table public.rooms add column if not exists slug          text;
alter table public.rooms add column if not exists ttl_hours     int;
alter table public.rooms add column if not exists notify_enabled boolean not null default true;
alter table public.rooms add column if not exists sort          int not null default 0;
alter table public.rooms add column if not exists is_main       boolean not null default false;

-- ---------- offers: extra columns ----------
alter table public.offers add column if not exists type             text; -- discount|bundle|happy_hour|free_item
alter table public.offers add column if not exists min_purchase_cents int;
alter table public.offers add column if not exists description      text;
alter table public.offers add column if not exists created_by       uuid references public.users(id) on delete set null;

-- ---------- employees: extra columns ----------
alter table public.employees add column if not exists status         text not null default 'pending'; -- pending|accepted|declined
alter table public.employees add column if not exists last_active_at timestamptz;

-- ---------- pinned_messages: extra columns ----------
alter table public.pinned_messages add column if not exists notify boolean not null default false;

-- ---------- reviews: business response ----------
alter table public.reviews add column if not exists response      text;
alter table public.reviews add column if not exists responded_at  timestamptz;
alter table public.reviews add column if not exists status        text not null default 'visible'; -- visible|reported|hidden

-- ---------- business_verifications ----------
create table if not exists public.business_verifications (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  identity_status text not null default 'pending', -- pending|approved|failed (Stripe Identity)
  daily_code      text,
  code_date       date,
  selfie_url      text,
  sms_code        text,
  sms_expires_at  timestamptz,
  sms_verified    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_business_verifications_business_id on public.business_verifications(business_id);

-- ---------- public_locations (Super Admin) ----------
create table if not exists public.public_locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null default 'park', -- park|event|square|other
  lat         double precision,
  lng         double precision,
  radius_m    int not null default 100,
  description text,
  active_from date,
  active_to   date,
  is_active   boolean not null default true,
  room_id     uuid references public.rooms(id) on delete set null,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_public_locations_is_active on public.public_locations(is_active);

-- ---------- events ----------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  description text,
  cover_url   text,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  lat         double precision,
  lng         double precision,
  room_id     uuid references public.rooms(id) on delete set null,
  status      text not null default 'upcoming', -- upcoming|live|closed
  created_at  timestamptz not null default now()
);
create index if not exists idx_events_business_id on public.events(business_id);
create index if not exists idx_events_starts_at on public.events(starts_at);

-- ---------- moderation: logs, bans, mutes ----------
create table if not exists public.moderation_logs (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  room_id     uuid references public.rooms(id) on delete cascade,
  actor_id    uuid references public.users(id) on delete set null,
  target_id   uuid references public.users(id) on delete set null,
  action      text not null, -- warn|mute|remove|ban|unban|report
  detail      text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_moderation_logs_room_id on public.moderation_logs(room_id);
create index if not exists idx_moderation_logs_business_id on public.moderation_logs(business_id);

create table if not exists public.bans (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  room_id     uuid references public.rooms(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  banned_by   uuid references public.users(id) on delete set null,
  reason      text,
  created_at  timestamptz not null default now(),
  unique (room_id, user_id)
);
create index if not exists idx_bans_user_id on public.bans(user_id);

create table if not exists public.room_mutes (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  muted_by   uuid references public.users(id) on delete set null,
  expires_at timestamptz, -- null = permanent
  created_at timestamptz not null default now(),
  unique (room_id, user_id)
);
create index if not exists idx_room_mutes_room_id on public.room_mutes(room_id);

-- ---------- map_reactions (ephemeral; also broadcast via Realtime) ----------
create table if not exists public.map_reactions (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  room_id     uuid references public.rooms(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  emoji       text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_map_reactions_room_id on public.map_reactions(room_id);

-- ---------- loyalty config ----------
create table if not exists public.loyalty_rules (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses(id) on delete cascade,
  points_per_dollar numeric not null default 1,
  is_active        boolean not null default true,
  updated_at       timestamptz not null default now(),
  unique (business_id)
);

create table if not exists public.loyalty_rewards (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  description text,
  cost_points int not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_loyalty_rewards_business_id on public.loyalty_rewards(business_id);

create table if not exists public.loyalty_tiers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null, -- Bronze|Silver|Gold
  min_points  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_loyalty_tiers_business_id on public.loyalty_tiers(business_id);

-- ---------- session caches for password rooms (optional client-side; lockout) ----------
create table if not exists public.room_access_attempts (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  fail_count int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  unique (room_id, user_id)
);

-- ---------- RLS ----------
alter table public.business_verifications enable row level security;
alter table public.public_locations enable row level security;
alter table public.events enable row level security;
alter table public.moderation_logs enable row level security;
alter table public.bans enable row level security;
alter table public.room_mutes enable row level security;
alter table public.map_reactions enable row level security;
alter table public.loyalty_rules enable row level security;
alter table public.loyalty_rewards enable row level security;
alter table public.loyalty_tiers enable row level security;
alter table public.room_access_attempts enable row level security;

-- Helper: a user owns a business
-- (inline EXISTS checks used in policies below.)

create policy "biz_verif_owner" on public.business_verifications for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

create policy "public_locations_read" on public.public_locations for select to authenticated using (true);
create policy "public_locations_admin_write" on public.public_locations for all to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
  -- TODO(super-admin): replace with a role check (Communications/Super Admin) once roles exist.

create policy "events_read" on public.events for select to authenticated using (true);
create policy "events_owner_write" on public.events for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

create policy "mod_logs_business_staff_read" on public.moderation_logs for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
create policy "mod_logs_insert" on public.moderation_logs for insert to authenticated with check (actor_id = auth.uid());

create policy "bans_read" on public.bans for select to authenticated using (true);
create policy "bans_owner_write" on public.bans for all to authenticated
  using (banned_by = auth.uid()) with check (banned_by = auth.uid());

create policy "room_mutes_read" on public.room_mutes for select to authenticated using (true);
create policy "room_mutes_owner_write" on public.room_mutes for all to authenticated
  using (muted_by = auth.uid()) with check (muted_by = auth.uid());

create policy "map_reactions_read" on public.map_reactions for select to authenticated using (true);
create policy "map_reactions_insert_own" on public.map_reactions for insert to authenticated with check (user_id = auth.uid());

create policy "loyalty_rules_read" on public.loyalty_rules for select to authenticated using (true);
create policy "loyalty_rules_owner" on public.loyalty_rules for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

create policy "loyalty_rewards_read" on public.loyalty_rewards for select to authenticated using (true);
create policy "loyalty_rewards_owner" on public.loyalty_rewards for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

create policy "loyalty_tiers_read" on public.loyalty_tiers for select to authenticated using (true);
create policy "loyalty_tiers_owner" on public.loyalty_tiers for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

create policy "room_access_attempts_own" on public.room_access_attempts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.map_reactions;
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.pinned_messages;
