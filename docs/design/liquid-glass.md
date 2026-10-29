# Estudio: Liquid Glass en la barra de navegación y el perfil

**Solo estudio, sin código de la app.** Fecha: 2026-10-29. Objetivo (según tu descripción del mockup del canvas): barra en cápsula de vidrio con Mapa, Cercanos, Mensajes y Perfil; un círculo de vidrio aparte para Publicar; perfil con portada a sangre y botones de vidrio; barras que se encogen al bajar; y **sin** las cifras de Publicaciones, Seguidores y Siguiendo.

## Límites de este estudio (léelos primero)

- **El mockup del canvas no está en el repositorio.** En `design/mockups/` solo hay `mockup_aviso_perfil.png`, `mockup_perfil_hoja.png` (el perfil como hoja sobre el chat, otra idea) y `mockup_web_flow.png`. Me baso en tu descripción; si hay detalles que no dijiste (colores, tamaños de la cápsula, qué hace "Publicar" exactamente) hay que confirmarlos.
- **Apple:** la página "Adopting Liquid Glass" no cargó entera en esta sesión (solo el título). Lo que digo de Apple sale de mi conocimiento general y está marcado como tal; **verifícalo en la documentación viva**. No tengo información fiable sobre qué cambia en **iOS 27**: la API de Expo que documento es para **iOS 26 o superior**. Si iOS 27 añade o cambia algo (por ejemplo, el futuro de la clave `UIDesignRequiresCompatibility`), hay que releerlo antes de implementar.
- **Expo:** leí `docs.expo.dev/versions/latest/sdk/glass-effect/`, que hoy es la página del **SDK 58 (`expo-glass-effect` 58.0.0)**. El proyecto está en el **SDK 57** (`expo ~57.0.29`); en npm la etiqueta `sdk-57` apunta a `expo-glass-effect@57.0.4`. La API es la misma en lo que he leído, pero conviene mirar la página del SDK 57 antes de empezar.

## 1. Qué ofrece `expo-glass-effect`

Fuente: documentación de Expo (SDK 58, v58.0.0).
- Componentes que dibujan el efecto nativo de iOS (`UIVisualEffectView`): **`GlassView`** y **`GlassContainer`** (junta varias vistas de vidrio en un solo efecto que se funde; la prop `spacing` marca la distancia a la que empiezan a fundirse). Es justo lo que necesitan la cápsula y el círculo de "Publicar" juntos.
- Props de `GlassView`: `glassEffectStyle` (`'clear'`, `'regular'` por defecto, `'none'`, o un objeto con `style`, `animate`, `animationDuration`), `tintColor`, `isInteractive` (por defecto `false`) y `colorScheme` (`auto`, `light`, `dark`).
- Funciones: `isLiquidGlassAvailable()` (mira sistema, compilador y Info.plist; **devuelve `true` aunque Accesibilidad limite el efecto**, así que hay que mirar también `AccessibilityInfo.isReduceTransparencyEnabled()`) e `isGlassEffectAPIAvailable()` (algunas betas de iOS 26 no tienen la API y **fallan** si se usa `GlassView`: comprobarla antes).
- **Solo iOS 26+.** En otras plataformas el componente cae a una `View` normal. La página no documenta el comportamiento en Android: hay que construir el fallback nosotros.
- Limitación documentada: una opacidad por debajo de 1 en `GlassView` o en sus padres no se recomienda (Apple lo desaconseja) y con opacidades muy bajas el vidrio no se dibuja; la solución de Expo es animar la opacidad de un contenedor con Reanimated y alternar `glassEffectStyle` entre el estilo y `'none'`. Importa para "las barras se encogen al bajar".
- La página no habla de config plugin, de Xcode 26 ni de si hace falta *development build* (sí dice que el módulo está en Expo Go).

## 2. Qué hay hoy en el código

- `mobile/components/navigation/NotchTabBar.tsx` (301 líneas): barra con **muesca** central dibujada con SVG (`notchPath`), sombra con filtro SVG y, en iOS, `BlurView` de `expo-blur` enmascarado con la forma de la barra; en Android, relleno translúcido (`tabBarGlassAndroid`, 94 %). Dibuja solo las cuatro pestañas; el botón central navega a la ruta oculta `Offers`.
- `mobile/navigation/tabs/BottomTabs.tsx` (55 líneas): `createBottomTabNavigator` de React Navigation 7 con `tabBar={(props) => <NotchTabBar …/>}`. Rutas: `Map`, `Nearby`, `Messages`, `Profile` y la oculta `Offers`.
- `mobile/components/profile/ProfileHeader.tsx` (336 líneas): avatar con anillo, fila de cifras (`Stat` de Publicaciones, Seguidores, Siguiendo; las dos últimas abren la pantalla de amigos) y botones de seguir/mensaje/editar.
- `mobile/screens/profile/ProfileScreen.tsx` (440 líneas): `openFriends('followers'|'following')` navega a `Friends`; botón de publicar → `CreatePost`; ajustes → `Settings`.
- Hoy el centro de la barra es **Ofertas**, no "Publicar". El mockup cambia eso: hay que decidir dónde vive Ofertas (ver preguntas abiertas).

## 3. Qué cambiaría

| Archivo | Cambio |
|---|---|
| `components/navigation/NotchTabBar.tsx` | Sustituir la muesca SVG por una **cápsula** (4 pestañas) dentro de un `GlassContainer`, más un **círculo** aparte para Publicar. Quitar `notchPath`, el filtro de sombra y el `BlurView` en iOS 26+. Mantener el camino actual (blur) para iOS < 26 y el translúcido para Android. Nombre nuevo sugerido: `GlassTabBar.tsx` (con `.web.tsx` si la web necesita CSS aparte). |
| `components/glass/GlassSurface.tsx` (nuevo) | Un solo componente que decide el material: `GlassView` (iOS 26+, con la API presente y sin "Reducir transparencia"), `BlurView` (iOS < 26), color sólido translúcido (Android), `backdrop-filter` (web). Toda la lógica de decisión en una función pura testeable. |
| `navigation/tabs/BottomTabs.tsx` | Pasar a `GlassTabBar`; la ruta central pasa a abrir `CreatePost` (o una hoja de publicar); decidir dónde queda `Offers` (pestaña oculta en la cápsula o dentro de Cercanos). |
| `components/profile/ProfileHeader.tsx` | Portada a sangre (detrás de la barra de estado), avatar y nombre sobre un degradado; **quitar la fila de cifras**; botones de vidrio (atrás, ajustes, ⋯). |
| `screens/profile/ProfileScreen.tsx` | Cabecera que se encoge al hacer scroll (valor compartido de Reanimated desde `onScroll`); botones de vidrio flotantes; punto de entrada a seguidores/siguiendo (sección 6). |
| `theme/tokens.ts` | **Posible token nuevo** (propuesta, no creado): un tinte del vidrio para modo claro/oscuro (`glassTint`) y un relleno opaco para "Reducir transparencia" (`glassSolid`). Hoy existen `tabBarGlass*`, que sirven de punto de partida. |
| `package.json` | Añadir `expo-glass-effect@~57.0.4` (`npx expo install expo-glass-effect`). |

"Las barras se encogen al bajar": la cápsula se reduce a un círculo/mini-barra al hacer scroll hacia abajo y vuelve al subir. Requiere un contexto de dirección de scroll (`ScrollCollapseContext`) que las pantallas con listas largas alimenten desde `onScroll` (Cercanos, Mensajes, Perfil, el chat). Empezar por Perfil y Cercanos.

## 4. ¿Cambia el fingerprint de EAS?

**Sí.** `expo-glass-effect` es un módulo nativo nuevo: entra en el autolinking de iOS y de Android y cambia el hash de ambas plataformas → **build nuevo, no se puede enviar por OTA**. Para medirlo: añade la dependencia en una rama de prueba y ejecuta `npx fingerprint fingerprint:generate --platform ios|android` (solo lee el proyecto; así comprobé lo mismo para las billeteras en `docs/app-review/wallets-nativos.md`).

Dos cosas más sobre iOS:
- Si EAS compila con **Xcode 26 o superior** y el Info.plist **no** tiene `UIDesignRequiresCompatibility` (hoy no lo tiene), los componentes *del sistema* (alertas, cabeceras nativas, hojas) **ya adoptan Liquid Glass en iOS 26 aunque no toquemos nada**. Conviene mirar la app en un iPhone con iOS 26 antes de nada. Esa clave permite volver temporalmente al diseño anterior; Apple la ha descrito como transitoria (de memoria: **verifícalo**).
- `isLiquidGlassAvailable()` valida esa clave, así que ponerla a "compatibilidad" apagaría el vidrio incluso en iOS 26.

## 5. Riesgos

1. **Rendimiento.** El vidrio vivo cuesta GPU. Reglas: pocas superficies por pantalla (cápsula + círculo + 2–3 botones del perfil), todas dentro de `GlassContainer` cuando sea posible, nunca vidrio sobre vidrio y nunca en listas (filas, tarjetas, fotos): Apple lo reserva para la capa de navegación y controles, no para el contenido (de memoria; verificar).
2. **Accesibilidad.** "Reducir transparencia", "Aumentar contraste" y "Reducir movimiento" deben tener camino propio: relleno opaco con los tokens `bgElevated`/`textPrimary` (que ya cumplen 4,5:1, ver `theme-contrast.test.mjs`), sin animación de encogerse. Las pruebas actuales de contraste (`contrast-main-screens.test.mjs`) **no pueden medir texto sobre vidrio ni sobre una foto**: hace falta revisión manual y un scrim bajo los textos de la portada.
3. **Compatibilidad.** Android y la web **no tienen** Liquid Glass: se verá el material de fallback (translúcido/sólido, `backdrop-filter` en web). Aceptar que no será idéntico o dibujar un diseño intermedio. Betas de iOS 26 sin la API: proteger con `isGlassEffectAPIAvailable()`.
4. **Opacidad.** La limitación documentada de opacidad <1 choca con "encogerse al bajar" si se anima con opacidad: animar tamaño/posición, no opacidad del padre del vidrio.
5. **Tienda y capturas.** Cambia la apariencia de la barra y del perfil: las capturas de `docs/app-review/ficha-tienda.md` deben hacerse **después**.
6. **Pruebas visuales.** No hay forma de probar el vidrio en el simulador del navegador ni en Playwright; solo en iPhone con iOS 26.

## 6. Dónde quedan Seguidores y Siguiendo si se quitan del perfil

**Opción A — entrada "Amigos" en el menú ⋯ y en un botón de vidrio de la portada.** Un botón "Amigos" (icono de personas) en la cabecera abre la pantalla `Friends` que ya existe, con sus pestañas Seguidores / Siguiendo (los números salen en la cabecera de **esa** pantalla, no en el perfil). En perfiles ajenos, el ⋯ ofrece "Ver seguidores" solo si la cuenta es pública o ya la sigues (respeta la regla de privacidad actual). Es lo más fiel al mockup (perfil limpio) y no cambia ningún dato.

**Opción B — línea de texto sin cifras bajo la biografía.** "Seguidores · Siguiendo" como dos enlaces de texto, sin números (o con un punto de aviso solo si hay solicitudes pendientes en el perfil propio). Mantiene el acceso en un toque y evita la presión de las cifras, pero añade una fila que el mockup no tiene.

Recomendación: **A** para el perfil propio y ajeno, más el aviso de solicitudes de seguimiento en el icono "Amigos" (hoy se ve en las cifras). Las publicaciones se ven en la cuadrícula, así que "Publicaciones" no necesita sustituto. Ojo: `profile.header.statsA11y` (texto para lectores de pantalla) y los textos de `Stat` dejan de usarse: limpiarlos al implementar.

## 7. Plan por pasos

0. **Preguntas abiertas** (tú): ¿Publicar abre `CreatePost` directo o una hoja? ¿Dónde vive Ofertas (hoy es el botón central)? ¿Opción A o B para Seguidores/Siguiendo? ¿Android y web con fallback translúcido, o un diseño propio?
1. **Spike (rama `spike/liquid-glass`).** `npx expo install expo-glass-effect`, una pantalla de prueba con `GlassView`/`GlassContainer` y `isLiquidGlassAvailable()`; medir el fingerprint; probarlo en un iPhone con iOS 26 y en uno con iOS anterior (build de desarrollo, que haces tú).
2. **`GlassSurface`** + función pura `glassMode({ platform, iosMajor, liquidAvailable, apiAvailable, reduceTransparency })` con **tests Node** de todas las combinaciones, y un test estático que impida colores sueltos (solo tokens).
3. **`GlassTabBar`** (cápsula + círculo) detrás de un interruptor (`EXPO_PUBLIC_GLASS_TABS`) para poder apagarlo; mantener `NotchTabBar` hasta validar. Añadir el archivo a `MAIN_SCREEN_FILES` de `a11y-main-screens.mjs` (etiquetas, 44 pt, hitSlop).
4. **Encoger al bajar**: `ScrollCollapseContext` + `useScrollCollapse(onScroll)` y su test unitario (la lógica de umbrales y dirección es pura); conectarlo a Perfil y Cercanos primero. Reducir movimiento → sin animación.
5. **Perfil**: portada a sangre, botones de vidrio, sin cifras, entrada "Amigos" (Opción A). Tests: estático (la fila de cifras ya no está, el botón "Amigos" tiene etiqueta es/en), `check-i18n.mjs` y contraste.
6. **Pruebas**: Node, hermético y WebKit (la web usa el fallback `backdrop-filter`, así que se puede cubrir con Playwright), más una pasada manual en iPhone iOS 26 / iOS 18, Android y con Reducir transparencia, Aumentar contraste y Reducir movimiento activados.
7. **Retirar** `NotchTabBar` y el SVG de la muesca cuando el interruptor lleve una versión estable. Rehacer las capturas de tienda.

## Fuentes

- Expo: `https://docs.expo.dev/versions/latest/sdk/glass-effect/` (SDK 58, 2026-10-29) y `npm view expo-glass-effect` (etiqueta `sdk-57` → 57.0.4).
- Apple: `https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass` — **la página no cargó completa**; lo atribuido a Apple es de memoria y debe verificarse.
- Código leído: `NotchTabBar.tsx`, `BottomTabs.tsx`, `ProfileHeader.tsx`, `ProfileScreen.tsx`.
