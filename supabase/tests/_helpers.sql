-- JChat 3.0 — shared helpers of the SQL tests (supabase/tests/*.sql). LOCAL DATABASE ONLY: loadtest/run-sql-tests.sh refuses any other target.
-- Every test runs in ONE transaction that ends in ROLLBACK, so nothing a test seeds survives. Prepended to each test file by the runner.
--   pg_temp.t_ok(cond, name)              records a passed/failed check (a failure does not stop the run; the runner counts them)
--   pg_temp.t_raises(sql, sqlstate-or-msg, name)  the statement must raise an exception whose MESSAGE contains the 2nd argument
--   pg_temp.as_user(uuid) / as_service()  switch the session to that user's JWT (role authenticated) or back to postgres
--   pg_temp.seed_user(n) / seed_venue()   synthetic users (…0n ids) and one venue (room, menu item, table 1)
begin;

-- Safety: the gift_offer_dispatch trigger posts to the PRODUCTION gift-worker URL if the vault holds push_webhook_secret. A local
-- database must never have it; stop immediately if it does.
do $$ begin
  if exists (select 1 from vault.decrypted_secrets where name = 'push_webhook_secret') then
    raise exception 'REFUSING: this database holds push_webhook_secret (gift_offer_dispatch would call production). Not a clean local DB.';
  end if;
end $$;

create temp table t_results (name text, ok boolean, detail text) on commit drop;
grant all on t_results to public;

create function pg_temp.t_ok(p_cond boolean, p_name text, p_detail text default null) returns void language plpgsql as $$
begin insert into t_results values (p_name, coalesce(p_cond, false), p_detail); end $$;

create function pg_temp.t_skip(p_name text, p_reason text) returns void language plpgsql as $$
begin insert into t_results values (p_name, null, 'SKIP: ' || p_reason); end $$;

create function pg_temp.t_raises(p_sql text, p_needle text, p_name text) returns void language plpgsql as $$
declare v_msg text; v_state text;
begin
  begin
    execute p_sql;
    insert into t_results values (p_name, false, 'did not raise');
  exception when others then
    get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
    insert into t_results values (p_name, (v_msg ilike '%' || p_needle || '%') or v_state = p_needle, 'raised ' || v_state || ': ' || v_msg);
  end;
end $$;

create function pg_temp.uid(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

create function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_id::text, true);
  set local role authenticated;
end $$;

create function pg_temp.as_service() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create function pg_temp.seed_user(n int) returns uuid language plpgsql as $$
declare v uuid := pg_temp.uid(n);
begin
  insert into auth.users (id, instance_id, aud, role, email) values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sqltest' || n || '@example.invalid') on conflict do nothing;
  insert into public.users (id, username) values (v, 'sqltest' || n) on conflict do nothing;
  return v;
end $$;

-- one venue owned by user 1 with a room, a menu item and table "1"; returns the business id
create function pg_temp.seed_venue() returns uuid language plpgsql as $$
declare v_biz uuid := '10000000-0000-4000-8000-000000000001'; v_cat uuid := '10000000-0000-4000-8000-0000000000c1';
begin
  perform pg_temp.seed_user(1);
  -- the plan-limit trigger (enforce_business_limit) would refuse a business for a user with no plan: seed with user triggers off
  set local session_replication_role = replica;
  insert into public.businesses (id, owner_id, name, slug, lat, lng) values (v_biz, pg_temp.uid(1), 'Bar SQL Test', 'bar-sql-test', 40.0, -74.0);
  set local session_replication_role = origin;
  insert into public.rooms (id, business_id, name) values ('10000000-0000-4000-8000-0000000000a1', v_biz, 'Main');
  insert into public.menu_categories (id, business_id, name) values (v_cat, v_biz, 'Food');
  insert into public.menu_items (id, category_id, business_id, name, price_cents) values ('10000000-0000-4000-8000-0000000000b1', v_cat, v_biz, 'Corn dog', 500);
  return v_biz;
end $$;

create function pg_temp.present(p_user uuid, p_minutes int default 10) returns void language sql as $$
  insert into public.room_geo_presence (room_id, user_id, expires_at) values ('10000000-0000-4000-8000-0000000000a1', p_user, now() + make_interval(mins => p_minutes))
  on conflict do nothing
$$;
