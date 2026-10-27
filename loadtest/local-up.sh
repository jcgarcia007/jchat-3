#!/usr/bin/env bash
# JChat 3.0 — starts a LOCAL Supabase (Docker) built from supabase/migrations (245_baseline.sql + 246_baseline_extras.sql + anything newer). LOCAL ONLY.
#
#   bash loadtest/local-up.sh            # start (or, if it is already running, `supabase db reset`) and report what the database holds
#   bash loadtest/local-up.sh --down     # supabase stop
#
# The history 001-244 lives in supabase/migrations_archive/ and is not read by the CLI, so the real `supabase start` / `db reset` work
# (the old duplicate versions 033/034 and the 173a/173b/198c suffixes are only in the archive). The scratch workdir below has its own project
# id and is never linked to a remote project; its migrations folder is a symlink to the repo's.
#
# SAFETY: nothing here can reach the cloud. The only Postgres touched is the one in the local Docker container. The script refuses to run if
# DOCKER_HOST is not a local socket.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${LOADTEST_WORKDIR:-/tmp/jchat-local-supabase}"
PROJECT_ID="jchat-local"
DB_CONTAINER="supabase_db_${PROJECT_ID}"
EXCLUDE="studio,imgproxy,vector,analytics,edge-runtime,functions,inbucket"

export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
[ -S "$HOME/.docker/run/docker.sock" ] && export DOCKER_HOST="${DOCKER_HOST:-unix://$HOME/.docker/run/docker.sock}"
case "${DOCKER_HOST:-unix:///var/run/docker.sock}" in
  unix://*) ;;
  *) echo "REFUSING: DOCKER_HOST=$DOCKER_HOST is not a local socket"; exit 2 ;;
esac

if [ "${1:-}" = "--down" ]; then
  supabase stop --workdir "$WORK" --no-backup 2>&1 | tail -3
  exit 0
fi

command -v docker >/dev/null || { echo "docker not found"; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker is not running (open Docker Desktop)"; exit 1; }
command -v supabase >/dev/null || { echo "supabase CLI not found"; exit 1; }

mkdir -p "$WORK/supabase"
cat > "$WORK/supabase/config.toml" <<EOF
project_id = "$PROJECT_ID"
[api]
port = 54321
[db]
port = 54322
EOF
rm -rf "$WORK/supabase/migrations"
ln -s "$ROOT/supabase/migrations" "$WORK/supabase/migrations"

if docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  supabase db reset --workdir "$WORK" --local 2>&1 | tail -4 || { echo "supabase db reset failed"; exit 1; }
else
  supabase start --workdir "$WORK" -x "$EXCLUDE" 2>&1 | tail -2 || { echo "supabase start failed"; exit 1; }
fi

docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -At <<'SQL'
select 'migrations: ' || string_agg(version, ', ' order by version) from supabase_migrations.schema_migrations;
select 'public tables=' || (select count(*) from pg_tables where schemaname = 'public') || ' functions=' || (select count(*) from pg_proc where pronamespace = 'public'::regnamespace)
  || ' | buckets=' || (select count(*) from storage.buckets) || ' storage policies=' || (select count(*) from pg_policies where schemaname = 'storage')
  || ' | cron jobs=' || (select count(*) from cron.job) || ' | auth.users triggers=' || (select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal);
SQL
echo "API URL: http://127.0.0.1:54321   DB: postgresql://postgres:postgres@127.0.0.1:54322/postgres"
