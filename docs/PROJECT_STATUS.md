# JChat 3.0 — Project Status

Last updated: 2026-06-27

## What JChat 3.0 is
Location-based social + commerce mobile app. Proximity group chats tied to physical venues, in-venue ordering/gifting via Stripe, map-first UI, three-tier business subscriptions. Launch markets: USA + Dominican Republic.

## Stack
- Mobile: React Native (Expo SDK 56, React 19), React Navigation v7
- Web dashboard + web client: Next.js 16.2.9 (Turbopack)
- Backend: Supabase (Postgres, Edge Functions, Storage, Realtime, RLS) — project klfsgcfoahdtkojyqspd, ~47 tables
- Payments: Stripe Connect
- Maps: iOS = Apple Maps (no key); Android = Google Maps (key required); Web = Google Maps JS
- Builds: EAS — bundle id com.juangarciacruz.jchatapp
- Repo: github.com/jcgarcia007/jchat-3, branch main
- Web prod: jchat-3.vercel.app
- Owner / super_admin: Juan Carlos García — user id 1bc7f2a8-4d71-4ea3-8c8d-cf059eb1b8de

## Key IDs
| Resource | Value |
|---|---|
| Supabase project | klfsgcfoahdtkojyqspd |
| Google Cloud project | JChat (jchat-497118) |
| Test business | Bar XZX — slug bar-xzx-omd2, id 0478b8d5-5217-4369-9fa2-128dbe5b38f8 (Plantation FL), Main Room id 9a462992-2dbf-4264-a4b6-c365bd4626f1 |

## Workflow
GitHub MCP read-only for the planning Claude; Claude Code (CLI) does all commits/migrations. Supabase + Vercel + Stripe MCP connected.

---

## Done / working (verified)

### Maps on mobile — RESOLVED on all 3 platforms
- Architecture: iOS = Apple Maps (no key). Android = Google Maps (react-native-maps on Android always uses the Google SDK regardless of provider) and REQUIRES GOOGLE_MAPS_KEY from the mobile .env. Web dashboard uses its own Google Maps JS key.
- Root cause of the long Android "blank/cream map" saga: the mobile .env/.env.local had the Web Dashboard key (HTTP-referrer restricted) in GOOGLE_MAPS_KEY → Android rejected it → blank map, zero "Maps SDK for Android" requests. Code was correct throughout. Fix: put the JChat Android Maps key into BOTH .env and .env.local (Expo loads .env.local with higher priority).
- Local builds need the key in .env (EAS cloud builds use EAS secrets).
- GPS hang fix: getCurrentPositionAsync in Promise.race w/ 8s timeout → Miami FALLBACK_REGION. Yellow "Location unavailable" banner is the expected fallback, not a bug.
- Android emulator: Pixel_8, API 35, Google Play image. iOS simulator: works, but repo path "Jchat Ver 3.0" has spaces → RN 0.85 prebuilt-pod breaks; workaround `RCT_USE_PREBUILT_RNCORE=0 pod install` on every iOS pod install. DEBT: move to space-free path.

### Map control polish
- Zoom +/- (Android scales camera.zoom; iOS scales camera.altitude — Apple Maps has no zoom prop). Recenter-on-user button (brand blue, separate recenterToUser, no full-screen loading). Unified top layout via useSafeAreaInsets (chips at top on both platforms; Android previously bottom).

### Web-by-QR customer product (web/, routes /c/[token])
- /c/[token] resolves QR (resolve_room_qr) → welcome → login-with-return → post-login RoomHub (3 buttons: Menú "pronto" · Llamar al servicio · Entrar al chat). Hub calls join_room_via_qr on mount.
- Web ChatRoom: text + realtime, role badges, incognito, photo, 15 themes, call-waiter.
- QR system: dashboard modal, PNG/PDF download, styled (qr-code-styling). Migration 027: regenerate_room_qr_token RPC. Token format {biz-slug}-{main|sub}-{8hex}.

### Seed demo data (supabase/seeds/)
- seed_demo.sql + seed_cleanup.sql (marker-based, dry-run, never touches real data). 10 businesses, 50 users (userNN@seed.jchat.test, password SeedPass123!).
- KEY FINDING: NO auto-profile trigger — auth.users row does NOT create public.users row. Manual profile needed (also why dashboard-created users can't fully log in without a public.users row + confirmed email).
- DEBT: status 'pending_verification' not in MapScreen filter (invisible); two sources of truth (status string vs is_verified/is_active).

### Profile
- Log Out button in EditProfileScreen: Alert confirm → signOut() from AuthContext (auto nav to auth stack).

### Chat
- Realtime presence (track gated on SUBSCRIBED; incognito respected). Photo → Storage post-media (base64/ArrayBuffer, Hermes-safe). Smart auto-scroll. Report/Block aligned to schema. sender_name resolved from public.users via join + name cache.
- Message-send RLS model CONFIRMED: requires room_members (expires_at>now()) via can_access_room, OR business owner. Manual users (test1/test2) couldn't send until given membership — security working as designed. Real flow grants membership by scanning room QR (join_room_via_qr, 24h).

---

## Google Cloud API keys (project jchat-497118)
| Key | Restriction | Status |
|---|---|---|
| JChat Web Dashboard | HTTP referrers | in use by web; do NOT remove. Was mistakenly in mobile .env — removed. |
| JChat Android Maps | Application: None (per-app restriction PENDING) | ROTATED 06-27 (old value exposed in chat). New value in mobile .env/.env.local. |
| JChat iOS Maps | — | DELETED — iOS uses Apple Maps, key unused. |

Android per-app restriction PENDING (5-min): GCP → JChat Android Maps → Application restrictions → Android apps → package com.juangarciacruz.jchatapp + SHA-1 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25 (debug keystore at android/app/debug.keystore).

---

## Security — P0 status
- P0-1 (private rooms readable by any authed user) — CLOSED (migration 019).
- P0-2 (order totals not recalculated server-side) — OPEN. Production blocker.
- P0-3 (Edge Functions trust client IDs with service_role) — OPEN. Production blocker.
- See SECURITY_AUDIT.md / SECURITY_AUDIT2.md before tackling P0-2/P0-3.

---

## What's next — prioritized

### Product
- Barra de presencia (web chat live presence + avatar bar): maqueta approved, prompt ready. Port mobile presence channel; incognito shows nickname/🎭; "N en línea" counter. Verify with 2 tabs.
- Sub-room tabs (web) — SIMPLE model: tabs show only rooms the user has membership in; switching navigates between them. Sub-room QR grants membership in sub-room + parent. Builds on room_members.
- Fase 3 — comprar (Stripe web). Menú button is "pronto" placeholder.
- Tanda 2 — Send DM (dm_conversations/dm_messages exist): DMChatScreen + list.
- Tanda 3 — UserProfileScreen + wire View Profile; users.cover_url column + cover upload; full emoji picker; user_personal_mutes + personal Mute.

### Security / housekeeping
- Finish Android Maps key per-app restriction (SHA-1 above).
- Re-enable "Confirm email" in Supabase. When creating test users in dashboard: check "Auto Confirm User" + create public.users profile row (no auto-trigger).
- expo-updates (OTA) not configured — needed before distributing to testers.
- EAS internal distribution (expo-dev-client + UDID) for physical iPhone testing.
- Clean old messages with file:// media_url (broken; pre-b700f08).
- Move project to space-free path (fixes iOS pod bug permanently).
- A2P 10DLC Twilio; Stripe webhook signature verification; App Store Connect + APNs; server-side push.

---

## Recent commits (newest first, all on main)
| Commit | Description |
|---|---|
| 15f4093 | Chat: resolve sender names from public.users |
| d036b3a | Profile: add Log Out button |
| 03be1ee | Map: zoom works on iOS (altitude vs Android zoom) |
| aecf7c3 | Map: zoom +/- + recenter-on-user button |
| 27bfc20 | Seed: set seed businesses to 'verified' for map |
| a29869d | Seed demo data |
| cc570ca | Web /c: post-login 3-button RoomHub |
| ff74b6d | Migration 027 — regenerate_room_qr_token + QR renew |
| cd026fa | Maps: restore Android Google Maps key |
| a0bd82d | Map: GPS timeout fallback |
| fa4ed4a | Maps: native platform maps refactor |
| b700f08 | Chat photo upload base64 (Hermes-safe) |
| 87b013a | Smart chat auto-scroll |
| 68afb24 | Realtime presence + menu_enabled toggle |
