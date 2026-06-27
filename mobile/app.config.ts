/**
 * JChat 3.0 — Expo config (single source of truth; app.json removed).
 *  - Maps: native platform provider (Apple Maps on iOS, native Android).
 *    No Google Maps API key required on mobile.
 *  - Firebase config files (FCM/APNs) resolved from EAS file secrets with a
 *    local fallback for dev: Android → google-services.json, iOS → plist.
 *  - Plugins: Stripe, web-browser, datetimepicker, location, notifications.
 */

import type { ExpoConfig } from 'expo/config';

// EAS file secrets expose a path env var at build time; fall back to the local
// file for dev. Uploaded via: eas env:create --type file --name GOOGLE_SERVICES_JSON ...
const ANDROID_GOOGLE_SERVICES = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
const IOS_GOOGLE_SERVICES = process.env.GOOGLE_SERVICE_INFO_PLIST ?? './GoogleService-Info.plist';

const config: ExpoConfig = {
  name: 'JChat',
  slug: 'jchat',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  web: {
    favicon: './assets/favicon.png',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.juangarciacruz.jchatapp',
    // Firebase (APNs push) — local file in dev, EAS file secret in CI.
    googleServicesFile: IOS_GOOGLE_SERVICES,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
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
    // Firebase Cloud Messaging — local file in dev, EAS file secret in CI.
    googleServicesFile: ANDROID_GOOGLE_SERVICES,
  },
  plugins: [
    [
      'expo-image-picker',
      {
        photosPermission: 'JChat needs access to your photos to share images in chat.',
        cameraPermission: 'JChat needs access to your camera to take photos in chat.',
      },
    ],
    [
      '@stripe/stripe-react-native',
      {
        merchantIdentifier: 'merchant.com.juangarciacruz.jchatapp',
        enableGooglePay: false,
      },
    ],
    'expo-web-browser',
    '@react-native-community/datetimepicker',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'JChat uses your location for venue geofencing and the live map.',
        locationWhenInUsePermission:
          'JChat uses your location to show nearby venues on the map.',
      },
    ],
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
  },
};

export default config;
