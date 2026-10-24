/**
 * JChat 3.0 — VenueSessionProvider
 *
 * A "venue session" starts when the geofence gate lets the user into a venue's chat and lasts until
 * they leave on purpose ("Salir del local") or the silent exit verification CONFIRMS they are outside
 * (three good readings in a row, clearly outside, over ≥ 3 min — utils/exitCheck.ts). One reading, a locked
 * phone or a long time in the background never end it: if the server presence lapsed, `reconnecting` is true
 * until a good reading inside renews it. The chat screen can be minimized and reopened without verification
 * or entry notice; meanwhile this provider keeps the presence alive (geofence + Match check-in every 5 min,
 * foreground only) and counts new messages / likes.
 *
 * While the chat is mounted it owns the heartbeat (useGeofenceGate does the same silent check);
 * the provider's own heartbeat runs only while the chat is NOT mounted. One venue at a time.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import i18n from '../i18n';
import { useAuth } from './AuthContext';
import { supabase, isSupabaseConfigured, channelTopic } from '../services/supabase';
import {
  runAutoSilentCheck,
  autoCheckAgeMs,
  presenceLooksExpired,
  resetExitState,
  RESUME_RECHECK_MIN_GAP_MS,
  SILENT_VERIFY_INTERVAL_MS,
  type VenueGeometry,
} from '../screens/chat/useGeofenceGate';
import { useWebResumeRecheck } from '../hooks/useWebResumeRecheck';
import { resetMatchPresence, runMatchCheckIn, setMatchReading } from '../services/matchPresence';
import { getMatchActivity } from '../services/matchDeck';
import { matchLeaveVenue } from '../services/match';
import { showAlert } from '../utils/dialog';
import { shouldCountUnread } from '../utils/venueUnread';
import { clearEntryTableToken } from '../services/venueTable';
import { endVenueSessionOnServer, resumeVenueSessionOnServer } from '../services/venuePresence';
import { invalidateDmUnread } from '../services/dms';
import { resetToMapTab } from '../navigation/navigationRef';
import { nextVerifyDelayMs } from '../utils/exitSchedule';

const HEARTBEAT_MS = 5 * 60 * 1000;

export interface VenueSession {
  businessId: string;
  businessName: string;
  roomId: string;
  tableLabel?: string;
  /** Epoch ms when the session started. */
  since: number;
}

/**
 * Why a session ended. 'outside' (the provider's own heartbeat) and 'expelled' (the chat's gate, which already told
 * the user) are CONFIRMED exits: the server hides the venue's ephemeral content and purges it later (venue_session_end).
 * 'user' (leaving on purpose, signing out) and 'switch' do not call it.
 */
export type VenueEndReason = 'user' | 'outside' | 'expelled' | 'switch';

interface VenueSessionContextValue {
  session: VenueSession | null;
  /** Centre and radius of the venue's geofence (null while unknown / without a session). */
  geometry: VenueGeometry | null;
  /** The server presence lapsed (e.g. the phone was locked a while) and a good reading inside has not renewed it yet. */
  reconnecting: boolean;
  /** New chat messages since the chat was last open (not mine). */
  unreadMessages: number;
  /** People who liked me at this venue (Match). */
  likeCount: number;
  /** Starts a session. Resolves false if the user declined to switch from another venue. */
  startSession: (info: Omit<VenueSession, 'since'> & { matchActive?: boolean }) => Promise<boolean>;
  /** Ends the session on purpose ("Salir del local"). */
  leaveVenue: () => Promise<void>;
  /** The provider ended the session itself (outside the area…): used by the chat's own expulsion. */
  endSession: (reason: VenueEndReason) => void;
  /**
   * Goes up by one each time coming back to a venue gave back an exit that was still pending (venue_session_resume
   * answered true): the screens that show the venue's history read it again.
   */
  historyEpoch: number;
  /** The chat screen reports it is mounted (it owns the heartbeat then) and tells Match availability. */
  setChatMounted: (mounted: boolean) => void;
  /** The chat is mounted but something covers it (the profile sheet): new messages count as unread meanwhile. */
  setChatCovered: (covered: boolean) => void;
  setMatchActive: (active: boolean) => void;
  setTableLabel: (label: string | undefined) => void;
}

const noop = () => undefined;

const VenueSessionContext = createContext<VenueSessionContextValue>({
  session: null,
  geometry: null,
  reconnecting: false,
  unreadMessages: 0,
  likeCount: 0,
  startSession: () => Promise.resolve(true),
  leaveVenue: () => Promise.resolve(),
  endSession: noop,
  historyEpoch: 0,
  setChatMounted: noop,
  setChatCovered: noop,
  setMatchActive: noop,
  setTableLabel: noop,
});

export function useVenueSession(): VenueSessionContextValue {
  return useContext(VenueSessionContext);
}

export function VenueSessionProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [session, setSession] = useState<VenueSession | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [geometry, setGeometry] = useState<VenueGeometry | null>(null);
  const [geometryRetry, setGeometryRetry] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const [historyEpoch, setHistoryEpoch] = useState(0);

  const sessionRef = useRef<VenueSession | null>(null);
  sessionRef.current = session;
  const geometryRef = useRef<VenueGeometry | null>(null);
  geometryRef.current = geometry;
  const chatMountedRef = useRef(false);
  const chatCoveredRef = useRef(false);
  const matchActiveRef = useRef(false);
  const verifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while an exit is pending (utils/exitSchedule.ts): the looks every minute go on until it is confirmed or cancelled.
  const pendingChainRef = useRef(false);

  // ── Ending ───────────────────────────────────────────────────────────────────

  const endSession = useCallback((reason: VenueEndReason) => {
    clearEntryTableToken(); // the table QR token only lives as long as the venue session
    const current = sessionRef.current;
    if (!current) return;
    sessionRef.current = null;
    setSession(null);
    setUnreadMessages(0);
    setLikeCount(0);
    setReconnecting(false);
    matchActiveRef.current = false;
    resetExitState(current.roomId);
    resetMatchPresence();
    setMatchReading(null);
    // A CONFIRMED exit: the server takes the person's presence out, hides the venue's ephemeral DMs for an hour and
    // purges them later (venue_session_end). If the function does not exist yet the call just logs once and fails
    // quietly. The chat's own messages live in the screen's state (it is gone when the chat closes), so what is left
    // to refresh locally is the DM badge, which reads the hidden conversations again.
    if (reason === 'outside' || reason === 'expelled') {
      void endVenueSessionOnServer(current.businessId).then((done) => {
        if (done) invalidateDmUnread();
      });
    }
    // A confirmed exit always lands on the Map, whatever is open over the venue chat (a DM, a profile, the menu…).
    // 'expelled' comes from the chat's own gate, which also resets (it may run with no session here).
    if (reason === 'outside' || reason === 'expelled') resetToMapTab();
    // Only a CONFIRMED exit tells the user: "You're outside the area… scan the QR to come back".
    if (reason === 'outside') {
      showAlert(
        i18n.t('chatRoom.errorTitle', { ns: 'chat' }) as string,
        i18n.t('chatRoom.geoRemoved', { ns: 'chat', business: current.businessName }) as string,
      );
    }
  }, []);

  const leaveVenue = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    if (matchActiveRef.current) await matchLeaveVenue(current.businessId).catch(() => undefined);
    endSession('user');
    resetToMapTab(current.businessName); // leaving on purpose also ends on the Map, never on the venue chat
  }, [endSession]);

  // ── Starting (one venue at a time) ───────────────────────────────────────────

  const startSession = useCallback(
    async (info: Omit<VenueSession, 'since'> & { matchActive?: boolean }): Promise<boolean> => {
      const current = sessionRef.current;
      if (current && current.businessId !== info.businessId) {
        const confirmed = await new Promise<boolean>((resolve) => {
          showAlert(
            i18n.t('venueSession.switchTitle', { ns: 'chat', business: info.businessName }) as string,
            i18n.t('venueSession.switchBody', { ns: 'chat', current: current.businessName }) as string,
            [
              { text: i18n.t('venueSession.switchKeep', { ns: 'chat' }) as string, style: 'cancel', onPress: () => resolve(false) },
              { text: i18n.t('venueSession.switchConfirm', { ns: 'chat' }) as string, onPress: () => resolve(true) },
            ],
            { cancelable: false },
          );
        });
        if (!confirmed) return false;
        if (matchActiveRef.current) await matchLeaveVenue(current.businessId).catch(() => undefined);
        endSession('switch');
      }
      if (sessionRef.current?.businessId === info.businessId) {
        // Same venue (e.g. re-entering): keep the session, refresh the room.
        const refreshed = { ...sessionRef.current, roomId: info.roomId };
        sessionRef.current = refreshed;
        setSession(refreshed);
      } else {
        const next: VenueSession = {
          businessId: info.businessId,
          businessName: info.businessName,
          roomId: info.roomId,
          tableLabel: info.tableLabel,
          since: Date.now(),
        };
        sessionRef.current = next;
        setSession(next);
        setUnreadMessages(0);
        setLikeCount(0);
        setReconnecting(false);
        resetExitState(info.roomId); // a fresh session starts with no readings from an earlier visit
        // Coming back within the hour after a confirmed exit gives the hidden history back (venue_session_resume
        // answers true): the screens that show it read it again. Without the database function this is a no-op.
        void resumeVenueSessionOnServer(info.businessId).then((resumed) => {
          if (resumed && sessionRef.current?.businessId === info.businessId) {
            setHistoryEpoch((n) => n + 1);
            invalidateDmUnread();
          }
        });
      }
      matchActiveRef.current = info.matchActive === true;
      return true;
    },
    [endSession],
  );

  const setChatMounted = useCallback((mounted: boolean) => {
    chatMountedRef.current = mounted;
    if (mounted) setUnreadMessages(0);
  }, []);
  const setChatCovered = useCallback((covered: boolean) => {
    chatCoveredRef.current = covered;
    if (!covered) setUnreadMessages(0); // back in front of the chat: what arrived meanwhile is on screen
  }, []);
  const setMatchActive = useCallback((active: boolean) => {
    matchActiveRef.current = active;
  }, []);
  const setTableLabel = useCallback((label: string | undefined) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, tableLabel: label };
      sessionRef.current = next;
      return next;
    });
  }, []);

  // ── Heartbeat while the chat is NOT mounted (foreground only) ─────────────────

  const businessId = session?.businessId ?? null;
  const roomId = session?.roomId ?? null;

  // The venue's centre and radius (the server's own numbers) — needed to tell inside from outside on the phone.
  useEffect(() => {
    setGeometry(null);
    if (!businessId || !isSupabaseConfigured) return undefined;
    let alive = true;
    void supabase
      .from('businesses')
      .select('lat, lng, geofence_radius_m')
      .eq('id', businessId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return;
        const row = data as { lat: number | null; lng: number | null; geofence_radius_m: number | null };
        if (typeof row.lat === 'number' && typeof row.lng === 'number' && typeof row.geofence_radius_m === 'number' && row.geofence_radius_m > 0) {
          setGeometry({ lat: row.lat, lng: row.lng, radiusM: row.geofence_radius_m });
        }
      });
    return () => {
      alive = false;
    };
  }, [businessId, geometryRetry]);

  const clearVerifyTimer = useCallback(() => {
    if (verifyTimerRef.current) {
      clearTimeout(verifyTimerRef.current);
      verifyTimerRef.current = null;
    }
  }, []);

  /**
   * The silent check while the chat is NOT mounted. 'inside' renews the presence (and the Match check-in);
   * 'uncertain' shows nothing; only 'outside_confirmed' ends the session (same endSession path as before).
   * An unconfirmed outside reading is looked at again after a minute (foreground only).
   */
  const heartbeat = useCallback(async (minGapMs = 0): Promise<void> => {
    const current = sessionRef.current;
    if (!current || AppState.currentState !== 'active') return;
    const venueGeometry = geometryRef.current;
    if (!venueGeometry) {
      setGeometryRetry((n) => n + 1); // centre and radius not loaded yet: ask again, nothing is shown
      return;
    }
    if (presenceLooksExpired(current.roomId)) setReconnecting(true); // a discreet "Reconnecting…", never an expulsion
    const result = await runAutoSilentCheck(
      current.roomId,
      venueGeometry,
      (coords) => setMatchReading({ lat: coords.lat, lng: coords.lng, mocked: coords.mocked === true }),
      minGapMs,
    );
    if (!result) {
      // Another check was running, or too soon after the last one: a chain that is already going keeps going.
      if (verifyTimerRef.current === null && pendingChainRef.current) {
        verifyTimerRef.current = setTimeout(() => {
          verifyTimerRef.current = null;
          if (!chatMountedRef.current) void heartbeat();
        }, SILENT_VERIFY_INTERVAL_MS);
      }
      return;
    }
    if (sessionRef.current?.businessId !== current.businessId) return; // changed meanwhile
    clearVerifyTimer();
    pendingChainRef.current = result.pendingExit;
    if (result.status === 'inside') {
      setReconnecting(false);
      if (matchActiveRef.current) void runMatchCheckIn(current.businessId, current.roomId);
      return;
    }
    if (result.status === 'outside_confirmed') {
      endSession('outside');
      return;
    }
    const delay = nextVerifyDelayMs({ status: result.status, pendingExit: result.pendingExit });
    if (delay !== null) {
      verifyTimerRef.current = setTimeout(() => {
        verifyTimerRef.current = null;
        if (!chatMountedRef.current) void heartbeat();
      }, delay);
    }
  }, [endSession, clearVerifyTimer]);

  useEffect(() => {
    if (!businessId || !roomId || !isSupabaseConfigured) return;
    const timer = setInterval(() => {
      if (!chatMountedRef.current) void heartbeat();
    }, HEARTBEAT_MS);
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      // One owner at a time: while the chat is mounted its own gate re-checks on resume. Back from a long absence
      // (the server presence lapsed) the check runs at once; it never ends the session by itself.
      if (chatMountedRef.current) return;
      void heartbeat(presenceLooksExpired(roomId) ? 0 : RESUME_RECHECK_MIN_GAP_MS);
    });
    return () => {
      clearInterval(timer);
      clearVerifyTimer();
      sub.remove();
    };
  }, [businessId, roomId, heartbeat, clearVerifyTimer]);

  // The venue's geometry arrived after the session started: take a first silent reading (chat not mounted only).
  const hasGeometry = geometry !== null;
  useEffect(() => {
    if (hasGeometry && !chatMountedRef.current) void heartbeat();
  }, [hasGeometry, heartbeat]);

  // Web: network back / page restored → re-check (only while the chat is not mounted; the chat's own gate does it otherwise).
  useWebResumeRecheck({
    onResume: () => { if (!chatMountedRef.current) void heartbeat(RESUME_RECHECK_MIN_GAP_MS); },
    enabled: !!businessId && !!roomId && isSupabaseConfigured,
    ageMs: autoCheckAgeMs,
    minGapMs: RESUME_RECHECK_MIN_GAP_MS,
  });

  // ── Counters: new chat messages and Match likes ──────────────────────────────

  useEffect(() => {
    if (!businessId || !userId || !isSupabaseConfigured) return;
    let alive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      const { data } = await supabase.from('rooms').select('id').eq('business_id', businessId);
      const ids = ((data ?? []) as { id: string }[]).map((r) => r.id).slice(0, 100);
      if (!alive || ids.length === 0) return;
      channel = supabase
        .channel(channelTopic(`venue-session:msgs:${businessId}`))
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=in.(${ids.join(',')})` },
          (payload) => {
            const row = payload.new as { user_id?: string | null };
            if (shouldCountUnread({ fromMe: !row.user_id || row.user_id === userId, chatMounted: chatMountedRef.current, chatCovered: chatCoveredRef.current })) {
              setUnreadMessages((n) => n + 1);
            }
          },
        )
        .subscribe();
    })();
    return () => {
      alive = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [businessId, userId]);

  useEffect(() => {
    if (!businessId || !userId || !isSupabaseConfigured) return;
    let alive = true;
    void getMatchActivity(businessId)
      .then((activity) => {
        if (alive) setLikeCount(activity.liked_me.length);
      })
      .catch(() => undefined);
    const channel = supabase
      .channel(channelTopic(`venue-session:likes:${userId}:${businessId}`))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as { type?: string; payload?: { business_id?: string } | null };
          if ((row.type === 'match_like' || row.type === 'match_super') && row.payload?.business_id === businessId) {
            setLikeCount((n) => n + 1);
          }
        },
      )
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [businessId, userId]);

  // Signing out (or another account) ends the session silently.
  useEffect(() => {
    if (!userId && sessionRef.current) endSession('user');
  }, [userId, endSession]);

  const value = useMemo<VenueSessionContextValue>(
    () => ({ session, geometry, reconnecting, unreadMessages, likeCount, startSession, leaveVenue, endSession, historyEpoch, setChatMounted, setChatCovered, setMatchActive, setTableLabel }),
    [session, geometry, reconnecting, unreadMessages, likeCount, startSession, leaveVenue, endSession, historyEpoch, setChatMounted, setChatCovered, setMatchActive, setTableLabel],
  );

  return <VenueSessionContext.Provider value={value}>{children}</VenueSessionContext.Provider>;
}
