# TAB POS — FASE F8: Cierre — Z-report del día, i18n, contraste, deudas y documentación

**Versión:** 1.0 · **Fecha:** 2026-09-15 · **Autor:** Planning Claude (Opus 4.8)
**Documentos padre:** `TABPOS_PLAN_CUENTAS_CODIGO_v1.md` (0, 2, 7) y specs F2–F7 (todo en producción, main @7f52298). **Léelos antes.**
**Rama:** `feat/tabpos-f8-cierre` desde `origin/main @ 7f52298`. **Checkpoint:** NO (reporta el Paso 0 y continúa; solo la migración 168 la aplica Planning). **Migración:** `168_daily_payment_summary.sql`.

Es la fase de **cierre del proyecto**: no agrega funcionalidad de dinero nueva, pone el broche. Cinco bloques independientes; puedes entregarlos en un solo commit o en commits temáticos (preferible commits temáticos para auditar más fácil).

---

## 1. Objetivo (cinco bloques)

1. **Z-report del día — resumen por método de pago** en el dashboard (complementa los vales físicos de F7): cuánto entró hoy en **Efectivo / Tarjeta externa / Stripe M2 / QR del cliente**, con propina separada, para que el dueño cuadre caja al cierre.
2. **Cerrar las 2 deudas menores de F7:** (a) `get_public_receipt` sin `payment_method`; (b) guard defensivo `PRINTER_ROLE_FORBIDDEN` en el dispatcher del selector de impresoras.
3. **Barrido de contraste:** inputs/textos sin `color` explícito y cualquier `var(--...)` de CSS colado en React Native.
4. **Limpieza:** logs de depuración `[ComandaBridge]` y cualquier `console.log` de diagnóstico dejado en F3–F7.
5. **Documentación e i18n:** barrido de paridad EN/ES de todas las claves de F1–F8; docs de decisiones y estado en el repo.

---

## 2. Hechos verificados por Planning (2026-09-15, main @7f52298 + BD)

- **`pos_payments`** (fuente del Z-report): `business_id, table_id, amount_cents (base), tip_cents, payment_method ('stripe_terminal'|'stripe_web'|'cash'|'card_external'), source ('pos'|'guest'), status, paid_by, receipt_code, created_at, updated_at, session_opened_at`. Los pagos succeeded del día son la verdad de caja.
- **`pos_receipts_today(p_business_id)`** ya devuelve `payment_method` y `source` (F6). Filtra `status='succeeded'` + día en zona `America/New_York`. Útil como base, pero el Z-report necesita **agregados por método** (no la lista) — mejor una RPC nueva `pos_daily_payment_summary` que agrupe.
- **`get_public_receipt(p_code)`** → `jsonb`, el objeto `payment` **NO** incluye `payment_method` (verificado). Es `create or replace` directo (retorna jsonb, sin drop).
- **Página de ventas** `web/app/dashboard/sales/page.tsx`: agrega por vendedor (`taken_by`) desde `orders` con `paid_at`. El Z-report por método es un **panel nuevo** en esa misma página (o una sección arriba del strip de resumen) que lee la RPC nueva — NO reemplaza lo existente.
- **Selector de impresoras** `PrinterPickerSheet` (F7): `listStaffPrinters` = BT + `fetchStaffPrinters` (que filtra a `receipt`/`waiter`). El dispatcher `printEscPos` **no** tiene guard defensivo de rol; el builder `buildTableCodeTicketEscPos` sí. Falta el guard en el dispatcher.
- **Logs `[ComandaBridge]`**: en `mobile/hooks/useComandaPrintBridge.ts` (instrumentación de F3, sección de logs `console.log('[ComandaBridge]...`). Bajar a silencio o a un flag de debug.
- **Zona horaria:** el negocio de pruebas opera en horario US Eastern; `pos_receipts_today` usa `America/New_York` hardcodeado. Para el Z-report, **usar la misma zona** por consistencia (o leer `businesses.timezone` si existe — Paso 0 lo confirma).

---

## 3. PASO 0 (reportar con plantilla 0.2; sin checkpoint — continúa tras reportar)

1. **`businesses.timezone`:** ¿existe la columna? Si sí, el Z-report agrupa "hoy" en esa zona (más correcto que hardcodear NY). Si no, usa `America/New_York` como `pos_receipts_today`. Reporta.
2. **Dónde encaja el Z-report** en `sales/page.tsx`: propón un panel colapsable "Cierre de caja de hoy" arriba del strip de resumen, o una pestaña. Cómo llamar la RPC nueva y refrescarla con el rango de fechas (el Z-report es del **día**, no del rango del filtro — decide: ¿siempre "hoy", o respeta el filtro de fecha? Propón "hoy" fijo con opción de fecha, ya que es un cierre de caja diario).
3. **`get_public_receipt`:** cuerpo real completo (para el `create or replace` +`payment_method`). ¿Dónde se consume el recibo público (web/móvil) para confirmar que añadir el campo no rompe nada?
4. **Dispatcher del selector:** línea exacta de `printEscPos` en `PrinterPickerSheet.tsx` donde agregar el guard `if (printer.role && ['kitchen','bar'].includes(printer.role)) throw new Error('PRINTER_ROLE_FORBIDDEN')` (o el equivalente según cómo modele el tipo BT vs network).
5. **Barrido de contraste:** `grep -rn "var(--" mobile/` (no debe haber ninguno en `.tsx/.ts`) y busca inputs/`TextInput`/`Text` sin `color` en los componentes nuevos de F2–F7 (`PosApproval`, `PosMyPrintersScreen`, `TabCodeSheet`, `NoCodeSheet`, `TabBalanceSheet`, `SplitMethodSheet`, `PrinterPickerSheet`, etc.). Lista lo que encuentres.
6. **Logs de depuración:** `grep -rn "console.log" mobile/hooks mobile/services mobile/screens/settings` — lista los de diagnóstico de F3–F7 (`[ComandaBridge]`, `[guest-tab]`, etc.) a limpiar. No toques logs de error legítimos (`console.error` de catches).
7. **i18n:** confirma cómo verificar paridad EN/ES (¿hay script? si no, compara conteos de claves por namespace). Lista namespaces tocados en F1–F7.
8. **Diferencias** con el código/BD real.

---

## 4. Migración `168_daily_payment_summary.sql` (archivo completo, `begin/commit`)

```sql
-- 168: Resumen diario de pagos por método (Z-report) — Tab POS · F8.
begin;

-- Agregado de caja del día por método de pago. Solo dueño/staff con acceso.
-- p_day: fecha local (YYYY-MM-DD) en la zona del negocio; null = hoy.
create or replace function public.pos_daily_payment_summary(p_business_id uuid, p_day date default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  v_tz text;
  v_is_owner boolean;
  v_day date;
  v_start timestamptz;
  v_end timestamptz;
  v_out jsonb;
begin
  v_is_owner := exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid());
  if not (v_is_owner or public.is_employee_of_business(p_business_id)) then
    raise exception 'NOT_ALLOWED';
  end if;

  -- Zona horaria del negocio (fallback a America/New_York, igual que pos_receipts_today)
  select coalesce(b.timezone, 'America/New_York') into v_tz
  from public.businesses b where b.id = p_business_id;
  if v_tz is null then v_tz := 'America/New_York'; end if;

  v_day := coalesce(p_day, (now() at time zone v_tz)::date);
  v_start := (v_day::text || ' 00:00:00')::timestamp at time zone v_tz;
  v_end   := ((v_day + 1)::text || ' 00:00:00')::timestamp at time zone v_tz;

  select jsonb_build_object(
    'day', v_day,
    'timezone', v_tz,
    'by_method', coalesce((
      select jsonb_agg(jsonb_build_object(
        'payment_method', m.payment_method,
        'count', m.cnt,
        'sales_cents', m.sales,       -- base (amount_cents)
        'tips_cents', m.tips,
        'total_cents', m.sales + m.tips
      ) order by m.payment_method)
      from (
        select coalesce(pp.payment_method, 'unknown') as payment_method,
               count(*) as cnt,
               sum(pp.amount_cents) as sales,
               sum(coalesce(pp.tip_cents, 0)) as tips
        from public.pos_payments pp
        where pp.business_id = p_business_id
          and pp.status = 'succeeded'
          and pp.created_at >= v_start and pp.created_at < v_end
        group by coalesce(pp.payment_method, 'unknown')
      ) m
    ), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'count', coalesce(count(*), 0),
        'sales_cents', coalesce(sum(pp.amount_cents), 0),
        'tips_cents', coalesce(sum(coalesce(pp.tip_cents,0)), 0),
        'total_cents', coalesce(sum(pp.amount_cents + coalesce(pp.tip_cents,0)), 0)
      )
      from public.pos_payments pp
      where pp.business_id = p_business_id
        and pp.status = 'succeeded'
        and pp.created_at >= v_start and pp.created_at < v_end
    )
  ) into v_out;
  return v_out;
end $$;
revoke all on function public.pos_daily_payment_summary(uuid, date) from public, anon;
grant execute on function public.pos_daily_payment_summary(uuid, date) to authenticated;

-- get_public_receipt: añadir payment_method al objeto payment (cuerpo real de la BD + 1 campo).
-- Copiar el cuerpo completo actual y agregar 'payment_method', pp.payment_method al jsonb_build_object del objeto 'payment'.
-- (Retorna jsonb → create or replace directo, sin drop.)

commit;
```
> El `create or replace get_public_receipt` va **escrito completo** en el archivo (cuerpo real de la BD + el campo). Si `businesses.timezone` no existe (Paso 0), quita el `coalesce(b.timezone,...)` y usa `America/New_York` directo.

---

## 5. Web — Z-report en el dashboard de Ventas

- **RPC:** `posDailyPaymentSummary(businessId, day?)` en el cliente.
- **Panel "Cierre de caja"** en `sales/page.tsx` (arriba del strip de resumen o como sección colapsable): una fila por método (Efectivo, Tarjeta externa, Stripe M2, QR cliente, y "Otros" si `unknown`), con **Ventas / Propina / Total** por método, y una fila de **TOTAL del día**. Etiquetas legibles por método (`stripe_terminal` → "Tarjeta (M2)", `stripe_web` → "Cliente (QR)", `cash` → "Efectivo", `card_external` → "Tarjeta externa"). Selector de fecha (default hoy). Propina siempre en su columna (no es ingreso del negocio, igual que el vale).
- Botón para **imprimir/exportar el cierre** (CSV o el mismo patrón de descarga que ya existe) — opcional, si es trivial.
- Tokens `--db-*`, i18n `dashboardCommon` (EN/ES): `salesCashupTitle`, `salesCashupMethod`, `salesCashupSales`, `salesCashupTips`, `salesCashupTotal`, `salesCashupDayTotal`, `methodCash`, `methodCardExternal`, `methodStripeM2`, `methodStripeQr`, `methodUnknown`.

---

## 6. Deudas de F7, contraste y limpieza

### 6.1 `get_public_receipt` con `payment_method` (migración 168, ya arriba).

### 6.2 Guard del selector (móvil)
En `PrinterPickerSheet.tsx`, dispatcher `printEscPos`: antes de imprimir, si la impresora tuviera rol `kitchen`/`bar` (no debería llegar, pero defensa), lanzar `PRINTER_ROLE_FORBIDDEN`. Mensaje i18n si se muestra al usuario.

### 6.3 Barrido de contraste (móvil)
- `grep var(--` en `mobile/**/*.{ts,tsx}` → reemplazar cualquier ocurrencia por color literal de RN (ninguna debe quedar).
- En los componentes nuevos de F2–F7, revisar `TextInput` y `Text` sin `color` explícito sobre fondos claros → añadir color de alto contraste. Foco: campos de entrada (códigos, montos), títulos y subtítulos de sheets.

### 6.4 Limpieza de logs
- `useComandaPrintBridge.ts` y demás: quitar los `console.log('[ComandaBridge]...`/`[guest-tab]...` de diagnóstico (o envolverlos en `if (__DEV__)`). **No** toques `console.error` de manejo de errores real.

---

## 7. Documentación (repo)
- `docs/DECISIONS.md`: consolidar D-01…D-45 (una línea cada una) — puedes extraerlas de los specs `TABPOS_*` que ya están en `docs/`.
- `docs/ESTADO.md`: estado final de las 8 fases con SHAs de merge (F1 8a70b00, F2 87157f6, F3 c17d16e, F4 b551237, F5 6876aaf, F6 bfaccb2, F7 7f52298, F8 = este merge).
- Nota de deudas futuras (D-25 estación de impresión, D-26 cloud print, D-27 inventario en EF, D-28 hardening anon businesses).

---

## 8. PROHIBIDO en F8
1. Cambiar lógica de dinero (cobros, saldos, split, candados) — F8 solo lee/agrega y pule.
2. Tocar las EFs de pago; reintroducir `gallery/`/`.playwright-mcp/`/`.mcp.json`; `git add .`.
3. Cambiar el criterio "succeeded" de los pagos; alterar `pos_receipts_today`/`pos_apply_payment`.
4. Quitar `console.error` legítimos; dejar `var(--)` en móvil.
5. Exponer `pos_daily_payment_summary` a `anon`.

---

## 9. Criterios de aceptación

**BD (Planning por SQL tras 168):**
- [ ] `pos_daily_payment_summary` devuelve `by_method` (cash, card_external, stripe_terminal, stripe_web) + `totals` para hoy; `NOT_ALLOWED` para usuario sin acceso; propina separada de ventas.
- [ ] `get_public_receipt` incluye `payment_method`.

**Funcional (Juan):**
- [ ] Dashboard → Ventas → panel "Cierre de caja": muestra el total del día por método (Efectivo/Tarjeta externa/M2/QR) con ventas y propina separadas; el total cuadra con los vales impresos de F7.
- [ ] Selector de impresora: sigue sin listar cocina/bar; imprimir un vale/código funciona por BT y por red.
- [ ] Contraste: los campos de código/monto y títulos de sheets se leen bien en la tablet.
- [ ] Sin logs `[ComandaBridge]` en consola de producción (o solo en `__DEV__`).

**Calidad:** tsc/build web; tsc móvil sin errores nuevos; **EN/ES paridad en todos los namespaces**; entrega 0.3 con `168`, `git diff --stat`, y (si aplica) build EAS para probar el barrido de contraste móvil.

---

## 10. Decisiones nuevas
- **D-46:** el Z-report ("Cierre de caja") es por **día** en la zona del negocio (o NY si no hay `timezone`), agregado de `pos_payments succeeded`, con propina separada por método. Complementa los vales físicos de F7. Vive en el dashboard de Ventas (solo dueño/staff con acceso).
- **D-47:** cierre del proyecto — tras F8, las deudas registradas (D-25 a D-28) quedan como fases futuras independientes, no parte de "cuentas con código".

**Fin del spec F8.**
