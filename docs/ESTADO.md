# TAB POS — Estado final del proyecto "Cuentas con código"

**Fecha de cierre:** 2026-09-16 · **Rama final:** `feat/tabpos-f8-cierre`

---

## 8 fases completadas

| Fase | Nombre | SHA de merge | Contenido principal |
|------|--------|-------------|---------------------|
| F1 | Menú POS móvil | `8a70b00` | `PosHomeScreen`, `PosOrderScreen`, navegación POS, `PosDraftContext`, ESC/POS básico |
| F2 | Comandas y KDS | `87157f6` | `pos_create_order`, bridge de impresión, KDS web, `useComandaPrintBridge` |
| F3 | Acceso de clientes | `c17d16e` | Código de mesa QR, `pos_guest_tab_join`, tab de cliente, sheet de balance |
| F4 | Pagos Stripe | `b551237` | Terminal M2, `PosCheckoutScreen`, `pos_payments`, recibos ESC/POS, `get_public_receipt` |
| F5 | Split bill | `6876aaf` | `PosSplitScreen`, `pos_payments.kind`, splits por asiento/partes iguales/monto personalizado |
| F6 | Pagos externos | `bfaccb2` | Cash / card_external, `posApplyExternalPayment`, ventas por vendedor (dashboard) |
| F7 | Bluetooth y vales | `7f52298` | `btPrinter.ts`, `PrinterPickerSheet` unificado, `PosMyPrintersScreen`, vales ESC/POS, migración 167 |
| F8 | Cierre | *(este PR)* | Z-report diario, guard de rol, logs → `__DEV__`, docs, migración 168 |

---

## Migraciones aplicadas (1–168)

- Últimas relevantes al POS: 156 (`pos_receipts_today`), 157 (`get_public_receipt` + server_name), 165 (`pos_apply_external_payment`), 167 (`pos_payment_voucher`), **168** (`pos_daily_payment_summary` + `payment_method` en receipt).

---

## Deudas futuras (fuera del alcance de "cuentas con código")

| ID | Descripción |
|----|-------------|
| D-25 | Cloud print: imprimir desde el dashboard web a la impresora del mesero sin que el mesero esté abierto |
| D-26 | Descuento de inventario en Edge Function (webhook de pago Stripe) |
| D-27 | Plantillas de menú en móvil (selector de template por negocio) |
| D-28 | Hardening anon: lookup de `businesses` por slug sin autenticación (política de RLS más estricta) |

---

## Stack final

- **Móvil:** Expo SDK 56 · RN 0.85 · React 19 · New Architecture · React Navigation v6
- **BT:** `react-native-bluetooth-classic@1.73.0-rc.17` (smoke-tested en New Arch)
- **Web:** Next.js (App Router) · next-intl · Supabase JS
- **Backend:** Supabase Postgres + RLS + SECURITY DEFINER RPCs + Edge Functions (Stripe)
- **Impresión:** ESC/POS raw — TCP (red) + BT Classic/SPP (mesero)
- **Build móvil:** EAS Build, perfil `preview` (Android APK) y `production`

---

*Proyecto "Tab POS — Cuentas con código" cerrado en F8.*
