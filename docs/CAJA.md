# Caja (efectivo) — modelo de producto (2026-07-19)

> El terminal donde vive la caja está especificado en [docs/TERMINAL_MESERO.md](TERMINAL_MESERO.md).

## Por qué
Un mesero cobra en efectivo en la mesa. Ese dinero tiene que quedar registrado y trazable, y lo
que NO se cobró tiene que quedar justificado y a la vista del dueño. Sin esto, el efectivo se
pierde sin rastro.

## Reglas decididas por Juan
- **Un tap de mesero NO se puede cerrar "a secas".** Al cerrarlo hay dos caminos:
  1. **Cobró en efectivo:** desde su terminal pulsa "Cash", registra la entrada de efectivo y el
     SISTEMA GENERA UN CÓDIGO. Ese código identifica el pago y queda ligado al tap.
  2. **No cobró:** escribe una RAZÓN. El tap sale de "abierto" (la mesa se libera) pero queda
     **PENDIENTE DE REVISIÓN**, no cerrado. **Solo el PROPIETARIO** puede cerrarlo
     definitivamente, al final del día.
- Tras cualquiera de los dos caminos, **la mesa queda sin taps abiertos**.
- La caja funciona con **TURNOS**: apertura (con fondo inicial), cierre con **arqueo**
  (efectivo contado vs esperado, y la diferencia). Por turno/mesero.

## Fases
- **D1 — Turnos de caja:** abrir turno con fondo inicial; cerrar con arqueo (contado vs esperado
  vs diferencia). Por negocio y por empleado.
- **D2 — Entradas de efectivo:** cada cobro con importe, código generado, empleado, momento, y
  ligado al turno abierto.
- **D3 — Cierre justificado del tap:** el cierre exige código de caja O razón; nuevo estado
  "pendiente de revisión" para el segundo caso.
- **D4 — Revisión del dueño:** pantalla para cerrar los taps pendientes y ver los arqueos del día.

## ⚠️ Dependencia dura: B6
Todo esto vive en **la terminal del mesero**, que HOY NO EXISTE. El dashboard exige plan
business/pro; un empleado no puede entrar. B6 (superficie del mesero) es prerequisito de la caja
—y ya lo era de la asignación de mesas (B4), los taps de mesero y el panel (B2)—.

## Cobro desde la terminal del mesero (fase D5)
El mesero cobra un tap desde su terminal por tres vías:
- **Tarjeta** (cobro normal).
- **Efectivo** → genera la entrada de caja con su código (ver D2).
- **Contactless / Tap to Pay** (acercar la tarjeta al teléfono del mesero) → **FASE POSTERIOR**,
  pero es un objetivo confirmado.

**Dividir la cuenta:** el mesero puede dividir un tap **de dos formas, a su elección**:
- **Partes iguales** entre N personas.
- **Por artículos** (marca qué platos van a cada persona).

⚠️ **Nota técnica sobre Tap to Pay:** requiere el SDK nativo de Stripe Terminal, con requisitos
duros de hardware/SO (iPhone XS+ con iOS reciente; Android con NFC certificado) y disponibilidad
POR PAÍS — hay que confirmar República Dominicana antes de comprometerlo. Por eso va en fase
aparte, después de que el cobro con tarjeta y efectivo funcionen.

## Estado
Modelo definido, SIN implementar. Orden acordado: C3 → B6 → D1-D4.
