# Apple Pay y Google Pay en la app nativa — pasos manuales

Fuentes: documentación de Stripe leída el 2026-10-29 — `docs.stripe.com/apple-pay` (React Native) y `docs.stripe.com/google-pay` (React Native). Lo que hace el código está en la rama `fix/native-wallets`.

## Qué cambia en el código

- `mobile/app.config.ts`: el plugin de `@stripe/stripe-react-native` pasa a `enableGooglePay: true` (antes `false`). El plugin añade a `AndroidManifest.xml` el meta-data `com.google.android.gms.wallet.api.enabled = true` que pide la documentación de Stripe.
- `mobile/services/stripe.ts`: `googlePay.testEnv` ahora es `isStripeTestKey(clave publicable)` (true con `pk_test_…`), no `__DEV__`. Con `__DEV__`, un build de tienda conectado al modo test de Stripe habría usado el entorno **de producción** de Google Pay y fallaría.
- Apple Pay ya estaba bien: el plugin recibe `merchantIdentifier: 'merchant.com.otunitylabs.jchat'` y escribe en los entitlements `com.apple.developer.in-app-payments = [ese Merchant ID]` (lo comprueba `mobile/scripts/native-wallets.test.mjs` contra el plugin instalado). Los pedidos **y los regalos** pasan por la misma hoja de pago (`presentSheetForParams` → `initPaymentSheet` con `applePay` y `googlePay`); el regalo entra por `holdGiftPayment`.

## Pasos que haces tú

### Apple Pay (iPhone)

1. **Merchant ID en Apple Developer** (Certificates, Identifiers & Profiles → Identifiers → "+" → Merchant IDs): `merchant.com.otunitylabs.jchat`. Stripe recomienda el formato `merchant.com.<nombre-de-la-app>`. Si ya existe, no lo repitas.
2. **Capability en el App ID.** El App ID `com.otunitylabs.jchat` debe tener **Apple Pay Payment Processing** activada con ese Merchant ID (Identifiers → tu App ID → Capabilities). EAS regenera el perfil de aprovisionamiento al construir.
3. **Certificado de procesamiento de pagos en Stripe.** En el Dashboard de Stripe abre [Settings → iOS certificates](https://dashboard.stripe.com/settings/ios_certificates) → **Add new application** y sigue la guía: descarga el **CSR de Stripe**, súbelo a Apple (Merchant ID → Apple Pay Payment Processing Certificate → Create), descarga el `.cer` y súbelo a Stripe.
   - **Un CSR sirve para un solo certificado.** Si cambias de Merchant ID necesitas otro CSR.
   - El CSR **debe venir de Stripe**; no uses uno generado por ti (Stripe lo advierte en su sección de problemas).
   - Hazlo **en el "JChat sandbox" (modo de prueba) y otra vez en live**: el Dashboard de cada entorno guarda sus certificados.
4. **Probar en el iPhone.** Según Stripe: para probar Apple Pay hay que usar una **tarjeta real** en la Wallet con las **claves de prueba** de Stripe; Stripe lo detecta y devuelve un token de prueba sin cobrar la tarjeta. **No se pueden guardar en la Wallet las tarjetas de prueba de Stripe (4242…) ni las de sandbox de Apple.** Por eso el revisor de Apple, que no usará tu tarjeta, debe pagar con la 4242 tecleada en la hoja de pago (opción "Tarjeta"), no con Apple Pay.
5. **Expo Go no sirve**: Apple Pay y Google Pay solo funcionan en el build nativo.

### Google Pay (Android)

1. Para **probar** en `testEnv: true` (claves `pk_test_`) no hay que registrar nada: Google ofrece su [suite de tarjetas de prueba](https://developers.google.com/pay/api/android/guides/resources/test-card-suite) y Stripe acepta sus tarjetas de prueba. **Hay que probar en un Android físico**, con una cuenta de Google con una tarjeta real guardada, en un país donde Google Pay exista (Stripe lo dice así: no vale emulador).
2. **Para producción (claves `pk_live_`)** Stripe indica seguir las instrucciones de Google para **solicitar acceso a producción** en la consola de Google Pay & Wallet: tipo de integración **Gateway** y capturas de pantalla de la app. Hasta que Google lo apruebe, `testEnv: false` no funcionará. Tras la aprobación, prueba en un build firmado de release, con claves live y, si quieres, un PaymentIntent `capture_method=manual` para no capturar el cobro.
3. Al integrarlo aceptas los términos de servicio de Google Pay.
4. Para Google Play: Google Pay aquí solo cobra **bienes físicos** (comida y bebida del local), que es lo que permite Stripe fuera del sistema de facturación de Google Play; ver `notas-revisor-google.md`.

## Fingerprint de EAS (build 11)

Calculado con `npx fingerprint fingerprint:generate --platform <p>` (solo lee el proyecto; no construye nada), en `main` y en `fix/native-wallets`:

| Plataforma | main | fix/native-wallets |
|---|---|---|
| Android | `030e0e7c293eb31437c7429c1eb8e6b3032fc111` | `37e20a9c2fdb3acba6f41f47ae42083551ea5819` |
| iOS | `ccd1fd0c8326da6b6903e68e41237cff50fa117b` | `efe1443b6c45b28fd8877201d90c914919a752f9` |

**Cambian los dos.** En Android es lo esperado: el flag añade un meta-data al manifiesto (código nativo). En iOS el binario no cambia, pero `app.config.ts` entra en el hash de la configuración de Expo y la opción del plugin cambió, así que la huella cambia igual. Consecuencia: este cambio **no puede ir por OTA**; entra en el **build 11** (que ya cambiará por el texto de ubicación y el privacy manifest de `fix/store-blockers`).

## Lista de comprobación rápida

- [ ] Merchant ID creado y con la capability en el App ID.
- [ ] Certificado de Stripe subido en modo prueba (y luego en live).
- [ ] Android físico probado con tarjeta real y claves de prueba.
- [ ] Acceso a producción de Google Pay solicitado (capturas de la app) antes de usar claves live.
