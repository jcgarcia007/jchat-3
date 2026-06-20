/**
 * JChat 3.0 — dynamic Expo config (Stage 4).
 * Extends app.json and injects the Google Maps API key from the environment
 * (GOOGLE_MAPS_KEY) so it is NEVER hardcoded in the repo (Rule 2). Also adds
 * the expo-location plugin with permission strings + react-native-maps.
 */

import appJson from './app.json';

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY ?? '';

const base = appJson.expo;

export default {
  ...base,
  ios: {
    ...base.ios,
    // react-native-maps (Google provider) reads this native key.
    config: { googleMapsApiKey: GOOGLE_MAPS_KEY },
  },
  android: {
    ...base.android,
    config: { googleMaps: { apiKey: GOOGLE_MAPS_KEY } },
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
  ],
};
