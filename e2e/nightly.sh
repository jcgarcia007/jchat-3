#!/usr/bin/env bash
# Nightly QA run for the venue experience — Android (Pixel_8 emulator) + iOS (iPhone 17 Pro Max simulator), unattended.
#
#   e2e/nightly.sh                      # everything (~70 min)
#   e2e/nightly.sh --quick              # dry run: short endurance (2 cycles × 20 s), same phases
#   e2e/nightly.sh --phases 1,5         # only some phases:
#        1 basics (01 session, 02 outside the area, 03 order — both platforms, in parallel)
#        2 seed   (e2e/seed-presence.sh: test + test1 inside the venue at once; needs the E2E_USER_* variables)
#        3 match  (04 review the passed — both platforms)
#        4 gift   (05 accepted + 06 declined: Android sends, the iPhone answers, in parallel)
#        5 endurance (08, ~21 min, both platforms; samples memory and counts permission prompts / restarts / crashes)
#        6 extras (09 gift with swapped roles, 10 orders bar, 11 profile, 12/13 photos + DM photo (iOS), 14 nearby, 15 settings,
#          16 DM pair, 17 map, 18 offers, 19 report a chat message, 20 block from a DM) — runs after 4 and before 5
#   Phases 3, 4 and 6 need the seed (they are reported as SKIPPED without the variables).
#
# Output:  e2e/out/nightly-<stamp>/   (git-ignored: logs, screenshots, memory samples)
#          docs/qa/<date>-nightly.md   (the report — NOT committed by the script)
#
# Environment (never in the repo):
#   e2e/.env.local (git-ignored): E2E_TEST_EMAIL / E2E_TEST_PASSWORD ("test"), E2E_TEST1_EMAIL / E2E_TEST1_PASSWORD ("test1")
#   (the Supabase URL / anon key are read from mobile/.env; every variable can also come from the environment)
#   optional: ANDROID_UDID, IOS_UDID, IOS_METRO_HOST (default: this Mac's LAN IP), PREFLIGHT_FIX=1
set -u
export PATH="$PATH:$HOME/.maestro/bin"
root="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$root/.." && pwd)"
pkg=com.juangarciacruz.jchatapp
ROOT_E2E="$root"
# Local credentials (git-ignored): e2e/.env.local, plus the two PUBLIC Supabase variables of mobile/.env. Never printed.
[ -f "$ROOT_E2E/.env.local" ] && { set -a; . "$ROOT_E2E/.env.local"; set +a; }
if [ -f "$ROOT_E2E/../mobile/.env" ]; then
  : "${EXPO_PUBLIC_SUPABASE_URL:=$(grep -m1 '^EXPO_PUBLIC_SUPABASE_URL=' "$ROOT_E2E/../mobile/.env" | cut -d= -f2-)}"
  : "${EXPO_PUBLIC_SUPABASE_ANON_KEY:=$(grep -m1 '^EXPO_PUBLIC_SUPABASE_ANON_KEY=' "$ROOT_E2E/../mobile/.env" | cut -d= -f2-)}"
  export EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY
fi
export PREFLIGHT_FIX="${PREFLIGHT_FIX:-1}"   # unattended: a stuck UiAutomation or a closed emulator is repaired, not reported

phases="1,2,3,4,6,5"; cycles="${CYCLES:-5}"; quiet_ms="${QUIET_MS:-120000}"   # CYCLES / QUIET_MS can come from the environment (5 × 2 × 240 s ≈ 40 min)
while [ $# -gt 0 ]; do
  case "$1" in
    --quick) cycles=2; quiet_ms=20000 ;;
    --phases) shift; phases="${1:?list}" ;;
    *) echo "unknown option $1"; exit 2 ;;
  esac
  shift
done
has_phase() { case ",$phases," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }

stamp="$(date +%Y%m%d-%H%M%S)"; day="$(date +%Y-%m-%d)"
out="$root/out/nightly-$stamp"; mkdir -p "$out" "$repo/docs/qa"
results="$out/results.tsv"; : > "$results"
report="$repo/docs/qa/$day-nightly.md"
started_at="$(date '+%Y-%m-%d %H:%M:%S')"

android_udid="${ANDROID_UDID:-emulator-5554}"
ios_udid="${IOS_UDID:-$(xcrun simctl list devices booted | grep -Eo '[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}' | head -1)}"
lan_ip="${IOS_METRO_HOST:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)}"
android_port=8083; ios_port=8082

pids=()
cleanup() { for p in "${pids[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; }
trap cleanup EXIT

log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$out/nightly.log"; }

# ── Metro (E2E mode: no LogBox) — our own ports, the dev's Metro on 8081 is never touched ───────────────────────────
start_metro() { # port name
  local port="$1" name="$2" old
  old=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null); [ -n "$old" ] && kill "$old" 2>/dev/null && sleep 2
  ( cd "$repo/mobile" && EXPO_PUBLIC_E2E=1 CI=1 npx expo start --dev-client --port "$port" > "$out/metro-$name.log" 2>&1 ) &
  pids+=($!)
  for _ in $(seq 1 60); do curl -s -m 2 "localhost:$port/status" | grep -q running && return 0; sleep 3; done
  return 1
}

# ── one flow = one row of results.tsv ───────────────────────────────────────────────────────────────────────────────
record() { printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$5" >> "$results"; }
run_flow() { # platform flow [VAR=value ...]
  local platform="$1" flow="$2"; shift 2
  local name host port
  name="$(basename "$flow" .yaml)"
  if [ "$platform" = android ]; then host=10.0.2.2; port=$android_port; else host=$lan_ip; port=$ios_port; fi
  local t0; t0=$(date +%s)
  log "▶ $platform $name"
  env "$@" METRO_HOST="$host" METRO_PORT="$port" ANDROID_UDID="$android_udid" IOS_UDID="$ios_udid" SKIP_PREFLIGHT=1 \
    "$root/run.sh" "$platform" "flows/$flow.yaml" > "$out/$platform-$name.log" 2>&1
  local rc=$?
  local dir; dir="$(grep '^output:' "$out/$platform-$name.log" | tail -1 | sed 's/^output: //')"
  local dt=$(( $(date +%s) - t0 ))
  if [ $rc -eq 0 ]; then record "$platform" "$name" PASS "$dt" "$dir"; log "✔ $platform $name (${dt}s)"
  else record "$platform" "$name" FAIL "$dt" "$dir"; log "✘ $platform $name (${dt}s)"; fi
}
skip_flow() { record "$1" "$2" "SKIPPED:$3" 0 ""; log "⏭ $1 $2 — $3"; }

# ── 0. environment ─────────────────────────────────────────────────────────────────────────────────────────────────
log "nightly $stamp · phases $phases · android=$android_udid ios=$ios_udid lan=$lan_ip"
start_metro $android_port android || log "Metro (Android, :$android_port) did not start"
start_metro $ios_port ios || log "Metro (iOS, :$ios_port) did not start"

android_ok=1; ios_ok=1
METRO_HOST=10.0.2.2 METRO_PORT=$android_port ANDROID_UDID="$android_udid" "$root/preflight.sh" android > "$out/preflight-android.log" 2>&1 || android_ok=0
METRO_HOST="$lan_ip" METRO_PORT=$ios_port IOS_UDID="$ios_udid" "$root/preflight.sh" ios > "$out/preflight-ios.log" 2>&1 || ios_ok=0
log "preflight: android=$android_ok ios=$ios_ok (see preflight-*.log)"

plat_run() { # platform flow [VAR=value..]  → runs only on a healthy platform
  local p="$1" ok=$android_ok
  [ "$p" = ios ] && ok=$ios_ok
  if [ "$ok" = 1 ]; then run_flow "$@"; else skip_flow "$p" "$(basename "$2" .yaml)" "preflight failed"; fi
}
both_ok() { # android-flow ios-flow [VAR=value ...]  (in parallel; honours the preflight)
  local fa="$1" fi="$2"; shift 2
  plat_run android "$fa" "$@" &
  local pa=$!
  plat_run ios "$fi" "$@" &
  local pi=$!
  wait "$pa" "$pi"   # only these two: a bare `wait` would also wait for Metro and the seed loop
}

# ── 1. basics ──────────────────────────────────────────────────────────────────────────────────────────────────────
if has_phase 1; then
  for f in 01-sesion-local 02-fuera-del-area 03-pedido-en-curso; do both_ok "$f" "$f"; done
fi

# ── 2. seed: test + test1 inside the venue at once ─────────────────────────────────────────────────────────────────
seed_ok=0; seed_pid=""
if has_phase 2 || has_phase 3 || has_phase 4 || has_phase 6; then
  if "$root/seed-presence.sh" --once > "$out/seed-check.log" 2>&1; then
    seed_ok=1
    "$root/seed-presence.sh" --minutes 180 > "$out/seed.log" 2>&1 &
    seed_pid=$!; pids+=($seed_pid)
    for _ in $(seq 1 60); do grep -q READY "$out/seed.log" && break; sleep 3; done
    log "seed: both accounts inside the venue"
  else
    log "seed unavailable: $(tail -1 "$out/seed-check.log")"
  fi
fi

# ── 3. match: review the passed (needs both people Match-active: the 2nd reading comes ≥ 5 min after the 1st) ─────────
if has_phase 3; then
  if [ $seed_ok = 1 ]; then
    for _ in $(seq 1 130); do grep -q MATCH_READY "$out/seed.log" && break; sleep 5; done
    grep -q MATCH_READY "$out/seed.log" || log "warning: Match presence not 'active' yet; running 04 anyway"
    both_ok 04-repasar 04-repasar
  else
    # No seed (e.g. Supabase Auth has CAPTCHA on, so the REST login is refused): presence through the apps themselves.
    # Both enter the venue and wait 5.5 min (Match turns 'active' on the 2nd geo reading), so each sees the other.
    log "04 without seed: presence through the apps (WAIT_MATCH_MS=330000)"
    both_ok 04-repasar 04-repasar WAIT_MATCH_MS=330000
  fi
fi

# ── 4. gift: Android sends, the iPhone answers (parallel). The iPhone starts first and is inside the venue (its entry
#       creates the server presence the gift button checks) before Android opens the 1:1 chat 90 s later. ──────────────
gift_pair() { # android-flow ios-flow [VAR=value ...]
  local fa="$1" fi="$2"; shift 2
  plat_run ios "$fi" "$@" &
  local pi=$!
  sleep 90
  plat_run android "$fa" "$@" &
  local pa=$!
  wait "$pa" "$pi"
}
if has_phase 4; then
  gift_pair 05-regalo 05-regalo-ios-acepta TABLE=12
  gift_pair 06-regalo-rechazado 06-regalo-ios-rechaza
fi

# ── 6. extras (flows 09–18): need the seed for the gift / DM pairs; the rest only need the logged-in apps ─────────────
if has_phase 6; then
  gift_pair 09-regalo-android-responde 09-regalo-ios-envia ACTION=decline
  gift_pair 09-regalo-android-responde 09-regalo-ios-envia ACTION=accept TABLE=12
  for f in 10-barra-pedidos 11-perfil-propio 14-cerca-ofertas 15-ajustes-privacidad 17-mapa 18-ofertas; do both_ok "$f" "$f"; done
  plat_run ios 12-fotos-ios
  plat_run ios 13-dm-foto-ios
  gift_pair 16-dm-android-envia 16-dm-ios-recibe
  gift_pair 19-reportar-mensaje-chat 19-reportar-mensaje-chat-ios-envia   # iOS writes, Android long-presses → Report (reason: spam)
  plat_run android 19b-reportar-mensaje-historial                         # same report without the iOS pair (uses a message already in the history)
  plat_run android 20-bloquear-en-dm                                       # block from the DM and restore (unblock) in the same flow
fi
[ -n "$seed_pid" ] && kill "$seed_pid" 2>/dev/null

# ── 5. endurance (~21 min): both platforms in parallel, sampled every minute ───────────────────────────────────────────
endurance_started=""; samples_a="$out/endurance-android-samples.csv"; samples_i="$out/endurance-ios-samples.csv"
if has_phase 5; then
  endurance_started="$(date '+%Y-%m-%d %H:%M:%S')"
  echo "time,pid,pss_kb" > "$samples_a"; echo "time,pid,rss_kb" > "$samples_i"
  android_stream=""
  if [ $android_ok = 1 ]; then
    # a continuous stream of just what matters, so nothing rolls out of the ring buffer in 20 minutes
    adb -s "$android_udid" logcat -c 2>/dev/null
    adb -s "$android_udid" logcat -v time ActivityTaskManager:I ActivityManager:I ReactNativeJS:E AndroidRuntime:E '*:S' > "$out/endurance-android-stream.txt" 2>&1 &
    android_stream=$!; pids+=($android_stream)
  fi
  sampler() {
    local now apid pss ipid rss
    while [ ! -f "$out/.endurance-done" ]; do
      now="$(date +%H:%M:%S)"
      if [ $android_ok = 1 ]; then
        apid="$(adb -s "$android_udid" shell pidof $pkg 2>/dev/null | tr -d '\r' | awk '{print $1}')"
        pss="$(adb -s "$android_udid" shell dumpsys meminfo $pkg 2>/dev/null | awk '/TOTAL PSS:/ {print $3; exit} /^ *TOTAL / {print $2; exit}')"
        echo "$now,${apid:-},${pss:-}" >> "$samples_a"
      fi
      if [ $ios_ok = 1 ]; then
        ipid="$(xcrun simctl spawn "$ios_udid" launchctl list 2>/dev/null | awk '/jchatapp/ {print $1; exit}')"
        rss=""; [ -n "${ipid:-}" ] && [ "$ipid" != "-" ] && rss="$(ps -o rss= -p "$ipid" 2>/dev/null | tr -d ' ')"
        echo "$now,${ipid:-},${rss:-}" >> "$samples_i"
      fi
      sleep 60
    done
  }
  rm -f "$out/.endurance-done"
  sampler & sampler_pid=$!
  both_ok 08-resistencia 08-resistencia CYCLES=$cycles QUIET_MS=$quiet_ms
  touch "$out/.endurance-done"; wait $sampler_pid 2>/dev/null
  [ -n "$android_stream" ] && kill "$android_stream" 2>/dev/null
fi

# ── 6. report ──────────────────────────────────────────────────────────────────────────────────────────────────────
finished_at="$(date '+%Y-%m-%d %H:%M:%S')"
count() { local n; n=$(grep -c "$1" "$2" 2>/dev/null); echo "${n:-0}"; }
mem_summary() { # csv col → "first · max · last"
  awk -F, -v c="$2" 'NR>1 && $c ~ /^[0-9]+$/ { if (!n++) first=$c; if ($c>max) max=$c; last=$c } END { if (n) printf "%d KB first · %d KB max · %d KB last (%d samples)", first, max, last, n; else print "no samples" }' "$1"
}
icon() { case "$1" in PASS) echo "✅ pass" ;; FAIL) echo "❌ fail" ;; SKIPPED*) echo "⏭️ skipped (${1#SKIPPED:})" ;; *) echo "$1" ;; esac; }
pass=$(awk -F'\t' '$3=="PASS"' "$results" | wc -l | tr -d ' ')
fail=$(awk -F'\t' '$3=="FAIL"' "$results" | wc -l | tr -d ' ')
skip=$(awk -F'\t' '$3 ~ /^SKIPPED/' "$results" | wc -l | tr -d ' ')

{
  echo "# Nightly QA — $day"
  echo
  echo "- Run: \`$stamp\` · started $started_at · finished $finished_at"
  echo "- Branch \`$(git -C "$repo" branch --show-current)\` @ \`$(git -C "$repo" rev-parse --short HEAD)\`"
  echo "- Devices: Android $android_udid (Pixel_8) · iOS $ios_udid (iPhone 17 Pro Max) · phases: $phases"
  echo "- Artifacts (not committed): \`e2e/out/nightly-$stamp/\`"
  echo
  echo "## Flows"
  echo
  echo "| Platform | Flow | Result | Time | Output |"
  echo "|---|---|---|---|---|"
  while IFS=$'\t' read -r p f s t d; do
    echo "| $p | $f | $(icon "$s") | ${t}s | \`${d#$repo/}\` |"
  done < "$results"
  echo
  echo "**$pass passed · $fail failed · $skip skipped**"
  echo
  if [ "$fail" -gt 0 ]; then
    echo "## Failures"
    echo
    while IFS=$'\t' read -r p f s t d; do
      [ "$s" = FAIL ] || continue
      echo "### $p · $f"
      echo
      echo "- Output: \`${d#$repo/}\`"
      shot="$(find "$d" -path '*screenshots*' -name '*.png' 2>/dev/null | sort | tail -1)"
      [ -n "$shot" ] && echo "- Failure screenshot: \`${shot#$repo/}\`"
      echo "- Failing step:"
      echo
      echo '```'
      grep -E "FAILED|Assertion|Element not found|did not start" "$out/$p-$f.log" | head -4
      echo '```'
      echo
    done < "$results"
  fi
  if [ -n "$endurance_started" ]; then
    echo "## Endurance (flow 08: $cycles cycles × 2 × $((quiet_ms/1000)) s quiet)"
    echo
    echo "| | Android | iOS |"
    echo "|---|---|---|"
    echo "| Memory | $(mem_summary "$samples_a" 3) | $(mem_summary "$samples_i" 3) |"
    if [ $android_ok = 1 ]; then
      s="$out/endurance-android-stream.txt"
      echo "| Permission prompts (REQUEST_PERMISSIONS) | $(count 'action.REQUEST_PERMISSIONS' "$s") | — |"
      echo "| App process starts | $(count "Start proc .*$pkg" "$s") | — |"
      echo "| Crashes (FATAL EXCEPTION) | $(count 'FATAL EXCEPTION' "$s") | — |"
      echo "| JS errors (ReactNativeJS) | $(count 'ReactNativeJS' "$s") | — |"
      echo "| Presence callback errors | $(count 'presence callbacks' "$s") | — |"
    fi
    ic="$(find "$HOME/Library/Logs/DiagnosticReports" -name 'JChat*' -newermt "$endurance_started" 2>/dev/null | wc -l | tr -d ' ')"
    echo "| iOS crash reports during the run | — | $ic |"
    echo
    echo "Expected: **0–2** permission prompts (the entry tap), **1** process start, **0** crashes, memory roughly flat. Samples: \`e2e/out/nightly-$stamp/endurance-*-samples.csv\`."
    echo
  fi
  echo "## Metro errors (E2E-mode Metro, deduplicated)"
  echo
  echo '```'
  cat "$out"/metro-*.log 2>/dev/null | grep -E "ERROR|Error:|could not be found|Worklets" | sed 's/^[[:space:]]*//' | sort | uniq -c | sort -rn | head -12
  echo '```'
  echo
  echo "_Generated by \`e2e/nightly.sh\`. Triage and next steps are written by whoever reads this._"
} > "$report"

log "report: $report"
echo "$report"
[ "$fail" -eq 0 ]
