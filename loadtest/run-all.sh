#!/usr/bin/env bash
# JChat 3.0 — the whole matrix: read, realtime, gifts × 10, 100, 1000 VUs (1 min ramp + 3 min hold each ≈ 40 min), LOCAL ONLY.
#
#   bash loadtest/run-all.sh                 # everything
#   bash loadtest/run-all.sh read gifts      # only those scenarios
#
# Saturation rule: if a level ends with >20 % failed requests (or >50 % failed realtime joins), the HIGHER levels of that scenario
# are skipped and loadtest/results/saturated.txt says where it stopped. The Mac / Docker is never pushed past a level that already
# failed. Between levels it waits 30 s so the database settles.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/loadtest/results"; mkdir -p "$OUT"
SCENARIOS=("$@"); [ ${#SCENARIOS[@]} -eq 0 ] && SCENARIOS=(read realtime gifts)
: > "$OUT/saturated.txt"

bash "$ROOT/loadtest/seed.sh" || exit 2     # refreshes the presence (it lasts 1 day) and checks the local database is up

for s in "${SCENARIOS[@]}"; do
  for v in 10 100 1000; do
    echo "=== $s @ $v VUs  ($(date +%H:%M:%S))"
    bash "$ROOT/loadtest/run.sh" "$s" "$v" 2>&1 | tail -3
    bad="$(python3 - "$OUT/$s-$v.json" <<'EOF'
import json, sys
try:
    m = json.load(open(sys.argv[1]))['metrics']
except Exception:
    print('nofile'); sys.exit()
failed = m.get('http_req_failed', {}).get('value', 0)
join = m.get('realtime_join_ok', {}).get('value', 1)
print('yes' if failed > 0.20 or join < 0.5 else 'no')
EOF
)"
    if [ "$bad" != "no" ]; then
      echo "$s: saturated at $v VUs (>20 % failed requests / >50 % failed joins, or no summary): higher levels skipped" | tee -a "$OUT/saturated.txt"
      break
    fi
    sleep 30
  done
done
echo "done: $(date +%H:%M:%S)"
