#!/usr/bin/env bash
# Prueba LOCAL de la migración 264 (public.apple_tokens). Todo dentro de una transacción con ROLLBACK; solo contra el contenedor local.
#   bash supabase/scripts/test_264_local.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
[ -S "$HOME/.docker/run/docker.sock" ] && export DOCKER_HOST="${DOCKER_HOST:-unix://$HOME/.docker/run/docker.sock}"
C="${SQL_TEST_CONTAINER:-supabase_db_jchat-local}"
case "$C" in *local*) ;; *) echo "REFUSING: container $C is not a local one"; exit 2 ;; esac
docker inspect "$C" >/dev/null 2>&1 || { echo "local database is not running (bash loadtest/local-up.sh)"; exit 2; }
MIG="$ROOT/supabase/migrations/264_apple_tokens.sql"
fail=0
ok() { echo "  ✓ $1"; }
bad() { echo "  ✗ $1"; fail=1; }

OUT=$({ echo '\set ON_ERROR_STOP on'; echo 'begin;'; cat "$MIG"; cat "$MIG"; cat <<'SQL'
insert into auth.users (id, instance_id, aud, role, email) values
  ('f2640000-0000-4000-8000-00000000000a','00000000-0000-0000-0000-000000000000','authenticated','authenticated','u264@example.invalid');
insert into public.apple_tokens (user_id, refresh_token_enc) values ('f2640000-0000-4000-8000-00000000000a', decode(repeat('ab', 40), 'hex'));
select 'T:rows=' || count(*) from public.apple_tokens;
select 'T:default_client=' || client_id from public.apple_tokens;
select 'T:rls=' || relrowsecurity from pg_class where oid = 'public.apple_tokens'::regclass;
select 'T:policies=' || count(*) from pg_policies where tablename = 'apple_tokens';
select 'T:anon_priv=' || has_table_privilege('anon', 'public.apple_tokens', 'select');
select 'T:auth_priv=' || has_table_privilege('authenticated', 'public.apple_tokens', 'select');
select 'T:service_priv=' || has_table_privilege('service_role', 'public.apple_tokens', 'insert');
savepoint s;
do $$ begin insert into public.apple_tokens (user_id, refresh_token_enc) values (gen_random_uuid(), decode('abcd','hex')); exception when others then raise notice 'T:short_blob_rejected=%', sqlstate; end $$;
rollback to savepoint s;
delete from auth.users where id = 'f2640000-0000-4000-8000-00000000000a';
select 'T:after_user_delete=' || count(*) from public.apple_tokens;
rollback;
SQL
} | docker exec -i "$C" psql -U postgres -d postgres -At 2>&1)
echo "$OUT" | grep -E "ERROR" && fail=1
chk() { echo "$OUT" | grep -q "$1" && ok "$2" || bad "$2"; }
chk "T:rows=1" "token row stored (migration applied twice: idempotent)"
chk "T:default_client=com.otunitylabs.jchat" "default client_id = bundle id"
chk "T:rls=t" "RLS enabled"
chk "T:policies=0" "no policies"
chk "T:anon_priv=false" "anon has no access"
chk "T:auth_priv=false" "authenticated has no access"
chk "T:service_priv=true" "service_role can write"
chk "T:short_blob_rejected=23514" "check rejects a too-short blob"
chk "T:after_user_delete=0" "deleting auth.users cascades the token"
[ "$fail" = 0 ] && echo "ALL OK" || { echo "FAILED"; exit 1; }
