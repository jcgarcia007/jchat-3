# Bloque 9 — Menú, pedidos y pagos del cliente (inventario de cumplimiento + pruebas)

Fecha: 2026-11-02 · main `9bd62175` (OTA vigente) · Evidencia: `screenshots/b09/` (sin commit).
Reglas: producción solo en lectura; no se pagó nada ni se creó pedido, reserva o regalo. Cuenta: **@test** (Android 35). Correos de cuentas de prueba no reproducidos.

## 1. Inventario de cobros en la app móvil (código y BD)
La app **no incluye ninguna librería de IAP / Play Billing** (`package.json`: solo `@stripe/stripe-react-native` 0.64.0, `@stripe/stripe-terminal-react-native` 0.0.1-beta.32 y los paquetes web de Stripe). Todo el dinero pasa por Stripe y siempre desde el servidor (`supabase/functions/payments`: `quote_order`, `create_payment_intent`, `create_setup_intent`, `gift_hold`, `create_waiter_order`, `create_tab_payment`).

| # | Flujo | Qué se compra | Bien o servicio | Proveedor | Archivos | Clasificación Apple 3.1.1/3.1.3 y Google Payments |
|---|---|---|---|---|---|---|
| 1 | **Pedido del menú** (mesa o mostrador), con **propina** opcional (10/15/20 % o personalizada) | Comida y bebida del local | **Físico**, se consume en el local | Stripe PaymentSheet (Stripe Connect hacia el local; comisión de plataforma 2,9 % + 30¢ configurable) | `screens/checkout/CheckoutScreen.tsx`, `services/stripe.ts:255-420`, `screens/menu/CartScreen.tsx`, función `payments` | **Permitido con Stripe** (bienes y servicios físicos consumidos fuera de la app; 3.1.3(e) / Play: bienes físicos) |
| 2 | **Regalo a otra persona** (`gift_offers`) | Platos/bebidas del menú de un local para otra persona; la tarjeta se **retiene** (captura manual) y solo se cobra si la otra persona acepta | **Físico** (se sirve en el local; crea un pedido, `order_id`) | Stripe (hold + captura) | `components/gift/GiftSheet.tsx`, `services/stripe.ts:511` (`holdGiftPayment`), `payments/gift_hold`, `gift-worker` | **Permitido con Stripe** (no es un regalo digital: el destinatario recibe un producto físico) |
| 3 | **Guardar tarjeta** | Nada (SetupIntent) | — | Stripe | `services/stripe.ts:426` (`saveCard`) | **Permitido** (no es una compra) |
| 4 | **Cobro en el local por el personal** (Modo Trabajo / POS) | Cuenta de la mesa, pickup, split | **Físico** | Stripe Terminal (lectores/Tap to Pay) y marcar pagado (efectivo) | `screens/settings/Pos*Screen.tsx`, `services/terminal.ts`, `services/pos.ts`, función `terminal` | **Permitido** (pago presencial de bienes físicos). Riesgo técnico distinto: SDK Terminal `0.0.1-beta.32`, permisos de Bluetooth/ubicación |
| 5 | **Pago de la cuenta por QR** (invitado) | Cuenta de mesa | **Físico** | Stripe en **página web** pública | funciones `guest-pay`, `guest-tab`, `tab-pay` (no es app móvil) | Fuera de la app; **permitido** |
| 6 | **Reservas** | Nada: solo una solicitud, **sin depósito** (búsqueda de `deposit`/`prepay` sin resultados; 7 filas) | — | — | `screens/reservations/ReservationScreen.tsx` | No hay cobro |
| 7 | **Puntos de lealtad** | Nada: se ganan y canjean por premios del local; **no se compran** | — | — | `services/loyalty.ts` | No es moneda comprada |
| 8 | **Super likes / mejoras / wallet / recargas / propinas a personas** | **No existen como cobro**: los super likes salen de un cupo (`match_super_quota`, 5) sin compra; no hay monedas, saldo ni recargas | — | — | — | No aplica |
| 9 | **Entradas / eventos de pago** | No implementado (la pantalla de eventos solo muestra portada y datos) | — | — | `screens/events/EventsScreen.tsx` | No aplica |
| 10 | **Suscripciones**: Verified **$1,99/mes**, Business **$49**; | Insignia "Verified" (beneficio **dentro** de la app → contenido digital) y acceso al panel web del negocio | **Digital** (Verified) / servicio B2B web (Business) | Stripe Checkout, solo vía función `subscriptions` | web: `web/app/pricing/page.tsx`, `web/app/dashboard/billing/page.tsx`; móvil: **`screens/settings/PricingScreen.tsx` (código muerto)** | **Verified en la app requeriría IAP/Play Billing**. Hoy **no se vende dentro de la app** (decisión 2026-10-14, comentario en `SettingsScreen.tsx:573`): ver 3 |

**Resultado:** ningún contenido digital se cobra con Stripe dentro de la app. **Sin P0.**

## 2. Tabla `gifts` y regalos (qué es exactamente)
- **`public.gifts`** (`id, from_user, to_user, room_id, type, amount_cents, message, created_at`) es una tabla **heredada**: **0 filas** en producción y `sendGift()` (`services/gifts.ts:82`) **no se llama desde ninguna pantalla** (el propio archivo tiene `TODO(Task 3.5)`). Solo se lee en `GiftsReceivedScreen` (lista vacía). No mueve dinero. (Tras la migración 255 sus columnas `from_user/to_user` aceptan NULL.)
- **El regalo real es `public.gift_offers`** (74 filas; estados `paid`, `declined`, `expired`, `cancelled`, `failed`): la persona **A elige platos del menú de un local para B**; la tarjeta de A solo se **retiene** (`gift_hold`, captura manual); si B **acepta**, se cobra, el dinero va al **local** (Stripe Connect, menos la comisión de la plataforma) y el pedido se prepara para B en el local; si B rechaza o caduca (`expires_at`) se libera la retención. Quien lo recibe **no recibe dinero ni crédito**: recibe un plato. Se compra **dentro de la app** (hoja `GiftSheet`) pero es un **bien físico**, por eso Stripe es válido.

## 3. ¿La app lleva a comprar el plan Pro u otra suscripción en la web?
- **Dentro de la app: no.** `PricingScreen` no está en ningún stack ni hay navegación a ella (búsqueda de referencias: ninguna); no hay filas de "Planes" en Ajustes; no hay `Linking.openURL` hacia `/pricing`, `/billing` ni `dashboard.*` (los únicos enlaces externos: menú del local, ayuda, privacidad/términos, mapas y tienda de apps).
- **Riesgo residual (P2, higiene):** el binario conserva `screens/settings/PricingScreen.tsx` (abre Stripe Checkout para "Verified $1.99/mes", `Linking.openURL(data.url)` en la línea 80) y los textos `i18n/locales/{es,en}/pricing.json` (`$1.99 / mes`). Aunque es inalcanzable, un análisis estático del paquete podría marcarlo como compra digital por fuera de IAP (3.1.1/3.1.3). **Propuesta:** eliminar el archivo y los textos hasta que vuelva con IAP/RevenueCat.
- **Web (fuera de la app):** `/pricing` y `/dashboard/billing` venden Verified y Business. Sin enlaces desde la app, el riesgo es bajo; si Juan decide enlazar desde la app, hay que revisar las reglas de enlaces externos de cada tienda. Se revisa en el Bloque 11.

## 4. Pruebas en la app (sin completar pagos)
| Elemento | Resultado |
|---|---|
| Menú del local (Bar XZX): categorías, búsqueda, platos con precio en **USD ($16.00, $13.00…)**, "Agregar al carrito" | OK (`android35-01`) |
| Detalle de producto: grupos de opciones **obligatorios** (Porción +$5.00, Tortilla, Salsa), extras con precio (+$2.00), instrucciones especiales, cantidad, "Agregar al carrito — $13.00" | OK (`android35-03`) |
| Carrito: Mesa (El mesero lo lleva) / Mostrador (Recoges tú), subtotal, aviso de impuestos y propina, **¿Quitar artículo?** con confirmación, carrito vacío con "Ver menú" | OK (`android35-05`, `-12`) |
| Checkout: resumen, propina 10/15/20 % + personalizada (15 % preseleccionado), **cotización del servidor** (subtotal $13.00 · impuesto $0.00 · propina $1.95 · total **$14.95**), "Protegido por Stripe" | OK (`android35-07`, `-08`) |
| **Hoja de pago de Stripe** | Se abrió con **Pay with Link, Card, Cash App Pay, Bank, Klarna** y botón "Pay $14.95"; se cerró con la X **sin pagar** (`android35-09`). **La hoja muestra la insignia "TEST"** (ver B9-1) |
| BD tras cancelar | **Sin cambios**: pedidos 198 (último 2026-10-28), `gift_offers` 74, reservas 7, `pos_payments` 120 |
| Errores de pago (solo código) | Cancelar la hoja → "Pago cancelado." (`PAYMENT_CANCELLED`); cualquier otro fallo del servidor, de red o de la hoja → "No se pudo completar el pago. Inténtalo de nuevo." (`errors.PAYMENT_FAILED`); **TOTAL_CHANGED** (409): no se cobra y se vuelve a cotizar (`services/stripe.ts:398`); clave de idempotencia por cotización y visita. El rechazo de tarjeta lo muestra la propia hoja de Stripe. No se ejecutó ninguno |
| Historial de pedidos y detalle | OK: Mis pedidos (#204, #202, #199…) con fecha, local, estado y total; detalle con seguimiento (Confirmado → Preparando → Listo), artículos, resumen y "Avisar al local" (`android35-13`, `-14`) |
| Paridad es/en (solo archivos) | **Completa.** Los textos de menú, carrito y checkout están en el espacio `pos` (`i18n/locales/{es,en}/pos.json`, `cart.*`, `checkout.*`, `tracking.*`): **246/246**; además `errors` 65/65, `reservations` 60/60, `loyalty` 20/20, `settings` 460/460, `chat` 436/436. Ejemplos: "Ir al pago · {{amount}}" ↔ "Proceed to Checkout · {{amount}}", "Agregar propina" ↔ "Add a Tip", "Pago cancelado." (`errors`) ↔ su par en inglés. Solo dos valores coinciden en ambos idiomas (`cart.orderTypeCardA11y`, `tracking.etaMinutes`), esperable. La pantalla se vio solo en español |

## 5. Hallazgos
| ID | Sev. | Pantalla / plataforma | Pasos | Esperado → Obtenido | Evidencia | Propuesta (sin implementar) |
|---|---|---|---|---|---|---|
| B9-1 | **decisión de lanzamiento de Juan** (P1 si el lanzamiento debe cobrar de verdad) | Hoja de pago · producción | Checkout → Pagar | Cobros reales en el binario de tienda → la hoja de Stripe muestra **"TEST"**: el backend responde con clave publicable `pk_test_…` (el código distingue `pk_test_` en `walletDiagnostic.ts:28`). Con claves de prueba **no se cobra dinero real**. Puede ser intencional antes del lanzamiento | `android35-09` | Ver "Pasar a live: claves y variables" abajo; Juan decide cuándo |
| B9-2 | **P2** | Carrito, checkout y detalle del pedido · Android | Pedir "Tacos al Pastor" con 3 tacos + Maíz + Verde | El cliente debe poder verificar lo que pidió → el carrito, el resumen del checkout y el detalle del pedido muestran solo "Tacos al Pastor"; **las opciones elegidas (porción, tortilla, salsa) no se ven** (en BD se guardan, no se comprobó cómo llegan a cocina) | `android35-05`, `-07` | Mostrar las opciones bajo cada línea en carrito, checkout y detalle |
| B9-3 | **P1** | Pedir a un local cerrado · Android | Con Bar XZX "Cerrado" (abre mañana 9:00), añadir plato → Ir al pago → Pagar | No debe poder comprar fuera de horario → se llega hasta la hoja de pago sin aviso. **Verificado en producción (solo lectura): `create_paid_order`, `assert_venue_order_allowed` y los triggers de `orders` no consultan el horario del local**; la función `payments` tampoco. Se une a **B7-4** (decisión pendiente de Juan) | `android35-09` | **Rechazarlo en el servidor**: dentro de `create_paid_order` / `assert_venue_order_allowed` y en la cotización (`quote_order`), con código específico `venue_closed` y el mensaje "Este local está cerrado; podrás pedir cuando abra" (en: "This venue is closed; you can order once it opens"), en `errors.json` es/en. Ver "Horario: qué reutilizar" abajo **Unido con el antiguo B9-7 (zona horaria):** la función SQL de «abierto ahora» debe evaluar el horario (`businesses.hours`) en `businesses.timezone` del local (hoy 7/7 en `America/New_York`), nunca en la hora del servidor ni del cliente. **Además, la app** debe mostrar «Abierto/Cerrado» con esa misma zona (`Intl.DateTimeFormat` con `timeZone`) en lugar del reloj del dispositivo (`utils/hours.ts`, que hoy dice que no hay zona del negocio, aunque la columna existe), para que quien mira desde otra zona vea lo mismo que decide el servidor |
| B9-4 | P3 | Checkout · Android | Ver el desglose | Texto coherente → la línea dice **"Impuesto (8%)"** con **$0.00** y debajo "El negocio no tiene impuestos configurados" | `android35-08` | Ocultar el 8 % cuando el impuesto es 0 |
| B9-5 | P3 | Detalle de pedido · Android | Abrir #204 | Recibo → solo "Subtotal" y "Total": **no hay impuestos, propina, método de pago ni recibo**; los artículos de un pedido ya confirmado hace días muestran "Pendiente" | `android35-14` | Añadir desglose y recibo/enlace; actualizar el estado por artículo |
| B9-6 | **P2** (higiene de cumplimiento) | `PricingScreen.tsx` + `pricing.json` | Revisión de código | Sin compra digital inalcanzable en el binario → queda código que abre Stripe Checkout para Verified | `screens/settings/PricingScreen.tsx:80` | **Borrar `PricingScreen.tsx` y los textos de Verified de `i18n/locales/{es,en}/pricing.json`.** Comprobación hecha: `grep` de `checkout.stripe.com`, `invoke('subscriptions')`, `session.url`, `data.url` en `screens/ components/ services/ hooks/ context/ utils/ navigation/` **solo encuentra `PricingScreen.tsx:80`**; el resto de `data.url` son OAuth de Login/Registro (`openAuthSessionAsync`) y comentarios de documentación de Stripe en `GiftPaymentForm.web.tsx`. Tras borrarlo no queda ningún enlace a Stripe Checkout en la app móvil (repetir el grep como test) |

## 5b. Horario: qué reutilizar para el servidor (solo lectura)
- **La función que muestra "Cerrado" en la app:** `mobile/utils/hours.ts` → `getOpenStatus(hours, now)` (`:62`) e `isOpenNow` (`:84`); la usan `components/map/BusinessPreviewCard.tsx`, `components/nearby/BusinessCard.tsx` y `screens/map/MapScreen.tsx`. Lee `businesses.hours` (JSON `{mon..sun: {open:"HH:MM", close:"HH:MM", closed:bool}}`), soporta turnos nocturnos (cierre < apertura, p. ej. vie 09:00–02:00 y "ayer" que cubre la madrugada), "todo el día" (00:00–23:59) y devuelve `open | closed | unknown`.
- **No existe equivalente en SQL** (no hay función `*open*`/`*hours*` en `public`); habría que **portar esa lógica a una función SQL** (p. ej. `public.business_open_status(p_business_id, p_at timestamptz)`) y llamarla desde `assert_venue_order_allowed` y `quote_order`.
- **Zona horaria (unida a B9-3; ya no es un hallazgo aparte):** `utils/hours.ts` usa **el reloj del dispositivo** y dice que "no existe zona horaria del negocio en el esquema", pero **`businesses.timezone` existe** (7/7 locales en `America/New_York`). Propuesta única: la función SQL de «abierto ahora» usa `timezone`, el servidor rechaza con `venue_closed`, y la app muestra Abierto/Cerrado con esa zona.
- **Estado `unknown`** (horario ilegible): decisión de producto; propuesta: no bloquear (como hace la app al mostrar "Horario no disponible").
- **Test:** unitario SQL/estático con los mismos casos de `hours.ts` (cierre nocturno, "todo el día", `closed`, fuera de horario) y que `create_paid_order` responda `venue_closed` sin crear fila en `orders`.

## 5c. Pasar a live: claves y variables (solo nombres, sin valores)
| Dónde | Nombre | Para qué | Cambiar a live |
|---|---|---|---|
| Supabase → Edge Functions → Secrets | `STRIPE_SECRET_KEY` | `payments`, `gift-worker`, `stripe-connect`, `guest-pay`, `guest-tab`, `tab-pay`, `terminal`… | `sk_live_…` |
| Supabase (secrets) | `EXPO_PUBLIC_STRIPE_PK` | La clave publicable que `payments`/`guest-*`/`tab-pay` devuelven a la app y a la web de pago | `pk_live_…` |
| Supabase (secrets) | `STRIPE_WEBHOOK_SECRET` | Webhook de pagos (`stripe-webhook`, `payments`, `subscriptions`) | `whsec_…` del endpoint **live** |
| Supabase (secrets) | `STRIPE_CONNECT_WEBHOOK_SECRET` | Webhook de cuentas Connect (`stripe-webhook`) | `whsec_…` live del endpoint Connect |
| Supabase (secrets) | `STRIPE_WEBHOOK_SECRET_SUBS` | Webhook de suscripciones (`subscriptions`) | `whsec_…` live |
| Supabase (secrets) | `STRIPE_PRICE_VERIFIED`, `STRIPE_PRICE_BUSINESS`, `STRIPE_PRICE_PRO` | Precios de las suscripciones (web) | Ids de precio **live** (los de prueba no existen en live) |
| App móvil | `mobile/.env` → `EXPO_PUBLIC_STRIPE_PK` | Clave publicable en el bundle (`StripeRoot`, `components/*`) | `pk_live_…`; **va en el fingerprint/runtime**: cambiarla exige build nativo o ver qué consume realmente la app (la hoja usa la clave que devuelve `payments`) |
| Vercel (`jchat-app-web`) | variables del entorno de producción de Stripe/web de pago (revisar en el panel; el repo no las lista) | Páginas de pago web y dashboard | claves live equivalentes |
| Stripe Dashboard | Webhooks, Connect (cuentas de locales en live), productos/precios, lector Terminal (ubicaciones live) | — | Recrear en modo live; migrar o recrear `stripe_account_id` de los locales |
**Después:** un cobro real mínimo con la cuenta de reseña (reembolsable con `stripe-refund`) y comprobar que la hoja ya no muestra "TEST". **No hacer** este cambio hasta que Juan lo decida.

## 6. No probado y por qué
| Qué | Motivo |
|---|---|
| Completar un pago, tarjeta rechazada, red caída, TOTAL_CHANGED en ejecución | Prohibido pagar, incluso en modo de prueba; solo código |
| Regalos (GiftSheet), pedido en mesa con camarero, propina personalizada, Apple Pay / Google Pay | La hoja de pago de Android no ofreció Google Pay en el emulador; los regalos habrían creado una retención |
| iOS, Android 36/26, iPhone 17e; inglés; tema oscuro; letra grande (DT-1) en carrito/checkout | No se alcanzó |
| Modo Trabajo / POS (empleado y dueño), recibos del personal | Bloque 10 |
| Web `/pricing` y `/dashboard/billing` | Bloque 11 |

## 7. Estado
Carrito vacío; sin pedidos, regalos ni reservas nuevos. La publicación `QA8 publicacion de prueba` de @test sigue sin borrar, como pediste.
