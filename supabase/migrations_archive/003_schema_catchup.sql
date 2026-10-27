-- ============================================================
-- JChat 3.0 — Schema catch-up (Stage 1 follow-up)
-- Adds the users columns and tables that Stage 1 features referenced
-- via // TODO(schema). Mirrors 001/002 conventions (RLS, indexes).
-- ============================================================

-- ---------- users: missing columns ----------
alter table public.users add column if not exists privacy_settings   jsonb   not null default '{}'::jsonb;
alter table public.users add column if not exists onboarding_completed boolean not null default false;
alter table public.users add column if not exists city                text;
alter table public.users add column if not exists cover_url           text;
alter table public.users add column if not exists settings            jsonb   not null default '{}'::jsonb;

-- ---------- blocks ----------
create table if not exists public.blocks (
  id         uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists idx_blocks_blocker_id on public.blocks(blocker_id);
create index if not exists idx_blocks_blocked_id on public.blocks(blocked_id);

-- ---------- follow_requests ----------
create table if not exists public.follow_requests (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.users(id) on delete cascade,
  target_id    uuid not null references public.users(id) on delete cascade,
  status       text not null default 'pending', -- pending | accepted | declined
  created_at   timestamptz not null default now(),
  unique (requester_id, target_id),
  check (requester_id <> target_id)
);
create index if not exists idx_follow_requests_target_id on public.follow_requests(target_id);
create index if not exists idx_follow_requests_requester_id on public.follow_requests(requester_id);

-- ---------- reports (routed to Super Admin review queue) ----------
create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references public.users(id) on delete cascade,
  reported_user_id uuid references public.users(id) on delete cascade,
  content_type    text not null default 'user',   -- user | post | message | review | business
  content_id      uuid,
  reason          text not null,
  status          text not null default 'pending', -- pending | reviewing | resolved | dismissed
  created_at      timestamptz not null default now()
);
create index if not exists idx_reports_status on public.reports(status);
create index if not exists idx_reports_reported_user_id on public.reports(reported_user_id);
create index if not exists idx_reports_created_at on public.reports(created_at desc);

-- ---------- RLS ----------
alter table public.blocks enable row level security;
alter table public.follow_requests enable row level security;
alter table public.reports enable row level security;

-- Blocks: only the blocker manages/sees their own block rows.
create policy "blocks_own" on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- Follow requests: requester and target can see; requester creates; target updates status.
create policy "follow_requests_visible" on public.follow_requests for select to authenticated
  using (requester_id = auth.uid() or target_id = auth.uid());
create policy "follow_requests_create" on public.follow_requests for insert to authenticated
  with check (requester_id = auth.uid());
create policy "follow_requests_target_update" on public.follow_requests for update to authenticated
  using (target_id = auth.uid());
create policy "follow_requests_requester_delete" on public.follow_requests for delete to authenticated
  using (requester_id = auth.uid());

-- Reports: a user may create reports and read their own; review/triage is server-side (service_role).
create policy "reports_create" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy "reports_read_own" on public.reports for select to authenticated
  using (reporter_id = auth.uid());
