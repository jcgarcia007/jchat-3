# QA — nightly reports

`e2e/nightly.sh` writes one report per night here: `YYYY-MM-DD-nightly.md` (a second run the same day overwrites it).
The script never commits it; whoever reads it decides what to keep. Raw artifacts (screenshots, `maestro.log`, logcat,
memory samples) stay in `e2e/out/nightly-<stamp>/` (git-ignored).

## What a report contains
1. **Flows** — one row per platform × flow: ✅ pass · ❌ fail · ⏭️ skipped (with the reason), time, output folder.
2. **Failures** — for each ❌: output folder, last failure screenshot, the failing step.
3. **Endurance** (flow 08, ~21 min) — memory first / max / last, permission prompts, app process starts, crashes,
   JS errors, presence-callback errors (Android); memory and crash reports (iOS).
4. **Metro errors** — deduplicated, from the E2E-mode Metro of the run.

## How to read the endurance table
| Signal | Healthy | If not |
|---|---|---|
| REQUEST_PERMISSIONS | 0–2 (only the tap on "Enter") | the permission loop is back (`useGeofenceGate` / `VenueSessionContext`) |
| App process starts | 1 | the app was killed or restarted during the run |
| FATAL EXCEPTION / crash reports | 0 | open the stream / `.ips` in the output folder |
| Memory | roughly flat after the first cycle | a steady climb = a leak (compare first / last) |

## Flows and what they need
| Flow | Needs |
|---|---|
| 01 session · 02 outside the area · 03 order | the devices, Metro, the test card (Stripe test mode) |
| 04 review the passed | `test` and `test1` inside the venue and Match-active (seed) |
| 05 / 06 gift (Android sends, iPhone answers) | the seed, the three Edge Functions deployed (`payments`, `stripe-webhook`, `gift-worker`) and the Stripe event `payment_intent.amount_capturable_updated` |
| 08 endurance | nothing extra |

Without the `E2E_USER_*` / `SUPABASE_*` variables (see `e2e/seed-presence.sh`) the flows that need the seed are reported
as skipped, never as failed.
