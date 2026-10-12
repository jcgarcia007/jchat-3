/**
 * JChat 3.0 — foreground location (web): navigator.geolocation.
 *
 * Why not expo-location on web: its permission check THROWS when navigator.permissions.query is missing
 * (older Safari) and its request does an extra position read; the geofence gate needs a fresh, high-accuracy
 * reading (enableHighAccuracy, 15 s, maximumAge 0) and a read-only check that never prompts.
 *   hasForegroundPermission     — navigator.permissions.query({ name: 'geolocation' }) when it exists; if not,
 *                                 false, so the first reading always happens from a user gesture (Enter button).
 *   requestForegroundPermission — browsers have no separate prompt: the first read asks. Denied → false; a
 *                                 timeout / unavailable position still means "permitted" (the gate then reports
 *                                 that it could not read the position).
 *   getCurrentPosition          — `mocked` is always false (the browser does not expose it).
 */

import type { Coords } from './geofence';

const OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 };

async function queryPermission(): Promise<PermissionState | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return null;
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return null;
  }
}

export async function hasForegroundPermission(): Promise<boolean> {
  return (await queryPermission()) === 'granted';
}

export async function requestForegroundPermission(): Promise<boolean> {
  const state = await queryPermission();
  if (state === 'granted') return true;
  if (state === 'denied') return false;
  if (typeof navigator === 'undefined' || !navigator.geolocation) return false;
  return new Promise<boolean>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve(true),
      (error) => resolve(error.code !== error.PERMISSION_DENIED),
      OPTIONS,
    );
  });
}

export async function getCurrentPosition(): Promise<Coords> {
  return new Promise<Coords>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('geolocation_unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude, mocked: false }),
      (error) => reject(new Error(error.message || 'position_error')),
      OPTIONS,
    );
  });
}
