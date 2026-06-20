# JChat 3.0 — Claude Code Session Script

## 🔴 LEE ESTO PRIMERO ANTES DE ESCRIBIR CUALQUIER CÓDIGO

Eres el desarrollador de JChat 3.0. Antes de ejecutar cualquier tarea debes leer y
comprender los tres documentos de referencia que definen este proyecto.

---

## 📂 Documentos de referencia obligatorios

Lee estos documentos EN ESTE ORDEN antes de comenzar:

1. `JCHAT_3.0_MASTER_SPEC.docx`        → Qué construir (producto, flujos, reglas)
2. `JCHAT_3.0_DESIGN_SYSTEM.docx`      → Cómo se ve (colores, temas, componentes)
3. `JCHAT_3.0_DEV_PLAN.docx`           → Cómo construirlo (tareas atómicas)

---

## ✅ Protocolo de sesión

Cada sesión de Claude Code debe empezar con este mensaje exacto:

```
Lee los documentos JCHAT_3.0_MASTER_SPEC.docx, JCHAT_3.0_DESIGN_SYSTEM.docx
y JCHAT_3.0_DEV_PLAN.docx. Luego ejecuta la Task [NÚMERO] del Dev Plan.
No modifiques ninguna otra tarea ni archivo que no esté en la lista de archivos
de esa tarea. Si tienes una propuesta de mejora, indícala ANTES de proceder.
```

Reemplaza `[NÚMERO]` con el número de la tarea (ej: `2.5`, `3.6`, `0.2`).

---

## 🚨 Reglas que Claude Code NUNCA debe romper

### Colores y diseño
- NUNCA hardcodear colores hex directamente en componentes
- SIEMPRE usar los CSS tokens definidos en Design System Section 1
- SIEMPRE implementar dark mode Y light mode en cada componente
- NUNCA cambiar los valores de los 10 dashboard themes, 15 chat themes, o 15 profile themes
- Los colores exactos son: Brand `#5C7CFA`, Success `#1D9E75`, Warning `#D97706`, Danger `#EF4444`

### Privacidad (CRÍTICO)
- NUNCA mostrar la ubicación en tiempo real de ningún usuario en ningún perfil, post o story
- El geotag en posts es SOLO texto manual — NUNCA usar GPS automático
- La sección de Location en Privacy Settings SIEMPRE debe estar locked, sin toggle
- La ubicación real del usuario SOLO se usa para: geofencing en radio del negocio y mapa Stage 4

### Arquitectura
- NUNCA crear pagos en el cliente — siempre server-side con Stripe
- NUNCA exponer claves de API en el frontend
- SIEMPRE usar Row Level Security (RLS) en todas las queries de Supabase
- NUNCA modificar la tabla pinned_messages directamente desde el cliente

### Scope
- NO implementar Event Tickets (marcado como Future)
- NO implementar Delivery Module (marcado como Future)
- Stage 4 (Google Maps) va ÚLTIMO — no antes de Stage 3

---

## 📋 Cómo ejecutar una tarea específica

```
Ejecuta la Task 2.5 — Pin Message Feature.
Archivos a crear/modificar:
  - /mobile/components/chat/PinMessageSheet.tsx
  - /mobile/components/chat/PinnedBanner.tsx

Verifica al final:
1. Solo Owner/Moderator puede ver el botón Pin en long press
2. El banner sticky aparece debajo del row de sub-salas
3. El countdown se actualiza cada minuto
4. El sistema de auto-unpin funciona con el expires_at de la DB
```

---

## 🔧 Cómo corregir una tarea que falló

```
La Task 2.5 está fallando. El problema es:
[describe el error exacto o pega el stack trace]

Corrige SOLO los archivos de esa tarea:
- /mobile/components/chat/PinMessageSheet.tsx
- /mobile/components/chat/PinnedBanner.tsx

No toques ningún otro archivo. Verifica la corrección con el checklist
de la Task 2.5 en el Dev Plan.
```

---

## 💡 Cómo Claude Code debe reportar mejoras

Si durante el desarrollo Claude Code identifica una oportunidad de mejora,
debe reportarla en este formato ANTES de implementar cualquier cambio:

```
⚡ PROPUESTA DE MEJORA — Task [X.Y]

CONTEXTO: [Qué estaba implementando]

PROBLEMA IDENTIFICADO: [Qué limitación o issue encontré en el spec actual]

PROPUESTA: [Qué cambio específico sugiero]

IMPACTO: [Qué tareas o componentes afectaría]

ALTERNATIVA SIN CAMBIAR EL SPEC: [Cómo puedo resolver esto dentro del spec actual]

¿Procedo con la implementación según el spec original, o quieres aplicar la mejora?
```

Claude Code NO implementa mejoras sin aprobación explícita. El spec es la fuente
de verdad. Si hay una mejora, se documenta, se aprueba, y LUEGO se implementa.

---

## 🎨 Verificación de temas — checklist post-tarea

Después de cada tarea que involucre UI, verifica:

- [ ] ¿Los colores usan tokens CSS (variables) y no hex hardcodeados?
- [ ] ¿El componente funciona en dark mode?
- [ ] ¿El componente funciona en light mode?
- [ ] ¿Si tiene tema de dashboard, usa `var(--db-accent)` y no `#378ADD`?
- [ ] ¿Si es un chat room, el tema viene de `getChatTheme(room.chat_theme_id)`?
- [ ] ¿Si es un perfil, el tema viene de `PROFILE_THEMES[user.profile_theme_id]`?
- [ ] ¿Los iconos usan Tabler Icons (`ti-` prefix) según Design System Section 8?
- [ ] ¿Los border-radius, padding y spacing siguen los tokens de la Section 3?

---

## 📊 Estado de tareas

Usa el dashboard de tareas para actualizar el estado después de cada sesión.
Estados disponibles: `To Do` → `In Progress` → `In Review` → `Done` (o `Blocked`)

---

## 🗂️ Estructura de archivos esperada

```
/
├── mobile/                          # React Native app
│   ├── theme/
│   │   ├── tokens.ts                # Task 0.2
│   │   ├── colors.ts                # Task 0.2
│   │   ├── chatThemes.ts            # Task 0.4
│   │   └── profileThemes.ts         # Task 0.5
│   ├── navigation/
│   │   ├── AppNavigator.tsx         # Task 0.7
│   │   └── tabs/BottomTabs.tsx      # Task 0.7
│   ├── screens/
│   │   ├── auth/                    # Tasks 1.1-1.6
│   │   ├── onboarding/              # Task 1.6
│   │   ├── profile/                 # Tasks 1.7-1.8
│   │   ├── feed/                    # Tasks 1.9-1.10
│   │   ├── stories/                 # Task 1.11
│   │   ├── dms/                     # Task 1.12
│   │   ├── settings/                # Tasks 1.13-1.14
│   │   ├── chat/                    # Task 2.4
│   │   ├── menu/                    # Tasks 3.2-3.4
│   │   ├── checkout/                # Tasks 3.5, 3.7
│   │   ├── orders/                  # Task 3.8
│   │   └── map/                     # Tasks 4.1-4.6
│   ├── components/
│   │   ├── ui/                      # Shared components
│   │   ├── chat/                    # Tasks 2.4-2.6, 2.10-2.11, 2.14, 2.18
│   │   ├── map/                     # Tasks 2.3, 4.2, 4.5-4.6
│   │   ├── menu/                    # Tasks 3.2-3.3
│   │   ├── profile/                 # Tasks 1.7, 0.5
│   │   └── reviews/                 # Task 2.15
│   └── services/
│       ├── supabase.ts
│       ├── stripe.ts                # Task 3.6
│       ├── notifications.ts         # Task 1.16
│       ├── geofence.ts              # Task 4.3
│       └── proximityNotifications.ts # Task 4.4
│
├── web/                             # Next.js web + dashboard
│   ├── styles/
│   │   ├── tokens.css               # Task 0.2
│   │   └── themes/
│   │       ├── dashboard.css        # Task 0.3
│   │       ├── chat.css             # Task 0.4
│   │       └── profile.css          # Task 0.5
│   ├── app/
│   │   ├── dashboard/               # Tasks 0.8, 2.7, 2.8, 2.16, 3.1, 3.9-3.13, 3.16
│   │   ├── business/                # Tasks 2.1-2.2
│   │   ├── b/[slug]/                # Task 2.12
│   │   ├── nearby/                  # Task 2.13
│   │   └── super-admin/             # Tasks 2.17, 3.13
│   └── components/
│       └── dashboard/               # Dashboard components
│
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql   # Task 0.6
```

---

## ⚡ Shortcuts de sesión

| Quiero hacer | Di esto a Claude Code |
|---|---|
| Empezar tarea nueva | "Lee los 3 docs y ejecuta Task X.Y" |
| Corregir tarea rota | "Task X.Y falla con error [error]. Corrígelo." |
| Ver qué hace una tarea | "Explícame Task X.Y del Dev Plan sin codificar" |
| Revisar una pantalla | "Muéstrame el código actual de [archivo] y compáralo con el spec" |
| Verificar colores | "Audita [componente] y verifica que no haya hex hardcodeados" |
| Propuesta de Claude | "¿Tienes alguna mejora que sugerir para la Task X.Y?" |

---

*Documento generado para JChat 3.0 · Versión 3.0 · Junio 2026*
*Usar junto con: JCHAT_3.0_MASTER_SPEC.docx + JCHAT_3.0_DESIGN_SYSTEM.docx + JCHAT_3.0_DEV_PLAN.docx*
