# JChat 3.0 — Master Product Specification

> Convertido de `JCHAT_3.0_MASTER_SPEC.docx` (junio 2026) a Markdown en la
> consolidación de docs (FASE B, julio 2026). El `.docx` original vive en
> `docs/archive/`. Fuente de verdad del **producto**: flujos, pantallas, reglas de negocio.

---

**JChat 3.0**

Master Product Specification

Version 3.0 | June 2026 | CONFIDENTIAL

Location-based social + POS SaaS | iOS Android Web

Markets: USA & Dominican Republic | Min age: 18+

**1. Product Overview**

JChat 3.0 is a mobile-first (iOS/Android) + web platform combining location-based social discovery, real-time venue chat, and a full SaaS POS system.

**1.1 Tech Stack**

|  |  |
|----|----|
| **Layer** | **Technology** |
| Frontend (web) | Next.js + React + TypeScript + Tailwind CSS |
| Mobile | React Native (iOS & Android) |
| Backend | Supabase (PostgreSQL + RLS + Realtime) |
| Payments | Stripe Connect + Stripe Identity |
| Maps | Google Maps API (Stage 4) |
| Auth | Supabase Auth + OAuth (Google, Apple, Facebook, Outlook) |
| Push notifications | Firebase Cloud Messaging (FCM) |
| Storage | Supabase Storage |

**1.2 Brand Identity**

- Logo icon: Map pin inside rounded square, solid indigo #5C7CFA, white pin centered

- Wordmark: JChat in Arial Black 900 — white on dark / #1d1d1f on light

- Tagline: WHERE YOU ARE — all caps, wide letter-spacing, #5C7CFA at 60% opacity

- Splash screen: Dark map background (streets + heatmap) + dark gradient overlay + indigo center glow

**2. Platform Architecture**

|  |  |  |  |
|----|----|----|----|
| **Feature** | **Mobile app** | **Web app** | **Dashboard (web)** |
| Map & geolocation | Yes — Native GPS | No | No |
| Social feed, chat, stories | Yes | Yes | No |
| Menu ordering & payments | Yes | Yes | No |
| Business registration | No | Yes | No |
| POS — menu, KDS, inventory | No | No | Yes |
| Revenue reports & analytics | No | No | Yes |
| Employee management | Staff view only | Staff view only | Yes — Full control |
| QR code generation | No | No | Yes |
| Chat room theme selector | No | No | Yes |
| Dashboard theme selector | No | No | Yes |
| Owner alerts & service calls | Yes — View only | Yes — View only | Yes — Full |
| Stripe Connect setup | No | No | Yes |

**3. Subscription Tiers & Pricing**

|  |  |  |  |  |
|----|----|----|----|----|
| **Tier** | **Price** | **Employees** | **Sub-rooms** | **Key features** |
| Regular | Free | — | — | Social, chat, map, ordering |
| Verified | $1.99/mo | — | — | Verified badge, VIP room access |
| Business | $49/mo | Max 10 | Max 5 | Full POS, reservations, loyalty, offers |
| Business Pro | $99/mo | Unlimited | Unlimited | API access, advanced analytics, custom QR branding |

No commission per transaction. Subscription only. Owner absorbs Stripe fee (~2.9% + $0.30).

**4. Authentication & Registration**

**4.1 Login Flow (2026 best practices)**

- Primary: Face ID / Touch ID — biometric as first option

- Secondary: Google + Apple social login

- Fallback: Email + password ("or continue with email")

**4.2 Registration — 2 steps**

- Step 1: Full name, email, password, confirm password

- Step 2: Date of birth (18+ enforced), language (EN/ES), @username, Terms of Service agreement

**4.3 Onboarding — 4 static screens**

|  |  |  |  |
|----|----|----|----|
| **#** | **Title** | **Description** | **Illustration** |
| 1 | The people around you are waiting | JChat connects you with everyone physically at the same place. Walk in, join the conversation. | People at a bar with chat bubbles |
| 2 | See what's happening right now | The map shows every active venue near you. The hotter the color, the more people inside. | Live heatmap with pins |
| 3 | Chat, order, and connect | Talk to everyone in the room, call for service, or order directly from the menu — all without leaving the conversation. | Chat UI with menu overlay |
| 4 | You're all set | Find a place near you, walk in, and start connecting. Your next great night out starts here. | Rocket / celebration icon |

Each screen has a Skip button. Screen 4 button changes to "Explore the map" with gradient.

**5. Map (Mobile only — Stage 4)**

**5.1 Design — A2 Pastel Style**

- Light mode: #eef1f8 base, white roads, soft green parks, blue water — Apple Maps inspired

- Dark mode: #111827 base, dark roads, dark blocks

- Auto-switches with system setting (iOS/Android)

- Accent color: Indigo #5C7CFA

- Pins: Teardrop shape with emoji + active user count badge

- Activity heatmap overlay: red (packed) to green (calm), updates real-time

**5.2 Business Preview Card**

- Cover photo (full width, owner-uploaded)

- Business emoji icon superimposed on cover, bottom-left

- Open/Closed badge (real-time based on hours)

- Name, category, distance, rating + review count

- Address (full)

- Hours — today highlighted in green, other days in compact grid

- Working days — 7-day pill row, today filled green

- Photo gallery horizontal scroll with +N counter

- Live strip: active users now + room chips (Main, VIP, Stage)

- Action buttons: Enter Chat | View Menu | GPS Navigation | Share

**5.3 Proximity Notifications**

- User must remain within venue radius for minimum 30 seconds before notification fires

- Under 30 seconds = no notification — filters out drive-by / car traffic

- Maximum 1 notification per venue every 2 hours

- Maximum 3 proximity notifications per day per user — prevents saturation when walking

- No minimum active users required — all active venues qualify

- No notification if user is already inside that venue chat

- 4 modes (user sets in settings): All active venues / Favorites only / Previously visited / Off

**6. Chat & Rooms**

**6.1 Structure**

- 1 mandatory main room per business

- Business: up to 5 sub-rooms | Business Pro: unlimited

- Each room: individual theme (15 options), name, custom icon, TTL, password option

- Sub-room password: Owner/Manager only can see/change — users must enter to access

**6.2 Menu Icon**

- Menu icon (fork/knife) fixed at RIGHT of sub-rooms scroll row, separated by divider line

- Only visible if Owner has activated menu for this business

- Tapping opens full-screen menu

**6.3 PIN MESSAGE FLOW — 3 screens**

**Screen 1 — Long press:**

- Owner/Moderator long presses any message in chat

- Bottom sheet appears with 4 options:

- Pin message (Owner/Moderator exclusive)

- Share to rooms

- Copy text

- Delete message (Owner/Moderator exclusive)

**Screen 2 — Pin configuration:**

- Message preview shown with blue left border

- Notify users: Yes (push + in-chat) or Silent

- Choose rooms: checkboxes with room name + active user count

- Auto-unpin timer: 2h / 4h / 24h / Manual

**Screen 3 — Pin active:**

- Sticky banner at top of chat (below sub-rooms row)

- Banner: pin icon + message preview (truncated) + countdown timer + X button to unpin

- System message in chat: "Owner pinned a message"

- Tapping banner scrolls to original message

**6.4 OFFERS FLOW — 3 screens**

**Screen 1 — Access:**

- Owner taps + button in chat input bar

- Panel expands with 4 options: Photo / Voice / GIF / Offer

- Offer button highlighted in amber with price tag icon

**Screen 2 — Create offer:**

- Offer type: Discount (%) | 2x1 / Bundle | Happy hour | Free item

- Fields: Title, discount amount, minimum purchase, description

- Duration: 1h / 2h / Tonight / Custom

- Room selector: multi-select which rooms receive the offer

**Screen 3 — Offer in chat:**

- Visual card with gradient header (indigo to purple)

- Card: emoji, title, countdown timer, discount badge (%), description, promo tags

- Buttons: Order now (primary, opens filtered menu) + Share (secondary)

- Footer: crown icon + "Posted by Owner" label

- If duration \> 0: also shows as pinned banner at top

**6.5 User Interactions**

|  |  |  |
|----|----|----|
| **Action** | **Regular user** | **Owner / Moderator** |
| View profile | Yes | Yes |
| Send DM | Yes | Yes |
| Follow / Add friend | Yes | Yes |
| Personal block (hides from own view only) | Yes | Yes |
| Report | Yes | Yes |
| Add as employee | No | Yes — Owner only |
| Mute in room | No | Yes |
| Remove from room | No | Yes |
| Ban permanently from venue | No | Yes |
| Pin message | No | Yes |
| Delete any message | No | Yes |

**6.6 Chat Room Themes — 15 options**

Owner selects per room from dashboard web. Miniature previews shown. Applies immediately to all users in that room.

**7. Menu & Purchase Flow**

**7.1 Access**

- User taps menu icon in chat bar → full-screen menu opens

- After ordering → returns to chat with confirmation

**7.2 Menu Structure**

- Categories with custom icons: 120 emoji + 126 SF-style vector icons (14 categories each)

- SF-style icons: 9 color options + 3 styles (Line / Filled / Rounded)

- Featured promotional banner (happy hour, daily specials)

- Search bar within menu

- Best Seller / New / Hot item badges

- Card layout (large photo) + compact layout (inline)

**7.3 Product Detail Screen**

- Full-width product photo

- Name, description, price, dietary/spice tags

- Customization: size selector (required) + extras (optional) + special instructions text field

- Quantity selector with real-time price update

- Add to cart button showing running total

**7.4 Cart**

- Order type: Table (waiter brings) / Counter (pickup) / Gift (send to another user in chat)

- Items list with inline quantity edit

- Promo code field

- Subtotal + tax breakdown

**7.5 Checkout — Express 1 screen**

- Order summary with Edit shortcut

- Tip selector: 10% / 15% / 20% / Custom

- Payment method: saved card / Apple Pay / Google Pay / PayPal

- Final total (subtotal + tax + tip)

- Face ID / Touch ID to confirm

- "Secured by Stripe" trust indicator below button

- Save card prompt appears after first payment ("Save for faster checkout?")

**7.6 Order Tracking — Real-time**

- 3-step progress stepper: Confirmed (blue) → Preparing (amber) → Ready (green)

- ETA countdown in minutes

- Per-item status (Cooking / Ready)

- Service call button inside tracking screen

- Push notification when order is ready

- Rating prompt (1-5 stars) after delivery

- "Back to chat" button on completion

**8. Employee System**

**8.1 Adding Employees**

- Owner taps user avatar in chat → "Add as employee" appears in Owner action panel

- Owner assigns role and confirms

- User receives push notification invitation

- User accepts → business appears in linked businesses list on their profile

- Staff section visible exclusively on business profile page for that employee

**8.2 Physical Presence Rule**

- Chat moderation (mute, remove, ban) requires physical presence within venue radius

- Orders, alerts, and service calls accessible from anywhere

**8.3 Employee Roles**

|  |  |  |  |
|----|----|----|----|
| **Role** | **Web dashboard** | **Mobile app** | **Key permissions** |
| Manager | Full except billing | Chat + alerts + orders | Manage staff, menu, rooms — can see/change room passwords |
| Cashier | Orders + payments + reports | Order alerts | Process orders, view sales reports |
| Waiter | Assigned orders only | Orders + service calls | Mark orders as delivered |
| Kitchen / KDS | KDS view only | Real-time order queue | Mark individual items as ready |
| Chat Moderator | Chat reports view | Full chat moderation | Mute, remove, ban users (physical presence required) |
| Analyst | Reports read-only | No access | View analytics and KPIs only |

**8.4 Notifications**

- Work notifications visually differentiated from social: different icon style and color

- Employee configures work notification preferences independently in settings

- Business plan: max 10 employees | Business Pro: unlimited

**9. Payments (Stripe)**

**9.1 Payment Methods**

- Credit/debit card: Visa, Mastercard, Amex

- Apple Pay (iOS)

- Google Pay (Android)

- PayPal

- Saved card: user decides at first payment ("Save for faster checkout?")

**9.2 Payment Failure**

- Bottom sheet appears from below with error details and clear options

- Options: Try another card / Use Apple Pay / Use Google Pay / Use PayPal / Pay at counter

**9.3 Refunds & Disputes — 2 levels**

|  |  |  |  |
|----|----|----|----|
| **Level** | **Who** | **Timeframe** | **Action** |
| Level 1 | Business Owner | 48 hours | Can approve full/partial refund or reject dispute |
| Level 2 (auto) | Super Admin | After 48h no Owner response | Reviews and can force refund via Stripe |
| Level 2 (manual) | Super Admin | User rejects Owner resolution | Final decision — not reversible |

**9.4 Subscription Payment Failure**

- Day 0: Payment fails — Stripe auto-retries + notification to Owner

- Day 1-2: Daily Stripe retries + escalating urgency notifications

- Day 3: No payment — business removed from map, chat and POS suspended

- Recovery: Owner updates payment method → business reactivated immediately

**9.5 Owner Payouts**

- Owner chooses frequency during Stripe Connect setup: Daily / Weekly / Monthly

- Frequency changeable anytime from dashboard settings

- Payouts processed automatically by Stripe Connect

**10. Business Verification**

|  |  |  |  |
|----|----|----|----|
| **Step** | **Method** | **Provider** | **What it verifies** |
| 1 — Identity | Stripe Connect + Stripe Identity | Stripe | Owner identity — document + selfie. Handles KYC automatically. No manual upload needed. |
| 2 — Physical | Selfie at location with JChat-generated unique code | JChat | Business exists at registered address. Owner is physically present. |
| 3 — Phone | SMS sent to registered business phone number | Twilio | Owner controls the published business phone number. |

- Step 1 only approved: Business appears on map with Pending badge — can chat, cannot process payments

- All 3 steps complete: Business gets verified badge — payments enabled, full functionality

- Super Admin reviews drawn radius during verification — can adjust or reject before approving

- Extended radius requests (beyond plan limit) require separate Super Admin approval

**11. Super Admin Panel**

**11.1 Platform KPIs**

- MRR, ARR, Total users, DAU/MAU ratio, Churn rate, LTV average, CAC

- Messages per day, Active rooms, Transactions today, 30-day retention

**11.2 Admin Team Roles**

|  |  |
|----|----|
| **Role** | **Permissions** |
| Super Admin (owner) | Everything — no restrictions |
| Platform Moderator | Ban users, close businesses, remove users from rooms, review reports |
| Verification Agent | Approve/reject business verifications and radius requests only |
| Finance Admin | Revenue, MRR, subscriptions, failed payments — read-only |
| Analytics Viewer | All metrics and reports — read-only, no actions |
| Communications Admin | Send push announcements, manage public locations and events |
| Support Agent | Search users, view history, assign free trials |

**11.3 Add-on Permissions (assignable to any role)**

- Log Viewer — can view all admin audit logs

- Trial Manager — can assign free trials

- Locations Manager — can create and edit public locations

- Broadcast — can send mass push notifications

**11.4 Adding Admin Team Members**

- By email: invite external person — receives email with link to create admin account

- By JChat username: search existing user, elevate to admin role

- Super Admin sets role + add-on permissions at time of invitation

**11.5 Silent Access**

- All admin team members have silent access to all businesses and rooms

- Business owner is NOT notified when admin enters their business or chat

- Every access logged: timestamp, admin user, business, room, action taken

- Log Viewer permission required to see these logs (Super Admin always has access)

**11.6 Business & User Management**

- Close business: immediate — choose public or internal reason message

- Suspend business: temporary with defined duration

- Ban levels: Temporary (1/3/7/30/90 days) / Permanent / Delete account

- Optional device fingerprint block can be added to any ban level for serious violations

- Appeals: 1 allowed per user, only after 30 days from ban date, form with reason, low priority queue

**11.7 Free Trial Assignment**

- Search user by @username or email

- Select tier: Verified / Business / Business Pro

- Set custom duration in days

- Optional internal note (e.g. "Influencer partnership")

- User notified immediately with push + email

- Reminders at 3 days and 1 day before expiry

- On expiry: access revoked + CTA to upgrade to paid plan

**11.8 Announcements — Segment Builder**

- Free-form filter combinations — similar to Braze or Mailchimp audience builder

- Available filters: plan tier, activity level, location (country/state/city), language (EN/ES), trial status, date ranges, specific venue visitors

**12. Analytics Pro (Business Pro tier)**

- Daily revenue chart with peak day, peak hour, and tips breakdown

- Top products ranking: units sold, revenue per item

- Activity heatmap: orders by hour x day of week (visual grid)

- Customer segments: Regulars (3+ visits/month) / Occasional / New / At risk (30d inactive)

- Cohort retention analysis: weekly retention by signup month

- Revenue forecast: next 30 days with confidence percentage

- Loyalty program ROI tracking

- API access for export to external tools (Tableau, Google Sheets, etc.)

- CSV and PDF export for all reports

- Analytics panel inherits color theme from dashboard theme selection

**13. Privacy & Security**

**FUNDAMENTAL RULE — Real-time location is NEVER shared with any user in any form under any circumstances. This setting is permanently locked and cannot be changed by any user.**

|  |  |  |
|----|----|----|
| **Category** | **Setting** | **Options / Notes** |
| Profile | Account visibility | Public / Private (follower requests must be approved) |
| Profile | City of residence | Show / Hide — manual text entry only, never from GPS |
| Profile | Active status | Show / Hide |
| Profile | Offline mode | Appear offline while actually active |
| Content | Who sees my posts | Everyone / Followers only / Nobody |
| Content | Who sees my stories | Everyone / Followers only / Nobody |
| Content | Places visited tab | Everyone / Followers / Nobody — no timestamps ever shown |
| Content | Gifts received tab | Everyone / Followers only / Nobody |
| Content | Geotag on posts & stories | Off by default — manual text only, never GPS coordinates |
| Content | Visible profile tabs | Toggle each tab individually (Posts, Stories, Places, Gifts, Saved) |
| Messages | Who can DM me | Everyone / Followers only / Nobody |
| Messages | Read receipts | Show / Hide |
| Chat | Who can mention me (@) | Everyone / Followers only / Nobody |
| Chat | Appear in chat searches | Yes / No |
| Location | Share real-time location | Always off — locked, not configurable by anyone |

**14. Confirmed Design Decisions**

|  |  |
|----|----|
| **Design item** | **Final decision** |
| App logo icon | Map pin inside rounded square, solid indigo #5C7CFA, white pin centered |
| Wordmark | JChat — Arial Black 900 weight, white on dark / #1d1d1f on light backgrounds |
| Splash screen | Dark city map with streets and heatmap + dark gradient overlay + indigo center glow |
| Map visual style | A2 Pastel — Apple Maps inspired, light (#eef1f8) + dark (#111827), auto-switches with system |
| Business pin shape | Teardrop (50% 50% 50% 0, rotated -45deg) with emoji + user count badge |
| Business preview card | Cover photo + icon + Open badge + hours + 7-day pills + gallery + live strip + 4 action buttons |
| Chat menu access | Fork icon fixed at right of sub-rooms row with divider separator |
| Chat room themes | 15 themes, one per room, selected from dashboard web — applies immediately |
| Dashboard themes | 10 themes, one per business, selected from Configuration section |
| Profile themes | 15 themes, user selects their own from Profile settings |
| Auth entry order | Face ID first, then social login (Google/Apple), then email as fallback |
| Registration flow | 2-step: personal info first, then date of birth + username + language + terms |
| Menu access | Full-screen menu opens from chat, user returns after ordering |
| Checkout flow | Express 1-screen: summary + tip + payment + Face ID confirmation |
| Icon selector | Dual library: 120 emoji + 126 SF-style vector icons with color (9 options) + style (3 options) |
| Pin message flow | Long press → bottom sheet → config screen → sticky banner with countdown at top of chat |
| Offers flow | \+ button → offer type grid → card in chat with gradient + timer + Order now button |
| Sub-room password | Owner/Manager only — users enter password to enter protected rooms |
| Incognito mode | Toggle before entering room → nickname → sees names/avatars only, not full profiles |

**15. Development Roadmap**

|  |  |  |
|----|----|----|
| **Stage** | **Scope** | **Key deliverables** |
| Stage 1 — Social foundation | Auth, profiles, social features, i18n | Registration + login (Face ID + OAuth), user profiles, social feed, stories, DMs, follow system, 15 profile themes, English + Spanish |
| Stage 2 — Businesses & chat | Business setup, chat, employees, QR | Business registration, chat rooms, sub-rooms, password protection, QR codes, incognito mode, check-in, reviews, map discovery (web), employee system, pin messages, offers |
| Stage 3 — POS & payments | Full commerce + admin panel | Menu editor (emoji + SF icons), orders, KDS, inventory, Stripe Connect, checkout, reservations, loyalty, analytics Pro, offers builder, Super Admin panel, notifications |
| Stage 4 — Native map | Geolocation, heatmap, live map | Google Maps integration, activity heatmap, live pins, proximity notifications (30s rule), map reactions, geofencing, radius enforcement |

**16. Future Features (Out of Scope v3.0)**

- Event tickets — creation, QR scan entry validation, capacity management, refund policy

- Delivery module — scope and logistics to be defined in v3.1

- AI-learned proximity notifications — learns user visit history to personalize alerts

- Multi-location business management — Owner manages multiple venues from one dashboard
