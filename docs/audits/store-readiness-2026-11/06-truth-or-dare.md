# Bloque 6 — Truth or Dare (parcial)

Fecha: 2026-11-02 · main `9bd62175` (OTA vigente) · Evidencia: `screenshots/b06/` (sin commit).
Cuentas: **@test** (Android 35) publica; **@test1** (iPhone 17 Pro) juega. Local: Bar XZX (cuentas y local de prueba). No se envió ningún reporte ni se confirmó ningún bloqueo.

## Qué se probó
| Elemento | Resultado |
|---|---|
| Acceso: "+" → Juegos → Truth or Dare (Android e iOS) | OK |
| Reglas ("Reglas del juego", ⓘ) | OK: "Nada es obligatorio, puedes pasar" · "Sin alcohol, sin contenido íntimo, sin insultos" · "Puedes reportar y bloquear" · aviso de que tu nombre aparece al publicar (`android35-03`) |
| Elegir categoría y publicar (Android) | OK: 5 categorías (Clásico, Fiesta, Risas, Confesiones, Talento); la carta aparece en la sala con temporizador 30:00, "Iniciada por Test", contador de jugadores y "Cerrar" para quien la inició (`android35-05`) |
| Jugar una carta (iOS) | OK: Verdad / Reto / Aleatorio; la carta robada es privada ("Solo tú la ves hasta que decidas") con Publicar / Paso; espera de 5 min visible ("Vuelve en 4:57") (`ios17pro-02`) |
| Publicar resultado | OK: "@test1 le tocó VERDAD: …" en la sala, con reacción 👏 |
| Reportar / bloquear desde el resultado de otra persona (Android) | OK: enlace **Reportar** visible → hoja "Reportar mensaje" / "Bloquear a test1" / Cancelar (`android35-07`) |
| Contenido de las cartas (solo lectura) | OK: 2.000 cartas activas (5 categorías × 200 × es/en); búsqueda de alcohol, sexo, desnudez, drogas y pareja → 11 coincidencias, **todas falsos positivos** ("bedtime", "enseñaron"…). Sin contenido adulto |

## Hallazgos
| ID | Sev. | Pantalla / plataforma | Pasos | Esperado → Obtenido | Evidencia | Propuesta (sin implementar) |
|---|---|---|---|---|---|---|
| B6-1 | P3 | Carta en la sala · iOS | Ver la carta de otra persona | Etiquetas completas → el tercer botón dice "Aleato…" (recortado) | `ios17pro-01` | Permitir dos líneas o acortar a "Azar" |
| B6-2 | P3 | Lector de pantalla / pruebas · Android | Con una carta activa, volcar el árbol de accesibilidad | El árbol debe poder leerse → el temporizador que cambia cada segundo impide que UIAutomator alcance el estado "idle" (`could not get idle state`); TalkBack no se ve afectado normalmente, pero **no verificado con TalkBack real**. Conviene que el temporizador no se anuncie cada segundo | — | Marcar el reloj `accessibilityLiveRegion="none"` y anunciar solo cada minuto |
| B6-3 | — (cerrado sin acción) | Reglas · todas | Leer las reglas en un local que es un bar | La regla "Sin alcohol" convive con un local de bebidas → **se queda por decisión de Juan**: reduce el riesgo con Apple 1.4.3 | `android35-03` | Ninguna |

## Pendiente de decisión (no es defecto)
Apple 1.2 / clasificación por edad: el juego se sirve solo con edad confirmada 18+, las cartas son blandas y hay reporte y bloqueo; la clasificación de contenido adulto se resuelve en el cuestionario de edad de las tiendas (FASE 6).

## No probado y por qué
| Qué | Motivo |
|---|---|
| Reto y Aleatorio, publicar una carta con 5 categorías distintas, cooldown completo, expiración a 30 min | Solo se jugó Verdad en Clásico; el cooldown de 5 min se vio pero no se esperó |
| Reportar y bloquear de verdad, autoocultar por reportes | No se enviaron reportes contra cuentas reales |
| Panel del dueño (`/dashboard/truth-or-dare`), `tod_settings`, `tod_moderation_log` | Bloque 11 (dashboard) |
| Tema oscuro, letra grande, VoiceOver/TalkBack real, Android 36 y 26, iPhone 17e | No se alcanzó |
| Pantalla de reglas para quien no ha aceptado | @test y @test1 ya habían aceptado; hace falta cuenta nueva (@test002 tras el Bloque 2) |

## Estado en que quedan las cuentas y los dispositivos
Una ronda activa (30 min) de @test en Bar XZX con un resultado de @test1; caducará sola. Ambos siguen dentro del chat de Bar XZX.

## Actualización 2026-11-03: reglas sin aceptación previa (cuenta @test002 recreada)
Cuenta nueva `3ddf4a2e…`, dentro de Bar XZX, con «Take part in games» activado (viene activado por defecto). Juegos → Truth or Dare:
| Comprobación | Resultado |
|---|---|
| ¿Aparecen las reglas antes de jugar? | **Sí**: hoja «Welcome to Truth or Dare» con tres reglas (nada es obligatorio, sin alcohol/contenido íntimo/insultos, se puede reportar y bloquear), el aviso de que el nombre aparece en el chat al publicar el resultado y los botones «I agree and play» / «Not now» (`screenshots/b02/tod-reglas-sin-aceptacion.png`) |
| Pulsar «Not now» | Vuelve al chat; no se crea ninguna carta ni aceptación (`tod_terms`: 0 filas para la cuenta) |
| ¿Lo exige el servidor? | Sí en lo esencial: `tod_draw` y `tod_create_round` consultan `tod_terms` (y existe `tod_accept_terms`); `tod_post_message`, `tod_applaud` y `tod_decide` no lo consultan por sí mismas (dependen de que exista una carta/ronda). No se probó llamarlas directamente |
| Aceptación | **No se aceptó**, como se pidió |
Sin hallazgos nuevos en ToD. El texto de las reglas es el mismo que ya estaba documentado.
