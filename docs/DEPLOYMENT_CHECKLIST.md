# JChat 3.0 — Deployment Checklist

> Complete, ordered runbook for taking JChat 3.0 from code-complete (68/68 tasks,
> `tsc` clean) to a live public launch once you have the API keys.
>
> Architecture recap: `mobile/` (Expo RN), `web/` (Next.js 16 dashboard + public
> pages), `supabase/` (Postgres migrations 001–008 + 4 Edge Functions:
> `payments`, `stripe-connect`, `stripe-webhook`, `subscriptions`).
>
> Work top to bottom — later steps depend on earlier ones.

---

## Phase time estimates (rough)

| Phase | Est. |
|---|---|
| 1 — Env vars | ~30 min |
| 2 — Supabase (DB / Auth / Storage) | ~45 min |
| 3 — Stripe (Payments + Connect) | ~60 min |
| 4 — Google Maps | ~20 min |
| 5 — Firebase (Push) | ~30 min |
| 6 — Twilio (SMS) | ~20 min |
| 7 — Vercel (Web) | ~30 min |
| 8 — Expo EAS (stores) | ~2–4 h |
| 9 — Smoke tests | ~2–3 h |
| 10 — Pending TODOs | variable |

~70+ steps across 10 phases; each depends on the previous.

---

## 1. Environment variables (`.env`)

Create `.env` from `.env.example`. Keys are split by where they run. **Never commit `.env`** (already in `.gitignore`).

### Mobile (Expo — must be `EXPO_PUBLIC_` to reach the client bundle)
| Var | Used by |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `mobile/services/supabase.ts` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `mobile/services/supabase.ts` |
| `EXPO_PUBLIC_STRIPE_PK` | `mobile/components/StripeRoot.native.tsx` (publishable key) |
| `GOOGLE_MAPS_KEY` | `mobile/app.config.ts` → native iOS/Android map config (build-time, NOT public) |

### Web (Next.js)
| Var | Scope | Used by |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client | `web/lib/supabase.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | `web/lib/supabase.ts` |
| `SUPABASE_URL` | server | `web/lib/supabaseAdmin.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | server | `web/lib/supabaseAdmin.ts` (Route Handlers, e.g. `/api/verify`) |

### Supabase Edge Functions (set via `supabase secrets set`, never in repo)
| Var | Used by |
|---|---|
| `STRIPE_SECRET_KEY` | payments, stripe-connect, stripe-webhook, subscriptions |
| `STRIPE_WEBHOOK_SECRET` | stripe-webhook, subscriptions (signature verification) |
| `STRIPE_PRICE_VERIFIED` / `STRIPE_PRICE_BUSINESS` / `STRIPE_PRICE_PRO` | subscriptions (Stripe Price IDs) |
| `SUPABASE_URL` | all functions (service-role client) |
| `SUPABASE_SERVICE_ROLE_KEY` | all functions |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | verification SMS (Task 2.2) |

- [ ] All mobile vars set (local `.env` + EAS secrets for builds)
- [ ] All web vars set (local + Vercel project env)
- [ ] All Edge Function secrets set via `supabase secrets set`
- [ ] Confirm `isSupabaseConfigured` / `isSupabaseAdminConfigured` flip to `true` (they gate demo fallbacks)

---

## 2. Supabase — create project & apply migrations

- [ ] Create a Supabase project; note the Project URL, `anon` key, and `service_role` key
- [ ] Link the CLI: `supabase link --project-ref <ref>`
- [ ] Apply migrations in order (001 → 008):
  ```bash
  supabase db push
  ```
  Migrations: `001_initial_schema` · `002_social_schema` · `003_schema_catchup` ·
  `004_stage2_schema` · `005_business_gallery` · `006_message_types` ·
  `007_stage3_schema` · `008_business_tax_rate`
- [ ] Verify **RLS is enabled** on every table (all migrations set it; spot-check in the dashboard)
- [ ] Confirm the `supabase_realtime` publication includes: `messages`, `orders`,
      `order_items`, `service_calls`, `posts`, `post_likes`, `comments`, `stories`,
      `dm_messages`, `map_reactions`, `events`, `pinned_messages`, `reservations`
- [ ] Enable the **Auth providers** used: Email/Password, Google OAuth, Apple Sign-In
      (set redirect URL `jchat://auth/callback` + the web callback)
- [ ] **Create Storage buckets** (uploads are currently stubbed): `avatars`, `covers`,
      `post-media`, `menu-photos`, `verification-selfies` — set per-bucket RLS
- [ ] **Add the missing server-side RLS / role policies** flagged `TODO(roles)` in
      `004`/`007` for super-admin tables (`security_logs`, `announcements`, `admin_roles`,
      `public_locations`) and the `reports`/`blocks`/`follow_requests` tables
- [ ] Seed at least one Super Admin: insert into `admin_roles` (or set `users.role='super_admin'`)
- [ ] Generate types if desired: `supabase gen types typescript`

---

## 3. Stripe — Connect & webhooks

- [ ] Create a Stripe account; enable **Stripe Connect** (Express accounts)
- [ ] Create the **subscription Products/Prices** and capture the Price IDs:
      Verified ($1.99), Business ($49), Pro ($99) → set `STRIPE_PRICE_*` secrets
- [ ] Deploy the Edge Functions (each in its own folder):
  ```bash
  supabase functions deploy payments
  supabase functions deploy stripe-connect
  supabase functions deploy stripe-webhook
  supabase functions deploy subscriptions
  ```
- [ ] Register **two webhook endpoints** in the Stripe dashboard pointing at the deployed
      function URLs, capture each signing secret → `STRIPE_WEBHOOK_SECRET`:
  - `stripe-webhook` → events: `payment_intent.succeeded`, `payment_intent.payment_failed`
  - `subscriptions` → events: `checkout.session.completed`, `customer.subscription.updated`,
    `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`,
    `customer.subscription.trial_will_end`
- [x] **✅ Webhook signature verification — ACTIVE (verified 2026-07-09).** `constructEventAsync`
      is live and rejects with HTTP 400 in **both** `stripe-webhook/index.ts` (line 245) and
      `subscriptions/index.ts` (line 290). The earlier note that it was "stubbed (`// TODO(security)`)"
      became stale after the 2026-07-08 payment-security work. Evidence:
      `docs/AUDITORIA_SEGURIDAD_ESCALABILIDAD_2026.md`.
- [ ] Confirm the Connect flow: business onboarding via `stripe-connect` saves
      `businesses.stripe_account_id`; payouts go to the business (platform fee configured
      in `payments/index.ts`)
- [ ] Wire the payout-schedule update (`// TODO(payouts)` in `stripe-connect`) for the
      Configuration → Payout Frequency setting (Task 2.16)
- [ ] Test in **test mode** with Stripe test cards before going live (see §9). Key cards:
      `4242 4242 4242 4242` (success), `4000 0025 0000 3155` (requires 3D Secure),
      `4000 0000 0000 9995` (declined — insufficient funds). CVV: any 3 digits; exp: any future date.

---

## 4. Google Maps — enable APIs

- [ ] In Google Cloud Console, create API keys (recommend **separate iOS + Android keys**,
      restricted by bundle id `com.jchat.app` / package `com.jchat.app`)
- [ ] Enable: **Maps SDK for iOS**, **Maps SDK for Android**, and (if used for geocoding
      later) **Geocoding API**
- [ ] Set `GOOGLE_MAPS_KEY` — `mobile/app.config.ts` injects it into
      `ios.config.googleMapsApiKey` and `android.config.googleMaps.apiKey` (never hardcoded)
- [ ] Add billing to the GCP project (Maps requires it). Set a **budget with alerts** —
      $200 (the free monthly credit), alerts at **50% / 90% / 100%**; action at 100% = email,
      **do not** auto-cut the service
- [ ] Verify map renders with A2 Pastel (light) / dark style and pins/heatmap appear

---

## 5. Firebase — Cloud Messaging (FCM) for push

> Push is via `expo-notifications` (Expo Push → FCM on Android / APNs on iOS).
> Token is stored in `users.push_token` (`mobile/services/notifications.ts`).

- [ ] Create a Firebase project; add the Android app (`com.jchat.app`), download
      `google-services.json`
- [ ] Upload the **FCM server key / service account** to Expo (EAS) credentials so Expo
      Push can deliver to Android
- [ ] iOS: configure an **APNs key** in the Apple Developer account and add it to EAS
      (the `.p8` file can be **downloaded only once** — store it safely)
- [ ] Implement the server-side senders that are stubbed `// TODO(push)`:
      order ready (KDS/webhook), new DM/follower/like/comment, work alerts, gift received,
      reservation status, proximity (client-local already works) — typically a Supabase
      Edge Function or DB trigger calling Expo Push API
- [ ] Wire notification tap → screen routing (descriptors already returned by
      `routeForNotification` / proximity `ProximityNotificationData`); add the listener in
      `AppNavigator` (`// TODO(map-wiring)` / `// TODO(deep-link)`)

---

## 6. Twilio — SMS (business verification, Task 2.2)

- [ ] Create a Twilio account; buy/verify a sender phone number (US +1, SMS-capable, ~$1.15/mo)
- [ ] Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` as secrets
- [ ] Replace the SMS stub (`// TODO(Twilio)`) in the verification flow with a real Twilio
      send (the API route already generates/stores the 6-digit code with 10-min expiry)
- [ ] Verify: code arrives, expires after 10 min, wrong code retries, success sets
      `businesses.status='verified'`

---

## 7. Vercel — deploy web/dashboard

- [ ] Import the repo into Vercel; set **Root Directory = `web`**
- [ ] Framework preset: Next.js (v16). Build: `next build` (default)
- [ ] Add all **Web** env vars from §1 (client `NEXT_PUBLIC_*` + server `SUPABASE_URL` /
      `SUPABASE_SERVICE_ROLE_KEY`)
- [ ] Set the production domain; update Supabase Auth allowed redirect URLs + the
      `b/[slug]` / store links in `web/app/b/[slug]/page.tsx` (`// TODO: real domain`)
- [ ] Deploy; verify dashboard auth, KDS realtime, analytics charts, super-admin gate,
      and the public `b/[slug]` SEO/JSON-LD pages render
- [ ] Run `npx tsc --noEmit` in `web/` as a CI gate (only check available — no test suite)

---

## 8. Expo — build & submit to stores

- [ ] `cd mobile && npx expo-doctor` (should pass 21/21)
- [ ] Configure EAS: `eas build:configure`; add EAS secrets for all `EXPO_PUBLIC_*` +
      `GOOGLE_MAPS_KEY`
- [ ] Confirm `app.config.ts` plugins resolve: `@stripe/stripe-react-native`
      (`merchantIdentifier: merchant.com.jchat.app`), `expo-location`, `react-native-maps`,
      `expo-web-browser`, `@react-native-community/datetimepicker`
- [ ] Build dev client first to test native modules (maps, Stripe sheet, Face ID, push):
      `eas build --profile development`
- [ ] Production builds: `eas build --platform ios` / `--platform android`
- [ ] iOS extras: App Store Connect app, APNs key, Apple Sign-In capability, Apple Pay
      merchant id, location + camera + notifications usage strings (location strings are in
      `app.config.ts`; add camera/photos via plugins)
- [ ] Android extras: Play Console app, `google-services.json`, Google Pay, signing
- [ ] Submit: `eas submit --platform ios` / `--platform android`
      (plan ahead: Apple review ~1–3 days, Google Play ~1–7 days)

---

## 9. Critical tests before opening to the public

Run in **Stripe test mode** with test cards, on a real device build.

- [ ] **Payments (Rule 4):** order is created **only after** `payment_intent.succeeded`
      webhook — confirm no order row appears on payment failure/cancel; PaymentIntent is
      created server-side only; webhook signature verification is ON
- [ ] **Saved cards / Apple Pay / Google Pay** present and charge correctly
- [ ] **Subscriptions:** upgrade → Checkout → webhook sets `businesses.plan`; failed payment
      → 3-day grace (Day 1/2/3); Day 3 → `status='suspended'` + removed from map; recovery restores
- [ ] **Auth:** email/password, Google, Apple sign-in; session persists; sign-out clears tokens
- [ ] **Realtime:** chat messages, orders (KDS ↔ Order Tracking), DMs update live
- [ ] **Privacy (hard rules):** real-time location never revealed anywhere; Privacy screen
      Location row is **locked, no toggle**; geotag is manual text only; Places tab shows **no timestamps**
- [ ] **Geofence/proximity:** 30s dwell prevents drive-by; max 3/day + 1/venue/2h; mode Off disables;
      moderator outside radius cannot moderate; check-in blocked outside radius / within 24h
- [ ] **Map:** teardrop pins + heatmap colors exact; tapping a pin opens BusinessPreviewCard
- [ ] **RLS:** a non-owner cannot read/write another business's data; super-admin pages reject non-admins
- [ ] **Verification:** Stripe Identity → Pending badge; SMS code; all 3 steps → Verified enables payments
- [ ] **Disputes/refunds:** open → 48h escalation → Super Admin force refund via Stripe
- [ ] **Both projects:** `npx tsc --noEmit` clean; no console errors in production builds
- [ ] **Both themes:** light + dark render correctly across app; no hardcoded hex regressions

---

## 10. Pending TODOs — by priority

### P0 — Blocking real money / launch
- [ ] Enable Stripe **webhook signature verification** (`stripe-webhook`, `subscriptions`)
- [ ] Create Stripe **Price IDs** + set `STRIPE_PRICE_*`
- [ ] Supabase **Storage buckets** + real upload wiring (avatars, covers, post-media,
      menu photos, verification selfies — many `// TODO(storage)`)
- [ ] Server-side **RLS/role policies** for super-admin tables + `reports/blocks/follow_requests`

### P1 — Required for full feature parity
- [ ] **Push notifications** server senders (`// TODO(push)`) + tap-routing listener
- [ ] **Confirmation emails** (`// TODO(server)`: order confirmation Edge Function)
- [ ] **Twilio SMS** real send (verification)
- [ ] **Cron jobs** (pg_cron / scheduled Edge Functions): subscription grace-day notices,
      dispute 48h auto-escalation, scheduled-offer publish at `start_at`, reservation 24h/2h
      reminders, story 24h expiry cleanup
- [ ] **Live presence / active-user counts** (map, nearby, KDS, room headers currently 0/stub)

### P2 — Important polish
- [ ] **Payout schedule** update via Stripe API (Configuration setting)
- [ ] **Mount `MapReactionOverlay`** in MapScreen (needs async `MapView.pointForCoordinate`
      resolver maintained on region change) — `// TODO(Task 4.5)`
- [ ] **Background/always-on location** for proximity (expo-task-manager) — `// TODO`
- [ ] **i18n runtime** (`/locales` + provider) — replace all `// TODO(i18n)` English strings
- [ ] **PayPal** payment method (`// TODO(paypal)`)
- [ ] OAuth **deep-link redirect** handling (`jchat://auth/callback`)

### P3 — Nice to have
- [ ] Real API key generation for Analytics Pro API tab
- [ ] Drag-to-reorder for menu categories (currently up/down buttons)
- [ ] Map distance filter as a true slider (currently segmented buttons)
- [ ] Map radius drawing in Business Registration (currently lat/lng + numeric radius)
- [ ] Replace KDS placeholder alert sound with a real asset

---

## Launch-readiness ladder

What you can launch as each dependency comes online:

| When you have… | You can launch… |
|---|---|
| `.env` + Supabase + Vercel | Business-owner web dashboard |
| + Stripe configured | Real order payments |
| + Firebase + Expo build | iOS & Android apps |
| + Google Maps key | Native map (heatmap + pins) |
| + P0 TODOs done | Full public launch |

---

*JChat 3.0 — generated after Stage 0–4 completion (68/68 tasks). Migrations 001–008;
Edge Functions: payments, stripe-connect, stripe-webhook, subscriptions. The Spanish
deployment-guide `.docx` was merged into this file and archived in `docs/archive/`
(FASE B consolidation, July 2026).*
