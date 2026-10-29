# Encargo de noche — informe (2026-10-29)

Nada se aplicó ni se desplegó. Sin llamadas a producción, a Stripe, a Apple ni a Google; sin `pod install`, `expo run`, `expo prebuild`, Gradle ni `eas build`; sin iniciar sesión con ninguna cuenta. Todo lo de base de datos se probó en Supabase **local**. Ningún merge a main y ningún force push a main en esta tanda. Cada rama se empujó sola.

## Qué se hizo y qué no

| Parte | Estado |
|---|---|
| 0. `fix/store-blockers` | **Terminada y verificada**: tsc móvil y web, 27 pruebas de Deno, 660 de Node, 112 de SQL local, 47 herméticas, 21 de WebKit con red simulada (2 saltadas por ser opt-in). Empujada, sin merge. |
| 1. `feat/app-review-kit` | **Hecha**: seed y teardown del local de demo (probados dos veces seguidas en local, con la revisora entrando sin ubicación), notas para Apple y Google en inglés, ficha de tienda es/en, respuestas de Data safety, guía de pasos. Nada ejecutado en producción. |
| 2. `fix/native-wallets` | **Hecha**: Google Pay activado y `testEnv` por clave; Apple Pay verificado; guía manual. **Cambia el fingerprint de EAS (iOS y Android).** Sin construir. |
| 3. `fix/i18n-a11y` | **Hecha, con matices**: las traducciones ya estaban completas (0 problemas); se añadió el informe `check-i18n.mjs` y escáneres/tests nuevos de accesibilidad y contraste; se arreglaron 11 imágenes y 16 textos de estado. Ver "Matices". |
| 4. Estudio Liquid Glass | **Hecho** (`docs/design/liquid-glass.md`, en la rama de este informe). El mockup del canvas no está en el repo y la página de Apple no cargó entera: está dicho en el documento. |
| No hecho a propósito | Merges; aplicar 248/249/250; ejecutar el seed; desplegar funciones; builds; fusionar `fix/security-audit` ni `fix/perf-indexes` (ya existían). |

## Ramas (`git log --oneline main..<rama>`)

**fix/store-blockers**
```
f1bc7412 test: the gift page props test knows the new idRequired prop
628bcc96 store: Report and Block on other people's stories … and a visible Report on Truth or Dare results …
872c8569 store: draft migration 250 (not applied) — stories can be reported and hidden …
061b7600 store: 21+ notice before paying a product with id_required (cart, checkout, gift sheet and web gift page, Next.js menu checkout) …
5337304f store: privacy manifest declares the collected data types (13, linked, no tracking; precise location for presence) …
d21a3380 store: location permission text says why (confirm you are at the venue, only while using the app) …
43988824 security: x-push-secret compared in constant time through _shared/safeEqual.ts in the five functions …
```

**feat/app-review-kit**
```
36aac643 review kit: notes for the Apple and Google reviewers (English), store listing (es/en, age questionnaires, screenshot plan), Google Data safety …
c951720d review kit: demo venue test — gift_available returns t
de9efb54 review kit: the demo venue also turns on Match and Truth or Dare and gives the reviewer and the four people 14 days of presence …
a6e3c8bf review kit: demo venue seed + teardown (scripts, not a migration) and a local test …
```

**fix/native-wallets**
```
0b5ba7fe wallets: Google Pay on in the Stripe plugin and its environment follows the publishable key (pk_test_ -> test), not __DEV__ …
```

**fix/i18n-a11y**
```
71b96199 contrast: text/background pairs of the main screens checked in light and dark; status text now uses c.brandText / c.dangerText / c.warningText …
14da95f3 a11y: scanner and test for the main screens (touch targets under 44 pt without hitSlop, images without a description, allowFontScaling false, icon-only buttons with no exceptions) …
5d7db9b9 i18n: scripts/check-i18n.mjs — es/en parity (app and web), empty values, variables per language, identical-copy hint, hand-written texts …
```

**docs/overnight-2026-10-29**: este informe y `docs/design/liquid-glass.md`.

Ramas de la noche anterior, sin tocar: `fix/security-audit` (248), `fix/perf-indexes` (249). Ya en main: `fix/web-pay-keyboard` y `audit/launch-readiness`.

## Tabla de privacidad definitiva para App Store Connect

Todo **vinculado al usuario: Sí** y **tracking: No** (`docs/store-listing/app-privacy-labels.md`, rama `fix/store-blockers`; el test `privacy-manifest.test.mjs` la mantiene igual que `app.config.ts`):

| Tipo de dato | Vinculado | Tracking | Finalidades |
|---|---|---|---|
| Email Address | Sí | No | App Functionality |
| Name | Sí | No | App Functionality |
| Phone Number | Sí | No | App Functionality (opcional, pedidos de invitado) |
| Precise Location | Sí | No | App Functionality (presencia en el local; no se guardan las coordenadas) |
| Photos or Videos | Sí | No | App Functionality (perfil, posts, stories, DMs, Match, selfies de verificación) |
| Audio Data | Sí | No | App Functionality (notas de voz) |
| Other User Content | Sí | No | App Functionality |
| User ID | Sí | No | App Functionality (id de cuenta, token de notificaciones) |
| Purchase History | Sí | No | App Functionality |
| Payment Info | Sí | No | App Functionality (tarjeta, la recoge Stripe) |
| Crash Data | Sí | No | Analytics (Sentry) |
| Performance Data | Sí | No | Analytics (Sentry) |
| Other Data Types | Sí | No | App Functionality (año de nacimiento) |

Un cambio respecto a lo propuesto: **Payment Info** en lugar de "Other Financial Info", porque el número de tarjeta se teclea en los campos de Stripe. Si prefieres lo otro, se cambia en `app.config.ts` y en la tabla.

## Lo que tengo que hacer yo por la mañana (en orden)

1. **Revisar y aplicar la 248 por MCP** (seguridad: presencia, stories, reacciones de mapa), correr `248_check.sql`, probar a mano. Luego avisar para fusionar `fix/security-audit` (el mensaje del merge dirá "248 applied in production by Juan Carlos via MCP on <fecha>").
2. **Fusionar `fix/store-blockers`** (después de revisarla). Ojo con los conflictos esperados: `fix/i18n-a11y` y `fix/store-blockers` tocan `StoryViewerScreen.tsx` y `i18n/locales/*/feed.json` (en el mismo bloque `storyViewer`); y `fix/store-blockers` y `fix/native-wallets` tocan `app.config.ts` (zonas distintas). Fusiona una, rebasa la otra y resuelve.
3. **Aplicar la 250** (stories reportables) **solo después de la 248**, con su `250_check.sql`. Hasta entonces el botón de reportar una story fallará en producción con `invalid_content_type`; no publiques el build 11 sin aplicarla.
4. **Crear la cuenta del revisor** y la cuenta Stripe Connect de prueba; ejecutar `supabase/scripts/demo_venue_seed.sql` sustituyendo los dos marcadores (`docs/app-review/RUNBOOK-revisor.md`). Probar con esa cuenta en un iPhone y un Android.
5. **Apple Pay y Google Pay**: seguir `docs/app-review/wallets-nativos.md` (Merchant ID, certificado en Stripe en prueba y en live, acceso a producción de Google Pay).
6. **Build 11**: incluye el texto de ubicación, el privacy manifest y Google Pay. Cambia el fingerprint (iOS y Android): no es OTA.
7. **Pegar en las consolas**: tabla de privacidad (Apple), Data safety (Google), notas del revisor, ficha y cuestionarios de edad. Rellena correo y contraseña de la revisora.
8. Decidir las **preguntas abiertas** de `docs/design/liquid-glass.md` (§7 paso 0).
9. Si quieres, aplicar la 249 (índices): es opcional.

## Matices y riesgos

- **No ejecuté la app.** Las rutas de interfaz de las notas del revisor (por ejemplo "+ → Games", la pestaña Cercanos, "Usuarios bloqueados") salen del código; `RUNBOOK-revisor.md` §B lista lo que hay que comprobar en un dispositivo. El mazo de Match del local de demo puede salir vacío si exige fotos aprobadas (el seed no las crea).
- **Presencia "falsa" de 14 días** para la revisora y las 4 personas ficticias en el local de demo: es necesaria (el dueño entra al chat sin GPS pero eso no le da presencia, y los regalos, Match y Verdad o Reto la exigen) y está explicada en el seed. Renuévala re-ejecutando el seed.
- **Stripe y Apple Pay**: Stripe dice que Apple Pay no se puede probar con tarjetas de prueba en la Wallet; el revisor de Apple pagará con la 4242 tecleada. Está en las notas.
- **i18n y accesibilidad ya estaban muy cuidadas**: la parte 3 encontró pocos problemas reales (11 imágenes sin descripción, 16 textos de estado con colores que no llegaban a AA en modo claro). Los escáneres nuevos tienen límites declarados (heurísticos): no ven texto sobre fotos o vidrio, ni colores elegidos en tiempo de ejecución. Lo dudoso que dejé sin tocar: los colores `palette.gold`/`palette.brand` de las insignias de rol de `MessageBubble.tsx` (estilos estáticos sobre la burbuja del tema) y unos 180 cruces texto×superficie por archivo que son casi todos falsos positivos (se listan con `crossPairs()` de `contrast-main-screens.mjs`).
- **Apple 3.1.5**: no la cito en las notas (en las guías actuales es otra regla); uso 3.1.1 y 3.1.3(e), leídas esta semana.
- **Fingerprint**: Google Pay cambia el hash de Android y también el de iOS (la configuración del plugin entra en la huella de Expo). Medido con `npx fingerprint fingerprint:generate` (ver `wallets-nativos.md`).
- **Liquid Glass**: añadir `expo-glass-effect` también cambiaría el fingerprint; y si EAS compila con Xcode 26 sin `UIDesignRequiresCompatibility`, los componentes del sistema ya pueden verse con vidrio en iOS 26: míralo en un iPhone con iOS 26.

## Al terminar

`loadtest/local-up.sh --down` ejecutado.
