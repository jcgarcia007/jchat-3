#!/usr/bin/env bash
# JChat 3.0 — runs the SQL tests of supabase/tests/*.sql against the LOCAL Supabase database (the Docker container started by
# loadtest/local-up.sh). LOCAL ONLY: it talks to the container through `docker exec`, never to a network address, and it refuses to
# run if the container is not the local one or if DOCKER_HOST is not a local socket.
#
#   bash loadtest/run-sql-tests.sh              # every supabase/tests/0*.sql
#   bash loadtest/run-sql-tests.sh 04           # only the files whose name starts with 04
#
# Each file runs inside ONE transaction that always ends in ROLLBACK (see supabase/tests/_helpers.sql): nothing it seeds survives.
# Exit code: 0 when every check passed (skips allowed), 1 when any check failed, 2 when the target is not the local database.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_CONTAINER="supabase_db_jchat-local"
TESTS="$ROOT/supabase/tests"

export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
[ -S "$HOME/.docker/run/docker.sock" ] && export DOCKER_HOST="${DOCKER_HOST:-unix://$HOME/.docker/run/docker.sock}"
case "${DOCKER_HOST:-unix:///var/run/docker.sock}" in
  unix://*) ;;
  *) echo "REFUSING: DOCKER_HOST=$DOCKER_HOST is not a local socket"; exit 2 ;;
esac
docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER" || { echo "local database container $DB_CONTAINER is not running (bash loadtest/local-up.sh)"; exit 2; }

pass=0; fail=0; skip=0
for f in "$TESTS"/${1:-0}*.sql; do
  name="$(basename "$f")"
  [[ "$name" == _* ]] && continue
  out="$( { cat "$TESTS/_helpers.sql" "$f"; printf "\nselect 'RESULT|' || coalesce(ok::text, 'skip') || '|' || name || '|' || coalesce(detail, '') from t_results;\nrollback;\n"; } \
          | docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 2>&1 )"
  echo "── $name"
  if ! grep -q '^RESULT|' <<<"$out"; then
    echo "   ERROR: the file did not run to the end (counted as one failure)"
    grep -v -E '^(BEGIN|DO|CREATE|GRANT|SET|ROLLBACK)' <<<"$out" | head -8 | sed 's/^/   /'
    fail=$((fail+1)); continue
  fi
  while IFS='|' read -r _ status cname detail; do
    case "$status" in
      true)  echo "   ✓ $cname"; pass=$((pass+1)) ;;
      skip)  echo "   - $cname ($detail)"; skip=$((skip+1)) ;;
      *)     echo "   ✗ $cname${detail:+  [$detail]}"; fail=$((fail+1)) ;;
    esac
  done < <(grep '^RESULT|' <<<"$out")
done
echo
echo "SQL tests: $pass passed, $fail failed, $skip skipped"
[ "$fail" -eq 0 ]
