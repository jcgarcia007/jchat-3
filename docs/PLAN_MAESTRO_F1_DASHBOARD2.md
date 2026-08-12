# PLAN MAESTRO — Dashboard 2.0 · Fase 1 + Backlog

**Proyecto:** JChat 3.0 · Repo: `jcgarcia007/jchat-3` · Rama base: `main` (HEAD verificado: `c35cd50`)
**Autor:** Planning Claude (Fable 5) · Fecha: 2026-07-31
**Ejecutor:** Claude Code (Opus 4.8) en `/Users/jcgarcia/Projects/JchatVer3.0`
**Auditor:** Planning Claude vía GitHub MCP (`get_commit` con `full_patch`) — cada commit se audita contra el diff real.

> Este plan fue construido sobre el reporte Paso 0 de Claude Code **verificado línea por línea contra el código real de `main`** por Planning Claude. Incluye 2 correcciones al reporte (ver §1). Ejecutar en orden. No saltar pasos. No improvisar fuera de lo escrito.

---

## §0. REGLAS GLOBALES (aplican a TODO el plan)

1. **Verificación de compilación obligatoria** antes de cada commit: `npx tsc --noEmit` **Y** `npm run build` — ambos verdes. Si cualquiera falla, NO commitear; reportar el error y esperar instrucciones.
2. **Push real verificado**: tras cada push, correr `git log --oneline -1 origin/<rama>` y pegar la salida en el reporte. Un commit sin push verificado NO cuenta como hecho.
3. **i18n**: namespace `dashboardCommon` en `web/messages/en.json` y `web/messages/es.json`. Conteo actual verificado: **1367 claves en cada archivo**. Al terminar, ambos archivos deben tener conteo IDÉNTICO. Reportar tabla `clave → EN → ES` de toda clave añadida/eliminada.
4. **Dato es intocable**: nombres de negocios, URLs de imágenes, IDs, valores persistidos — nunca se traducen ni transforman.
5. **Bug recurrente a vigilar**: variables locales llamadas `t` (en `.map((t) => ...)`, `for const t`) ensombrecen el `t` de `useTranslations` → si aparece el caso, renombrar la local ANTES de usar t() en ese scope.
6. **Reporte final por tarea**: SHA del commit + salida del paso 2 + tabla i18n + lista de archivos tocados.

### PROHIBIDO GLOBAL (todo el plan)
- PROHIBIDO tocar producción, Vercel, variables de entorno, Supabase config, Stripe, hCaptcha, contraseñas o cualquier configuración de seguridad. Las pruebas locales que fallen por login/captcha se REPORTAN, no se "arreglan" tocando config.
- PROHIBIDO crear migraciones de base de datos en este plan (F1 no necesita ninguna; `logo_url` ya existe en `businesses`).
- PROHIBIDO usar `git push --force`, `git merge` sin instrucción, o commitear a `main` salvo donde este plan lo diga explícitamente (Tarea 1).
- PROHIBIDO tocar archivos no listados en la tarea en curso.
- PROHIBIDO inventar claves i18n distintas a las especificadas aquí.
- PROHIBIDO borrar ramas.

---

## §1. CORRECCIONES DE AUDITORÍA AL REPORTE PASO 0

Planning Claude verificó `TopBar.tsx` y `lib/business.ts` completos en `main`. Dos hallazgos que el Paso 0 no reportó y que CAMBIAN la implementación:

**H1 — EL DROPDOWN NO EXISTE CON UN SOLO NEGOCIO (crítico).**
En `TopBar.tsx`: `const hasSwitcher = businesses.length > 1;` — con 1 negocio se renderiza un `<span>` estático SIN menú. El requisito es que "Crear nuevo negocio" esté SIEMPRE accesible, y el plan Business permite exactamente 1 negocio → la mayoría de los clientes nunca vería el item. **Corrección obligatoria (Paso 2.3):** el dropdown debe renderizarse siempre que `businesses.length >= 1`. Con 0 negocios se mantiene el fallback actual.

**H2 — `resolveActiveBusiness()` NO selecciona `logo_url`.**
Sus dos queries hacen `.select("id, name, slug, status, plan, is_verified, menu_enabled, menu_mode, external_menu_url")`. En lugar de añadir una query extra en el Sidebar (propuesta del Paso 0), **se añade `logo_url` a la interface `ActiveBusiness` y a las DOS queries de `resolveActiveBusiness()`** — una sola fuente, cero requests adicionales.

**H3 — Verificación previa a borrar claves i18n.** Antes de eliminar `commandPaletteAria` y `searchLabel`, confirmar con `grep -rn "commandPaletteAria\|searchLabel" web/ --include="*.tsx" --include="*.ts"` que TopBar.tsx es el único consumidor. Si aparece otro consumidor, NO borrar las claves y reportar.

---

## §2. TAREA 1 — Crear `docs/BACKLOG.md` (commit directo a `main`)

Solo documentación, cero código. Crear el archivo `docs/BACKLOG.md` con EXACTAMENTE este contenido:

```markdown
# BACKLOG PRIORIZADO — JChat 3.0
Última actualización: 2026-07-31 · Fuente: sesión Planning Claude (Fable 5)

## REGLA DE ORO (no negociable)
Nada de este backlog entra a la cola de trabajo antes que los BLOQUEANTES DE
LANZAMIENTO (ver ESTADO.md): SMTP propio (Resend) + verificación de correo,
decisión SMS/Twilio, Stripe TEST de Verified (Juan), validación CSP,
Supabase Pro, Stripe live (último paso, Juan). Dashboard 2.0 (F1-F8) es el
compromiso activo; estas ideas se sacan de UNA en una cuando haya hueco.

## A. QUICK WINS DE RETENCIÓN (activan features ya construidas, tablas hoy en 0 filas)
- A1. Prompt de reseña post-pago (móvil): pedir reseña tras pedido pagado.
      Sin esto, reviews queda en 0 y el tab "Reviews por plato" nunca tendrá datos.
- A2. Ofertas → anuncio automático al chat del venue: al publicar una oferta,
      postearla en el chat del lugar (tablas offers + announcements existentes).
      Diferenciador único de JChat frente a cualquier POS.
- A3. Check-ins + reconocimiento de habituales: rachas de visitas; el dashboard
      muestra al dueño quiénes son sus clientes frecuentes (tabla check_ins).

## B. INTEGRADO EN FASES DASHBOARD 2.0 (no son tareas nuevas, van dentro de su fase)
- B1. Tiempo de rotación de mesa (table turn time) desde table_tabs → F3/F6.
- B2. Waitlist visible en tab Reservas (reservations.is_waitlist ya existe) → F8.
- B3. Presets inteligentes en comparativo ("vs mismo día semana pasada") → F6.
- B4. Sonido opcional en llamadas de mesero → F4.
- B5. Reporte de propinas por mesero (orders.tip_cents + taken_by) → F5.

## C. POST-LANZAMIENTO (requieren construcción o dependencia previa)
- C1. Lealtad activada al público — REQUIERE cerrar Stage-3 (D-76, award
      server-side) primero; activar antes = puntos falsificables.
- C2. Costo por plato (columna cost_cents en menu_items) + menu engineering
      (margen vs popularidad). Alto valor de venta para planes Business/Pro.
- C3. Cierre del día automático: email diario al dueño con ventas/top/propinas.
      DEPENDE de SMTP propio.
- C4. Referidos con recompensa ("invita a un amigo al chat del venue").
- C5. Cumpleaños: recompensa automática (verificar si users guarda fecha de
      nacimiento; si no, columna opcional + notificación).
- C6. Vista multi-negocio consolidada (roll-up de KPIs para plan Pro) — post tab Mapa.
- C7. Pitch de retención para material de ventas B2B: "45% de los comensales
      cambió su restaurante favorito el último año; JChat te da el canal directo".

## D. DEUDA TÉCNICA / OBSERVABILIDAD
- D1. Crash reporting móvil (Sentry free): hoy los crashes de la app RN en
      dispositivos reales son invisibles. Prioridad alta post-lanzamiento.
- D2. Analítica de producto (PostHog free): medir qué features se usan para
      priorizar este backlog con datos y no por intuición.
- D3. PITR al activar Supabase Pro (backup punto-en-el-tiempo). Con dinero
      real, obligatorio.
- D4. Smoke tests Playwright contra preview (login carga, menú público
      renderiza, dashboard responde) — 3-4 tests, corren por deploy.
- D5. Limpieza de env vars duplicadas de la integración Supabase↔Vercel.
- D6. Rama feat/pricing-user-mobile: al mergear, decidir si el commit del
      rail teñido ba8eaaa entra o queda fuera (pendiente decisión de Juan).
- D7. Bug preexistente: categoría "Café" con tilde no matchea .includes('cafe')
      en el mapa móvil (roto hoy, no urgente).
```

**Commit y push (Tarea 1):**
```
git checkout main && git pull origin main
# crear docs/BACKLOG.md con el contenido de arriba
git add docs/BACKLOG.md
git commit -m "docs: BACKLOG.md priorizado (retención, fases Dashboard 2.0, post-lanzamiento, deuda técnica)"
git push origin main
git log --oneline -1 origin/main   # pegar salida en el reporte
```

**PROHIBIDO (Tarea 1):** tocar cualquier archivo que no sea `docs/BACKLOG.md`. No editar ESTADO.md ni DECISIONS.md en este commit.

---

## §3. TAREA 2 — Fase 1 en código (rama `feat/dashboard2-f1`)

### Alcance exacto (y nada más)
1. Dropdown de negocios visible SIEMPRE (≥1 negocio) con "Crear nuevo negocio" como último item fijo.
2. Eliminar el search decorativo (Cmd+K) del TopBar, completo y sin código muerto.
3. Logo del negocio activo en la parte superior del Sidebar.
4. Sección de subida de logo al final de la página de Configuración.
5. Claves i18n correspondientes (EN/ES idénticos en conteo).

### Paso 2.0 — Preparar rama
```
git checkout main && git pull origin main
git rev-parse HEAD          # debe empezar por c35cd50 o posterior; si main avanzó, reportar antes de seguir
git checkout -b feat/dashboard2-f1
```

### Paso 2.1 — `web/lib/business.ts` (2 ediciones)
a) Interface `BusinessListItem`: añadir `logo_url: string | null;`
b) Query de `listUserBusinesses`: `.select("id, name, slug, is_verified, logo_url")`
c) Interface `ActiveBusiness`: añadir `logo_url: string | null;`
d) Las DOS queries de `resolveActiveBusiness()` (selección explícita y fallback): añadir `logo_url` al string del `.select(...)`.
**No tocar** `setActiveBusiness`, `listUserEvents`, ni la lógica de resolución.

### Paso 2.2 — `TopBar.tsx`: eliminar el search Cmd+K
- Ejecutar primero la verificación H3 (grep). Si TopBar es el único consumidor:
- Eliminar el `<button>` completo del bloque "Cmd+K search trigger" (incluye el comentario `TODO(Task 2.16)` y el `<kbd>⌘K</kbd>`).
- Eliminar `IconSearch` del import de `@tabler/icons-react`.
- Eliminar las claves `commandPaletteAria` y `searchLabel` de `en.json` Y `es.json`.
- **NO tocar**: `<LanguageSwitcher />`, el reloj (`currentTimeAria`), ni el avatar stub (`userAvatarAria`).

### Paso 2.3 — `TopBar.tsx`: dropdown siempre + "Crear nuevo negocio"
a) Cambiar `const hasSwitcher = businesses.length > 1;` → `const hasSwitcher = businesses.length >= 1;`
   (con 0 negocios se conserva el `<span>` fallback actual con `selectBusinessFallback`).
b) Dentro del `<div role="listbox">`, DESPUÉS del `businesses.map(...)`, añadir:
   - Un divisor fino: `<div style={{ height: "1px", background: "var(--db-border)", margin: "4px 6px" }} />`
   - Un `<Link href="/dashboard/create">` estilizado igual que los items del dropdown (mismo padding/borderRadius/fontSize, color `var(--db-text-secondary)`, hover igual que los demás), con icono `IconPlus` (añadir al import de tabler) y el texto `t("topbarCreateBusinessItem")`.
   - Importar `Link` de `next/link` si no está.
c) El item navega — NO llama a `handleSelect` ni a `setActiveBusiness`.
d) Comportamiento intacto: seleccionar un negocio sigue recargando la página (window.location.reload()).

### Paso 2.4 — `Sidebar.tsx`: bloque de logo arriba
a) El Sidebar ya llama a `resolveActiveBusiness()` en el useEffect de `servicePending`. Extender ese MISMO effect para guardar en estado `activeBiz: { name: string; logo_url: string | null } | null` (ahora disponible por el Paso 2.1d). NO añadir una segunda llamada a Supabase.
b) Como PRIMER hijo del `<nav>` (antes del `.map(renderGroup)`), renderizar un bloque de ~56px de alto con:
   - Si `logo_url`: `<img src={logo_url} alt={t("sidebarLogoAlt", { name })} />` cuadrado, `width/height 36`, `borderRadius: "8px"`, `objectFit: "cover"`.
   - Si NO hay logo: fallback con la inicial del nombre del negocio en un cuadrado del mismo tamaño con `background: var(--db-accent-bg)` y `color: var(--db-accent)` (mismo patrón visual que el avatar del TopBar).
   - Al lado, el nombre del negocio en `fontSize: 13px, fontWeight: 600`, con ellipsis si no cabe.
   - Separador inferior fino (`borderBottom: 1px solid var(--db-border)`), margen inferior 8px.
c) **NO tocar** los grupos, permisos `isSuperAdmin`, badge `servicePending` ni el estado activo — nada del commit `c35cd50` se modifica salvo insertar este bloque y el estado nuevo.

### Paso 2.5 — Configuración: sección "Logo del negocio (sidebar)"
Archivo: `web/app/dashboard/configuration/page.tsx`
a) Añadir una nueva `<Section>` AL FINAL (después de la sección 8 "Payout Frequency", antes del cierre del contenedor), numerada como la siguiente (9).
b) Título: `t("configurationLogoSectionTitle")` · subtítulo: `t("configurationLogoSectionSubtitle")`.
c) Reusar EXACTAMENTE el patrón existente de la página: hidden `<input type="file">` + botón visible + preview blob + guardado, llamando al helper existente `uploadBusinessImage(file, "logo")` y persistiendo la URL resultante en la columna `businesses.logo_url` con el mismo mecanismo de guardado que usan cover/icon.
d) Restricciones idénticas a las existentes: `image/jpeg`, `image/png`, `image/webp`, máx 10 MB. NO cambiar el bucket (`covers`) ni el esquema de paths (`${ownerId}/${businessId}/logo/${uuid}.ext`).
e) Preview: cuadrado 64×64 con `borderRadius 8px` + `alt={t("configurationLogoPreviewAlt")}`.
f) Botones: subir = `t("configurationLogoUploadButton")`, guardar = `t("configurationLogoSaveButton")` (si la página guarda por sección; si el guardado es global de la página, integrarse a ese flujo y omitir el botón propio — seguir el patrón real del archivo y reportar cuál era).

### Paso 2.6 — Claves i18n (añadir a `dashboardCommon` en AMBOS json)
| Clave | EN | ES |
|---|---|---|
| `topbarCreateBusinessItem` | Create new business | Crear nuevo negocio |
| `sidebarLogoAlt` | {name} logo | Logo de {name} |
| `configurationLogoSectionTitle` | Business logo (sidebar) | Logo del negocio (sidebar) |
| `configurationLogoSectionSubtitle` | This logo appears at the top of the dashboard sidebar. | Este logo aparece en la parte superior de la barra lateral del dashboard. |
| `configurationLogoUploadButton` | Upload logo | Subir logo |
| `configurationLogoSaveButton` | Save logo | Guardar logo |
| `configurationLogoPreviewAlt` | Business logo preview | Vista previa del logo del negocio |

Eliminadas: `commandPaletteAria`, `searchLabel` (previa verificación H3).
**Conteo esperado final: 1367 − 2 + 7 = 1372 claves en cada archivo.** Si el conteo real difiere, DETENERSE y reportar antes de commitear.
Nota: NO reusar `createBusinessLink` ("Create business") para el dropdown — el texto pedido es distinto ("Crear nuevo negocio") y la regla del proyecto es no fusionar claves de textos distintos.

### Paso 2.7 — Verificación y commit
```
npx tsc --noEmit        # verde obligatorio
npm run build           # verde obligatorio
git add -A
git commit -m "feat(dashboard2-f1): dropdown crear negocio siempre visible + eliminar search decorativo + logo de negocio en sidebar y configuración"
git push origin feat/dashboard2-f1
git log --oneline -1 origin/feat/dashboard2-f1   # pegar salida
```

### Reporte final obligatorio (Tarea 2)
1. SHA en `origin/feat/dashboard2-f1` (salida real del git log).
2. Confirmación tsc + build verdes (pegar últimas líneas).
3. Tabla i18n completa (las 7 añadidas + 2 eliminadas) y conteo final de ambos json.
4. Lista de archivos tocados (deben ser SOLO: `web/lib/business.ts`, `web/components/dashboard/TopBar.tsx`, `web/components/dashboard/Sidebar.tsx`, `web/app/dashboard/configuration/page.tsx`, `web/messages/en.json`, `web/messages/es.json`).
5. Resultado del grep H3.
6. Qué patrón de guardado usa la sección de logo (2.5f).

### PROHIBIDO (Tarea 2)
- PROHIBIDO mergear a `main` — el merge lo decide Juan tras ver la preview de Vercel.
- PROHIBIDO tocar `nav-modules.ts`, permisos, `servicePending`, `setActiveBusiness`, el flujo `/dashboard/create`, o cualquier página no listada.
- PROHIBIDO añadir librerías nuevas.
- PROHIBIDO cambiar bucket, políticas de Storage o cualquier cosa en Supabase.
- PROHIBIDO "aprovechar" para refactors, renombres o mejoras no pedidas.

---

## §4. QA DE JUAN EN PREVIEW (checklist tras el push)

1. Verificar push: Planning Claude confirma el SHA contra `origin/feat/dashboard2-f1`; luego audita `full_patch`.
2. Abrir la URL de preview de la rama en Vercel (Planning Claude la localiza con `list_deployments`).
3. Con tu cuenta (1+ negocios): el nombre del negocio en el TopBar ahora ABRE un menú aunque tengas pocos negocios; el último item es "Crear nuevo negocio" y navega a `/dashboard/create`.
4. El search ⌘K desapareció; el selector de idioma, el reloj y el avatar siguen.
5. El Sidebar muestra la inicial del negocio (aún sin logo subido).
6. Configuración → al final, sección "Logo del negocio (sidebar)": subir un logo de Bar XZX → guardar → recargar → el logo aparece en el Sidebar.
7. Cambiar el idioma EN↔ES: los textos nuevos cambian.
8. Si TODO pasa → Juan aprueba y Planning Claude prepara el spec de merge fast-forward a `main`.

---

## §5. APÉNDICE — Contexto para sesiones futuras (NO ejecutar ahora)

**Roadmap aprobado Dashboard 2.0:** F1 (este plan) → F2 Overview con tabs-rutas + KPIs → F3 Mesas grid estados derivados Realtime → F4 Servicio + Cola en vivo (feed unificado con filtros; botones navegan en v1) → F5 Ventas por perfiles (meseros/barra/sin asistencia + propinas) → F6 Resumen comparativo (presets inteligentes + filtros) → F7 Config Chats + toggle subchat por mesa (migración: columna en businesses; al encender crea subchats faltantes; default off) → F8 Reservas (reservado = marca manual + log de requisitos).

**Decisiones ya tomadas por Juan que gobiernan F2+:** Mesas del sidebar = administrativa; tab Mesas del Overview = solo estado sin sillas. Colores mesas: verde libre / rojo reservado / amarillo cuenta / gris ocupada; llamada de mesero = borde pulsante + campana en color aparte; siempre color + texto (accesibilidad). Estados derivados de datos (tabs abiertas, service_calls), nunca campo manual salvo "reservado". Cola en vivo = TODO (llamadas, pedidos, cuentas, inventario bajo — menu_items ya tiene stock_count y low_stock_threshold —, reseñas, reservas). Timezone: deducir de lat/lng.

**Preguntas A–D pendientes de Juan (bloquean F2-F5, no F1):**
A. ¿Tabs Ventas y Resumen solo para owner/manager? · B. ¿Botones de Cola en vivo navegan (v1)? · C. ¿Columna `timezone` auto-calculada desde lat/lng (tz-lookup)? · D. ¿Barra = mesas con `floor` "Barra" + staff asignado vía `table_waiters` (sin entidad nueva)?
