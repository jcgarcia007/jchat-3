# JChat — Dispositivos de Pago (self-service) · Plan de programación

**Objetivo:** que cada dueño agregue sus lectores Stripe Terminal **solo, con instalación guiada**, desde su dashboard — sin asistencia del admin de JChat.

**Método:** fases chicas → Opus implementa → Planning Claude audita cada commit → Juan despliega EF y prueba. Dinero y claves SIEMPRE server-side.

---

## 0) Arquitectura (leer antes de codear)

Los lectores de Stripe Terminal se dividen en **familias con flujos de alta DISTINTOS**:

| Familia | Modelos | Cómo se agrega | Cómo cobra |
|---|---|---|---|
| **Bluetooth móvil** | Stripe Reader M2, WisePad 3 | NO se registra por API/página. Se empareja por Bluetooth **desde la app del mesero** al cobrar (ya funciona en JChat vía `usePosReader`). | SDK móvil (ya implementado) |
| **Inteligentes (WiFi/Ethernet)** | BBPOS WisePOS E, Stripe Reader S700, S710, T600 | **Registro server-side por código de emparejamiento**: el lector muestra un código (3 palabras) en su pantalla → el dueño lo escribe en el dashboard → `POST /v1/terminal/readers { registration_code, label, location }` en la **cuenta conectada**. | **Server-driven** (el servidor ordena `process_payment_intent` al lector) — **FASE 2** |
| **Tap to Pay** | iPhone / Android | Sin hardware; el teléfono es el lector. Requiere trabajo en el móvil (discovery `tapToPay`/`localMobile` del mismo SDK RN; iPhone requiere entitlement de Apple). | SDK móvil — **FASE 3** |
| **Verifone** | V660p, UX700, M425, P630 | Smart readers server-driven (mismo modelo de registro). | **v2+** — mostrar en catálogo como "Próximamente" |

**Decisiones de diseño:**
- **Stripe es la fuente de verdad** de los lectores registrados. NO crear tabla local `terminal_readers`; listar por API con `{ stripeAccount }`. (La Location ya se crea/reutiliza vía la acción `get_or_create_location` existente.)
- Todas las acciones nuevas viven en la **EF `terminal`** (misma EF del cobro), **gateadas por DUEÑO** (`business.owner_id === authUserId`, mismo patrón existente). No gate de plan (el cobro no es Pro-only). Claves server-side.
- La página es de **configuración del propietario**: `web/app/dashboard/devices/page.tsx` (+ entrada en la navegación del dashboard).
- **Alcance v1:** catálogo + guía por modelo + registro de smart readers + gestión (lista/estado/renombrar/quitar) + guía del M2/Bluetooth. **El cobro con smart readers (server-driven) es Fase 2** — dejar claro en el UI ("registrado; cobro desde el POS: próximamente" hasta la Fase 2).

**IMPORTANTE para Opus:** antes de codear cada fase, **verificar en la doc de Stripe** los shapes vigentes: `terminal.readers.create({ registration_code, label, location }, { stripeAccount })`, `readers.list`, `readers.update`, `readers.del`(o `cancel_action`/deregister vigente), y los `device_type` que devuelve la API (p. ej. `bbpos_wisepos_e`, `stripe_s700`, `bbpos_chipper2x`/M2, `verifone_P400`…). Reportar lo encontrado en el resumen.

---

## FASE 1 — EF `terminal`: acciones de gestión de lectores

Archivo: `supabase/functions/terminal/index.ts`. Reusar helpers existentes (auth, owner check, stripe client con `{ stripeAccount }`, y la lógica de `get_or_create_location`).

Nuevas acciones (todas: verificar dueño del negocio; errores colapsados sin filtrar detalles):

```ts
// ── Tipos de body ────────────────────────────────────────────────
// list_readers:    { business_id }
// register_reader: { business_id, registration_code, label }
// update_reader:   { business_id, reader_id, label }
// remove_reader:   { business_id, reader_id }

// ── list_readers ─────────────────────────────────────────────────
async function handleListReaders(businessId: string, authUserId: string) {
  const acct = await requireOwnerAccount(businessId, authUserId); // owner + stripe_account_id
  const readers = await stripe.terminal.readers.list(
    { limit: 100 },
    { stripeAccount: acct },
  );
  return json({
    ok: true,
    readers: readers.data.map((r) => ({
      id: r.id,
      label: r.label,
      device_type: r.device_type,     // ej. 'bbpos_wisepos_e' | 'stripe_s700' | ...
      status: r.status,               // 'online' | 'offline'
      serial_number: r.serial_number,
      location: typeof r.location === "string" ? r.location : r.location?.id,
    })),
  });
}

// ── register_reader (smart readers por código) ───────────────────
async function handleRegisterReader(body: RegisterBody, authUserId: string) {
  const acct = await requireOwnerAccount(body.business_id, authUserId);
  // Validar código: formato de emparejamiento de Stripe (palabras-con-guiones,
  // p.ej. "sepia-cerulean-orca"). Rechazar vacío/formato raro con bad_request.
  const code = (body.registration_code ?? "").trim().toLowerCase();
  if (!/^[a-z]+(-[a-z]+){1,3}$/.test(code)) return errorResponse("bad_request", 400);
  const label = (body.label ?? "").trim().slice(0, 60) || "Lector";
  const locationId = await getOrCreateLocationId(body.business_id, acct); // reusar lógica existente
  const reader = await stripe.terminal.readers.create(
    { registration_code: code, label, location: locationId },
    { stripeAccount: acct },
  );
  return json({ ok: true, reader: { id: reader.id, label: reader.label, device_type: reader.device_type, status: reader.status } });
}

// ── update_reader (renombrar) / remove_reader (quitar) ───────────
// update: stripe.terminal.readers.update(reader_id, { label }, { stripeAccount })
// remove: verificar el método vigente en la doc (readers.del / deregister) y usarlo.
// En ambos: validar que el reader pertenece a la location/cuenta del negocio (defensa extra:
// retrieve primero y comparar cuenta/location antes de mutar).
```

Errores esperables de `register_reader` que el UI debe mostrar bonito:
- código inválido/expirado (el lector regenera el código al reiniciar el flujo),
- lector ya registrado en otra cuenta,
- lector sin conexión.
Devolver `{ ok:false, error:"register_failed", detail }` con `detail` **redactado** (sin claves — reusar `redactCreds`).

**Entrega:** `deno check` limpio, commit + push, SHA. Planning Claude audita: gate de dueño, `{ stripeAccount }` en TODAS las llamadas, sin claves al cliente, validaciones.

---

## FASE 2 — Web: página "Dispositivos de pago" (`/dashboard/devices`)

Archivo nuevo: `web/app/dashboard/devices/page.tsx` (+ entrada de navegación "Dispositivos" con ícono de terminal en el menú del dashboard). Bilingüe ES/EN (llaves i18n nuevas). Patrón visual del dashboard existente.

**Estructura de la página:**

1. **Encabezado:** "Dispositivos de pago" + subtítulo ("Acepta pagos en persona con lectores compatibles con Stripe Terminal.").

2. **Mis lectores (lista):** al cargar, `invoke('terminal', { action:'list_readers', business_id })`.
   - Card por lector: label, modelo legible (mapear `device_type` → nombre comercial), serie, **badge de estado** (En línea 🟢 / Desconectado ⚪), menú ⋯ → Renombrar / Quitar (con confirmación).
   - Vacío: estado "Aún no tienes lectores registrados".
   - Los lectores **Bluetooth (M2) no aparecen aquí** (no se registran); ver nota en su guía.

3. **Agregar un dispositivo (catálogo):** cards por familia con foto/nombre/descripción corta:
   - **Stripe Reader M2** (móvil Bluetooth) → botón "Ver guía" → abre **guía** (no wizard de registro).
   - **BBPOS WisePOS E / Stripe Reader S700 / S710 / T600** (inteligentes) → botón "Agregar" → **wizard de registro** (abajo).
   - **Tap to Pay (iPhone/Android)** → "Ver requisitos" (guía; activación en la app — Fase 3).
   - **Verifone (V660p, UX700, M425, P630)** → "Próximamente".

4. **Wizard de registro (smart readers)** — modal de 4 pasos, con progreso:
   - **Paso 1 · Elige tu modelo** (cards con imagen). Guarda el modelo para textos específicos.
   - **Paso 2 · Enciende y conecta el lector a la red** — instrucciones por modelo (ej. WisePOS E: "Enciéndelo → en la pantalla del lector entra a Configuración → WiFi → conéctalo a la MISMA red de tu negocio"). Tip: la clave de configuración del lector suele ser `07139` (verificar en doc por modelo).
   - **Paso 3 · Ingresa el código de emparejamiento** — "En la pantalla del lector aparecerá un código de 3 palabras (ej.: `sepia-cerulean-orca`). Escríbelo aquí:" + input + campo "Nombre del lector" (ej. "Caja 1", "Barra"). Botón **Registrar** → `invoke('terminal', { action:'register_reader', ... })` con spinner y errores visibles (código inválido/expirado → "reinicia el flujo en el lector para generar uno nuevo").
   - **Paso 4 · ¡Listo!** — check verde, "Tu {modelo} '{label}' quedó registrado" + estado en línea + nota honesta: "El cobro desde el POS con este lector llega en una próxima actualización" (hasta Fase 3 del cobro).

5. **Guía del M2 (Bluetooth)** — modal informativo: "El M2 no se registra aquí: se conecta solo, por Bluetooth, desde la app del mesero. 1) Enciéndelo (luces de lado a lado). 2) Bluetooth activo en el teléfono. 3) Al tocar Cobrar, la app lo encuentra y conecta. La primera vez puede actualizar su software (2–5 min)."

**Entrega:** `next build` limpio, commit + push, SHA. Auditoría: llamadas correctas a la EF, errores visibles, sin lógica de dinero en el cliente.

---

## FASE 3 (posterior, NO en v1) — Cobrar con smart readers desde el POS

Para que el mesero cobre con un WisePOS E/S700 registrado:
- EF: acción `process_on_reader` → `POST /v1/terminal/readers/:id/process_payment_intent` (server-driven) con el PI creado por `create_tab_payment_intent`/`charge_split_check` (la propina en smart readers puede ir **on-reader** — tienen pantalla — vía Terminal Configuration con tipping; verificar en doc).
- POS móvil: en el checkout, si el negocio tiene smart readers en línea, selector "¿Dónde cobrar?" (Bluetooth M2 / lector X).
- Webhooks/polling del estado de la acción del reader.

## FASE 4 (posterior) — Tap to Pay
- iPhone: entitlement de Apple + `discoverReaders({ discoveryMethod:'tapToPay'/'localMobile' })` del mismo SDK RN; Android equivalente. Activación guiada desde la app.

---

## Checklist de auditoría (Planning Claude, por fase)
- [ ] Toda llamada a Stripe con `{ stripeAccount }` de la cuenta conectada del negocio.
- [ ] Gate de dueño en cada acción nueva (patrón `requireOwner` existente).
- [ ] Ninguna clave ni monto viaja del cliente; `redactCreds` en todo `detail`.
- [ ] `register_reader` valida formato del código y maneja código expirado.
- [ ] `remove_reader`/`update_reader` verifican pertenencia del reader a la cuenta antes de mutar.
- [ ] UI: errores visibles, spinners, estados vacíos, ES/EN.

## Preguntas abiertas (Juan decide antes de la Fase 2)
1. **Ubicación en el dashboard:** ¿página propia "Dispositivos" en el menú lateral, o sección dentro de Configuración? (Sugerencia: página propia — es un tema que el dueño visita al montar su negocio.)
2. **Alcance del catálogo v1:** ¿mostramos las 4 familias (con Verifone como "Próximamente") o solo M2 + inteligentes + Tap to Pay? (Sugerencia: las 4 — el catálogo completo educa y vende.)
3. **¿Quién puede gestionar lectores?** (Sugerencia: solo el DUEÑO del negocio; los empleados no.)
