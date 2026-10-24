/**
 * JChat 3.0 — useGeofenceGate
 *
 * Client-side UX for the golden-rule geofence barrier (épica geocerca, Fase
 * 3.2). The real barrier is server-side (`check_geofence_and_join_room` +
 * `can_access_room`, Fase 3.1, supabase/migrations/112_geofence_barrier.sql)
 * — this hook is UX only: it asks for GPS once, gates entry for non-owners,
 * and re-checks every 5 min while the chat is open in the foreground so the
 * server's geo-presence (10 min TTL) stays fresh. If the client failed to
 * expel a user for any reason, the server-side TTL still cuts access.
 *
 * Silent exit verification: nobody is taken out of a venue because of one reading, and locking the phone does not
 * take them out. Every automatic check adds a reading to a buffer (utils/exitCheck.ts); only three good readings
 * in a row, all clearly outside, over at least three minutes, confirm an exit — then the session ends through
 * the same path as before (onExpelled / VenueSessionContext.endSession). Until then nothing is shown, and a
 * reading that is not a good one inside the radius is NEVER sent to the server, because the server revokes the
 * presence as soon as it receives a coordinate outside the radius.
 *
 * Owner bypass: `checkAndEnter` short-circuits to granted for the business
 * owner without touching permission/GPS/RPC — this is UX only, the server
 * independently grants the owner access regardless (can_access_room).
 *
 * No background tracking (by design, matches usePresenceChannels' "option a"
 * convention in this same folder): AppState changes to 'active' trigger an
 * immediate re-check; every check function guards on AppState.currentState
 * === 'active' so a stray timer fire while backgrounded is a safe no-op —
 * never a GPS read.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useWebResumeRecheck } from '../../hooks/useWebResumeRecheck';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import {
  requestForegroundPermission,
  hasForegroundPermission,
  getCurrentPosition,
  type Coords,
} from '../../services/geofence';
import {
  evaluateExit,
  outsideRunLength,
  pushReading,
  silentAction,
  type ExitReading,
  type ExitVerdict,
} from '../../utils/exitCheck';
import { SILENT_VERIFY_INTERVAL_MS, nextVerifyDelayMs } from '../../utils/exitSchedule';

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // renew geo-presence every 5 min while open+foreground
export { SILENT_VERIFY_INTERVAL_MS };
/** No GPS fix after this long → 'position_error' ("couldn't read your location · Retry") instead of an endless spinner. */
const POSITION_TIMEOUT_MS = 20 * 1000;
/** A resume from the background re-checks only if the last automatic check is at least this old. */
export const RESUME_RECHECK_MIN_GAP_MS = 60 * 1000;
/** How long the server keeps a geo-presence after its last renewal (check_geofence_and_join_room: 10 min). */
export const PRESENCE_TTL_MS = 10 * 60 * 1000;

/** Rounds to whole meters below 1000 m, otherwise one decimal of km. */
export function formatDistanceM(distanceM: number): string {
  if (distanceM >= 1000) return `${(distanceM / 1000).toFixed(1)} km`;
  return `${Math.round(distanceM)} m`;
}

export type GeoGateStatus =
  | 'idle'
  | 'checking'
  | 'permission_denied'
  | 'position_error'
  | 'outside_radius'
  | 'unavailable';

interface GeoRpcRow {
  access_granted: boolean;
  is_owner: boolean;
  distance_m: number | null;
  reason: string;
}

export interface GeoCheckResult {
  granted: boolean;
  reason: GeoGateStatus | 'granted';
  distanceM: number | null;
}

/** Centre and radius of the venue's geofence (businesses.lat / lng / geofence_radius_m, the server's own numbers). */
export interface VenueGeometry {
  lat: number;
  lng: number;
  radiusM: number;
}

// ── Shared state of the silent verification (module level: the chat's gate and the venue session share it) ──
const readingBuffers = new Map<string, ExitReading[]>();
const lastRenewedAt = new Map<string, number>();

/** Forgets the readings and the renewal time of a room (or of all of them): a session starts or ends. */
export function resetExitState(roomId?: string): void {
  if (roomId === undefined) {
    readingBuffers.clear();
    lastRenewedAt.clear();
    return;
  }
  readingBuffers.delete(roomId);
  lastRenewedAt.delete(roomId);
}

function recordReading(roomId: string, coords: Coords): ExitReading {
  const reading: ExitReading = { lat: coords.lat, lng: coords.lng, accuracy: coords.accuracy ?? null, timestamp: Date.now() };
  readingBuffers.set(roomId, pushReading(readingBuffers.get(roomId) ?? [], reading));
  return reading;
}

function markPresenceRenewed(roomId: string): void {
  lastRenewedAt.set(roomId, Date.now());
}

/** True when the server presence of this room has certainly lapsed (no renewal for more than its 10 min TTL). */
export function presenceLooksExpired(roomId: string, now: number = Date.now()): boolean {
  const renewed = lastRenewedAt.get(roomId);
  return renewed !== undefined && now - renewed > PRESENCE_TTL_MS;
}

/** One GPS fix, or a rejection after POSITION_TIMEOUT_MS. */
async function readPosition(): Promise<Coords> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('position timeout')), POSITION_TIMEOUT_MS);
  });
  try {
    return await Promise.race([getCurrentPosition(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The server call. Its answer to a coordinate OUTSIDE the radius also revokes the presence. */
async function callGeofenceRpc(roomId: string, coords: Coords): Promise<GeoCheckResult> {
  const { data, error } = await supabase.rpc('check_geofence_and_join_room', {
    _room_id: roomId,
    _lat: coords.lat,
    _lng: coords.lng,
  });

  if (error || !Array.isArray(data) || data.length === 0) {
    return { granted: false, reason: 'unavailable', distanceM: null };
  }

  const row = data[0] as GeoRpcRow;
  if (row.access_granted) {
    markPresenceRenewed(roomId);
    return { granted: true, reason: 'granted', distanceM: row.distance_m };
  }
  if (row.reason === 'outside_radius') {
    return { granted: false, reason: 'outside_radius', distanceM: row.distance_m };
  }
  // no_geofence / invalid_room / auth_required — degrade safely, generic message.
  return { granted: false, reason: 'unavailable', distanceM: null };
}

/**
 * Never rejects — every step (permission, GPS, RPC) is wrapped so a native or
 * network hiccup degrades to a result object instead of an unhandled crash.
 * "Degrade with security, not permissiveness": any unexpected failure here
 * falls through to `unavailable` (no access), never a silent grant.
 *
 * This is the INTERACTIVE check (entering a venue, check-in): it sends the reading to the server whatever it is.
 * Automatic checks of an ongoing session use runSilentGeoCheck instead.
 *
 * Permission: only a user action (`interactive`: Enter, Retry, Allow location) may show the system prompt; on
 * Android a request launches the system permission activity, which sends the app inactive → active.
 */
export async function runGeoCheck(
  roomId: string,
  onReading?: (coords: Coords) => void,
  opts: { interactive?: boolean } = {},
): Promise<GeoCheckResult> {
  try {
    let permitted: boolean;
    try {
      permitted = opts.interactive ? await requestForegroundPermission() : await hasForegroundPermission();
    } catch {
      return { granted: false, reason: 'permission_denied', distanceM: null };
    }
    if (!permitted) {
      return { granted: false, reason: 'permission_denied', distanceM: null };
    }

    let coords: Coords;
    try {
      coords = await readPosition();
    } catch {
      return { granted: false, reason: 'position_error', distanceM: null };
    }
    onReading?.(coords); // the single GPS read of this check is shared (Match presence reuses it)
    recordReading(roomId, coords);

    return await callGeofenceRpc(roomId, coords);
  } catch {
    return { granted: false, reason: 'unavailable', distanceM: null };
  }
}

export interface SilentCheckResult {
  /** 'inside' = presence renewed; 'outside_confirmed' = the exit is confirmed; 'uncertain' = do nothing visible. */
  status: ExitVerdict;
  /** An outside reading is waiting for confirmation: look again soon (foreground only). */
  pendingExit: boolean;
}

/** 'uncertain' with the exit still pending when the room's buffer ends in an outside reading (the chain of looks goes on). */
function uncertain(roomId: string, geometry: VenueGeometry): SilentCheckResult {
  const pending = outsideRunLength(readingBuffers.get(roomId) ?? [], geometry, geometry.radiusM) > 0;
  return { status: 'uncertain', pendingExit: pending };
}

/**
 * The automatic check of an ongoing venue session. Never rejects, never asks for permission, never shows anything.
 *   1. read the position and add it to the room's buffer;
 *   2. asymmetric rule, limits tied to the venue's radius (utils/exitCheck.ts silentAction): a reading worse than
 *      renewAccuracyMax = max(100, radius), or outside the radius and worse than exitAccuracyMax = max(50, radius / 2),
 *      is ignored: not counted, nothing is sent to the server;
 *   3. three good readings (accuracy ≤ exitAccuracyMax) in a row beyond exitMargin = radius + 30 over ≥ 3 min →
 *      'outside_confirmed' (the last
 *      reading is sent so the server revokes the presence, the same effect the old immediate expulsion had);
 *   4. a reading INSIDE the radius with accuracy ≤ renewAccuracyMax is sent to the server (renews the presence) → 'inside';
 *   5. any other reading (outside with accuracy ≤ exitAccuracyMax, or in the 30 m margin) is only kept: the server would revoke
 *      the presence on it.
 */
export async function runSilentGeoCheck(
  roomId: string,
  geometry: VenueGeometry,
  onReading?: (coords: Coords) => void,
): Promise<SilentCheckResult> {
  try {
    let permitted = false;
    try {
      permitted = await hasForegroundPermission();
    } catch {
      permitted = false;
    }
    if (!permitted) return uncertain(roomId, geometry);

    let coords: Coords;
    try {
      coords = await readPosition();
    } catch {
      return uncertain(roomId, geometry); // a position error keeps a pending exit pending
    }
    onReading?.(coords);
    const reading = recordReading(roomId, coords);

    // Asymmetric rule, limits tied to the radius (utils/exitCheck.ts): an inside reading up to renewAccuracyMax renews;
    // only readings up to exitAccuracyMax can count towards an exit; an outside reading in between is neither sent nor counted.
    const action = silentAction(reading, geometry, geometry.radiusM);
    if (action === 'ignore') return uncertain(roomId, geometry);

    const verdict = evaluateExit(readingBuffers.get(roomId) ?? [], geometry, geometry.radiusM);
    if (verdict === 'outside_confirmed') {
      await callGeofenceRpc(roomId, coords).catch(() => undefined); // revokes the server presence
      return { status: 'outside_confirmed', pendingExit: false };
    }

    if (action === 'renew') {
      const result = await callGeofenceRpc(roomId, coords);
      // Even if the server disagrees (different centre, network error) one answer never ends a session.
      return result.granted ? { status: 'inside', pendingExit: false } : uncertain(roomId, geometry);
    }

    return { status: 'uncertain', pendingExit: true };
  } catch {
    return uncertain(roomId, geometry);
  }
}

let autoChecksInFlight = 0;
let lastAutoCheckAt = 0;

/** Milliseconds since the last automatic check started (Infinity before the first). */
export function autoCheckAgeMs(): number {
  return lastAutoCheckAt === 0 ? Infinity : Date.now() - lastAutoCheckAt;
}

/**
 * A silent check shared by every owner of a heartbeat: never two at once, and with `minGapMs` skipped when the
 * previous one is too recent. Resolves null when skipped.
 */
export async function runAutoSilentCheck(
  roomId: string,
  geometry: VenueGeometry,
  onReading?: (coords: Coords) => void,
  minGapMs = 0,
): Promise<SilentCheckResult | null> {
  if (autoChecksInFlight > 0) return null;
  if (minGapMs > 0 && Date.now() - lastAutoCheckAt < minGapMs) return null;
  autoChecksInFlight += 1;
  lastAutoCheckAt = Date.now();
  try {
    return await runSilentGeoCheck(roomId, geometry, onReading);
  } finally {
    autoChecksInFlight -= 1;
  }
}

interface UseGeofenceGateArgs {
  roomId: string;
  isOwner: boolean;
  /** True once the user is inside the chat (entryVisible === false) — enables the heartbeat. */
  entered: boolean;
  /** The venue's centre and radius; null while unknown (the silent checks wait for it). */
  geometry: VenueGeometry | null;
  /** Called when the exit is CONFIRMED (never on a single reading). */
  onExpelled: () => void;
}

interface UseGeofenceGateResult {
  /** Runs the permission → position → RPC sequence. Resolves true iff access is granted. */
  checkAndEnter: () => Promise<boolean>;
  gateStatus: GeoGateStatus;
  /** Distance in meters, only meaningful when gateStatus === 'outside_radius'. */
  outsideDistanceM: number | null;
  /** The server presence lapsed (e.g. the phone was locked for a while) and has not been renewed yet. */
  reconnecting: boolean;
  /** The reading used by the most recent geofence check (same GPS read), or null before the first. */
  lastCoords: GeoReading | null;
  /** True when that reading was flagged as a mock location (Android). */
  lastMocked: boolean;
}

/** A GPS reading shared with Match presence. `readAt` (ms epoch) changes on every reading. */
export interface GeoReading {
  lat: number;
  lng: number;
  mocked: boolean;
  readAt: number;
}

export function useGeofenceGate({
  roomId,
  isOwner,
  entered,
  geometry,
  onExpelled,
}: UseGeofenceGateArgs): UseGeofenceGateResult {
  const [gateStatus, setGateStatus] = useState<GeoGateStatus>('idle');
  const [outsideDistanceM, setOutsideDistanceM] = useState<number | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [lastCoords, setLastCoords] = useState<GeoReading | null>(null);

  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;
  const onExpelledRef = useRef(onExpelled);
  onExpelledRef.current = onExpelled;

  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const verifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hadReadingRef = useRef(false);
  const handleReading = useCallback((c: Coords) => {
    hadReadingRef.current = true;
    setLastCoords({ lat: c.lat, lng: c.lng, mocked: c.mocked === true, readAt: Date.now() });
  }, []);

  const clearVerifyTimer = useCallback(() => {
    if (verifyTimerRef.current) {
      clearTimeout(verifyTimerRef.current);
      verifyTimerRef.current = null;
    }
  }, []);

  // True while an exit is pending (utils/exitSchedule.ts): the looks every minute go on until it is confirmed or cancelled.
  const pendingChainRef = useRef(false);
  const checkRef = useRef<(minGapMs?: number) => Promise<void>>(async () => undefined);
  const scheduleNextLook = useCallback((delay: number = SILENT_VERIFY_INTERVAL_MS) => {
    verifyTimerRef.current = setTimeout(() => {
      verifyTimerRef.current = null;
      void checkRef.current();
    }, delay);
  }, []);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  /**
   * The single silent check used by the 5-min heartbeat, the resume from the background and the follow-up after an
   * unconfirmed outside reading. 'inside' / 'uncertain' show nothing; only 'outside_confirmed' ends the session.
   * Self-referential (the follow-up timer calls it again) — safe because by the time the timer fires the const is bound.
   */
  const performBackgroundCheck = useCallback(async (minGapMs = 0) => {
    if (AppState.currentState !== 'active') return; // never read GPS while backgrounded
    const venueGeometry = geometryRef.current;
    if (!venueGeometry) return; // centre and radius not known yet: wait, nothing is shown
    const room = roomIdRef.current;
    if (presenceLooksExpired(room)) setReconnecting(true); // a discreet "Reconnecting…", never an expulsion

    const result = await runAutoSilentCheck(room, venueGeometry, handleReading, minGapMs);
    if (!result) {
      // Another check was running, or this one was too soon after the last: a chain that is already going keeps going.
      if (verifyTimerRef.current === null && pendingChainRef.current) scheduleNextLook();
      return;
    }
    clearVerifyTimer();
    pendingChainRef.current = result.pendingExit;

    if (result.status === 'inside') {
      setReconnecting(false);
      return;
    }
    if (result.status === 'outside_confirmed') {
      setReconnecting(false);
      clearHeartbeat();
      onExpelledRef.current();
      return;
    }
    const delay = nextVerifyDelayMs({ status: result.status, pendingExit: result.pendingExit });
    if (delay !== null) scheduleNextLook(delay);
  }, [clearHeartbeat, clearVerifyTimer, handleReading, scheduleNextLook]);
  checkRef.current = performBackgroundCheck;

  const checkAndEnter = useCallback(async (): Promise<boolean> => {
    if (!isSupabaseConfigured || isOwner) {
      setGateStatus('idle');
      return true;
    }
    setGateStatus('checking');
    setOutsideDistanceM(null);
    const result = await runGeoCheck(roomIdRef.current, handleReading, { interactive: true });
    if (result.granted) {
      setGateStatus('idle');
      setReconnecting(false);
      return true;
    }
    setGateStatus(result.reason as GeoGateStatus);
    setOutsideDistanceM(result.distanceM);
    return false;
  }, [isOwner, handleReading]);

  // ── Heartbeat: only while entered, non-owner, chat mounted + foreground ────
  useEffect(() => {
    if (!entered || isOwner || !isSupabaseConfigured) return;

    heartbeatIntervalRef.current = setInterval(() => {
      void performBackgroundCheck();
    }, HEARTBEAT_INTERVAL_MS);

    // Re-opening the chat of an ongoing venue session skips the entry gate: there is no reading from
    // this mount yet, so take one now (it also feeds the Match check-in).
    if (!hadReadingRef.current) void performBackgroundCheck();

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        // Back in the foreground — feed the silent check rather than waiting for the next scheduled tick;
        // throttled so brief inactive→active flips don't re-check. A long absence (the server presence has
        // lapsed) re-checks at once and shows "Reconnecting…" until a good reading inside renews it.
        void performBackgroundCheck(presenceLooksExpired(roomIdRef.current) ? 0 : RESUME_RECHECK_MIN_GAP_MS);
      }
      // Background: do nothing. No GPS read happens — performBackgroundCheck
      // itself guards on AppState.currentState === 'active'.
    });

    return () => {
      clearHeartbeat();
      clearVerifyTimer();
      sub.remove();
    };
  }, [entered, isOwner, performBackgroundCheck, clearHeartbeat, clearVerifyTimer]);

  // The venue's centre and radius arrive after the chat mounted: take the first reading then.
  const hasGeometry = geometry !== null;
  useEffect(() => {
    if (hasGeometry && entered && !isOwner && isSupabaseConfigured && !hadReadingRef.current) void performBackgroundCheck();
  }, [hasGeometry, entered, isOwner, performBackgroundCheck]);

  // Web: re-check when the network comes back or the page is restored (AppState already covers visibilitychange).
  useWebResumeRecheck({
    onResume: () => { void performBackgroundCheck(RESUME_RECHECK_MIN_GAP_MS); },
    enabled: entered && !isOwner && isSupabaseConfigured,
    ageMs: autoCheckAgeMs,
    minGapMs: RESUME_RECHECK_MIN_GAP_MS,
  });

  return {
    checkAndEnter,
    gateStatus,
    outsideDistanceM,
    reconnecting,
    lastCoords,
    lastMocked: lastCoords?.mocked === true,
  };
}
