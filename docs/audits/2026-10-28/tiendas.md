# Auditoría de tiendas — App Store y Google Play (2026-10-28)

Solo lectura. Reglas de Apple leídas hoy de las App Store Review Guidelines oficiales (developer.apple.com/app-store/review/guidelines). Las de Google Play las cito por nombre de política (Developer Program Policy: *User Generated Content*, *Payments*, *Data safety*, *Permissions*, *Alcohol* dentro de *Restricted Content*); la página de plazos de Google que pude abrir no recoge su texto, así que **esos puntos están citados de memoria y conviene releerlos en Play Console antes de enviar**. Nota de calendario de esa página: desde 2026-08-26 las apps de chat anónimo/aleatorio tienen reglas más duras de menores y contenido restringido; JChat no es anónimo (cuentas con edad confirmada), pero el revisor lo mirará.

Leyenda: ✅ cumple · ❌ no cumple · ⚠️ dudoso / por comprobar.

## Resumen

| Tema | Apple | Google | Estado |
|---|---|---|---|
| UGC: filtrar, reportar, bloquear, contacto | 1.2 | UGC policy | ⚠️ |
| Borrado de cuenta dentro de la app | 5.1.1(v) | Account deletion (+ enlace web) | ✅ |
| Sign in with Apple | 4.8 | — | ✅ |
| Pagos: digital vs. físico | 3.1.1 / 3.1.3(e) | Payments | ⚠️ |
| Alcohol 21+ / DNI | 1.4.3 | Alcohol (Restricted Content) | ❌ |
| Permiso de ubicación (solo en uso, texto claro) | 5.1.5 | Permissions | ⚠️ |
| Privacy manifest y APIs de razón requerida | 5.1.1 | — | ⚠️ |
| Enlaces de privacidad y términos | 5.1.1 | Privacy policy | ✅ |
| Data safety | — | Data safety | ⚠️ |
| Cuenta demo y nota para el revisor | 2.1(a), 2.3.1(a) | App access | ❌ |

## 1. Contenido generado por usuarios — Apple 1.2 / Google UGC

Apple 1.2 exige: (1) filtrar contenido ofensivo, (2) reportar con respuesta rápida, (3) bloquear abusadores, (4) contacto publicado.

- Reportar: ✅ `components/report/ReportReasonSheet.tsx`, usado en `screens/chat/ChatRoomScreen.tsx:2075` (mensajes de sala), `screens/dms/DMChatScreen.tsx:969` (DMs), `screens/profile/ProfileScreen.tsx:413` (usuario), `screens/posts/PostDetailScreen.tsx:247,254` (publicación y comentario), `components/match/MatchSafety.tsx:79` (Match). Servidor: `admin_hide_content` oculta post/comentario/mensaje/DM (`supabase/migrations/245_baseline.sql:61`).
- Bloquear: ✅ `screens/settings/BlockedUsersScreen.tsx`, `components/chat/UserActionSheet.tsx`, DMs, perfil y Match.
- Filtro: ✅ fotos de DM y de Match se moderan (funciones `moderate-dm-photo`, `moderate-match-photo`, difuminado hasta el veredicto). ⚠️ No vi filtro de **texto** ofensivo ni moderación de las fotos de **posts** y **stories**; Apple suele aceptar reportes + moderación humana si el equipo responde, pero conviene decirlo en la nota al revisor.
- **Verdad o Reto** (`screens/games/TodHomeScreen.tsx`): ⚠️ no encontré botón de reporte/bloqueo en esa pantalla. Si las cartas o respuestas son de usuarios, hay que ofrecer reportar ahí; si son del sistema, decirlo en la nota.
- Stories: ⚠️ no encontré `ReportReasonSheet` en pantallas de stories; comprobar que se pueden reportar.
- Contacto publicado: ✅ web `jchat.cloud/support`, `/contact`, `/safety` (`web/app/(legal)/`). ⚠️ Poner también un enlace "Contactar / Seguridad" dentro de la app.
- Qué hacer: añadir reporte a Verdad o Reto y a stories (si faltan); frase en la nota al revisor: "reportar, bloquear y moderación humana disponibles; respuesta en menos de 24 h".

## 2. Borrado de cuenta — Apple 5.1.1(v) / Google Account deletion

✅ Dentro de la app: `screens/settings/SettingsScreen.tsx:840` llama a la Edge Function `delete-account` (verifica JWT con `getUser`). Web para Google (exige URL pública de borrado): `web/app/(legal)/account` ⚠️ confirmar que la página explica el borrado y funciona sin la app, y poner esa URL en Play Console. Apple también pide poder desvincular las cuentas sociales: ⚠️ comprobar que "Eliminar cuenta" revoca el token de Apple (Sign in with Apple lo exige al borrar).

## 3. Sign in with Apple — Apple 4.8

✅ Hay login con Google (`screens/auth/LoginScreen.tsx:52`, `RegisterStep1Screen.tsx:162`) y también Apple nativo (`services/appleSignIn.ios.ts:43`, `usesAppleSignIn: true` en `app.config.ts:65`). Cumple 4.8. ⚠️ En iOS el botón de Apple debe tener al menos el mismo protagonismo que el de Google y funcionar con "Ocultar mi correo".

## 4. Pagos — Apple 3.1.1 / 3.1.3(e) / Google Payments

- Pedidos de comida/bebida, propinas y **regalos** (un trago o plato que alguien recoge en el local): bienes físicos consumidos fuera de la app → Stripe/Apple Pay permitido (3.1.3(e)). ✅
- Regalos: Apple 3.2.1(vii) permite regalos a individuos sin IAP si el 100 % llega al destinatario y no desbloquean contenido digital. ✅ por diseño; mantener la redacción "te invito a un trago".
- **Verified** y planes de negocio vía Stripe Checkout (`screens/settings/PricingScreen.tsx:74` llama a `subscriptions` y abre el navegador). El propio archivo dice que **no está enlazado** en ninguna navegación (cabecera, línea 3). ✅ mientras siga así. ⚠️ Si "Verified" se ofreciera a **usuarios** dentro de la app, sería una función digital → exigiría IAP. Las suscripciones para **negocios** se gestionan en la web (dashboard): dejarlo así y que la app no muestre precios ni botón de compra para ellas.
- Google *Payments*: bienes físicos/servicios pueden usar Stripe; lo digital, no. Mismo criterio. ✅/⚠️ idéntico.

## 5. Alcohol — Apple 1.4.3 / Google Alcohol policy

- ❌ No encontré verificación de **21+** ni de DNI en el flujo de pedido: solo un aviso "21+ cuando haga falta" en `components/gift/GiftCard.tsx:7`, y la mayoría de edad se confirma al registrarse (`ConfirmAgeScreen`, `confirm_age`). Apple no prohíbe vender alcohol por una app de bar, pero 1.4.3 no admite "alentar consumo excesivo" y la clasificación de edad debe ser coherente; Google restringe el alcohol por país y exige que no se venda a menores.
- Qué hacer: (a) clasificación **18+** en la ficha y texto "se sirve solo en el local"; (b) marcar los productos con alcohol y mostrar "Solo mayores de 21; se pedirá identificación" antes de pagar; (c) el local verifica la edad al servir. Documentarlo en la nota al revisor. ⚠️ La base solo guarda el año de nacimiento (`users.birth_year`), así que el servidor no distingue 20 de 21: la comprobación final es humana.

## 6. Ubicación — Apple 5.1.5 / Google Permissions

- Solo "mientras se usa": ✅ `NSLocationWhenInUseUsageDescription` es la única clave de ubicación (`app.config.ts:212-223`, Always desactivado), y Android bloquea `ACCESS_BACKGROUND_LOCATION` (`app.config.ts:129`).
- Texto (`ios/JChat/Info.plist`): "JChat uses your location to show nearby venues on the map and to connect to nearby card readers." ⚠️ **No dice la razón principal**: confirmar que estás físicamente en el local para abrir su chat. Apple (5.1.5) pide explicar el propósito real. Cambiar a: "JChat usa tu ubicación para confirmar que estás en el local y abrir su chat, mostrar locales cercanos y conectar lectores de tarjeta." (constante `LOCATION_WHEN_IN_USE` de `app.config.ts`, y su versión en español).
- Privacidad: ✅ la ubicación en tiempo real no se comparte con otras personas (regla del proyecto; la migración de seguridad 248 cierra los oráculos de presencia que quedaban).

## 7. Privacy manifest — `PrivacyInfo.xcprivacy`

- Existe (`ios/JChat/PrivacyInfo.xcprivacy`, generado desde `app.config.ts:71`). Seguimiento: no. APIs de razón requerida declaradas: UserDefaults (CA92.1), FileTimestamp (C617.1), SystemBootTime (35F9.1), DiskSpace (E174.1).
- ⚠️ `NSPrivacyCollectedDataTypes` está **vacío** (`<array/>`). La app recoge correo, nombre, fotos, mensajes, ubicación, identificadores y datos de compra (vía Stripe). Apple lo contrasta con la etiqueta de privacidad de App Store Connect; si no coinciden puede haber avisos. Rellenar con los tipos reales (Email, Name, Photos, UserContent, PreciseLocation, UserID, PurchaseHistory), vinculados al usuario, sin seguimiento.
- ⚠️ El propio comentario del archivo dice "revalidar con los avisos ITMS del primer TestFlight": hacerlo antes de enviar a revisión.

## 8. Enlaces de privacidad y términos

✅ Dentro de la app: `SettingsScreen.tsx:441,445` abren `https://jchat.cloud/privacy` y `/terms`; en el registro también (`RegisterStep2Screen.tsx`). Páginas públicas existen (`web/app/(legal)/privacy`, `terms`, `safety`, `support`). ✅ La URL de privacidad ya está anotada en `docs/store-listing/app-store.en.md`. ⚠️ Revisar que la política cite: moderación de fotos por servicio externo, Stripe, Sentry, retención y borrado.

## 9. Google Play — Data safety y permisos

- Permisos: ✅ limpios (`blockedPermissions` en `app.config.ts:129-137` quita almacenamiento, medios, ubicación en segundo plano, AD_ID y SYSTEM_ALERT_WINDOW).
- Data safety: `docs/store-listing/google-play.en.md:60` lo describe (ubicación aproximada y precisa solo para confirmar presencia, fotos, mensajes, identificadores). ⚠️ Debe declarar también nombre/correo, datos de pago (Stripe), diagnósticos de fallos (Sentry) y que se puede pedir el borrado. Coherente con el manifiesto de Apple.
- Bluetooth: ⚠️ `NSBluetooth*` y los permisos Android de Bluetooth son para lectores de tarjeta e impresoras de los negocios; explicarlo en la nota (no es para usuarios finales).
- Clasificación de contenido (IARC): contestar con UGC, interacción entre usuarios, alcohol y juegos para adultos → saldrá "Adultos / 18+". Verdad o Reto ya dice "+18".

## 10. Cuenta demo y nota para el revisor — Apple 2.1(a), 2.3.1(a) / Google "App access"

- ❌ La nota actual (`docs/store-listing/app-store.en.md:73`) dice "tienes que estar físicamente en un local o usar la cuenta demo", pero **no existe** una cuenta demo ni un local de demostración preparados, y el chat de un local solo abre si el GPS te sitúa dentro (`screens/chat/useGeofenceGate.ts`). Un revisor en California no puede probarlo → rechazo casi seguro por 2.1 (no se puede revisar la función principal).
- Solución que ya existe en el código: el **dueño del local** entra a su propio chat sin estar presente (`useGeofenceGate.ts:19`, "Owner bypass"). Plan: crear en producción un local "JChat Demo" y una cuenta de revisor que sea **dueña** de ese local, más 2–3 cuentas de demostración (personas ficticias) con mensajes, un menú de 5–6 productos y una oferta. Así el revisor ve el chat, pide, regala y juega Match/Verdad o Reto.
- Texto propuesto para *Notes for Review* (inglés):

  > JChat opens a venue's chat only when the phone is physically inside that venue (location, while in use). To let you test without travelling, we created a demo venue and account. Sign in with email `<REVIEWER_EMAIL>` / password `<REVIEWER_PASSWORD>`. This account owns the venue "JChat Demo", so it can enter the venue chat from anywhere. In the chat you can: send messages; long-press a message to report or block; open a profile to report or block; open "Menu" to order; send a gift to the second demo user; try Match and Truth or Dare (18+). Account deletion: Settings → Delete account. Food and drink orders are physical goods consumed at the venue, so they use Stripe / Apple Pay (guideline 3.1.3(e)). Alcohol items require 21+ and ID at the venue. Support: https://jchat.cloud/support — reports are reviewed by a human moderator within 24 hours.

  (Rellenar usuario y clave con los reales; **no** guardarlos en el repositorio.)
- Google "App access": mismo usuario/clave y las mismas instrucciones.
- Cuidado con las capturas: no usar las cuentas de prueba actuales (tienen contenido explícito de pruebas, ver `docs/store-listing/screenshots-plan.md`).

## Bloqueos, de mayor a menor riesgo de rechazo

1. ❌ **Sin cuenta demo / acceso de revisor al chat del local** (Apple 2.1, Google App access). Rechazo casi seguro. Crear local demo + cuenta dueña + nota (punto 10).
2. ❌ **Alcohol sin aviso 21+ / DNI en el pedido y clasificación de edad** (Apple 1.4.3 y cuestionario de edad; Google Alcohol). Marcar productos, aviso antes de pagar, clasificación 18+.
3. ⚠️ **UGC incompleto**: sin reporte visible en Verdad o Reto y (por comprobar) en stories; sin filtro de texto (Apple 1.2).
4. ⚠️ **Privacy manifest con `NSPrivacyCollectedDataTypes` vacío** y etiquetas de privacidad / Data safety que deben coincidir (Apple 5.1.1, Google Data safety). Suele ser aviso, no rechazo.
5. ⚠️ **Texto del permiso de ubicación** no explica el uso principal (Apple 5.1.5). Cambio de una línea.
6. ⚠️ **"Verified" y suscripciones**: no exponer compra de funciones digitales a usuarios dentro de la app (Apple 3.1.1). Hoy está desenlazado: mantenerlo.
7. ⚠️ Revocar el token de Apple al borrar la cuenta; URL web de borrado en Play Console.
