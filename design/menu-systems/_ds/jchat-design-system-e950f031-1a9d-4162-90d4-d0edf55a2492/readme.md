# JChat Design System

> **"Connect where you are."**
> The design system for **JChat** — a hyper-local social app where every
> interaction begins inside a real physical place.

---

## 1. What JChat is

JChat is a mobile-first (iOS + Android) social network with a companion web
panel. Unlike distance-based social networks, **connection only happens when
people are physically inside the same place** — a bar, café, gym, plaza. The
map is the home screen; businesses are the gathering points; the group chat is
the connector. Friends can only be discovered by meeting inside a shared place
chat — there is deliberately **no people search**.

Launch markets: **USA & Dominican Republic.** Minimum age **18**.

### Products represented in this system
1. **Mobile app** (the core product — fully built, high fidelity). Map-first
   navigation, place group chats (presence-gated by GPS geofence), live activity
   / trending, profiles (Instagram-style), posts & stories, menus, in-venue
   orders & gifts via Stripe, business registration + verification, owner tools.
2. **Business owner web panel** *(spec'd, not yet built in code)* — dashboard,
   POS / live orders, menu editor, analytics, billing. Treat as roadmap.
3. **Super admin panel** *(spec'd only)* — verification queue, moderation,
   public-locations & events manager.

This system focuses on the **mobile app**, which is the only product with a
real, high-fidelity implementation to recreate.

---

## 2. Sources (provenance)

Everything here is derived from the attached **`JChat/`** codebase (an
Expo / React Native app). Key sources, in order of authority:

| Source | What it gave us |
|---|---|
| `JChat/src/constants/colors.ts` | Canonical color values |
| `JChat/src/constants/theme.ts` | Spacing, radii, font sizes, weights, shadows |
| `JChat/src/screens/**/*.tsx` | The real, authoritative screen styling (StyleSheets) |
| `JChat/JCHAT_SPEC.md` | Full product spec, branding §17, color palette |
| `JChat/design/styles.css` | The team's web design-doc styles (Inter-based) |
| `JChat/design/mockups/*.html` | Placeholder spec pages (generic, **not** hi-fi) |
| `JChat/dashboard/*` | A project-management dashboard (internal, not the product) |

> Note: the `design/mockups/*.html` files are **schematic placeholders** (generic
> form fields), not faithful screen designs. The React Native StyleSheets are the
> real source of truth and what this system is built from.

There is **no Figma file and no GitHub URL** associated with this project — the
codebase was provided directly.

---

## 3. Content fundamentals (voice & copy)

JChat's copy is **plain, calm, and rule-forward** — it constantly reassures the
user about privacy and the "in-person only" boundary.

- **Person & address:** Speaks **to the user as "you"**, about itself as
  "JChat" (third person), e.g. *"JChat verifies your location before unlocking
  this chat."* Rarely uses "we."
- **Casing:** Sentence case for body and most titles. **UPPERCASE** reserved for
  small labels, eyebrows, badges and chips (tracked-out), e.g. `EMAIL`,
  `TRENDING PLACES`, `PRIVATE`.
- **Tone:** Reassuring, factual, lightly technical. It explains *rules* and
  *boundaries* rather than hyping. Lots of microcopy that teaches: *"Friends are
  only discovered inside a shared place chat."*, *"Exact locations stay hidden —
  staff sees the zone, not your spot."*
- **Tagline:** **"Connect where you are."** Splash sub-label is uppercase &
  tracked: `CONNECT WHERE YOU ARE`.
- **Place / activity language:** "active now", "X here", "Trending", "Low /
  Medium / High activity", "within 500m", "Open now", "You're inside".
- **Status labels:** short, single-word-ish — `Permanent`, `Temporary`, `Place`,
  `Verified`, `Pending`, `Live`, `Demo`.
- **Emoji:** Used **functionally**, not decoratively — as category/content icons
  (🍺 bar, ☕ café, 🍕 food, 💪 gym, 🎁 gift) and as content-grid fillers. Never
  sprinkled into prose. UI affordance icons are unicode glyphs, not emoji
  (see Iconography).
- **Buttons / CTAs:** terse and verb-first — *Join chat, View, Continue, Open
  map, Send gift, Edit profile, Scan QR, Leave area*.
- **Numbers & units:** lowercase units, no space for distance/radius (`500m`,
  `250m`, `2km`); `%` for activity.

**Specific examples (verbatim from the app):**
- *"You are inside · {place} · backend verifies before chat"*
- *"{n}m away · device inside radius"* / *"{n}m away · {n}m outside allowed radius"*
- *"Friends are only discovered inside a shared place chat. No random DMs."*
- *"Place account post"*, *"Tags, no DM boundary"*
- *"Your location is private."*

---

## 4. Visual foundations

The aesthetic is **Apple-inspired: modern, minimal, calm, high-contrast**. A
deep-navy chrome frames soft, near-white content. The brand's blue→purple
gradient is used sparingly as a jewel accent (logo, avatars, the primary CTA).

### Color
- **Brand:** primary blue `#378ADD` → purple `#534AB7`, almost always expressed
  as a 135° **gradient** (logo pin, profile avatar, primary sign-in button).
- **Navy chrome:** `#0D1B3E` is the signature surface — splash, screen headers,
  the dark top of the login screen, the profile header, primary dark buttons.
- **Bodies:** `#F7F8FA` app background; **white** cards. Text ink `#1A1A2E`,
  strong navy `#0D1B3E`, secondary `#6B7280`, muted `#9CA3AF`.
- **Live activity heat scale** is a core brand motif: green → yellow → orange →
  red maps to Low → Medium → High → Max/Trending, shown as a gradient bar and as
  colored map-radius overlays. (Note: "Low" sometimes uses brand blue `#378ADD`
  in lists.)
- **Category accents:** each business category has a fixed hue (bar red, café
  orange, restaurant yellow, gym green, beauty purple, retail blue, hotel teal…),
  used as a tinted pill (`color` text on `color@~9%` fill with `color@~25%`
  border).

### Type
- **System font** (SF Pro / Roboto / system-ui) — no custom webfont in the
  codebase. **Titles are MEDIUM (500)**, never bold — the signature calm look.
  **Labels, eyebrows, chips, badges go BLACK (900)**, uppercase, tracked-out.
- Tight negative tracking on the wordmark and big titles (`-0.5px`).

### Shape, border, elevation
- **Corner radii:** inputs 12, buttons/list-cards 14, content cards 16, bottom
  sheet 22, pills/avatars fully round (999). The light login form panel uses a
  distinctive 28px top radius.
- **Borders:** ultra-thin **hairlines** — `0.5px` solid `#E0E2E7` / `#E5E7EB`.
  This 0.5px hairline is everywhere and is a defining detail.
- **Shadows:** soft and navy-tinted, used sparingly. Cards get a barely-there
  `0 2px 4px rgba(13,27,62,.06)`; the map bottom sheet gets a larger upward
  shadow; map markers a small drop shadow. No hard or colored glows except the
  splash pin's pulsing glow.

### Backgrounds & imagery
- No photographic hero imagery in-app; content imagery is **user photos** in
  square grids (Instagram-style), with **category-gradient placeholders**
  (`[catColorDark → #0D1B3E]`) and a large emoji when no photo exists.
- The **map** is the dominant canvas — Google Maps with a custom dark style for
  dark mode, colored semi-transparent **activity radius circles**, and custom
  emoji markers with an activity-count badge.
- No textures, no patterns, no noise/grain. Surfaces are flat and clean.

### Motion
- **Calm, spring-ish ease-out.** Bottom sheet springs up (tension 68, friction
  11); other transitions are short fades/timing (~220–400ms).
- Signature animations: splash **radar rings** pulsing outward from the pin +
  a glow pulse + a shimmer loader bar; a **blinking "live" dot** on activity.
- Reduced-motion friendly — content is readable without animation.

### Interaction states
- **Press:** opacity dip (`activeOpacity` ~0.75–0.86) — a gentle fade, not a
  scale or color jump.
- **Active/selected chips & tabs:** fill flips to **navy `#0D1B3E`** (or the
  brand blue) with white text; inactive chips are `#F3F4F6` / white with
  hairline border and grey text. Tabs show a 2px navy bottom underline.
- **Focus (inputs):** border switches to brand blue `#378ADD`.
- **Disabled:** opacity ~0.4–0.5.

### Layout rules
- **Map-first:** the app opens to the map; multiple screens repeat a "map-first"
  reminder card. Many screens are a **navy header + light scrolling body**.
- Fixed/sticky elements: the dark screen header, the bottom tab bar, the map's
  floating search + activity legend (bottom-left), and the map bottom sheet.
- Generous white space; single-column mobile; content max-width framing on web.

### Transparency & blur
- Used lightly: translucent navy overlays on map marker labels
  (`rgba(10,15,40,.88)`), white-on-navy chips at 10–16% alpha, and a frosted
  translucent topbar on web doc pages (`backdrop-filter: blur`).

---

## 5. Iconography

JChat uses **two icon vocabularies**, both authentic to the codebase:

1. **UI affordance icons = monochrome unicode glyphs.** The app deliberately uses
   single-character glyphs rendered in the system font for chrome/affordances:
   `⌕` search · `i` info · `◎` settings · `◌` bell · `↗` share · `⊞` grid ·
   `⌖` location/directions · `◇` gift · `◷` history · `✓` check · `×` close ·
   `•••` more · `☰` menu · `#` rooms · `▦` QR/menu · `−/+` collapse. These are
   navy or grey, typically heavy weight.
2. **Category & content icons = emoji.** Business categories and content tiles use
   emoji as first-class icons: 🍺 ☕ 🍕 💪 🛒 🎟️ 🏥 🎓 🏖️ 🎁 🌴 🎵 🌆 📍.

> **Substitution note (please review):** For crisp, scalable UI affordance icons
> in *web* deliverables, this system pairs the brand with **[Lucide](https://lucide.dev)**
> (loaded from CDN) — its thin, rounded, SF-Symbols-adjacent stroke is the
> closest match to JChat's minimal Apple aesthetic. The native app itself uses
> the unicode glyphs above. **Emoji are kept as-is** for categories/content since
> they are intrinsic to the brand. If you'd prefer the web components to mirror
> the exact unicode glyphs instead of Lucide, tell me and I'll switch them.

**Canonical 20-icon action set** (see `guidelines/brand-icons.card.html` and the
`Icon` component): `map` Explore · `map-pin` Place · `search` Search ·
`message-circle` Place chat · `flame` Trending · `radio` Live activity ·
`users` People here · `user-round` Profile · `bell` Alerts · `settings` Settings ·
`scan-line` Scan QR · `utensils` Menu · `gift` Send gift · `navigation` Directions ·
`badge-check` Verified · `camera` Post photo · `send` Send · `shield` Privacy ·
`heart` Like · `log-out` Leave area. Default stroke **1.75**, `currentColor`.

There are **no logo image files** in the codebase — the pin logo is drawn with
RN primitives. It has been faithfully reproduced here as SVG:
`assets/jchat-pin.svg`, `assets/jchat-wordmark.svg`,
`assets/jchat-wordmark-white.svg`.

---

## 6. Index / manifest

**Root**
- `styles.css` — global entry point (import this). Imports only.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `base.css`
- `assets/` — `jchat-pin.svg`, `jchat-wordmark.svg`, `jchat-wordmark-white.svg`
- `readme.md` — this guide
- `SKILL.md` — Agent-Skills wrapper

**Guidelines / specimen cards** — `guidelines/` (populate the Design System tab)
- Colors: brand, navy/neutrals, activity scale, category accents, semantic
- Type: display/title, body, labels & eyebrows
- Spacing, radii, shadows, hairline border
- Brand: logo, pin construction

**Components** — `components/` *(reusable React primitives)*
- `core/` — Button, Chip, Badge, Avatar, Card, Input
- `place/` — CategoryPill, ActivityBar, PlaceRow
- (each directory has a `*.card.html` thumbnail + `.d.ts` + `.prompt.md`)

**UI kits** — `ui_kits/`
- `mobile/` — high-fidelity click-through of the JChat app (splash → login →
  map → place sheet → chat → nearby → messages → profile). Self-contained
  React (iOS frame + token-driven inline styles); also registered as a Starting
  Point.

See each subfolder's files for detail.

---

## 7. Caveats

- **Fonts:** the app uses the *system* font (SF Pro) with no bundled webfont.
  On non-Apple platforms web renders fall back to system-ui/Roboto. If you want
  brand-consistent rendering everywhere, supply a licensed SF Pro alternative and
  I'll wire up `@font-face`.
- **Icons:** Lucide substituted for web UI glyphs (see §5) — flag if you want the
  literal unicode glyphs instead.
- **Web panel / super admin:** spec'd but not implemented in code; not recreated
  here beyond tokens. Ask and I can mock them from the spec.
