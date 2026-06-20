# JChat 3.0

Location-based social + business platform. Monorepo with a React Native (Expo)
mobile app, a Next.js dashboard/web app, and a shared Supabase backend.

## Structure

| Path        | Stack                       | Purpose                                   |
|-------------|-----------------------------|-------------------------------------------|
| `mobile/`   | React Native + Expo (TS)    | End-user app (5 tabs: Map, Nearby, DMs, Friends, Profile) |
| `web/`      | Next.js 14+ (App Router, TS)| Business dashboard, super-admin, public web |
| `supabase/` | Postgres + Edge Functions   | Backend, RLS, payments (added in later stages) |

## Getting started

```bash
# Mobile
cd mobile && npm install && npx expo start

# Web
cd web && npm install && npm run dev   # http://localhost:3000

# Type check (run in each project)
npx tsc --noEmit
```

Copy `.env.example` → `.env` and fill in the keys. **Never commit `.env`.**

## Reference documents (source of truth, in repo root)

1. `JCHAT_3.0_MASTER_SPEC.docx` — product: flows, screens, business rules
2. `JCHAT_3.0_DESIGN_SYSTEM.docx` — colors, themes, tokens, components
3. `JCHAT_3.0_DEV_PLAN.docx` — 68 atomic tasks with verification checklists

See `CLAUDE.md` for the architecture overview and the per-session workflow.
