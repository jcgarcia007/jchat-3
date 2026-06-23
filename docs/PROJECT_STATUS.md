# JChat 3.0 — Project Status

Last updated: 2026-06-23

## What JChat 3.0 is
Location-based social + commerce mobile app. Proximity group chats tied to physical venues, in-venue ordering/gifting via Stripe, map-first UI, three-tier business subscriptions. Launch markets: USA + Dominican Republic.

## Stack
- Mobile: React Native (Expo SDK 56, React 19), React Navigation v7
- Web dashboard: Next.js 16.2.9 (Turbopack)
- Backend: Supabase (Postgres, Edge Functions, Storage, Realtime, RLS) — project klfsgcfoahdtkojyqspd (jchat-production), ~47 tables
- Payments: Stripe Connect
- Maps: Google Maps (web + iOS + Android)
- Builds: EAS — bundle id com.juangarciacruz.jchatapp
- Repo: github.com/jcgarcia007/jchat-3 (public), branch main
- Web prod: jchat-3.vercel.app — Vercel project prj_sGiwIjcnfUbrdzuITqY7ikEMI9tI, team team_eD4O1D2IRdcSlfIJxPhdyegy
- Owner / super_admin: Juan Carlos García — jcgarcia007@icloud.com — user id 1bc7f2a8-4d71-4ea3-8c8d-cf059eb1b8de (Spanish + English; prefers concise answers)

## Key IDs / resources
| Resource | Value |
|---|---|
| Supabase project | klfsgcfoahdtkojyqspd |
| Vercel project | prj_sGiwIjcnfUbrdzuITqY7ikEMI9tI |
| Vercel team | team_eD4O1D2IRdcSlfIJxPhdyegy |
| EAS owner | @jcgarcia0007/jchat |
| Bundle id | com.juangarciacruz.jchatapp |
| Google Cloud project | JChat (jchat-497118) |
| Test business | Bar XZX — slug bar-xzx-omd2, id 0478b8d5-5217-4369-9fa2-128dbe5b38f8 (Plantation FL: lat 26.1237117161983, lng -80.1325607300635), 1 Main Room |

## MCP integrations connected
GitHub (read-only), Supabase, Vercel, Stripe (plus Era Context, Plaud, M365). Workflow: Claude Code (CLI) implements; the planning Claude instance writes specs and verifies via MCP. NOTE: GitHub MCP is read-only — Claude cannot write files to the repo; Claude Code must do all commits.

## Done / working (verified)

### Infrastructure & dashboard
- 68-task Dev Plan complete (Foundation, Social & Auth, Businesses, POS & Payments, Native Map).
- Web dashboard fully wired to real data: Overview, Chat Rooms, Orders, KDS (kanban), Analytics, Alerts, Employees, Reservations, Loyalty, Offers, Events.
- Shared resolveActiveBusiness() resolver (tolerant of owners with multiple businesses).

### Geofence / location editor (web)
- LocationEditor in /dashboard/configuration: native google.maps drawing, Pin/Circle/Polygon/Clear tools, draggable pin, Places Autocomplete, radius slider, uncontrolled defaultCenter + imperative recenter.
- Radius caps: business 100m cap; EVENT_RADIUS_CAP=1609m prepared. "Request larger radius" -> radius_increase_requests table + /super-admin/radius-requests approval page.
- Migrations applied through 017 (016: businesses.geofence_polygon; 017: radius_increase_requests).

### Maps on mobile — RESOLVED
- Root cause of iOS blank map: react-native-maps plugin declared as bare string in app.config.ts -> Apple-Maps-only mode, no Google pod, no GMSServices.provideAPIKey() -> PROVIDER_GOOGLE fell back to Apple Maps -> blank.
- Fix (commit 1368497a): plugin -> ['react-native-maps', { iosGoogleMapsApiKey: IOS_MAPS_KEY }]; split GOOGLE_MAPS_KEY into GOOGLE_MAPS_KEY_IOS / GOOGLE_MAPS_KEY_ANDROID (EAS env, sensitive, prod+dev); eas.json dev+simulator profiles use production env.
- Confirmed working on physical iPhone (build d915eeef) AND iOS simulator. Pastel custom style intact; Bar XZX pin visible; tap -> ChatRoom. Full chain verified.
- Kept Google Maps on both platforms (custom pastel/dark styles are Google-only).

### Chat — realtime presence + menu gating (commit 68afb24, deployed)
- Realtime Presence in ChatRoomScreen.tsx: channel presence:\${activeRoomId} with config.presence.key=user.id; track() inside .subscribe() gated on status==='SUBSCRIBED'; sync/join/leave rebuild usersInRoom + activeCount; cleanup untrack()+removeChannel(); incognito respected (nickname + null avatar).
- Menu gating: handleMenuPress -> navigation.navigate('Menu', {businessId, roomId, businessName}) (reuses Task 3.2 POS flow). Web /dashboard/menu has "Show menu in chat" toggle writing businesses.menu_enabled.

## Google Cloud API keys (project jchat-497118)
| Key | Restriction | API | Status |
|---|---|---|---|
| JChat Web Dashboard | HTTP referrers | Maps JS + Places + Geocoding | exposed in chat -> ROTATE |
| JChat iOS Maps | iOS bundle com.juangarciacruz.jchatapp | Maps SDK for iOS | verified correct |
| JChat Android Maps | Android apps | Maps SDK for Android | SHA-1 pending (no keystore) |

## What's next — Chat features (prioritized)
Audit verified the chat is more complete than it looks. Most "broken" actions are small wiring gaps, not missing features. DB tables blocks, reports, follows, dm_conversations, dm_messages already exist with RLS — the TODO(schema) comments in code are obsolete.

### Tanda 1 — estado
- DONE Reubicar emoji button a la input bar (commit c31d847).
- DONE Emoji picker inserta en el texto del input via rn-emoji-keyboard
  (commit 9eeeb97). MapReactionButton.tsx intacto para reacciones de mapa
  (Stage 4).
- DONE Avatar de chat 40x40 (ChatTopBar.tsx avatarStyles: 40/40, radius 20,
  initial fontSize 15).
- DONE Foto en chat -> Supabase Storage bucket `post-media` via nuevo
  mobile/services/storage.ts (uploadImage compartido); fallback a URI local si
  el upload falla. messages.media_url ya existía (mig 006). (commit cd49a9a)
- DONE Report & Block alineados con esquema real (reports.reported_user_id
  + content_type/status NOT NULL; blocks OK). Casts hack y TODO(schema)
  obsoletos eliminados. follow_requests sigue pendiente. (commit e38c01f)

### Tanda 1 — Quick wins
1. Avatar 40px.
2. Photo in chat -> Supabase Storage: handleSendPhoto (~ChatRoomScreen line 553) inserts local URI directly. Reuse existing uploadImage (used by EditProfileScreen). Confirm chat-photos bucket name; upload then insert publicUrl into messages.media_url.
3. Verify Report & Block use correct columns (reports: reporter_id, reported_user_id, content_type, content_id, reason, status; blocks: blocker_id, blocked_id) — likely already work. Remove obsolete TODO(schema) comments.

### Tanda 2 — Send DM (infra ready)
- Tables dm_conversations (user_a, user_b, last_message_at) + dm_messages (conversation_id, sender_id, body, media_url, voice_url, read_at) exist with RLS.
- Build DMChatScreen + conversation list; wire onDM to navigate there.

### Tanda 3 — Profile + extras
- UserProfileScreen (other user's profile) + wire View Profile.
- Add users.cover_url column (only schema gap) + cover photo upload (bucket covers ready).
- Full emoji picker (replace ~4-emoji stub) — likely rn-emoji-keyboard.
- Table user_personal_mutes + personal Mute action.

## Chat audit snapshot (2026-06-22)
| Feature | State | Notes |
|---|---|---|
| Send text | OK | works |
| Realtime presence bar | OK | commit 68afb24 (needs 2-device test) |
| Warn / Mute-in-room / Ban (mod) | OK | moderation_logs / room_mutes / bans |
| Avatar upload (profile) | OK | uploadImage -> Storage avatars |
| PinnedBanner / CreateOfferSheet / MapReaction | OK | working |
| View Profile | PARTIAL | onViewProfile is Alert placeholder |
| Send DM | PARTIAL | Alert; dm_* tables exist (Tanda 2) |
| Follow / Add Friend | PARTIAL | followUser works; no toggle; follow_requests missing for private |
| Report | OK | schema verified + aligned (e38c01f) |
| Block | OK | schema verified + aligned (e38c01f) |
| Personal Mute | PARTIAL | Alert only; needs user_personal_mutes table |
| Remove from room | PARTIAL | logs action but doesn't evict from Realtime |
| Photo in chat -> Storage | OK | uploadImage -> post-media bucket (cd49a9a) |
| Cover photo | PARTIAL | bucket ready; needs users.cover_url column |
| OfferCard "Order Now" | PARTIAL | not wired to MenuScreen filtered by offer |
| CheckIn geofence | PARTIAL | happy path works; geofence (Stage 4) deferred |
| Emoji picker | OK | rn-emoji-keyboard, inserts to text input (9eeeb97) |
| Voice / GIF | MISSING | "coming soon" — deferred |

## Hardening / housekeeping backlog
- Rotate exposed web Google Maps key. iOS/Android keys never pasted — safe.
- Android keystore + SHA-1 to finish Android Maps key; Android build path not started.
- Re-enable "Confirm email" in Supabase (disabled for testing).
- Remove "Skip for now (Testing)" buttons in /business/verify (gated by NEXT_PUBLIC_HIDE_TEST_SKIP).
- A2P 10DLC Twilio registration for USA SMS.
- Stripe webhook signature verification in real production.
- Register app in App Store Connect; APNs key in EAS for iOS push.
- Server-side push notifications (TODO(push) in Edge Functions).
- Events geofence editor (1-mile cap UI from /dashboard/events).
- UserActionSheet "Remove from room" should evict from the Realtime channel.

## Recent commits (all on main, all Vercel READY)
| Commit | Description |
|---|---|
| e38c01f | Align blocks/reports service with real Supabase schema |
| cd49a9a | Chat photo upload to Supabase Storage (post-media) + avatar 40px |
| 9eeeb97 | Emoji picker inserts into message text (rn-emoji-keyboard) |
| c31d847 | Move emoji reaction button into the input bar |
| 68afb24 | Realtime presence in chat + menu_enabled toggle |
| 1368497a | iOS Maps fix (plugin array form + platform key split + eas.json env) |
| 1291830 | Radius caps + radius-increase request flow + super-admin review (mig 017) |
| 861d228 | Pin/Circle/Polygon/Clear geofence tools (mig 016) |
| 63fee98 | Fix map drag/pan + always-visible pin |
| eb780d7 | Fix black map (heights, single APIProvider) + remove Event mode |
| b7feb87 | Drop terra-draw + AdvancedMarker; native google.maps drawing |
