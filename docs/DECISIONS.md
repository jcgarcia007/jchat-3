# JChat 3.0 — Decision Journal

Why we did what we did. Read before reversing a choice.

Last updated: 2026-06-22

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
