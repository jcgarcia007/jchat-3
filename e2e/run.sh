#!/usr/bin/env bash
# Runs one Maestro flow and keeps screenshots + logs in e2e/out/<platform>-<flow>-<timestamp>/ (git-ignored).
#   e2e/run.sh android flows/01-sesion-local.yaml
#   e2e/run.sh ios     flows/05-regalo-ios-acepta.yaml
# Env: ANDROID_UDID (default emulator-5554), IOS_UDID (default: the first booted simulator),
#      METRO_HOST / METRO_PORT, MAESTRO_TEST_EMAIL / MAESTRO_TEST_PASSWORD (never commit them).
set -u
export PATH="$PATH:$HOME/.maestro/bin"
root="$(cd "$(dirname "$0")" && pwd)"
platform="${1:?android|ios}"
ROOT_E2E="$root"
# Local credentials (git-ignored): e2e/.env.local, plus the two PUBLIC Supabase variables of mobile/.env. Never printed.
[ -f "$ROOT_E2E/.env.local" ] && { set -a; . "$ROOT_E2E/.env.local"; set +a; }
if [ -f "$ROOT_E2E/../mobile/.env" ]; then
  : "${EXPO_PUBLIC_SUPABASE_URL:=$(grep -m1 '^EXPO_PUBLIC_SUPABASE_URL=' "$ROOT_E2E/../mobile/.env" | cut -d= -f2-)}"
  : "${EXPO_PUBLIC_SUPABASE_ANON_KEY:=$(grep -m1 '^EXPO_PUBLIC_SUPABASE_ANON_KEY=' "$ROOT_E2E/../mobile/.env" | cut -d= -f2-)}"
  export EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY
fi
# Defaults of the tunable variables (the flows declare none: a header `env:` would beat -e).
: "${ACTION:=decline}" "${TABLE:=12}" "${CYCLES:=5}" "${QUIET_MS:=120000}" "${IDLE_MS:=330000}" "${HOLD_MS:=480000}" "${WAIT_MATCH_MS:=1000}" "${RECIPIENT_WAIT_MS:=330000}"
if [ "$ACTION" = accept ]; then : "${EXPECT:=Test accepted your gift.*|Test aceptó tu regalo.*}"; else : "${EXPECT:=Test didn't accept your gift.*|Test no aceptó tu regalo.*}"; fi
export ACTION TABLE EXPECT CYCLES QUIET_MS IDLE_MS HOLD_MS WAIT_MATCH_MS RECIPIENT_WAIT_MS
# Login helper: "test" on Android, "test1" on the iPhone (only if not given explicitly for this run).
if [ "$platform" = android ] && [ -n "${E2E_TEST_EMAIL:-}" ]; then MAESTRO_TEST_EMAIL="$E2E_TEST_EMAIL"; MAESTRO_TEST_PASSWORD="${E2E_TEST_PASSWORD:-}"; fi
if [ "$platform" = ios ] && [ -n "${E2E_TEST1_EMAIL:-}" ]; then MAESTRO_TEST_EMAIL="$E2E_TEST1_EMAIL"; MAESTRO_TEST_PASSWORD="${E2E_TEST1_PASSWORD:-}"; fi

flow="${2:?flow file, relative to e2e/maestro}"
name="$(basename "$flow" .yaml)"
# Environment checks first (device, UiAutomation, location, Metro, logged-in app). SKIP_PREFLIGHT=1 to skip.
if [ "${SKIP_PREFLIGHT:-0}" != 1 ]; then "$root/preflight.sh" "$platform" || exit 1; fi
out="$root/out/$platform-$name-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$out"
if [ "$platform" = android ]; then
  udid="${ANDROID_UDID:-emulator-5554}"
  adb -s "$udid" logcat -c || true
else
  udid="${IOS_UDID:-$(xcrun simctl list devices booted | grep -Eo '[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}' | head -1)}"
fi
# Location comes from the flow's "# location: lat,lng" header and is set on the emulator / simulator
# itself (adb emu geo fix / simctl location): the app then sees a real GPS fix, not a mock provider.
loc="$(grep -m1 '^# location:' "$root/maestro/$flow" | sed 's/^# location: *//')"
if [ -n "$loc" ]; then
  lat="${loc%%,*}"; lng="${loc##*,}"
  if [ "$platform" = android ]; then adb -s "$udid" emu geo fix "$lng" "$lat" >/dev/null || true
  else xcrun simctl location "$udid" set "$lat,$lng" || true; fi
fi
envs=()
for v in METRO_HOST METRO_PORT MAESTRO_TEST_EMAIL MAESTRO_TEST_PASSWORD VENUE ITEM RECIPIENT TABLE ACTION EXPECT PIN IDLE_MS HOLD_MS CYCLES QUIET_MS WAIT_MATCH_MS RECIPIENT_WAIT_MS; do
  [ -n "${!v:-}" ] && envs+=(-e "$v=${!v}")
done
cd "$root/maestro"
maestro --udid "$udid" test ${envs[@]+"${envs[@]}"} --test-output-dir "$out" "$flow" 2>&1 | tee "$out/maestro.log"
status=${PIPESTATUS[0]}
if [ "$platform" = android ]; then adb -s "$udid" logcat -d -t 1500 > "$out/logcat.txt" 2>/dev/null || true; fi
echo "output: $out"
exit "$status"
