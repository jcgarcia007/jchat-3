#!/usr/bin/env bash
# JChat 3.0 — seeds the LOCAL database for the load tests (loadtest/seed.sql). Run loadtest/local-up.sh first.
# LOCAL ONLY: it pipes into the local Docker container; it refuses a non-local DOCKER_HOST.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
[ -S "$HOME/.docker/run/docker.sock" ] && export DOCKER_HOST="${DOCKER_HOST:-unix://$HOME/.docker/run/docker.sock}"
case "${DOCKER_HOST:-unix:///var/run/docker.sock}" in unix://*) ;; *) echo "REFUSING: DOCKER_HOST=$DOCKER_HOST is not a local socket"; exit 2 ;; esac
docker ps --format '{{.Names}}' | grep -qx supabase_db_jchat-local || { echo "local database is not running (bash loadtest/local-up.sh)"; exit 2; }
docker exec -i supabase_db_jchat-local psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 < "$ROOT/loadtest/seed.sql" | tail -1
