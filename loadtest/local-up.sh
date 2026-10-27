#!/usr/bin/env bash
# JChat 3.0 — starts a LOCAL Supabase (Docker) and applies every migration of supabase/migrations to it. LOCAL ONLY.
#
#   bash loadtest/local-up.sh            # start + apply all migrations (failures are logged, the rest keeps going)
#   bash loadtest/local-up.sh --down     # supabase stop
#
# Why not `supabase start` / `supabase db reset` on the repo's own supabase/ folder: the CLI uses the numeric prefix of each file as its
# version, and the repo has two files with the prefix 033, two with 034 and three with a letter suffix (173a, 173b, 198c), so the CLI
# aborts at 033 ("duplicate key ... schema_migrations_pkey") or skips them. The migrations already applied in production are NOT
# renamed. Instead this script starts Supabase from a SCRATCH workdir with no migrations and feeds every file to the local Postgres one
# by one, in file-name order, each in its own transaction; a failing file is logged and the loop goes on.
#
# SAFETY: nothing here can reach the cloud. The scratch workdir has its own project id and is never linked to a remote project; the only
# Postgres touched is the one in the local Docker container. The script refuses to run if DOCKER_HOST is not a local socket.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${LOADTEST_WORKDIR:-/tmp/jchat-local-supabase}"
PROJECT_ID="jchat-local"
DB_CONTAINER="supabase_db_${PROJECT_ID}"
RESULTS="$ROOT/loadtest/results"
LOG="$RESULTS/migrations-local.log"

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

mkdir -p "$WORK/supabase/migrations" "$RESULTS"
cat > "$WORK/supabase/config.toml" <<EOF
project_id = "$PROJECT_ID"
[api]
port = 54321
[db]
port = 54322
EOF

if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  supabase start --workdir "$WORK" -x studio,imgproxy,vector,analytics,edge-runtime,functions,inbucket || { echo "supabase start failed"; exit 1; }
fi

# Reset the public schema so the run is repeatable.
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q <<'SQL'
drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
SQL

: > "$LOG"
ok=0; failed=0
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  name="$(basename "$f")"
  if out="$(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 -q < "$f" 2>&1)"; then
    ok=$((ok+1))
  else
    failed=$((failed+1))
    { echo "=== FAILED: $name"; echo "$out" | head -6; } >> "$LOG"
  fi
done
echo "migrations applied locally: $ok ok, $failed failed (details: loadtest/results/migrations-local.log)"
echo "API URL: http://127.0.0.1:54321   DB: postgresql://postgres:postgres@127.0.0.1:54322/postgres"
