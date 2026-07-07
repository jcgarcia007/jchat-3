# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# JChat 3.0 — CLAUDE.md

> **AUTO-WORKFLOW:** Al leer este archivo, ejecuta el WORKFLOW DE INICIO
> definido al final. No esperes instrucciones adicionales.

> **ESTADO ACTUAL (2026-06-20):** Proyecto greenfield. Aún NO existe código —
> solo los 3 `.docx` de referencia y los archivos de instrucciones. Toda la
> sección Architecture describe el **objetivo** definido por el Dev Plan, no
> lo que hay en disco. La primera tarea real es Task 0.1.

> **NO es un repo git todavía.** Si vas a versionar, ejecuta `git init` primero.

---

## 📦 Commands

```bash
# Mobile (React Native + Expo, en /mobile)
cd mobile && npx expo start --ios
cd mobile && npx expo start --android

# Web / Dashboard (Next.js 14+, en /web)
cd web && npm run dev

# Type check (único check disponible — no hay test/lint/CI configurado)
npx tsc --noEmit

# Supabase
supabase start                        # local dev
supabase db push                      # apply migrations
supabase functions serve              # local edge functions
supabase functions deploy <name>      # deploy edge function
```

> No existe aún `package.json`. Estos comandos aplican una vez completada la
> Task 0.1 (init del proyecto).

---

## 🏗️ Architecture (objetivo — fuente de verdad: `JCHAT_3.0_DEV_PLAN.docx`)

Dos apps en un monorepo + backend Supabase compartido:

```
/
├── mobile/        # React Native + Expo (latest SDK)  → app del usuario
├── web/           # Next.js 14+                        → dashboard de negocios + super-admin + web pública
└── supabase/      # migrations + edge functions        → backend único
```

### Mobile — React Navigation v6 (NO Expo Router)
- Navegación con `mobile/navigation/AppNavigator.tsx` + `mobile/navigation/tabs/BottomTabs.tsx`
- **5 bottom tabs:** Map · Nearby · DMs · Friends · Profile
  (iconos `ti-map`, `ti-building-store`, `ti-message`, `ti-users`, `ti-user`)
- Pantallas en `mobile/screens/<dominio>/`, componentes en `mobile/components/<dominio>/`
- Lógica de dominio / data access en `mobile/services/` (wrappers async sobre el
  cliente `supabase` compartido en `mobile/services/supabase.ts`)

```
mobile/
├── theme/        tokens.ts · colors.ts · chatThemes.ts · profileThemes.ts
├── navigation/   AppNavigator.tsx · tabs/BottomTabs.tsx
├── screens/      auth/ onboarding/ profile/ feed/ stories/ dms/ settings/
│                 chat/ menu/ checkout/ orders/ map/
├── components/   ui/ chat/ map/ menu/ profile/ reviews/
└── services/     supabase.ts · stripe.ts · notifications.ts · geofence.ts · proximityNotifications.ts
```

### Web — Next.js 14+ (App Router)
```
web/
├── styles/   tokens.css · themes/{dashboard,chat,profile}.css
├── app/      dashboard/ · business/ · b/[slug]/ · nearby/ · super-admin/
└── components/ dashboard/
```

### Supabase
```
supabase/
├── migrations/   001_initial_schema.sql  (Task 0.6)
└── functions/    stripe-connect/ (3.6) · subscriptions/ (3.15)
```

### Platform splits
- Cuando un módulo difiere por plataforma, usar **extensiones de archivo**
  (`Foo.web.tsx` / `Foo.native.tsx`), NO runtime branching.

### Mapas
- Stage 4 usa **Google Maps nativo** (heatmap, pins, proximidad, geofence).
- Stages 0–3 NO dependen del mapa nativo. Stage 4 va DESPUÉS de Stage 3 completo.

### i18n
- `en` / `es` — usar siempre funciones de traducción, nunca strings hardcodeados.

### Stripe Connect
- Flow: cliente → Edge Function `stripe-connect` → tablas con RLS.
- Pagos SIEMPRE server-side. Nunca `createPaymentIntent` en el cliente.

---

## 🎨 Design System — Tokens obligatorios

> Fuente de verdad: `JCHAT_3.0_DESIGN_SYSTEM.docx`.
> **NUNCA hardcodear hex en componentes. SIEMPRE usar tokens.**

```
--color-brand        #5C7CFA
--color-brand-dark   #4A6AE8
--color-brand-light  rgba(92,124,250,0.12)
--color-brand-purple #7C3AED
--color-success      #1D9E75
--color-warning      #f59e0b   ← NO confundir con gold
--color-danger       #ef4444
--color-gold         #D97706
```

> Tokens completos (37, incl. surface dark/light, map, heatmap) implementados en
> `web/styles/tokens.css` y `mobile/theme/tokens.ts` (Task 0.2). Switching:
> `data-theme` (web) · `useColorScheme` → `useThemeColors()` (mobile).
> Todo dark mode **y** light mode.

### Temas — valores fijos del Design System (no modificar)
- **10 dashboard themes** → `web/styles/themes/dashboard.css`
  - Aplicar vía atributo `data-db-theme` en el root del dashboard; usar
    `var(--db-accent)` etc., nunca el hex directo.
- **15 chat room themes** → `mobile/theme/chatThemes.ts`
  - Cada uno: `{ bg, topBg, border, accent, bubbleInBg, bubbleInText, bubbleOutBg, bubbleOutText }`
  - Uso: `getChatTheme(room.chat_theme_id)`
- **15 profile themes** → `mobile/theme/profileThemes.ts`
  - Uso: `PROFILE_THEMES[user.profileThemeId]`

### Icons — Tabler Icons únicamente
```typescript
import { IconMapPin } from '@tabler/icons-react-native'; // mobile
import { IconMapPin } from '@tabler/icons-react';        // web
// Prefijo: ti- en CSS, Icon* en imports
```

---

## 🚨 Reglas absolutas — NUNCA romper

### Privacidad (crítico)
- NUNCA revelar ubicación en tiempo real de ningún usuario en perfiles, posts o stories.
- Geotag en posts = texto manual únicamente — NUNCA GPS automático.
- `Location` en Privacy Settings = siempre locked, sin toggle, sin lógica que lo active.
- GPS solo para: geofencing de radio de negocio + Map tab (Stage 4).

### Arquitectura
- Pagos SIEMPRE server-side vía Edge Function — nunca crear PaymentIntent en cliente.
- API keys NUNCA en el frontend — solo en Edge Functions + env server-side.
- RLS en TODAS las tablas/queries de Supabase.
- Supabase Realtime: subscribe al montar la pantalla, **unsubscribe al desmontar**.
- Nunca modificar la tabla `pinned_messages` directamente desde el cliente.

### Scope
- NO implementar: Event Tickets, Delivery Module → ambos marcados como Future.
- Stage 4 (Google Maps nativo) va DESPUÉS de Stage 3 completo.

---

## 💡 Propuestas de mejora — Formato obligatorio

El spec (`.docx`) es la fuente de verdad. Antes de implementar CUALQUIER cosa
fuera del spec, reportar y esperar aprobación explícita:

```
⚡ PROPUESTA DE MEJORA — Task [X.Y]
CONTEXTO:   [qué estaba implementando]
PROBLEMA:   [qué limitación encontré]
PROPUESTA:  [qué cambio específico sugiero]
IMPACTO:    [archivos y tareas afectadas]
ALTERNATIVA DENTRO DEL SPEC: [cómo resolverlo sin cambiar el spec]

¿Procedo con el spec original o aplico la mejora?
```

---

## ✅ Checklist post-tarea (UI)

- [ ] Sin hex hardcodeados — solo tokens
- [ ] Dark mode y light mode funcionan
- [ ] Platform split usa extensiones de archivo (`.web.tsx` / `.native.tsx`)
- [ ] `getChatTheme()` y `PROFILE_THEMES[]` usados (no colores directos)
- [ ] Dashboard usa `var(--db-*)` / `data-db-theme` (no hex)
- [ ] Iconos: Tabler Icons únicamente
- [ ] Realtime unsubscribe en cleanup del useEffect
- [ ] Solo se tocaron los archivos de la tarea (no otras tareas)
- [ ] `npx tsc --noEmit` pasa sin errores

---

## 📂 Documentos de referencia (todos en `docs/`)

Leer en este orden (los `.docx` se convirtieron a `.md`, FASE B jul-2026):

| # | Archivo | Contiene |
|---|---------|----------|
| 1 | `docs/PROJECT_STATUS.md`   | Estado actual, deployado, plan priorizado. **Leer primero.** |
| 2 | `docs/SPEC.md`             | Producto: flujos, pantallas, reglas de negocio (era MASTER_SPEC.docx) |
| 3 | `docs/DESIGN_SYSTEM.md`    | Colores exactos, temas, tokens, componentes (era DESIGN_SYSTEM.docx) |
| 4 | `docs/ARCHITECTURE.md`     | Patrones técnicos reutilizables (menú device-frame, scroll chat, presencia, visor imágenes, fixes de plataforma) |
| 5 | `docs/BACKLOG.md`          | Backlog unificado y priorizado (chat + POS + web Fase 3) |
| 6 | `docs/DECISIONS.md`        | Decisiones técnicas/producto y su porqué |
| 7 | `docs/DEPLOYMENT_CHECKLIST.md` | Runbook de lanzamiento (10 fases) |

**Histórico en `docs/archive/`:** `DEV_PLAN` (68 tareas hechas), los diagnósticos/
inventarios/diseños de chat ya resueltos, los 2 backlogs originales, `WEB_CLIENT_PLAN`,
y los `.docx` originales de cada spec + la guía de deployment.

Ver también `CLAUDE_CODE_INSTRUCTIONS.md` (protocolo de sesión por tarea).

---

## ══════════════════════════════════════════════════════════
## 🚀 WORKFLOW DE INICIO — Ejecutar automáticamente al leer este archivo
## ══════════════════════════════════════════════════════════

Ejecutar todos los pasos en orden. No pedir confirmación entre pasos.
Mostrar el reporte final completo y luego esperar instrucción.

---

### PASO 1 — Leer documentos de referencia (raíz del proyecto)

```
1. JCHAT_3.0_MASTER_SPEC.docx
2. JCHAT_3.0_DESIGN_SYSTEM.docx
3. JCHAT_3.0_DEV_PLAN.docx
```

Si alguno no existe en la raíz, marcarlo como ⚠️ FALTANTE en el reporte.

---

### PASO 2 — Escanear estado del código

Para cada tarea, determinar:
- `✅ DONE` — archivos existen con código real
- `🔨 IN PROGRESS` — archivos parcialmente implementados
- `❌ TODO` — archivos no existen
- `⚠️ BLOCKED` — dependencias sin completar

> Rutas alineadas con `JCHAT_3.0_DEV_PLAN.docx` (estructura `mobile/` + `web/` + `supabase/`).

```
# Stage 0 — Foundation
Task 0.1 ✅ si: package.json + tsconfig.json + .env.example existen
Task 0.2 ✅ si: mobile/theme/tokens.ts + mobile/theme/colors.ts + web/styles/tokens.css existen
Task 0.3 ✅ si: web/styles/themes/dashboard.css con 10 sets de tema
Task 0.4 ✅ si: mobile/theme/chatThemes.ts con 15 objetos de tema
Task 0.5 ✅ si: mobile/theme/profileThemes.ts con 15 objetos de tema
Task 0.6 ✅ si: supabase/migrations/001_initial_schema.sql existe
Task 0.7 ✅ si: mobile/navigation/AppNavigator.tsx + mobile/navigation/tabs/BottomTabs.tsx existen
Task 0.8 ✅ si: web/app/dashboard/layout.tsx + Sidebar existen

# Stage 1 — Social & Auth
Task 1.1  ✅ si: mobile/screens/auth/SplashScreen.tsx existe
Task 1.2  ✅ si: mobile/screens/auth/WelcomeScreen.tsx existe
Task 1.3  ✅ si: mobile/screens/auth/LoginScreen.tsx existe
Task 1.4  ✅ si: mobile/screens/auth/ (Register Step 1) existe
Task 1.5  ✅ si: mobile/screens/auth/ (Register Step 2) existe
Task 1.6  ✅ si: mobile/screens/onboarding/ existe
Task 1.7  ✅ si: mobile/screens/profile/ + mobile/components/profile/ProfileHeader existen
Task 1.8  ✅ si: mobile/screens/profile/EditProfileScreen.tsx existe
Task 1.9  ✅ si: mobile/screens/feed/ (FeedScreen) existe
Task 1.10 ✅ si: mobile/components/feed/CreatePost.tsx existe
Task 1.11 ✅ si: mobile/screens/stories/ o mobile/components/stories/ existe
Task 1.12 ✅ si: mobile/screens/dms/ existe
Task 1.13 ✅ si: mobile/screens/settings/PrivacyScreen.tsx existe
Task 1.14 ✅ si: mobile/screens/settings/SettingsScreen.tsx existe
Task 1.15 ✅ si: mobile/services/follows.ts existe
Task 1.16 ✅ si: mobile/services/notifications.ts existe
Task 1.17 ✅ si: mobile/services/gifts.ts existe
Task 1.18 ✅ si: mobile/components/chat/CheckInButton.tsx existe

# Stage 2 — Businesses
Task 2.1  ✅ si: web/app/business/register/page.tsx existe
Task 2.2  ✅ si: web/app/business/verify/page.tsx existe
Task 2.3  ✅ si: mobile/components/map/BusinessPreviewCard.tsx existe
Task 2.4  ✅ si: mobile/screens/chat/ChatRoomScreen.tsx existe
Task 2.5  ✅ si: mobile/components/chat/PinMessageSheet.tsx + PinnedBanner.tsx existen
Task 2.6  ✅ si: mobile/components/chat/CreateOfferSheet.tsx + OfferCard.tsx existen
Task 2.7  ✅ si: web/app/dashboard/chat/page.tsx existe
Task 2.8  ✅ si: web/components/dashboard/QRModal.tsx existe
Task 2.9  ✅ si: mobile/components/chat/AddEmployeeSheet.tsx + mobile/services/employees.ts existen
Task 2.10 ✅ si: mobile/components/chat/UserActionSheet.tsx existe
Task 2.11 ✅ si: mobile/components/chat/IncognitoToggle.tsx existe
Task 2.12 ✅ si: web/app/b/[slug]/page.tsx existe
Task 2.13 ✅ si: web/app/nearby/page.tsx existe con contenido real
Task 2.14 ✅ si: mobile/components/chat/PasswordEntrySheet.tsx existe
Task 2.15 ✅ si: mobile/services/reviews.ts + mobile/components/reviews/ existen
Task 2.16 ✅ si: web/app/dashboard/configuration/page.tsx existe
Task 2.17 ✅ si: web/app/super-admin/locations/page.tsx existe
Task 2.18 ✅ si: mobile/components/chat/MapReactionButton.tsx existe
Task 2.19 ✅ si: web/app/dashboard/events/page.tsx existe
Task 2.20 ✅ si: web/app/dashboard/loyalty/page.tsx existe

# Stage 3 — POS & Payments
Task 3.1  ✅ si: web/app/dashboard/menu/page.tsx existe
Task 3.2  ✅ si: mobile/screens/menu/MenuScreen.tsx existe
Task 3.3  ✅ si: mobile/components/menu/ProductDetail.tsx existe
Task 3.4  ✅ si: mobile/components/menu/Cart.tsx existe
Task 3.5  ✅ si: mobile/screens/checkout/CheckoutScreen.tsx existe
Task 3.6  ✅ si: supabase/functions/stripe-connect/ + mobile/services/stripe.ts existen
Task 3.7  ✅ si: mobile/screens/checkout/PaymentSuccess.tsx existe
Task 3.8  ✅ si: mobile/screens/orders/ (Order Tracking) existe
Task 3.9  ✅ si: web/app/dashboard/kds/page.tsx existe
Task 3.10 ✅ si: web/app/dashboard/inventory/page.tsx existe
Task 3.11 ✅ si: web/app/dashboard/reservations/page.tsx existe
Task 3.12 ✅ si: web/app/dashboard/analytics/page.tsx existe
Task 3.13 ✅ si: web/app/super-admin/ con layout + pages existe
Task 3.14 ✅ si: web/app/dashboard/disputes/page.tsx existe
Task 3.15 ✅ si: supabase/functions/subscriptions/ existe
Task 3.16 ✅ si: web/app/dashboard/offers/page.tsx existe

# Stage 4 — Native Map
Task 4.1 ✅ si: mobile/screens/map/MapScreen.tsx con Google Maps existe
Task 4.2 ✅ si: mobile/components/map/BusinessPin.tsx + HeatmapLayer.tsx existen
Task 4.3 ✅ si: mobile/services/geofence.ts existe
Task 4.4 ✅ si: mobile/services/proximityNotifications.ts existe
Task 4.5 ✅ si: mobile/components/map/MapReactionOverlay.tsx existe
Task 4.6 ✅ si: mobile/components/map/FilterPanel.tsx existe
```

---

### PASO 3 — Verificar Design System

```
SI mobile/theme/tokens.ts existe:
  - Verificar: BRAND === '#5C7CFA' y SUCCESS === '#1D9E75'

SI web/styles/tokens.css existe:
  - Verificar: --color-brand: #5C7CFA

SI web/styles/themes/dashboard.css existe:
  - Contar sets de tema (debe ser exactamente 10)

SI mobile/theme/chatThemes.ts existe:
  - Contar temas (debe ser exactamente 15)
  - Estructura: { bg, topBg, border, accent, bubbleInBg, bubbleInText, bubbleOutBg, bubbleOutText }

SI mobile/theme/profileThemes.ts existe:
  - Contar temas (debe ser exactamente 15)

Buscar hex hardcodeados:
  grep -rE "#[0-9a-fA-F]{6}" mobile/ web/components/ --include="*.tsx" --include="*.ts"
  (reportar colores que NO sean parte de los archivos de tokens/themes)

Verificar TypeScript:
  npx tsc --noEmit → reportar errores si los hay
```

---

### PASO 4 — Identificar próxima tarea

1. Primera tarea `❌ TODO` con dependencias `✅ DONE` = **PRÓXIMA RECOMENDADA**
2. Tareas `⚠️ BLOCKED` → listar con motivo
3. Tareas `🔨 IN PROGRESS` → prioridad antes de empezar nuevas

> En estado greenfield la próxima tarea es siempre **Task 0.1 — Init del proyecto**.

---

### PASO 5 — Mostrar reporte

```
╔══════════════════════════════════════════════════════════════════╗
║            JCHAT 3.0 — REPORTE DE INICIO DE SESIÓN              ║
╚══════════════════════════════════════════════════════════════════╝

📚 DOCUMENTOS
  [✅/⚠️] MASTER_SPEC.docx
  [✅/⚠️] DESIGN_SYSTEM.docx
  [✅/⚠️] DEV_PLAN.docx

📊 PROGRESO GENERAL
  [barra de progreso ASCII] X% — N/68 tareas completas

📈 POR STAGE
  Stage 0 — Foundation:     [N/8]  [████░░░░] X%
  Stage 1 — Social & Auth:  [N/18] [████░░░░] X%
  Stage 2 — Businesses:     [N/20] [████░░░░] X%
  Stage 3 — POS & Payments: [N/16] [████░░░░] X%
  Stage 4 — Native Map:     [N/6]  [████░░░░] X%

🔨 EN PROGRESO (completar antes de empezar nuevas)
  [lista o "Ninguna"]

⚠️ BLOQUEADAS
  [lista con motivo o "Ninguna"]

🔴 PROBLEMAS DETECTADOS
  [hex hardcodeados / tokens faltantes / temas incompletos / TS errors]
  ["Ninguno detectado" si todo está bien]

🎯 PRÓXIMA TAREA RECOMENDADA
  Task X.Y — [Nombre]
  Archivos a crear: [lista]
  Dependencias: ✅ todas completas
  Esfuerzo: [XS/S/M/L/XL]

══════════════════════════════════════════════════════════════════
¿Ejecuto Task X.Y o prefieres otra?
══════════════════════════════════════════════════════════════════
```

---

### PASO 6 — Esperar instrucción

| El usuario dice | Acción |
|---|---|
| "Sí" / "ejecuta esa" | Proceder con la tarea recomendada |
| "Ejecuta Task X.Y" | Ejecutar esa tarea específica |
| "¿Qué falla en Task X.Y?" | Diagnosticar y reportar sin modificar |
| "Audita colores" | `grep` hex hardcodeados en todo el proyecto |
| "Muéstrame [archivo]" | Mostrar código y comparar con el spec |

---

*JChat 3.0 · CLAUDE.md v3.2 · Junio 2026 · alineado con JCHAT_3.0_DEV_PLAN.docx*
