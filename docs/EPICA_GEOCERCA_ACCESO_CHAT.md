# Épica: Geocerca y Control de Acceso al Chat (JChat)

> **Documento de diseño — fuente de verdad del épico.**
> Escrito antes de tocar código, para que el código no cambie después.
> Estado: **DISEÑO APROBADO POR JUAN — pendiente de reconocimiento de código antes de construir.**
> Fecha: 2026-07-28

---

## 0. La Regla de Oro (el porqué de todo)

**Nadie que esté fuera del radio de un negocio/evento puede entrar a su chat.**

El radio no es una preferencia visual ni un dato de perfil: es el **mecanismo de control de acceso**
de la aplicación. Toda decisión de este épico se subordina a esta regla. El propósito es evitar que
personas que **no están físicamente en el lugar** entren al chat de un negocio o evento.

Consecuencia de diseño: la ubicación (centro), el radio, y la verificación de GPS son **tres piezas
del mismo mecanismo de seguridad**, no features cosméticas. Un error aquí = o entra quien no debe, o
se bloquea a quien sí está en el lugar.

---

## 1. Actores y piezas

| Actor | Qué hace |
|---|---|
| **Dueño de negocio/evento** | Fija la ubicación (centro) y el radio de su negocio; puede solicitar aumento de radio; genera QR de acceso temporal |
| **Cliente/usuario** | Intenta entrar al chat; debe estar dentro del radio (vía GPS) o tener un QR válido |
| **Super-admin (Juan)** | Define el límite global de radio; aprueba/deniega solicitudes de aumento; aplica overrides por negocio |

Sistemas involucrados (5 subsistemas conectados):
1. **Captura de ubicación** — mapa + búsqueda de dirección + pin ajustable + slider de radio (config del negocio)
2. **Enforcement de acceso por GPS** — la regla de oro en el chat
3. **Panel super-admin "Business Radius"** — límite global + overrides por negocio
4. **Cola de solicitudes de aumento de radio** — el dueño pide, el super-admin aprueba/deniega
5. **QR de acceso temporal (12h)** — vía alternativa para quien no da GPS

---

## 2. Flujo del dueño — fijar ubicación y radio

**Decisión tomada:** el dueño busca la dirección → el mapa la ubica → ajusta el pin → luego el radio.

1. Al **crear el negocio** se solicita la dirección (texto).
2. Una vez guardada, el dueño abre la pantalla de ubicación (modelo visual: la pantalla "Configure
   Home Location" que ya existe para Home — mapa + slider + círculo de geocerca).
3. **Buscar dirección** (Places Autocomplete de Google) → el mapa se centra en el resultado.
4. **Ajustar el pin** arrastrándolo al punto exacto del local (la dirección postal no siempre cae en
   la entrada real). El pin es la **fuente de verdad del centro**.
5. Al soltar el pin → **reverse geocoding** rellena el campo de dirección con la dirección de ese
   punto (dirección y coordenadas siempre concuerdan por construcción).
6. **Ajustar el radio** con un slider, dentro del límite que aplique a ese negocio (ver §4).
7. Guardar: se persiste **centro (lat/lng)** + **radio**.

**Nota de diseño:** el patrón visual ya existe (Home Location). Hay que replicarlo/reutilizarlo para
negocio/evento, añadiendo la búsqueda de dirección y el reverse-geocoding al soltar el pin.

---

## 3. Enforcement de acceso — la Regla de Oro en el chat

**Decisión tomada:** verificación **Opción 2 — check al entrar + heartbeat periódico**, con periodo
de gracia.

### 3.1 Permiso de GPS
- Se solicita **una sola vez**. Tras aprobar, la app lee el GPS sin volver a preguntar.
- **Sin permiso de GPS = no entra al chat** (única alternativa: QR, ver §6).

### 3.2 Verificación
- **Al entrar al chat:** chequeo obligatorio (gate de entrada). Dentro del radio → entra. Fuera → no entra.
- **Heartbeat:** re-chequeo **cada ~5 minutos**, **solo mientras el chat está abierto y en primer
  plano**. Si el usuario cierra el chat o manda la app a background → no se lee GPS (cero consumo).
- **Cálculo dentro/fuera:** matemática **local** (fórmula de Haversine: distancia entre coordenadas
  del usuario y centro del negocio vs. radio). **NO llama a Google — cero costo de API, corre en el
  teléfono en microsegundos.**
- **Precisión:** balanceada/media (no la de máxima batería) — suficiente para radios de cientos de
  pies, sin drenar batería.

### 3.3 Al salir del radio (con el chat abierto)
**Decisión tomada:** aviso + periodo de gracia (~2 min) antes de sacar.
1. El heartbeat detecta que el usuario salió del radio.
2. Se muestra un **aviso** ("Saliste del área de {negocio} — vuelve en 2 minutos o el chat se
   pausará", texto final a definir en i18n).
3. **Periodo de gracia ~2 min:** si vuelve a entrar al radio, el aviso desaparece y sigue con acceso.
4. Si al terminar la gracia sigue fuera → se le saca del chat **con gracia** (no un error frío):
   mensaje claro de por qué (salió del área).

### 3.4 Por qué NO seguimiento continuo en background
Descartado a propósito: consume batería real, requiere permiso "always allow location" (asusta a
usuarios, escrutado por Apple/Google), y es sobreingeniería para un chat de local. El heartbeat
solo-con-chat-abierto es el punto óptimo consumo/regla-de-oro.

### 3.5 Costo — aclaración clave
- Leer el GPS del teléfono es **gratis** (no es una llamada a Google que se paga).
- El chequeo dentro/fuera es **matemática local gratis**.
- Google solo se usa (y se paga) en la **captura de ubicación del dueño** (Autocomplete + reverse
  geocoding), que ocurre pocas veces (al configurar el negocio), NO en cada acceso de cada cliente.
- Por tanto: "miles de usuarios entrando al chat" **no genera costo de Google** — solo lecturas de
  GPS local y cálculos locales.

---

## 4. Control de radio — Super-admin "Business Radius"

**Decisión tomada:** límite global + overrides individuales por negocio.

### 4.1 Modelo de límites (dos niveles)
- **Límite global por defecto:** rango que todos los dueños pueden elegir. **Inicial: 500–1500 ft.**
  Configurable por el super-admin (NO hardcodeado — debe vivir en config/BD editable desde el panel).
- **Override por negocio:** el super-admin puede subir (o ajustar) el límite máximo de un negocio
  específico (ej. "a Bar XZX le apruebo hasta 2500 ft").
- **Regla efectiva:** el radio que el dueño elige debe respetar **el límite que aplique a SU negocio**
  (su override si lo tiene; el global si no).

### 4.2 Panel "Business Radius" (nueva sección/botón en super-admin)
- Ver y editar el **límite global** (min/max).
- Ver y editar **overrides por negocio**.
- Aplicar cambios **globalmente** (a todos) **o individualmente** (a un negocio).

### 4.3 Nota de reconocimiento
Ya existe `radius-requests` en super-admin (visto en el inventario de i18n). **Hay que verificar en el
reconocimiento** si ese subsistema ya cubre parte de esto (cola de solicitudes) o si es otra cosa. NO
duplicar lo que ya exista.

---

## 5. Cola de solicitudes de aumento de radio

**Decisión tomada:** sí, cola de solicitudes que el super-admin aprueba/deniega.

1. El dueño, desde su panel, **solicita un aumento** de su radio máximo (más allá del límite que le
   aplica hoy).
2. La solicitud entra en una **cola** visible para el super-admin.
3. El super-admin **aprueba o deniega**.
4. Al aprobar → se aplica el **override** a ese negocio (§4.1), y el dueño ya puede subir su radio
   hasta el nuevo máximo.
5. El `decision` (approved/denied) se persiste **crudo** en la BD (patrón enum-vs-dato ya establecido
   en el proyecto).

**Nota de reconocimiento:** confirmar si `radius-requests` (super-admin) YA es esta cola. Muy probable
que sí, o que sea la base. Reutilizar, no reinventar.

---

## 6. QR de acceso temporal (12h)

**Decisión tomada:** vía alternativa para usuarios que no dan GPS.

### 6.1 Concepto
- El **dueño genera un QR** desde su panel de administración.
- El QR da acceso al chat de **ese negocio específico** por **12 horas**, **sin necesidad de GPS**.
- El usuario **escanea el QR** (físicamente presente en el local, porque el QR está impreso ahí) →
  entra al chat → acceso válido 12h → expira.

### 6.2 Por qué NO rompe la Regla de Oro
El QR está **impreso en el local**. Para escanearlo hay que estar físicamente ahí. Así que el QR
**refuerza** la regla de oro por otra vía (presencia física verificada por estar frente al QR), en
lugar de saltársela. Es el escape controlado para quien no quiere dar permiso de GPS.

### 6.3 Piezas
- Generación del QR desde el panel del dueño (token con expiración 12h, ligado al negocio).
- Validación al escanear (token válido + no expirado → acceso 12h al chat de ese negocio).
- El usuario con QR válido **no entra en el heartbeat de GPS** — su acceso lo gobierna el token.

### 6.4 Nota de reconocimiento
Ya existe un sistema de **QR de mesas** (subsistema Mesas/Taps, con QR por mesa + subchat opcional).
**Verificar** si esa infraestructura de QR/token se puede reutilizar para el QR de acceso de 12h, o si
es un mecanismo distinto. NO duplicar la generación/validación de tokens si ya hay una base.

---

## 7. Datos (a confirmar en reconocimiento — NO asumir)

El reconocimiento de código debe responder, ANTES de construir:

1. **¿La tabla `businesses` ya tiene columnas de coordenadas?** (lat/lng, o PostGIS geography/point).
   ¿Y de radio? ¿Cómo se guarda hoy la dirección?
2. **¿El mapa de Configuration ya es interactivo** (pin arrastrable) o solo visualiza?
3. **¿Ya hay geocoding** (Autocomplete / reverse) en el código? ¿Qué APIs de Google están habilitadas?
4. **¿`radius-requests` (super-admin) ya es la cola de solicitudes** de §5, o es otra cosa?
5. **¿El límite de radio está hardcodeado hoy** (viste "350–3000 ft" en Home) o ya es configurable?
   ¿Dónde vive? Home usa 350–3000; negocio será 500–1500 — ¿comparten mecanismo o son separados?
6. **¿Cómo entra hoy un usuario al chat de un negocio?** ¿Hay ya ALGÚN chequeo de ubicación, o entra
   libre? Esto define cuánto del enforcement (§3) ya existe.
7. **¿El QR de mesas (Mesas/Taps) tiene infraestructura de token reutilizable** para el QR de 12h (§6)?
8. **¿Quién LEE lat/lng/radio hoy?** (mapa público, pin móvil, cálculo de proximidad). Para no romper
   consumidores al cambiar la captura.
9. **Enforcement server-side vs client-side:** CRÍTICO por seguridad. El chequeo de "dentro del radio"
   NO puede ser solo client-side (un cliente malicioso lo saltaría). ¿Dónde se valida hoy el acceso al
   chat — RLS, Edge Function, cliente? La regla de oro necesita respaldo **server-side** (el heartbeat
   client-side es UX; la barrera real debe ser server-side).

---

## 8. Corte propuesto (orden por dependencia — a refinar tras reconocimiento)

> El orden real depende de qué ya exista. Propuesta inicial:

- **Fase 0 — Reconocimiento** (solo lectura): responder las 9 preguntas de §7. Sin esto no se construye.
- **Fase 1 — Datos y captura de ubicación:** schema de coordenadas+radio (si falta), mapa interactivo
  con búsqueda + pin + reverse-geocoding en config del negocio.
- **Fase 2 — Límite de radio configurable + panel super-admin "Business Radius":** global + overrides.
- **Fase 3 — Enforcement de acceso (la Regla de Oro):** gate al entrar + heartbeat + gracia, con
  respaldo **server-side**. El corazón del épico.
- **Fase 4 — Cola de solicitudes de aumento:** (o reutilizar/completar `radius-requests`).
- **Fase 5 — QR de acceso 12h:** generación (panel dueño) + validación (escaneo) + bypass del heartbeat.

Cada fase: reconocimiento → spec en español copy-paste → Claude Code ejecuta → auditoría full_patch.
Igual que toda la metodología del proyecto.

---

## 9. Decisiones cerradas (resumen para no reabrir)

| Tema | Decisión |
|---|---|
| Regla de oro | Nadie fuera del radio entra al chat |
| Centro de la geocerca | Buscar dirección → mapa → **ajustar pin** (pin = fuente de verdad) |
| Dirección | Se deriva del pin (reverse geocoding); concuerda con las coordenadas |
| Rango de radio inicial | **500–1500 ft**, configurable por super-admin |
| Control de radio | Límite global + **overrides individuales** por negocio |
| Solicitud de aumento | **Cola** que el super-admin aprueba/deniega → aplica override |
| Sin permiso GPS | **No entra** (salvo QR) |
| Verificación GPS | **Check al entrar + heartbeat ~5 min (solo chat abierto en primer plano)** |
| Cálculo dentro/fuera | **Haversine local** — gratis, sin llamar a Google |
| Al salir del radio | **Aviso + gracia ~2 min** → luego sacar con gracia |
| Background tracking | **Descartado** (batería/permisos/sobreingeniería) |
| QR alternativo | Genera el dueño desde panel; **12h**; ligado al negocio; refuerza la regla (presencia física) |
| Costo | GPS local + Haversine = gratis; Google solo en captura del dueño (poco frecuente) |

---

## 10. Riesgos y principios (heredados de la metodología del proyecto)

- **Server-side es la barrera real.** El heartbeat client-side es UX; el acceso al chat debe validarse
  server-side (RLS / Edge Function). Un cliente no puede ser la única línea de defensa de la regla de oro.
- **Degradar con gracia:** si Google no responde (Autocomplete/geocoding), el dueño no debe quedar
  bloqueado sin poder guardar. Ofrecer fallback (pin manual sin búsqueda).
- **No romper consumidores de lat/lng:** el mapa público, el pin móvil y la proximidad ya leen
  coordenadas. Cambiar la CAPTURA no debe alterar el formato que ellos consumen.
- **enum-vs-dato:** `decision` de solicitudes, estados, etc. → value crudo en BD, solo display traducido.
- **No duplicar lo existente:** `radius-requests`, QR de mesas, geocerca de Home ya existen en alguna
  forma — reutilizar antes de reinventar.
- **i18n desde el inicio:** todo texto nuevo, bilingüe EN/ES (neutro-latino), como el resto del proyecto.
