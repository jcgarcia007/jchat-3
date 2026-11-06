# Fase C — build nativo para tiendas (rama `fix/c-native-build`)

Estado: preparada, **sin build**. Juan lanza `eas build`. Nada de lo de aquí funciona por OTA.

## Qué cambia en el binario
| Paso | Hallazgo | Cambio |
|---|---|---|
| C1 | B10-1 | `expo-audio` con `enableBackgroundPlayback: false`: desaparecen `UIBackgroundModes: audio`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` y `AudioControlsService`. Queda `bluetooth-central` (Stripe Terminal), una vez |
| C2 | B10-2 | `NSBluetoothPeripheralUsageDescription` fuera. El plugin de Terminal lo escribe SIEMPRE (con texto por defecto) aunque se omita la opción, así que hay un plugin propio (`withoutBluetoothPeripheral`) registrado ANTES del de Terminal (Expo ejecuta primero el mod del último plugin) |
| C2 | B10-3 | Face ID: "…desbloquear la app y confirmar pagos." Red local: "…lectores de tarjetas con WiFi y a impresoras de red del local." (es y en, en `app.config.ts` y `assets/locales`) |
| C2 | C-12 | `android.allowBackup: false`. `USE_FINGERPRINT` y `MODIFY_AUDIO_SETTINGS` **se quedan** (ver abajo) |
| C3 | B7-2 | Plugin `withAndroidFontScaleConfigChanges`: `fontScale|density` en `configChanges` de MainActivity. `ChatInput` lee la escala con `useWindowDimensions().fontScale` (antes `PixelRatio.getFontScale()` en cada render) |
| C4 | B10-4 | `PosNavigator` carga con `import()` (helper `navigation/lazyScreen.tsx`, compartido con web): el SDK beta de Terminal solo se evalúa al entrar al Modo Trabajo |
| C5 | — | `eas.json` production iOS: imagen `macos-tahoe-26.5-xcode-26.6` |

### Permisos que NO se quitan (y por qué)
- `USE_FINGERPRINT`: `expo-local-authentication` usa `androidx.biometric` 1.2.0-alpha04; en Android 8.0/8.1 (minSdk 26) biometric cae a `FingerprintManager`, que exige este permiso. Es un permiso normal (no peligroso, sin declaración en Play).
- `MODIFY_AUDIO_SETTINGS`: la app llama `setAudioModeAsync` (`VoiceBubble`, `VoiceRecorderBar`); `expo-audio` ejecuta siempre `audioManager.mode = MODE_NORMAL` + `setSpeakerphoneOn(true)`, que necesitan este permiso. Normal, sin declaración.
Si se prefieren fuera igualmente: `blockedPermissions` en `app.config.ts`; el riesgo es voz por el altavoz/auricular en algunos móviles.

## Cómo se verifica
`node scripts/introspect-clean.mjs` (solo lectura, no hace prebuild): copia lo mínimo a un directorio temporal sin `ios/` ni `android/` (son un prebuild viejo e ignorado por git que `expo config --type introspect` mezclaría) y ejecuta la introspección. `scripts/native-build.test.mjs` comprueba sobre esa salida: modos de fondo, claves `NS*`, textos es/en, `allowBackup`, permisos y la imagen de EAS. El `AndroidManifest` final (`configChanges`, servicios) NO sale de la introspección: se comprueba en el AAB.

## Prueba manual (B7-2): cambiar el tamaño de letra con la app abierta (build 12, Android)
1. Entra a un local con @test y abre el chat (dock visible).
2. Sin cerrar la app, ve a Ajustes de Android → Pantalla → Tamaño de fuente y ponlo al máximo; vuelve a JChat.
3. Esperado: sigue en el chat de Bar XZX, el dock está, **la letra de la app es la nueva** (mensajes, cabecera, campo) y el campo de mensaje conserva su altura útil. La actividad no se recreó (no se ve el splash).
4. Repite bajando a la letra normal. Hazlo también con "Tamaño de pantalla" (density).
Si el texto no se actualiza hasta tocar algo: es el caso de que RN no re-mide `Text` en caliente; repórtalo (P2) — habría que forzar un re-render en `App.tsx` con `useWindowDimensions().fontScale`.

## Runtimes (fingerprint)
| | build 11 (instalado) | build 12 (esta rama) |
|---|---|---|
| iOS | `3760a588d7f43619b331660b4527b716db128d5a` | `04e88e9740e9a5811cc2e003033e99c0bdf0a25a` |
| Android | `1237ce003f532b7083ac3b41a60c2d0cc4dabf35` | `6b8d88666a255a5cec8cfbbeb2e686fe0e7ea4a0` |
`scripts/preflight-eas.mjs` ya conoce los dos (`RUNTIMES`); `ACTIVE_RUNTIME` sigue en `build11` — **activar tras el build 12** cambiando a `build12`. Con `--ota` falla si el runtime cambió.
