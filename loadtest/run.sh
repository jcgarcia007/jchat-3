#!/usr/bin/env bash
# JChat 3.0 — runs ONE load-test scenario at ONE level against the LOCAL Supabase.
#
#   bash loadtest/run.sh <read|realtime|gifts> <VUs>          e.g.  bash loadtest/run.sh read 100
#   LOADTEST_RAMP=10s LOADTEST_HOLD=20s bash loadtest/run.sh gifts 10     # quick check
#
# Writes loadtest/results/<scenario>-<VUs>.{html,json,stats.csv} (git-ignored): the k6 web dashboard export, the summary and a
# docker-stats sample (every 10 s) used to see when the Mac / Docker saturates.
# LOCAL ONLY: the URL is read from the local stack and must be localhost / 127.0.0.1, or the script stops before k6 starts
# (loadtest/lib/common.js repeats the check inside k6). Keys are read from `supabase status` and never printed.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCENARIO="${1:?scenario: read | realtime | gifts}"
VUS="${2:?number of virtual users}"
[ -f "$ROOT/loadtest/scenarios/$SCENARIO.js" ] || { echo "unknown scenario $SCENARIO"; exit 1; }

export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
[ -S "$HOME/.docker/run/docker.sock" ] && export DOCKER_HOST="${DOCKER_HOST:-unix://$HOME/.docker/run/docker.sock}"
case "${DOCKER_HOST:-unix:///var/run/docker.sock}" in unix://*) ;; *) echo "REFUSING: DOCKER_HOST=$DOCKER_HOST is not a local socket"; exit 2 ;; esac

WORK="${LOADTEST_WORKDIR:-/tmp/jchat-local-supabase}"
ENVFILE="$(mktemp)"; trap 'rm -f "$ENVFILE"; [ -n "${SAMPLER:-}" ] && kill "$SAMPLER" 2>/dev/null' EXIT
supabase status --workdir "$WORK" -o env > "$ENVFILE" 2>/dev/null || { echo "local Supabase is not running (bash loadtest/local-up.sh)"; exit 2; }
# shellcheck disable=SC1090
. "$ENVFILE"
case "${API_URL:-}" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "REFUSING: API_URL is not localhost / 127.0.0.1"; exit 2 ;;
esac

OUT="$ROOT/loadtest/results"; mkdir -p "$OUT"
NAME="$SCENARIO-$VUS"
: > "$OUT/$NAME.stats.csv"
( while true; do docker stats --no-stream --format "$(date +%H:%M:%S),{{.Name}},{{.CPUPerc}},{{.MemUsage}}" 2>/dev/null | grep -E "db_|rest_|realtime_|kong_|auth_" >> "$OUT/$NAME.stats.csv"; sleep 10; done ) &
SAMPLER=$!

K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_PORT=-1 K6_WEB_DASHBOARD_EXPORT="$OUT/$NAME.html" \
  k6 run --quiet -e API_URL="$API_URL" -e ANON_KEY="$ANON_KEY" -e JWT_SECRET="$JWT_SECRET" -e VUS="$VUS" \
  --summary-export "$OUT/$NAME.json" "$ROOT/loadtest/scenarios/$SCENARIO.js"
RC=$?
echo "k6 exit code $RC (99 = a threshold failed)  →  loadtest/results/$NAME.{html,json}"
exit $RC
