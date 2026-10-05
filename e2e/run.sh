#!/usr/bin/env bash
# Runs one Maestro flow and keeps screenshots + logs in e2e/out/<platform>-<flow>-<timestamp>/ (git-ignored).
#   e2e/run.sh android flows/01-sesion-local.yaml
#   e2e/run.sh ios     flows/05-regalo-ios-acepta.yaml
# Env: ANDROID_UDID (default emulator-5554), IOS_UDID (default: booted simulator),
#      METRO_HOST / METRO_PORT, MAESTRO_TEST_EMAIL / MAESTRO_TEST_PASSWORD (never commit them).
set -u
export PATH="$PATH:$HOME/.maestro/bin"
root="$(cd "$(dirname "$0")" && pwd)"
platform="${1:?android|ios}"
flow="${2:?flow file, relative to e2e/maestro}"
name="$(basename "$flow" .yaml)"
out="$root/out/$platform-$name-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$out"
if [ "$platform" = android ]; then
  udid="${ANDROID_UDID:-emulator-5554}"
  adb -s "$udid" logcat -c || true
else
  udid="${IOS_UDID:-booted}"
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
for v in METRO_HOST METRO_PORT MAESTRO_TEST_EMAIL MAESTRO_TEST_PASSWORD VENUE ITEM RECIPIENT TABLE; do
  [ -n "${!v:-}" ] && envs+=(-e "$v=${!v}")
done
cd "$root/maestro"
maestro --udid "$udid" test ${envs[@]+"${envs[@]}"} --test-output-dir "$out" "$flow" 2>&1 | tee "$out/maestro.log"
status=${PIPESTATUS[0]}
if [ "$platform" = android ]; then adb -s "$udid" logcat -d -t 1500 > "$out/logcat.txt" 2>/dev/null || true; fi
echo "output: $out"
exit "$status"
