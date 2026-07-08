# Limpieza ESLint — Tanda A (2026-07-07)

> Alcance **estricto**: solo `@typescript-eslint/no-unused-vars` (imports/vars muertos)
> y `react/no-unescaped-entities` (escapar comillas en JSX). **No** se tocó
> `react-hooks/set-state-in-effect` (38 casos, varios intencionales del scroll) ni
> ninguna otra regla, lógica, pago, Edge Function o migración. `tsc` verificado tras
> cada archivo → sigue en **0 errores**.

## Resultado
| Métrica | Antes | Después |
|---|---|---|
| Total problemas ESLint | 73 | **47** (−26) |
| `no-unused-vars` | 23 | **2** (skips intencionales) |
| `no-unescaped-entities` | 5 | **0** |
| `tsc --noEmit` | 0 | **0** |

## Archivos tocados (12)
| Archivo | Cambio |
|---|---|
| `app/dashboard/analytics/page.tsx` | −5 imports muertos (`useMemo`, `useRef`, `LineChart`, `IconAlertCircle`, `IconDownload`) |
| `app/dashboard/chat/page.tsx` | −1 import (`IconChevronDown`); 2× `"` → `&quot;` |
| `app/dashboard/disputes/page.tsx` | 1× `'` → `&apos;` |
| `app/dashboard/employees/page.tsx` | 2× `"` → `&quot;` |
| `app/dashboard/menu/page.tsx` | −2 imports (`useRef`, `IconGripVertical`); `categoryId` fuera del destructure (tipo intacto); 3× `catch (e: unknown)` → `catch` |
| `app/m/[slug]/MenuPageClient.tsx` | −1 import de tipo (`ModifierGroup`) |
| `app/m/[slug]/templates/IconRail.tsx` | −1 const muerto (`GOLD`) |
| `app/c/[token]/RoomHub.tsx` | −2 consts de cadena muerta (`menuIsComingSoon` y su único proveedor `menuIsActive`; `menuIsExternal`/`menuIsWeb` se conservan, sí se usan) |
| `app/super-admin/page.tsx` | −1 import (`IconClipboardList`) |
| `app/super-admin/revenue/page.tsx` | −1 import (`IconX`) |
| `app/super-admin/users/page.tsx` | −1 import (`IconAlertTriangle`); `onBan`/`onTrial` fuera del destructure (tipo + padre intactos; botones ya deshabilitados) |
| `lib/categoryIcons.tsx` | −1 import (`IconGlassFilled`) |

Fijados: **21** `no-unused-vars` + **5** `no-unescaped-entities` = **26**.

## Skips intencionales (anotados, NO tocados)
Dos casos de `no-unused-vars` son **funciones/componentes enteros sin usar** (dead code).
Borrar un bloque entero no es "trivialmente mecánico" como quitar un import, así que —
siguiendo la regla "menos y seguro" — se dejaron para un follow-up con criterio:
- `app/dashboard/menu/page.tsx:506` — componente `OptionsEditor` definido y nunca referenciado.
- `app/dashboard/offers/page.tsx:272` — función `computeStatus` definida y nunca llamada.
Ambos son código muerto seguro de eliminar, pero fuera del alcance mecánico de esta tanda.

## Notas
- `categoryId`, `onBan`, `onTrial`: se quitaron **solo del destructure** de props, dejando
  el tipo y lo que pasa el padre intactos → cambio mínimo, sin refactor, sin romper tsc.
- `catch (e: unknown)` → `catch` (optional catch binding): solo en los **3** bloques donde
  `e` no se usaba; los otros 8 `catch (e)` del archivo sí lo usan y NO se tocaron.
- No se tocó `react-hooks/set-state-in-effect` (38, pendiente Tanda B con criterio),
  `react/use` (5), `react-hooks/refs` (5) ni el resto.
