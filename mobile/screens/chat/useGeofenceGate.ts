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

import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { requestForegroundPermission, getCurrentPosition } from '../../services/geofence';

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // renew geo-presence every 5 min while open+foreground
const GRACE_DURATION_MS = 2 * 60 * 1000; // §3.3 of the design doc: warn, then 2 min to return
const GRACE_RECHECK_INTERVAL_MS = 20 * 1000; // check more often during grace to detect "back inside" promptly
const GRACE_COUNTDOWN_TICK_MS = 1000;

/** Rounds to whole meters below 1000 m, otherwise one decimal of km. */
export function formatDistanceM(distanceM: number): string {
  if (distanceM >= 1000) return `${(distanceM / 1000).toFixed(1)} km`;
  return `${Math.round(distanceM)} m`;
}

/** mm:ss for the grace-period countdown banner. */
export function formatGraceCountdown(secondsLeft: number): string {
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
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

interface GeoCheckResult {
  granted: boolean;
  reason: GeoGateStatus | 'granted';
  distanceM: number | null;
}

/**
 * Never rejects — every step (permission, GPS, RPC) is wrapped so a native or
 * network hiccup degrades to a result object instead of an unhandled crash.
 * "Degrade with security, not permissiveness": any unexpected failure here
 * falls through to `unavailable` (no access), never a silent grant.
 */
async function runGeoCheck(roomId: string): Promise<GeoCheckResult> {
  try {
    let permitted: boolean;
    try {
      permitted = await requestForegroundPermission();
    } catch {
      return { granted: false, reason: 'permission_denied', distanceM: null };
    }
    if (!permitted) {
      return { granted: false, reason: 'permission_denied', distanceM: null };
    }

    let coords: { lat: number; lng: number };
    try {
      coords = await getCurrentPosition();
    } catch {
      return { granted: false, reason: 'position_error', distanceM: null };
    }

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
      return { granted: true, reason: 'granted', distanceM: row.distance_m };
    }
    if (row.reason === 'outside_radius') {
      return { granted: false, reason: 'outside_radius', distanceM: row.distance_m };
    }
    // no_geofence / invalid_room / auth_required — degrade safely, generic message.
    return { granted: false, reason: 'unavailable', distanceM: null };
  } catch {
    return { granted: false, reason: 'unavailable', distanceM: null };
  }
}

interface UseGeofenceGateArgs {
  roomId: string;
  isOwner: boolean;
  /** True once the user is inside the chat (entryVisible === false) — enables the heartbeat. */
  entered: boolean;
  /** Called when the grace period expires without the user returning to the radius. */
  onExpelled: () => void;
}

interface UseGeofenceGateResult {
  /** Runs the permission → position → RPC sequence. Resolves true iff access is granted. */
  checkAndEnter: () => Promise<boolean>;
  gateStatus: GeoGateStatus;
  /** Distance in meters, only meaningful when gateStatus === 'outside_radius'. */
  outsideDistanceM: number | null;
  graceWarningVisible: boolean;
  /** Seconds left in the grace period, for an optional countdown display. */
  graceSecondsLeft: number | null;
}

export function useGeofenceGate({
  roomId,
  isOwner,
  entered,
  onExpelled,
}: UseGeofenceGateArgs): UseGeofenceGateResult {
  const [gateStatus, setGateStatus] = useState<GeoGateStatus>('idle');
  const [outsideDistanceM, setOutsideDistanceM] = useState<number | null>(null);
  const [graceWarningVisible, setGraceWarningVisible] = useState(false);
  const [graceSecondsLeft, setGraceSecondsLeft] = useState<number | null>(null);

  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;
  const onExpelledRef = useRef(onExpelled);
  onExpelledRef.current = onExpelled;

  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const graceRecheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const graceCountdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const graceDeadlineRef = useRef<number | null>(null);

  const clearGrace = useCallback(() => {
    if (graceRecheckIntervalRef.current) {
      clearInterval(graceRecheckIntervalRef.current);
      graceRecheckIntervalRef.current = null;
    }
    if (graceCountdownIntervalRef.current) {
      clearInterval(graceCountdownIntervalRef.current);
      graceCountdownIntervalRef.current = null;
    }
    graceDeadlineRef.current = null;
    setGraceWarningVisible(false);
    setGraceSecondsLeft(null);
  }, []);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  /**
   * The single check used by both the 5-min heartbeat and the grace re-checks.
   * Self-referential (starts the grace timers, which call this again) — safe
   * because by the time any timer fires, this const is already fully bound.
   */
  const performBackgroundCheck = useCallback(async () => {
    if (AppState.currentState !== 'active') return; // never read GPS while backgrounded
    const result = await runGeoCheck(roomIdRef.current);

    if (result.granted) {
      if (graceDeadlineRef.current != null) clearGrace(); // was in grace, back inside → cancel
      return;
    }

    if (result.reason === 'outside_radius' && graceDeadlineRef.current == null) {
      // Not yet in grace — start the warn + 2 min countdown.
      setGraceWarningVisible(true);
      const deadline = Date.now() + GRACE_DURATION_MS;
      graceDeadlineRef.current = deadline;
      setGraceSecondsLeft(Math.ceil(GRACE_DURATION_MS / 1000));

      graceCountdownIntervalRef.current = setInterval(() => {
        const d = graceDeadlineRef.current;
        if (d == null) return;
        const secsLeft = Math.round((d - Date.now()) / 1000);
        if (secsLeft <= 0) {
          clearGrace();
          clearHeartbeat();
          onExpelledRef.current();
          return;
        }
        setGraceSecondsLeft(secsLeft);
      }, GRACE_COUNTDOWN_TICK_MS);

      graceRecheckIntervalRef.current = setInterval(() => {
        void performBackgroundCheck();
      }, GRACE_RECHECK_INTERVAL_MS);
    }
    // Other transient failures (permission_denied/position_error/unavailable)
    // while already inside: don't escalate to expulsion on a single blip — try
    // again next tick. The server-side geo-presence TTL (10 min) is the real
    // backstop if the client keeps failing silently.
  }, [clearGrace, clearHeartbeat]);

  const checkAndEnter = useCallback(async (): Promise<boolean> => {
    if (!isSupabaseConfigured || isOwner) {
      setGateStatus('idle');
      return true;
    }
    setGateStatus('checking');
    setOutsideDistanceM(null);
    const result = await runGeoCheck(roomIdRef.current);
    if (result.granted) {
      setGateStatus('idle');
      return true;
    }
    setGateStatus(result.reason as GeoGateStatus);
    setOutsideDistanceM(result.distanceM);
    return false;
  }, [isOwner]);

  // ── Heartbeat: only while entered, non-owner, chat mounted + foreground ────
  useEffect(() => {
    if (!entered || isOwner || !isSupabaseConfigured) return;

    heartbeatIntervalRef.current = setInterval(() => {
      void performBackgroundCheck();
    }, HEARTBEAT_INTERVAL_MS);

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        // Resumed foreground — re-check immediately rather than waiting for
        // the next scheduled tick, so a stale "outside" state resolves fast.
        void performBackgroundCheck();
      }
      // Background: do nothing. No GPS read happens — performBackgroundCheck
      // itself guards on AppState.currentState === 'active'.
    });

    return () => {
      clearHeartbeat();
      clearGrace();
      sub.remove();
    };
  }, [entered, isOwner, performBackgroundCheck, clearHeartbeat, clearGrace]);

  return { checkAndEnter, gateStatus, outsideDistanceM, graceWarningVisible, graceSecondsLeft };
}
