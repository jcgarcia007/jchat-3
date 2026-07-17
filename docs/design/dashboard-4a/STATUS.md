# Dashboard 4A — estado

**Estado:** DISEÑO COMPLETO — decisiones tomadas y validadas con maqueta (2026-07-16). Listo para Fase 0.

Es un REDISEÑO DE NAVEGACIÓN completo, no un template de una pantalla:
- Reemplaza el riel actual (Sidebar.tsx, 48px) por uno de **100px** con chips de color.
- AÑADE una columna de **subnavegación contextual (230px)** que hoy NO existe.
- Elimina el TopBar actual (sin topbar).

---

## Bloqueante 1 (mapeo) — RESUELTO

Las 21 páginas reales del dashboard se mapean a **6 módulos + Configuración**:

| Módulo | Páginas |
|--------|---------|
| **RESUMEN** | overview (sin subpáginas) |
| **PEDIDOS** | orders, kds, service, reservations |
| **MENÚ** | menu, inventory, offers |
| **DATOS** | analytics, reports, reviews, loyalty |
| **CHAT** | chat, chat-rooms |
| **PAGOS** | payments, disputes, billing |
| **CONFIGURACIÓN** (engranaje) | configuration, employees, roles |

- **CONFIGURACIÓN** vive con un icono de engranaje, **separado abajo del riel**, fuera de los 6 módulos.
- **create** = botón de acción, **NO** ítem de navegación.
- **events** = mismo sistema que un negocio; se accede por el **selector de contexto negocio↔evento**, reusando los 6 módulos (sin navegación propia).

---

## Regla de subnav — RESUELTO

La columna subnav (230px) se muestra **SOLO cuando el módulo tiene 2+ páginas**.
Resumen (0-1 páginas) va a **ancho completo, sin subnav**.
Validado en maqueta interactiva con Juan.

---

## Bloqueante 2 (métricas del Resumen) — RESUELTO

El Resumen **NO** mostrará métricas que el backend no calcule.

La pantalla actual ([web/app/dashboard/page.tsx](web/app/dashboard/page.tsx)) ya es **honesta** (uso de plan real + listas de negocios/eventos); el rediseño **conserva ESO** con el estilo nuevo.

Las métricas del mockup (ventas del día, personas dentro, hora pico, estancia promedio, % recurrentes, termómetro) quedan **DIFERIDAS** — cada una se añade solo cuando exista su fuente de datos real.

**Prohibido mostrar números de ejemplo en producción.**

---

## Plan de implementación (feature flag por fases) — ACORDADO

**Bandera:** `NEXT_PUBLIC_NEW_DASHBOARD` (default `false`).
- `false` → navegación vieja (Sidebar 48px + TopBar).
- `true` → navegación nueva (riel 100px + subnav contextual).

| Fase | Contenido |
|------|-----------|
| **Fase 0** | Construir el layout nuevo detrás de la bandera (apagada). No rompe nada. |
| **Fase 1** | Módulo **PILOTO = Configuración** (config/employees/roles). Validar riel→subnav→contenido end-to-end. |
| **Fase 2** | Migrar los demás módulos uno a uno (cada uno su tanda auditada). |
| **Fase 3** | Cuando todos migrados y probados: quitar navegación vieja + encender la bandera. |
| **Cierre** | Limpiar la bandera y el código de la navegación vieja. |

---

## Estado

DISEÑO COMPLETO, decisiones tomadas y validadas con maqueta (2026-07-16). Listo para Fase 0.
