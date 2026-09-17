# TAB POS — Decisiones técnicas y de producto (D-01…D-47)

Fuente de verdad: specs `TABPOS_F1`…`TABPOS_F8` en `docs/`. Generado en F8 (2026-09-16).

---

## Arquitectura y fundaciones

| # | Decisión |
|---|----------|
| D-01 | `pos_payments` es la fuente de verdad de cobros; `orders` es inventario de ítems. Nunca mezclar. |
| D-02 | La primera orden de una mesa abre la sesión (acceso + código). No hay un "abrir sesión" manual. |
| D-03 | ESC/POS raw sobre TCP para impresoras de red; sin dependencias de driver. Puerto 9100 por defecto. |
| D-04 | Un solo cliente Supabase compartido (`mobile/services/supabase.ts`, `web/lib/supabase.ts`). |
| D-05 | RLS en todas las tablas. Nunca select sin filtro de `business_id` o `auth.uid()`. |
| D-06 | Edge Functions solo para pagos y webhooks de Stripe. Nada más pasa por EF. |
| D-07 | Expo SDK 56 / RN 0.85 / New Architecture. Cualquier nativo requiere build EAS (no expo go). |
| D-08 | React Navigation v6 (no Expo Router) en móvil. |
| D-09 | Tokens de color en `mobile/theme/tokens.ts` y `web/styles/tokens.css`. Nunca hex inline. |
| D-10 | Tabler Icons únicamente (móvil: `@tabler/icons-react-native`; web: `@tabler/icons-react`). |

## POS — Pedidos y cocina

| # | Decisión |
|---|----------|
| D-11 | `pos_create_order` → RPC SECURITY DEFINER que valida membresía de empleado. Nunca INSERT directo. |
| D-12 | Comanda bridge (`useComandaPrintBridge`): reclamo atómico via `pos_claim_comanda_print` para evitar doble-impresión entre handhelds. |
| D-13 | Stock se descuenta al crear orden (`pos_create_order`), no al cobrar. |
| D-14 | `approval_status awaiting → approved` dispara impresión vía UPDATE listener en el bridge (mismo flujo que INSERT). |
| D-15 | KDS (web) solo muestra `source='pos'`. Órdenes de cliente (`customer_stripe`, `customer_tab`) no aparecen en KDS. |
| D-16 | Voided orders: `canceled_at` + todos los items a qty=0. No se borra la fila. |

## Acceso y códigos de mesa

| # | Decisión |
|---|----------|
| D-17 | Código de acceso = 6 dígitos, caduca con la sesión. Se genera en `pos_open_table_session`. |
| D-18 | El código se imprime vía `buildTableCodeTicketEscPos` (ESC/POS). El ticket viaja a la impresora del mesero, no a cocina/bar. |
| D-19 | `pos_guest_tab_join`: el cliente escanea el QR y entra; máx. 8 clientes por mesa para prevenir abuso. |
| D-20 | `is_employee_of_business` es la única fuente de verdad de membresía de empleados en RPCs SECURITY DEFINER. |

## Pagos y cobros

| # | Decisión |
|---|----------|
| D-21 | Cobro Stripe: `createPaymentIntent` solo en Edge Function; el cliente nunca toca la secret key. |
| D-22 | Stripe Terminal (M2): flow completo en móvil con `@stripe/stripe-react-native`; nunca simular en producción. |
| D-23 | Propina se fija en el cliente antes del intento de cobro y se guarda en `pos_payments.tip_cents`. |
| D-24 | Split bill: `pos_payments.kind in ('full','seat','even','custom')`. Un pago por parte; `split_index` + `split_total` en recibo/vale. |
| D-25 | Cloud print (web → impresora del mesero) — deuda futura, no parte de F1–F8. |
| D-26 | Inventario en Edge Function (webhook de pago) — deuda futura. |
| D-27 | Plantillas de menú en móvil — deuda futura. |
| D-28 | Hardening anon `businesses` (lookup por slug sin auth) — deuda futura. |
| D-29 | Editar orden pendiente: la orden se marca `rechazada-por-edición` y sus ítems se cargan en el borrador del mesero. |
| D-30 | `posApplyExternalPayment` (cash / card_external) no pasa por Stripe; se registra directo en `pos_payments`. |

## Impresión de recibos y vales

| # | Decisión |
|---|----------|
| D-31 | `get_public_receipt` devuelve `jsonb`; accesible a `anon` + `authenticated` (recibo público QR). |
| D-32 | `pos_payment_voucher` es solo para `authenticated`; nunca `anon`. Vale físico de F7. |
| D-33 | Receipt template se elige por negocio (`receipt_template_id`); fallback a template 1. |
| D-34 | `confirm_payment` (webhook Stripe) es el camino primario para marcar `succeeded`; el cliente no puede hacerlo directamente. |
| D-35 | `buildPaymentVoucherEscPos` genera ticket ESC/POS para cash/card_external. Nunca para pagos stripe. |
| D-36 | El selector de impresoras (`PrinterPickerSheet`) nunca enruta a impresoras de cocina/bar. Guard defensivo `PRINTER_ROLE_FORBIDDEN` añadido en F8. |

## Bluetooth (F7)

| # | Decisión |
|---|----------|
| D-37 | Bluetooth Classic / SPP (no BLE) para impresoras térmicas de POS. |
| D-38 | Librería: `react-native-bluetooth-classic@1.73.0-rc.17` (única compatible con New Architecture en Expo 56 verificada con smoke test). |
| D-39 | Escritura en chunks ≤512 bytes, 30 ms entre chunks, 300 ms de drain. Un reintento en `CONNECT_FAILED`. |
| D-40 | Permisos BT Android: `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT` (API 31+). |
| D-41 | `BtPrinterRecord` se guarda en `AsyncStorage` del dispositivo del mesero, key `tabpos.btPrinters`. No en la BD. |
| D-42 | Las impresoras Bluetooth viven en el dispositivo del mesero (AsyncStorage), no en la BD (`pos_printers`). |
| D-43 | La librería Bluetooth fue confirmada por smoke test (APK de preview, impresora real, New Arch). |

## Repo y proceso

| # | Decisión |
|---|----------|
| D-44 | Política de repo: `.gitignore` estricto + `git add` siempre con rutas explícitas; nunca `git add .` ni `git add -A`. |
| D-45 | `npx tsc --noEmit` desde `mobile/` antes de cada commit. El único error tolerable es `app.config.ts:55` (`minSdkVersion` pre-existente). |

## F8 — Cierre

| # | Decisión |
|---|----------|
| D-46 | El Z-report ("Cierre de caja") agrega `pos_payments succeeded` del día en la zona del negocio (`America/New_York` hasta que exista `businesses.timezone`), con propina separada por método. Vive en el dashboard de Ventas. |
| D-47 | Cierre del proyecto — tras F8, las deudas D-25…D-28 quedan como fases futuras independientes, fuera del alcance de "cuentas con código". |

---

*Fin del registro de decisiones F1–F8.*
