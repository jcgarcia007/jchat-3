/**
 * JChat 3.0 — whether a map pin draws the venue logo (Android: no, the pin shows the venue's initials).
 *
 * A react-native-maps Marker is turned into a bitmap on Android. Its views and texts end up in that bitmap but its
 * images do not, with expo-image and with React Native's own Image alike (checked on a device: bare circles; with the
 * initials drawn underneath, only the initials showed). Until that is solved the Android pin uses the initials, which
 * are drawn reliably. The iOS / web version is pinLogoSupport.ts.
 */

export const PIN_SHOWS_LOGO = false;
