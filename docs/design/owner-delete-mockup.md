# Borrado de la cuenta de un dueño (D4) — mockup de textos / copy mockup

> **BORRADOR para aprobación de Juan · 2026-11-06.** Solo textos y dibujos: no hay código, migración ni cambio en producción. Nada se implementa hasta que Juan lo apruebe.
> Base: decisiones de Juan (locales **cerrados, no borrados**; pedidos, pagos y recibos 7 años sin datos personales; datos personales del dueño borrados al momento; suscripción de Stripe cancelada de inmediato sin reembolso; saldo pendiente en Connect **bloquea** el borrado; empleados avisados) y `docs/design/owner-account-deletion.md` (opción A; ese archivo vive en la rama `docs/owner-account-deletion`, aún no está en `main`).
> Flujo actual que sustituye: hoy un dueño recibe 409 `owner_has_business` y "ciérralo o transfiérelo / escribe a soporte" (`SettingsScreen` → `alerts.deleteOwner*`; web `/account/delete` → `accountDelete.owner*`).
> Marcadores: `{{local}}`, `{{locales}}`, `{{n}}`, `{{importe}}` (ya formateado con moneda, p. ej. `$42.50`), `{{codigo}}`, `{{contacto}}` = `soporte@jchat.cloud`.
> Vocabulario: ES "local" / EN "venue" (como en la app). Tono llano, sin jerga (no "cascada", "FK", "Connect" salvo donde Stripe lo exige).

Orden de la experiencia (dueño, app): **Ajustes → Eliminar cuenta → (A) "Tienes un local" → (C) segunda confirmación → borrado → éxito.** Si hay saldo pendiente en Stripe, en lugar de (A) se muestra **(B)** y no se avanza. Si algo falla a mitad: **(G)**.

---

## A. Pantalla "Tienes un local" (app)

Se muestra al pulsar **Eliminar cuenta** siendo dueño de uno o más locales. Es una pantalla completa (no un Alert), porque lleva lista, viñetas y casilla.

### Dibujo (un local)

```
┌──────────────────────────────────────┐
│ ←                                    │
│                                      │
│  Tienes un local                     │  título
│  Al eliminar tu cuenta se cerrará.   │  subtítulo
│                                      │
│  ┌────────────────────────────────┐  │
│  │ ◉  Bar XZX                     │  │  tarjeta del local
│  │    Miami, FL                   │  │
│  └────────────────────────────────┘  │
│                                      │
│  Qué pasará                          │
│  • El local se cierra: deja de ser…  │  viñetas cortas
│  • Tu equipo pierde el acceso…       │
│  • Tus datos personales se borran…   │
│  • Pedidos y pagos se guardan 7…     │
│  • Tu suscripción se cancela…        │
│  • Las reservas se cancelan…         │
│                                      │
│  [ ] Entiendo que se cerrará mi      │  casilla (obligatoria)
│      local y que no se puede deshacer│
│                                      │
│  [      Cancelar (principal)      ]  │  botón principal = la salida segura
│  [   Continuar y eliminar (rojo)  ]  │  secundario/destructivo, desactivado
│                                      │  hasta marcar la casilla
└──────────────────────────────────────┘
```

Decisión de diseño: el botón **principal** (relleno) es **Cancelar** (no destruir por accidente); el destructivo es secundario, en rojo (`--color-danger`), deshabilitado hasta marcar la casilla. Si prefieres lo contrario, es un cambio de una línea.

### Dibujo (varios locales)

```
│  Tienes 3 locales                    │  título con el número
│  Al eliminar tu cuenta se cerrarán   │
│  los tres.                           │
│                                      │
│  ┌ Bar XZX ·· Miami, FL ───────────┐ │  lista (máx. 5 visibles;
│  ├ Café Sol ·· Tampa, FL ──────────┤ │  desde el 6.º: "y {{n}} más")
│  └ Demo Lounge ·· Orlando, FL ─────┘ │
│  …                                   │
│  [ ] Entiendo que se cerrarán mis 3  │  la casilla repite el número
│      locales y que no se puede…      │
```

### Textos

| Elemento | Español | English |
|---|---|---|
| Título (1 local) | Tienes un local | You have a venue |
| Título (varios) | Tienes {{n}} locales | You have {{n}} venues |
| Subtítulo (1) | Al eliminar tu cuenta, tu local se cerrará. | Deleting your account will close your venue. |
| Subtítulo (varios) | Al eliminar tu cuenta, se cerrarán estos {{n}} locales. | Deleting your account will close these {{n}} venues. |
| Lista | `{{local}}` · ciudad (máx. 5; luego "y {{n}} más") | `{{local}}` · city (max 5; then "and {{n}} more") |
| Encabezado | Qué pasará | What will happen |
| Viñeta 1 | Tu local se cierra: se oculta del mapa y deja de aceptar pedidos. | Your venue closes: it is hidden from the map and stops taking orders. |
| Viñeta 2 | Tu equipo pierde el acceso y recibe un aviso. Sus cuentas siguen activas. | Your team loses access and gets a notice. Their accounts stay active. |
| Viñeta 3 | Tus datos personales se borran ahora mismo: perfil, fotos y mensajes. | Your personal data is deleted right now: profile, photos and messages. |
| Viñeta 4 | Los pedidos, pagos y recibos se guardan 7 años, sin tus datos personales, como exige la ley fiscal. | Orders, payments and receipts are kept for 7 years, without your personal data, as tax law requires. |
| Viñeta 5 | Tu suscripción se cancela hoy. No hay reembolso del periodo ya pagado. | Your subscription is cancelled today. The period you already paid is not refunded. |
| Viñeta 6 | Las reservas futuras se cancelan y avisamos a tus clientes. | Future reservations are cancelled and we notify your customers. |
| Viñeta 7 (solo si hay varios locales) | Todo lo anterior se aplica a cada uno de tus locales. | All of the above applies to each of your venues. |
| Casilla (1) | Entiendo que mi local se cerrará y que esto no se puede deshacer. | I understand my venue will close and this cannot be undone. |
| Casilla (varios) | Entiendo que mis {{n}} locales se cerrarán y que esto no se puede deshacer. | I understand my {{n}} venues will close and this cannot be undone. |
| Botón principal | Cancelar | Cancel |
| Botón secundario (rojo) | Continuar y eliminar | Continue and delete |
| Accesibilidad de la casilla | "Casilla obligatoria. Marcada: sí/no." | "Required checkbox. Checked: yes/no." |

Mientras se comprueba el saldo de Stripe (al abrir la pantalla), el botón rojo muestra un indicador y el texto "Comprobando tu saldo…" / "Checking your balance…"; si la comprobación falla por red: ver (G).

---

## B. Bloqueo por saldo pendiente en Stripe

Se muestra **en lugar de A** cuando Stripe devuelve saldo disponible o pendiente de liquidar mayor que 0 en la cuenta conectada de algún local. No se borra nada.

### Dibujo

```
┌──────────────────────────────────────┐
│ ←                                    │
│        ⚠                             │
│  Aún tienes dinero por cobrar        │  título
│                                      │
│  Stripe tiene {{importe}} de tus     │  cuerpo con el importe
│  ventas sin transferir a tu banco.   │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Bar XZX            $42.50      │  │  desglose por local
│  │ Café Sol           $10.00      │  │  (solo con varios locales)
│  │ Total              $52.50      │  │
│  └────────────────────────────────┘  │
│                                      │
│  Qué hacer                           │
│  1. Espera a que Stripe lo envíe a   │
│     tu banco (normalmente 2–7 días). │
│  2. Vuelve aquí y elimina tu cuenta. │
│                                      │
│  [   Abrir mi panel de Stripe     ]  │  principal
│  [          Entendido             ]  │  secundario
└──────────────────────────────────────┘
```

### Textos

| Elemento | Español | English |
|---|---|---|
| Título | Aún tienes dinero por cobrar | You still have money to collect |
| Cuerpo (1 local) | Stripe tiene {{importe}} de tus ventas que aún no se han transferido a tu banco. Para no perderlos, no podemos eliminar tu cuenta todavía. | Stripe is holding {{importe}} from your sales that hasn't reached your bank yet. So you don't lose it, we can't delete your account yet. |
| Cuerpo (varios) | Stripe tiene {{importe}} en total de las ventas de tus locales sin transferir a tu banco. Para no perderlos, no podemos eliminar tu cuenta todavía. | Stripe is holding {{importe}} in total from your venues' sales that hasn't reached your bank yet. So you don't lose it, we can't delete your account yet. |
| Encabezado | Qué hacer | What to do |
| Paso 1 | Espera a que Stripe lo envíe a tu banco (normalmente entre 2 y 7 días). | Wait for Stripe to send it to your bank (usually 2 to 7 days). |
| Paso 2 | Cuando el saldo llegue a cero, vuelve aquí y elimina tu cuenta. | When the balance reaches zero, come back here and delete your account. |
| Botón principal | Abrir mi panel de Stripe | Open my Stripe dashboard |
| Botón secundario | Entendido | Got it |
| Nota | No se ha borrado nada. Tu cuenta y tu local siguen como estaban. | Nothing has been deleted. Your account and venue are unchanged. |

---

## C. Segunda confirmación (la que ya existe), adaptada al dueño

Hoy es un `confirm` con título "¿Estás totalmente seguro?" y mensaje "Esta es tu última oportunidad…". Para dueños cambia **solo el texto** (misma mecánica: dos botones, destructivo en rojo).

### Dibujo

```
┌──────────────────────────────────────┐
│   ¿Cerrar {{local}} y eliminar tu    │
│   cuenta?                            │
│                                      │
│   Es inmediato y permanente. Tu      │
│   local se cierra hoy y tu equipo    │
│   y tus clientes serán avisados.     │
│                                      │
│   [ Cancelar ]  [ Eliminar todo ]    │
└──────────────────────────────────────┘
```

| Elemento | Español | English |
|---|---|---|
| Título (1 local) | ¿Cerrar {{local}} y eliminar tu cuenta? | Close {{local}} and delete your account? |
| Título (varios) | ¿Cerrar tus {{n}} locales y eliminar tu cuenta? | Close your {{n}} venues and delete your account? |
| Mensaje | Es inmediato y permanente. Tu local se cierra hoy y avisamos a tu equipo y a tus clientes con reserva. No se puede deshacer. | This is immediate and permanent. Your venue closes today and we notify your team and customers with a reservation. It cannot be undone. |
| Botón de cancelar | Cancelar | Cancel |
| Botón destructivo | Eliminar todo | Delete everything |
| Indicador mientras borra (el overlay actual) | Eliminando tu cuenta y cerrando tu local… (puede tardar hasta 30 s) | Deleting your account and closing your venue… (may take up to 30 s) |
| Éxito — título | Cuenta eliminada | Account deleted |
| Éxito — mensaje | Tu cuenta se eliminó y tu local quedó cerrado. Los registros de ventas se guardan 7 años sin tus datos personales. | Your account was deleted and your venue is closed. Sales records are kept for 7 years without your personal data. |

---

## D. Aviso a los empleados ("El local X cerró")

Dos canales: **push** y **bandeja de notificaciones de la app** (la misma fila). Se envía una vez por local cerrado a cada empleado con acceso activo. Sus cuentas no se tocan; solo pierden el acceso al local.

### Dibujo

```
Push (pantalla de bloqueo)            Bandeja de la app
┌───────────────────────────┐         ┌──────────────────────────────┐
│ JChat                 ahora│        │ ◉ {{local}} cerró             │
│ {{local}} cerró           │         │   El dueño cerró el local…    │
│ Ya no tienes acceso al    │         │                    hace 1 min │
│ punto de venta.           │         └──────────────────────────────┘
└───────────────────────────┘
```

| Elemento | Español | English |
|---|---|---|
| Título (push y bandeja) | {{local}} cerró | {{local}} has closed |
| Cuerpo push (corto) | Ya no tienes acceso al punto de venta. | You no longer have access to the point of sale. |
| Cuerpo bandeja (largo) | El dueño cerró {{local}}. Ya no puedes entrar al punto de venta ni al chat del local. Tu cuenta de JChat sigue activa. | The owner closed {{local}}. You can no longer open the point of sale or the venue chat. Your JChat account stays active. |
| Si el empleado está con el POS abierto | Este local cerró y la sesión de trabajo terminó. | This venue has closed and your work session has ended. |

---

## E. Aviso al cliente con reserva futura cancelada

Push + bandeja + (si hay correo) el correo de reserva habitual. Una vez por reserva cancelada. No menciona la cuenta del dueño ni el motivo personal: solo que el local cerró.

### Dibujo

```
┌──────────────────────────────────────┐
│ ◉ Reserva cancelada                  │
│   {{local}} cerró y tu reserva del   │
│   {{fecha}} a las {{hora}} se        │
│   canceló.                           │
│                                      │
│   [        Ver otros locales      ]  │
└──────────────────────────────────────┘
```

| Elemento | Español | English |
|---|---|---|
| Título | Reserva cancelada | Reservation cancelled |
| Cuerpo | {{local}} cerró y tu reserva del {{fecha}} a las {{hora}} se canceló. Lamentamos las molestias. | {{local}} has closed and your reservation for {{fecha}} at {{hora}} was cancelled. We're sorry for the inconvenience. |
| Si había depósito/pago | Si pagaste algo por adelantado, escríbenos a {{contacto}} con el número de la reserva. | If you paid anything in advance, write to {{contacto}} with your reservation number. |
| Botón | Ver otros locales | See other venues |

(La línea del depósito solo aparece si la reserva tenía pago; hoy las reservas no cobran por adelantado, así que normalmente no saldrá.)

---

## F. Texto para dueños en `/account/delete` y en `/privacy`

Sustituye el bloque actual ("Eliminar tu cuenta también eliminaría tu negocio… Ciérralo o transfiérelo primero… Escribe a soporte"). En la web el dueño **sí puede continuar**: el mismo flujo (escribir ELIMINAR / DELETE) con este aviso previo.

### F1. `/account/delete` — bloque para dueños (aparece solo si la cuenta tiene locales)

```
┌──────────────────────────────────────────────┐
│ ⚠ Tienes {{n}} local(es): {{locales}}        │
│   Qué pasará: …(las mismas viñetas de A)…    │
│   [ ] Entiendo que mi local se cerrará…      │
│   Escribe ELIMINAR para confirmar: [_______] │
│   [ Eliminar mi cuenta y cerrar mi local ]   │
└──────────────────────────────────────────────┘
```

| Elemento | Español | English |
|---|---|---|
| Título | Tienes un negocio en JChat | You have a business on JChat |
| Cuerpo | Al eliminar tu cuenta, tu local ({{locales}}) se cierra: se oculta del mapa y deja de aceptar pedidos. Tus datos personales se borran ahora mismo. Los pedidos, pagos y recibos se guardan 7 años sin tus datos personales, como exige la ley fiscal. Tu suscripción se cancela hoy, sin reembolso. Tu equipo y los clientes con reserva reciben un aviso. | Deleting your account closes your venue ({{locales}}): it is hidden from the map and stops taking orders. Your personal data is deleted right now. Orders, payments and receipts are kept for 7 years without your personal data, as tax law requires. Your subscription is cancelled today, with no refund. Your team and customers with a reservation are notified. |
| Casilla | Entiendo que mi local se cerrará y que no se puede deshacer. | I understand my venue will close and this cannot be undone. |
| Botón | Eliminar mi cuenta y cerrar mi local | Delete my account and close my venue |
| Si hay saldo en Stripe | Stripe tiene {{importe}} de tus ventas sin transferir a tu banco. Espera a que llegue y vuelve a intentarlo. | Stripe is holding {{importe}} from your sales that hasn't reached your bank yet. Wait for it to arrive and try again. |
| Pie | ¿Dudas? Escribe a safety@jchat.cloud o usa la página de contacto. (Ya no se pide escribir para poder borrar.) | Questions? Write to safety@jchat.cloud or use the contact page. (You no longer need to write to us in order to delete.) |

### F2. `/privacy` — párrafo de conservación y dueños (sustituye la frase de "salvo los registros que la ley nos obliga a conservar" y cualquier "escribe a soporte" para dueños)

| Español | English |
|---|---|
| **Cuentas de dueños de locales.** Puedes eliminar tu cuenta tú mismo desde la app (Ajustes → Eliminar cuenta) o en jchat.cloud/account/delete. Tu local se cierra (deja de ser visible y de aceptar pedidos) y tus datos personales se borran de inmediato. Los registros de pedidos, pagos y recibos del local se conservan hasta 7 años, sin tus datos personales, porque la contabilidad y la normativa fiscal lo exigen. Tu suscripción se cancela al momento, sin reembolso del periodo ya pagado. Si Stripe aún tiene saldo tuyo sin transferir, primero debe llegar a tu banco. | **Venue owner accounts.** You can delete your account yourself in the app (Settings → Delete account) or at jchat.cloud/account/delete. Your venue closes (it stops being visible and taking orders) and your personal data is deleted immediately. The venue's order, payment and receipt records are kept for up to 7 years, without your personal data, because accounting and tax rules require it. Your subscription is cancelled immediately, with no refund of the period already paid. If Stripe still holds a balance for you, it must reach your bank first. |

---

## G. Error a mitad del proceso

El borrado tiene pasos en orden (comprobar saldo → cancelar suscripción → cerrar locales y avisar → borrar datos). Si falla uno, **se detiene y la persona puede reintentar**; lo que ya se hizo es seguro de repetir. Texto con código, como hoy:

### Dibujo

```
┌──────────────────────────────────────┐
│   No pudimos terminar                │
│                                      │
│   Algo falló al cerrar tu local.     │
│   Tu cuenta sigue activa. Puedes     │
│   intentarlo de nuevo.               │
│                                      │
│   Si sigue pasando, escríbenos a     │
│   soporte@jchat.cloud con este       │
│   código: owner_close_failed         │
│                                      │
│   [  Reintentar  ]  [  Cerrar  ]     │
└──────────────────────────────────────┘
```

| Situación | Español | English |
|---|---|---|
| Error genérico a mitad | No pudimos terminar. Algo falló al cerrar tu local; tu cuenta sigue activa y puedes intentarlo de nuevo. Si sigue pasando, escríbenos a {{contacto}} con este código: {{codigo}}. | We couldn't finish. Something went wrong closing your venue; your account is still active and you can try again. If it keeps happening, write to {{contacto}} with this code: {{codigo}}. |
| Falla la suscripción | No pudimos cancelar tu suscripción, así que no hemos borrado nada. Inténtalo de nuevo o escríbenos a {{contacto}} con este código: {{codigo}}. | We couldn't cancel your subscription, so nothing was deleted. Try again or write to {{contacto}} with this code: {{codigo}}. |
| Falla la comprobación del saldo (red/Stripe) | No pudimos comprobar tu saldo en Stripe. No se ha borrado nada. Inténtalo en unos minutos o escríbenos a {{contacto}} con este código: {{codigo}}. | We couldn't check your Stripe balance. Nothing was deleted. Try again in a few minutes or write to {{contacto}} with this code: {{codigo}}. |
| Pedidos en curso o mesas abiertas (si Juan decide bloquear; ver pregunta 2) | Tienes pedidos en curso o mesas abiertas. Ciérralos primero y vuelve a intentarlo. No se ha borrado nada. | You have orders in progress or open tables. Close them first and try again. Nothing was deleted. |
| Botones | Reintentar · Cerrar | Retry · Close |

Códigos propuestos (el usuario solo ve el código, el detalle queda en el log de la función): `owner_close_failed`, `subscription_cancel_failed`, `stripe_balance_check_failed`, `stripe_balance_pending` (es la pantalla B), `owner_open_orders`. Los códigos existentes (`storage_purge_failed`, `fk_violation`, `delete_failed`, …) siguen igual. El código viejo `owner_has_business` desaparece para dueños (la app antigua lo seguirá viendo hasta que se actualice: el servidor puede dejar de devolverlo solo cuando todos los clientes tengan el flujo nuevo).

---

## Preguntas para Juan (máximo 5)

1. **Reseñas, publicaciones y chat del local cerrado:** ¿se **ocultan** con el local y se conservan (recomendado: las reseñas las escribieron clientes, no el dueño) o se borran con él? Los datos personales del dueño se borran en cualquier caso.
2. **Pedidos en curso y mesas abiertas:** ¿**bloqueamos** el borrado hasta que se cierren (recomendado, evita cobros a medias; mensaje en G) o los cancelamos solos?
3. **¿Se puede reabrir un local cerrado?** Propuesta: **no** desde la app (el dueño ya no existe); solo por soporte en casos justificados y con un dueño nuevo. ¿Lo escribimos así o quieres un plazo de gracia (p. ej. 14 días) antes de que sea definitivo? Los empleados conservan su cuenta (solo pierden el acceso): damos eso por cerrado.
4. **Cuenta de Stripe Connect del local:** ¿la **desconectamos** de JChat al cerrar (recomendado; Stripe conserva por ley lo suyo) o la dejamos conectada? Y el bloqueo (B): ¿cualquier saldo mayor que 0, o un umbral (p. ej. menos de $1 no bloquea)?
5. **Canal de los avisos:** ¿push + bandeja es suficiente para empleados y clientes con reserva, o además **correo** a los clientes con reserva (necesita plantilla nueva y que haya correo)?
