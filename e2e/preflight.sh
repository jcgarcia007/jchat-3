#!/usr/bin/env bash
# Checks the environment BEFORE a Maestro run, so a flow never fails for reasons that are not the app:
#   1. the device is booted                      (adb / simctl)
#   2. Android: UiAutomation is free             (only ONE client may hold it; a stale one makes Maestro's driver time out)
#   3. the location is pinned                    (adb emu geo fix / simctl location; default Bar XZX, or LOCATION=lat,lng)
#   4. Metro answers                             (http://localhost:$METRO_PORT/status)
#   5. the dev build opens and the user is logged in (helpers/open-app.yaml waits for the tabs, which only exist when logged in)
#
#   e2e/preflight.sh android          e2e/preflight.sh ios
# Env: ANDROID_UDID (emulator-5554), IOS_UDID (first booted simulator), METRO_HOST / METRO_PORT,
#      LOCATION="lat,lng" (default 26.083048,-80.223725), PREFLIGHT_FIX=1 (reboots a stuck emulator instead of just reporting).
# Exit 0 = ready; non-zero = the first problem found, with what to do about it.
set -u
export PATH="$PATH:$HOME/.maestro/bin"
root="$(cd "$(dirname "$0")" && pwd)"
platform="${1:?android|ios}"
loc="${LOCATION:-26.083048,-80.223725}"
metro_port="${METRO_PORT:-8081}"
lat="${loc%%,*}"; lng="${loc##*,}"

fail() { echo "✗ $1"; [ -n "${2:-}" ] && echo "  → $2"; exit 1; }
ok() { echo "✓ $1"; }

# ── 1 + 2 + 3: device ────────────────────────────────────────────────────────────────────────────────────────────
if [ "$platform" = android ]; then
  udid="${ANDROID_UDID:-emulator-5554}"
  if ! adb -s "$udid" get-state 2>/dev/null | grep -q device; then
    if [ "${PREFLIGHT_FIX:-0}" = 1 ]; then
      echo "… Android $udid is not running; starting the Pixel_8 emulator (PREFLIGHT_FIX=1)"
      (nohup "$HOME/Library/Android/sdk/emulator/emulator" -avd Pixel_8 > "$root/out/preflight-emulator.log" 2>&1 &)
      for _ in $(seq 1 60); do adb -s "$udid" get-state 2>/dev/null | grep -q device && break; sleep 5; done
    fi
    adb -s "$udid" get-state 2>/dev/null | grep -q device || fail "Android $udid is not connected" "start the emulator (Pixel_8), or run with PREFLIGHT_FIX=1"
  fi
  for _ in $(seq 1 60); do [ "$(adb -s "$udid" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] && break; sleep 3; done
  [ "$(adb -s "$udid" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] || fail "Android $udid is still booting" "wait for it to finish"
  ok "Android $udid booted"

  # A throw-away UiAutomation client: it succeeds only when nobody else holds the (single) slot.
  probe="$(adb -s "$udid" shell uiautomator dump /sdcard/preflight-dump.xml 2>&1)"
  if echo "$probe" | grep -qi "already registered\|UiAutomationService"; then
    others="$(pgrep -fl 'android-mcp|mobile-mcp|uiautomator2|appium' | head -3)"
    if [ "${PREFLIGHT_FIX:-0}" = 1 ]; then
      echo "… UiAutomation is held; rebooting the emulator (PREFLIGHT_FIX=1)"
      adb -s "$udid" reboot
      until [ "$(adb -s "$udid" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 3; done
    else
      fail "UiAutomation is held by another client (Maestro's driver would time out)" \
        "close other Android automation tools${others:+ ($others)} or re-run with PREFLIGHT_FIX=1 to reboot the emulator"
    fi
  fi
  ok "UiAutomation is free"

  adb -s "$udid" emu geo fix "$lng" "$lat" >/dev/null 2>&1 || fail "could not pin the location" "is this an emulator? (adb emu geo fix)"
  ok "location pinned at $lat,$lng"
else
  udid="${IOS_UDID:-$(xcrun simctl list devices booted | grep -Eo '[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}' | head -1)}"
  if [ -z "$udid" ] && [ "${PREFLIGHT_FIX:-0}" = 1 ]; then
    cand="$(xcrun simctl list devices available | grep 'iPhone 17 Pro Max' | grep -Eo '[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}' | head -1)"
    [ -n "$cand" ] && echo "… booting simulator $cand (PREFLIGHT_FIX=1)" && xcrun simctl boot "$cand" 2>/dev/null && udid="$cand"
  fi
  [ -n "$udid" ] || fail "no booted iOS simulator" "boot one (iPhone 17 Pro Max), or run with PREFLIGHT_FIX=1"
  ok "iOS simulator $udid booted"
  xcrun simctl location "$udid" set "$lat,$lng" >/dev/null 2>&1 || fail "could not pin the location" "xcrun simctl location $udid set $lat,$lng"
  ok "location pinned at $lat,$lng"
fi

# ── 4: Metro ─────────────────────────────────────────────────────────────────────────────────────────────────────
curl -s -m 4 "http://localhost:$metro_port/status" | grep -q "packager-status:running" \
  || fail "Metro is not answering on :$metro_port" "cd mobile && npx expo start --dev-client (iOS may use another port: METRO_PORT=8082)"
ok "Metro running on :$metro_port"

# ── 5: the dev build opens and the user is logged in ─────────────────────────────────────────────────────────────
envs=()
for v in METRO_HOST METRO_PORT; do [ -n "${!v:-}" ] && envs+=(-e "$v=${!v}"); done
cd "$root/maestro"
if ! maestro --udid "$udid" test ${envs[@]+"${envs[@]}"} helpers/preflight-open.yaml >/dev/null 2>&1; then
  fail "the dev build did not reach the tabs (not installed, Metro host wrong, or logged out)" \
    "check METRO_HOST (Android emulator: 10.0.2.2), and log in once by hand or export MAESTRO_TEST_EMAIL / MAESTRO_TEST_PASSWORD and run helpers/login.yaml"
fi
ok "app open, logged in (tabs visible)"
echo "preflight OK ($platform)"
