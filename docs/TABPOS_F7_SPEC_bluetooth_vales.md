# TAB POS — FASE F7: Impresoras Bluetooth del mesero + vales de conciliación + Copiar + limpieza del repo

**Versión:** 1.0 · **Fecha:** 2026-09-11 · **Autor:** Planning Claude (Fable)
**Documentos padre:** `TABPOS_PLAN_CUENTAS_CODIGO_v1.md` (0, 2, 7) y specs F2–F6 (todo en producción). **Léelos antes.**
**Rama:** `feat/tabpos-f7-bt-printers` desde `origin/main @ bfaccb2` (F6 mergeada). **Checkpoint:** SÍ — **nativo** (dependencias nativas y build). Paso 0 y espera OK.
**Migración:** `167_payment_voucher.sql`. Planning aplica por MCP.
**Requiere build nuevo de EAS** (módulos nativos: Bluetooth + `expo-clipboard`). Juan lanza el build por CLI; el APK actual **no** sirve para probar F7.

---

## 0. Tarea previa obligatoria — limpieza del repo (1 commit, antes del Paso 0)

En F6 se colaron a `main` archivos que no deben estar versionados (verificado en el merge `6876aaf..bfaccb2`): `gallery/phone-01..50.png` (~45 MB de imágenes), `.playwright-mcp/` (logs y volcados de sesión), `.mcp.json` (config local de MCP), `scripts/test-commanda.ts` (script de prueba suelto). Los `docs/TABPOS_*.md` **sí** se quedan (son los specs).

1. Crea/actualiza **`.gitignore`** en la raíz con, como mínimo:
   ```
   .playwright-mcp/
   .mcp.json
   gallery/
   scripts/test-*.ts
   ```
2. **Deja de trackear sin borrar del disco:** `git rm -r --cached .playwright-mcp .mcp.json gallery scripts/test-commanda.ts` (los archivos siguen en tu Mac; solo salen del repo).
3. Commit: `chore(repo): gitignore artefactos locales (playwright, mcp.json, gallery, scripts de prueba)` y push.
4. **Regla de aquí en adelante (D-44):** nunca `git add .` / `git add -A`. Añade **rutas explícitas** de los archivos que tocaste. En cada entrega incluye `git diff --stat origin/main..HEAD` para que Planning vea que solo entran archivos de la fase.
5. **Pregunta a Juan en la entrega del Paso 0** (no bloquea el commit de limpieza): ¿las imágenes de `gallery/` se necesitan para algo (web de marketing, tienda)? Si sí, se moverán al repo que corresponda o a almacenamiento (Supabase Storage / Vercel Blob), nunca a `jchat-3`.

---

## 1. Objetivo

1. **Impresoras Bluetooth del mesero** (D-16, D-17, D-18): emparejar desde la app (flujo "buscar y conectar" análogo al M2), guardar en el dispositivo, elegir ancho **58/80 mm**, imprimir **prueba**, y usarlas desde el **mismo selector** de F2 junto a las impresoras de red `receipt`/`waiter`. **Nunca** `kitchen`/`bar`.
2. **Vales de conciliación (D-41):** al cobrar en modo external, imprimir automáticamente un **vale** distinto para **EFECTIVO** y para **TARJETA EXTERNA**, con propina separada, mesero, mesa, fecha/hora y `receipt_code`, para cuadrar caja al final del día. Reimprimible desde Recibos.
3. **Botón "Copiar"** del código de mesa (diferido en F2) con `expo-clipboard`.
4. **Build nativo** (EAS) con los permisos de Bluetooth correctos para Android 12+.

F7 **no** implementa: la "Estación de impresión" (D-25), cloud print (D-26), ni el resumen del día por método en el dashboard (va en F8).

---

## 2. Hechos verificados por Planning

### 2.1 Hardware de Juan
- **NT-1809** — mini térmica **58 mm**, Bluetooth, 5V/1A. Genérica china; ESC/POS.
- **M860** — térmica **80 mm**, interfaz **USB + BT**, 5V/1A. ESC/POS.
- **VCP-8370** — **red (LAN)**, ESC/POS, sin Bluetooth: es la de comandas (`Kitchen Station` en Bar XZX, `192.168.1.100:9100`). No participa en F7 salvo como ejemplo de impresora de red.
- Los printers Bluetooth de este tipo se anuncian casi siempre como **Bluetooth Classic (perfil SPP)**, no BLE. **Paso 0 lo confirma** (si aparecen en *Ajustes → Bluetooth* de Android como dispositivos emparejables con PIN, es Classic).

### 2.2 Estado del código (F2–F6 en prod)
- `mobile/services/escpos.ts`: builders `buildKitchenTicketEscPos`, `buildReceiptEscPos(receipt, code, widthMm)`, `buildTableCodeTicketEscPos(opts)`; helpers `align/bold/doubleSize/feedLines/cut/enc` (PC437, translitera `ñ`/tildes); columnas 32 (58 mm) / 48 (80 mm).
- `mobile/services/printer.ts`: `printToNetwork(host, port, bytes)` (TCP 9100, `react-native-tcp-socket`), `fetchStaffPrinters(businessId)` (red, `role in ('receipt','waiter')`), `fetchPrinterByRole` (comandas), `fetchAnyPrinter` (legacy, sin filtro de rol — **no** usar para vales), `resolveServerName`.
- `mobile/components/pos/PrinterPickerSheet.tsx` (F2): selector imperativo `ref.print(businessId, bytes)`; 0 → `onNoPrinter`, 1 → directo, N → lista; memoria en `AsyncStorage['tabpos.lastStaffPrinter']`. **Hoy solo lista impresoras de red.**
- `PosCheckoutScreen` (F6): en external imprime el recibo con `fetchStaffPrinters(...)[0]` y `printToNetwork` (sin selector). `PosSplitScreen` external: cobra partes con `posApplyExternalPayment(..., p_payment_id)`.
- `pos_payments`: `payment_method ('stripe_terminal'|'stripe_web'|'cash'|'card_external')`, `paid_by (user_id)`, `receipt_code`, `tip_cents`, `amount_cents` (base), `kind`, `session_opened_at`, `source`.
- `get_public_receipt(p_code)` → `PublicReceipt` **sin `payment_method`** (nota F6 v1).
- `PosTableHub` bloque "Código de mesa" (F2): Imprimir + Liberar; **sin Copiar** (`expo-clipboard` no instalado — requiere módulo nativo, confirmado en F2).
- Stripe M2: emparejamiento vía Stripe Terminal SDK (`usePosReader`: `discoverReaders` + `connectReader`). Es la referencia de UX para el flujo de la impresora.
- Bloqueo: `app.config.ts` (Expo SDK 56 / RN 0.85 / React 19). Paso 0 confirma si el proyecto usa **prebuild con config plugins** (sin carpeta `android/` versionada) o bare.

### 2.3 Permisos Android (verificado contra developer.android.com, sesión F1)
- `targetSdk ≥ 31`: **`BLUETOOTH_SCAN`** (con `android:usesPermissionFlags="neverForLocation"`) y **`BLUETOOTH_CONNECT`** son permisos **de runtime** → pedirlos con `PermissionsAndroid.requestMultiple` antes de escanear/conectar.
- Legacy: `BLUETOOTH` y `BLUETOOTH_ADMIN` con `android:maxSdkVersion="30"`.
- **No** declarar `ACCESS_FINE_LOCATION` para esto (no derivamos ubicación). Solo si la librería elegida lo exige para Android ≤ 11, y entonces con `maxSdkVersion="30"`.
- Declararlos vía **config plugin de Expo** (`app.config.ts` → `android.permissions` / plugin `withAndroidManifest`), no editando `android/` a mano si el proyecto usa prebuild.

### 2.4 Librerías (verificado 2026-09-11)
- `react-native-bluetooth-escpos-printer` (y forks): **abandonada** (última versión hace años, enlace manual). **No usar.**
- Opción A (preferida): **Bluetooth Classic SPP genérico** + nuestros bytes ESC/POS. Candidata: `react-native-bluetooth-classic` (lista dispositivos emparejados, conecta por SPP, `write(bytes)`). Ventaja: sin SDK de fabricante, funciona con cualquier printer SPP, reutiliza `escpos.ts` tal cual.
- Opción B: `@finan-me/react-native-thermal-printer` (Bluetooth Classic + BLE + LAN, mantenida en 2025–2026, con setup iOS/Android documentado).
- Opción C: `react-native-savanitdev-thermal-printer` (Expo con config plugin, pero BLE-only en Android y SDK propio) — solo si NT-1809/M860 resultan BLE.
- **Paso 0 decide** con evidencia (compatibilidad con Expo SDK 56 / RN 0.85 / nueva arquitectura, último release, issues abiertos, si trae config plugin o requiere prebuild). **No instalar nada antes del OK.**
- `expo-clipboard`: módulo nativo (verificado en F2). Entra en el **mismo build**.

---

## 3. PASO 0 (reportar con plantilla 0.2 y ESPERAR OK — checkpoint nativo)

1. **Naturaleza de los printers:** ¿NT-1809 y M860 se emparejan desde *Ajustes → Bluetooth* de Android (Classic/SPP)? Pide a Juan que lo compruebe en la tablet (1 minuto) y repórtalo. Esto decide Opción A/B/C.
2. **Evaluación de la librería** (sin instalar): para la candidata principal y una alternativa, reporta: nombre, versión, fecha del último release, soporte de RN 0.85 / nueva arquitectura, si trae config plugin de Expo o exige prebuild/bare, API mínima que usaremos (listar emparejados, conectar, escribir bytes, desconectar), y riesgos conocidos (issues de escrituras grandes, desconexiones).
3. **Proyecto Expo:** ¿hay carpeta `android/` versionada (bare) o se usa `expo prebuild` (managed + plugins)? Lista los `plugins` actuales de `app.config.ts` y el perfil de `eas.json` que Juan usa para APK de pruebas (`development`/`preview`). Reporta el comando exacto de build.
4. **`PrinterPickerSheet`:** cómo modela hoy la impresora (`NetworkPrinter`) y cómo se llamaría con una unión `StaffPrinter = NetworkPrinter | BtPrinter`. Propón el cambio mínimo.
5. **Dónde imprimir el vale automáticamente:** puntos exactos en `PosCheckoutScreen` (external, tras `posApplyExternalPayment`) y `PosSplitScreen` (external, por cada parte cobrada). Y en `PosReceiptsScreen`, dónde añadir "Reimprimir vale" para filas `payment_method in ('cash','card_external')`.
6. **`get_public_receipt`:** firma real (¿`returns jsonb`?) para saber si se puede `create or replace` añadiendo `payment_method` sin `drop`.
7. **Nombre a imprimir del mesero:** confirma que `resolveServerName(businessId)` devuelve el nombre del **usuario autenticado**; para el vale necesitamos el nombre del `paid_by` de la fila — propón el join en la RPC `pos_payment_voucher` (`employees.receipt_display_name` → `users.display_name`).
8. **Diferencias** con el código/BD real.

---

## 4. Migración `167_payment_voucher.sql` (archivo completo, `begin/commit`)

```sql
-- 167: Vale de conciliación por pago — Tab POS · F7 · D-41.
begin;

-- Datos del vale para un pago (solo staff del negocio). No expone nada de otros negocios.
create or replace function public.pos_payment_voucher(p_payment_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_biz uuid; v_out jsonb;
begin
  select pp.business_id into v_biz from public.pos_payments pp where pp.id = p_payment_id;
  if v_biz is null then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if not (public.pos_can_access(v_biz)
          or exists (select 1 from public.businesses b where b.id = v_biz and b.owner_id = auth.uid())) then
    raise exception 'NOT_ALLOWED';
  end if;
  select jsonb_build_object(
    'payment_id',      pp.id,
    'business_name',   b.name,
    'table_label',     coalesce(t.label, pp.table_id::text),
    'payment_method',  pp.payment_method,
    'source',          pp.source,
    'kind',            pp.kind,
    'amount_cents',    pp.amount_cents,
    'tip_cents',       coalesce(pp.tip_cents, 0),
    'total_cents',     pp.amount_cents + coalesce(pp.tip_cents, 0),
    'status',          pp.status,
    'receipt_code',    pp.receipt_code,
    'paid_at',         pp.updated_at,
    'session_opened_at', pp.session_opened_at,
    'waiter_name',     coalesce(e.receipt_display_name, u.display_name, 'Staff'),
    -- Para partes de split: posición y total de partes de la sesión (informativo)
    'split_index',     (select count(*) from public.pos_payments q
                         where q.table_id = pp.table_id and q.session_opened_at = pp.session_opened_at
                           and q.source = 'pos' and q.kind = pp.kind and q.status = 'succeeded' and q.updated_at <= pp.updated_at),
    'split_total',     (select count(*) from public.pos_payments q
                         where q.table_id = pp.table_id and q.session_opened_at = pp.session_opened_at
                           and q.source = 'pos' and q.kind = pp.kind and q.status in ('pending','processing','succeeded')),
    -- Ítems cubiertos (si el pago fue por ítems); vacío para pagos por monto
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', mi.name, 'qty', oi.qty, 'line_cents', oi.price_cents * oi.qty) order by oi.id)
      from public.order_items oi join public.menu_items mi on mi.id = oi.menu_item_id
      where pp.order_item_ids is not null and oi.id = any(pp.order_item_ids)
    ), '[]'::jsonb)
  ) into v_out
  from public.pos_payments pp
  join public.businesses b on b.id = pp.business_id
  left join public.tables t on t.id = pp.table_id
  left join public.employees e on e.user_id = pp.paid_by and e.business_id = pp.business_id
  left join public.users u on u.id = pp.paid_by
  where pp.id = p_payment_id;
  return v_out;
end $$;
revoke all on function public.pos_payment_voucher(uuid) from public, anon;
grant execute on function public.pos_payment_voucher(uuid) to authenticated;

-- get_public_receipt: añadir payment_method al JSON de 'payment' (cuerpo real de la BD + 1 campo).
-- Si su RETURNS no es jsonb y hay que cambiar tipo → drop + create (Paso 0 punto 6).

commit;
```
> Verifica en Paso 0 que `employees.receipt_display_name` y `users.display_name` existen con esos nombres (los usa `resolveServerName`); ajusta si difieren.

---

## 5. Móvil

### 5.1 Servicio Bluetooth — `mobile/services/btPrinter.ts` (nuevo)
- `requestBtPermissions(): Promise<boolean>` — Android 12+: `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT`; ≤11: nada extra (o lo que exija la librería). Mensaje claro si se deniega.
- `listPairedDevices(): Promise<{ id, name, address }[]>` — dispositivos ya emparejados en el sistema (para Classic/SPP el emparejamiento se hace en Ajustes de Android; la app **no** necesita escanear).
- `printToBluetooth(address, bytes: Uint8Array): Promise<void>` — conectar → escribir en **chunks ≤ 512 bytes con 20–40 ms de pausa** (los módulos SPP baratos pierden datos con escrituras grandes) → esperar 300 ms → desconectar. **1 reintento** automático si falla la conexión. Errores tipados: `BT_OFF`, `NOT_PAIRED`, `CONNECT_FAILED`, `WRITE_FAILED`.
- Si el Paso 0 concluye BLE en vez de Classic: misma API pública; implementación con la librería elegida.

### 5.2 Almacenamiento local (D-42) — `AsyncStorage['tabpos.btPrinters']`
`{ id: string; name: string; address: string; widthMm: 58 | 80; addedAt: string }[]` por dispositivo (un emparejamiento Bluetooth es del handheld, no del negocio). **No** se guardan en `pos_printers`.

### 5.3 Pantalla "Mis impresoras" (ajustes del POS; entrada desde el ⚙️ del POS)
- Lista de impresoras Bluetooth guardadas (nombre, dirección, 58/80, "Probar", "Quitar").
- **Agregar impresora:** pide permisos → lista emparejados del sistema → elegir → elegir ancho (58/80) → **Imprimir prueba** (ticket "PRUEBA OK — Tab POS — {nombre} — {ancho} mm") → guardar. Si no aparece: "Empareja la impresora primero en Ajustes → Bluetooth de Android" con botón que abre los ajustes de Bluetooth.
- Muestra también (solo lectura) las impresoras de red del negocio con `role in ('receipt','waiter')`, con nota "Se configuran en el dashboard".

### 5.4 Selector unificado — `PrinterPickerSheet` (extender)
- Tipo `StaffPrinter = ({ type:'network' } & NetworkPrinter) | ({ type:'bluetooth' } & BtPrinter)`.
- `listStaffPrinters(businessId)` = Bluetooth locales + `fetchStaffPrinters(businessId)`. **Nunca** `kitchen`/`bar` (filtro + guard `PRINTER_ROLE_FORBIDDEN` en el dispatcher).
- Dispatcher `printEscPos(printer, bytes)`: `network` → `printToNetwork`; `bluetooth` → `printToBluetooth`. Chips "Bluetooth"/"Red" y ancho en la lista. Memoria de última usada por `businessId` **y** tipo de ticket (`code`/`receipt`/`voucher`).
- **Todos** los puntos que hoy imprimen recibos/códigos del mesero pasan por el selector: `PosTableHub` (código), `PosCheckoutScreen` (recibo y vale), `PosSplitScreen` (vale por parte), `PosReceiptsScreen` (reimpresión). En **modo stripe**, `PosCheckoutScreen` deja de usar `fetchAnyPrinter` y usa el selector (fin de la deuda de F6: nunca cocina).

### 5.5 Vales de conciliación — `buildPaymentVoucherEscPos(voucher, widthMm)` en `escpos.ts` (D-41)
Dos variantes por `payment_method`, con **cabecera grande** para separarlos de un vistazo en caja:

```
        {BUSINESS NAME}             (negrita, centrado)
       VALE DE CAJA                 (centrado)
--------------------------------
   *** EFECTIVO ***                 (doble alto+ancho, centrado)   |  *** TARJETA EXTERNA ***
--------------------------------
Mesa: {label}         {HH:MM}
Mesero: {waiter_name}
{DD/MM/YYYY}
--------------------------------
Venta:                 $XX.XX        (base = amount_cents)
Propina:               $X.XX         (tip_cents; línea SIEMPRE presente, aunque sea $0.00)
--------------------------------
TOTAL:                 $XX.XX        (negrita)
--------------------------------
Parte 2 de 4                         (solo si split_total > 1)
[ítems cubiertos, si los hay]
--------------------------------
Ref: {receipt_code}                  (código completo, para cotejar con el sistema)
Conservar para cierre de caja
{feedLines(5)} {cut}
```
Reglas: **propina siempre en línea separada** (no es ingreso del negocio; se concilia aparte); sin tildes/ñ (PC437, igual que los demás tickets); 32/48 columnas; el `receipt_code` **completo** (es la referencia de conciliación). En modo `external` **no** se imprime además el recibo normal — el vale lo sustituye (evita dos papeles); en modo `stripe` no hay vale.

### 5.6 Impresión automática y reimpresión
- `PosCheckoutScreen` (external): tras `posApplyExternalPayment` OK → `pos_payment_voucher(payment_id)` → `buildPaymentVoucherEscPos` → selector (última impresora `voucher`) → imprimir. Botón **Reimprimir vale** en la pantalla de éxito. Fallo de impresión: no bloquea el cobro; aviso + reintentar.
- `PosSplitScreen` (external): un vale por cada parte cobrada (`Parte i de N`).
- `PosReceiptsScreen`: en filas `cash`/`card_external`, acción **Reimprimir vale**; en filas M2/QR, la acción actual (recibo).

### 5.7 Botón "Copiar" (F2 diferido)
`expo-clipboard` (`npx expo install expo-clipboard`) → en el bloque "Código de mesa" de `PosTableHub`: **Copiar** → `Clipboard.setStringAsync(code)` → toast "Copiado".

### 5.8 Permisos y build
- `app.config.ts`: permisos de 2.3 vía config plugin (`BLUETOOTH_SCAN` con `neverForLocation`, `BLUETOOTH_CONNECT`, legacy `BLUETOOTH`/`BLUETOOTH_ADMIN` `maxSdkVersion=30`). Sin ubicación.
- Tras el OK del Paso 0 y la implementación: **Juan** ejecuta el build (`eas build -p android --profile <perfil de pruebas>` — el que reporte el Paso 0) e instala el APK. F7 **no se puede probar con Metro sobre el APK viejo** (módulos nativos nuevos).

### 5.9 i18n móvil (`settings.json → pos.printers.*`, `pos.voucher.*`, `pos.tableCode.copy/copied`), EN/ES.

---

## 6. Web (mínimo)
- `/dashboard/configuration/printers`: texto de ayuda "Las impresoras Bluetooth del mesero se agregan desde el handheld (⚙️ → Mis impresoras)". Permitir `role='waiter'` en la sección de recibos **si es trivial** (F2 lo dejó para F7); si no, anotar.

---

## 7. PROHIBIDO en F7
1. Instalar dependencias nativas antes del OK del Paso 0; usar `react-native-bluetooth-escpos-printer` o forks abandonados.
2. Imprimir códigos, recibos o vales en `kitchen`/`bar` por ninguna ruta; usar `fetchAnyPrinter` para el mesero.
3. Declarar permisos de ubicación sin necesidad; editar `android/` a mano si el proyecto usa prebuild.
4. Guardar impresoras Bluetooth en `pos_printers`; exponer `pos_payment_voucher` a `anon`.
5. Imprimir el vale sin la línea de propina separada; imprimir vale en modo `stripe`.
6. `git add .` / `-A`; volver a versionar `gallery/`, `.playwright-mcp/`, `.mcp.json`.
7. Cambiar la lógica de cobro (RPCs/EFs de F5/F6); F7 solo imprime.

---

## 8. Criterios de aceptación

**Repo:** `.gitignore` en main; `git ls-files | grep -E 'gallery/|playwright-mcp|\.mcp\.json'` vacío; la entrega solo toca archivos de F7.

**BD (Planning por SQL):** `pos_payment_voucher` devuelve método, base, propina, total, mesero, mesa, `receipt_code` para un pago `cash`; `NOT_ALLOWED` para un usuario sin acceso; `get_public_receipt` incluye `payment_method`.

**Handheld (Juan, con el APK nuevo):**
- [ ] Permisos: al agregar impresora, Android pide Bluetooth; denegar → mensaje claro, sin crash.
- [ ] NT-1809 (58) y M860 (80) aparecen en "emparejados", se guardan con su ancho, e imprimen la **prueba**.
- [ ] Código de mesa: el selector lista Bluetooth + red (`receipt`/`waiter`), **nunca** Kitchen Station; imprime bien en 58 y 80; **Copiar** funciona.
- [ ] Modo external: cobrar en **Efectivo** → vale "*** EFECTIVO ***" con Venta / Propina / Total, mesero, mesa, hora, Ref; cobrar con **Tarjeta externa** → vale "*** TARJETA EXTERNA ***". Con propina 18 % → propina en su línea; con 0 → "Propina: $0.00".
- [ ] Split external ÷2 → dos vales "Parte 1 de 2" / "Parte 2 de 2".
- [ ] Recibos → "Reimprimir vale" en cash/tarjeta externa reimprime el mismo `receipt_code`.
- [ ] Modo stripe: recibo M2 sale por el selector (Bluetooth o red del mesero), no por cocina.
- [ ] Impresora apagada → aviso + reintentar; el cobro queda registrado igual.

**Calidad:** tsc móvil sin errores nuevos; EN/ES paridad; entrega 0.3 con `167`, el `git diff --stat`, y el comando de build EAS para Juan.

---

## 9. Decisiones (confirmadas / nuevas)
- **D-41 (confirmada):** vales de conciliación distintos para EFECTIVO y TARJETA EXTERNA, con propina separada, mesero, mesa, fecha/hora y `receipt_code`; se imprimen automáticamente al cobrar en external y son reimprimibles. El resumen del día por método en el dashboard va en **F8**.
- **D-42:** las impresoras Bluetooth viven en el dispositivo del mesero (AsyncStorage), no en la BD.
- **D-43:** la librería Bluetooth la fija el Paso 0 con evidencia (preferencia: Classic/SPP genérico + ESC/POS propio).
- **D-44:** política de repo — `.gitignore` + `git add` con rutas explícitas; nunca `git add .`.
- **D-45 (pendiente de Juan):** destino de `gallery/` (¿se necesita en algún sitio?).

**Fin del spec F7.**
