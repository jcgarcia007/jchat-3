-- JChat 3.0 load test seed. LOCAL DATABASE ONLY (loadtest/seed.sh pipes this into the local Docker container and nothing else).
-- 1001 users (auth + public; n = 0 owns the venue), 1 venue with a room, 10 tables and a 20-item menu, a live room_geo_presence
-- for every user, 200 messages. Idempotent: running it again refreshes the presence (it expires after 1 day) and adds nothing else.
-- User ids: a0000000-0000-4000-8000-<n, 12 digits>.
begin;
set local session_replication_role = replica;   -- the plan-limit trigger would refuse a business for a user with no plan

insert into auth.users (id, instance_id, aud, role, email)
select ('a0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'load' || n || '@example.invalid'
from generate_series(0, 1000) n
on conflict do nothing;

insert into public.users (id, username)
select ('a0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'load' || n from generate_series(0, 1000) n
on conflict do nothing;

insert into public.businesses (id, owner_id, name, slug, lat, lng)
values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000000', 'Load Test Bar', 'load-test-bar', 40.0, -74.0)
on conflict do nothing;

insert into public.rooms (id, business_id, name)
values ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Main')
on conflict do nothing;

insert into public.menu_categories (id, business_id, name)
values ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Food')
on conflict do nothing;

insert into public.menu_items (id, category_id, business_id, name, price_cents)
select ('e0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'd0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Item ' || n, 300 + n * 25
from generate_series(1, 20) n
on conflict do nothing;

insert into public.tables (id, business_id, label, qr_token, is_active)
select ('f0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'b0000000-0000-4000-8000-000000000001', n::text, 'load-tok-' || n, true
from generate_series(1, 10) n
on conflict do nothing;

-- everyone is "in the venue": a live geo-presence (refreshed on every run)
insert into public.room_geo_presence (room_id, user_id, expires_at)
select 'c0000000-0000-4000-8000-000000000001', ('a0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, now() + interval '1 day'
from generate_series(1, 1000) n
on conflict (room_id, user_id) do update set expires_at = excluded.expires_at;

-- some history to read
insert into public.messages (room_id, user_id, body, created_at)
select 'c0000000-0000-4000-8000-000000000001', ('a0000000-0000-4000-8000-' || lpad(((n % 1000) + 1)::text, 12, '0'))::uuid, 'seed message ' || n, now() - (n * interval '20 seconds')
from generate_series(1, 200) n
where not exists (select 1 from public.messages where body = 'seed message 1');

commit;
select 'seeded: ' || (select count(*) from public.users where username like 'load%') || ' users, '
  || (select count(*) from public.room_geo_presence where room_id = 'c0000000-0000-4000-8000-000000000001') || ' live presences, '
  || (select count(*) from public.messages where room_id = 'c0000000-0000-4000-8000-000000000001') || ' messages';
