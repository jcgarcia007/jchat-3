/**
 * JChat 3.0 — foreground location (iOS / Android): expo-location. The web build resolves geoPosition.web.ts
 * (navigator.geolocation). services/geofence.ts re-exports these three, so callers keep importing from there.
 */

import * as Location from 'expo-location';

import type { Coords } from './geofence';

/**
 * Request foreground ("when-in-use") location permission.
 * Returns true when permission was granted, false otherwise.
 */
export async function requestForegroundPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === Location.PermissionStatus.GRANTED;
}

/**
 * Read-only check: is foreground location permission already granted?
 * Never shows a permission prompt (use it where asking is not allowed).
 */
export async function hasForegroundPermission(): Promise<boolean> {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status === Location.PermissionStatus.GRANTED;
}

/**
 * One-shot: fetch the device's current position.
 *
 * Requires foreground permission to already be granted.
 * Throws if location services are unavailable or permission is denied.
 */
export async function getCurrentPosition(): Promise<Coords> {
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    mocked: location.mocked,
    accuracy: location.coords.accuracy ?? null,
  };
}
