# JChat — Maestro flows (Phase 2: venue experience)

End-to-end flows for the **development build** (Metro running on `feat/venue-experience`).
Maestro itself is installed outside the repo (`~/.maestro`; `curl -Ls "https://get.maestro.mobile.dev" | bash`).

## Rules
- **No secrets in the repo.** Logins read `MAESTRO_TEST_EMAIL` / `MAESTRO_TEST_PASSWORD` from the environment.
  The Stripe card is the published TEST card (`4242 4242 4242 4242`, 12/34, 123) — the PaymentSheet shows the TEST badge.
- Outputs (screenshots, `maestro.log`, `logcat.txt`) go to `e2e/out/` (git-ignored).
- Locations are set by `run.sh` from each flow's `# location: lat,lng` header (`adb emu geo fix` / `xcrun simctl location`): Bar XZX = 26.083048, -80.223725; "far" = 26.2, -80.223725.
  Maestro's own `setLocation` is NOT used: on Android it feeds the app a mock provider and the geofence check never answered.

## Layout
- `flows/` — the six scenarios (`05` / `06` have a sender side on Android and a recipient side on the iPhone).
- `helpers/` — `open-app` (opens the dev build on Metro), `login`, `enter-venue`, `leave-venue`, `pay-test-card`.

| # | Flow | Device |
|---|------|--------|
| 01 | `01-sesion-local` — enter, back, "You're at" bar, Back without notice | Android or iOS |
| 02 | `02-fuera-del-area` — "You're not at …", Retry, view menu / pick-up | Android or iOS |
| 03 | `03-pedido-en-curso` — table order inside, TEST card, "Order #N" bar | Android |
| 04 | `04-repasar` — pass everyone → "Review the people I passed" | needs the Match native modules in the build |
| 05 | `05-regalo` (Android sender) + `05-regalo-ios-acepta` (iPhone, table 12) | both |
| 06 | `06-regalo-rechazado` (Android sender) + `06-regalo-ios-rechaza` (iPhone, "No, thanks") | both |
| 08 | `08-resistencia` — ~21 min: 5 cycles of quiet in the chat → minimize + tab hopping → quiet minimized → reopen from the bar (`CYCLES`, `QUIET_MS`) | both |
| — | `ios-presente` — keeps the iPhone account inside the venue for `HOLD_MS` (alternative to the seed) | iOS |
| 07 | `07-reposo` — ~5.5 min quiet in the chat, then ~5.5 min minimized (bar): the app must stay open and the heartbeats must not prompt for permission (`IDLE_MS` to change) | Android |

## Running
`run.sh` calls `preflight.sh` first (`SKIP_PREFLIGHT=1` to skip): device booted, **UiAutomation free** (Android — a stale or
foreign client makes Maestro's driver time out; `PREFLIGHT_FIX=1` reboots the emulator for you), location pinned, Metro answering,
and the dev build opening on the tabs (= logged in). It prints the first problem and what to do about it.

**E2E mode.** Start Metro with `EXPO_PUBLIC_E2E=1` so the dev build's LogBox notifications never cover the buttons:
```bash
cd mobile && EXPO_PUBLIC_E2E=1 npx expo start --dev-client          # Android (8081)
cd mobile && EXPO_PUBLIC_E2E=1 npx expo start --dev-client --port 8082   # iPhone
```
```bash
# Metro must be up; the dev build must be installed on the emulator / simulator.
export MAESTRO_TEST_EMAIL=...   MAESTRO_TEST_PASSWORD=...     # only needed if the app is logged out
e2e/run.sh android flows/01-sesion-local.yaml
e2e/run.sh ios     flows/02-fuera-del-area.yaml
```
Optional: `METRO_HOST` (default `192.168.1.227`), `METRO_PORT` (default `8081`), `ANDROID_UDID`, `IOS_UDID`.

## Nightly run and seed
```bash
export E2E_USER_A_EMAIL=… E2E_USER_A_PASSWORD=…          # "test"
export E2E_USER_B_EMAIL=… E2E_USER_B_PASSWORD=…          # "test1"
export SUPABASE_URL=… SUPABASE_ANON_KEY=…                # or EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY
e2e/nightly.sh            # ~70 min → docs/qa/<date>-nightly.md   (--quick for a dry run, --phases 1,5 for a subset)
e2e/seed-presence.sh      # on its own: keeps test + test1 inside the venue (server side, like the app does)
```
Only one Maestro session fits on an iOS simulator (a second one kills the first); Android and iOS run in parallel.
Details of the report: `docs/qa/README.md`.

## testIDs the flows rely on
`chat-enter`, `chat-geo-retry`, `chat-geo-menu`, `menu-add-<itemId>` (native menu), `chat-person-<userId>`, `dm-gift-button`,
`user-action-gift`, `quick-card-gift`, `gift-accept`, `gift-decline`, `success-view-order`, `success-back`, `venue-leave`.
The web menu's "+" announces the item (`Add Burger Angus`) once the web with that label is deployed; flow 03 falls back to a tap by position until then.

## Notes
- Texts are matched in English **and** Spanish.
- The red React Native LogBox overlay of dev builds is dismissed by `open-app`.
- Only one UiAutomation client can be attached to an Android device at a time: close any other
  Android automation tool before running Maestro, or its driver times out on start.
- After an emulator reboot, re-open the dev build once (`open-app`) before the first flow.
