# JCHAT — Rediseño del PERFIL v2 (móvil + web de la app)

**Versión:** 2.0 · **Fecha:** 2026-10-29 · **Autor:** Planning
**Repo:** `jcgarcia007/jchat-3` · carpeta `/Users/jcgarcia/Projects/OtunityLabs/JchatVer3.0`
**Rama nueva:** `feat/profile-v2` desde `origin/main`.
**Esto ACTUALIZA** `docs/JCHAT_PROFILE_REDESIGN_SPEC.md` (v1, ya implementado: es el perfil que se ve hoy). Lo que este documento no menciona **se queda como en v1** (temas de color, "Frecuenta", "En común", "Completa tu perfil", pestañas, menú •••, estados vacíos, limpieza). Contexto de diseño: `docs/design/liquid-glass.md` (estudio) y la barra de pestañas con corte ya hecha en `fix/notch-shape`.
**Checkpoint:** NO (Paso 0 corto, reportar y continuar). **Sin migraciones.** Solo `mobile/` (y los textos). **Sin módulos nativos nuevos** en esta tarea (ver fase B, §7): no cambia el fingerprint de EAS.

---

## 1. Qué cambia respecto a v1

| Tema | v1 (hoy) | v2 (esta tarea) |
|---|---|---|
| Portada | Caja de 120 px con márgenes y esquinas, color/gradiente del tema | **A sangre**: ocupa todo el ancho y sube **detrás de la barra de estado**; altura 200 px + el margen superior del dispositivo |
| Barra superior | Fija, fondo sólido, `@usuario` a la izquierda, Compartir y Ajustes a la derecha | **Botones circulares flotantes de 44 px sobre la portada** (material translúcido); el `@usuario` pasa al bloque de identidad; al bajar, la barra se vuelve sólida y muestra el `@usuario` |
| Cifras | Publicaciones · Seguidores · Siguiendo · Lugares | **Se quitan todas** (sin números en el perfil) |
| Seguidores y Siguiendo | Tocar las cifras | Botón **Amigos** (ver §4.4) |
| Barra de pestañas | — | **No se toca** (se queda con el corte, rama `fix/notch-shape`) |

---

## 2. Paso 0 (reportar y continuar)

Lee el código y contesta en 10 líneas, sin preguntar:

1. **Dónde se pinta hoy `ProfileTopBar`** (sibling fijo sobre el `ScrollView`, `ProfileHeader.tsx`) y si el navegador oculta su propio encabezado en la pantalla de Perfil (`headerShown`). Necesitas superponerla a la portada: cómo quedaría.
2. **Foto de portada:** `users.cover_url` existe en el esquema y en `services/users.ts` (campo `cover_url`). ¿`EditProfile` permite subirla hoy? ¿Qué bucket usa? ¿Qué pinta `ProfileScreen` ahora cuando hay `cover_url` y cuando no? **Si no hay subida de portada, la portada v2 usa el degradado del tema** (`coverGradient`/`coverBg`) y la subida queda para la tarea posterior (§8). No crees migraciones ni buckets.
3. **`FriendsScreen`** (ruta `Friends`, parámetros `{ userId?, initialTab?: 'followers' | 'following' | 'requests' }`): ¿muestra el número de seguidores / siguiendo en sus pestañas? Si no, hay que mostrarlo ahí (ver §4.4).
4. **Solicitudes de seguimiento pendientes:** ¿qué servicio/hook da el número para mi perfil (hoy la pestaña `requests`)? Nombre exacto.
5. **`useReducedMotion` / `AccessibilityInfo.isReduceTransparencyEnabled`:** ¿ya hay un hook o utilidad en el proyecto? Si no, crea uno pequeño (`mobile/utils/` o `hooks/`), puro y con test.
6. **Material translúcido existente:** `expo-blur` (`BlurView`) ya está instalado (`~57.0.3`) y `NotchTabBar.tsx` lo usa en iOS con `colors.tabBarGlass` / `tabBarGlassAndroid`. Confirma que lo reutilizas (sin dependencias nuevas).
7. **Scroll del perfil:** ¿`ProfileScreen` usa `ScrollView` o `FlatList` y dónde está `onScroll`? ¿Reanimated 4 está disponible (`react-native-reanimated 4.5.1`)?
8. **Perfil web:** ¿el perfil se usa también en Expo web (`.web.tsx`)? ¿`backdrop-filter` está permitido en `react-native-web` aquí?
9. **Lugares:** confirma que la pestaña **Lugares** ya muestra su contenido sin depender de la cifra de "Lugares" de la fila de estadísticas.
10. Lista de **textos/etiquetas i18n** de `profile` que dejarán de usarse (`header.posts`, `header.followers`, `header.following`, `header.statsA11y`…).

**Regla general:** si una acción no tiene flujo real, no se muestra o no es tocable. Reporta qué se ocultó.

---

## 3. Decisiones ya tomadas (no preguntar)

1. **Seguidores y Siguiendo → Opción A**: botón **Amigos** (§4.4). No se hace la línea de texto de la Opción B.
2. **Sin cifras en absoluto**: tampoco la de "Lugares". La pestaña Lugares se queda sin número.
3. **Barra de pestañas intacta** (la cápsula con círculo separado del estudio queda descartada: se mantiene el corte).
4. **Material**: fase A con `BlurView` de `expo-blur` + relleno translúcido con tokens existentes; el vidrio nativo de iOS 26 (`expo-glass-effect`) es la fase B y **no entra aquí**.
5. **Sin foto de portada nueva** en esta tarea salvo que el Paso 0 (punto 2) diga que ya se sube.

---

## 4. Diseño

### 4.1 Portada a sangre
- Ancho completo, sin esquinas ni márgenes. Altura = **200 px + `insets.top`**. Sube detrás de la barra de estado (la barra de estado pasa a `translucent`/estilo claro u oscuro según el tema; revisa que se lea sobre la portada en los 15 temas).
- Contenido: `cover_url` si existe; si no, el degradado/color del tema (`theme.coverGradient` / `theme.coverBg`). La imagen lleva `accessible={false}` (es decorativa).
- **Scrim** para que los botones se vean sobre cualquier foto: degradado superior (de `palette.scrimMedium`, o el token de scrim existente más cercano, a transparente) de ~96 px. No crees tokens: si falta uno, propónlo en el informe.
- Sin texto sobre la portada: el nombre, el `@usuario` y la bio siguen **debajo**, sobre la superficie (el contraste de v1 se conserva).

### 4.2 Botones flotantes sobre la portada
- **Mi perfil:** a la derecha **Amigos**, **Compartir**, **Ajustes** (círculos de **44×44**, separados 8 px, a 12 px del borde derecho y bajo `insets.top + 8`). A la izquierda **Atrás** solo si hoy se muestra (`showBack`).
- **Perfil de otra persona:** **Atrás** a la izquierda y **•••** a la derecha (abre el menú de v1 §4.7, que ahora incluye "Ver seguidores / siguiendo", ver §4.4).
- Material de cada botón (fase A): `BlurView` (intensidad ~40) + relleno `colors.tabBarGlass` (iOS) / `tabBarGlassAndroid` (Android), borde de 1 px `c.borderSubtle`. Icono `c.textPrimary`. En la web, `backdrop-filter` con el mismo relleno.
- **Reducir transparencia** (`AccessibilityInfo.isReduceTransparencyEnabled`): relleno **opaco** `c.bgElevated`, sin blur. Escuchar el cambio en vivo.
- Cada botón: `accessibilityRole="button"`, `accessibilityLabel` (es/en), `hitSlop` si el tamaño visual baja de 44.

### 4.3 La barra se vuelve sólida al bajar (cabecera que se encoge)
- Con un valor compartido de Reanimated alimentado desde `onScroll` del `ScrollView` (`scrollEventThrottle={16}`).
- Umbral: cuando el scroll pasa de `portada − (insets.top + 56)` aparece una **barra sólida** (`c.bgBase`, borde inferior `c.borderSubtle`) con el `@usuario` centrado; los botones flotantes se quedan encima de ella (pierden el blur y pasan a `c.bgElevated`).
- Anima **la opacidad de la barra sólida** (no la de los botones de material translúcido). **Reducir movimiento** (`useReducedMotion`): cambia de golpe, sin animación.
- La lógica de umbral y estado es **pura** (`scrollState(offset, coverHeight, insetTop)` → `{ solid: boolean, progress: 0..1 }`) en un archivo con test (§6).

### 4.4 Amigos (sustituye a las cifras de Seguidores y Siguiendo)
- Botón **Amigos** (icono de personas de Tabler, p. ej. `IconUsers`) en la fila de botones flotantes de **mi perfil**: abre `navigation.navigate('Friends', { initialTab })` con `initialTab = 'requests'` si hay solicitudes pendientes, si no `'followers'`.
- **Punto de aviso** (`c.dangerText`/token de aviso existente) en el icono cuando hay solicitudes pendientes (hoy se veían en las cifras). El `accessibilityLabel` cambia a "Amigos, N solicitudes" cuando hay.
- **Perfil de otra persona:** en el menú •••, la fila **Ver seguidores** y **Ver siguiendo**, **solo si** la cuenta es pública **o** ya la sigues (misma regla de privacidad de hoy: una cuenta privada que no sigues no muestra listas). Abre `Friends` con `userId` e `initialTab`.
- `FriendsScreen` muestra el **número** en sus pestañas ("Seguidores · 24") si no lo hacía (Paso 0 punto 3). Es el único sitio donde aparecen las cifras.
- Quita `Stat`, la fila de estadísticas y los textos `header.posts|followers|following|statsA11y` del código **y** de los JSON es/en (paridad).

### 4.5 Avatar e identidad
- Avatar de **96 px** con anillo de 4 px (`theme.statsBg`), **superpuesto 48 px** sobre el borde inferior de la portada, a la izquierda (16 px de margen). Nombre, `@usuario`, bio, "Frecuenta", botones Editar/Seguir/Mensaje/Regalo y todo lo de v1 §4.3–§4.8 **igual**, desplazado hacia abajo lo que ocupa la portada nueva.

---

## 5. Prohibido
- Texto sobre la portada; ubicación en vivo, fechas u horas de check-ins; botones muertos; colores fijos (`#xxxxxx`) en `ProfileScreen.tsx`, `ProfileHeader.tsx` o los componentes nuevos (solo `theme`, `useThemeColors()` y `palette`); migraciones o cambios en Supabase de producción; dependencias nativas nuevas (nada de `expo-glass-effect` aquí); tocar `NotchTabBar.tsx`; `git add .` (rutas explícitas).
- Animar la **opacidad** de un padre de material translúcido (se ve mal y en iOS 26 el vidrio no se dibuja).

---

## 6. Pruebas (obligatorias)

1. **Unitario puro** `mobile/scripts/profile-scroll-state.test.mjs`: `scrollState` en los umbrales (sin barra / en el umbral / sólida), con `insetTop` distintos, y con "reducir movimiento" (la función no anima, solo calcula).
2. **Estático** `mobile/scripts/profile-v2.test.mjs`: ya no existen `Stat` ni `header.statsA11y` en `ProfileHeader.tsx`; el botón **Amigos** tiene `accessibilityLabel` y `testID="profile-open-friends"`; los botones flotantes tienen 44×44 o `hitSlop`; la portada y los botones no usan hex; `Friends` se abre con `initialTab`; la regla de privacidad (lista solo si pública o seguida) está en el menú ajeno.
3. **Existentes que deben seguir verdes:** `a11y-main-screens.test.mjs` (los archivos del perfil ya están en su lista: etiquetas, 44 pt/hitSlop, imágenes), `contrast-main-screens.test.mjs`, `check-i18n.test.mjs` (paridad es/en, sin textos a mano), `launch-contrast`, `theme-contrast`.
4. **Puerta completa antes de empujar** (la misma de siempre): `tsc` móvil y web, Deno, **todos** los tests de Node, los herméticos y los de WebKit con red simulada.

---

## 7. Fase B (tarea aparte, NO ahora): vidrio nativo de iOS 26
Cuando la fase A esté fusionada y probada: `expo-glass-effect@~57.0.4` (`GlassView`/`GlassContainer`) en los botones flotantes, detrás de una función pura `glassMode({ platform, iosMajor, liquidAvailable, apiAvailable, reduceTransparency })` con fallback a la fase A. Cambia el fingerprint (módulo nativo): entra en un build nuevo. Detalles y riesgos en `docs/design/liquid-glass.md`.

## 8. Para después
- **Foto de portada** (subida y recorte, `users.cover_url`): si el Paso 0 dice que no existe, requiere flujo de subida y, según el bucket, una migración.
- Rehacer las capturas de tienda con el perfil nuevo (`docs/app-review/ficha-tienda.md`).

---

## 9. Aceptación (Juan en dispositivo)
- [ ] Portada a sangre detrás de la barra de estado, legible en los 15 temas, claro y oscuro.
- [ ] Botones flotantes de 44 px sobre la portada; con **Reducir transparencia** se ven opacos y legibles.
- [ ] Al bajar, aparece la barra sólida con el `@usuario`; con **Reducir movimiento** el cambio es instantáneo.
- [ ] **No hay cifras** de Publicaciones, Seguidores, Siguiendo ni Lugares en el perfil.
- [ ] **Amigos** abre la pantalla con las pestañas (con números allí); el punto de aviso sale si hay solicitudes pendientes.
- [ ] Perfil ajeno: ••• ofrece "Ver seguidores / siguiendo" solo si es pública o la sigues.
- [ ] La barra de pestañas con corte no cambió.
- [ ] Modo claro y oscuro; web correcta.

**Calidad:** puerta completa (§6.4). Entregar SHA + `git diff --stat origin/main..HEAD` + lista de lo que se ocultó por no existir + propuestas de tokens si faltó alguno + si el fingerprint cambió (no debería: ejecuta `npx fingerprint fingerprint:generate --platform ios` y `--platform android` antes y después y compara).
