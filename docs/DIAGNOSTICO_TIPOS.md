# Diagnóstico de tipos — re-habilitar type-check (2026-07-07)

> PASO 0, sin cambios de código. **Titular: la seguridad de tipos YA está
> re-habilitada.** `ignoreBuildErrors` fue removido en esta sesión (commit
> `0d6a002`) y hoy **web y móvil compilan con 0 errores de tipo**. No hacen
> falta tandas de arreglo de tipos; lo único que queda es limpieza de ESLint
> (opcional, no bloquea el build).

---

## 1 — Flags de ignore (qué está silenciado)

| Archivo | Flag | Estado |
|---|---|---|
| `web/next.config.ts` | `typescript.ignoreBuildErrors` | ❌ **NO existe** (removido) |
| `web/next.config.ts` | `eslint.ignoreDuringBuilds` | ❌ **NO existe** (removido) |
| `mobile/tsconfig.json` | — | `extends expo/tsconfig.base` + `strict: true`, **sin flags de silenciado** |
| `mobile/` metro/babel/app.config | — | sin `metro.config`/`babel.config` custom; nada silencia tipos |

`web/next.config.ts` completo hoy:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

**Conclusión:** no hay nada silenciando tipos. Metro/Expo nunca hace type-check en
el bundling (solo transpila); el gate real es `tsc --noEmit`, que ya pasa limpio.

---

## 2 — Conteo real de errores de tipo

| Proyecto | Comando | Errores `TS` | Exit |
|---|---|---|---|
| **WEB** | `cd web && npx tsc --noEmit` | **0** | 0 |
| **MÓVIL** | `cd mobile && npx tsc --noEmit` | **0** | 0 |

Ambos limpios. (Historial: los 33+ errores del web se arreglaron en lotes 1/1.1/2/3 +
cierre durante esta sesión; el móvil se mantuvo en 0 a lo largo de los fixes de chat.)

---

## 3 — Categorización de errores de tipo

**N/A — hay 0 errores de tipo** en ambos proyectos. No hay archivos ni códigos TS
que agrupar. No se requieren tandas de arreglo de tipos.

---

## 4 — `database.types.ts` (el archivo antes sospechoso)

| Ubicación | Estado |
|---|---|
| `web/lib/database.types.ts` | ✅ **Sano** |
| `mobile/services/database.types.ts` | Existe; el cliente móvil **no** se tipa con `Database` (no es fuente de errores) |

Salud de `web/lib/database.types.ts`:
- **3214 líneas**, **53 tablas** (`Row: {` × 53), `export type Database` y
  `export type Json` presentes.
- **0 señales de corrupción** (sin el wrapper JSON `"result"`/`untrusted-data`/fences
  que lo dañó en la sesión de modifier groups — aquello **ya se corrigió**).
- **Errores que dependen de él: 0** (es válido y completo; ya no rompe nada).

No requiere regeneración. Si en el futuro cambia el schema en Supabase, regenerar con
`supabase gen types typescript` y revisar que no reaparezca el wrapper.

---

## 5 — ESLint (web) — conteo aproximado

`cd web && npx eslint .` → **73 problemas (49 errores, 24 warnings)**.

No hay `.eslintrc*` en la raíz de `web/` (usa la config de `eslint-config-next`).
Estos problemas **no bloquean** el `next build` en esta versión de Next (el build
ya pasó en el commit `0d6a002`), pero son deuda de calidad.

Top reglas:
| # | Regla | Qué es |
|---|---|---|
| 38 | `react-hooks/set-state-in-effect` | `setState` dentro de `useEffect` (varios de los fixes de scroll/carga del chat) |
| 23 | `@typescript-eslint/no-unused-vars` | imports/variables sin usar |
| 5 | `react/use` | uso de hooks/`use()` |
| 5 | `react/no-unescaped-entities` | comillas/apóstrofes sin escapar en JSX |
| 5 | `react-hooks/refs` | acceso a refs en render |
| 3 | otras | `jsx-no-comment-textnodes`, `@next/next`, etc. |

Archivos con más problemas (aprox.): `dashboard/analytics/page.tsx`,
`dashboard/menu/page.tsx`, `dashboard/chat/page.tsx`, `super-admin/users/page.tsx`,
`lib/categoryIcons.tsx`.

---

## 6 — Recomendación de cómo agrupar el arreglo

**No hay arreglo de tipos que hacer** — web y móvil están en 0 y sin flags de
silenciado. El objetivo del pedido ("quitar ignoreBuildErrors") **ya está cumplido**.

Lo que queda es **opcional** (ESLint, no bloquea build). Si se quiere dejar el lint
limpio, sugiero 2 tandas por regla (no por archivo):

- **Tanda A — quick win (`no-unused-vars`, 23):** borrar imports/vars muertos. Bajo
  riesgo, mecánico. Incluye `no-unescaped-entities` (5, cambiar `'`/`"` por entidades).
- **Tanda B — revisión (`set-state-in-effect`, 38 + `react-hooks/refs`, 5):** requieren
  criterio, NO borrado ciego — varios vienen de los fixes de scroll/auto-scroll del chat
  (setState en effects es intencional ahí). Evaluar caso por caso: reestructurar el que
  sea un anti-patrón real, y silenciar con comentario justificado el que sea intencional.

Prioridad sugerida: **baja** — el type-check ya protege; el lint es cosmético. Si se
aborda, empezar por Tanda A.

---

## Resumen

| Métrica | Valor |
|---|---|
| `ignoreBuildErrors` (web) | ❌ ya removido |
| `eslint.ignoreDuringBuilds` (web) | ❌ ya removido |
| Errores de tipo WEB | **0** |
| Errores de tipo MÓVIL | **0** |
| `database.types.ts` | ✅ sano (3214 líneas, 53 tablas, sin corrupción) |
| ESLint web | 73 problemas (49 err / 24 warn) — no bloquea build |
| Tandas de arreglo de tipos necesarias | **0** |
