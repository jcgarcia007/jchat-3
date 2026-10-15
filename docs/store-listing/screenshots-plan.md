# Plan de capturas para las tiendas (borrador para revisión de Juan)

> **No se sube nada a ninguna consola desde este documento.** Es la lista de qué capturar, en qué orden y con qué texto encima.

## Reglas de captura (obligatorias)

1. **Cuenta demo y datos limpios, nunca las cuentas de prueba actuales** (`test`, `test1`, `@jcgarcia007_1bc7f2`): sus chats y mensajes directos tienen contenido de pruebas, y el DM de `test1` en iOS contiene una imagen explícita que no debe aparecer en ninguna captura ni en el borde de ninguna.
2. Un local de demostración propio (nombre neutro, menú con 5–6 productos reales y fotos con derechos), con **personas de demostración** hechas por el equipo (o con consentimiento por escrito). Nada de fotos de terceros, ni de caras de la gente real del local.
3. Sin datos reales de nadie: correos, nombres de usuario, ubicación exacta, números de pedido reales. Pedidos de ejemplo con importes redondos.
4. Idioma del teléfono = idioma de la captura (una tanda en español y otra en inglés); hora 9:41 y batería llena en iOS; barra de estado limpia en Android (modo demostración).
5. Texto del sistema al tamaño normal (iOS `large`, Android `font_scale 1.0`), modo claro (el oscuro solo si Juan lo quiere de variante).
6. Sin el botón flotante "Tools" del cliente de desarrollo: capturar siempre con un build de producción / TestFlight.
7. Sin precios en ningún lugar (la v1 no los muestra en tienda); sin "Verified" ni funciones futuras; 18+ visible en la primera o la sexta.

## Tamaños exigidos

| Tienda | Dispositivo | Tamaño (px) | Notas |
|---|---|---|---|
| App Store | iPhone 6,9" (obligatorio: iPhone 16/17 Pro Max) | **1320 × 2868** | De 1 a 10 capturas; PNG o JPEG sin transparencia. Las demás medidas de iPhone se escalan a partir de esta. |
| App Store | iPhone 6,5" (opcional) | 1284 × 2778 | Solo si se quiere otra versión; si no se sube, Apple usa la de 6,9". |
| Google Play | Teléfono | **1080 × 1920** como mínimo (relación 9:16; cada lado entre 320 y 3840 px, el lado largo no más del doble del corto) | De 2 a 8 capturas; PNG o JPEG de 24 bits sin transparencia. |
| Google Play | Gráfico de funciones (feature graphic) | 1024 × 500 | Obligatorio; no es captura de pantalla. |

Las capturas con texto superpuesto se componen sobre la captura real (marco de teléfono opcional); el lienzo final conserva el tamaño exacto de la tabla.

## Las 6 pantallas, en este orden (iOS y Android igual)

| # | Pantalla | Qué se ve | Texto superpuesto ES | Texto superpuesto EN |
|---|---|---|---|---|
| 1 | **Cerca de ti** (pestaña "Cerca de mí") | Lista de 3 locales de demostración abiertos, con "Entrar". | **Encuentra tu local** | **Find your venue** |
| 2 | **Aviso de entrada y chat del local** | El aviso "Antes de entrar" (privacidad, "Entrar al chat") y, de fondo o en la mitad inferior, el chat con 4–5 mensajes de personas de demostración. | **Habla con quien está ahí contigo** | **Talk to the people there with you** |
| 3 | **Menú y pedido** | Hoja del menú con fotos y el pedido "Confirmado" en el seguimiento (sin precios a la vista si es posible: encuadrar la lista sin importes). | **Pide desde tu mesa** | **Order from your table** |
| 4 | **Ofertas** | Pestaña "Ofertas" con 2 tarjetas de ofertas de demostración. | **Descubre ofertas cerca de ti** | **Find offers near you** |
| 5 | **Match** | La baraja con una persona de demostración y los botones (pasar, super like, me gusta). | **Conoce gente en el mismo local** | **Meet people at the same venue** |
| 6 | **Verdad o Reto** | La carta girada ("VERDAD" + una pregunta suave), y el rótulo "Solo mayores de 18" en una esquina. | **Juega con el local · +18** | **Play with the venue · 18+** |

Notas por captura:
- **2:** mostrar el aviso con el botón "Entrar al chat" y "Ahora no" (iOS: el aviso se titula "Juegos en {local}" cuando Match está activo; elegir una de las dos variantes y usar la misma en ambos idiomas).
- **5 y 6:** usar solo cartas y perfiles de demostración suaves (nada sexual ni explícito en las cartas); revisar que no aparezca ningún texto de usuarios reales.
- **Android:** capturar en un Pixel de 1080 × 2400 y recortar o rellenar a 9:16 si hace falta (1080 × 1920); no recortar la barra de pestañas a la mitad.

## Cómo capturarlas (sugerencia)

- iOS: simulador "iPhone 17 Pro Max" (1320 × 2868) con `xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4` y `xcrun simctl io booted screenshot`.
- Android: emulador Pixel con "Demo mode" de la barra de estado y `adb exec-out screencap -p`.
- Si se usan flujos de Maestro (`mobile/.maestro`), que corran **solo contra la cuenta demo** y solo con `takeScreenshot` (no hay flujos para esto todavía).
