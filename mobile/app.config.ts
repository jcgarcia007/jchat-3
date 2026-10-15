/**
 * JChat 3.0 — Expo config (single source of truth; app.json removed).
 *  - Maps: react-native-maps on Android always uses Google Maps SDK regardless
 *    of the provider prop, so GOOGLE_MAPS_KEY must be injected into the manifest.
 *    iOS uses Apple Maps (no key needed).
 *  - Firebase config files (FCM/APNs) resolved from EAS file secrets with a
 *    local fallback for dev: Android → google-services.json, iOS → plist.
 *  - Plugins: Stripe, web-browser, datetimepicker, location, notifications.
 */

import type { ExpoConfig } from 'expo/config';

// EAS file secrets expose a path env var at build time; fall back to the local
// file for dev. Uploaded via: eas env:create --type file --name GOOGLE_SERVICES_JSON ...
const ANDROID_GOOGLE_SERVICES = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
const IOS_GOOGLE_SERVICES = process.env.GOOGLE_SERVICE_INFO_PLIST ?? './GoogleService-Info.plist';

// iOS permission texts (English default in Info.plist; the Spanish ones live in assets/locales/es.json and are written to
// InfoPlist.strings at prebuild). One string per key so two plugins can never disagree about it.
const LOCATION_WHEN_IN_USE = 'JChat uses your location to show nearby venues on the map and to connect to nearby card readers.';
const CAMERA = 'JChat uses the camera to take photos for chat, posts and your profile, and to scan inventory barcodes.';
const FACE_ID = 'JChat uses Face ID to unlock the app when you turn on biometric lock.';

const config: ExpoConfig = {
  name: 'JChat',
  slug: 'jchat',
  // Deep-link scheme — habilita jchat:// para el callback de OAuth (M1) y otros deep
  // links. Registra CFBundleURLTypes (iOS) + intent-filter (Android) en prebuild.
  scheme: 'jchat',
  version: '1.0.0',
  // OTA (M9): EAS Update. runtimeVersion 'fingerprint' → EAS calcula el runtime del
  // grafo nativo; un cambio en código nativo cambia el runtime y evita mandar un JS
  // bundle incompatible a binarios viejos. checkAutomatically ON_LOAD: busca update
  // al abrir; fallbackToCacheTimeout 0 → no bloquea el arranque esperando el update
  // (se aplica en el siguiente cold start).
  runtimeVersion: { policy: 'fingerprint' },
  updates: {
    url: 'https://u.expo.dev/6fd667cf-ddde-4236-83be-71b2477eaa0f',
    fallbackToCacheTimeout: 0,
    checkAutomatically: 'ON_LOAD',
  },
  // iOS permission texts per language (InfoPlist.strings): the photo-library message is shown in the phone's language.
  locales: {
    en: './assets/locales/en.json',
    es: './assets/locales/es.json',
  },
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  web: {
    // Client web (jchat.cloud / *.jchat.cloud): same React Native code via react-native-web.
    // 'single' = SPA with one index.html; the venue host is read from window.location.hostname.
    bundler: 'metro',
    output: 'single',
    favicon: './assets/favicon.png',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.juangarciacruz.jchatapp',
    // Universal Links: the AASA file is served from public/.well-known/ (added with the real IDs).
    associatedDomains: ['applinks:jchat.cloud', 'applinks:*.jchat.cloud'],
    // La app usa Sign in with Apple (OAuth de Supabase hoy, botón nativo después). Sin esta línea EAS intenta
    // desactivar la capability APPLE_ID_AUTH y Apple lo rechaza.
    usesAppleSignIn: true,
    // Firebase (APNs push) — local file in dev, EAS file secret in CI.
    googleServicesFile: IOS_GOOGLE_SERVICES,
    // Privacy manifest of the app itself (the SDKs ship their own). Tracking is off and no tracking domains. The
    // required-reason API categories are the usual ones of an Expo / React Native app. To be revalidated with the ITMS
    // warnings of the first TestFlight build: Apple lists any category or reason that is missing.
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['C617.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime', NSPrivacyAccessedAPITypeReasons: ['35F9.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace', NSPrivacyAccessedAPITypeReasons: ['E174.1'] },
      ],
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // Lets the per-language InfoPlist.strings (locales above) apply.
      CFBundleAllowMixedLocalizations: true,
      // react-native-bluetooth-classic force-unwraps this key in its iOS init
      // (RNBluetoothClassic.swift) → launch crash if absent. Empty = no MFi
      // accessory protocols (BT Classic printing is Android-only).
      UISupportedExternalAccessoryProtocols: [],
    },
  },
  android: {
    package: 'com.juangarciacruz.jchatapp',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // App Links: open *.jchat.cloud and jchat.cloud/c/* in the app (assetlinks.json goes in public/.well-known/).
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: '*.jchat.cloud' },
          { scheme: 'https', host: 'jchat.cloud', pathPrefix: '/c/' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    // Permissions the app does not use but that libraries add (removed from the final manifest with tools:node="remove"):
    //  - READ/WRITE_EXTERNAL_STORAGE: added by expo-file-system's plugin and expo-image-picker. With minSdk 26 the
    //    photo picker hands over content URIs and the app only reads/writes its own cache, so neither is needed.
    //  - READ_MEDIA_IMAGES / READ_MEDIA_VIDEO: the app picks photos through the system picker, never browses the media library.
    //  - ACCESS_BACKGROUND_LOCATION: location is foreground only (the expo-location plugin below adds nothing "Always").
    //  - SYSTEM_ALERT_WINDOW (draw over other apps): comes from the Expo prebuild template / React Native's debug
    //    manifest, only a debug tool; blocked in store builds (EAS profile `production`, which has no development client).
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      ...(process.env.EAS_BUILD_PROFILE === 'production' ? ['android.permission.SYSTEM_ALERT_WINDOW'] : []),
    ],
    // Firebase Cloud Messaging — local file in dev, EAS file secret in CI.
    googleServicesFile: ANDROID_GOOGLE_SERVICES,
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_KEY ?? '',
      },
    },
  },
  plugins: [
    // Writes android.minSdkVersion=26 to gradle.properties during expo prebuild.
    // Stripe Terminal requires API 26+; the RN default catalog value is 24.
    // This plugin runs first so all subsequent plugins see the correct SDK floor.
    './config-plugins/withAndroidMinSdkVersion',
    // Bluetooth Classic (SPP) permissions for Tab POS thermal printers (F7).
    // Adds BLUETOOTH_SCAN (neverForLocation) + BLUETOOTH_CONNECT for Android 12+
    // and legacy BLUETOOTH/BLUETOOTH_ADMIN (maxSdkVersion=30) for Android ≤ 11.
    // Does NOT add ACCESS_FINE_LOCATION — SPP printers do not derive location.
    './config-plugins/withBluetoothClassicPermissions',
    // iOS only: raises Pods targets below iOS 15.1 up to 15.1 in the Podfile's
    // post_install (Xcode 27 rejects deployment targets < 15.0). Pods already at
    // 15.1+ (e.g. 16.4) are untouched.
    './config-plugins/withMinPodsDeploymentTarget',
    [
      'react-native-maps',
      {
        androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_KEY ?? '',
      },
    ],
    'expo-image',
    [
      'expo-image-picker',
      {
        photosPermission: 'JChat uses your photos for your profile, posts, messages and Match.',
        cameraPermission: CAMERA,
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: CAMERA,
      },
    ],
    [
      '@stripe/stripe-react-native',
      {
        merchantIdentifier: 'merchant.com.juangarciacruz.jchatapp',
        enableGooglePay: false,
      },
    ],
    // Stripe Terminal: physical card reader support for the employee POS (C2a).
    // Adds iOS Info.plist keys and Android permissions via prebuild.
    //   iOS:     NSBluetoothAlwaysUsageDescription, NSBluetoothPeripheralUsageDescription,
    //            NSLocalNetworkUsagePermission, UIBackgroundModes: bluetooth-central
    //   Android: ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION, BLUETOOTH_CONNECT, BLUETOOTH_SCAN
    [
      '@stripe/stripe-terminal-react-native',
      {
        bluetoothBackgroundMode: true,
        locationWhenInUsePermission: LOCATION_WHEN_IN_USE,
        bluetoothAlwaysUsagePermission:
          'JChat uses Bluetooth to connect to Stripe Terminal card readers for in-person payments.',
        bluetoothPeripheralPermission:
          'JChat uses Bluetooth to communicate with card readers for in-person payments.',
        localNetworkUsagePermission:
          'JChat uses the local network to connect to WiFi-enabled card readers.',
      },
    ],
    'expo-web-browser',
    'expo-localization',
    '@react-native-community/datetimepicker',
    [
      'expo-location',
      {
        // "When in use" only (M8). Proximity/geofencing runs in the FOREGROUND — there is no real background
        // location yet. The plugin adds the "Always" keys and NSMotionUsageDescription with a generic text unless
        // told otherwise: `false` deletes the key (applyPermissions in @expo/config-plugins), so only
        // NSLocationWhenInUseUsageDescription remains. Restore locationAlways* + UIBackgroundModes when Stage 4 wires
        // real background geofencing (see services/geofence.ts TODO). Motion activity is not used.
        locationWhenInUsePermission: LOCATION_WHEN_IN_USE,
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        motionUsagePermission: false,
      },
    ],
    // Biometric lock (services/biometric.ts): its plugin runs by default with a generic Face ID text.
    ['expo-local-authentication', { faceIDPermission: FACE_ID }],
    // Sentry (docs/SENTRY_SETUP.md). The upload of source maps authenticates with SENTRY_AUTH_TOKEN (EAS secret, never here);
    // without it builds must run with SENTRY_DISABLE_AUTO_UPLOAD=true (set by default in eas.json).
    ['@sentry/react-native/expo', { organization: 'otunity-labs', project: 'jchat-mobile', url: 'https://sentry.io/' }],
    // Push notifications (FCM/APNs). Add an icon/color/sounds here later if needed.
    'expo-notifications',
    [
      'expo-audio',
      {
        microphonePermission: 'JChat needs access to your microphone to send voice messages.',
        enableBackgroundRecording: false,
      },
    ],
  ],
  extra: {
    eas: {
      projectId: '6fd667cf-ddde-4236-83be-71b2477eaa0f',
    },
    // hCaptcha sitekey (D-38) — pública, client-safe. La SECRET key va SÓLO en el
    // dashboard de Supabase, nunca aquí. Placeholder "PENDIENTE_SITEKEY" mientras
    // no esté la real → el kill-switch en services/captcha.tsx desactiva el reto.
    hcaptchaSiteKey: process.env.EXPO_PUBLIC_HCAPTCHA_SITEKEY,
  },
};

export default config;
