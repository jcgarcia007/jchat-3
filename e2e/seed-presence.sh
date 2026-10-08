#!/usr/bin/env bash
# Puts the two test accounts ("test" = user A, "test1" = user B) INSIDE the test venue at the same time, on the
# server, and keeps them there: the geofence presence (check_geofence_and_join_room, 10 min TTL) and the Match
# check-in (match_check_in: geo needs two readings >= 5 min apart, so it turns 'active' on the second round).
# It does exactly what the app does at the venue's coordinates — no service key, no direct table writes.
#
#   e2e/seed-presence.sh                 # keep both present for 30 min (default), printing one line per round
#   e2e/seed-presence.sh --minutes 90
#   e2e/seed-presence.sh --once          # a single round and exit (0 = both inside)
#
# NOTE: it signs in through the Auth REST API, so it only works while Supabase Auth does NOT require a CAPTCHA token for
# password sign-in (today it does: 'captcha_failed'); nightly.sh then falls back to presence through the apps.
#
# Nothing secret lives in the repo: everything comes from the environment.
#   SUPABASE_URL, SB_PUBLISHABLE_KEY     (or EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY)
#   E2E_TEST_EMAIL / E2E_TEST_PASSWORD  (or E2E_USER_A_* / MAESTRO_TEST_*)  → "test"
#   E2E_TEST1_EMAIL / E2E_TEST1_PASSWORD (or E2E_USER_B_*)                  → "test1"
#   (read from e2e/.env.local, git-ignored; the Supabase URL / anon key from mobile/.env)
#   E2E_VENUE_NAME (Bar XZX), E2E_LAT (26.083048), E2E_LNG (-80.223725)
# Output markers the nightly run waits for:  READY (both inside)  ·  MATCH_READY (both Match-active).
set -u
ROOT_E2E="$(cd "$(dirname "$0")" && pwd)"
# Local credentials (git-ignored): e2e/.env.local, plus the two PUBLIC Supabase variables of mobile/.env. Never printed.
[ -f "$ROOT_E2E/.env.local" ] && { set -a; . "$ROOT_E2E/.env.local"; set +a; }
if [ -f "$ROOT_E2E/../mobile/.env" ]; then
  : "${EXPO_PUBLIC_SUPABASE_URL:=$(grep -m1 '^EXPO_PUBLIC_SUPABASE_URL=' "$ROOT_E2E/../mobile/.env" | cut -d= -f2-)}"
  : "${EXPO_PUBLIC_SUPABASE_ANON_KEY:=$(grep -m1 '^EXPO_PUBLIC_SUPABASE_ANON_KEY=' "$ROOT_E2E/../mobile/.env" | cut -d= -f2-)}"
  export EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY
fi
minutes=30; once=0
while [ $# -gt 0 ]; do
  case "$1" in
    --once) once=1 ;;
    --minutes) shift; minutes="${1:?minutes}" ;;
    *) echo "unknown option $1"; exit 2 ;;
  esac
  shift
done

url="${SUPABASE_URL:-${EXPO_PUBLIC_SUPABASE_URL:-}}"
anon="${SB_PUBLISHABLE_KEY:-${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}}"
a_email="${E2E_USER_A_EMAIL:-${E2E_TEST_EMAIL:-${MAESTRO_TEST_EMAIL:-}}}"; a_pass="${E2E_USER_A_PASSWORD:-${E2E_TEST_PASSWORD:-${MAESTRO_TEST_PASSWORD:-}}}"
b_email="${E2E_USER_B_EMAIL:-${E2E_TEST1_EMAIL:-}}"; b_pass="${E2E_USER_B_PASSWORD:-${E2E_TEST1_PASSWORD:-}}"
venue="${E2E_VENUE_NAME:-Bar XZX}"; lat="${E2E_LAT:-26.083048}"; lng="${E2E_LNG:--80.223725}"

missing=()
for v in url anon a_email a_pass b_email b_pass; do [ -n "${!v}" ] || missing+=("$v"); done
if [ ${#missing[@]} -gt 0 ]; then
  echo "missing environment: ${missing[*]}"
  echo "set SUPABASE_URL, SB_PUBLISHABLE_KEY, E2E_USER_A_EMAIL/PASSWORD (or MAESTRO_TEST_*), E2E_USER_B_EMAIL/PASSWORD"
  exit 2
fi

# ── helpers (credentials only travel on stdin / headers, never printed) ─────────────────────────────────────────
login() { # email password → access token
  jq -n --arg e "$1" --arg p "$2" '{email:$e,password:$p}' \
    | curl -s -m 20 -X POST "$url/auth/v1/token?grant_type=password" -H "apikey: $anon" -H "Content-Type: application/json" -d @- \
    | jq -r '.access_token // empty'
}
rpc() { # token fn json-body
  curl -s -m 20 -X POST "$url/rest/v1/rpc/$2" -H "apikey: $anon" -H "Authorization: Bearer $1" -H "Content-Type: application/json" -d "$3"
}
get() { # token path
  curl -s -m 20 "$url/rest/v1/$2" -H "apikey: $anon" -H "Authorization: Bearer $1"
}

tok_a="$(login "$a_email" "$a_pass")"; [ -n "$tok_a" ] || { echo "login failed for user A"; exit 1; }
tok_b="$(login "$b_email" "$b_pass")"; [ -n "$tok_b" ] || { echo "login failed for user B"; exit 1; }

enc_venue="$(jq -rn --arg v "$venue" '$v|@uri')"
business_id="$(get "$tok_a" "businesses?name=eq.$enc_venue&select=id&limit=1" | jq -r '.[0].id // empty')"
[ -n "$business_id" ] || { echo "venue '$venue' not found"; exit 1; }
room_id="$(get "$tok_a" "rooms?business_id=eq.$business_id&is_main=eq.true&select=id&limit=1" | jq -r '.[0].id // empty')"
[ -n "$room_id" ] || { echo "main room of '$venue' not found"; exit 1; }

round() { # → sets geo_a geo_b match_a match_b
  local t
  geo_a=no; geo_b=no; match_a=-; match_b=-
  for who in a b; do
    [ $who = a ] && t="$tok_a" || t="$tok_b"
    local g m
    g="$(rpc "$t" check_geofence_and_join_room "$(jq -n --arg r "$room_id" --argjson la "$lat" --argjson ln "$lng" '{_room_id:$r,_lat:$la,_lng:$ln}')" | jq -r 'if type=="array" then (.[0].access_granted // false) else false end')"
    m="$(rpc "$t" match_check_in "$(jq -n --arg b "$business_id" --argjson la "$lat" --argjson ln "$lng" '{p_business_id:$b,p_lat:$la,p_lng:$ln,p_qr_token:null,p_mocked:false}')" | jq -r '.status // "error"')"
    if [ $who = a ]; then geo_a="$g"; match_a="$m"; else geo_b="$g"; match_b="$m"; fi
  done
}

end=$(( $(date +%s) + minutes * 60 ))
ready_said=0; match_said=0
while :; do
  round
  echo "$(date +%H:%M:%S) venue=$venue geo(A=$geo_a B=$geo_b) match(A=$match_a B=$match_b)"
  if [ "$geo_a" = true ] && [ "$geo_b" = true ] && [ $ready_said = 0 ]; then echo READY; ready_said=1; fi
  if [ "$match_a" = active ] && [ "$match_b" = active ] && [ $match_said = 0 ]; then echo MATCH_READY; match_said=1; fi
  if [ $once = 1 ]; then [ "$geo_a" = true ] && [ "$geo_b" = true ]; exit $?; fi
  [ "$(date +%s)" -ge "$end" ] && break
  sleep 330   # >= 5 min between Match readings; well inside the 10 min geofence TTL
done
echo "seed finished"
