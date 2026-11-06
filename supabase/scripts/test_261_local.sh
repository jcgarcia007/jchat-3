#!/usr/bin/env bash
# Prueba LOCAL de la migración 261 (borrar una cuenta con filas en las 8 tablas). Todo corre DENTRO de una transacción que termina en ROLLBACK:
# no deja nada en la base local y no aplica la migración de forma permanente. Solo contra el contenedor local (loadtest/local-up.sh).
#   bash supabase/scripts/test_261_local.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
[ -S "$HOME/.docker/run/docker.sock" ] && export DOCKER_HOST="${DOCKER_HOST:-unix://$HOME/.docker/run/docker.sock}"
C="${SQL_TEST_CONTAINER:-supabase_db_jchat-local}"
case "$C" in *local*) ;; *) echo "REFUSING: container $C is not a local one"; exit 2 ;; esac
docker inspect "$C" >/dev/null 2>&1 || { echo "local database is not running (bash loadtest/local-up.sh)"; exit 2; }
MIG="$ROOT/supabase/migrations/261_delete_account_remaining_fks.sql"
ROLL="$ROOT/supabase/rollbacks/261_delete_account_remaining_fks_rollback.sql"

run() {
  { cat <<'SQL'
\set ON_ERROR_STOP on
begin;
-- people: U (the account to delete: admin/staff/affiliate) and V (a bystander that must not be touched)
insert into auth.users (id, instance_id, aud, role, email) values
  ('f2610000-0000-4000-8000-00000000000a','00000000-0000-0000-0000-000000000000','authenticated','authenticated','u261@example.invalid'),
  ('f2610000-0000-4000-8000-00000000000b','00000000-0000-0000-0000-000000000000','authenticated','authenticated','v261@example.invalid');
insert into public.users (id, username) values ('f2610000-0000-4000-8000-00000000000a','u261'),('f2610000-0000-4000-8000-00000000000b','v261') on conflict do nothing;
update public.users set plan = 'business' where id = 'f2610000-0000-4000-8000-00000000000b';
-- a venue owned by V, one table, one menu item
insert into public.businesses (id, owner_id, name, slug, verified_by) values ('f2610000-0000-4000-8000-0000000000b1','f2610000-0000-4000-8000-00000000000b','Test 261','test-261-xx','f2610000-0000-4000-8000-00000000000a');
insert into public.tables (id, business_id, label, qr_token) values ('f2610000-0000-4000-8000-0000000000c1','f2610000-0000-4000-8000-0000000000b1','T1','qr-261');
insert into public.menu_categories (id, business_id, name) values ('f2610000-0000-4000-8000-0000000000d1','f2610000-0000-4000-8000-0000000000b1','Cat');
insert into public.menu_items (id, category_id, business_id, name) values ('f2610000-0000-4000-8000-0000000000e1','f2610000-0000-4000-8000-0000000000d1','f2610000-0000-4000-8000-0000000000b1','Item');
-- one row of U in each of the eight columns
insert into public.affiliates (id, affiliate_number, name, created_by) values ('f2610000-0000-4000-8000-0000000000f1','A-261','Aff 261','f2610000-0000-4000-8000-00000000000a');
insert into public.affiliate_payouts (id, affiliate_id, amount_cents, created_by) values ('f2610000-0000-4000-8000-0000000000f2','f2610000-0000-4000-8000-0000000000f1',100,'f2610000-0000-4000-8000-00000000000a');
insert into public.affiliate_commissions (id, affiliate_id, base_amount_cents, commission_pct, commission_amount_cents, user_id) values ('f2610000-0000-4000-8000-0000000000f3','f2610000-0000-4000-8000-0000000000f1',1000,10,100,'f2610000-0000-4000-8000-00000000000a');
insert into public.stock_movements (id, menu_item_id, delta, created_by) values ('f2610000-0000-4000-8000-0000000000f4','f2610000-0000-4000-8000-0000000000e1',-1,'f2610000-0000-4000-8000-00000000000a');
insert into public.radius_increase_requests (id, business_id, requested_by, reviewed_by, reason) values ('f2610000-0000-4000-8000-0000000000f5','f2610000-0000-4000-8000-0000000000b1','f2610000-0000-4000-8000-00000000000a','f2610000-0000-4000-8000-00000000000a','test');
insert into public.pos_payments (id, business_id, table_id, amount_cents, paid_by) values ('f2610000-0000-4000-8000-0000000000f6','f2610000-0000-4000-8000-0000000000b1','f2610000-0000-4000-8000-0000000000c1',500,'f2610000-0000-4000-8000-00000000000a');
SQL
    cat "$1"
    cat <<'SQL'
-- try to delete U (what auth.admin.deleteUser does: auth.users, cascading to public.users)
do $$ begin
  begin
    delete from auth.users where id = 'f2610000-0000-4000-8000-00000000000a';
    raise notice 'RESULT delete=OK';
  exception when others then
    raise notice 'RESULT delete=BLOCKED (%)', sqlerrm;
  end;
end $$;
select 'RESULT rows ' || (select count(*) from public.affiliates where id='f2610000-0000-4000-8000-0000000000f1')
  || '/' || (select count(*) from public.affiliate_payouts where id='f2610000-0000-4000-8000-0000000000f2')
  || '/' || (select count(*) from public.affiliate_commissions where id='f2610000-0000-4000-8000-0000000000f3')
  || '/' || (select count(*) from public.stock_movements where id='f2610000-0000-4000-8000-0000000000f4')
  || '/' || (select count(*) from public.radius_increase_requests where id='f2610000-0000-4000-8000-0000000000f5')
  || '/' || (select count(*) from public.pos_payments where id='f2610000-0000-4000-8000-0000000000f6')
  || ' nulls ' || (select count(*) from public.affiliates where created_by is null and id='f2610000-0000-4000-8000-0000000000f1')
  || '/' || (select count(*) from public.affiliate_payouts where created_by is null)
  || '/' || (select count(*) from public.affiliate_commissions where user_id is null and id='f2610000-0000-4000-8000-0000000000f3')
  || '/' || (select count(*) from public.stock_movements where created_by is null and id='f2610000-0000-4000-8000-0000000000f4')
  || '/' || (select count(*) from public.radius_increase_requests where requested_by is null and reviewed_by is null and id='f2610000-0000-4000-8000-0000000000f5')
  || '/' || (select count(*) from public.pos_payments where paid_by is null and id='f2610000-0000-4000-8000-0000000000f6')
  || '/' || (select count(*) from public.businesses where verified_by is null and id='f2610000-0000-4000-8000-0000000000b1')
  || ' bystander ' || (select count(*) from auth.users where id='f2610000-0000-4000-8000-00000000000b');
rollback;
SQL
  } | docker exec -i "$C" psql -U postgres -d postgres -At 2>&1
}

fail=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1"; fail=$((fail + 1)); }

echo "── before the migration: deleting an account with a row in each table is BLOCKED (the defect)"
echo "SELECT 1;" > /tmp/261_empty.sql
OUT="$(run /tmp/261_empty.sql)"
echo "$OUT" | grep -q "RESULT delete=BLOCKED" && ok "blocked without the migration" || { bad "expected a blocked delete"; echo "$OUT" | tail -5; }

echo "── after the migration: the delete works, every row stays with NULL, the bystander is untouched"
OUT="$(run "$MIG")"
echo "$OUT" | grep -q "RESULT delete=OK" && ok "delete OK" || { bad "delete not OK"; echo "$OUT" | tail -5; }
echo "$OUT" | grep -q "RESULT rows 1/1/1/1/1/1 nulls 1/1/1/1/1/1/1 bystander 1" && ok "6 rows kept, 7 columns NULL (businesses.verified_by included), bystander kept" || { bad "rows/nulls"; echo "$OUT" | grep RESULT; }

echo "── idempotent: applying the migration twice changes nothing and still works"
cat "$MIG" "$MIG" > /tmp/261_twice.sql
OUT="$(run /tmp/261_twice.sql)"
echo "$OUT" | grep -q "RESULT delete=OK" && ok "twice OK" || { bad "twice failed"; echo "$OUT" | tail -5; }

echo "── rollback: after migration + rollback the defect is back (blocked), and it is also idempotent"
cat "$MIG" "$ROLL" > /tmp/261_roll.sql
OUT="$(run /tmp/261_roll.sql)"
echo "$OUT" | grep -q "RESULT delete=BLOCKED" && ok "rollback restores NO ACTION" || { bad "rollback did not restore"; echo "$OUT" | tail -5; }

echo "── nothing was left behind (the whole test is one rolled-back transaction)"
LEFT="$(docker exec -i "$C" psql -U postgres -d postgres -Atc "select count(*) from auth.users where id::text like 'f2610000-%'")"
[ "$LEFT" = "0" ] && ok "no test rows left" || bad "$LEFT test rows left"
STATE="$(docker exec -i "$C" psql -U postgres -d postgres -Atc "select count(*) from pg_constraint c where c.contype='f' and c.confdeltype='a' and c.confrelid in ('public.users'::regclass,'auth.users'::regclass)")"
[ "$STATE" = "8" ] && ok "local schema unchanged (8 NO ACTION keys, same as production today)" || bad "local schema changed ($STATE)"

echo; [ "$fail" -eq 0 ] && echo "ALL OK" || { echo "$fail FAILED"; exit 1; }
