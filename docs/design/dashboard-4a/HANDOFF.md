# Handoff: Dashboard de negocio JChat — Riel de iconos con chips de color (4A)

## Overview
Panel web (escritorio) para que un dueño gestione sus negocios en la app JChat.
Resuelve el problema de "iconos muy pequeños en una barra vertical" con un **riel
de navegación compacto** en el que cada icono va dentro de un **chip redondeado
tintado con el color de su módulo**, con etiqueta de texto debajo. Al lado, un
**panel de subnavegación contextual** y luego el área de contenido (Resumen).

## About the Design Files
Los archivos de este paquete son **referencias de diseño creadas en HTML** —
prototipos que muestran la apariencia y el comportamiento buscados, **no código
de producción para copiar tal cual**. La tarea es **recrear este diseño en el
entorno del codebase destino** (React Native / Expo para la app JChat, o el
framework web que corresponda para el panel), usando sus patrones y librerías
establecidas. Si no existe entorno aún, elegir el framework más apropiado e
implementarlo ahí.

El diseño se construyó sobre el **JChat Design System** (navy `#0D1B3E`,
gradiente marca azul→púrpura, hairlines de 0.5px, tipografía de sistema con
títulos en medium/600). Respetar esos tokens al implementar.

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografía, espaciado y estados son finales.
Recrear la UI de forma fiel usando las librerías y patrones existentes del
codebase. Los datos mostrados (RD$ 42.8k, 148 personas, etc.) son de ejemplo.

## Screens / Views

### Pantalla única: Resumen del negocio
- **Purpose:** el dueño ve de un vistazo la actividad del día y navega entre
  módulos (Resumen, Pedidos, Menú, Datos/Analíticas, Chat, Pagos).
- **Layout:** tres columnas horizontales (flex row), lienzo fijo de
  **1360 × 860 px**, radio exterior 20px, borde 0.5px `#E0E2E7`, fondo `#F7F8FA`:
  1. **Riel de iconos** — ancho fijo **100px**, fondo navy `#0D1B3E`, columna
     centrada, `padding:20px 8px`, `gap:8px`.
  2. **Panel de subnavegación** — ancho fijo **230px**, fondo blanco, borde
     derecho 0.5px `#E0E2E7`, `padding:22px 18px`, columna.
  3. **Contenido** — `flex:1`, `padding:28px 32px`.

#### Componentes

**1. Riel de iconos (columna navy, 100px)**
- **Logo (arriba):** cuadro 38×38, radio 11px, fondo gradiente marca
  (`--jc-gradient`), icono `map-pin` blanco. `margin-bottom:14px`.
- **Ítem de navegación (×6):** columna centrada `gap:5px`, con:
  - **Chip de icono:** cuadro **46×46**, radio 14px, icono Lucide 20px
    (`stroke-width:1.75`). El color del chip depende del módulo:
    - Resumen (activo): fondo sólido `#378ADD`, icono blanco `#fff`,
      `box-shadow:0 0 0 3px rgba(55,138,221,.3)` (anillo de selección).
    - Pedidos: fondo `rgba(239,159,39,.18)`, icono `#EF9F27`.
    - Menú: fondo `rgba(85,74,183,.22)`, icono `#9d94f0`.
    - Datos: fondo `rgba(34,197,94,.2)`, icono `#34d17f`.
    - Chat: fondo `rgba(168,85,247,.2)`, icono `#c084fc`.
    - Pagos: fondo `rgba(99,179,237,.2)`, icono `#63B3ED`.
  - **Etiqueta:** texto 10px, peso 700. Activo `#fff`; inactivos
    `rgba(255,255,255,.6)`.
  - **Badge de aviso (solo Pedidos):** punto absoluto 8×8, radio total, color
    `#E24B4A`, posicionado `top:-2px; right:18px` respecto al ítem.
- **Avatar de usuario (abajo, `margin-top:auto`):** círculo 40×40, fondo
  gradiente marca, iniciales "RM" blancas 12px/900.

**2. Panel de subnavegación (columna blanca, 230px)**
- **Selector de negocio (arriba):** fila, `padding:10px`, radio 14px, borde
  0.5px `#E0E2E7`. Avatar 34×34 radio 10px gradiente marca con "LT" 12px/900;
  texto "La Terraza" 14px/600 `#0D1B3E` + "Cambiar negocio" 11px `#9CA3AF`;
  icono `chevrons-up-down` 16px `#9CA3AF`. `margin-bottom:20px`.
- **Eyebrow "RESUMEN":** 11px, peso 900, `letter-spacing:1px`, `#9CA3AF`,
  `padding:0 6px 10px`.
- **Ítems de subsección (lista):** `padding:10px 14px`, radio 10px, 14px.
  - Activo ("Hoy"): fondo `#E6F1FB`, texto `#0C447C` peso 600.
  - Inactivos ("Esta semana", "Actividad en vivo", "Clientes frecuentes",
    "Zona geográfica"): texto `#374151` peso 500.
  - Separación vertical: `margin-bottom:2px` entre ítems.
- **Tarjeta de plan (abajo, `margin-top:auto`):** `padding:14px`, radio 14px,
  fondo navy `#0D1B3E`. Eyebrow "PLAN PRO" 12px/900 `#63B3ED`; texto
  "Renueva el 1 de agosto" 13px `rgba(255,255,255,.8)`.

**3. Contenido (Resumen)**
- **Encabezado:** fila con baseline alineado, `margin-bottom:22px`.
  - Título "Resumen · Hoy" — 24px, peso 600, `letter-spacing:-.4px`, `#0D1B3E`.
  - Chip "en vivo": fila `gap:8px`, `padding:8px 14px`, radio 999px, fondo
    `#F0FDF4`, borde 0.5px `#bbf7d0`; punto verde parpadeante 8×8 `#22C55E`
    (animación blink 1.6s); texto "148 personas dentro" 13px/600 `#1D9E75`.
- **Tarjetas de métrica (grid 2 columnas, gap 16px, `margin-bottom:16px`):**
  fondo blanco, borde 0.5px `#E0E2E7`, radio 16px, `padding:22px`,
  `box-shadow:0 2px 4px rgba(13,27,62,.06)`.
  - Eyebrow 11px/900 `letter-spacing:.6px` uppercase `#9CA3AF`.
  - Valor 34px/600 `letter-spacing:-.5px` `#0D1B3E`, `margin-top:8px`.
  - Delta 13px/600 `#22C55E`, `margin-top:4px`.
  - Contenido: "Ventas de hoy / RD$ 42.8k / +21% vs ayer";
    "Ticket promedio / RD$ 640 / +4% vs ayer".
- **Tarjeta "Termómetro de actividad":** misma tarjeta blanca.
  - Título 16px/600 `#0D1B3E`, `margin-bottom:16px`.
  - Barra: alto 14px, radio 999px, fondo `--jc-activity-bar` (gradiente
    verde→amarillo→naranja→rojo). Marcador: círculo 24×24 blanco, borde 3px
    `#EF4444`, sombra `0 2px 6px rgba(0,0,0,.2)`, posición `left:82%`.
  - Leyenda: fila justificada, 12px/700 `#9CA3AF`; "Tope" en `#EF4444`.
  - Tres mini-tarjetas (fila, gap 12px, `margin-top:18px`): `padding:14px`,
    radio 12px, fondo `#F7F8FA`, centradas. Valor 20px/600 `#0D1B3E` + label
    11px/700 uppercase `#9CA3AF`. Contenido: "8:40p / HORA PICO",
    "2h 15m / ESTANCIA PROM.", "63% / RECURRENTES".

## Interactions & Behavior
- **Navegación del riel:** al hacer clic en un ítem cambia el módulo activo. El
  ítem activo usa **chip de color sólido + anillo de selección** y etiqueta
  blanca; los inactivos usan chip tintado al ~18–22% y etiqueta al 60%.
- **Selector de negocio:** abre un menú para cambiar entre los negocios del
  dueño (multi-negocio). El avatar + nombre reflejan el negocio activo.
- **Subnavegación:** contextual al módulo activo; su ítem activo usa fondo
  `#E6F1FB` / texto `#0C447C`.
- **Punto "en vivo":** animación de parpadeo continua, `@keyframes` opacidad
  1 → .25 → 1, duración 1.6s, `ease-in-out`, infinita.
- **Badge de Pedidos:** punto rojo indicando pedidos sin atender.
- **Estados de press (según DS):** dip de opacidad ~0.75–0.86, sin escala.

## State Management
- `activeModule` — módulo seleccionado en el riel (resumen | pedidos | menu |
  datos | chat | pagos).
- `activeBusiness` — negocio seleccionado (lista de negocios del dueño).
- `activeSubsection` — subsección dentro del módulo (hoy | semana | …).
- `liveMetrics` — datos en vivo (personas dentro, ventas, pedidos activos,
  termómetro de actividad); requieren fetch/refresh periódico.

## Design Tokens
**Colores**
- Navy chrome: `#0D1B3E`
- Gradiente marca (`--jc-gradient`): 135° `#378ADD` → `#534AB7`
- Fondo app: `#F7F8FA` · Tarjetas: `#fff`
- Hairline: `#E0E2E7`
- Texto: fuerte `#0D1B3E`, cuerpo `#374151`, secundario `#6B7280`, muted `#9CA3AF`
- Activo subnav: fondo `#E6F1FB`, texto `#0C447C`
- Chips de icono (fill / icon): azul `#378ADD`/`#fff`; naranja
  `rgba(239,159,39,.18)`/`#EF9F27`; púrpura `rgba(85,74,183,.22)`/`#9d94f0`;
  verde `rgba(34,197,94,.2)`/`#34d17f`; violeta `rgba(168,85,247,.2)`/`#c084fc`;
  azul claro `rgba(99,179,237,.2)`/`#63B3ED`
- Semánticos: éxito `#22C55E`/`#1D9E75`, aviso `#EF9F27`, error `#E24B4A`/`#EF4444`
- Barra de actividad (`--jc-activity-bar`): gradiente verde→amarillo→naranja→rojo

**Radios:** inputs/subnav 10–12px · botones/list-cards 14px · tarjetas 16px ·
chips de icono 14px · pills/avatares 999px

**Sombras:** tarjeta `0 2px 4px rgba(13,27,62,.06)` · lienzo
`0 30px 70px rgba(13,27,62,.18)`

**Tipografía:** fuente de sistema (SF Pro / Roboto / system-ui). Títulos peso
600 (medium). Labels/eyebrows/badges peso 900, uppercase, tracked-out.
Tamaños usados: 34 (métricas) · 24 (título) · 20 · 16 · 14 · 13 · 12 · 11 · 10.
Tracking negativo en títulos (`-.4/-.5px`).

**Bordes:** hairline 0.5px `#E0E2E7`.

## Assets
- **Iconos:** [Lucide](https://lucide.dev), stroke 1.75, `currentColor`, 20px.
  Usados: `map-pin`, `layout-dashboard`, `receipt`, `utensils`, `bar-chart-3`,
  `message-circle`, `credit-card`, `chevrons-up-down`. En la app nativa el DS
  usa glyphs unicode; en web usa Lucide (equivalente).
- **Logo/pin:** dibujado con el gradiente marca (no hay archivo de logo; el DS
  incluye `assets/jchat-pin.svg`).
- No hay imágenes fotográficas ni ilustraciones.

## Files
- `Dashboards.dc.html` — prototipo con todas las variantes exploradas. La versión
  a implementar es la opción con id **`4a`** ("Iconos en chips de color por
  categoría"). Las demás (1c, 3a, 4b, 4c) son alternativas descartadas y sirven
  solo de referencia.
