# TAB POS — FASE F2: Código de mesa (6 dígitos) + vista e impresión en el handheld

**Versión:** 1.0 · **Fecha:** 2026-09-09 · **Autor:** Planning Claude (Fable)
**Documento padre:** `TABPOS_PLAN_CUENTAS_CODIGO_v1.md` (sección 0 = reglas operativas; sección 2 = decisiones D-01…D-23; sección 7 = PROHIBIDO global). **Léelo antes de este spec.** Este documento **precisa y, donde se indica, sustituye** la Fase F2 del plan maestro.
**Rama:** `feat/tabpos-f2-tab-code` desde `origin/main @ 8a70b00` (F1 mergeada). **Checkpoint:** SÍ — entrega el Paso 0 y **espera OK** antes de codear.
**Migración:** siguiente correlativa a la mayor en `supabase/migrations/` (hoy `159`) → `160_table_access_code.sql`. Planning la aplica por MCP; tú solo versionas el archivo.

---

## 1. Objetivo de F2

Al terminar F2, en el handheld del mesero:

1. Toda mesa **ocupada** tiene un **código de 6 dígitos** (D-02) que nace en el instante en que se abre la sesión de la mesa — por **primera orden** (`pos_create_order`) o por el botón **"Código de mesa"** — es el **mismo** mientras la mesa siga ocupada, se **muestra en pantalla** (D-03) y se **imprime** cuantas veces se quiera, y **muere** cuando la mesa vuelve a **libre**. La siguiente ocupación recibe un código **nuevo**.
2. El botón **Imprimir código** abre un **selector de impresoras** que **jamás** lista `kitchen` ni `bar` (D-16). En F2 solo hay impresoras de **red** con `role in ('receipt','waiter')`; Bluetooth llega en F7 y reutiliza este selector.
3. El ticket del código es **ESC/POS adaptable a 58 y 80 mm** (D-18) y reutiliza el builder/servicio de impresión existentes.

F2 **no** toca el menú público ni el checkout del cliente (eso es F3). F2 **no** cambia cómo se cobra ni se cierra una mesa.

---

## 2. Hechos verificados por Planning (2026-09-09, BD de producción + `main @ 8a70b00`)

Úsalos como mapa. En el Paso 0 confirmas solo lo que se te pide en la sección 3.

### 2.1 El POS del mesero es céntrico en la MESA, no en `table_tabs`
- `pos_create_order(p_business_id, p_table_id, p_items, p_notes)` inserta en `orders` con `table_id`, `table_label`, `order_type='table'`, `status='preparing'`, **`taken_by = auth.uid()` (user id, NO employee id)**, `notes`. **No crea ni asigna `tab_id`.** Descuenta inventario y notifica a otros meseros de la mesa (`notifications` tipo `pos_order_assist`).
- `pos_tables_overview(p_business_id)` devuelve por mesa: `table_id, label, floor, seats, party_size, state ('ocupada'|'libre'), assignment ('mine'|'other'|'unassigned'), open_total_cents, open_since, combined_into, combined_seats, combinable`. **`state='ocupada'` = existe alguna `orders` con `table_id = t.id and paid_at is null and canceled_at is null`, o `combined_into is not null`.** No mira `table_tabs`.
- `pos_tab_total(p_business_id, p_table_id)` suma `order_items.price_cents*qty` de órdenes abiertas de la mesa con `oi.paid_at is null`. Por mesa.
- `is_waiter_of_table(p_table_id)`: existe `table_waiters` → `employees.user_id = auth.uid()`.
- `pos_can_access(p_business_id)`: empleado `accepted` con permiso `pos_access`. **Excluye al dueño sin fila de empleado** (F1 resolvió esto en `pos_business_settings` con `or owner_id = auth.uid()`).

### 2.2 `table_tabs` existe pero es otro modelo (cuentas nombradas)
- `open_tab_on_table(p_table_id, p_name)` crea `table_tabs (kind='waiter', status='open', name='Cuenta N')` con advisory lock y reclama la mesa si no tiene meseros. `tab_amount_due`, `settle_tab_payment`, `attach_order_to_tab`, `tab_payments` operan por `tab_id`.
- **Pregunta abierta que resuelve el Paso 0:** ¿el handheld actual (PosTableHub / PosOrderScreen / PosCheckoutScreen / PosSplitScreen) usa `table_tabs` en algún flujo, o todo va por `table_id` + `pos_payments`? De la respuesta depende **dónde vive el código** (sección 4).

### 2.3 Impresión en la app (`mobile/services/printer.ts`, `mobile/services/escpos.ts`)
- `printToNetwork(host: string, port: number, bytes: Uint8Array): Promise<void>` — TCP con `react-native-tcp-socket`, timeouts 5 s/8 s, gracia 400 ms antes de cerrar. **Reutilizar tal cual.**
- `fetchPrinterByRole(businessId, 'kitchen'|'bar')` — solo para comandas. **No usar en F2.**
- `fetchAnyPrinter(businessId)` / `fetchDefaultPrinter(businessId)` — devuelven **cualquier** impresora de red activa **sin filtrar por rol** (pueden devolver la de cocina). **PROHIBIDO usarlas para el código.** F2 crea un fetch propio filtrado por rol.
- `resolveServerName(businessId)` — nombre del mesero para tickets (`employees.receipt_display_name` → `users.display_name`). Reutilizar en el ticket del código.
- `escpos.ts` exporta `buildKitchenTicketEscPos(...)`, `buildReceiptEscPos(receipt, code, width_mm)` y helpers (`feedLines(n)` = ESC d n; se usa `feedLines(5)` antes del corte). El builder ya maneja PC437 (sin glifos fuera de ASCII: usar `*` en vez de `★`; la `ñ`/tildes hay que verificar cómo las trata — reportar).
- Impresión de comandas: `printKitchenTickets()` se dispara **fire-and-forget desde el móvil** tras `pos_create_order` (PosTableHub `handleSendToKitchen`, PosOrderScreen `handleSubmit`). Es decir, **la impresión sale del handheld, no de la BD**. Esto simplifica F2: el ticket del código también sale del handheld.

### 2.4 Tablas relevantes
- `tables`: `id, business_id, label, floor, seats, sort, is_active, qr_token (NOT NULL), room_id, is_reserved, reserved_note, reserved_until, party_size, combined_into, created_at, updated_at`.
- `pos_printers`: `id, business_id, label, connection ('network'), host, port (NOT NULL), width_mm, is_default, is_active, role CHECK ('kitchen'|'bar'|'receipt')`. Índice único parcial `(business_id, role) where role in ('kitchen','bar')` (por eso el upsert de la página de impresoras usa SELECT→update/insert).
- `orders.taken_by` = **user id** (ver 2.1). Anótalo: D-14 (atribución) se implementa con `auth.users.id`, no `employees.id`.

---

## 3. PASO 0 (obligatorio — reportar con la plantilla 0.2 del plan y ESPERAR OK)

Investiga y reporta **con archivo:línea o nombre de RPC** cada punto. No codees nada hasta el OK.

1. **Uso real de `table_tabs` en el handheld.** Busca en `mobile/` todas las referencias a `open_tab_on_table`, `table_tabs`, `tab_id`, `tab_amount_due`, `settle_tab_payment`, `attach_order_to_tab`, `markTabPaid`. Para cada pantalla del POS (PosTableHub, PosOrderScreen, PosCheckoutScreen, PosSplitScreen, y cualquier otra bajo `PosNavigator`) indica: ¿crea/lee cuentas (`table_tabs`)? ¿las órdenes que crea llevan `tab_id`? ¿el cobro escribe `pos_payments` (por `table_id`) o `tab_payments` (por `tab_id`) o ambos? **Concluye con una de dos frases literales:** «**El handheld opera por `table_id`; `table_tabs` no participa en el flujo actual**» o «**El handheld usa `table_tabs` en: …**». Esto decide la Variante (sección 4).
2. **Cómo se "cierra" hoy una mesa.** ¿Qué acción deja `state='libre'`? Confirma que es «todas las órdenes abiertas quedan con `paid_at` o `canceled_at`» (por `pos_apply_payment` / `pos_void_order` / split), y si existe algún botón explícito de "liberar mesa" o "cerrar mesa" sin órdenes. Reporta el RPC exacto que marca `paid_at` en el cobro completo.
3. **Pantalla de detalle de mesa.** Ruta del archivo (esperado `mobile/screens/pos/PosTableHub.tsx` o similar), cómo recibe `tableId`/`tableLabel` (route.params), qué RPCs llama al montar, y dónde encajaría el bloque "Código de mesa" (encima de la lista de órdenes, debajo del header — propón).
4. **Grilla de mesas.** Archivo y cómo pinta `state`/`assignment` de `pos_tables_overview`. Reporta si es viable agregar un campo más al `return table` de `pos_tables_overview` sin romper el tipado móvil (`mobile/services/pos.ts` → tipo del overview).
5. **Ticket ESC/POS.** Confirma en `escpos.ts` las utilidades disponibles para: alinear al centro, negrita, **doble alto/doble ancho** (GS ! n), separador, `feedLines`, corte (GS V). Reporta cómo se calcula el ancho de columnas por `width_mm` (58→32 / 80→48) y cómo se tratan `ñ` y tildes hoy (¿se transliteran? ¿se mandan en PC437?). Si `buildReceiptEscPos` ya tiene un helper de "línea centrada" reutilizable, indícalo.
6. **Página de impresoras web.** `web/app/dashboard/configuration/printers/page.tsx`: confirma que hoy solo permite `role` `kitchen|bar|receipt` y reporta el cambio mínimo para permitir `waiter` en la sección B (CRUD de recibos) — **solo si es trivial**; si no, queda para F7.
7. **`pos_combine_tables` / `pos_uncombine_table` / `auto_uncombine_on_tab_close`.** Lee sus cuerpos (BD) y reporta qué hacen con las mesas secundarias. Necesitamos decidir qué pasa con el código de una mesa **secundaria** al combinar (regla propuesta en 5.3).
8. **Diferencias** entre este documento y el código/BD real. Si `fetchAnyPrinter` se usa en pantallas de cobro para el recibo, **no lo cambies en F2** (solo anótalo: F7 lo alineará al selector por rol).

---

## 4. Decisión de modelo de datos (la toma Planning en el checkpoint con tu evidencia del punto 3.1)

### Variante T — "sesión de mesa" (esperada si el handheld opera por `table_id`)
El código vive en **`tables`** y su ciclo de vida es la **ocupación** de la mesa. Es la variante **preferida** porque calza exactamente con `pos_tables_overview.state` y con cómo se cobra hoy.

```sql
-- 160_table_access_code.sql — Variante T
begin;

alter table public.tables
  add column if not exists access_code text,
  add column if not exists session_opened_at timestamptz,
  add column if not exists session_opened_by uuid;

alter table public.tables
  drop constraint if exists tables_access_code_chk;
alter table public.tables
  add constraint tables_access_code_chk
  check (access_code is null or access_code ~ '^[0-9]{6}$');

-- Un código no se repite entre mesas con sesión abierta del mismo negocio
create unique index if not exists tables_open_access_code_uidx
  on public.tables (business_id, access_code)
  where access_code is not null;

comment on column public.tables.access_code is
  'Código de mesa (6 dígitos) de la sesión de ocupación actual. NULL cuando la mesa está libre. Nace al abrir la sesión (primera orden o botón), muere al cerrarla. D-02.';
comment on column public.tables.session_opened_at is
  'Instante en que se abrió la sesión de ocupación actual (primera orden o botón "Código de mesa"). NULL = libre.';

-- Generador: 6 dígitos criptográficamente aleatorios, único entre mesas con sesión abierta del negocio
create or replace function public.generate_table_access_code(_business_id uuid)
returns text language plpgsql security definer set search_path to '' as $$
declare v_code text; v_tries int := 0;
begin
  loop
    v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
    exit when not exists (
      select 1 from public.tables t
      where t.business_id = _business_id and t.access_code = v_code
    );
    v_tries := v_tries + 1;
    if v_tries > 50 then raise exception 'ACCESS_CODE_EXHAUSTED'; end if;
  end loop;
  return v_code;
end $$;
revoke all on function public.generate_table_access_code(uuid) from public, anon, authenticated;

-- Abrir sesión de mesa (idempotente): si ya está abierta devuelve el código existente
create or replace function public.pos_open_table_session(p_business_id uuid, p_table_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); v_code text; v_opened timestamptz; v_biz uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not (public.pos_can_access(p_business_id)
          or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid)) then
    raise exception 'NOT_ALLOWED';
  end if;
  select t.business_id into v_biz from public.tables t
  where t.id = p_table_id and t.business_id = p_business_id and t.is_active = true;
  if v_biz is null then raise exception 'TABLE_NOT_FOUND'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));

  select t.access_code, t.session_opened_at into v_code, v_opened
  from public.tables t where t.id = p_table_id;

  if v_code is null then
    v_code := public.generate_table_access_code(p_business_id);
    update public.tables
      set access_code = v_code, session_opened_at = now(), session_opened_by = v_uid
      where id = p_table_id;
    v_opened := now();
  end if;

  return jsonb_build_object('table_id', p_table_id, 'access_code', v_code,
                            'session_opened_at', v_opened, 'created', (v_opened = now()));
end $$;
revoke all on function public.pos_open_table_session(uuid, uuid) from public, anon;
grant execute on function public.pos_open_table_session(uuid, uuid) to authenticated;

-- Cerrar sesión SIN órdenes (el grupo se fue sin consumir): solo si no hay órdenes abiertas
create or replace function public.pos_close_table_session(p_business_id uuid, p_table_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not (public.pos_can_access(p_business_id)
          or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid)) then
    raise exception 'NOT_ALLOWED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));
  if exists (select 1 from public.orders o
             where o.table_id = p_table_id and o.business_id = p_business_id
               and o.paid_at is null and o.canceled_at is null) then
    raise exception 'TABLE_HAS_OPEN_ORDERS';
  end if;
  update public.tables
    set access_code = null, session_opened_at = null, session_opened_by = null
    where id = p_table_id and business_id = p_business_id;
  return jsonb_build_object('closed', true);
end $$;
revoke all on function public.pos_close_table_session(uuid, uuid) from public, anon;
grant execute on function public.pos_close_table_session(uuid, uuid) to authenticated;

-- Cierre automático: cuando la ÚLTIMA orden abierta de la mesa se paga o cancela → la mesa vuelve a libre
create or replace function public.trg_fn_table_session_autoclose()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  -- Solo nos interesa la transición a "cerrada" (paid_at o canceled_at pasa de null a no-null)
  if (new.paid_at is not null and old.paid_at is null)
     or (new.canceled_at is not null and old.canceled_at is null) then
    if new.table_id is not null and not exists (
      select 1 from public.orders o
      where o.table_id = new.table_id and o.id <> new.id
        and o.paid_at is null and o.canceled_at is null
    ) then
      update public.tables
        set access_code = null, session_opened_at = null, session_opened_by = null
        where id = new.table_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_table_session_autoclose on public.orders;
create trigger trg_table_session_autoclose
  after update of paid_at, canceled_at on public.orders
  for each row execute function public.trg_fn_table_session_autoclose();

-- Apertura automática por primera orden: extender pos_create_order SIN cambiar su firma.
-- Sustituir en el cuerpo, justo después de validar p_table_id, por:
--   if p_table_id is not null then
--     perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));
--     update public.tables t
--        set access_code = coalesce(t.access_code, public.generate_table_access_code(p_business_id)),
--            session_opened_at = coalesce(t.session_opened_at, now()),
--            session_opened_by = coalesce(t.session_opened_by, v_uid)
--      where t.id = p_table_id;
--   end if;
-- (Copia el cuerpo COMPLETO real de pos_create_order desde la BD — no desde el repo — y aplica solo ese inserto.)

commit;
```

**Además, en Variante T:**
- `pos_tables_overview`: `state = 'ocupada'` también cuando `t.session_opened_at is not null` (mesa con código generado pero aún sin órdenes). Agregar al `return table` **un campo nuevo al final**: `has_access_code boolean` (**no** devolver el código en la grilla; solo en el detalle). Tipado móvil: extender el tipo del overview con el campo opcional.
- **Nueva RPC de detalle:** `pos_table_session(p_business_id uuid, p_table_id uuid) returns jsonb {access_code, session_opened_at, session_opened_by, open_total_cents, open_orders_count}` — `security definer`, exige `pos_can_access` **o dueño**, y además (`is_waiter_of_table(p_table_id)` **o** `owns_business_of_table(p_table_id)` **o** mesa sin meseros asignados). **Único lugar que devuelve `access_code`.** `revoke … from public, anon; grant execute to authenticated`.
- **RLS/grants:** confirmar que `authenticated` **no** tiene UPDATE por columna sobre `tables.access_code/session_opened_at/session_opened_by` (si hay allow-list de UPDATE en `tables`, **no** agregarlas) y que el `select` público de `tables` (menú/QR) **no** expone `access_code`: si alguna policy o vista pública selecciona `tables.*`, reportarlo y proponer una vista/`select` de columnas explícitas. `resolve_table_qr` ya devuelve solo `table_label/business_slug/room_qr_token` — no tocar.

### Variante A — "cuenta" (`table_tabs`), solo si el Paso 0 demuestra que el handheld ya usa `table_tabs` de forma consistente
Es la del plan maestro (MIG-B.1/B.2): `table_tabs.access_code`, `generate_tab_access_code`, `open_tab_on_table` extendido, `pos_ensure_tab_for_table`, `pos_table_open_tabs`. Si aplica, Planning te dará el OK con "Variante A" y usarás ese SQL del plan maestro tal cual. **No implementes las dos.**

> En ambas variantes la **UX** (sección 5) es idéntica; solo cambia de dónde sale el código.

---

## 5. UX del handheld (Variante T; para A cambia solo la fuente de datos)

### 5.1 Grilla de mesas
- Mesa con `has_access_code = true` muestra un **pequeño ícono de llave/candado** junto al estado (no el código). Tokens/estilos del tema POS existente. Sin cambiar el layout de la tarjeta.

### 5.2 Detalle de mesa (PosTableHub)
Bloque **"Código de mesa"** arriba de la lista de órdenes:

- **Mesa libre (sin sesión):** tarjeta con texto "Sin código — la mesa está libre" y botón **"Abrir mesa y generar código"** → `pos_open_table_session` → refresca. (Esto también deja la mesa `ocupada` en la grilla, D-02 disparador a.)
- **Mesa con sesión:** el código en **grande, monoespaciado, agrupado `123 456`**, hora de apertura ("desde 19:42"), y tres botones: **Copiar** (portapapeles), **Imprimir** (abre el selector 5.4), **Ver instrucciones** (hoja con el texto que va en el ticket, por si el mesero lo lee en voz alta).
- Si la mesa tiene sesión pero **cero órdenes abiertas**, mostrar además **"Liberar mesa"** → confirmación → `pos_close_table_session`. (Si tiene órdenes, ese botón **no** aparece: la mesa se libera sola al cobrar todo.)
- **Nunca** mostrar el código en la grilla, en notificaciones ni en logs.

### 5.3 Mesas combinadas
- Regla propuesta (confírmala en Paso 0 punto 7): al **combinar**, la mesa **secundaria** se libera de sesión (`access_code/session_* = null`) y la **primaria** conserva la suya (o la abre si no tenía). El ticket y el detalle muestran el código de la primaria. Al **descombinar**, la secundaria vuelve a libre sin código. Implementar dentro de `pos_combine_tables`/`pos_uncombine_table` **solo si** su cuerpo actual ya toca `tables` (mínimo cambio); si no, en F2 basta con que el trigger de autocierre y `pos_close_table_session` funcionen y anotas la deuda.

### 5.4 Selector de impresoras (nuevo componente reutilizable, lo usará F6/F7)
- `mobile/services/printer.ts` → nueva función **`fetchStaffPrinters(businessId): Promise<NetworkPrinter[]>`** = `pos_printers` con `connection='network' and is_active = true and role in ('receipt','waiter')`, ordenadas por `is_default desc, label`. **Nunca** `kitchen`/`bar`. Añade un **guard defensivo** en la función de envío del ticket del código: si la impresora elegida tiene `role in ('kitchen','bar')`, lanzar `Error('PRINTER_ROLE_FORBIDDEN')` (esto protege también a F7).
- Componente **`PrinterPickerSheet`**: lista `fetchStaffPrinters`; si hay **una**, imprime directo sin abrir la hoja; si hay **varias**, elige; si **ninguna**, mensaje "Configura una impresora de recibos en el dashboard (Configuración → Impresoras)". Recuerda la última usada por `businessId` en `AsyncStorage['tabpos.lastStaffPrinter']`.

### 5.5 Ticket del código (ESC/POS, 58/80 mm)
`mobile/services/escpos.ts` → **`buildTableCodeTicketEscPos(opts: { businessName: string; tableLabel: string; code: string; widthMm: 58 | 80; serverName: string | null; openedAt: Date; instructionsLines: string[] }): Uint8Array`**

Layout (ancho 32 col en 58 mm, 48 col en 80 mm; usa los helpers de centrado/negrita/tamaño de `escpos.ts`):

```
        {BUSINESS NAME}         (negrita, centrado)
          Mesa: {label}         (centrado)
--------------------------------
        CODIGO DE MESA          (negrita, centrado)

           123 456              (GS ! 0x11 = doble alto + doble ancho, centrado)

--------------------------------
Escanea el QR de tu mesa y
escribe este codigo para
agregar tus pedidos a la cuenta
--------------------------------
Mesero: {serverName}     19:42  (si serverName es null, omitir esa parte)
{feedLines(5)} {GS V corte}
```
- Texto sin tildes ni `ñ` en el ticket si el builder actual no las soporta (Paso 0 punto 5 decide; si soporta PC858/CP437 con acentos, úsalos). Las líneas de instrucción vienen de i18n del móvil (`pos.tableCode.ticketLine1..3`) ya transliteradas/ASCII-safe.
- El código se imprime **una sola vez por ticket**, centrado, con una línea en blanco arriba y abajo. Probar que en 58 mm no se corta.

### 5.6 Estados de error
- Sin permiso (`NOT_ALLOWED`): "No tienes acceso al POS de este negocio".
- Impresora apagada/IP incorrecta (error de `printToNetwork`): mostrar el mensaje del error y botón **Reintentar**. La sesión y el código **no** cambian por un fallo de impresión.
- `TABLE_HAS_OPEN_ORDERS` al liberar: "La mesa tiene consumo abierto; cobra o anula antes de liberar".

### 5.7 i18n (móvil)
Namespace `pos` (el que usa el POS hoy): `pos.tableCode.title`, `.empty`, `.openAndGenerate`, `.since`, `.copy`, `.copied`, `.print`, `.instructions`, `.release`, `.releaseConfirm`, `.releaseBlocked`, `.noPrinter`, `.pickPrinter`, `.ticketLine1/2/3`, `.printFailed`, `.retry`. EN/ES con conteo idéntico.

---

## 6. Web (mínimo en F2)
- `TableDetailPanel` (dashboard `/dashboard/tables`): mostrar el código de la mesa cuando tenga sesión, llamando **`pos_table_session`** (el dueño pasa por `or owner`). Solo lectura; sin botón de imprimir en web.
- `/dashboard/configuration/printers`: permitir `role='waiter'` en la sección B **solo si** el Paso 0 punto 6 lo reporta trivial; si no, F7.
- i18n `dashboardCommon`: `tablesAccessCodeLabel`, `tablesAccessCodeNone`.

---

## 7. PROHIBIDO en F2 (además del PROHIBIDO global)
1. Devolver `access_code` por cualquier ruta **anon**, por la grilla (`pos_tables_overview`), por RLS/select directo de `tables`, o incluirlo en `notifications`/logs.
2. Usar `fetchAnyPrinter`/`fetchDefaultPrinter`/`fetchPrinterByRole` para imprimir el código. Imprimir en `kitchen`/`bar` bajo ninguna ruta.
3. Cambiar la **firma** de `pos_create_order`, `pos_tables_overview` (solo **añadir** un campo al final) o de cualquier RPC `pos_*`.
4. Tocar el menú público, `/t/[token]`, `resolve_table_qr`, checkout, Stripe, `settle_tab_payment`, `pos_apply_payment`, `pos_void_order`.
5. Implementar las dos variantes, o elegir variante antes del OK.
6. Escribir el cuerpo de `pos_create_order` desde el repo: el repo **no** tiene la versión real (series POS de agosto no versionadas). **Copia el cuerpo desde la BD** (`select pg_get_functiondef(...)` con el MCP de solo lectura que ya usaste en F1) y aplica únicamente el inserto indicado.
7. Regenerar `database.types.ts` completo (añade a mano lo nuevo, como en F1).
8. Instalar dependencias nuevas (F2 no las necesita: portapapeles con `expo-clipboard` **solo si ya está instalado**; si no, usa `Clipboard` de RN o reporta).

---

## 8. Criterios de aceptación (verificables)

**Base de datos (Planning verifica por SQL tras aplicar 160):**
- [ ] `tables.access_code`, `session_opened_at`, `session_opened_by` existen; CHECK de 6 dígitos; índice único parcial.
- [ ] `pos_open_table_session` en mesa libre → devuelve código de 6 dígitos y `created=true`; llamada repetida → **mismo** código y `created=false`.
- [ ] `pos_create_order` en mesa libre → la mesa queda con `access_code` no nulo (sin pasar por el botón).
- [ ] Al pagar/anular la **última** orden abierta de la mesa → `access_code` y `session_*` vuelven a `null` (trigger). Pagar una orden cuando quedan otras abiertas → **no** se limpia.
- [ ] Nueva sesión en la misma mesa → código **distinto** al anterior.
- [ ] `select access_code from tables` como `anon` → sin permiso o columna no expuesta; `resolve_table_qr` no lo devuelve.
- [ ] `pos_table_session` falla con `NOT_ALLOWED` para un usuario sin `pos_access` que no es dueño.

**Handheld (Juan prueba en Metro/APK):**
- [ ] Mesa libre → botón "Abrir mesa y generar código" → aparece el código y la grilla marca la mesa como ocupada con ícono.
- [ ] Tomar una orden en una mesa libre → al entrar al detalle ya hay código (sin tocar el botón).
- [ ] "Imprimir" con una sola impresora de recibos → imprime sin preguntar; con dos → elige; con la de cocina como única → **no** la lista y muestra el aviso.
- [ ] Reimprimir 3 veces → mismo código, ticket legible en 58 mm y en 80 mm (código en doble tamaño, centrado, sin cortes).
- [ ] Cobrar toda la mesa → al volver al detalle, "Sin código — la mesa está libre"; abrir de nuevo → código nuevo.
- [ ] "Liberar mesa" solo visible sin órdenes abiertas; con órdenes, no aparece.

**Calidad:**
- [ ] `cd web && npx tsc --noEmit && npm run build` verdes; `cd mobile && npx tsc --noEmit` sin errores **nuevos** (el de `app.config.ts:55` es preexistente — repórtalo igual).
- [ ] EN/ES paridad (web y móvil). Sin variables locales `t` en componentes con `useTranslations`.
- [ ] Entrega con plantilla 0.3: SHA, `git log -1`, `git status`, `git diff --stat`, archivo `160_table_access_code.sql` incluido.

---

## 9. Entrega y siguiente paso
1. Paso 0 (sección 3) → **OK de Planning** con la variante elegida.
2. Codificar, verde, commit, push, entrega (0.3).
3. Planning: `get_commit` (push real) → auditoría del diff → aplica `160` por MCP → verificación SQL de los criterios de BD.
4. Juan: prueba en handheld (Metro conectado o APK nuevo — **el APK instalado tiene JS congelado**) → merge `--ff-only` → F3.

**Fin del spec F2.**
