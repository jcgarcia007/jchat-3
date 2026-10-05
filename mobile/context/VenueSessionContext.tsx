/**
 * JChat 3.0 — VenueSessionProvider
 *
 * A "venue session" starts when the geofence gate lets the user into a venue's chat and lasts until
 * they leave on purpose ("Salir del local"), the geofence says they are outside, or they come back
 * from the background after >15 min and the check-in fails. The chat screen can be minimized and
 * reopened without verification or entry notice; meanwhile this provider keeps the presence alive
 * (geofence + Match check-in every 5 min, foreground only) and counts new messages / likes.
 *
 * While the chat is mounted it owns the heartbeat (useGeofenceGate has the grace/expulsion UX);
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
import { Alert, AppState } from 'react-native';
import i18n from '../i18n';
import { useAuth } from './AuthContext';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { runGeoCheck } from '../screens/chat/useGeofenceGate';
import { resetMatchPresence, runMatchCheckIn, setMatchReading } from '../services/matchPresence';
import { getMatchActivity } from '../services/matchDeck';
import { matchLeaveVenue } from '../services/match';

const HEARTBEAT_MS = 5 * 60 * 1000;
/** Back from the background after this long: the server presence has lapsed → check again or end. */
const STALE_AFTER_MS = 15 * 60 * 1000;

export interface VenueSession {
  businessId: string;
  businessName: string;
  roomId: string;
  tableLabel?: string;
  /** Epoch ms when the session started. */
  since: number;
}

export type VenueEndReason = 'user' | 'outside' | 'stale' | 'switch';

interface VenueSessionContextValue {
  session: VenueSession | null;
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
  /** The chat screen reports it is mounted (it owns the heartbeat then) and tells Match availability. */
  setChatMounted: (mounted: boolean) => void;
  setMatchActive: (active: boolean) => void;
  setTableLabel: (label: string | undefined) => void;
}

const noop = () => undefined;

const VenueSessionContext = createContext<VenueSessionContextValue>({
  session: null,
  unreadMessages: 0,
  likeCount: 0,
  startSession: () => Promise.resolve(true),
  leaveVenue: () => Promise.resolve(),
  endSession: noop,
  setChatMounted: noop,
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

  const sessionRef = useRef<VenueSession | null>(null);
  sessionRef.current = session;
  const chatMountedRef = useRef(false);
  const matchActiveRef = useRef(false);
  const backgroundedAtRef = useRef<number | null>(null);

  // ── Ending ───────────────────────────────────────────────────────────────────

  const endSession = useCallback((reason: VenueEndReason) => {
    const current = sessionRef.current;
    if (!current) return;
    sessionRef.current = null;
    setSession(null);
    setUnreadMessages(0);
    setLikeCount(0);
    matchActiveRef.current = false;
    resetMatchPresence();
    setMatchReading(null);
    if (reason === 'outside' || reason === 'stale') {
      Alert.alert(
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
  }, [endSession]);

  // ── Starting (one venue at a time) ───────────────────────────────────────────

  const startSession = useCallback(
    async (info: Omit<VenueSession, 'since'> & { matchActive?: boolean }): Promise<boolean> => {
      const current = sessionRef.current;
      if (current && current.businessId !== info.businessId) {
        const confirmed = await new Promise<boolean>((resolve) => {
          Alert.alert(
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

  const heartbeat = useCallback(async (mustPass: boolean) => {
    const current = sessionRef.current;
    if (!current || AppState.currentState !== 'active') return;
    const result = await runGeoCheck(current.roomId, (coords) =>
      setMatchReading({ lat: coords.lat, lng: coords.lng, mocked: coords.mocked === true }),
    );
    if (sessionRef.current?.businessId !== current.businessId) return; // changed meanwhile
    if (result.granted) {
      if (matchActiveRef.current) void runMatchCheckIn(current.businessId, current.roomId);
      return;
    }
    // Outside the area → the session is over. Other failures (no GPS fix, network) are tolerated
    // unless we are coming back from a long absence (mustPass): then presence can't be assumed.
    if (result.reason === 'outside_radius' || mustPass) endSession(mustPass && result.reason !== 'outside_radius' ? 'stale' : 'outside');
  }, [endSession]);

  useEffect(() => {
    if (!businessId || !roomId || !isSupabaseConfigured) return;
    const timer = setInterval(() => {
      if (!chatMountedRef.current) void heartbeat(false);
    }, HEARTBEAT_MS);
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        backgroundedAtRef.current = Date.now();
        return;
      }
      const away = backgroundedAtRef.current != null ? Date.now() - backgroundedAtRef.current : 0;
      backgroundedAtRef.current = null;
      // Long absence: verify even if the chat is open (it re-checks too, harmlessly).
      if (away > STALE_AFTER_MS) void heartbeat(true);
      else if (!chatMountedRef.current) void heartbeat(false);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [businessId, roomId, heartbeat]);

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
        .channel(`venue-session-msgs:${businessId}:${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=in.(${ids.join(',')})` },
          (payload) => {
            const row = payload.new as { user_id?: string | null };
            if (row.user_id && row.user_id !== userId && !chatMountedRef.current) {
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
      .channel(`venue-session-likes:${businessId}:${Date.now()}`)
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
    () => ({ session, unreadMessages, likeCount, startSession, leaveVenue, endSession, setChatMounted, setMatchActive, setTableLabel }),
    [session, unreadMessages, likeCount, startSession, leaveVenue, endSession, setChatMounted, setMatchActive, setTableLabel],
  );

  return <VenueSessionContext.Provider value={value}>{children}</VenueSessionContext.Provider>;
}
