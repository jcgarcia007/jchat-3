# JChat 3.0 — Project Status

Last updated: 2026-07-06

---

## Sesión julio 2026 — completado

### Sistema de menús (web) — COMPLETO
- 21 plantillas de menú portadas a React (arquetipos del board + classic).
- 40 paletas de color aplicables por negocio (menu_palette_id, migración 034) + botón "volver a original"; tipografía fija (Playfair/Space Grotesk); colorPalettes.ts en templates/shared/.
- Paletas originales del board por plantilla (MENU_PALETTES); modales/sheets heredan la paleta activa.
- Responsive: shell columna centrada max-width 480px (transform device-frame); carritos unificados IconShoppingCart; sheets vía createPortal.
- Selector dashboard colapsable (plantilla/paleta/efecto); sheet recogida "En mi mesa" primero.

### Sistema de chat (web + iOS + Android)
- Sub-chats: navegación in-place entre salas del negocio (query por business_id, gate can_access_room, candado+password verify_room_password).
- Presencia múltiple: main permanente + ancla del QR permanente + subchat visitado rotativo (hook usePresenceChannels en móvil, con AppState re-track al foreground).
- Scroll robusto: web (aspect-ratio en fotos guardando dims en metadata + re-scroll onLoad) y móvil (FlatList inverted, eliminó timers).
- Fixes de envío: foto iOS baja tras picker, web texto/foto baja (doble rAF), teclado/zoom web iOS (input font-size 16px), Android galería legacy:true + try/catch cámara.
- Visor de imágenes: web (lightbox portal, X en esquina de imagen, cierra click-fuera/Esc/X, zoom doble-clic) + móvil (react-native-image-viewing, pinch-zoom, X con safe-area, swipe-to-close).

---

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
- Local path: /Users/jcgarcia/Projects/JchatVer3.0 (NO space — has web/ + mobile/)
- Web prod: jchat-3.vercel.app
- Owner / super_admin: Juan Carlos García — user id 1bc7f2a8-4d71-4ea3-8c8d-cf059eb1b8de

## Key IDs
| Resource | Value |
|---|---|
| Supabase project | klfsgcfoahdtkojyqspd |
| Vercel project | prj_sGiwIjcnfUbrdzuITqY7ikEMI9tI (team team_eD4O1D2IRdcSlfIJxPhdyegy; CLI scope slug: carlos0cruz007-3843s-projects) |
| Google Cloud project | JChat (jchat-497118) |
| Test business | Bar XZX — slug bar-xzx-omd2, id 0478b8d5-5217-4369-9fa2-128dbe5b38f8 (Plantation FL), menu_mode 'web' |

## Workflow
GitHub MCP read-only for the planning Claude (create_or_update_file returns 403 — ALL writes via Claude Code CLI). Claude Code does all commits/migrations/builds. Supabase + Vercel + Stripe MCP connected. Planning Claude audits every SHA via get_commit, checks deploys via Vercel MCP, writes copy-paste Spanish prompts.

---

## Done / working (verified)

### Menú Web — public ordering page (web/, route /m/[slug]) — COMPLETE
Uber-Eats-style public menu at /m/{slug}, activated by menu_mode='web' (dashboard radio + QR hub button). Components in web/app/m/[slug]/: page.tsx (server, getMenuData + buildGroups) + MenuPageClient.tsx (client; BusinessHeader, CategoryNav, ItemCard with 10 hover effects, CustomizerSheet, CartSheet, PickupSheet, SuccessSheet, CartFAB, Backdrop).
- 10 card hover effects (lift/reveal/tilt/spotlight/duotone/glass/shine/focus/neon/polaroid) — migration 030, menu_card_effect column, owner picks in dashboard.
- Multi-photo per item (menu_item_photos table, migration 029). Category icons via 51 verified Tabler icons in web/lib/categoryIcons.tsx (migration 031, icon_url column).
- Customizer UX (this session): tap card opens customizer (+ button too, with stopPropagation to avoid double-fire); width-capped sheet (maxWidth 460, centered — full-width on phone, modal on desktop); clickable photo thumbnails change hero photo; default selections pre-chosen (single groups open with 1st option / hielo→Normal / picante→Medio) so "Agregar" is active immediately; "Notas para la cocina" textarea (maxLength 200) propagated to CartItem.notes, shown in cart with 📝.

### Modifier groups system (Uber-Eats-style options) — ALL 4 STEPS COMPLETE
Reusable option groups with min/max rules. Migration 032: modifier_groups (id, business_id, key, label, type single|multi, min_select, max_select, choices jsonb, sort) + menu_item_modifier_groups bridge. RLS: public SELECT + owner ALL via owner_id. menu_items.options NOT touched (retrocompat: legacy options→groups normalizer in buildGroups).
- PASO 1 (ce68a9f): tables + RLS + types.
- PASO 2 (88094b3 + 0c55fdc): customizer reads groups, single=radio/chips, multi=checkbox, min/max validation, live price.
- PASO 3 (2ff672a): seed for Bar XZX — 51 groups (4 reusable: tamano_coctel, hielo, tamano_cerveza, temp_cerveza), 60 bridge rows, 17 items.
- PASO 4 (cc04bc0): ModifierGroupsEditor in dashboard item modal (web/app/dashboard/menu/page.tsx) — create/edit/reorder/remove groups, reuse business-wide groups, DELETE+INSERT bridge sync. ALSO fixed database.types.ts JSON-wrapper corruption (+3233 lines, was hidden by ignoreBuildErrors).

### Maps on mobile — RESOLVED on all 3 platforms
- iOS = Apple Maps (no key). Android = Google Maps, REQUIRES JChat Android Maps key in mobile .env + .env.local. Web uses own Google Maps JS key.
- Long Android "blank map" saga root cause: mobile .env had the Web Dashboard key (HTTP-referrer restricted) → Android rejected it. Fix: Android Maps key in BOTH .env and .env.local.
- iOS Google Maps blank-screen (1368497a): react-native-maps plugin must use ARRAY form with iosGoogleMapsApiKey (bare string = Apple Maps only). Kept Google on both to preserve customMapStyle. Platform EAS env vars GOOGLE_MAPS_KEY_IOS / GOOGLE_MAPS_KEY_ANDROID.
- GPS hang fix: getCurrentPositionAsync in Promise.race w/ 8s timeout → Miami FALLBACK_REGION.

### Map control polish
- Zoom +/- (Android camera.zoom; iOS camera.altitude). Recenter-on-user button. Unified top layout via useSafeAreaInsets.

### Web-by-QR customer product (web/, routes /c/[token])
- /c/[token] → welcome → login-with-return → RoomHub (Menú · Llamar servicio · Entrar al chat). join_room_via_qr on mount.
- Web ChatRoom: text + realtime, role badges, incognito, photo, 15 themes, call-waiter.
- QR: dashboard modal, PNG/PDF, qr-code-styling. Migration 027 regenerate_room_qr_token. Token {biz-slug}-{main|sub}-{8hex}.

### Seed demo data (supabase/seeds/)
- seed_demo.sql + seed_cleanup.sql (marker-based, dry-run). 10 businesses, 50 users (userNN@seed.jchat.test / SeedPass123!).
- KEY FINDING: NO auto-profile trigger — auth.users does NOT create public.users. Manual profile needed.

### Chat
- Realtime presence (track gated on SUBSCRIBED; incognito respected). Photo → Storage (base64/ArrayBuffer, Hermes-safe). Smart auto-scroll. Report/Block aligned to schema. sender_name from public.users join + cache.
- Message-send RLS: requires room_members (expires_at>now()) via can_access_room, OR business owner. Real flow grants membership via room QR (join_room_via_qr, 24h).
- Tables blocks/reports/follows/dm_conversations/dm_messages exist with RLS.

---

## Security — P0 status
- P0-1 (private rooms readable by any authed user) — CLOSED (migrations 019-020).
- P0-4 (users RLS) — CLOSED (migration 018, public_profiles view, username_available RPC).
- P0-2 (order totals not recalculated server-side) — OPEN. Production blocker.
- P0-3 (Edge Functions trust client IDs with service_role) — OPEN. Production blocker.
- Gifting/payment screen deferred until P0-2/P0-3 resolved.
- See SECURITY_AUDIT.md / SECURITY_AUDIT2.md before tackling P0-2/P0-3.

---

## DEBT (technical debt — carried)
- ✅ RESUELTO (julio 2026): ignoreBuildErrors + eslint.ignoreDuringBuilds REMOVIDOS de web/next.config.ts. Los 33+ errores de tsc arreglados en lotes 1/1.1/2/3 + cierre; `npx tsc --noEmit` = 0 y `next build` pasa con type-checking real. El bug de analytics/page.tsx (order_items.name inexistente) fue uno de los corregidos. Varias features super-admin (ban/trial/resolver-logs/announcements status) quedaron STUB porque sus columnas no existen en el schema — con TODO en el código.
- 🟡 Migrations 030/031 NOT registered in schema_migrations (applied via execute_sql) — registry desync.
- 🟡 menu_items has TWO legacy photo columns (image_url + photo_url) — consolidate someday.
- 🟡 Date.now() overflows Postgres int — use bigint/sequence for sort fields (was a runtime bug in migration 029).
- Android Maps key per-app restriction PENDING: package com.juangarciacruz.jchatapp + debug SHA-1 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25.
- Re-enable "Confirm email" in Supabase.
- expo-updates (OTA) not configured — needed before distributing to testers.
- EAS internal distribution (expo-dev-client + UDID) for physical iPhone.

---

## What's next — prioritized
1. ✅ HECHO (julio 2026) — TypeScript strict re-activado: 33 errores corregidos, ignoreBuildErrors removido.
2. 🔴 Security P0-2 + P0-3 before any real payments.
3. Fase 3 — comprar (Stripe web checkout). Menú "comprar" still placeholder; gifting deferred here.
4. ✅ HECHO (julio 2026) — Presencia web en vivo + sub-chats in-place (usePresenceChannels: main + ancla + visitado rotativo). Ver "Sesión julio 2026" arriba.
5. Tanda 2 — DMChatScreen (dm_conversations/dm_messages exist).
6. Tanda 3 — UserProfileScreen + users.cover_url + full emoji picker + user_personal_mutes.
7. Conectar dominio jchat.cloud al proyecto Vercel jchat-3 (dominio ya en el team; pendiente decisión www redirect vs apex).

---

## Recent commits (newest first, all on main)
| Commit | Description |
|---|---|
| 9f70a0b | Menu web: tap-to-open customizer, width-cap, thumbnails, defaults, notes (also added gift toggle — REMOVED next, and dropped min-validation — left simple per owner) |
| cc04bc0 | PASO 4 — dashboard modifier groups editor + database.types.ts un-corrupt |
| 2ff672a | PASO 3 — modifier options seed for Bar XZX |
| 0c55fdc | PASO 2 — customizer reads groups (client) |
| 88094b3 | PASO 2 — buildGroups (server) |
| ce68a9f | PASO 1 — migration 032 modifier_groups tables |
| b1e46be | Bar XZX menu seed (5 cats, 17 items, 28 photos) |
| 1368497a | iOS Google Maps blank-screen fix (plugin array form) |

(NOTE: pending at session end — a commit to (A) remove gift toggle, (B) lower customizer sheet 92vh→85vh, (C) card photo aspectRatio 4/3→16/10. If present in git log, this status predates it.)
