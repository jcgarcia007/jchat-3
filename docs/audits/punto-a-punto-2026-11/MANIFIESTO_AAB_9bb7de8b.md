# Manifiesto del AAB de build 15 en Android: `9bb7de8b` (versionCode 14)

Fuente: `base/manifest/AndroidManifest.xml` del AAB de EAS `9bb7de8b-4481-4a93-8d1c-cc2ff0950822` (commit `a78ab589`, runtime `947e79e2…`), convertido con `aapt2 convert` y leído con `aapt2 dump badging` y `aapt2 dump xmltree` (build-tools 36.1.0). Se descargó solo el AAB; la clave de Google Maps del manifiesto no se copia aquí. Comparado con `MANIFIESTO_AAB_ad07d0dc.md` (build 13, versionCode 13) y con `docs/app-review/google-data-safety.md`.

## Datos generales
- package `com.otunitylabs.jchat`, versionName 1.0.0, **versionCode 14**, **minSdk 26, targetSdk 36, compileSdk 36**.
- Aplicación: `allowBackup=false`, `extractNativeLibs=false`, `enableOnBackInvokedCallback=false` (igual que el build 13). `uses-feature`: solo `glEsVersion 0x00020000` (obligatorio).
- Servicio en primer plano de ubicación (`expo.modules.location.services.LocationTaskService`, `foregroundServiceType=location`) y `SystemForegroundService` de WorkManager. Sigue declarado `FOREGROUND_SERVICE` pero no `FOREGROUND_SERVICE_LOCATION` (igual que en el build 13; latente, ver el AAB anterior).

## Permisos: 33 en el build 15 frente a 42 en el build 13
| Permiso | Build 13 (`ad07d0dc`) | Build 15 (`9bb7de8b`) |
|---|---|---|
| `BLUETOOTH` | sí | **no** |
| `BLUETOOTH_ADMIN` | sí | **no** |
| `BLUETOOTH_CONNECT` | sí | **no** |
| `BLUETOOTH_SCAN` | sí | **no** |
| `NFC` | sí | **no** |
| `READ_PHONE_STATE` | sí | **no** |
| `HIDE_OVERLAY_WINDOWS` | sí | **no** |
| `ACCESS_WIFI_STATE` | sí | **no** |
| `CHANGE_NETWORK_STATE` | sí | **no** |
| `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` | sí | sí |
| `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` | sí | sí |
| `INTERNET`, `ACCESS_NETWORK_STATE` | sí | sí |
| `USE_BIOMETRIC`, `USE_FINGERPRINT` | sí | sí |
| `VIBRATE`, `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED` | sí | sí |
| `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE` | sí | sí |
| `com.google.android.c2dm.permission.RECEIVE` | sí | sí |
| `…DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | sí | sí |
| `com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE` | sí | sí |
| 16 permisos de insignias de lanzadores (Samsung, HTC, Sony, Huawei, Oppo, Anddoes, Majeur, everything.me) y `READ_APP_BADGE` | sí | sí |

Los 9 permisos que se pedían quitar desaparecieron (42 − 9 = 33). Los 24 restantes son los mismos del build 13.
No declarados (bien): `ACCESS_BACKGROUND_LOCATION`, `READ/WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_*`, `AD_ID`, `READ/WRITE_CALENDAR`, `SYSTEM_ALERT_WINDOW`.

## Servicios (13) y `queries`
- Servicios: `MetadataHolderService` (CameraX), `MultiInstanceInvalidationService` (Room), `SystemAlarmService`, `SystemJobService`, `SystemForegroundService` (WorkManager), `TransportBackendDiscovery`, `JobInfoSchedulerService` (datatransport), `ModuleDependencies` (play-services), `ComponentDiscoveryService` y `FirebaseMessagingService` (Firebase), `MlKitComponentDiscoveryService`, `LocationTaskService` (expo-location), `ExpoFirebaseMessagingService`. **Ya no están `TtpService` ni `SimulatedTtpService` (Tap to Pay).**
- Receptores (12): WorkManager, ProfileInstaller, Firebase InstanceId, datatransport, `NotificationsService`. Proveedores (11): androidx.startup, CropFileProvider, Firebase, ML Kit, WebView, Stripe file provider, expo (clipboard, filesystem, image picker) y Sentry (`SentryInitProvider`, `SentryPerformanceProvider`).
- Actividades: `MainActivity`, recortador, escáner de códigos de ML Kit y las de Stripe PaymentSheet / 3DS / Financial Connections / Link / Google Pay del SDK de pago (`@stripe/stripe-react-native`, que sigue: es el pago de cliente).
- `queries` (14 elementos): `VIEW` https y http, `org.chromium.intent.action.PAY`, `IS_READY_TO_PAY`, `UPDATE_PAYMENT_DETAILS`, `OPEN_DOCUMENT_TREE`, `VIEW` content, `IMAGE_CAPTURE`, `ACTION_VIDEO_CAPTURE`, `CustomTabsService` (+ paquete `com.android.chrome`), `androidx.camera.extensions.action.VENDOR_ACTION`, `GET_CONTENT */*` y el paquete `com.google.android.apps.maps`. **Ya no están los paquetes `com.stripe.reader`, `com.stripe.reader.verifone`, `com.stripe.updater` ni `com.priv.stripe.updater.verifone`.**

## Frente a `google-data-safety.md`
La línea 71 del documento dice que el AAB del build 15 «ya no declara `BLUETOOTH*`, `NFC`, `READ_PHONE_STATE`, `HIDE_OVERLAY_WINDOWS`, `ACCESS_WIFI_STATE` ni `CHANGE_NETWORK_STATE`»: **coincide con lo medido** en el AAB. La afirmación del documento sobre `READ_CALENDAR`/`WRITE_CALENDAR` y `AD_ID` también coincide (no están). Sin diferencias.

## Permisos que siguen y la v1 podría no usar
Ninguno nuevo respecto al build 13. Queda lo que ya se anotó: `FOREGROUND_SERVICE` sin `FOREGROUND_SERVICE_LOCATION` (servicio latente) y los 17 permisos de insignias de lanzadores que arrastra `expo-notifications`; ninguno se pide en pantalla. No hay hallazgo nuevo del manifiesto.
