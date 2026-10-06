#!/usr/bin/env bash
# Runs ONE QA flow per platform (in parallel), keeps the evidence under e2e/out/nightly-<date>/<block>/<platform>/ and
# appends a row to e2e/out/nightly-<date>/results.tsv (block, platform, flow, status, seconds, evidence dir).
#
#   e2e/qa-block.sh B-mapa flows/qa/B-mapa.yaml flows/qa/B-mapa.yaml [VAR=value ...]
#   e2e/qa-block.sh J-regalo - flows/x.yaml          # "-" = do not run on that platform
#
# Metro (E2E mode, own ports 8082 iOS / 8083 Android) is started if it is not up. Credentials: e2e/.env.local.
set -u
export PATH="$PATH:$HOME/.maestro/bin"
root="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$root/.." && pwd)"
block="${1:?block}"; fa="${2:?android flow or -}"; fi="${3:?ios flow or -}"; shift 3
extra=("$@")
day="${QA_DAY:-$(date +%Y-%m-%d)}"
dest="$root/out/nightly-$day/$block"; mkdir -p "$dest"
results="$root/out/nightly-$day/results.tsv"; touch "$results"
[ -f "$root/.env.local" ] && { set -a; . "$root/.env.local"; set +a; }
lan_ip="${IOS_METRO_HOST:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)}"

ensure_metro() { # port
  curl -s -m 2 "localhost:$1/status" | grep -q running && return 0
  ( cd "$repo/mobile" && EXPO_PUBLIC_E2E=1 CI=1 nohup npx expo start --dev-client --port "$1" > "$root/out/metro-$1.log" 2>&1 & )
  for _ in $(seq 1 60); do curl -s -m 2 "localhost:$1/status" | grep -q running && return 0; sleep 3; done
  return 1
}
ensure_metro 8083; ensure_metro 8082

one() { # platform flow
  local platform="$1" flow="$2" host port t0 rc dir
  if [ "$platform" = android ]; then host=10.0.2.2; port=8083; else host="$lan_ip"; port=8082; fi
  t0=$(date +%s)
  env ${extra[@]+"${extra[@]}"} METRO_HOST="$host" METRO_PORT="$port" SKIP_PREFLIGHT=1 "$root/run.sh" "$platform" "$flow" > "$dest/$platform.log" 2>&1
  rc=$?
  dir="$(grep '^output:' "$dest/$platform.log" | tail -1 | sed 's/^output: //')"
  [ -n "$dir" ] && [ -d "$dir" ] && cp -R "$dir" "$dest/$platform-evidence" 2>/dev/null
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$block" "$platform" "$flow" "$([ $rc -eq 0 ] && echo PASS || echo FAIL)" "$(( $(date +%s) - t0 ))" "${dest#$repo/}/$platform-evidence" >> "$results"
  echo "$platform $flow rc=$rc"
}

pids=()
if [ "$fa" != "-" ]; then one android "$fa" & pids+=($!); fi
if [ "$fi" != "-" ]; then one ios "$fi" & pids+=($!); fi
wait "${pids[@]}"
tail -2 "$results"
