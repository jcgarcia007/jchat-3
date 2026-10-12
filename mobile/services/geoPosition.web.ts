/**
 * JChat 3.0 — foreground location (web): navigator.geolocation.
 *
 * Why not expo-location on web: its permission check THROWS when navigator.permissions.query is missing
 * (older Safari) and its request does an extra position read; the geofence gate needs a fresh, high-accuracy
 * reading (enableHighAccuracy, 15 s, maximumAge 0) and a read-only check that never prompts.
 *   hasForegroundPermission     — navigator.permissions.query({ name: 'geolocation' }) when it exists; if not,
 *                                 false, so the FIRST reading always happens from a user gesture (Enter button).
 *                                 BUT the automatic geofence heartbeat (every 5 min and on returning to the tab) only
 *                                 READS the permission, and the query is unreliable after a successful reading:
 *                                 it is missing in older Safari and answers 'prompt' when the person allowed the
 *                                 site "only this time". Trusting it alone would make the heartbeat see "no
 *                                 permission" and take the person out of a venue they are inside. So a successful
 *                                 reading on THIS page is remembered in memory (module variable, never storage:
 *                                 a reload, a new tab or a new visit starts clean and asks again from a gesture).
 *                                 granted → true; denied → false (and the memory is cleared); otherwise → true
 *                                 only if a reading already succeeded on this page.
 *   requestForegroundPermission — browsers have no separate prompt: the first read asks. Denied → false; a
 *                                 timeout / unavailable position still means "permitted" (the gate then reports
 *                                 that it could not read the position).
 *   getCurrentPosition          — `mocked` is always false (the browser does not expose it). A successful read
 *                                 sets the in-memory mark; a PERMISSION_DENIED error clears it, so the gate shows
 *                                 permission_denied.
 */

import type { Coords } from './geofence';

const OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 };

/** A reading succeeded on this page (memory only). See the header for why the permission query is not enough. */
let readingSucceeded = false;

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
  const state = await queryPermission();
  if (state === 'granted') return true;
  if (state === 'denied') {
    readingSucceeded = false;
    return false;
  }
  // 'prompt' (e.g. "only this time") or no Permissions API (older Safari): trust a reading made on this page.
  return readingSucceeded;
}

export async function requestForegroundPermission(): Promise<boolean> {
  const state = await queryPermission();
  if (state === 'granted') return true;
  if (state === 'denied') return false;
  if (typeof navigator === 'undefined' || !navigator.geolocation) return false;
  return new Promise<boolean>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => {
        readingSucceeded = true;
        resolve(true);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) readingSucceeded = false;
        resolve(error.code !== error.PERMISSION_DENIED);
      },
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
      (position) => {
        readingSucceeded = true;
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude, mocked: false });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) readingSucceeded = false;
        reject(new Error(error.message || 'position_error'));
      },
      OPTIONS,
    );
  });
}
