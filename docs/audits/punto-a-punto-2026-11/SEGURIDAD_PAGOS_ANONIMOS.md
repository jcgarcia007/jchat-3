# SEGURIDAD — funciones de pago anónimas (`guest-tab`, `guest-pay`, `tab-pay`)

Revisión de **solo lectura** del código en `origin/main` @ `ae3e2858` (leído con `git show origin/main:<ruta>`; la rama de auditoría tiene commits propios). No se llamó a ninguna función de producción, no se escribió en la base y no se cambió código.

Archivos leídos: `supabase/functions/guest-tab/index.ts` (1607 líneas), `guest-pay/index.ts` (297), `tab-pay/index.ts` (157), y de `_shared`: `connect.ts`, `pricing.ts`, `venue.ts`, `guestPolicy.ts`, `supabaseAdmin.ts`, `safeEqual.ts`. Para saber qué hacen las llamadas `rpc(...)` también se leyó el SQL en `supabase/migrations/245_baseline.sql` y los manejadores `pos_guest` / `tab_settlement` de `stripe-webhook/index.ts`. Las migraciones que hay en el repo después del baseline (248, 250, 254–262, 264–275; faltan 247, 249, 251–253 y 263 en `supabase/migrations/`) no redefinen estas funciones SQL (comprobado buscando sus nombres); `248_security_hardening.sql` solo menciona los privilegios por defecto de tablas.

Límites: no hay pruebas en vivo (prohibido), así que todo lo que depende del entorno real (cabeceras que pone el proxy, datos de la base, privilegios efectivos en producción) está marcado **"a comprobar"**. Los números de línea son de `origin/main` @ `ae3e2858`.

---

## Resumen: lo que hay que mirar primero

### P0 y candidatos a P0 (regla de la instrucción: cobrar de más o de menos, ver datos ajenos o pagar la cuenta de otro)

| # | Hallazgo | Por qué entra aquí | Probabilidad de abuso |
|---|---|---|---|
| **H-092** | **`create_payment` con `split_kind:"even"` y `payment_id` reclama la parte de pago de CUALQUIER mesa de CUALQUIER local.** El código del servidor no comprueba que `payment_id` sea de la mesa/negocio de la sesión, y la función SQL `pos_guest_claim_share` tampoco. El PaymentIntent se crea hacia la cuenta Connect del local de la **sesión**, pero con `pos_payment_id` del pago **ajeno**; el webhook `pos_guest` aplica ese pago por el metadato. | Permite **pagar la cuenta de otro** y que el dinero llegue a **otro local**. | Baja: hace falta conocer un UUID de `pos_payments` ajeno. Se encontró un camino realista (ver abajo), no uno de enumeración. |
| **H-093** | `guest-pay` usa un **8 % inventado** (`TAX_FALLBACK`) cuando el local tiene `tax_rate` NULL; `payments` ya usa `effective_tax_rate` (negocio → tabla de estado → 0). | **Cobro de más** (o distinto del legal) de forma determinista, sin que nadie ataque. | No es un abuso: ocurre solo. Depende de cuántos locales tienen `tax_rate` NULL (**a comprobar** en datos; no se consultó la base). Propuesta: P1, sube a P0 si hay locales así. |
| **H-094** | El cobro de la cuenta de mesa del invitado (`guest-tab` → `create_payment`) **no incluye impuesto**: el importe sale de `pos_tab_total` (suma de `price × qty`) y las órdenes de mesa se guardan con `tax_cents = 0`. | **Cobro de menos** si el impuesto no va ya en el precio. Puede ser una decisión ("Variante T", spec F3) y el impuesto se resuelva fuera. | **Pregunta para Planning/Juan**: ¿se espera impuesto en este cobro? Propuesta: P1 hasta aclararlo. |

Cómo se llegaría a H-092: la lista de partes (`even_plan`) la devuelven `summary` y `create_payment` a **cualquier sesión de esa mesa** (`guest-tab/index.ts:1016-1029`), así que un invitado que ha estado en la mesa B conoce los `payment_id` de B. Si abre después una sesión en la mesa A (necesita el código de A, captcha y un dispositivo) y manda `{split_kind:"even", payment_id:<id de B>}`, se reclama la parte de B. Si el local A es del mismo atacante (o cómplice), paga con su tarjeta, A cobra el importe y la mesa B queda como pagada: B pierde ese ingreso. El importe del atacante vuelve a él, menos comisiones, salvo que A no sea suyo.

### Después, por orden de importancia

| ID | Severidad propuesta | Resumen |
|---|---|---|
| H-095 | P1 | `cancel_payment` no comprueba mesa ni sesión: cualquier sesión de invitado cancela (y **cancela el PaymentIntent en Stripe**) un pago `processing` de cualquier otra mesa; y si el cancel llega justo después del pago, deja la fila en `failed` con el dinero ya cobrado. |
| H-096 | P1 | Sin idempotencia ni exclusión: `due_cents` no resta lo que está en `processing`, y `create_payment` no tiene clave de idempotencia. Dos invitados (o dos pulsaciones) piden "pagar todo" a la vez → dos PaymentIntents por el total; si ambos se confirman, la mesa paga el doble y no hay reembolso automático. |
| H-097 | P2 | La propina se valida **después** de reservar el pago/la parte: `tip_cents > base` devuelve 422 pero deja la fila `processing` (y la parte "even" reclamada) 10 minutos. Un invitado puede bloquear todas las partes (≤20 llamadas) de forma repetida. |
| H-098 | P2 | `add_order` (con código): sin captcha, sin límite de pedidos, sin tope de `qty`, número de líneas ni largo de `special_instructions`; las órdenes entran a cocina como `preparing` y suben la cuenta de la mesa. |
| H-099 | P2 | Los límites y el bloqueo usan `device_id` (un UUID que elige el cliente) e IP (primer valor de `X-Forwarded-For`): cambiar el UUID o la cabecera los evita. El bloqueo de 30 días por dos strikes no frena a quien lo sabe. |
| H-100 | P2 | El `qr_token` de mesa tiene **32 bits** (8 hex tras `<slug>-table-`) y `order_status` lo confirma (404 / 200) **sin captcha ni límite**: se pueden enumerar tokens válidos. |
| H-105 | P2 | `settle_tab_payment` marca como pagadas **todas** las órdenes abiertas de la cuenta sin comparar con el importe cobrado: lo añadido tras crear el cobro se marca pagado sin cobrarse. |
| H-103 | P2 | `guest-pay`: si falla guardar el carrito (`pending_order_carts`), el cobro **sigue**: pedido pagado sin líneas. |
| H-108 | P2 | `ALTER DEFAULT PRIVILEGES … GRANT ALL ON FUNCTIONS TO anon` sigue activo (`245_baseline.sql:15791`); `248_security_hardening.sql` solo lo revoca para tablas. Cada función `SECURITY DEFINER` nueva es ejecutable por `anon` salvo `REVOKE` explícito. **A comprobar** en producción (fuera de las tres funciones, pero es la puerta que las rodea). |
| H-101, H-102, H-104, H-106, H-107 | P3 | Carrera en el límite de intentos, `idempotency_key` global, `guest-pay` sin tope/venue cerrado/etiqueta libre, errores que filtran detalles, validaciones de sesión/ítems incompletas, `hCaptcha` sin comprobar hostname. Detalle abajo. |

Lo que está bien (comprobado): importes de menú y modificadores calculados en servidor (`priceLinesFromDb` ignora precios del cliente y comprueba que el ítem sea del negocio); `guest-pay` y `tab-pay` usan siempre `buildConnectPiParams` (destination charge a la cuenta Connect del **local del pedido**, comisión del servidor); `businessChargeGate` en los tres; el token de sesión de invitado son 32 bytes aleatorios y solo se guarda el hash; el código de acceso nunca se devuelve; `tab-pay` usa clave de idempotencia de Stripe y reutiliza el PI al recargar; el código de seguimiento de `guest-pay` tiene 192 bits; el cobro de `pos_guest` se confirma contra Stripe (`confirm_payment` lee el PI en el servidor y el importe a aplicar sale de la fila, no del cliente); la coordenada del cliente no se copia a Stripe.

---

## Tabla por función

### `tab-pay` (`verify_jwt=false`) — cobro de cuenta por QR del mesero

| Acción | Entrada | Autorización | Riesgo | Archivo:línea |
|---|---|---|---|---|
| `create_tab_payment_intent` | `pay_token` (string, `trim`, sin límite de largo) | Solo el token opaco: `<slug ≤16>-pay-<20 hex>` = 80 bits de entropía (`245_baseline.sql:1377-1394`). Acepta solo `tab_payments` con `method='card'` y `status='pending'` | **Bajo.** Importe = `amount_cents + tip_cents` de la fila (servidor); PI al Connect del `business_id` de la fila con `businessChargeGate`; `idempotencyKey: tabpi:<token>`; si ya hay `stripe_pi_id` devuelve el mismo `client_secret`. Sin límite de intentos (cada llamada consulta Stripe). Respuestas distintas para "no existe" 404 / "no es tarjeta" 400 / "no pendiente" 409 (oráculo inofensivo con 80 bits). Importe < 50 ¢ → error de Stripe → 500 genérico. La liquidación posterior no compara importes (H-105). Si el mesero cancela o cobra en efectivo después de crear el PI, el PI sigue pagable desde la página ya abierta (doble cobro posible, a comprobar en la parte del mesero). | `tab-pay/index.ts:57-132`, `:58-59` (entrada), `:65-73` (token/estado), `:101` (importe), `:112-121` (PI), `:125-129` (guardar PI) |
| (OPTIONS / métodos) | — | — | CORS `*` (sin cookies: aceptable). `Unknown action` devuelve el valor recibido (eco de texto en JSON, no HTML). | `:41-45`, `:134-156` |

`service_role`: `createAdminClient()` (`_shared/supabaseAdmin.ts:26-33`) para leer `tab_payments` y `businesses`. Los ids que usa vienen **de la fila encontrada por el token** (`pay.business_id`, `pay.id`), no del cliente: correcto.

### `guest-pay` (`verify_jwt=false`) — pago de invitado desde el menú

| Acción | Entrada | Autorización | Riesgo | Archivo:línea |
|---|---|---|---|---|
| `create_guest_payment` | `captcha_token` (string), `contact_name` (≤60, recortado), `contact_email` (≤120, regex simple), `device_id` (`^[A-Za-z0-9_-]{8,64}$` o se ignora), `order.business_id` (string sin validar como UUID), `order.order_type` (`table`/`counter`/`gift`, otro → `counter`), `order.table_label` (≤40, libre), `order.table_qr_token` (string), `order.lat/lng` (finitos o NULL), `order.items[]` (`menu_item_id` string, `qty` entero ≥ 1, `options` objeto libre, `special_instructions` string **sin límite**) | hCaptcha verificado en servidor (falla cerrado si falta `HCAPTCHA_SECRET`); `venueOrderCheck` (la coordenada la manda el cliente; la regla de oro es del servidor sobre ese dato); si hay `table_qr_token` y es de **otro** negocio → 400 "La mesa no pertenece"; si no existe/inactivo → **sigue sin mesa** | **(a)** Impuesto: `tax_rate` del negocio o 8 % fijo (H-093). **(b)** Sin tope de `qty`, de líneas ni de largo de `special_instructions` (H-104): un `qty` enorme da un total que Stripe rechaza (500) o un pedido enorme. **(c)** `table_label` es texto del cliente sin relación con el token (H-104); un token inexistente degrada a "pedido de mesa sin mesa". **(d)** No llama a `venueIsClosed` (sí lo hace `payments:259`). **(e)** Sin clave de idempotencia al crear el PI: cada llamada crea un PI y un carrito (cada una necesita captcha). **(f)** Si falla guardar el carrito, responde 200 con el cobro posible (H-103). **(g)** `contact_email` se pasa como `receipt_email`: Stripe puede enviar un recibo a una dirección ajena (envío de correo con la marca del local; con captcha, volumen bajo). **(h)** Error 500 devuelve `DB error: <mensaje de Postgres>` (H-106). **(i)** `x-forwarded-for` primer valor como `remoteip` de hCaptcha (solo informativo). Importe = servidor (`subtotal + tax`, sin propina), PI al Connect del negocio del pedido: correcto. | `guest-pay/index.ts:103-272`; entrada `:105-159`; captcha `:66-89`; gate `:165-168`; negocio `:172-182`; mesa `:186-202`; precio `:205-212`; PI `:234-242`; carrito `:246-262` |

`service_role`: lee `businesses`, `tables`, `menu_items`, `modifier_groups`; escribe `pending_order_carts`. `business_id` lo manda el cliente, pero toda lectura posterior se cruza con él (`priceLinesFromDb` exige `row.business_id === businessId`, `pricing.ts:243`; la mesa exige `tableRow.business_id === businessId`, `:197`) y el dinero va a la cuenta Connect de **ese** negocio, que es el que figura en el pedido: coherente.

### `guest-tab` (`verify_jwt=false`) — sesión de invitado, pedidos a la cuenta y pago

Autorización: **S** = `session_token` (32 bytes, hash en BD, 8 h, `guest_tab_session_validate` exige no revocada, no vencida, mesa activa y `session_opened_at` igual al de la sesión de mesa, `245_baseline.sql:2137-2152`); **Q** = `table_qr_token` (32 bits, ver H-100); **C** = captcha.

| Acción | Entrada | Autorización | Riesgo | Archivo:línea |
|---|---|---|---|---|
| `create_session` | `table_qr_token`, `access_code` (`^\d{6}$`), `device_id` (UUID v4), `fingerprint` (8–128), `captcha_token` | Q + código de 6 dígitos + C. Límites tras captcha: 5 intentos/5 min por `device_id`, 10/10 min por mesa, 20/10 min por `ip_hash` (`guestPolicy.ts:7-14`) | Fuerza bruta del código: 1 M de combinaciones, 10 intentos/10 min por mesa → cuesta ~1 captcha por intento y solo hay unas horas de vida del código: **resiste**. Pero: el límite por mesa deja a un tercero con el QR (visible en la mesa) **bloquear a los clientes de esa mesa** gastando 10 intentos (parte de H-099); límite por dispositivo/IP evitable (H-099); lectura de conteo y alta del intento no son atómicas (H-101); `TABLE_NOT_FOUND` 404 frente a `CODE_INVALID` 401 confirma tokens de mesa (H-100); si falla el `insert` del intento (`attempt` NULL) se sigue comparando el código sin registrar. El código se compara con `===` (sin tiempo constante; irrelevante con ese límite). No devuelve el código de acceso. | `:98-248`; validación `:108-117`; captcha `:121`; mesa `:127-134`; bloqueo `:140-153`; límites `:156-184`; comparación `:194-198`; sesión `:201-223` |
| `session_status` | `session_token` | S | Devuelve `table_label`, `pos_payment_mode`, `expires_at`. Sin datos de otros. | `:250-288` |
| `add_order` | `session_token`, `idempotency_key` (string libre, sin largo), `items[]` (`menu_item_id`, `qty` entero ≥1, `options`, `special_instructions` sin tipo ni largo), `contact_name` (≤60 solo si es string), `notes` (≤200) | S + bloqueo por `device_id` | **Sin captcha, sin límite de pedidos, sin tope de `qty`/líneas** (H-098). Precio de servidor correcto; `table_id`/`table_label`/`business_id` salen de la sesión, no del cliente (bien). `contact_name`/`notes` sin comprobar tipo (un número o un objeto da 500). `idempotency_key` global: si existe y es del mismo local, **devuelve el pedido de otra mesa/sesión** (ids, importes, nombres de ítems) a quien conozca la clave; si es de otro local, 400 distinto (oráculo) (H-102). Orden en `preparing` directa a cocina, sin impuesto (H-094). Sin descuento de inventario (D-27 conocido). Si la inserción de idempotencia falla por otra causa, el cliente puede reintentar y duplicar. | `:290-525`; precios `:386-399`; orden `:408-435`; ítems `:437-453`; idempotencia `:349-382`, `:456-503` |
| `add_order_no_code` | `table_qr_token`, `device_id`, `fingerprint`, `captcha_token`, `idempotency_key`, `items[]`, `contact_name`, `notes` | Q + C; solo si `pos_payment_mode='external'`; bloqueo por `device_id`; límite 3 pedidos/dispositivo/mesa/10 min | Cualquiera con la foto del QR de la mesa (no prueba presencia: no hay coordenadas) puede mandar pedidos `awaiting` al mesero; el límite es por `device_id` elegible por el cliente (H-099); sin tope de `qty`/líneas/largos. Entra como `status:'confirmed'` con `approval_status:'awaiting'` (pendiente de aprobación). Misma `idempotency_key` global (H-102). | `:531-788`; gate modo `:590-597`; límite `:617-631` |
| `order_status` | `session_token` **o** `table_qr_token` + `device_id` (sin validar formato) | S (sin pasar por `guest_tab_session_validate`: **no comprueba expiración ni revocación**) o Q + `device_id` | **Sin captcha ni límite**: `TABLE_NOT_FOUND` 404 frente a 200 enumera tokens válidos (H-100). Con Q + `device_id` solo se ven los pedidos con ese `device_id` y sin sesión, de las últimas 12 h: hace falta conocer el UUID del otro (inadivinable). Por sesión: solo los pedidos de esa sesión. Datos devueltos: nombre de ítems, cantidades, estado, motivo clasificado (no el literal). Sin PII. | `:794-906`; sesión `:810-822`; mesa `:825-831`; pedidos `:847-864` |
| `summary` | `session_token` | S | Devuelve **todos los ítems de la mesa** (de todos los invitados): `order_item_id`, `order_id`, nombre, cantidad, importe de línea, `reserved`, **`guest_session_id`** del dueño de cada pedido (ids de sesión, no el token), pagos exitosos (importe, propina, tipo, hora) y `even_plan` con los `payment_id` de las partes. Sin nombres ni correos. Los `order_item_id` y `payment_id` son lo que usan H-092 y H-095. | `:981-1040`; RPC `pos_guest_table_summary` `245_baseline.sql:4667-4687` |
| `create_payment` | `session_token`, `split_kind` (`full`/`even`/`items`/`amount`), `ways`, `payment_id`, `order_item_ids[]`, `amount_cents`, `tip_cents` | S + `pos_payment_mode='stripe'` + `businessChargeGate` | **H-092** (`payment_id` ajeno); **H-096** (sin idempotencia, `due_cents` no resta `processing`); **H-097** (propina validada tarde); **H-094** (sin impuesto); `items`: valida mesa/cancelada/pagada pero **no** `approval_status` ni sesión de mesa (H-107); `order_item_ids` sin tope ni formato; el escaneo de "reservados" lee **todos** los `pos_payments` `processing` del sistema sin filtrar negocio (rendimiento); importe `amount` entre 50 y `due_cents`; propina 0..base (cliente, correcto que la elija él). El PI va a `sess.stripeAccountId` (Connect del negocio de la sesión), importe `base + tip` calculado en servidor, comisión de `buildConnectPiParams`. Error de Stripe → se devuelve su mensaje tal cual (H-106). | `:1044-1318`; `even`+`payment_id` `:1136-1146`; `items` `:1176-1230`; propina `:1261-1268`; PI `:1274-1294`; saldo `:1076-1090` |
| `confirm_payment` | `session_token`, `pos_payment_id` | S; la fila debe ser `source='guest'` y de **la mesa de la sesión** | Bien acotado: lee el PI con `stripe_pi_id` guardado (no del cliente), aplica `pos_apply_payment` con la propina `pi.amount − fila.amount`, idempotente si ya `succeeded`. Respaldo por webhook `pos_guest`. No exige que la fila sea de **esa sesión** (basta la mesa): compañeros de mesa se confirman entre sí (aceptable). Un PI `succeeded` por un importe menor que `fila.amount` (no ocurre: lo crea el servidor) no se comprueba. | `:1322-1443` |
| `cancel_payment` | `session_token`, `pos_payment_id` | S, pero **no** compara mesa ni sesión con la fila; solo `source='guest'` | **H-095.** Cancela el PI en Stripe y libera la fila de cualquier mesa de cualquier local si se conoce el `pos_payment_id`. Carrera: si el PI ya es `succeeded` el `cancel` de Stripe falla (se ignora) pero la fila pasa a `failed`/`pending` y el dinero está cobrado (queda a merced del webhook: `handlePosGuestSucceeded` omite solo `succeeded`, así que la reaplica; a comprobar el resultado sobre una fila `pending` de "even"). Devuelve `ok:true` aunque la fila no exista (no hay oráculo). | `:1447-1497` |
| `request_service` | `table_qr_token` **o** (`business_id` UUID + `table_label` ≤20), `device_id` (UUID v4), `captcha_token`, `lat`, `lng` (números finitos), `notes` (≤200) | C; la base de datos decide ubicación, bloqueos, una llamada abierta por mesa (`guest_request_service[_by_label]`, solo `service_role`) | Correcto en el borde de la función. Las coordenadas las manda el cliente (diseño de la regla de oro: **un cliente remoto con GPS falso la salta**; es una limitación conocida del diseño, no se puede arreglar en el servidor sin otro factor). Errores mapeados sin filtrar SQL. | `:1520-1578` |

Despachador: `Deno.serve` **sin `try/catch` global** en `guest-tab` (a diferencia de `guest-pay` y `tab-pay`): un fallo no controlado (p. ej. `verifyCaptcha` sin `catch` cuando `siteverify` no responde JSON, `:66-77`) termina en el 500 genérico de la plataforma. CORS `*` en las tres funciones (sin cookies: aceptable). (`:1580-1607`)

---

## Hallazgos nuevos (detalle)

Los IDs son los siguientes libres de `HALLAZGOS.md` (H-092…H-108). Severidad = propuesta.

### H-092 · P0 (por la regla de la instrucción; probabilidad baja) — Reclamar la parte "even" de otra mesa u otro local
- **Dónde:** `guest-tab/index.ts:1136-1146` (llama a `pos_guest_claim_share` con un `payment_id` del cuerpo y luego lee `pos_payments.amount_cents` de esa fila con service_role, sin comprobar `table_id`/`business_id`), `:1285` (Connect de la sesión). SQL `245_baseline.sql:4615-4624`: `update … where id = p_payment_id and source='guest' and kind='guest_even' and (status='pending' or …)`; no recibe ni compara mesa/negocio.
- **Qué pasa:** el pago ajeno pasa a `processing` con `guest_session_id` del atacante; el PI se crea por el importe de **esa** fila hacia la cuenta Connect del **local de la sesión**, con `metadata.pos_payment_id = <pago ajeno>`; `handlePosGuestSucceeded` (`stripe-webhook/index.ts:148-211`) aplica el pago **solo por el metadato** (no compara el negocio del PI con el de la fila). `confirm_payment` sí lo rechazaría por mesa (`:1351`), pero el webhook es el respaldo y lo aplica igual.
- **Efecto:** la mesa B queda con una parte pagada (puede cerrarse la cuenta); el dinero llega al Connect de A. Y mientras el pago esté `processing`, la mesa B ve su parte reservada 10 minutos (griefing sin pagar).
- **Arreglo propuesto (no aplicado):** pasar `p_business_id`/`p_table_id` a `pos_guest_claim_share` y filtrar `where business_id = … and table_id = …`; y en el webhook comparar el negocio/Connect del PI con el de la fila antes de aplicar.

### H-093 · P1 (P0 si hay locales con `tax_rate` NULL) — Impuesto inventado del 8 % en `guest-pay`
- `guest-pay/index.ts:209`: `business.tax_rate != null ? Number(business.tax_rate) : TAX_FALLBACK` con `TAX_FALLBACK = 0.08` (`_shared/pricing.ts:23`, marcado `@deprecated`: "stays exported ONLY because guest-pay still imports it"). `payments` ya resuelve con `effective_tax_rate` (negocio → tabla del estado → 0, migración 184, `pricing.ts:32-42`).
- Efecto: un invitado de un local sin tasa propia paga 8 % aunque la tasa legal sea otra o 0. Mismo cobro distinto según use la app (`payments`) o la web de invitado (`guest-pay`).
- **A comprobar:** cuántos locales tienen `businesses.tax_rate` NULL (no se consultó la base).

### H-094 · P1 (a confirmar) — La cuenta de mesa del invitado se cobra sin impuesto
- `guest-tab` `create_payment` suma `pos_tab_total` = `Σ price_cents × qty` (`245_baseline.sql:5171-5180`) y `due_cents` sale de ahí; no hay línea de impuesto. Las órdenes se guardan con `tax_cents: 0` por la "Variante T" del spec F3 (`docs/TABPOS_F3_SPEC_…md:44-47`, `guest-tab/index.ts:423`).
- Efecto: si el local espera que el impuesto se cobre al pagar la cuenta, **se cobra de menos** (6 % en el local de pruebas). Si el impuesto va incluido en el precio de menú o lo gestiona el POS externo, no hay defecto.
- **Pregunta:** ¿es decisión de producto? El cobro por QR de la app (`payments`) y el de `guest-pay` sí añaden impuesto.

### H-095 · P1 — `cancel_payment` sin comprobar mesa ni sesión; cancela el PI en Stripe
- `guest-tab/index.ts:1447-1497`: solo `source === 'guest'`. A diferencia de `confirm_payment` (`:1351`), no compara `table_id` con la sesión ni `guest_session_id`.
- Efecto: con un `pos_payment_id` ajeno (visible a las sesiones de esa mesa, ver H-092) se cancela el PI y se libera la fila de otro cliente; con carrera, puede dejar `failed` un pago ya cobrado (ver tabla).
- Arreglo: comprobar `pay.table_id === sess.tableId` (y mejor `guest_session_id === sess.sessionId`), y no tocar filas cuyo PI ya sea `succeeded` (consultar su estado antes).

### H-096 · P1 — Doble cobro de la misma deuda
- `pos_table_balance` devuelve `due_cents` **sin restar** `guest_processing_cents` (`245_baseline.sql:5186-5225`); `create_payment` (`:1088`, `:1112-1132`, `:1233-1255`) no consulta si ya hay pagos `processing` ni usa clave de idempotencia (ni en BD ni en Stripe, `:1287`).
- Efecto realista: dos amigos pulsan "Pagar todo" a la vez, o una misma persona en dos pestañas → dos PIs por la deuda completa; si ambos se pagan, la mesa paga el doble. `pos_apply_payment` es idempotente por fila, pero no devuelve el segundo cobro. La interfaz puede ocultar el botón con `guest_processing_cents`, pero es del lado del cliente.
- Arreglo: reservar de forma atómica (restar `processing` en el saldo o bloquear con el `pg_advisory_xact_lock` de la mesa como hace `pos_apply_payment`), y `idempotencyKey` de Stripe por fila.

### H-097 · P2 — Propina validada después de reservar
- `guest-tab/index.ts:1261-1267`. En `full`/`amount`/`items` la fila `processing` ya existe; en `even` la parte ya está reclamada (`pos_guest_claim_share`). `tip_cents > base` devuelve 422 sin liberar.
- Efecto: bloqueo de 10 minutos por llamada (hasta 20 partes por mesa, repetible); filas `processing` huérfanas. Validar antes de insertar/reclamar resuelve el caso.

### H-098 · P2 — `add_order` sin captcha, sin límite ni topes
- `guest-tab/index.ts:290-525`. Quien tiene el código de la mesa (o la sesión de 8 h) puede crear pedidos ilimitados con `qty` arbitrario (entero ≥1), sin tope de líneas ni de `special_instructions` (sin comprobar tipo ni largo). Van a cocina como `preparing` y suben la cuenta de la mesa.
- Peor si el código se filtra o se comparte. Propuesta: tope por pedido (qty, líneas, largos), límite por sesión/mesa y comprobar tipos de `contact_name`/`notes`/`special_instructions`.

### H-099 · P2 — Límites y bloqueos sobre identificadores que elige el cliente
- `device_id` es un UUID v4 generado por el cliente (`:112`, `:549`); el bloqueo de dispositivo (`guest_device_blocks`, 30 días tras 2 strikes, `guestPolicy.ts:19-21`) y los límites por dispositivo (`:157-174`, `:617-631`) se saltan con otro UUID. `fingerprint` solo se guarda (`fingerprint_hash`), nunca se usa para limitar ni bloquear.
- `getClientIp` toma el **primer** valor de `x-forwarded-for` (`:79-85`); un proxy que **añade** (Cloudflare) deja pasar el valor del cliente: el límite por IP (20/10 min) se evita enviando la cabecera. `cf-connecting-ip` solo se usa si no hay XFF. **A comprobar** en el entorno real qué cabecera es fiable (no se puede probar).
- Lo único robusto es el límite por mesa (10/10 min) y el captcha. Propuesta: usar `cf-connecting-ip`/IP del conector como primera opción, limitar por mesa y por sesión, y tratar el bloqueo por dispositivo como señal, no como control.

### H-100 · P2 — `qr_token` de mesa de 32 bits y oráculo sin captcha
- `generate_table_qr_token` = `<nombre del local, 16>-table-<8 hex>` (`245_baseline.sql:1419-1439`) → 2³² valores por local (el prefijo es público). `order_status` con `table_qr_token + device_id` no pide captcha ni tiene límite y responde 404 distinto de 200 (`guest-tab/index.ts:825-831`).
- Efecto: se pueden descubrir tokens válidos de un local (con ~50 mesas, del orden de decenas de millones de peticiones). Con un token se puede enviar `add_order_no_code` (captcha) y `request_service` (captcha + ubicación). No da acceso a cuentas ni dinero por sí solo. El token de mesa es un identificador impreso, no un secreto fuerte: tratarlo así y limitar `order_status`.
- Nota: la RPC `get_table_order_status(p_token)` (ejecutable por `anon`, `245_baseline.sql:1608-1625`) devuelve lo mismo para token inexistente y para función desactivada (no es oráculo), pero con un token válido y `customer_status_enabled` devuelve **los ítems abiertos de toda la mesa** (nombre, cantidad, estado, estación; sin PII).

### H-101 · P3 — Carrera en el límite de intentos
- `:160-189`: se cuentan intentos, y recién después se inserta el nuevo. Peticiones en paralelo (cada una con su captcha) leen el mismo conteo. Efecto limitado por el coste del captcha.

### H-102 · P3 — `idempotency_key` global y de formato libre
- `:349-382`, `:634-666`, tabla `guest_order_idempotency`. La clave no se ata a sesión/mesa/dispositivo: otra sesión del mismo local que conozca (o repita) la clave recibe el pedido ajeno (order id, importes, nombres/cantidades). Una clave de otro local da otro error (oráculo de existencia). Propuesta: clave única por (sesión, clave) y UUID obligatorio.

### H-103 · P2 — `guest-pay` cobra aunque no se pueda guardar el carrito
- `guest-pay/index.ts:246-262` (el comentario lo reconoce): el webhook cae a los ítems del metadato, que en el flujo de invitado no existen → pedido pagado sin líneas. Propuesta: antes de devolver el `client_secret`, cancelar el PI y responder error si falla la inserción.

### H-104 · P3 — `guest-pay`: topes, etiqueta de mesa y local cerrado
- Sin tope de `qty`/líneas ni largo de `special_instructions` (`:147-159`); `table_label` libre del cliente aunque el pedido sea de mesa (`:141`, `:226-228`); `table_qr_token` inexistente se acepta sin mesa (`:195-196`); no comprueba local cerrado (`venueIsClosed`, que sí usa `payments` en `:259` y `:304`); `order_type:'gift'` se acepta a invitados (`:138`; el comportamiento posterior depende del webhook, a comprobar).

### H-105 · P2 — Liquidación de cobro del mesero sin comparar importes
- `settle_tab_payment` (`245_baseline.sql:6572-6620`) marca `paid_at` en **todas** las órdenes sin pagar de la cuenta cuando el webhook recibe `tab_settlement` (`stripe-webhook/index.ts:111-125`, `:729-740`), sin comparar con `tab_payments.amount_cents` ni con el importe del PI. `tab-pay` crea el PI con el importe fijado en la fila (`tab-pay/index.ts:101`).
- Efecto: una orden añadida a la cuenta entre la creación del cobro y el pago queda "pagada" sin cobrarse; un cobro parcial (si existiera) cierra toda la cuenta. **A comprobar** cómo crea el mesero las filas `tab_payments` (parte fuera de las tres funciones).

### H-106 · P3 — Errores que filtran detalles y captcha sin control de errores
- `guest-tab`: `STRIPE_ERROR` devuelve el mensaje de Stripe al anónimo (`:1293`, `:1387`); `guest-pay`/`tab-pay`: `DB error: <mensaje de Postgres>` (`guest-pay:177`, `tab-pay:70`, `:90`) y mensajes de `priceLinesFromDb` con ids de ítems (`pricing.ts:235-244`). `verifyCaptcha` de `guest-tab` no atrapa fallos de red/JSON (`:66-77`) y `guest-tab` no tiene `try/catch` global.
- Captcha: se verifica `success` pero no hostname ni sitekey (el token es de un solo uso y va ligado al secreto; riesgo bajo).

### H-107 · P3 — Validaciones incompletas de sesión e ítems
- `order_status` por sesión no pasa por `guest_tab_session_validate`: acepta sesiones vencidas o revocadas (`:810-822`). `create_payment` por ítems no excluye pedidos `awaiting` ni de sesiones de mesa anteriores (`:1184-1197`), no limita el número de ids ni valida el formato UUID; el escaneo de reservas lee todos los pagos `processing` del sistema (`:1199-1203`).

### H-108 · P2 (a comprobar) — Privilegios por defecto de funciones para `anon`
- `245_baseline.sql:15791`: `ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon"`; `248_security_hardening.sql:53-54` solo revoca `truncate/references/trigger` en **tablas**. Las funciones nuevas que cree `postgres` quedan ejecutables por `anon` salvo `REVOKE` explícito, y varias RPC que las funciones anónimas rodean son `SECURITY DEFINER`.
- Esto no es parte de las tres funciones, pero es la puerta de las RPC que se llaman con la clave pública. **A comprobar** en producción qué RPC `SECURITY DEFINER` son ejecutables por `anon` (consulta a `information_schema.role_routine_grants`, no hecha aquí).
- RPC anónimas que sí forman parte de estos flujos y se revisaron: `get_table_order_status` (ver H-100), `guest_order_view` (código ≥20 caracteres, 12 h, sin PII, `245_baseline.sql:2000-2024`), `guest_order_notify_staff` (límites por pedido, `:1963-1997`), `resolve_tab_payment` (devuelve nombre del local, mesa, nombre de la cuenta, importe, propina, estado solo si `pending`; token de 80 bits, `:6107-6118`), `get_public_receipt` (código de 128 bits; devuelve el nombre de quien cobró, últimos 4 de tarjeta y líneas; por diseño del recibo).

---

## Preguntas para Planning / Juan

1. **H-094:** ¿el cobro de la cuenta de mesa debe llevar impuesto? Si sí, falta calcularlo en `create_payment`/`pos_tab_total`.
2. **H-093:** ¿cuántos locales tienen `tax_rate` NULL? Si alguno, subir a P0 y pasar `guest-pay` a `effective_tax_rate` (como `payments`).
3. **H-092 / H-095:** ¿se aplican las comprobaciones de mesa/negocio en `pos_guest_claim_share` y `cancel_payment` aunque no haya enumeración de UUID conocida? (recomendado; el arreglo es pequeño).
4. **H-099 / H-100:** ¿se acepta que el bloqueo por dispositivo sea solo una señal, o se prefiere ligar a otro factor?

## Fuera de alcance / no hecho

- No se probó nada en vivo (prohibido): cabeceras del proxy (XFF), concurrencia real, datos de producción.
- No se revisó `stripe-webhook` más allá de los manejadores `pos_guest`, `tab_settlement` y la parte de pedidos de invitado que usan estas funciones.
- No se revisó la parte del mesero que crea `tab_payments` ni `pos_create_order`.
