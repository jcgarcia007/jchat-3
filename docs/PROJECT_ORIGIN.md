# JChat 3.0 — Project Origin & Founding Definitions

The founding context: what JChat is, who it's for, and the questions/answers that defined the build.

Last updated: 2026-06-22

## The core concept
JChat 3.0 is a location-based social and commerce mobile application. Core idea: proximity-based group chats tied to physical venues. When you're at (or near) a venue, you join its live chat room, see who else is there, and order or send gifts in-venue.

Pillars:
- Proximity group chats anchored to venues (geofenced rooms).
- In-venue ordering / gifting via Stripe (Connect).
- Map-first UI — discover venues and activity on a map.
- Three-tier business subscription model for venue owners.

## Markets
- USA and Dominican Republic at launch.
- Bilingual product (English + Spanish); the owner communicates in both.

## Who builds it
- Owner / product / super_admin: Juan Carlos García (jcgarcia007@icloud.com).
- Implementation split: Claude Code (CLI) executes changes; a planning/verifying Claude instance writes detailed specs and checks results via MCP (GitHub, Supabase, Vercel, Stripe).

## Defining questions answered at the outset
1. What is the product? A map-first, proximity social + commerce app where physical venues host live chat rooms with ordering/gifting.
2. What are the core surfaces?
   - Mobile app (React Native / Expo) for end users: map, nearby, venue chat rooms, ordering, profile.
   - Web dashboard (Next.js) for business owners: venue setup, menu/POS, orders, KDS, analytics, loyalty, offers, events, employees, geofence/location editor, chat-room management.
3. How do venues appear on the map? Owners set a location + geofence (pin / circle / polygon) and radius in the web dashboard; coordinates persist to Supabase; the mobile map reads them and renders a pin; tapping enters the venue's main chat room.
4. What's the chat model? Each venue has a Main room and optional sub-rooms (some password-protected). Rooms have themes. Users can enter incognito (nickname, no avatar). Realtime messages + a live presence bar of who's in the room. Moderation (warn/mute/remove/ban) for owners/mods. Pinned messages and offers.
5. How does commerce work? Owners build a menu (categories + items, options, badges, stock). When enabled, an in-chat menu icon opens the ordering flow (cart -> checkout -> Stripe -> order tracking). Map reactions, check-ins, and offers tie social to commerce.
6. Business model? Three-tier subscriptions for venue owners (feature/limit gating by tier).
7. What stack? Expo SDK 56 / React 19 mobile; Next.js web; Supabase (DB/Storage/Realtime/Edge/RLS); Stripe Connect; Google Maps; EAS builds.

## Reference documents (owner-side specs)
The build follows three master documents the owner maintains:
- JCHAT_3.0_MASTER_SPEC.docx
- JCHAT_3.0_DESIGN_SYSTEM.docx
- JCHAT_3.0_DEV_PLAN.docx (68-task plan; complete)

## Build phase history (high level)
- Stages 1-5 (Dev Plan, 68 tasks): Foundation, Social & Auth, Businesses, POS & Payments, Native Map — complete.
- Build / deploy / hardening phase (current): web dashboard wired to real data; geofence editor iterated; iOS Google Maps blank-screen bug diagnosed & fixed; realtime chat presence + menu gating added; chat feature audit done; cross-session documentation established.

## Working principles established
- Diagnose -> fix -> commit -> deploy -> verify via MCP before moving on.
- Verify the live DB/deployment rather than trusting stale code comments.
- Keep changes small and independently testable.
- Protect continuity with the /docs/ knowledge base.
