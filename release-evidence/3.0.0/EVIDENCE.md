# JChat 3.0.0 — Evidencia prelanzamiento, noche 1 (13→14 oct 2026)

- **Commit inspeccionado:** `4f9dba8` (`main`). Rama: `chore/release-evidence`.
- **Alcance:** solo leer y medir. No se cambió código de la app. Nada se escribió en la base de datos; no se tocó `main`, producción, migraciones ni Edge Functions.
- **Artefactos crudos:** `release-evidence/3.0.0/raw/` (fuera de git, ver `.gitignore`). Las rutas de la tabla son relativas a esa carpeta.
- **Secretos:** ningún valor impreso ni guardado aquí. Los escáneres no encontraron secretos (SEC-01/02/03).
- **Convención de resultado:** PASA · FALLA · N/A · BLOQUEADO. "FALLA" = hallazgo que Planning debe clasificar; no se arregló nada.

## Actualización noche 5 (2026-10-17 → 18)

Cadena para un solo merge: `fix/verify-no-sms` (`8114fb4`) → B `feat/register-geocode-onblur` (`eb76f54`) → C `feat/register-hours-ux` (`f0fed93`) → D `fix/dashboard-save-feedback` (`bd3b047`) → F `fix/verify-no-test-skip` (`c8e75f1`) → E `chore/release-evidence` (esta). Ninguna toca `main`; no se escribió nada en la base de datos (las pruebas usan red simulada o un Supabase de mentira local, `e2e/web/fake-supabase.mjs`); ningún secreto impreso.

### Resueltos por Juan en producción (2026-10-17)

| Qué | Estado |
|---|---|
| Geocodificación del registro con una dirección real (`6b884e9`) | **RESUELTO por Juan en producción 2026-10-17** |
| Reportar / bloquear / desbloquear + resolución del administrador, en Android | **RESUELTO por Juan en producción 2026-10-17** |

### Cambios de la noche (una fila por commit)

| SHA | Rama | Qué | Prueba |
|---|---|---|---|
| `064b6ce` | `fix/businesses-owner-grants` | Migración 236 versionada (la aplicó Planning por MCP el 2026-10-17, versión `20261017183617`): `grant update` de `icon_url`, `dashboard_palette_id`, `pickup_enabled`, `receipt_brand_color`, `receipt_template_id` sobre `businesses`. Regla nueva en CLAUDE.md | `mobile/scripts/migrations-businesses-grants.test.mjs` (hace cumplir el grant por columna) |
| `230af2f` | `feat/business-icon-url` | Se muestra el ícono que subió el dueño (`icon_url`, con el emoji como respaldo) en pin, tarjeta, lista de cercanos, barra del chat, hoja de entrada y encabezado de post (`BusinessIcon`) | pruebas de `mobile/scripts`; el megáfono/ofertas queda fuera (su RPC no devuelve `icon_url`: necesita migración) |
| `dc893b6` | `fix/report-thanks-button` | El botón "Close" de la vista "Thank you" del reporte ocupa el ancho de la hoja (antes ~50 px a 390 px) | Playwright `report-sheet.spec.ts` con red simulada: falla sin el arreglo (49,8 px), pasa con él |
| `6b884e9` | `feat/register-geocode` | El registro geocodifica la dirección al "Continuar" y exige coordenadas válidas | `web/scripts/register-location.test.mjs` |
| `8114fb4` | `fix/verify-no-sms` | El paso SMS sale de v1: verificación = identidad + código/selfie + aprobación manual; `send_sms`/`verify_sms` → 410 | `web/scripts/verify-no-sms.test.mjs` (5) |
| `eb76f54` | `feat/register-geocode-onblur` (B) | Al salir del campo dirección se geocodifica en silencio (≥ 8 caracteres, solo si `needsGeocode`), nunca dos a la vez; un fallo en blur no muestra error | `register-location.test.mjs`: 6 pruebas (`shouldGeocodeOnBlur`) |
| `f0fed93` | `feat/register-hours-ux` (C) | Horario del registro: "Copiar a todos los días", "Abierto 24 h" por día, aviso "Cierra al día siguiente" (también en el editor del dashboard, que ya tenía copiar y todo el día). Mismo JSON de `hours`; sin BD ni móvil | `web/scripts/business-hours.test.mjs` (5) |
| `bd3b047` | `fix/dashboard-save-feedback` (D) | Un guardado fallido en Configuración muestra un mensaje humano junto al botón Guardar (permiso / sin conexión / genérico + código pequeño) y se desplaza hasta él | `web/scripts/save-error.test.mjs` (4) + Playwright `dashboard-save-error.spec.ts` (403 simulado en el PATCH de `businesses`): falla sin el arreglo, pasa con él (390 px y escritorio) |
| `c8e75f1` | `fix/verify-no-test-skip` (F) | Fuera los botones "Skip for now (Testing)" de `/business/verify` (ambos pasos), sus manejadores y `NEXT_PUBLIC_HIDE_TEST_SKIP` | `web/scripts/verify-no-test-skip.test.mjs` (3) + Playwright `dashboard-verify-no-skip.spec.ts`: falla con la página vieja, pasa con la nueva |

### Verificaciones sobre la punta (código de `c8e75f1`)

| ID | Comando | Resultado | Resumen |
|---|---|---|---|
| QA-02 | `npx tsc --noEmit` en `mobile/` y `web/` | **PASA** | 0 errores en ambos. |
| QA-05 | `node scripts/<x>.test.mjs` (mobile) · `node --test scripts/*.test.mjs` (web) | **PASA** | mobile 35 de 35 archivos con salida 0; web 9 archivos, 42 pruebas, 0 fallan. |
| i18n | `node scripts/i18n-hardcoded.test.mjs` (mobile) | **PASA** | 7 de 7; 0 literales sin traducir. |
| SEC-03 | `npx expo export -p web` y `-p ios -p android --no-bytecode` + `grep -E 'service_role\|sk_live_\|sk_test_\|whsec_\|re_[A-Za-z0-9]{20,}\|sntrys_\|SUPABASE_SERVICE'` (solo conteo) | **PASA** | 0 archivos con coincidencias: bundle web 31 archivos, nativo 41. |
| F8 | `cd e2e && npm run web:audit` | **PASA con 1 hallazgo nuevo** | 30 de 30 pruebas (14,6 min, solo lectura). **0 bloqueantes, 1 alta, 4 medias, 165 bajas** (931 apariciones en bruto; noche 4: 0/0/5/164). La **alta es nueva y única**: `pageerror` "The server could not finish this Suspense boundary… Switched to client rendering" ×1, en la hoja del menú del local a 768×1024 oscuro/en (servidor Next de desarrollo; no se repitió en los otros 5 tamaños/temas). No toca ningún archivo de esta noche; sin clasificar: Planning decide si se repite. Las medias: contraste axe (landing/legales) y 3 pasos de navegación del recorrido (tarjeta rápida, mantener pulsado, Mi foto: `click` agotó 8 s ×6), todas ya conocidas. Informe: `raw/night5-web-audit-REPORTE.md`. |
| E2E nuevas | `cd e2e && npx playwright test -c dashboard.config.ts` (Next de producción local + `fake-supabase.mjs`) | **PASA** | 4 de 4 (2 especificaciones × 390 px y escritorio). |

Crudo en `raw/night5-*` (fuera de git).

## Actualización noche 4 (2026-10-15, madrugada)

Cadena para un solo merge (cada rama sale de la punta de la anterior): `chore/release-evidence` rebaseada sobre `origin/main` (`c881da2`, paso 0) → A `feat/web-games` (`b07f19d`) → B `fix/i18n-hardcoded` (`1a8b5b0`) → C `fix/polish-leftovers` (`5102b1b`) → D `docs/store-listing` (`be20038`) → E `chore/release-evidence` (esta). Ninguna toca `main`, producción, migraciones ni Edge Functions. Nadie empujó a `main` desde esta sesión (todos los `git push` fueron `git push origin <rama>`).

### Verificaciones sobre la punta (código de `be20038`)

| ID | Comando | Resultado | Resumen |
|---|---|---|---|
| QA-02 | `npx tsc --noEmit` en `mobile/` y `web/` | **PASA** | 0 errores en ambos. |
| QA-05 | `node scripts/<x>.test.mjs` (mobile) · `node --test scripts/<x>.test.mjs` (web) | **PASA** | 38 de 38 archivos con salida 0 (34 mobile + 4 web; la noche 3 eran 32 + 4: nuevos `resume-recheck` e `i18n-hardcoded`). |
| SEC-03 | `npx expo export -p web` y `-p ios -p android --no-bytecode` + `grep -E 'service_role\|sk_live_\|sk_test_\|whsec_\|re_[A-Za-z0-9]{20,}\|sntrys_\|SUPABASE_SERVICE'` | **PASA** | 0 coincidencias en el bundle web (31 archivos) y en el nativo (41 archivos). Además `expo export -p ios -p android -p web` OK. |

### A · Juegos en la web (`feat/web-games`, `b07f19d`; solo web, iOS y Android sin cambios)

| Pieza | Resultado |
|---|---|
| Escáner QR de Match | Oculto en web (pantalla de Match y panel de juegos del chat); el escáner de cámara no se monta; texto nuevo es/en "Escanea el QR del local con la cámara de tu teléfono". La prueba confirma que no se pide la cámara. |
| Presencia en segundo plano | Re-chequeo al recuperar la red (`online`) o al restaurar la página (`pageshow`), por el mismo `runAutoGeoCheck` del gate y respetando `RESUME_RECHECK_MIN_GAP_MS`; la decisión es la función pura `utils/resumeRecheck.ts` con prueba unitaria. `visibilitychange` ya llegaba como cambio de AppState de react-native-web (verificado en su código). |
| Baraja de Match | `touch-action: none` ya lo pone gesture-handler por defecto en web (verificado en la prueba, en la cadena de ancestros de la tarjeta). **Defecto encontrado y corregido:** soltar el puntero tras arrastrar abría el perfil (el `Pressable` de la tarjeta contaba el soltar como un toque); `CardPressable` ignora un toque cuyo puntero se movió más de 10 px (solo web). |
| Carta de Truth or Dare | Gira y queda legible (el elemento superior en el centro es el texto, sin espejo, cara frontal oculta) en WebKit 390 px y Chromium móvil. |

Playwright (`e2e/web/games-web.spec.ts`, proyectos `webkit-390` y `mobile-390x844`): **8 de 8 pasan** (Match sin botón de escanear, arrastre de la baraja, giro de la carta, autocomprobación). TODA la red de juegos va simulada (`e2e/web/games-mock.ts`): las RPC se responden con filas sintéticas, las escrituras REST y el almacenamiento se responden vacíos, y una ruta de última instancia **aborta y registra** cualquier escritura a Supabase que ningún mock respondió (la prueba falla si pasa; la autocomprobación lo demuestra). Solo pasan lecturas del propio usuario, el refresco de sesión y el socket Realtime; dos RPC declaradas `stable` (`resolve_venue_entry`, `my_active_orders`) pasan sin simular.
No probado: Safari real en un iPhone (el WebKit de Playwright no reproduce el teclado ni el scroll real), presencia con una pestaña realmente en segundo plano durante minutos, subida de fotos de Match en web.

### B · Textos sin traducir (`fix/i18n-hardcoded`, `1a8b5b0`)

Escáner por AST (`mobile/scripts/i18n-hardcoded.test.mjs`): texto entre etiquetas, literales renderizados, props visibles (`placeholder`, `accessibilityLabel`, `title`, `label`, `message`…), diálogos (`Alert.alert`, `showAlert`, `confirm`…), listas de opciones (`{ label: '…' }`) y `setError('…')`. Lista blanca documentada en la cabecera (marcas, unidades, símbolos), datos `DEMO_*` omitidos y `// i18n-ignore: <motivo>` para casos puntuales. **Literales movidos a i18n: 0.** La primera pasada dio 29 candidatos y todos eran claves de i18n, unidades, datos de demostración o mensajes de desarrollador que nunca se muestran (los 5 de `services/terminal*.ts` y los ids internos de duración de ofertas llevan `i18n-ignore` con el motivo). Además la prueba comprueba que es y en tienen los mismos espacios de nombres y claves y ningún texto vacío (22 espacios de nombres, 0 diferencias). Traducciones `i18n-review`: ninguna. Maestro con los textos sin cambios: Android 7/7; iOS 6/7 y el flujo 05 volvió a pasar 3 de 3 (una falla intermitente mientras corrían a la vez las pruebas de Next).

### C · Contraste, hidratación y `web:audit` (`fix/polish-leftovers`, `5102b1b`)

| Arreglo | Antes | Después |
|---|---|---|
| Insignia de iniciales de la bandeja de DMs y etiqueta de match (`brandText`) | `#5c7cfa` sobre su tinte = 4,18:1 (F8 #2) | 4,87:1; la prueba de contraste cubre el par `brandText` sobre `brandLight` en base y superficie |
| Aviso aparte de hidratación de React en `IconRail` / `DenseRow` (F8 #3) | `MenuImg` repartía su rango eager/lazy con un contador mutable en el render (StrictMode lo ejecuta dos veces: 0, 2, 4…) | rango por `useId`; sin errores de consola en 1280 y 390 px; build de `web/` OK |
| Botón "Llamar al mesero" | `#18181b` sobre el acento del tema = 3,71:1 | `ensureTextContrast` sobre el acento (≥ 4,5:1) |
| Botones de los diálogos web (`DialogHost.web.tsx`) | `#ef4444` 3,37:1 y `#5C7CFA` 3,67:1 | `dangerText` / `brandText` |
| Aviso "tu ubicación nunca se comparte" (Privacidad) | `#ef4444` sobre su tinte rosa = 3,19:1 | `dangerText` |
| Botones de marca del menú público (`web/`) | blanco sobre `#5c7cfa` = 3,67:1 | `--color-brand-dark` = 4,65:1 (no verificable hasta desplegar `web/`) |
| Campo "Tu ciudad" a 200 % en Android (F8/UX-06) | el placeholder se recortaba | cabe en dos líneas (verificado con captura) |
| Especificaciones e2e del menú y de `chat-avatar` | 12 fallos: `getByText('Entrar al chat').first()` resolvía a un elemento oculto desde la noche 1 | ayudante `enterVenue()` con `chat-enter`; suite del menú 17 de 17 |

`npm run web:audit` (30 de 30 pruebas; línea base de la noche 3: 0 bloqueantes, 0 altas, **3 medias**, 166 bajas). Última pasada: **0 bloqueantes, 0 altas, 5 medias, 164 bajas** (las bajas son el aviso del controlador WebGL en el login). Las 5 medias: (1) contraste de la landing y las páginas legales y (2) del menú público, ambos **del sitio desplegado** (las pruebas `next-prod` leen producción: el arreglo de (2) y los de `web/` quedan pendientes del despliegue de `web/`); (3–5) tres pasos de navegación de la app ("Tarjeta rápida de otra persona", "Acciones de usuario", "Mi foto") que no encuentran elementos porque **el chat de Bar XZX está vacío ahora** (el audit necesita mensajes de otra persona): es el estado de los datos, no un fallo de la app. En la app: **0 contrastes** y **0 errores de hidratación**. Cuatro pasadas en total: las tres primeras destaparon, una tras otra, los contrastes de "Llamar al mesero", de los diálogos y del aviso de Privacidad, que están arreglados; el último arreglo del menú público (`web/`) se valida solo tras el despliegue. Aviso: la suite del menú, `chat-avatar` y `web:audit` entran al local de verdad (la presencia se registra con la cuenta de prueba); las pruebas de juegos web no.

### D · Textos de las tiendas (`docs/store-listing`, `be20038`)

`docs/store-listing/`: `app-store.es.md`, `app-store.en.md`, `google-play.es.md`, `google-play.en.md` (nombre, subtítulo, texto promocional, descripción, palabras clave ≤ 100 sin repetir nombre ni subtítulo, novedades; título y descripciones de Play) con el número de caracteres junto a cada límite, y `screenshots-plan.md` (6 pantallas por plataforma con texto es/en, tamaños 1320×2868 y 1080×1920, y la regla de capturar con una cuenta demo y datos limpios). Solo lo que la app hace hoy, 18+ explícito, sin Verified ni precios. Borradores para revisión de Juan: no se subió nada a ninguna consola.

## Actualización noche 3 (2026-10-14 → 15)

Ramas encadenadas para un solo merge: `test/maestro-flows` (`eee0dfc`) → `chore/expo-patch-bump` (`6913809`) → `fix/large-text` (`d23a595`) → `chore/release-evidence` (esta). Ninguna toca `main`, producción, migraciones ni Edge Functions; nada se escribió en la base de datos.

| ID | Comando | Commit | Resultado | Resumen |
|---|---|---|---|---|
| DEV-02 (F9) | `npm run maestro` (`maestro test .maestro`), 7 flujos, JUnit y capturas en `e2e/artifacts/maestro/` (fuera de git) | `22e49fc` (+ `eee0dfc`) | **PASA** | **3 pasadas seguidas por plataforma, 7/7 en verde:** iOS (iPhone 17 Pro Max, cuenta test1) y Android (emulator-5554, cuenta Test). Una pasada intermedia de iOS falló en el flujo 04 (toque por posición antes de que terminara la animación de la alerta) → se añadieron esperas y se repitieron las 3 pasadas (3/3). El flujo 04 se repitió 3× en Android tras ese cambio (3/3). Repetido una vez por plataforma tras el bump de Expo (`6913809`, 7/7 y 7/7) y tras el arreglo de texto grande (`d23a595`, 7/7 y 7/7). Los flujos solo miran y cancelan (entrada al local, selector de fotos, reportar, bloquear, eliminar cuenta): no escriben en la base. `01-login` queda omitido sin `MAESTRO_EMAIL`/`MAESTRO_PASSWORD`. |
| QA-01 | `cd mobile && npx expo-doctor` | `6913809`, `d23a595` | **PASA** | **21/21** (antes 20/21 por el desfase de parches). `expo install --fix`: `expo` 57.0.28→57.0.29, `expo-linking` 57.0.12→57.0.13, `expo-notifications` 57.0.22→57.0.23, `@expo/metro-runtime` 57.0.16→57.0.17 (`expo-asset` transitiva 57.0.19→57.0.20). Con ese bump: `tsc --noEmit` 0, 32/32 pruebas, `expo export -p ios -p android -p web` OK. Único cambio nativo: `expo-notifications` 57.0.23 (Android: importarlo ya no tumba Expo Go). No se reconstruyó el build de Android (la firma de depuración cambiaría y habría que desinstalar la app, perdiendo la sesión de prueba). |
| UX-05 / UX-06 (F8) | iOS `content_size accessibility-extra-extra-extra-large` y Android `font_scale 2.0`; flujos `mobile/.maestro/large-text/` | `d23a595` | **PASA tras arreglos** | Arreglados 4 cortes (diseño y colores sin cambios): (1) hoja de reporte: "Enviar reporte" y "Cancelar" estaban dentro del scroll y quedaban fuera de pantalla → fijados debajo de la lista; (2) Editar perfil en iOS: "Guardar" se salía de la pantalla → el título se encoge y el botón no se corta; (3) Ofertas: el título se partía a mitad de palabra ("Ofert/as de/nego/cios") → cabe en dos líneas; (4) aviso de entrada al local: solo una tira pequeña hacía scroll → título, subtítulo y aviso se desplazan juntos y "Entrar al chat"/"Ahora no" quedan fijos. Sin cortes en: Ajustes, confirmación de borrar cuenta, alerta de bloquear (alertas nativas), barra de entrada del DM, Mis pedidos, lista "Cerca de ti". Límites: en iOS no se capturan las pantallas del DM de test1 (imagen explícita), allí solo se comprobó por jerarquía que los botones están en pantalla; el relleno "Tu ciudad (solo texto manual)" se recorta en Android 2.0 (es un texto de ayuda, no se tocó). Ambos dispositivos devueltos a `content_size large` / `font_scale 1.0`. |

### Juegos en la web — análisis (solo lectura de código; sin probar en vivo)

Truth or Dare y Match **ya están registrados en el mismo stack para web y nativo** (`AppNavigator.tsx`, sin división `.web`), y el export web compila. No se abrió ninguna pantalla de juego en el navegador: llegar a `MatchHome`/`TodHome` exige estar dentro del chat del local (el check-in escribe la presencia en la base) y no hay deep link a esas pantallas. Todo lo siguiente sale de leer el código y los paquetes.

| Pieza | Web | Causa | Arreglo propuesto | Esfuerzo |
|---|---|---|---|---|
| Pantallas, navegación y servicios (`match_*`, `tod_*` por RPC, Realtime del chat) | funciona (no probado) | Mismo código; supabase-js corre igual en web. Sin reglas de servidor por plataforma (`platform` solo aparece en `is_platform_admin`). | Prueba manual en navegador móvil con una cuenta de prueba. | 1 h |
| Baraja de Match (`@react-native-motion-kit/swipe-deck` 1.5.0 + gesture-handler 2.32 + reanimated 4.5.1 + worklets 0.10.1) | sin verificar | La librería no tiene lógica web; gesture-handler y reanimated sí soportan web, y `App.tsx` ya envuelve en `GestureHandlerRootView`. Riesgo: el gesto vertical ("arriba = super like") compite con el scroll de la página; con ratón hay que arrastrar. Los botones accesibles ya duplican cada gesto (alternativa). | Probar en Safari/Chrome móvil; si hace falta, `touch-action: none` en la tarjeta. | 3–6 h |
| Hápticos (`expo-haptics` en `MatchDeck`, `MatchQrScanner`) | degradado, sin fallo | En web no hay háptico (a lo sumo `vibrate` en Android). Las llamadas son `void …` y no rompen. | Ninguno. | 0 h |
| Escáner QR de Match (`expo-camera` `CameraView`) | falla en la práctica | `getUserMedia` + `BarcodeDetector` nativo (Chrome) o el polyfill `barcode-detector` (instalado); en Safari iOS depende del polyfill, que por defecto baja su WASM de un CDN (revisar CSP y sin conexión). Además en web el QR del local ya es un enlace (`/c/{token}`) que abre la cámara del teléfono. | Ocultar "Escanear" en web y mostrar "Abre el QR con la cámara del teléfono". | 1–2 h |
| Presencia (geolocalización) | funciona con límites | `geoPosition.web.ts` usa `navigator.geolocation` (necesita HTTPS y permiso; el caso "permiso denegado" ya está tratado en el chat). `mocked` siempre es `false` en web: el servidor **no puede detectar una ubicación simulada** desde el navegador. | Decisión de producto: en web exigir el QR (método `qr`) para activar Match, o aceptar el riesgo. | 2–3 h (+ servidor) |
| Latido de presencia (5 min; caduca a los 15) | falla con la pestaña en segundo plano | Los temporizadores del navegador se frenan o la pestaña se suspende (Safari iOS): la presencia caduca y Match/Tod rechazan hasta volver a entrar. | Re-chequear al volver a primer plano (`visibilitychange`) y avisar. | 3–4 h |
| Fotos de Match (`expo-image-picker`, `expo-image-manipulator`) | funciona probablemente | Selector = `<input type="file">`; el manipulador usa canvas; `uploadBody.web.ts` y la rama `Platform.OS === 'web'` de `addAvatarAsMatchPhoto` ya existen. En escritorio no hay cámara. | Probar subir foto y recorte 3:4; ocultar "Cámara" si no hay `capture`. | 1–2 h |
| Carta de Truth or Dare (`TodCardModal`: giro 3D, `reanimated` + `backfaceVisibility`) | funciona probablemente | RN-web soporta `perspective`/`rotateY`; hay variante de fundido con "reducir movimiento"; `announceForAccessibility` es inocuo en web. Riesgo bajo en Safari con la cara trasera. | Mirar el giro en Safari. | 1–2 h |
| Avisos de Match ("Llegó gente nueva…") | falta en web | Las notificaciones push son `expo-notifications` (solo nativo). | Mostrarlos dentro de la app; Web Push es otro proyecto. | 8–16 h (fuera de alcance) |
| Reglas del servidor que dependan de la app nativa | ninguna encontrada | `match_check_in` solo recibe `p_qr_token`, lat/lng y `p_mocked`; no hay chequeo de plataforma. Lo único dependiente del cliente es `p_mocked` (nativo) y los plazos de presencia. | — | — |

## Actualización noche 2 (2026-10-14 → 15)

Estado de `main`: `b7332f0`. Las ramas se integraron por avance rápido, así que el SHA de merge de cada arreglo es el de su commit.

| Hallazgo | Estado | SHA en `main` | Qué quedó |
|---|---|---|---|
| H-01 `next` | **RESUELTO** | `46a9259` | `next` y `eslint-config-next` 16.4.0; `npm audit` de `web/` sin críticas (ver SEC-06 de la noche 2). |
| H-03 sesión por deep link | **RESUELTO** | `7676da1` | PKCE + solo `?code=`; un enlace con tokens se rechaza; nunca se reemplaza una sesión abierta. |
| H-04 compra de Verified | **RESUELTO** | `2e6aa86` | Sin fila "Planes" ni pantalla `Pricing`; los textos "$1,99 / mo" y "Get Verified" ya no viajan en el bundle. Vuelve con IAP/RevenueCat. |
| H-06 permisos y manifiesto de privacidad | **RESUELTO** | `fa49cb0` (+ `6fe1dcc`, `523d87d`) | Sin `NSLocationAlways*` ni `NSMotion`; textos específicos es/en; `blockedPermissions` de Android (verificado en el manifest fusionado de un APK); `PrivacyInfo.xcprivacy`. Las correcciones del selector de fotos (`6fe1dcc`, `523d87d`) evitan que el bloqueo rompa la galería. |
| H-08 Sign in with Apple | **en rama** | `feat/apple-signin-native` (`09e1d34`, `3f267dd`), sin integrar | Botón oficial y flujo nativo en iOS; falta el bundle ID en Supabase (paso de consola). |
| (nuevo) B1 check-in en servidor | **RESUELTO** | `b7332f0` (migración 235 en `e962d9b`) | `check_in(p_business_id)` con presencia real, dueño excluido y 1 por local cada 24 h; la política de INSERT quedó en `with check (false)`. |
| (nuevo) DB-01/DB-04 endurecimiento | **RESUELTO** | `e962d9b` (migración 234) | `revoke execute` a `anon`/`public` en 15 funciones de trigger y `tod_resolve_report`; `search_path` fijo en 8 funciones. Aplicada por Planning el 2026-10-14 vía MCP; versionada en el repo. |

### Mediciones repetidas sobre `main` (`b7332f0`), 2026-10-14

| ID | Comando | Resultado | Resumen | Artefacto |
|---|---|---|---|---|
| QA-02 | `npx tsc --noEmit` en `mobile/` y `web/` | PASA | 0 errores en ambos. | raw/tsc-mobile-n2.txt · raw/tsc-web-n2.txt |
| QA-05 | `node scripts/<x>.test.mjs` (mobile) · `node --test scripts/<x>.test.mjs` (web) | PASA | 33 de 33 archivos con salida 0 (29 mobile + 4 web; la noche 1 eran 28). | raw/tests-summary-n2.txt |
| SEC-03 | `npx expo export -p web` y `-p ios -p android --no-bytecode` + `grep -E 'service_role\|sk_live_\|sk_test_\|whsec_\|re_[A-Za-z0-9]{20,}\|sntrys_\|SUPABASE_SERVICE'` | PASA | 0 coincidencias en el bundle web (31 archivos) y en el nativo (41 archivos); validado con una cadena conocida (`supabase.co` aparece). Solo claves publicables de Stripe (`pk_live_`/`pk_test_`), como antes. | raw/export-web-n2.log · raw/export-native-n2.log |
| SEC-06 | `npm audit --omit=dev --audit-level=high --json` en `mobile/` y `web/` · `osv-scanner scan source -L mobile/package-lock.json -L web/package-lock.json` | MEJORA (web) · SIN CAMBIO (mobile) | `web/`: **0 críticas**, 1 alta (`source-map-js`, herramienta de build), 2 moderadas (antes: 1 crítica, 4 altas, 2 moderadas). `mobile/`: igual que la noche 1 (1 crítica `shell-quote` y 28 altas, casi todas herramientas de build; H-02 sigue abierto). `osv-scanner` solo sobre los dos lockfiles (sin el ruido de copias de trabajo): mobile 10 paquetes / 27 avisos, web 9 / 25. | raw/npm-audit-web-n2.json · raw/npm-audit-mobile-n2.json · raw/osv-n2.json |
| F8 (con la rama de accesibilidad) | `cd e2e && npm run web:audit` en `fix/a11y-icon-labels` | PASA | 30 de 30; **0 bloqueantes, 0 altas, 3 medias, 165 bajas** (noche 1: 166); apariciones en bruto idénticas (959). Axe no empeora. | raw/web-audit-a11y-REPORTE.md |

## Tabla de verificaciones (noche 1, sobre `4f9dba8`)

| ID | Comando exacto | Commit | Resultado | Resumen | Artefacto |
|---|---|---|---|---|---|
| INV-01 | `cd mobile && npx expo config --type introspect --json` | 4f9dba8 | PASA (inventario) | Expo SDK 57.0.0 (paquete `expo` 57.0.28), RN 0.86.3. `runtimeVersion`: política `fingerprint`. `ios.config.usesNonExemptEncryption` no existe en `ios.config`; sí `ITSAppUsesNonExemptEncryption=false` en `infoPlist`. `ios.privacyManifests`: **no existe**. iOS mínimo 16.4 (`IPHONEOS_DEPLOYMENT_TARGET`, ver INV-03). `android.targetSdkVersion`/`compileSdkVersion` no aparecen en la config; defaults de RN 0.86 (`libs.versions.toml`): target 36, compile 36, buildTools 36.0.0; `minSdk` 26 por el plugin propio `withAndroidMinSdkVersion`. `android.blockedPermissions`: **no existe**. `supportsTablet`: false. Entitlements: `aps-environment=development` (H-09), Apple Pay, applinks `jchat.cloud` y `*.jchat.cloud`. | raw/config.json |
| INV-02 | `npx expo install --check` · `npm ls --all --omit=dev > raw/deps.txt` | 4f9dba8 | PASA | "Dependencies are up to date". `npm ls` sin paquetes inválidos ni faltantes (1509 líneas). | raw/expo-install-check.txt · raw/deps.txt |
| INV-03 | copia temporal `git worktree add --detach "$TMPDIR/jchat-audit" origin/main` → `npx expo prebuild --clean --no-install` | 4f9dba8 | PASA (con rojos) | Prebuild OK (hubo que copiar `google-services.json` y `GoogleService-Info.plist`, archivos locales no versionados). Permisos y claves abajo. **No se generó ningún `PrivacyInfo.xcprivacy`** (ni de la app ni de pods: no se instalaron pods). Copia temporal borrada. | raw/AndroidManifest.prebuild.xml · raw/Info.prebuild.plist · raw/JChat.entitlements · raw/prebuild.log · raw/privacy/ (vacía) |
| INV-04 | lectura de código + `ls` | 4f9dba8 | PASA (inventario) | Tabla de flujos críticos abajo. | este archivo, sección INV-04 |
| INV-05 | lectura de `package.json`, `app.config.ts`, `supabase/functions/*` | 4f9dba8 | PASA (borrador) | Mapa de datos abajo; varios "desconocido". | este archivo, sección INV-05 |
| QA-01 | `cd mobile && npx expo-doctor@latest` | 4f9dba8 | PASA | 21/21 comprobaciones sin problemas. | raw/expo-doctor.txt |
| QA-02 | `npx tsc --noEmit` en `mobile/` y en `web/` | 4f9dba8 | PASA | 0 errores en ambos. | raw/tsc-mobile.txt · raw/tsc-web.txt |
| QA-03 | `cd web && npx eslint . --format json -o raw/eslint-web.json` (mobile: sin config ESLint) | 4f9dba8 | FALLA (web) · N/A (mobile) | `mobile/`: no hay `eslint.config.*` ni `.eslintrc*` → N/A; haría falta crear la configuración (p. ej. `eslint-config-expo` con reglas de hooks) y decidir el alcance. `web/`: **169 errores y 69 avisos** en 283 archivos; dominan `react-hooks/set-state-in-effect` (75), `react/no-unescaped-entities` (63), `no-unused-vars` (38), `exhaustive-deps` (22). No bloquea el build. | raw/eslint-web.json · raw/eslint-web.log |
| QA-04 | `npx knip --production` en `mobile/` y `web/` (solo informe) | 4f9dba8 | N/A (informe) | `mobile/`: 87 archivos sin uso (316 líneas de informe); `web/`: 11. Ruido esperado: knip no entiende las extensiones de plataforma `.web.tsx`/`.native.tsx` ni los plugins de config; hay que filtrar a mano antes de borrar nada. | raw/knip-mobile.txt · raw/knip-web.txt |
| QA-05 | `node scripts/<x>.test.mjs` (mobile) · `node --test scripts/<x>.test.mjs` (web) | 4f9dba8 | PASA | 28/28 archivos de prueba con salida 0 (25 mobile + 3 web). El e2e de Playwright va aparte (F8). | raw/tests-summary.txt · raw/test-*.log |
| QA-07 | `grep -rnE 'console\.(log\|warn\|error)\(' mobile` (sin `node_modules`, `scripts`, builds) | 4f9dba8 | N/A (informe) | **120 llamadas** en código de producción: 11 `log` (todas con guarda `__DEV__`), 93 `warn`, 16 `error`. Máximo: `hooks/useComandaPrintBridge.ts` (18). No hay plugin que las quite en release. De las 9 que mencionan token/sesión/correo, ninguna registra un valor, solo `error.message` o el objeto de error. | raw/console-calls.txt |
| SEC-01 | `gitleaks git -v --redact --report-path raw/gitleaks.json` | 4f9dba8 | PASA | Historial completo (15,4 MB, repo no superficial): **"no leaks found"**, informe `[]`. Además ningún archivo con nombre sensible (`google-services.json`, `GoogleService-Info.plist`, `.env*`, `.p8/.p12/.jks`) está versionado ni apareció jamás en el historial; están en `.gitignore`. | raw/gitleaks.json · raw/gitleaks.log |
| SEC-02 | `trufflehog git file://. --results=verified,unknown --json > raw/trufflehog.json` | 4f9dba8 | PASA | 17.373 fragmentos, 18,7 MB: **0 verificados, 0 sin verificar**. | raw/trufflehog.json (vacío) · raw/trufflehog.err |
| SEC-03 | `npx expo export -p web` y `-p ios -p android` (repetido con `--no-bytecode` para poder buscar texto) + `grep -E 'service_role\|sk_live_\|sk_test_\|whsec_\|re_[A-Za-z0-9]{20,}\|sntrys_\|SUPABASE_SERVICE'` | 4f9dba8 | PASA | 0 coincidencias en el bundle web y en el nativo. El `.hbc` por sí solo no es legible con grep (la primera pasada no encontró ni la URL de Supabase), por eso se repitió sin bytecode y se validó con una cadena conocida. Aparecen `pk_live_`/`pk_test_` (claves publicables de Stripe, esperado). Variables `EXPO_PUBLIC_*` usadas (solo nombres): `E2E`, `HCAPTCHA_SITEKEY`, `MENU_BASE_URL`, `STRIPE_PK`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`. Web `NEXT_PUBLIC_*`: `GOOGLE_MAPS_KEY`, `HCAPTCHA_SITEKEY`, `HIDE_TEST_SKIP`, `SPA_ENTRY_ENABLED`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`. Exports temporales borrados. | raw/export-web.log · raw/export-native.log · raw/export-native-js.log |
| SEC-05 | `semgrep scan --metrics=off --config p/typescript --config p/javascript --config p/react --config p/secrets --config p/owasp-top-ten --sarif -o raw/semgrep.sarif mobile web supabase/functions` | 4f9dba8 | PASA (con reserva) | 782 archivos, **0 hallazgos**. Reserva: solo corrieron 118 reglas (paquetes del registro sin iniciar sesión); 0 hallazgos no equivale a ausencia de problemas. | raw/semgrep.sarif · raw/semgrep.log |
| SEC-06 | `npm audit --omit=dev --audit-level=high --json` en `mobile/` y `web/` · `osv-scanner scan source -r . --format json` | 4f9dba8 | FALLA | `web/`: **1 crítica (`next` 16.2.9 instalado), 4 altas, 2 moderadas**. `mobile/`: **1 crítica (`shell-quote`), 28 altas, 11 moderadas**. Detalle y alcance al bundle en H-01 y H-02. `osv-scanner` también recorrió copias en `.claude/worktrees` y `.backup-codex-*` (ruido); lo útil son `mobile/package-lock.json` y `web/package-lock.json`. | raw/npm-audit-mobile.json · raw/npm-audit-web.json · raw/osv.json · raw/osv.log |
| SEC-10 | lectura de `mobile/services/supabase.ts` | 4f9dba8 | FALLA (hallazgo) | La sesión de Supabase se guarda en **AsyncStorage** (`mobile/services/supabase.ts:53`), no en `expo-secure-store`, que ni siquiera está en `package.json`. H-05. | raw/sec10-session-storage.txt |
| SEC-11 | lectura de `AuthContext.tsx`, `AppNavigator.tsx`, `entryUrl.ts`, `useEntryLinkCapture.ts` | 4f9dba8 | FALLA (hallazgo) | Rutas de entrada abajo. Una establece una sesión sin que el usuario esté logueado: H-03. | raw/sec11-deeplinks.txt |
| PAY-01/02/05 | lectura de `supabase/functions/stripe-webhook/index.ts` y `subscriptions/index.ts` | 4f9dba8 | PASA | Ambos webhooks leen el cuerpo crudo (`req.text()`: `stripe-webhook/index.ts:741`, `subscriptions/index.ts:549`) y verifican con `constructEventAsync` (`stripe-webhook:767`, `subscriptions:560`); un fallo devuelve 400. Idempotencia por `event.id`: se inserta primero en `processed_stripe_events` y `23505` = duplicado → 200 sin reprocesar (`stripe-webhook:782-795`, `subscriptions:569-580`); si el handler falla se borra el marcador para que Stripe reintente (`stripe-webhook:833`, `subscriptions:857`). `stripe-webhook` acepta varios secretos (cuenta y Connect). | raw/pay-webhooks.txt |
| F8 | `cd e2e && npm run web:audit` | 4f9dba8 | PASA (sin bloqueantes ni altas) | 30/30 pruebas, 12,8 min, solo lectura. **0 bloqueantes, 0 altas, 3 medias, 166 bajas** (959 apariciones en bruto). Ver sección F8. | raw/web-audit.log · raw/web-audit-REPORTE.md · e2e/artifacts/web-audit/ |

## INV-03 — permisos y claves generadas por `prebuild` (🔴 = a revisar)

**Android (`AndroidManifest.xml`)**: `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`, `CAMERA`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `INTERNET`, `MODIFY_AUDIO_SETTINGS`, 🔴`READ_EXTERNAL_STORAGE`, `RECORD_AUDIO`, 🔴`SYSTEM_ALERT_WINDOW`, `USE_BIOMETRIC`, `USE_FINGERPRINT`, `VIBRATE`, 🔴`WRITE_EXTERNAL_STORAGE`.

- 🔴 `READ_EXTERNAL_STORAGE` y `WRITE_EXTERNAL_STORAGE`: declaradas a mano en `android.permissions` de `app.config.ts`.
- 🔴 `SYSTEM_ALERT_WINDOW` (dibujar sobre otras apps): no está en `app.config.ts`; viene de una dependencia (probable herramienta de desarrollo).
- Sin `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO` ni `ACCESS_BACKGROUND_LOCATION`. Sin `blockedPermissions`.
- `foregroundServiceType`: un servicio, `expo.modules.audio.service.AudioControlsService` con `mediaPlayback`.

**iOS (`Info.plist`)**: `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSLocationWhenInUseUsageDescription`, 🔴`NSLocationAlwaysAndWhenInUseUsageDescription`, 🔴`NSLocationAlwaysUsageDescription`, 🔴`NSMotionUsageDescription`, 🔴`NSFaceIDUsageDescription`, `NSBluetoothAlwaysUsageDescription`, `NSBluetoothPeripheralUsageDescription`, `NSLocalNetworkUsageDescription`. `UIBackgroundModes`: `audio`, `bluetooth-central`.

- 🔴 Ubicación "Always": las dos claves "Always" están presentes con el texto genérico "Allow $(PRODUCT_NAME) to access your location", aunque `UIBackgroundModes` no incluye `location` y la regla del proyecto es GPS solo en uso. Texto genérico sin finalidad = riesgo de rechazo en revisión.
- 🔴 `NSMotionUsageDescription` y `NSFaceIDUsageDescription` también con texto genérico por defecto; no se comprobó si la app usa movimiento.
- Privacy manifest: ninguno generado (`raw/privacy/` vacío); `ios.privacyManifests` no configurado.

## INV-04 — flujos críticos

"Prueba" = prueba automática existente en el repo. La mayoría de los flujos de producto no tienen ninguna.

| Flujo | Pantalla / archivo | Prueba automática | Estado |
|---|---|---|---|
| Login por correo | `mobile/screens/auth/LoginEmailScreen.tsx`, `LoginScreen.tsx`, `ForgotPasswordScreen.tsx`, `ResetPasswordScreen.tsx` | ninguna | sin prueba |
| Apple / Google | `LoginScreen.tsx:69`, `RegisterStep1Screen.tsx:143` (`signInWithOAuth` por navegador; **no** hay Sign in with Apple nativo: `expo-apple-authentication` no está instalado y `prebuild` lo avisa, aun con `ios.usesAppleSignIn` activo) | ninguna | a revisar (H-08) |
| Edad | `mobile/screens/auth/ConfirmAgeScreen.tsx`, `services/age.ts`, `RegisterStep2Screen.tsx`; web `web/app/auth/confirm-age` | ninguna | sin prueba |
| Ubicación | `services/geoPosition.ts` (+`.web.ts`), `geofence.ts`, `venueAccess.ts`, `permissions.ts` | `scripts/geo-position-web.test.mjs` (solo la parte web) | parcial |
| Chat | `mobile/screens/chat/ChatRoomScreen.tsx`, `services/roomAccess.ts`, `venueEntry.ts` | `merge-messages`, `message-profiles`, `venue-unread` (`mobile/scripts`), `e2e/web/chat-avatar.spec.ts` | parcial |
| Foto | `services/avatar.ts`, `storage.ts`, `uploadBody(.web).ts`; moderación `supabase/functions/moderate-dm-photo`, `moderate-match-photo` | `upload-body-web.test.mjs`, `square-crop.test.mjs` | parcial |
| Reportar | `services/reports.ts`, `moderation.ts`, `components/chat/UserActionSheet.tsx` | ninguna | sin prueba |
| Bloquear | `services/blocks.ts`, `screens/settings/BlockedUsersScreen.tsx`, `UserActionSheet.tsx` | ninguna | sin prueba |
| Match | `mobile/screens/match/*`, `services/match*.ts` | ninguna | sin prueba |
| Truth or Dare | `mobile/screens/games/TodHomeScreen.tsx`, `services/tod.ts` | ninguna | sin prueba |
| Compra Verified | `mobile/screens/settings/PricingScreen.tsx` → EF `subscriptions` → Stripe Checkout en el navegador | ninguna | existe; ver H-04 |
| Pago en local | `mobile/screens/checkout/*`, `services/stripe.ts`, `orders.ts`; web `web/app/m/[slug]/CheckoutStep.tsx` | `menu-order-claim.test.mjs`, `e2e/web/menu.spec.ts` (pagos simulados) | parcial |
| Borrado de cuenta (app) | `mobile/screens/settings/SettingsScreen.tsx`, `services/account.ts` → EF `delete-account` | ninguna | sin prueba |
| Borrado de cuenta (web) | `web/app/(legal)/account/delete/DeleteAccountClient.tsx` | ninguna | sin prueba |
| Idioma (es/en) | `mobile/i18n/index.ts`, `services/languageChoice.ts` | ninguna | sin prueba |
| Entrada por QR / enlace | `mobile/utils/entryUrl.ts`, `hooks/useEntryLinkCapture.ts` | `entry-url.test.mjs`, `e2e/web/entry.spec.ts` | con prueba |

## SEC-11 — rutas de entrada (deep links)

| Entrada | Dónde se maneja | Efecto sin sesión |
|---|---|---|
| `https://<local>.jchat.cloud/…`, `https://jchat.cloud/c/<token>`, `jchat://v/…`, `jchat://c/…` | `utils/entryUrl.ts` + `hooks/useEntryLinkCapture.ts` guardan una **entrada pendiente**; `EntryBridge` la consume. La presencia la valida el servidor (`check_geofence_and_join_room`). | Ninguno antes del login. Tras el login, un QR/token une a una sala (lo esperado). |
| `jchat://room/:id`, `jchat://post/:id` | `navigation/AppNavigator.tsx:196-207` (React Navigation `linking`) | Solo abren pantallas; el acceso a datos depende de RLS. |
| `jchat://confirm?code=…` o `jchat://confirm#access_token=…&refresh_token=…` | `context/AuthContext.tsx:96-141` (`handleAuthUrl` → `exchangeAuthUrl`) | **Sí: establece la sesión.** El camino `#access_token/refresh_token` llama a `supabase.auth.setSession` con los tokens del propio enlace. H-03. |
| `https://*.jchat.cloud` (Android `autoVerify`, comodín) | intent filters de `app.config.ts` | solo entrada de local |

## INV-05 — borrador del mapa de datos

| Servicio | Datos que recibe | Finalidad | Fuente |
|---|---|---|---|
| Supabase (proyecto único) | cuenta, perfil, mensajes, fotos, pedidos, posición puntual para la geovalla, tokens de push | backend completo | `mobile/services/supabase.ts` |
| Stripe (+ Connect, Terminal) | pagos, importes, id de pedido; la tarjeta solo pasa por el SDK de Stripe | cobro y suscripción Verified | `supabase/functions/payments`, `guest-pay`, `stripe-*` |
| hCaptcha | token del reto, IP del dispositivo | antibots en registro y pago de invitado | `guest-pay` (`api.hcaptcha.com`), `@hcaptcha/*` |
| Google Maps (SDK nativo / web) | posición de visualización del mapa | mapa | `app.config.ts` (`GOOGLE_MAPS_KEY`) |
| Google Cloud Vision (SafeSearch) | fotos subidas | moderación de imagen | `supabase/functions/_shared/safesearch.ts` |
| Expo Push / Expo Updates | token de push, versión de la app | notificaciones y actualizaciones OTA | `send-push`, `expo-notifications`, `expo-updates` |
| Resend | contenido de alertas de seguridad | correo de alerta | `supabase/functions/safety-alert` |
| Anthropic, OpenAI, Google Gemini | datos y fotos de menú del negocio (asistente) | asistente de menú / generación de imagen | `supabase/functions/menu-assistant` |
| Firebase (`google-services.json`, `GoogleService-Info.plist`) | desconocido: no hay Analytics/Crashlytics en `package.json` | probablemente solo FCM/APNs | `app.config.ts` |
| Analítica / registro de errores (Sentry, PostHog…) | — | no se encontró ninguno en `package.json` de mobile ni web | — |
| Vercel (hospedaje de `web/`) | tráfico web | hospedaje | desconocido (configuración fuera del repo) |

Marcado "desconocido": qué recibe exactamente Firebase; la retención de cada proveedor de IA; el uso de Vercel Analytics.

## F8 — auditoría web (solo lectura)

`npm run web:audit` (30/30 pruebas pasan). Informe completo: `raw/web-audit-REPORTE.md`. **0 bloqueantes · 0 altas · 3 medias · 166 bajas.**

| # | Gravedad | Descripción |
|---|---|---|
| 1 | media | axe `color-contrast` en la landing de producción y páginas legales (p. ej. `#ff8a65` sobre `#fafafa` = 2,21; `#fff` sobre `#5c7cfa` = 3,67; mínimo 4,5). Conocido: pendiente del despliegue de `web/`. |
| 2 | media | axe `color-contrast` en la app (`#5c7cfa` sobre `#202436` = 4,18) en una insignia de inicial. |
| 3 | media | `console-error` de hidratación de React en la hoja del menú (`IconRail`), ya conocido. |
| 4–13 | baja | avisos de consola del controlador WebGL (login y recuperar contraseña) en Chrome headless. |
| — | baja | 156 objetivos táctiles menores de 40×40 en móvil (lista en el informe). |

## Hallazgos y severidad propuesta (la decide Planning)

| # | Sev. propuesta | Hallazgo | Dónde |
|---|---|---|---|
| H-01 | ~~**P1**~~ **RESUELTO `46a9259`** | `next` 16.2.9 con avisos: salto de middleware/proxy (alto; Turbopack + un solo idioma), SSRF, DoS y 3 críticos de RCE (Windows, optimización AVIF, `next/og`). Parche: 16.4.0. El repo no usa `next/og`, `next/image` ni Server Actions y el hospedaje es Vercel (no Windows), así que casi todo no alcanza. El salto de middleware pesa menos de lo que parece: `web/middleware.ts` solo refresca la sesión y la protección de rutas vive en `dashboard/layout.tsx` (comentario en `middleware.ts:4-6`); aun así conviene actualizar a 16.4.0 y comprobar si se cumple su condición (Turbopack + un solo idioma). | `web/package.json:22`, raw/npm-audit-web.json |
| H-02 | **P2** | Dependencias móviles con avisos altos/críticos (`shell-quote`, `@xmldom/xmldom`, `node-forge`, `metro*`, `image-size`, `brace-expansion`, `browserslist`…): casi todas son herramientas de compilación (CLI de Expo/Metro) y no llegan al bundle. Los que cuelgan de `react-native`, `react-native-maps`, `@stripe/stripe-react-native`, `datetimepicker`, `react-native-bluetooth-classic` y `swipe-deck` son avisos heredados de `react-native`; `@react-native-motion-kit/swipe-deck` sin arreglo. | raw/npm-audit-mobile.json |
| H-03 | ~~**P1**~~ **RESUELTO `7676da1`** | Un enlace `jchat://confirm#access_token=…&refresh_token=…` abierto desde cualquier app o página hace que la app ejecute `supabase.auth.setSession` con esos tokens: se puede **cambiar la cuenta de la víctima por la del atacante** sin que lo note (fijación de sesión). El único filtro es `url.includes('://confirm')`. | `mobile/context/AuthContext.tsx:96-141` |
| H-04 | ~~**P0 (riesgo de rechazo)**~~ **RESUELTO `2e6aa86`** | La suscripción "Verified" ($1,99/mes, bien digital) se compra desde la app con Stripe Checkout en el navegador (`Linking.openURL`), sin compra dentro de la app. Las guías 3.1.1 de Apple y la política de pagos de Google Play exigen su propio sistema para bienes digitales. Decisión de producto/legal, no técnica. | `mobile/screens/settings/PricingScreen.tsx:66-76`, EF `subscriptions` |
| H-05 | **P2** | Token de sesión en AsyncStorage (sin cifrar) en vez de Keychain/Keystore. | `mobile/services/supabase.ts:53` |
| H-06 | ~~**P1**~~ **RESUELTO `fa49cb0`** | Permisos y textos de privacidad: "Always location" y "Motion" con texto genérico sin finalidad; `READ/WRITE_EXTERNAL_STORAGE` y `SYSTEM_ALERT_WINDOW` en Android (política de permisos de Play); sin `PrivacyInfo.xcprivacy` de la app ni `ios.privacyManifests`. | ver INV-03 |
| H-07 | **P3** | ESLint web: 169 errores y 69 avisos; mobile sin ESLint. 109 `console.warn/error` en producción. | QA-03, QA-07 |
| H-08 | **P2** | `ios.usesAppleSignIn` activo pero `expo-apple-authentication` no está instalado (el login con Apple va por navegador). Con Google también ofrecido, la guía 4.8 pide un inicio de sesión equivalente; comprobar que el flujo actual cumple y que el entitlement no sobra. | `app.config.ts`, raw/prebuild.log |
| H-09 | **P3** | `aps-environment=development` en la config introspectada. Normalmente la firma de distribución lo cambia a `production`; verificar en el primer build de `production`. | raw/JChat.entitlements |
| H-10 | **P3** | `expo-dev-client` (y `SYSTEM_ALERT_WINDOW`) están en las dependencias: asegurar que el perfil `production` de EAS no los incluya. | `mobile/package.json:32` |
| H-11 | **P3** | Casi todos los flujos de producto (login, edad, reportar, bloquear, Match, Truth or Dare, borrado de cuenta, idioma) no tienen prueba automática. | INV-04 |
| H-12 | **P3** | Contraste en la landing de producción (F8 #1) y en la insignia de inicial de la app (F8 #2): ya conocidos y pendientes del despliegue de `web/`. | F8 |

Sin hallazgos de: gitleaks, trufflehog, semgrep y la búsqueda de secretos en los bundles.

## Bloqueado / limitaciones

- Ningún punto quedó BLOQUEADO. Limitaciones: semgrep corrió con 118 reglas; `PrivacyInfo.xcprivacy` de los pods no se puede evaluar sin instalar pods (no se hizo); el análisis de qué recibe Firebase y Vercel requiere acceso fuera del repo.
