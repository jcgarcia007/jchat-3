# JChat 3.0 — Design System & Tokens

> Convertido de `JCHAT_3.0_DESIGN_SYSTEM.docx` (junio 2026) a Markdown en la
> consolidación de docs (FASE B, julio 2026). El `.docx` original vive en
> `docs/archive/`. Fuente de verdad del **diseño**: colores, temas, tokens, componentes.

---

**JChat 3.0**

Design System & Developer Tokens

Technical reference for Claude Code & developers

Version 3.0 | June 2026 | Use with JCHAT_3.0_MASTER_SPEC.docx

**1. Core Color Tokens**

Copy these exact values into your globals.css or tailwind.config.js. All UI must use these tokens — never hardcode colors.

**1.1 Brand Colors**

|  |  |  |
|----|----|----|
| **Token** | **Hex value** | **Usage** |
| --color-brand | #5C7CFA | Primary accent — buttons, active states, links, pins |
| --color-brand-dark | #4A6AE8 | Hover state for brand buttons |
| --color-brand-light | rgba(92,124,250,0.12) | Background tint for selected states |
| --color-brand-purple | #7C3AED | Secondary accent — offer gradients, special badges |
| --color-success | #1D9E75 | Confirmed orders, open status, verified badges |
| --color-warning | #f59e0b | Pending orders, alert states, offers button |
| --color-danger | #ef4444 | Errors, payment failures, ban indicators, service alerts |
| --color-gold | #D97706 | Gold tier, premium badges, Deep Space theme accent |

**1.2 Dark Mode Surface Colors**

|                  |               |                                        |
|------------------|---------------|----------------------------------------|
| **Token**        | **Hex value** | **Usage**                              |
| --bg-base        | #0f0f11      | App background (darkest layer)         |
| --bg-surface     | #18181b      | Cards, sidebars, headers (elevated)    |
| --bg-elevated    | #1a1d2e      | Inputs, chips, secondary cards         |
| --bg-overlay     | #2a2a2e      | Hover states, dividers, inactive chips |
| --border-subtle  | #2a2a2e      | All borders and dividers in dark mode  |
| --text-primary   | #f5f5f7      | Primary text                           |
| --text-secondary | #aeaeb2      | Secondary text, descriptions           |
| --text-tertiary  | #636366      | Placeholders, timestamps, hints        |

**1.3 Light Mode Surface Colors**

|                        |               |                          |
|------------------------|---------------|--------------------------|
| **Token**              | **Hex value** | **Usage**                |
| --bg-base-light        | #f9f9fb      | App background light     |
| --bg-surface-light     | #ffffff      | Cards, panels            |
| --bg-elevated-light    | #f2f2f7      | Inputs, chips, secondary |
| --border-subtle-light  | #e5e5ea      | Borders and dividers     |
| --text-primary-light   | #1d1d1f      | Primary text             |
| --text-secondary-light | #8e8e93      | Secondary text           |
| --text-tertiary-light  | #c7c7cc      | Placeholders             |

**1.4 Map Colors**

|                    |               |                                  |
|--------------------|---------------|----------------------------------|
| **Token**          | **Hex value** | **Usage**                        |
| --map-light-base   | #eef1f8      | Map background light (A2 Pastel) |
| --map-light-roads  | #ffffff      | Road color light mode            |
| --map-light-blocks | #e0e5f0      | Building blocks light            |
| --map-light-parks  | #c8e6c9      | Park areas light                 |
| --map-light-water  | #b3d9f5      | Water features light             |
| --map-dark-base    | #111827      | Map background dark              |
| --map-dark-roads   | #252d3d      | Road color dark                  |
| --map-dark-blocks  | #1a2030      | Building blocks dark             |
| --map-dark-parks   | #162412      | Park areas dark                  |
| --map-dark-water   | #0d2035      | Water features dark              |
| --heat-hot         | #FF3B30      | Heatmap — 80-100% capacity       |
| --heat-warm        | #FF9500      | Heatmap — 50-79% capacity        |
| --heat-mild        | #FFCC00      | Heatmap — 25-49% capacity        |
| --heat-cool        | #34C759      | Heatmap — 0-24% capacity         |

**2. Typography**

|  |  |  |  |  |
|----|----|----|----|----|
| **Element** | **Font** | **Size** | **Weight** | **Color token** |
| App title (splash) | System / SF Pro | 32px / 2rem | 900 | #ffffff |
| Screen title (H1) | System / SF Pro | 22px / 1.375rem | 700 | --text-primary |
| Section header (H2) | System / SF Pro | 17px / 1.063rem | 600 | --text-primary |
| Body text | System / SF Pro | 15px / 0.938rem | 400 | --text-primary |
| Secondary text | System / SF Pro | 13px / 0.813rem | 400 | --text-secondary |
| Caption / Label | System / SF Pro | 11px / 0.688rem | 500 | --text-tertiary |
| Button text | System / SF Pro | 13-15px | 600-700 | #ffffff or --text-primary |
| Chat message | System / SF Pro | 15px | 400 | --text-primary |
| Price / Number | System / SF Pro | varies | 600-700 | --text-primary (tabular-nums) |
| Monospace (terminal) | Courier New / Menlo | 13px | 400 | --text-primary |

Font stack (React Native): fontFamily: Platform.OS === "ios" ? "SF Pro Text" : "Roboto"

Font stack (Web/Next.js): font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif

**3. Spacing & Border Radius**

|           |           |                                     |
|-----------|-----------|-------------------------------------|
| **Token** | **Value** | **Usage**                           |
| --space-1 | 4px       | Micro gaps, icon padding            |
| --space-2 | 8px       | Small gaps between related elements |
| --space-3 | 12px      | Default card internal padding       |
| --space-4 | 16px      | Screen horizontal padding           |
| --space-5 | 20px      | Section spacing                     |
| --space-6 | 24px      | Large section gaps                  |
| --space-8 | 32px      | Screen-level spacing                |

|               |           |                                      |
|---------------|-----------|--------------------------------------|
| **Token**     | **Value** | **Usage**                            |
| --radius-sm   | 6px       | Small chips, badges                  |
| --radius-md   | 8-10px    | Buttons, inputs, small cards         |
| --radius-lg   | 12px      | Cards, panels, modals                |
| --radius-xl   | 16px      | Large cards, bottom sheets           |
| --radius-2xl  | 20-28px   | Phone screen corners, major overlays |
| --radius-full | 999px     | Pills, chips, tags, avatar           |
| --radius-icon | 20px      | App icon, splash logo square         |

**4. Component Specifications**

**4.1 Buttons**

|  |  |  |  |  |  |
|----|----|----|----|----|----|
| **Variant** | **Background** | **Text** | **Border** | **Height** | **Border radius** |
| Primary | #5C7CFA | #ffffff | none | 44px | 12px |
| Secondary (dark) | #1a1d2e | #aeaeb2 | 0.5px solid #2a2a2e | 44px | 12px |
| Secondary (light) | #f2f2f7 | #1d1d1f | 0.5px solid #e5e5ea | 44px | 12px |
| Danger | rgba(239,68,68,0.12) | #ef4444 | 0.5px solid rgba(239,68,68,0.3) | 44px | 12px |
| Ghost | transparent | #5C7CFA | none | 44px | 12px |
| Small primary | #5C7CFA | #ffffff | none | 32px | 8px |
| Icon button | #1a1d2e | icon color | 0.5px solid #2a2a2e | 36px | 8-50% |

**4.2 Input Fields**

|                 |                |                      |          |                 |
|-----------------|----------------|----------------------|----------|-----------------|
| **State**       | **Background** | **Border**           | **Text** | **Placeholder** |
| Default (dark)  | #1a1d2e       | 0.5px solid #2a2a3e | #f0f0f5 | #636366        |
| Focus (dark)    | #1a1d2e       | 0.5px solid #5C7CFA | #f0f0f5 | #636366        |
| Default (light) | #f9f9fb       | 0.5px solid #e5e5ea | #1d1d1f | #c7c7cc        |
| Focus (light)   | #ffffff       | 0.5px solid #5C7CFA | #1d1d1f | #c7c7cc        |
| Error (any)     | inherit        | 0.5px solid #ef4444 | inherit  | inherit         |

Input height: 44px | Border radius: 10-12px | Padding: 12px 14px | Font size: 15px

**4.3 Chat Bubbles**

|  |  |  |  |
|----|----|----|----|
| **Type** | **Background** | **Text** | **Border radius** |
| Incoming (dark) | #2a2a2e | #d1d1d6 | 12px 12px 12px 3px |
| Outgoing (dark) | #5C7CFA | #ffffff | 12px 12px 3px 12px |
| Incoming (light) | #ffffff | #1d1d1f — border: 0.5px #e5e5ea | 12px 12px 12px 3px |
| Outgoing (light) | #5C7CFA | #ffffff | 12px 12px 3px 12px |
| System message | transparent | #636366 — centered | 999px |

**4.4 Map Pins**

|  |  |
|----|----|
| **Property** | **Value** |
| Shape | border-radius: 50% 50% 50% 0 — rotated -45deg |
| Sizes | Small: 24px \| Medium: 30px \| Large: 38px \| Featured: 44px |
| Color coding | Red (#FF3B30) = packed \| Orange (#FF9500) \| Yellow (#FFCC00) \| Green (#34C759) = calm |
| Inner emoji | Rotated 45deg to compensate — font-size: 55% of pin size |
| User count badge | Absolute top-right \| background: #ef4444 \| font-size: 7px \| border: 1.5px solid map bg |
| Label card | Below pin \| background: rgba(bg,0.88) \| border-radius: 5px \| font-size: 8px \| font-weight: 600 |
| Drop shadow | box-shadow: 0 3px 10px rgba(pin-color, 0.35) |

**4.5 Cards**

|  |  |  |  |  |
|----|----|----|----|----|
| **Card type** | **Background** | **Border** | **Padding** | **Border radius** |
| Standard card (dark) | #18181b | 0.5px solid #2a2a2e | 12px 14px | 12px |
| Standard card (light) | #ffffff | 0.5px solid #e5e5ea | 12px 14px | 12px |
| Business preview card | #fff / #1e2535 | 0.5px solid context | 12-14px | 24px (outer) |
| Offer card (chat) | linear-gradient(135deg, #1a2040, #1a1a2e) | 1px solid #5C7CFA | none | 14px |
| Offer card header | linear-gradient(135deg, #5C7CFA, #7C3AED) | none | 10px 12px | 14px 14px 0 0 |
| KPI card | #080c18 | 0.5px solid #151824 | 10px 12px | 8px |

**4.6 Toggles**

|  |  |  |  |  |
|----|----|----|----|----|
| **State** | **Track background** | **Track size** | **Thumb** | **Transition** |
| Off (dark) | #3a3a4e | 40x22px — radius 999px | 18px white circle, left: 2px | 0.2s ease |
| On (dark) | #5C7CFA | 40x22px — radius 999px | 18px white circle, left: 20px | 0.2s ease |
| Off (light) | #d1d5db | 40x22px | 18px white circle, left: 2px | 0.2s ease |
| On (light) | #5C7CFA | 40x22px | 18px white circle, left: 20px | 0.2s ease |

**4.7 Pinned Message Banner**

|               |                                                             |
|---------------|-------------------------------------------------------------|
| **Property**  | **Value**                                                   |
| Background    | rgba(92,124,250,0.08)                                       |
| Border bottom | 0.5px solid rgba(92,124,250,0.2)                            |
| Padding       | 8px 12px                                                    |
| Pin icon      | ti-pin \| color: #5C7CFA \| size: 14px                     |
| Message text  | font-size: 11px \| color: #aeaeb2 \| single line truncated |
| Timer         | font-size: 9px \| color: #636366 \| right aligned          |
| Close button  | ti-x \| color: #636366 \| size: 12px \| Owner/Mod only     |

**4.8 Offer Card (in chat)**

|  |  |
|----|----|
| **Property** | **Value** |
| Outer container | background: linear-gradient(135deg,#1a2040,#1a1a2e) \| border: 1px solid #5C7CFA \| border-radius: 14px |
| Header gradient | background: linear-gradient(135deg,#5C7CFA,#7C3AED) \| padding: 10px 12px |
| Discount badge | background: rgba(255,255,255,0.2) \| border-radius: 8px \| font-size: 16px bold white |
| Countdown timer | ti-clock icon + text \| color: rgba(255,255,255,0.7) \| font-size: 9px |
| Order now button | background: #5C7CFA \| color: #fff \| border-radius: 8px \| font-weight: 700 |
| Share button | width: 34px \| background: #1a1d2e \| border: 0.5px solid #2a2a3e |
| Owner tag | ti-crown icon (size 8px) + text \| font-size: 9px \| color: #636366 |

**5. Dashboard Themes — 10 complete sets**

Each theme defines: bg-base, bg-surface, bg-elevated, border, accent, accent-text, text-primary, text-secondary, text-tertiary. Apply via CSS class on root container.

|  |  |  |  |  |  |
|----|----|----|----|----|----|
| **Theme #** | **Class name** | **bg-base** | **bg-surface** | **accent** | **text-primary** |
| T1 | theme-midnight-blue | #0a0c14 | #0d0f1a | #378ADD | #e8eaff |
| T2 | theme-clean-white | #f8f9fc | #ffffff | #4F46E5 | #1e293b |
| T3 | theme-forest-green | #0a120a | #0d150d | #22C55E | #dcfce7 |
| T4 | theme-royal-purple | #0e0814 | #110a1a | #7C3AED | #ede9fe |
| T5 | theme-slate-gray | #0f1117 | #131720 | #64748B | #f1f5f9 |
| T6 | theme-sunset-orange | #0f0800 | #130a00 | #F97316 | #fff7ed |
| T7 | theme-rose-crimson | #0f0005 | #130008 | #E11D48 | #fff1f2 |
| T8 | theme-ocean-teal | #040f12 | #051218 | #0D9488 | #f0fdfa |
| T9 | theme-gold-black | #080600 | #0a0800 | #D97706 | #fefce8 |
| T10 | theme-arctic-white | #f8fafc | #ffffff | #0EA5E9 | #0f172a |

**Full T1 Midnight Blue token set (reference for all others):**

--db-bg-base: #0a0c14;

--db-bg-surface: #0d0f1a;

--db-bg-elevated: #151824;

--db-bg-overlay: #1a1d35;

--db-border: #151824;

--db-accent: #378ADD;

--db-accent-text: #ffffff;

--db-accent-bg: rgba(55,138,221,0.12);

--db-text-primary: #e8eaff;

--db-text-secondary: #9095b0;

--db-text-tertiary: #636390;

--db-success: #22c55e;

--db-warning: #f59e0b;

--db-danger: #ef4444;

**6. Chat Room Themes — 15 complete sets**

Applied per room. Each defines: bg, topBg, border, accent, bubble-in-bg, bubble-in-text, bubble-out-bg, bubble-out-text, input-bg, tab-active, tab-inactive.

|  |  |  |  |  |  |
|----|----|----|----|----|----|
| **#** | **Name** | **bg** | **accent** | **Bubble in** | **Bubble out** |
| 1 | Black & Blue | #0f0f11 | #378ADD | #2a2a2e / #d1d1d6 | #378ADD / #fff |
| 2 | Neomorphism | #e8eaf0 | #5068e0 | shadow #e8eaf0 / #3a3d55 | shadow #e8eaf0 / #5068e0 |
| 3 | Brutalist | #fff (msgs) / #f5f500 (bars) | #000 | #fff border #000 / #000 | #000 / #f5f500 |
| 4 | Sunset | #1a0a0f | #ff6b35 | #2a0d18 / #ffd4b8 | #ff6b35 / #fff |
| 5 | Sage & Clay | #f0ede6 | #6b8f71 | #e8e3d8 / #3a3028 | #6b8f71 / #fff |
| 6 | Electric Orange | #0d0d0d | #ff5c00 | #1a1a1a / #ccc | #ff5c00 / #fff |
| 7 | Arctic Blue | #f0f5ff | #2a5fcf | #fff border #c0d4f0 / #0a1a40 | #2a5fcf / #fff |
| 8 | Mint Dark | #010d0a | #00ff88 | #003320 / #ccffe8 | #00ff88 / #010d0a |
| 9 | Rose Gold | #1a0d0d | #c9826e | #221015 / #f0d8cc | #c9826e / #fff |
| 10 | Swiss Mono | #fff | #000 | #f5f5f5 border #000 / #000 | #000 / #fff |
| 11 | Deep Space | #050818 | #d4a820 | #080e28 / #e8ddb0 | #d4a820 / #050818 |
| 12 | Pastel Soft | #fef6ff | #d4a0e8 | #fff border #e8cff0 / #5a3070 | #d4a0e8 / #fff |
| 13 | Retro 80s | #0a001a | #ff00ff | #1a0035 / #ff00ff | #ff00ff / #0a001a |
| 14 | Sand Dunes | #1a1208 | #c8a040 | #221a0a / #e8d8a0 | #c8a040 / #1a1208 |
| 15 | Icy Glass | #e8f0f8 | rgba(60,120,220,0.4) | rgba(255,255,255,0.7) / #1a2a50 | rgba(60,120,220,0.25) / #1a2a50 |

**7. Profile Themes — 15 complete sets**

Applied per user. Defines cover gradient, avatar border, name color, stats background, button colors, tab active color, and post grid cell colors.

|  |  |  |  |  |  |
|----|----|----|----|----|----|
| **#** | **Name** | **Cover / accent** | **Stats bg** | **Tab active** | **Primary button** |
| 1 | Dark Blue | #1a1d2e / #378ADD | #1a1d2e border #2a2a2e | #378ADD | #378ADD / #fff |
| 2 | Light Purple | linear #534AB7 → #378ADD / #534AB7 | #fff border #e5e5ea | #534AB7 | #534AB7 / #fff |
| 3 | Mint Dark | #003320 / #00ff88 | #003320 border #006640 | #00ff88 | #00ff88 / #010d0a |
| 4 | Pure White | #1d1d1f / #1d1d1f | #fff border #f2f2f7 | #1d1d1f | #1d1d1f / #fff |
| 5 | Royal Purple | #2a1040 / #7C3AED | #2a1040 border #4c1d95 | #7C3AED | #7C3AED / #ede9fe |
| 6 | Sunset Orange | #2a0d18 / #ff6b35 | #2a1520 border #4a1530 | #ff6b35 | #ff6b35 / #fff |
| 7 | Rose Gold | #221015 / #c9826e | #2a1218 border #3a1a20 | #c9826e | #c9826e / #fff |
| 8 | Arctic Blue | linear #2a5fcf → sky / #2a5fcf | #d0e0ff border #c0d4f0 | #2a5fcf | #2a5fcf / #fff |
| 9 | Gold Black | #201800 / #D97706 | #2a2010 border #3a2c10 | #D97706 | #D97706 / #1a1208 |
| 10 | Soft Sage | #e8e3d8 / #6b8f71 | #ddd8ce border #c8bfa8 | #6b8f71 | #6b8f71 / #fff |
| 11 | Neon Pink | #200030 / #e040fb | #200030 border #5a0080 | #e040fb | #e040fb / #fff |
| 12 | Ocean Deep | #0a2530 / #0D9488 | #0a2530 border #0e4050 | #0D9488 | #0D9488 / #fff |
| 13 | Paper Cream | #1a1a1a / #1a1a1a | #ede8dc border #d4c9b0 | #1a1a1a | #1a1a1a / #f5f0e8 |
| 14 | Deep Space | #0d1535 / #d4a820 | #0d1535 border #1a2550 | #d4a820 | #d4a820 / #050818 |
| 15 | Cyber Cyan | #001a22 / #00f5ff | #001a22 border #005566 | #00f5ff | #00f5ff / #020c12 |

**8. Icon System**

**8.1 Icon Library**

- Primary library: Tabler Icons (tabler-icons.io) — use ti- prefix

- React Native: @tabler/icons-react-native | Web: @tabler/icons-react

- All icons default: stroke width 1.5px | size 20-24px for nav | 16px for inline

**8.2 Key Icons Used in JChat**

|               |                    |                               |
|---------------|--------------------|-------------------------------|
| **Icon name** | **Tabler class**   | **Used for**                  |
| Map pin       | ti-map-pin         | Logo, location, splash screen |
| Fork & knife  | ti-tools-kitchen-2 | Menu access button in chat    |
| Grid dots     | ti-grid-dots       | Posts tab in profile          |
| Movie         | ti-movie           | Stories tab in profile        |
| Gift          | ti-gift            | Gifts tab, gift order type    |
| Bookmark      | ti-bookmark        | Saved tab in profile          |
| QR code       | ti-qrcode          | QR code button and scanner    |
| Pin           | ti-pin             | Pin message action + banner   |
| Tag           | ti-tag             | Offer button in chat          |
| Bell ringing  | ti-bell-ringing    | Service call, alerts          |
| Chef hat      | ti-chef-hat        | KDS, kitchen status           |
| Fingerprint   | ti-fingerprint     | Face ID / Touch ID            |
| Shield lock   | ti-shield-lock     | Location locked indicator     |
| Crown         | ti-crown           | Owner badge, VIP, premium     |
| Flame         | ti-flame           | Hot / trending items          |
| Leaf          | ti-leaf            | Vegan dietary tag             |
| Shopping cart | ti-shopping-cart   | Cart icon with badge          |
| Send          | ti-send            | Chat send button              |
| Check         | ti-check           | Confirmed, verified, selected |
| Arrow left    | ti-arrow-left      | Back navigation               |

**8.3 Menu Category Icons**

- Dual system: 120 emoji icons + 126 SF-style icons (using Tabler)

- SF-style icon colors: #5C7CFA (indigo) | #1D9E75 (green) | #f59e0b (amber) | #ef4444 (red) | #7C3AED (purple) | #EC4899 (pink) | #0EA5E9 (sky) | #1d1d1f (black) | #6b7280 (gray)

- SF-style icon styles: Line (default, stroke 1.5px) | Filled | Rounded (border-radius 50%)

**9. Animations & Transitions**

|  |  |  |  |
|----|----|----|----|
| **Animation** | **Duration** | **Easing** | **When** |
| Button press scale | 0.1s | ease-in-out | All button taps: scale 0.97 |
| Bottom sheet slide up | 0.3s | cubic-bezier(0.32,0.72,0,1) | Opening bottom sheets and modals |
| Bottom sheet slide down | 0.25s | ease-in | Closing bottom sheets |
| Toggle switch thumb | 0.2s | ease-in-out | Toggle on/off |
| Toast notification | 0.25s in / 0.2s out | spring | Error and success toasts |
| Map pin pulse | 1.5s loop | ease-in-out | Active pin glow animation |
| Map reaction emoji | 3s | ease-out | Emoji floats up and fades on map |
| Chat message appear | 0.15s | ease-out | New message slides in from bottom |
| Offer card appear | 0.3s | spring | Offer card bounces into chat |
| Pin banner slide | 0.25s | ease-out | Banner appears from top |
| Order status change | 0.4s | ease-in-out | Stepper color transitions |
| Screen navigation | 0.35s | iOS/Android native | Platform default transitions |

**10. Navigation Structure**

**10.1 Mobile Bottom Navigation — 5 tabs**

|  |  |  |  |
|----|----|----|----|
| **Tab** | **Icon** | **Active color** | **Screen** |
| Map | ti-map | #5C7CFA | Map screen (Stage 4 — native GPS) |
| Nearby | ti-building-store | #5C7CFA | Business list and search |
| DMs | ti-message | #5C7CFA | Direct messages (with unread badge) |
| Friends | ti-users | #5C7CFA | Following/followers, friend requests |
| Profile | ti-user | #5C7CFA | Own profile |

**10.2 Dashboard Sidebar — 13 icons**

|  |  |  |
|----|----|----|
| **Icon** | **Tabler** | **Section** |
| Overview | ti-layout-dashboard | Sales, orders, chat, alerts — default landing |
| Orders | ti-shopping-cart | Live orders with status management (badge: pending count) |
| Menu | ti-tools-kitchen-2 | Category and product editor |
| Inventory | ti-package | Stock levels and alerts |
| Chat rooms | ti-messages | Room manager + QR codes + themes |
| Employees | ti-users | Roles, permissions, access history |
| Reservations | ti-calendar | Calendar, capacity, waitlist |
| Loyalty | ti-award | Points config, tiers, rewards |
| Alerts / Service | ti-bell-ringing | Service call history (badge: unread) |
| Payments | ti-credit-card | Stripe settings, payout history |
| Reports | ti-chart-bar | Sales analytics, CSV/PDF export |
| Offers | ti-tag | Create and manage promotions |
| Configuration | ti-settings | Business info, hours, themes, modules |

**11. Business Preview Card — Full Spec**

|  |  |
|----|----|
| **Section** | **Spec** |
| Cover photo | width: 100% \| height: 120px \| object-fit: cover \| owner-uploaded |
| Gradient overlay | linear-gradient(transparent, rgba(bg,0.96)) \| height: 60px \| bottom of cover |
| Business icon | position: absolute \| bottom: -20px \| left: 14px \| size: 52x52px \| border-radius: 14px \| border: 3px solid bg \| z-index: 3 |
| Open/Closed badge | position: absolute \| top: 10px \| right: 10px \| green dot #34C759 \| font-size: 9px \| font-weight: 600 |
| Name | font-size: 15px \| font-weight: 700 \| margin-top: 28px (below cover) |
| Category + distance | font-size: 11px \| color: text-secondary \| flex row with dot separator |
| Rating | Stars in #FFCC00 \| value in font-weight 600 \| count in text-secondary |
| Divider | height: 0.5px \| background: border-subtle |
| Address row | ti-map-pin icon (indigo) \| font-size: 11px \| full address text |
| Hours row | ti-clock icon (green) \| today highlighted: color #34C759 font-weight 700 \| grid: 2 cols for other days |
| Working days | 7 circles 24x24px \| today: filled #34C759 white text \| others: theme-elevated indigo text |
| Photos row | horizontal scroll \| thumbnail 58x58px \| border-radius: 10px \| +N counter last cell |
| Live strip | border-top 0.5px \| padding 8px 14px \| green dot + count + room chips |
| Room chips | font-size: 8px \| padding: 2px 7px \| border-radius: 999px \| color per room theme accent |
| Action buttons | flex row \| Enter Chat (primary) \| View Menu (secondary) \| GPS icon \| Share icon |
| Card border-radius | 24px outer \| border: 0.5px solid border-subtle |

**12. Instructions for Claude Code**

**12.1 Project Setup**

- Read JCHAT_3.0_MASTER_SPEC.docx first for product requirements

- Use this document for all color, spacing, component, and theme values

- Never hardcode hex colors — always use CSS custom properties (tokens)

- Always implement both light and dark mode for every component

**12.2 CSS Setup**

Create /styles/tokens.css with all variables from Section 1. Import it globally.

:root { --color-brand: #5C7CFA; --color-brand-dark: #4A6AE8; ... }

\[data-theme="dark"\] { --bg-base: #0f0f11; --bg-surface: #18181b; ... }

\[data-theme="light"\] { --bg-base: #f9f9fb; --bg-surface: #ffffff; ... }

**12.3 Dashboard Theme Implementation**

Apply dashboard theme via data-db-theme attribute on the dashboard root:

\<div data-db-theme="midnight-blue"\> ... \</div\>

.theme-midnight-blue { --db-accent: #378ADD; --db-bg-base: #0a0c14; ... }

All 10 themes defined in Section 5 must be implemented as CSS classes.

**12.4 Chat Room Theme Implementation**

Apply per-room theme via className or style prop on the ChatRoom component:

const roomTheme = CHAT_THEMES\[room.themeId\]; // Object from Section 6

\<ChatRoom style={{ background: roomTheme.bg, ... }} /\>

All 15 themes from Section 6 must be available as theme objects.

**12.5 Profile Theme Implementation**

Apply per-user profile theme via user.profileThemeId:

const profileTheme = PROFILE_THEMES\[user.profileThemeId\]; // Section 7

\<ProfileHeader style={{ background: profileTheme.coverBg }} /\>

**12.6 Map Implementation (Stage 4)**

- Use Google Maps API with custom styling JSON for A2 Pastel light and dark

- Light style: featureType roads color #ffffff, landscape color #eef1f8, water color #b3d9f5

- Dark style: featureType roads color #252d3d, landscape color #111827, water color #0d2035

- Switch styles via map.setOptions({ styles: isDark ? DARK_STYLE : LIGHT_STYLE })

**12.7 Key File Structure**

/styles/tokens.css — All color/spacing tokens

/styles/themes/dashboard.css — 10 dashboard themes (Section 5)

/styles/themes/chat.css — 15 chat room themes (Section 6)

/styles/themes/profile.css — 15 profile themes (Section 7)

/constants/chatThemes.ts — Theme objects for React Native

/constants/profileThemes.ts — Profile theme objects

/constants/icons.ts — Icon name mapping (Section 8)

/components/ui/ — All shared components

/components/chat/ — Chat-specific components

/components/map/ — Map components (Stage 4)

/components/menu/ — Menu and ordering components
