# Borrado de la cuenta de un dueño de local (B2-3) — diseño

> **BORRADOR para decisión de Juan · 2026-11-06.** Solo documento: no hay código, migración ni cambio en producción. Hechos leídos del repo y de la base de producción **en solo lectura** (claves foráneas y conteos).

## 1. Dónde estamos hoy

- `delete-account` (edge function) responde **409 `owner_has_business`** si la cuenta es dueña de algún local y **no borra nada**: la persona ve "escribe a soporte". Un dueño **no puede borrar su cuenta desde la app**.
- La razón técnica: `businesses.owner_id` es `ON DELETE CASCADE`. Si se dejara pasar el borrado, desaparecerían el local y, en cascada, `orders`, `pos_payments`, `reservations`, `reviews`, `employees`, `tables`, `table_tabs`, `menu_items`, `rooms`, `gift_offers`, etc. (todas `CASCADE` hacia `businesses`, comprobado en el esquema local, igual que producción).
- La función **no toca Stripe**: `users.stripe_customer_id` / `stripe_subscription_id` y la cuenta Connect del local (`businesses.stripe_account_id`) quedan como están (lo dice el comentario de la función: "belongs to the business-owner deletion flow, not yet built").
- La función tampoco **revoca el token de Sign in with Apple** al borrar (no hay ninguna llamada de revocación en `delete-account`).
- Un administrador puede poner un local en `closed` (`admin_set_business_status`), pero **no encontré** un cierre iniciado por el dueño.

### Por qué importa para las tiendas
- **Apple 5.1.1(v):** si la app permite crear cuenta, debe permitir **iniciar el borrado dentro de la app**. No basta con desactivar la cuenta. Puede pedir reautenticación y confirmación; **no puede obligar a escribir, llamar o enviar un correo** (la excepción de sectores regulados no aplica a JChat). Un 409 con "escribe a soporte" para dueños es, estrictamente, un incumplimiento para esos usuarios. Además, con Sign in with Apple hay que **revocar el token** al borrar.
- **Google Play (política de eliminación de cuentas):** pide una vía dentro de la app **y** una URL web (ya existe: `/account/delete`, que hoy también manda al dueño a soporte).
- **Riesgo concreto en la revisión:** la cuenta de revisión `@jchatreview` **es dueña** de JChat Demo Lounge. Si el revisor prueba "Eliminar cuenta" con ella, ve el 409. Mientras no haya flujo de dueño: **no listar esa cuenta como la de borrado** y avisar en las notas ("Account deletion is available to regular accounts in Settings; venue owners close the venue first"), o implementar la opción A de abajo.
- **Política de privacidad vigente:** promete que los **pedidos se conservan 7 años sin datos personales**. Hoy un borrado en cascada de un local **destruiría** `orders` y `pos_payments`, contradiciendo esa promesa. Cualquier opción debe resolverlo.

## 2. Opciones

### A. Cerrar el local y borrar todo (el dueño borra la cuenta y el local desaparece)
Flujo en la app: Ajustes → Eliminar cuenta → aviso para dueños ("Se cerrará **{local}**: se borran el menú, el chat y el personal; las ventas se conservan sin tu identidad") → reautenticar → escribir ELIMINAR → hecho.

| Tema | Qué pasa |
|---|---|
| Menú, mesas, ofertas, chat y salas | Se borran con el local (cascada). |
| Pedidos y pagos (`orders`, `pos_payments`, recibos) | **Hay que conservarlos 7 años sin identidad.** Requiere antes del borrado: copiar a una tabla de archivo fiscal (sin PII, con `business_id` opaco) **o** cambiar esas FK a `SET NULL` y guardar una "foto" del local. Es el trabajo principal de esta opción. |
| Pedidos en curso, mesas abiertas, reservas futuras | Bloquear el borrado si hay pedidos `pending/processing` o tabs abiertos; cancelar/avisar las reservas futuras (notificación a los clientes). |
| Empleados | Se les quita el acceso (pierden `pos_access`); reciben una notificación "El local {x} cerró". Sus cuentas no se tocan. |
| Stripe Connect | La cuenta conectada **no se borra** desde JChat; se **desconecta** (deautorizar) y se muestran pagos pendientes: si hay saldo o pagos sin liquidar, bloquear o pedir esperar. Lo que Stripe retiene por ley lo conserva Stripe. |
| Suscripción (plan Business/Pro vía Stripe) | Cancelar al borrar (inmediato o al final del periodo; **sin reembolso automático**). Cerrar `stripe_customer_id` al final. |
| Apple 5.1.1(v) | **Cumple** (iniciado en la app, confirmación, sin pasar por soporte). |
| Esfuerzo | Medio-alto (archivo fiscal + cancelación de Stripe + avisos + bloqueos). |

### B. Transferir el local a otra cuenta antes de borrar
Flujo: el dueño elige a una persona (empleado con rol "manager" o cualquier cuenta por usuario) → ella acepta → `businesses.owner_id` cambia → el dueño original puede borrar su cuenta (ya no es dueño).

| Tema | Qué pasa |
|---|---|
| Menú, pedidos, empleados | Todo sigue igual; el nuevo dueño hereda. |
| Stripe Connect | **El punto difícil**: una cuenta Connect pertenece a una persona/empresa verificada (KYC); no se puede "regalar". El nuevo dueño debe **conectar su propia cuenta** y los pagos quedan en pausa hasta entonces. |
| Suscripción | Se cancela la del dueño original; el nuevo dueño contrata el plan (puede haber un periodo de gracia). |
| Apple 5.1.1(v) | Cumple **solo si** el dueño puede salir por su cuenta; si nadie acepta la transferencia, necesita igualmente A o C → **B no basta sola**. |
| Esfuerzo | Alto (invitación, aceptación, permisos, Stripe, casos "nadie acepta", disputas entre personas). |

### C. Borrar la cuenta y dejar el local "huérfano" en pausa
El dueño borra su cuenta; el local queda `suspended`/`closed` sin dueño (`owner_id` NULL), con menú y datos de ventas intactos, a la espera de que alguien lo reclame (el personal o un administrador) o de caducar (p. ej. 90 días → borrado definitivo).

| Tema | Qué pasa |
|---|---|
| Menú, mesas, chat | Se conservan pero **inactivos** (el local no aparece en el mapa ni acepta pedidos). |
| Pedidos y pagos | Se conservan (el local sigue existiendo): **cumple los 7 años sin trabajo extra**. |
| Empleados | Siguen con su cuenta; sin dueño, el POS queda deshabilitado. |
| Stripe Connect | Se desconecta/pausa igual que en A; sin dueño nadie cobra. |
| Suscripción | Se cancela al borrar. |
| Esquema | `businesses.owner_id` debe pasar a `ON DELETE SET NULL` y admitir NULL; hay que revisar todas las políticas RLS que usan `owner_id = auth.uid()` y las vistas del super-admin; un proceso de "reclamar local" y otro de caducidad. |
| Apple 5.1.1(v) | **Cumple**, pero deja datos de un negocio sin responsable de datos (privacidad: el local es del negocio, no de la persona). |
| Esfuerzo | Medio (esquema + RLS + reclamar + caducidad). |

## 3. Recomendación

**Para el envío (v1.0): A, en su versión mínima y segura.** Es la única que da una salida completa y limpia al dueño sin depender de que otra persona acepte (B) ni de un proceso de reclamación y caducidad (C), y la que se explica mejor a Apple y a Google ("borrar la cuenta cierra el local"). La parte que decide el esfuerzo es **proteger los 7 años de ventas**: propongo cambiar `orders.business_id` y `pos_payments.business_id` a una copia archivada **antes** de la cascada (tabla `financial_archive` sin PII) en vez de tocar todas las FK.

Mínimo para v1.0:
1. Pantalla de aviso + reautenticación para dueños (en la app y en `/account/delete`).
2. Bloqueos con mensaje claro: pedidos en curso, tabs abiertos, saldo/pagos de Stripe pendientes, reservas futuras (avisar).
3. Cancelar la suscripción y desconectar la cuenta Connect (Stripe API) antes de borrar; si falla, **no borrar** (error con código, la persona puede reintentar).
4. Archivo fiscal de pedidos y pagos sin identidad.
5. Revocar el token de Sign in with Apple (para cualquier cuenta, también las no-dueñas): **es independiente y obligatorio**, conviene hacerlo ya.

**Después (v1.1):** C como alternativa "Pausar mi local y borrar mi cuenta" y B como "Transferir mi local", sobre lo que A deje hecho (cancelación Stripe y avisos se reutilizan).

**Plan B si no llega a tiempo para el envío:** mantener el 409, pero (a) explicarlo en las notas del revisor y no usar la cuenta de revisión para probar el borrado, (b) cambiar el texto del 409 para que **inicie el cierre desde la app** (botón "Cerrar mi local" que solo marque `closed` y avise por correo a soporte) en vez de "escribe a soporte". Aun así Apple puede rechazar: es el riesgo que Juan acepta.

## 4. Preguntas para Juan
1. ¿Confirmas que los pedidos y pagos de un local cerrado se conservan 7 años (sin identidad)? Es lo que dice `/privacy`; si no, hay que corregir la política y el trabajo del archivo fiscal se reduce.
2. ¿Prefieres borrado **inmediato** o con **periodo de gracia** (p. ej. 14 días, cuenta desactivada, con enlace para cancelar)? Apple lo permite si se informa; da margen para arrepentimientos y para liquidar Stripe.
3. ¿Qué hacemos con el saldo pendiente de Stripe Connect: bloquear el borrado hasta liquidar (recomendado) o dejar que Stripe lo liquide a la cuenta conectada después?
4. Suscripción: ¿cancelación inmediata sin reembolso, o hasta el final del periodo pagado?
5. ¿Los empleados reciben aviso por push/correo cuando el local cierra? ¿Con cuánta antelación?
6. ¿Aceptas A para v1.0 y B/C para v1.1? Si prefieres C ya, hay que cambiar `owner_id` y revisar las políticas RLS (más riesgo cerca del envío).
7. La cuenta de revisión `@jchatreview` es dueña: ¿creamos una **segunda cuenta no-dueña** para que el revisor pruebe el borrado sin cerrar el local de demo? (Recomendado en cualquier caso.)
8. ¿Revocamos el token de Apple en `delete-account` ya (independiente de esta decisión)?
