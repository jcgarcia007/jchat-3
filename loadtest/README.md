# JChat 3.0 — load tests and SQL tests (LOCAL)

Everything here runs against a **local Supabase in Docker**. Nothing touches the production project, `jchat.cloud`, Stripe or Vercel.
Every script checks the target when it starts and stops with an error if it is not `localhost` / `127.0.0.1`
(`run.sh`, `run-sql-tests.sh`, `seed.sh` check the Docker socket and the local container; `lib/common.js` checks the URL again inside k6).

## Requirements

- Docker Desktop running, Supabase CLI, k6 (`brew install k6`), Python 3 (only for `summarize.py`).
- About 8 GB of RAM for Docker. The 1000-user levels are heavy: close other things first.

## Repeat everything

```bash
bash loadtest/local-up.sh           # starts the local Supabase from supabase/migrations (245 baseline + 246 extras + newer); run again to `db reset`
bash loadtest/run-sql-tests.sh      # 110 SQL checks (supabase/tests/*.sql), each in a transaction that is rolled back
bash loadtest/run-all.sh            # read, realtime, gifts × 10, 100, 1000 VUs (1 min ramp + 3 min hold ≈ 40 min)
python3 loadtest/summarize.py       # the results table
bash loadtest/local-up.sh --down    # stops the local stack
```

One scenario at one level: `bash loadtest/run.sh read 100`. A quick check: `LOADTEST_RAMP=10s LOADTEST_HOLD=20s bash loadtest/run.sh gifts 10`.

Results go to `loadtest/results/` (git-ignored): `<scenario>-<VUs>.html` (k6 web dashboard export), `.json` (summary), `.stats.csv`
(docker stats of db / rest / realtime / kong / auth every 10 s), `saturated.txt`, `INFORME.md`.

## What is tested

| Scenario | File | What a virtual user does |
|---|---|---|
| read | `scenarios/read.js` | room messages, room list, menu, `venue_present_users` (100 ids), `gift_available`; ~1 s think time |
| realtime | `scenarios/realtime.js` | one WebSocket on the room channel (presence + postgres_changes), 1 message / 30 s (broadcast + INSERT in `messages`) for 2 min |
| gifts | `scenarios/gifts.js` | `gift_offer_create` → `gift_offer_cancel`, no Stripe |

Seed (`seed.sql`): 1001 users (auth + public), 1 venue with a room, 10 tables, a 20-item menu, a live `room_geo_presence` for every user and
200 messages. Tokens are minted in k6 with the **local** stack's JWT secret (read from `supabase status`, never printed).

Thresholds: p95 < 500 ms and < 1 % failed requests on the HTTP scenarios; ≥ 99 % joins and join p95 < 2 s on realtime.
`run-all.sh` stops raising the level of a scenario when a level ends with > 20 % failed requests (`results/saturated.txt` says where).

## How the local database is built

`local-up.sh` runs the real `supabase start` (or `supabase db reset` when it is already up) on a scratch folder whose `supabase/migrations`
is a symlink to the repo's: `245_baseline.sql` (production's schema as of 2026-10-27) + `246_baseline_extras.sql` (storage buckets and policies,
the pg_cron jobs, the auth.users trigger) + anything numbered 247 or more. The 241 migrations that led there are in `supabase/migrations_archive/`
(history; the CLI does not read it, which is why the old duplicate versions 033/034 and the 173a/173b/198c suffixes no longer matter). See
`docs/MIGRATIONS_BASELINE_PLAN.md`.

## Later: the same tests against a cloud Supabase BRANCH (not tonight, not production)

1. Create a Supabase **branch** (preview) of the project from the dashboard or `supabase branches create`; it is an empty copy that
   replays the migrations. Never point this at the production project.
2. Take its API URL, anon key and JWT secret from the branch settings (the JWT secret is needed because tokens are minted in k6).
3. `lib/common.js` refuses everything that is not localhost on purpose. For the branch, copy the file, replace `assertLocal` with a check that
   the host ends in the branch's `*.supabase.co` ref, and pass `-e API_URL=https://<branch-ref>.supabase.co -e ANON_KEY=… -e JWT_SECRET=…`.
   Run `seed.sql` through the branch's SQL editor (it needs `auth.users` inserts, which the SQL editor allows).
4. Expect different numbers: the branch has its own compute size, connection pooler (use the pooler URL for PostgREST-heavy tests) and
   Realtime limits (concurrent connections, messages per second and joins per second depend on the plan). Check those limits first.
5. Delete the branch when done.

## Files

- `local-up.sh` — local stack + migration replay · `seed.sh`, `seed.sql` — test data · `run.sh`, `run-all.sh` — runners
- `run-sql-tests.sh` — runs `supabase/tests/*.sql` (helpers in `supabase/tests/_helpers.sql`)
- `scenarios/`, `lib/common.js` — k6 scripts · `summarize.py` — results → Markdown table
