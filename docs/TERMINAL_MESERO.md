# Terminal del mesero (B6 + POS) — modelo de producto (2026-07-19)

## Por qué existe
Hoy un empleado NO puede entrar a ningún sitio: el dashboard exige plan business/pro. Llevamos
varias piezas construidas PARA el mesero que ningún mesero puede usar: asignación de mesas (B4),
taps de mesero (B2), panel de mesa, y toda la caja (docs/CAJA.md). B6 desbloquea todas.

## Plataforma y dispositivo
- **Web pensada para móvil/tablet**, fuera del gate del dashboard. (Tap to Pay exigirá app
  nativa más adelante; ver Fuera de alcance.)
- El terminal es **una tablet o dispositivo DEL NEGOCIO**, compartido por varios meseros.

## Acceso y seguridad
- En **Configuración › Empleados** hay un **enlace + QR por NEGOCIO** (no por mesero) que sirve
  para **vincular el dispositivo** al negocio. Se escanea una vez al configurar la tablet.
- Después, cada mesero entra con un **PIN de 6 dígitos**. No login completo cada vez (sería
  inviable en hora punta).
- El **PIN lo asigna el dueño** al crear el empleado.
- **Bloqueo tras varios intentos fallidos**, y además **aviso al dueño**.
- El dueño puede **desvincular un dispositivo** desde el dashboard (tablet perdida o robada).
- La sesión **se bloquea sola por inactividad**.
- **Fichaje OBLIGATORIO**: sin fichar entrada, el mesero no puede usar el terminal.

## Permisos por mesero
Juan decidió permisos PROPIOS de mesero, separados de `custom_roles` (que ya existe para el
dashboard). ⚠️ Riesgo asumido y consciente: mantener dos sistemas de permisos.
Controlables por el dueño, por mesero:
- Cobrar en efectivo · Cobrar con tarjeta · Dividir la cuenta
- Ver ventas del día (**solo las suyas**, no las del negocio)
- Crear mesas · Crear cuentas (taps) para usuarios · Modificar asientos de mesas
- **Sensibles** (vectores clásicos de robo interno, por eso van aparte):
  anular/eliminar artículos · aplicar descuentos · hacer reembolsos

## Mesas
- Un mesero ve **sus mesas asignadas + las mesas SIN asignar**. No ve las asignadas a otros.
- Si un empleado **abre una cuenta en una mesa SIN asignar, la mesa QUEDA ASIGNADA a él** (el
  primero que la atiende se la queda). Cambio del 2026-07-20 respecto a la decisión inicial ("no
  hay asignación implícita"). Se implementa con la RPC `open_tab_on_table` (SECURITY DEFINER),
  porque un mesero no puede escribir en `table_waiters` por sí mismo ni insertar en `table_tabs`
  de una mesa que no tiene asignada.
- Un mismo empleado **puede trabajar en varios negocios**.
- **Plano visual en cuadrícula ordenada** (como la referencia POS que dio Juan), NO plano real
  con posiciones arrastrables. Basta con piso + orden, que `tables` ya tiene.
- **Estados con color**: libre · ocupada · pendiente de cobro · por limpiar.
- **El mesero marca la mesa como limpia** cuando termina (no se libera sola).
- Puede **unir mesas** (grupo grande) y **mover un tap de una mesa a otra**.

## Tomar pedidos
- **Pantalla propia pensada para rapidez**, NO el menú del cliente.
- **Asientos numerados 1..N** según las sillas de la mesa. El mesero **marca el asiento de cada
  plato** al tomarlo (imprescindible para poder dividir por asiento después).
- **Duplicar plato** (con sus modificadores) y **gestos de deslizar** para editar/duplicar/
  eliminar. Ambos son estándar del sector y ahorran mucho tiempo.
- **Control de tiempos de cocina**: mandar entrantes ahora y principales después.
- Puede **añadir más rondas** a un tap ya enviado a cocina.
- Puede **marcar un plato como AGOTADO** desde el terminal → **desaparece del menú QR al
  instante**.

## Pedidos sin pago (cambio importante del modelo)
Hoy un pedido SOLO nace cuando alguien paga (lo crea stripe-webhook). El mesero necesita lo
contrario: **el pedido se crea SIN pago y va a cocina al instante**; se cobra al final.
⚠️ Consecuencia crítica: un pedido sin cobrar **NO cuenta como venta**. Hoy `status='confirmed'`
significa "pagado" y alimenta el calendario de ventas (C1). Un pedido de mesero en 'confirmed'
inflaría los ingresos con dinero no cobrado. **Solo cuenta como venta cuando se cobra.**

## Cobro
- El mesero elige: **un solo cobro por todo el tap**, o **pedido a pedido**.
- **Dividir la cuenta**: partes iguales · por artículo · **por asiento**.
- **Pago parcial**: si uno paga y otro no, el tap **queda abierto con el saldo pendiente**.
- **Propina** al cobrar con tarjeta: sugerencias 10/15/20% + importe personalizado.
- **Propinas registradas por mesero** (para repartir después).
- **Descuentos**: porcentaje · importe fijo · invitar (gratis).
- **Efectivo**: dónde va es **configurable por negocio** (lo guarda el mesero hasta cerrar turno,
  o lo lleva a una caja central). Ver docs/CAJA.md.
- Los **pedidos pagados por QR** de esa mesa **aparecen en la vista del mesero, marcados como ya
  pagados** (los tiene que entregar igual).

## Dinero, moneda e impuestos
- **Solo USD por ahora** (no hay columna de moneda en la BD; DOP queda pendiente).
- **Impuestos: tasa fija por negocio**, sugerida al dueño y confirmada/ajustable por él. Gratis.
  ⚠️ Se descartó Stripe Tax: solo calcula donde tengas registro fiscal activo (si no, devuelve
  cero), es de pago por transacción, y un restaurante vende siempre en la misma dirección — su
  complejidad no aporta nada aquí.
- **Una sola tasa** para todo el negocio (no distinta para comida/alcohol).
- **El impuesto se SUMA al final**, no va incluido en los precios del menú.

## Integraciones con lo que ya existe
- **KDS**: el pedido del mesero aparece en cocina **con mesa y asiento de cada plato**.
- El mesero **ve el estado de cocina** de sus platos y **recibe aviso cuando uno pasa a listo**.
  Esos estados (Pendiente · Preparando · Listo para recoger) son **por plato** y los mueve el
  cocinero desde su propia terminal — ver **[docs/COCINA.md](COCINA.md)**. Hoy el terminal del
  mesero pinta el valor crudo `item_status`, que siempre dice `cooking` porque nadie lo escribe.
- **Llamadas de servicio** (`service_calls`, ya existe): llegan a su terminal con **aviso sonoro
  y visible**.
- **Reservas**: ve las de sus mesas y **puede sentarlas**.

## Auditoría
Registro de acciones sensibles: **quién anuló, quién aplicó descuento, quién reembolsó, y
cuándo**. Es la contrapartida necesaria de haber hecho esos permisos activables.

## Turnos y cierre
- Cada **mesero cierra su turno** por separado (con su arqueo si maneja efectivo).
- El **dueño cierra el día** con un resumen tipo informe Z: ventas, efectivo, propinas.

## Idioma
Español e inglés, como el resto de la app.

## ⚠️ FUERA DE ALCANCE de la v1 (decisión de Juan: escalonar)
- **Funcionar sin internet.** Rompería la disciplina de "el servidor recalcula los precios",
  exige base de datos local, cola de sincronización y **resolución de conflictos con dinero**;
  además los pagos con tarjeta no pueden ser offline igualmente. Es más trabajo que todo lo
  demás junto. **Se hará después, como proyecto propio, con los flujos ya probados.**
- **Impresión** (comanda de cocina y recibo). Un navegador no puede hablar con impresoras
  térmicas: exige impresoras de red con puente local, impresión en nube, o app nativa.
- **Tap to Pay** (contactless). Exige app nativa con SDK de Stripe Terminal, hardware y SO
  concretos, y **disponibilidad por país — hay que confirmar República Dominicana**.
- Fidelidad al cobrar · Pedidos de regalo en el terminal · Plano real con posiciones · DOP.

## v1 MÍNIMO (lo que Juan marcó como imprescindible para el primer día)
1. Ver mesas y abrir taps
2. Tomar pedidos y mandarlos a cocina
3. Cobrar (tarjeta y efectivo)
4. Dividir la cuenta
Todo lo demás se añade después.

## Dependencias técnicas conocidas
- **RLS**: hoy un empleado NO puede leer `orders`, `order_items` ni `tables` (las políticas son
  del dueño). Sin abrir ese acceso —acotado a sus mesas asignadas y las sin asignar— el terminal
  saldría VACÍO. Es el primer trabajo de B6.
- `table_tabs` ya contempla al mesero (`is_waiter_of_table`), y `menu_items` es de lectura
  pública. Esas dos ya funcionan.
