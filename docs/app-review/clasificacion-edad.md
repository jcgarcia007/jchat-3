# Clasificación por edad — Apple (cuestionario) y Google (IARC)

> **BORRADOR para revisión de Juan · 2026-11-06.** Las consolas cambian sus cuestionarios con frecuencia (Apple reorganizó las franjas en 2025: 4+, 9+, 13+, 16+, 18+): **contesta con lo que muestre la consola hoy**; esto es la respuesta por función y la razón de cada una. Resultado buscado: **18+** en ambas. No contestes para bajar de 18: JChat es solo para adultos (18+ autodeclarado y confirmado en servidor con `confirm_age`; el borrado/registro rechaza menores de 18).

## Apple — App Store Connect → Clasificación por edad

| Tema del cuestionario | Respuesta | Razón (qué hace la app) |
|---|---|---|
| Mensajes o chat entre usuarios / contenido generado por usuarios | **Sí** | Chat del local, mensajes directos, publicaciones, comentarios, Match, Verdad o Reto |
| Acceso web sin restricciones (navegador) | No | No hay navegador; los enlaces abren la web de JChat |
| Alcohol, tabaco o drogas (referencias) | **Sí, poco frecuente o leve** | Los menús de los locales pueden listar cerveza y vino (productos 21+ con aviso). La app no promueve el consumo y no vende ni envía nada |
| Contenido sexual o desnudez | **No** | Las fotos de DM y Match pasan por Google Cloud Vision SafeSearch y se bloquean las explícitas; hay reportes y moderación humana en 24 h |
| Temas sexuales sugerentes / "mature/suggestive themes" | **Sí, poco frecuente o leve** | Match (conocer gente del local) y Verdad o Reto (preguntas y retos; el contenido lo escriben los usuarios y está sujeto a reportes) |
| Violencia (realista, caricaturesca), armas | No | |
| Terror / temas de miedo | No | |
| Lenguaje soez / humor crudo | **Leve** | Contenido de usuarios; filtro de palabras en chat, comentarios y DMs |
| Apuestas simuladas / juegos de azar / concursos | No | Verdad o Reto no tiene premios ni apuestas |
| Medicina / salud | No | |
| Compras dentro de la app | No hay bienes digitales | Solo comida y bebida consumida en el local (3.1.3(e)) |
| Controles parentales / verificación de edad | La app exige confirmar la edad (18+) | `ConfirmAge`; solo se guarda el año de nacimiento |

Resultado esperado: **18+**. Si la consola calcula una franja inferior por las respuestas de arriba, súbela a 18+ con la opción de "mayor de 18" (Apple permite una clasificación por encima de la calculada).

## Google Play — Cuestionario IARC

| Tema | Respuesta | Razón |
|---|---|---|
| Categoría | **Red social / comunicación** (redes sociales, citas/mensajería) | Chat entre personas presentes en un local |
| Los usuarios pueden interactuar o intercambiar contenido | **Sí** | Chat, DMs, publicaciones, Match |
| Comparte la ubicación del usuario con otros usuarios | **No** | Se usa solo para confirmar presencia; nunca se muestra |
| Compras de bienes digitales | No | Solo bienes físicos consumidos en el local |
| Violencia / sangre | No | |
| Contenido sexual y desnudez | No | Fotos explícitas bloqueadas (Vision) + reportes |
| Lenguaje soez | **Sí, en contenido de usuarios** | Contenido generado por usuarios, moderado |
| Sustancias controladas (alcohol/tabaco/drogas) | **Referencias a alcohol: Sí** | Productos en los menús de los locales |
| Juego de azar | No | |
| Público objetivo y contenido | **18 años o más** | |
| Anuncios | No contiene anuncios | |

Resultado esperado: **Adultos (18+) / "Mature 17+"** según la región (ESRB: Mature 17+; PEGI 18 si la consola lo ofrece; en cada región la consola decide el nombre).

## Pendiente de Juan
1. ¿Confirmas que Verdad o Reto y Match se declaran "temas sexuales leves"? Es la respuesta prudente; lo contrario arriesga un rechazo por clasificación incorrecta.
2. Que la misma fecha mínima (18) esté en la ficha, los términos y `confirm_age`. Hoy es 18 en los tres.
