/**
 * JChat 3.0 — silent exit verification (pure: no React, no I/O, runs in Node tests).
 *
 * Product rule: a person is never taken out of a venue because of ONE reading, and locking the phone does not
 * take them out either. Every automatic check adds a reading to a short buffer; only when the latest readings
 * agree — three good ones in a row, all clearly outside, spread over at least three minutes — is the exit
 * confirmed. Anything else is 'uncertain' and nothing visible happens.
 *
 * The server's check_geofence_and_join_room REVOKES the presence when it receives a coordinate outside the radius,
 * so the callers (useGeofenceGate, VenueSessionContext) use classifyReading() to send a reading to the server only
 * when it is a good one and not an unconfirmed "outside".
 */

export interface ExitReading {
  lat: number;
  lng: number;
  /** Horizontal accuracy in metres as reported by the OS (null / undefined when unknown). */
  accuracy: number | null | undefined;
  /** Epoch ms of the reading. */
  timestamp: number;
}

export interface VenueCenter {
  lat: number;
  lng: number;
}

export type ExitVerdict = 'inside' | 'outside_confirmed' | 'uncertain';

/** How one reading relates to the venue. 'buffer' = outside the radius but within the extra margin. */
export type ReadingClass = 'invalid' | 'inside' | 'buffer' | 'outside';

/**
 * Readings less accurate than this are never used to END a session (not counted towards an exit). Asymmetric rule:
 * to EXIT the accuracy must be ≤ 50 m; to RENEW the presence an INSIDE reading with accuracy up to
 * RENEW_MAX_ACCURACY_M is enough (a worse fix that still falls inside the radius is good evidence the person is there).
 */
export const MAX_ACCURACY_M = 50;
/** A reading INSIDE the radius with accuracy up to this renews the presence (is sent to the server). */
export const RENEW_MAX_ACCURACY_M = 100;
/** A reading counts as clearly outside only beyond radius + this margin. */
export const OUTSIDE_MARGIN_M = 30;
/** Consecutive good outside readings needed to confirm an exit. */
export const CONFIRM_READINGS = 3;
/** The first and the last of those readings must be at least this far apart in time. */
export const CONFIRM_SPAN_MS = 3 * 60 * 1000;
/** Readings older than this are dropped from the buffer, and at most this many are kept. */
export const BUFFER_MAX_AGE_MS = 30 * 60 * 1000;
export const BUFFER_MAX_LENGTH = 20;

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in metres (the same atan2 form the server uses, R = 6 371 000 m). */
export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** A reading is usable when it is finite and its accuracy is known and at most MAX_ACCURACY_M. */
export function isValidReading(reading: ExitReading): boolean {
  return (
    Number.isFinite(reading.lat) &&
    Number.isFinite(reading.lng) &&
    typeof reading.accuracy === 'number' &&
    Number.isFinite(reading.accuracy) &&
    reading.accuracy <= MAX_ACCURACY_M
  );
}

/**
 * inside  : distance <= radius (the server's own rule)
 * buffer  : radius < distance <= radius + 30 (neither inside nor clearly outside)
 * outside : distance > radius + 30
 * invalid : bad accuracy / not finite
 */
export function classifyReading(reading: ExitReading, center: VenueCenter, radiusM: number): ReadingClass {
  if (!isValidReading(reading)) return 'invalid';
  const distance = distanceMeters(reading.lat, reading.lng, center.lat, center.lng);
  if (distance <= radiusM) return 'inside';
  if (distance <= radiusM + OUTSIDE_MARGIN_M) return 'buffer';
  return 'outside';
}

/**
 * True when the reading can RENEW the presence: finite, accuracy known and at most RENEW_MAX_ACCURACY_M, and the
 * point inside the radius. (The accuracy that can END a session is the stricter MAX_ACCURACY_M.)
 */
export function isRenewableReading(reading: ExitReading, center: VenueCenter, radiusM: number): boolean {
  if (!Number.isFinite(reading.lat) || !Number.isFinite(reading.lng)) return false;
  if (typeof reading.accuracy !== 'number' || !Number.isFinite(reading.accuracy) || reading.accuracy > RENEW_MAX_ACCURACY_M) return false;
  return distanceMeters(reading.lat, reading.lng, center.lat, center.lng) <= radiusM;
}

/**
 * What the automatic check does with one reading (the asymmetric rule):
 *  - 'renew'  : inside the radius with accuracy ≤ 100 m → sent to the server (renews the presence);
 *  - 'track'  : accuracy ≤ 50 m, outside the radius → kept in the buffer (may count towards an exit), NEVER sent
 *               unless the exit is confirmed;
 *  - 'ignore' : everything else (accuracy unknown or > 100 m; outside the radius with accuracy 50–100 m): not
 *               counted, not sent.
 */
export type SilentAction = 'renew' | 'track' | 'ignore';

export function silentAction(reading: ExitReading, center: VenueCenter, radiusM: number): SilentAction {
  if (isRenewableReading(reading, center, radiusM)) return 'renew';
  return isValidReading(reading) ? 'track' : 'ignore';
}

/**
 * Looks at the readings that matter, in time order — accuracy ≤ 50 m, or inside the radius with accuracy ≤ 100 m:
 *  - none → 'uncertain'; the latest one inside the radius → 'inside';
 *  - otherwise the trailing run of clearly-outside readings (accuracy ≤ 50 m; a reading inside the radius, or in the
 *    margin, ends it) must have at least CONFIRM_READINGS readings spanning at least CONFIRM_SPAN_MS →
 *    'outside_confirmed';
 *  - anything else → 'uncertain'.
 * Readings that do not matter (accuracy > 100 m, or outside with accuracy 50–100 m) are skipped: they neither
 * count nor break a run.
 */
export function evaluateExit(readings: readonly ExitReading[], center: VenueCenter, radiusM: number): ExitVerdict {
  const relevant = readings
    .filter((r) => isValidReading(r) || isRenewableReading(r, center, radiusM))
    .sort((a, b) => a.timestamp - b.timestamp);
  if (relevant.length === 0) return 'uncertain';

  const latest = relevant[relevant.length - 1];
  if (isRenewableReading(latest, center, radiusM)) return 'inside';

  let start = relevant.length;
  while (
    start > 0 &&
    !isRenewableReading(relevant[start - 1], center, radiusM) &&
    classifyReading(relevant[start - 1], center, radiusM) === 'outside'
  ) {
    start -= 1;
  }
  const run = relevant.slice(start);
  if (run.length >= CONFIRM_READINGS && run[run.length - 1].timestamp - run[0].timestamp >= CONFIRM_SPAN_MS) {
    return 'outside_confirmed';
  }
  return 'uncertain';
}

/** Appends a reading and drops the old ones: newest `BUFFER_MAX_LENGTH`, none older than `BUFFER_MAX_AGE_MS`. */
export function pushReading(buffer: readonly ExitReading[], reading: ExitReading): ExitReading[] {
  return [...buffer, reading]
    .filter((r) => reading.timestamp - r.timestamp <= BUFFER_MAX_AGE_MS)
    .slice(-BUFFER_MAX_LENGTH);
}
