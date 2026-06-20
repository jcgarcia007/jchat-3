/**
 * JChat 3.0 — dynamic Expo config (Stage 4).
 * Extends app.json and:
 *  - injects the Google Maps API key from env (GOOGLE_MAPS_KEY) — never
 *    hardcoded (Rule 2);
 *  - wires the Firebase config files (FCM/APNs push via expo-notifications):
 *    Android → google-services.json, iOS → GoogleService-Info.plist;
 *  - adds expo-location, react-native-maps, and expo-notifications plugins.
 */

import appJson from './app.json';

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY ?? '';

// EAS file secrets expose a path env var at build time; fall back to the local
// file for dev. Upload via: eas secret:create --type file --name GOOGLE_SERVICES_JSON ...
const ANDROID_GOOGLE_SERVICES = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
const IOS_GOOGLE_SERVICES = process.env.GOOGLE_SERVICE_INFO_PLIST ?? './GoogleService-Info.plist';

const base = appJson.expo;

export default {
  ...base,
  ios: {
    ...base.ios,
    // react-native-maps (Google provider) reads this native key.
    config: { googleMapsApiKey: GOOGLE_MAPS_KEY },
    // Firebase (APNs push) — local file in dev, EAS file secret in CI.
    googleServicesFile: IOS_GOOGLE_SERVICES,
  },
  android: {
    ...base.android,
    config: { googleMaps: { apiKey: GOOGLE_MAPS_KEY } },
    // Firebase Cloud Messaging — local file in dev, EAS file secret in CI.
    googleServicesFile: ANDROID_GOOGLE_SERVICES,
  },
  plugins: [
    ...base.plugins,
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'JChat uses your location for venue geofencing and the live map.',
        locationWhenInUsePermission:
          'JChat uses your location to show nearby venues on the map.',
      },
    ],
    'react-native-maps',
    // Push notifications (FCM/APNs). Add an icon/color/sounds here later if needed.
    'expo-notifications',
  ],
  extra: {
    ...(base as { extra?: Record<string, unknown> }).extra,
    eas: {
      projectId: '6fd667cf-ddde-4236-83be-71b2477eaa0f',
    },
  },
};
