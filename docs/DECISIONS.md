# JChat 3.0 — Decision Journal

Why we did what we did. Read before reversing a choice.

Last updated: 2026-06-24

## Maps

### D-01 — Keep Google Maps on mobile (not native Apple/Google split)
Decision: Use Google Maps (PROVIDER_GOOGLE) on both iOS and Android.
Why: The custom pastel and dark map styles (customMapStyle) are Google-Maps-only — Apple Maps doesn't support custom styling. We nearly switched to native maps to escape the iOS blank-map bug, but once the real root cause was fixed (D-02) Google Maps worked, so we kept it and preserved the brand styling.
Consequence: Heat-map gradient overlays remain possible later (Google-only feature).

### D-02 — react-native-maps plugin MUST use the array form
Decision: Always declare ['react-native-maps', { iosGoogleMapsApiKey }], never the bare string 'react-native-maps'.
Why: The bare string makes the config plugin run Apple-Maps-only — it omits the Google Maps pod and strips GMSServices.provideAPIKey() from AppDelegate, causing a silent blank map on iOS. This cost a multi-hour debugging session; the key was never the problem.

### D-03 — Platform-specific Maps API keys
Decision: Split into GOOGLE_MAPS_KEY_IOS and GOOGLE_MAPS_KEY_ANDROID (separate GCP-restricted keys), set in EAS as sensitive for prod+dev.
Why: Correct security posture (each key restricted to its platform/bundle/SHA). Also create EAS env vars BEFORE building — a build run before the vars existed picked up empty keys.

### D-04 — Heat zones deferred; if ever needed, circles not gradient
Decision: No heat zones for now; the Nearby tab already surfaces activity. If added later, prefer colored Circle overlays over a true Heatmap.
Why: Heatmap (gradient) is Google-Maps-only and buggy on iOS even via Google (AIRMapHeatmap not found errors). Circle/Polygon work on both providers, are tappable (enter chat), and map cleanly to each venue's geofence (point + radius) — discrete circles represent bounded geofences better than a diffuse gradient.

## Web map editor

### D-05 — Native google.maps drawing, not terra-draw / AdvancedMarker
Decision: Use native google.maps.Marker/Circle/Polygon via useMap(); removed terra-draw + adapter + AdvancedMarker.
Why: terra-draw's adapter cleanup and AdvancedMarker (invalid mapId) threw "Cannot read properties of undefined (reading remove)" under React StrictMode double-effect.

### D-06 — Uncontrolled map center for drag/pan
Decision: Use defaultCenter + imperative recenter (panTo/setZoom on load/search only), not a controlled center prop.
Why: A controlled center without an onCenterChanged handler snaps the map back and blocks panning.

### D-13 — Radio de geofence de negocio = 50 m (canónico), enforced server-side
Decision: El radio máximo de geofence de un negocio es 50 m. Radios mayores solo con radius_increase_requests aprobado por un platform admin.
Why: Decisión de producto de la sesión de diseño 2026-06-24. El código tenía 100 m (UI) y default 200 m (columna). Se unificó a 50 m. Para honrar la regla de oro de geo ("el servidor decide, nunca el cliente"), el cap se hace cumplir con un trigger en la BD (migración 021), no solo en la UI: permite >50 m únicamente si existe un request aprobado que cubra el valor, o si lo escribe un platform admin.
Consequence: businesses.geofence_radius_m default pasó de 200 a 50. LocationEditor BUSINESS_RADIUS_CAP pasó de 100 a 50. EVENT_RADIUS_CAP (1609 m) sin cambios.

## Chat

### D-07 — Presence = Supabase Realtime Presence (not check_ins)
Decision: The chat "who's here now" bar uses Supabase Realtime Presence, not the check_ins table.
Why: Presence reflects who has the room open right now (live join/leave) — the right semantic for a proximity chat. No new table. Critical impl detail: track() must run inside the .subscribe() callback gated on status==='SUBSCRIBED', else it fails silently; use config.presence.key=user.id for per-user dedup.

### D-08 — Menu icon gated by owner approval (businesses.menu_enabled)
Decision: The in-chat menu icon shows only when the business owner enables it via a dashboard toggle; default false.
Why: Owners control whether their venue exposes a menu/ordering surface in chat. The mobile menu reuses the existing Menu route (full POS flow, Task 3.2) — no separate read-only screen.

### D-09 — Chat work split into small tandas
Decision: Implement chat fixes in small, independently-testable batches (Tanda 1 quick wins -> Tanda 2 DM -> Tanda 3 profile/extras) rather than one big change.
Why: Easier to verify each piece; avoids a Claude Code rewrite touching everything at once. Mirrors the diagnose->fix->verify loop that resolved the maps issue.

### D-10 — TODO(schema) comments are obsolete; verify DB before building
Decision: Trust the live DB over code comments. Tables blocks, reports, follows, dm_conversations, dm_messages already exist with RLS.
Why: Audit (from code comments) claimed these were missing; direct Supabase MCP queries proved them present with policies. Always verify schema via MCP before assuming a table is missing.

### D-13 — Social system (Stage 1) — Instagram model (confirmed 2026-07-08)
Decision: Follow is UNIDIRECTIONAL; accounts are PUBLIC by default (18+). Private accounts use the existing `follow_requests` table (pending → accept/reject); `follows` stays = accepted edges only (no `status` column, preserves existing data). DM is gated by the receiver's `whoCanDMMe` setting (Everyone / Followers only = "my followers can DM me" / Nobody). Unfollow does NOT delete DMs; blocking is SOFT-HIDE (hides but keeps history, reappears on unblock). Posts get a separate permanent bucket `profile-media` (chat stays ephemeral on `post-media`, 24h TTL); DM photos go to a private `dm-media` bucket. No per-post `visibility` in v1 (global `whoSeesMyPosts` only). Follower/following counts via count-queries in v1 (denormalization deferred). Profile tabs v1: Posts / Places / Gifts / Saved (Stories/Reels hidden until their phase).
Why: The social layer was ~70% scaffolded but unenforced — the work is applying privacy in RLS + wiring the pending/DM/block flows, not rebuilding. Reuses `follow_requests`/`blocks`/`posts`/`comments` that already exist. Full audit + 4-module plan + phased order in `docs/PLAN_MAESTRO_SOCIAL.md`.

### D-14 — Chat TTL purge = pure pg_cron; photo GC deferred (confirmed 2026-07-08)
Decision: Room messages are purged 24h after their own created_at by a pure-SQL `pg_cron` job (`purge_expired_messages()` every 15 min) — NOT an Edge Function / pg_net. Pinned messages (`pinned_messages`) are EXCLUDED and survive; `reply_to` is ON DELETE SET NULL so replies survive. Photo binaries are NOT deleted for now (Option C): Supabase blocks direct `DELETE FROM storage.objects` (the `storage.protect_delete` trigger → "Use the Storage API instead"), so the function wraps that delete in an EXCEPTION block (logs + continues) and only purges message rows. Orphaned `post-media` binaries (unreferenced, unguessable path, bucket exclusive to ephemeral chat) remain until a future Storage-API GC.
Why: pg_cron keeps it server-side and dependency-free per the design. Bypassing the protect_delete guard (e.g. `session_replication_role='replica'`) works but deliberately circumvents a Supabase safety mechanism — not worth it for orphaned binaries that pose no privacy/correctness issue. The core value (messages disappear at 24h) ships now; photo GC is a storage-cost cleanup to revisit. Migration 043; design in `docs/DIAGNOSTICO_TTL_CHAT.md`.

## Process

### D-11 — Documentation set for cross-session continuity
Decision: Maintain this /docs/ set; resume new chats by reading docs/CONTINUITY.md.
Why: Chats fill with images (100-image cap) and must restart. The docs preserve state, decisions, origin, and design references so a fresh session continues seamlessly.

### D-12 — Prefer text/MCP over screenshots
Decision: Paste text/errors; let Claude read code via GitHub MCP. Screenshots only for genuine visual UI matters.
Why: Screenshots consume the image budget fast and shorten chat lifespan; MCP gives Claude direct, current source access.

## Permanent deviations from the original spec
1. React Navigation v7 (not v6) — Expo SDK 56 / React 19.
2. --color-warning = #f59e0b (not #D97706).
3. Push token stored in users.push_token (spec said fcm_token).
4. Extra migrations 002-017 beyond the original plan.
5. Bundle id com.juangarciacruz.jchatapp.
6. Web auth implemented (outside original spec — approved).
7. terra-draw / AdvancedMarker removed; geofence drawing uses native google.maps primitives.
