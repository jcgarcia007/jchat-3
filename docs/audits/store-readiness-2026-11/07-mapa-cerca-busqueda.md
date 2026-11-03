# Bloque 7 — Mapa, Cerca de mí y búsqueda (parcial)

Fecha: 2026-11-02 · main `9bd62175` (OTA vigente) · Evidencia: `screenshots/b07/` (sin commit).
Cuentas: **@test** (Android 35) y **@test1** (iPhone 17 Pro). Solo lectura en producción. Tema y fuente restaurados en ambos dispositivos (Android 1,0× / claro; iOS `large` / claro).

## Qué se probó
| Elemento | Resultado |
|---|---|
| Mapa Android: marcadores, "Bar XZX · cerrado", zoom, centrar, controles | OK (`android35-01`) |
| Búsqueda "xzx" | OK: "Bar XZX, Bar & Nightclub, 0 ft" con "Cancelar" |
| Búsqueda sin resultados | OK: «Sin resultados para «qqqq»» (`android35-03`) |
| Filtros avanzados (Distancia 0.6/1.2/3.1/6.2 mi, "Solo abierto ahora", Restablecer todo, Aplicar) | OK; con "Solo abierto ahora" + 0.6 mi → "1 lugar cerca de ti" (singular correcto) y enlace "Restablecer" (`android35-05`) |
| Textos es/en (solo lectura de `i18n/locales`) | Paridad completa: `map` 92/92, `nearby` 14/14, `offers` 22/22; solo coinciden es=en `shareMessage`, `distanceKm`, `distanceMiles` (esperable). Pantalla en español comprobada; **no se cambió la app a inglés en el dispositivo** |
| Cerca de mí (iOS, normal) | OK: lista con estado Abierto/Cerrado, salas, "Entrar", dock "Volver al chat / Salir" |
| Android 2,0× + oscuro (B5-4) | Reproducido y explicado (ver B7-2/B7-3) |
| iOS texto máximo + app en claro | Falla (B7-1) |

## Hallazgos
| ID | Sev. | Pantalla / plataforma | Pasos | Esperado → Obtenido | Evidencia | Propuesta (sin implementar) |
|---|---|---|---|---|---|---|
| B7-1 | **P1** → agrupado en **DT-1** | Mapa, Cerca de mí, Mensajes y dock · iOS con texto máximo | `simctl ui content_size accessibility-extra-extra-extra-large` | Ver DT-1 abajo | `ios17pro-02`, `-03`, `-05` | Ver DT-1 |
| B7-2 | **P2** | Cambio de tamaño de fuente con la app abierta · Android | Con el chat de Bar XZX abierto y el dock activo: `settings put system font_scale 2.0` (y tema oscuro) | La app debe conservar la pantalla y la sesión del local → **la actividad se recrea**: vuelve a la pestaña Mapa, **se cierra el chat y desaparece el dock "Volver al chat"** (sesión del local en memoria perdida; la presencia de @test siguió en BD hasta expirar, sin latido). Causa: `android/app/src/main/AndroidManifest.xml:44`, `android:configChanges` incluye `uiMode` pero **no `fontScale`** (viene de la plantilla de prebuild, por lo que el binario de tienda tiene lo mismo). Cambiar solo el tema oscuro **no** recrea (el `uiMode` sí está). iOS no recrea: conserva dock y pestaña. Texto escrito y no enviado en el chat: no comprobado | `android35-06` (antes) y `-07`, `-08` (después) | Añadir `fontScale` (y `density`) a `configChanges` mediante plugin de config de Expo; o restaurar la sesión del local al reabrir. **El arreglo requiere build nativo** (cambia el manifiesto): **no se puede enviar por OTA** y, además, cambia el fingerprint/runtime version (ver `preflight-eas.mjs` y la nota del CLAUDE.md) |
| B7-3 | P3 | Mapa · Android | Ver el Mapa en claro y en oscuro 2,0× | Controles con contraste/etiqueta clara → el selector "Normal / Satélite" aparece **siempre desplegado** sobre el mapa (sin botón que lo abra) y a 2,0× crece; el contador "N lugares cerca de ti" no tiene fondo y se superpone a las calles del mapa oscuro (contraste bajo). El transitorio negro visto en B5-4 al recrear la app no se repitió: era la recreación en curso | `android35-01`, `-07` | Fondo/pastilla para el contador; selector plegado con un botón de capas |
| B7-4 | decisión pendiente de Juan | Cerca de mí · iOS | Ver la lista a las 22:26 | Entrar debe avisar → locales "Cerrado" siguen mostrando "Entrar" activo (se puede entrar a un local cerrado) | `ios17pro-01` | Decisión de producto: aviso "cerrado" en la hoja de entrada |

## DT-1 (P1): Dynamic Type / escala de fuente en toda la app
Agrupa **B1-1** (Login iOS), **B3-2** (chat iOS) y **B7-1** (Mapa, Cerca de mí, Mensajes y dock iOS). Causa única: el texto escala sin límite y los contenedores tienen altura fija, sin tope de escala en ningún sitio.
**Pantallas afectadas (iOS, texto máximo):** Login y LoginEmail (B1-1); sala de chat completa: cabecera, pestañas de salas, burbujas, nombre de quien escribe y campo "Mensaje…" (B3-2); Cerca de mí (lista de locales, chips, "Entrar"), Mapa (chips, etiquetas de locales, menú de estilo), Mensajes (título y fila de la bandeja) y el dock "Volver al chat / Salir" en todas las pestañas (B7-1). En Android a 2,0× solo se degrada el Login (B1-2, P2) y el Mapa se ve bien (B7-3).
**Inventario para el arreglo (solo lectura, `mobile/`):**
- `maxFontSizeMultiplier` / `allowFontScaling`: **0 usos** en `screens/`, `components/`, `navigation/`, `context/`, `hooks/`; no hay `defaultProps` global ni parche de `Text`. Todo escala con el sistema (hasta ≈3,1× en iOS AXXXL).
- Alcance: **156 archivos** de `screens`/`components` usan `<Text`; **330 `height: N`** fijos en estilos de `screens`, `components` y `navigation`.
- Principales alturas fijas por archivo: `components/profile/ProfileHeader.tsx` (9), `screens/settings/PosOrderScreen.tsx` (8), `screens/menu/ProductDetailScreen.tsx` (8), `components/map/FilterPanel.tsx` (8: chips 32–46, filas 28–46), `components/map/BusinessPreviewCard.tsx` (7), `screens/settings/PosTableHub.tsx` (6), `screens/map/MapScreen.tsx` (6), `screens/checkout/CheckoutScreen.tsx` (6), `screens/auth/RegisterStep1Screen.tsx` (6), `components/chat/ChatTopBar.tsx` (6), `screens/reservations/ReservationScreen.tsx` (5), `screens/posts/PostDetailScreen.tsx` (5), `screens/onboarding/OnboardingScreen.tsx` (5), `screens/match/MatchMyProfileScreen.tsx` (5).
- Dock (`components/venue/VenueDock.tsx`): todo en `numberOfLines={1}` con `minHeight: 20` (`:333`) y botones de alto fijo → se recorta con escala alta.
- **Propuesta (sin implementar):** (1) un componente `AppText` o un `Text.defaultProps.maxFontSizeMultiplier` global (≈1,3 en etiquetas de control: chips, botones, dock, pestañas, marcadores) y 1,6–2,0 en texto de lectura (mensajes, bios); (2) cambiar `height` por `minHeight` + `paddingVertical` en esos 14 archivos y en los controles táctiles; (3) test de capturas en iOS AXXXL y Android 2,0× de Login, chat, Cerca de mí, Mapa, Mensajes y dock.

## Test manual de B7-2 (para cuando exista el build nativo)
1. Instalar el build nativo con `fontScale` en `configChanges`; entrar a Bar XZX, abrir el chat con un texto sin enviar escrito y dejar el dock activo.
2. En Ajustes del sistema cambiar el tamaño de fuente (Normal → Mayor) sin cerrar la app.
3. **Debe pasar:** (a) la app **no se recrea**: sigue en el chat, el texto sin enviar sigue en el campo, el dock "Volver al chat" y la presencia (`match_presence.last_seen_at` sigue renovándose) se mantienen; (b) **la letra se actualiza al instante** en la pantalla abierta, sin reiniciar la app (comprobar un texto de chat y las pestañas inferiores).
4. Repetir con tema oscuro y al volver a la fuente normal. Si (a) o (b) falla, no se publica: (b) sin recrear la actividad obliga a que los componentes lean la escala actual (`PixelRatio.getFontScale()` / `useWindowDimensions`).

## B7-4: decisión pendiente de Juan
Mostrar "Entrar" activo en un local "Cerrado" (iOS Cerca de mí) y permitir entrar a su chat: ¿se permite, se avisa o se bloquea? Hasta que Juan decida queda como **decisión pendiente**, no defecto.

## No probado y por qué
| Qué | Motivo |
|---|---|
| Ubicación **"solo esta vez"** y la transición permitido → denegado con la app abierta | `pm revoke` mata la app en Android y el simulador de iOS no ofrece "solo esta vez"; queda para un dispositivo real. **Ubicación denegada** ya probada en el Bloque 3 (el mapa ofrece "Abrir Ajustes"; la compuerta del chat no: B3-1). Permiso concedido: se usó en todo este bloque |
| App en inglés (textos de búsqueda/filtros en pantalla) | No se cambió el idioma de las cuentas de prueba; paridad verificada en los archivos |
| Tema oscuro en iOS | El simulador estaba en oscuro pero la app siguió clara: la app tiene su propio ajuste Apariencia (Oscuro / Claro / Sistema) y el valor de @test1 no se comprobó; no es hallazgo |
| Vista previa del local en el mapa, pestaña Ofertas y su radio, reserva, Android 36/26, iPhone 17e, TalkBack/VoiceOver real | No se alcanzó |

## Estado en que quedan los dispositivos
Android: fuente 1,0×, tema claro, fuera del chat (en el Mapa); @test conserva presencia en BD hasta expirar. iOS: `content_size large`, apariencia clara, en la pestaña Mensajes con el dock activo.
