/**
 * JChat 3.0 — ChatRoomScreen (Task 2.4)
 *
 * Central XL chat room screen.
 *
 * ── Flow ──────────────────────────────────────────────────────────────────────
 * 1. Load room + business + sub-rooms.
 * 2. Show IncognitoToggle gate (bottom sheet) before user enters.
 * 3. After entering, apply theme from room.chat_theme_id.
 * 4. Subscribe to Realtime messages on mount; unsubscribe on unmount.
 * 5. Infinite scroll upward for older messages (page 50 at a time).
 * 6. Sub-room tabs — selecting a protected one shows PasswordEntrySheet.
 * 7. ChatInput sends text or photo; expands AttachmentPanel.
 * 8. Long-press a user avatar → UserActionSheet.
 * 9. MapReactionButton + CheckInButton in the input area.
 *
 * ── Slot markers ──────────────────────────────────────────────────────────────
 * // TODO(Task 2.5): PinnedBanner — sticky between sub-room tabs and message list.
 * // TODO(Task 2.5): PinMessageSheet — long-press message options.
 * // TODO(Task 2.6): OfferCard in MessageBubble (type === 'offer').
 * // TODO(Task 2.6): CreateOfferSheet — from AttachmentPanel Offer button.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconMapPin } from '@tabler/icons-react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { useGeofenceGate, formatDistanceM, formatGraceCountdown } from './useGeofenceGate';
import { getChatPermissions, EMPTY_PERMISSIONS, getBusinessRoleMap } from '../../services/permissions';
import type { ChatPermissions, ChatRole } from '../../services/permissions';
import { uploadImage } from '../../services/storage';
import { MatchEntryNotice } from '../../components/match/MatchEntryNotice';
import { MatchQrScanner } from '../../components/match/MatchQrScanner';
import { matchCheckInWithQr } from '../../services/matchPresence';
import { fetchVenueAccess } from '../../services/venueAccess';
import { goBackOrHome } from '../../utils/navFlow';
import { useVenueSession } from '../../context/VenueSessionContext';
import { ChatNotificationsSheet } from '../../components/chat/ChatNotificationsSheet';
import { ChatMoreSheet } from '../../components/chat/ChatMoreSheet';
import { GiftSheet } from '../../components/gift/GiftSheet';
import { useGiftAvailable } from '../../hooks/useGiftAvailable';
import { useOrdersBar } from '../../context/OrdersBarContext';
import { useNotifications } from '../../hooks/useNotifications';
import type { NotificationRoute } from '../../services/notifications';
import { openNotificationRoute, useNotificationPresenter } from '../../hooks/useNotificationPresenter';
import { useMatchPresence } from '../../hooks/useMatchPresence';
import {
  fetchGames,
  getMatchOptIn,
  hasSeenMatchNotice,
  isMatchEnabledForBusiness,
  markMatchNoticeSeen,
  matchLeaveVenue,
  setMatchOptIn,
} from '../../services/match';
import type { GameRow } from '../../services/match';
import { loadUserSettings, updateMySettings } from '../../services/userSettings';
import { useAuth } from '../../context/AuthContext';
import { getChatTheme } from '../../theme/chatThemes';
import { useThemeColors } from '../../theme/colors';

import { ChatTopBar } from '../../components/chat/ChatTopBar';
import type { BusinessSummary, UserSummary } from '../../components/chat/ChatTopBar';
import { SubRoomTabs } from '../../components/chat/SubRoomTabs';
import type { SubRoom } from '../../components/chat/SubRoomTabs';
import { ChatInput } from '../../components/chat/ChatInput';
import type { VoiceRecording } from '../../components/common/VoiceRecorderBar';
import { discardLocalRecording, uploadRoomVoice } from '../../services/voiceNotes';
import { toUserMessage } from '../../utils/errors';
import { MessageBubble } from '../../components/chat/MessageBubble';
import type { ChatMessage, UserAnchor } from '../../components/chat/MessageBubble';
import UserQuickCard from '../../components/chat/UserQuickCard';
import { ImageViewerModal } from '../../components/ImageViewerModal';
import { IncognitoToggle, INCOGNITO_ENABLED, isIncognitoValid } from '../../components/chat/IncognitoToggle';
import type { IncognitoState } from '../../components/chat/IncognitoToggle';
import { PasswordEntrySheet } from '../../components/chat/PasswordEntrySheet';
import { PinnedBanner } from '../../components/chat/PinnedBanner';
import { PinMessageSheet } from '../../components/chat/PinMessageSheet';
import { CreateOfferSheet } from '../../components/chat/CreateOfferSheet';
import { ServiceCallSheet } from '../../components/chat/ServiceCallSheet';
import { CheckInButton } from '../../components/chat/CheckInButton';
import { UserActionSheet } from '../../components/chat/UserActionSheet';
import type { ViewerRole } from '../../components/chat/UserActionSheet';
import { usePresenceChannels, type SelfProfile } from './usePresenceChannels';
import { getOrCreateConversation, DmGateError } from '../../services/dms';
import { blockUser, getBlockRelations } from '../../services/blocks';
import { ReportReasonSheet } from '../../components/report/ReportReasonSheet';
import { MessageActionSheet } from '../../components/chat/MessageActionSheet';

import type { MainStackParamList } from '../../navigation/AppNavigator';
import { palette } from '../../theme/tokens';

// ── Types ──────────────────────────────────────────────────────────────────────

type ChatRoomRoute = RouteProp<MainStackParamList, 'ChatRoom'>;
type ChatRoomNav = NativeStackNavigationProp<MainStackParamList, 'ChatRoom'>;

interface RoomData {
  id: string;
  business_id: string;
  parent_room_id: string | null;
  name: string;
  chat_theme_id: number;
  is_main: boolean;
  is_password_protected: boolean;
  sort: number;
  description: string | null;
  check_in_enabled?: boolean;
}

// ── Demo data (rendered when Supabase is not configured) ───────────────────────

const DEMO_BUSINESS: BusinessSummary = {
  id: 'demo-biz',
  name: 'The Rooftop Bar',
  icon_emoji: '🍸',
  menu_enabled: true,
};

const DEMO_ROOMS: SubRoom[] = [
  { id: 'demo-main', name: 'Main', is_main: true, is_password_protected: false, sort: 0, chat_theme_id: 1 },
  { id: 'demo-vip', name: 'VIP Lounge', is_main: false, is_password_protected: true, sort: 1, chat_theme_id: 4 },
  { id: 'demo-bar', name: 'Bar', is_main: false, is_password_protected: false, sort: 2, chat_theme_id: 1 },
];

const DEMO_USERS: UserSummary[] = [
  { id: 'u1', display_name: 'Alex', avatar_url: null },
  { id: 'u2', display_name: 'Jordan', avatar_url: null },
  { id: 'u3', display_name: 'River', avatar_url: null },
];

const DEMO_MESSAGES: ChatMessage[] = [
  {
    id: 'dm1',
    room_id: 'demo-main',
    user_id: 'u1',
    body: 'Welcome to The Rooftop Bar! 🎉',
    type: 'system',
    media_url: null,
    metadata: {},
    is_system: true,
    created_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    sender_name: 'System',
  },
  {
    id: 'dm2',
    room_id: 'demo-main',
    user_id: 'u1',
    body: 'Hey everyone! The rooftop is open tonight 🌟',
    type: 'text',
    media_url: null,
    metadata: {},
    is_system: false,
    created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    sender_name: 'Alex',
  },
  {
    id: 'dm3',
    room_id: 'demo-main',
    user_id: 'u2',
    body: "Amazing view up here! Can't wait for the sunset",
    type: 'text',
    media_url: null,
    metadata: {},
    is_system: false,
    created_at: new Date(Date.now() - 90 * 1000).toISOString(),
    sender_name: 'Jordan',
  },
  {
    id: 'dm4',
    room_id: 'demo-main',
    user_id: 'u3',
    body: 'Is the kitchen still open?',
    type: 'text',
    media_url: null,
    metadata: {},
    is_system: false,
    created_at: new Date(Date.now() - 30 * 1000).toISOString(),
    sender_name: 'River',
  },
];

// ── Page size for infinite scroll ─────────────────────────────────────────────

const PAGE_SIZE = 50;
const AUTOSCROLL_BOTTOM_THRESHOLD = 80;

// ── Component ──────────────────────────────────────────────────────────────────

export default function ChatRoomScreen() {
  const route = useRoute<ChatRoomRoute>();
  const navigation = useNavigation<ChatRoomNav>();
  const { user } = useAuth();
  const themeColors = useThemeColors();
  const { t, i18n } = useTranslation('chat');
  const { t: tc } = useTranslation('common');

  const matchLanguage: 'en' | 'es' = i18n.language?.startsWith('es') ? 'es' : 'en';

  const rootRoomId = route.params.id;

  // ── State ──────────────────────────────────────────────────────────────────

  // Pre-entry incognito gate
  // The entry notice shows once per venue session: re-opening a minimized chat skips it.
  const venue = useVenueSession();
  const [entryVisible, setEntryVisible] = useState(() => venue.session?.roomId !== rootRoomId);
  // The entry/gate sheet is a native Modal: it floats above any screen pushed on top (e.g. the pick-up menu on iOS).
  const screenFocused = useIsFocused();
  const [incognitoState, setIncognitoState] = useState<IncognitoState>({ enabled: false, nickname: '' });
  const [incognitoError, setIncognitoError] = useState<string | undefined>(undefined);
  /** Locked after entering — cannot change mid-session. */
  const [enteredIncognito, setEnteredIncognito] = useState<IncognitoState | null>(null);

  // Room data
  const [room, setRoom] = useState<RoomData | null>(null);
  const [business, setBusiness] = useState<BusinessSummary | null>(null);
  // Kept separate from BusinessSummary (shared with ChatTopBar) — only the
  // geofence gate needs it, to detect the owner (épica geocerca Fase 3.2).
  const [businessOwnerId, setBusinessOwnerId] = useState<string | null>(null);
  // Kept separate — used to construct the WebView URL and routing.
  const [businessSlug, setBusinessSlug] = useState<string | null>(null);
  const [menuMode, setMenuMode] = useState<string | null>(null);
  const [externalMenuUrl, setExternalMenuUrl] = useState<string | null>(null);
  const [subRooms, setSubRooms] = useState<SubRoom[]>([]);
  // loadMessages staleness guards: latest request id and the room currently on screen.
  const loadSeqRef = useRef(0);
  const activeRoomIdRef = useRef(rootRoomId);
  const [activeRoomId, setActiveRoomId] = useState<string>(rootRoomId);
  activeRoomIdRef.current = activeRoomId;

  // Sub-room password
  const [pendingProtectedRoom, setPendingProtectedRoom] = useState<SubRoom | null>(null);
  const [passwordSheetVisible, setPasswordSheetVisible] = useState(false);
  const [unlockedRoomIds, setUnlockedRoomIds] = useState<Set<string>>(new Set());

  // Messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const oldestTimestampRef = useRef<string | null>(null);
  // Cache user_id → display name to resolve sender_name for realtime messages
  const userNameCacheRef = useRef<Map<string, string>>(new Map());
  // Cache user_id → avatar_url (null = no avatar) to resolve sender_avatar
  const userAvatarCacheRef = useRef<Map<string, string | null>>(new Map());
  const flatListRef = useRef<FlatList>(null);
  // Fullscreen photo viewer: the tapped image's URL (null = closed).
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  // With the inverted list, "near bottom" means scroll offset near 0 (newest).
  const isNearBottomRef = useRef(true);

  // Own name/avatar for presence (undefined until read, so presence is not published early).
  const [selfProfile, setSelfProfile] = useState<SelfProfile | undefined>(undefined);

  // Users related to me by a block (either direction): their messages and presence are hidden.
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  // Users optimistically hidden after remove/ban (presence sync catches up).
  const [hiddenUserIds, setHiddenUserIds] = useState<Set<string>>(new Set());

  // UserActionSheet
  const [userSheet, setUserSheet] = useState<{
    visible: boolean;
    userId: string;
    userName: string;
  }>({ visible: false, userId: '', userName: '' });

  // UserQuickCard (tap on avatar/name → anchored popover)
  const [quickCard, setQuickCard] = useState<{
    visible: boolean;
    userId: string;
    userName: string;
    anchor: UserAnchor;
  }>({ visible: false, userId: '', userName: '', anchor: { x: 0, y: 0, width: 0, height: 0 } });

  // Loading state
  const [initialLoading, setInitialLoading] = useState(true);

  // ── Theme (follows the active sub-room) ─────────────────────────────────────

  const activeSubRoomData = subRooms.find((r) => r.id === activeRoomId) ?? null;
  const chatTheme = getChatTheme(activeSubRoomData?.chat_theme_id ?? room?.chat_theme_id ?? 1);

  // ── Multi-room presence (main + anchor + visited) ───────────────────────────

  const anchorRoomId = rootRoomId;
  const mainRoomId = subRooms.find((r) => r.is_main)?.id;

  const { presenceByRoom } = usePresenceChannels({
    mainRoomId,
    anchorRoomId,
    activeRoomId,
    user,
    selfProfile,
    enteredIncognito,
    entryVisible,
  });

  // ── Geofence gate (regla de oro — épica geocerca Fase 3.2) ─────────────────
  // UX only: the real barrier is server-side (check_geofence_and_join_room +
  // can_access_room, Fase 3.1). Gated on the entry room (rootRoomId) — a
  // known limitation is that switching to a sub-room with a different
  // room_id is not separately geo-gated by this hook (flagged, not fixed
  // here per spec scope; see the session report).
  const isOwner = !!user?.id && !!businessOwnerId && user.id === businessOwnerId;

  const handleExpelled = useCallback(() => {
    Alert.alert(t('chatRoom.errorTitle'), t('chatRoom.geoRemoved', { business: business?.name ?? '' }));
    venue.endSession('user'); // already told the user above
    navigation.goBack();
  }, [t, business, navigation, venue]);

  const geoGate = useGeofenceGate({
    roomId: rootRoomId,
    isOwner,
    entered: !entryVisible,
    onExpelled: handleExpelled,
  });

  // ── Match (Fase D1): availability, entry-notice state and presence heartbeat ──────────────
  const matchBusinessId = room?.business_id ?? null;
  const [matchAvailable, setMatchAvailable] = useState(false);
  const [matchGames, setMatchGames] = useState<GameRow[]>([]);
  const [gamesEnabled, setGamesEnabled] = useState(true);
  const [matchOptInValue, setMatchOptInValue] = useState(true);
  const [matchNoticeFull, setMatchNoticeFull] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !matchBusinessId || !user?.id) return;
    let alive = true;
    void Promise.all([
      isMatchEnabledForBusiness(matchBusinessId),
      fetchGames(),
      loadUserSettings(user.id),
      hasSeenMatchNotice(matchBusinessId),
      getMatchOptIn(matchBusinessId),
    ])
      .then(([available, games, settings, seen, optIn]) => {
        if (!alive) return;
        setMatchAvailable(available);
        setMatchGames(games);
        setGamesEnabled(settings.gamesEnabled ?? true);
        setMatchNoticeFull(!seen);
        setMatchOptInValue(optIn);
      })
      .catch(() => {
        if (alive) setMatchAvailable(false); // fail closed: no Match UI if we can't confirm
      });
    return () => {
      alive = false;
    };
  }, [matchBusinessId, user?.id]);

  const handleGamesEnabledChange = useCallback((value: boolean) => {
    setGamesEnabled(value);
    updateMySettings({ gamesEnabled: value }).catch(() => setGamesEnabled(!value));
  }, []);

  // The owner has no geofence reading (the gate skips them), so they don't join Match.
  const matchActive = matchAvailable && gamesEnabled && matchOptInValue;
  useMatchPresence({
    businessId: matchBusinessId,
    roomId: rootRoomId,
    enabled: !entryVisible && matchActive && !isOwner,
    reading: geoGate.lastCoords,
  });

  // The venue session owns the heartbeat while the chat is minimized; tell it when the chat is open.
  const sessionRoomId = venue.session?.roomId ?? null;
  const { setChatMounted, setMatchActive } = venue;
  useEffect(() => {
    if (entryVisible || sessionRoomId !== rootRoomId) return;
    setChatMounted(true);
    return () => setChatMounted(false);
  }, [entryVisible, sessionRoomId, rootRoomId, setChatMounted]);
  useEffect(() => {
    if (sessionRoomId === rootRoomId) setMatchActive(matchActive);
  }, [matchActive, sessionRoomId, rootRoomId, setMatchActive]);

  // Games panel / ⋯ menu / QR (Fase D1). Hidden for the owner (no geofence reading → not in Match).
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const gamesAvailable = matchActive && !isOwner;
  const panelGames = useMemo(
    () =>
      matchGames
        .filter((g) => g.key === 'match')
        .map((g) => ({ key: g.key, name: matchLanguage === 'es' ? g.name_es : g.name_en })),
    [matchGames, matchLanguage],
  );

  const handleGamePress = useCallback(
    (key: string) => {
      if (key !== 'match' || !matchBusinessId) return;
      navigation.navigate('MatchHome', { businessId: matchBusinessId, businessName: business?.name });
    },
    [navigation, matchBusinessId, business?.name],
  );

  const handleQrToken = useCallback((token: string) => {
    setQrScannerVisible(false);
    void matchCheckInWithQr(token);
  }, []);

  // 🔔 notifications sheet + ⋯ options sheet (replace the old native Alert).
  const [bellOpen, setBellOpen] = useState(false);
  // 🎁 Gift (from the quick card / user sheet): only offered while both are present at the venue.
  const [giftTarget, setGiftTarget] = useState<{ id: string; name: string } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const { notifications: allNotifications, unreadCount, markRead: markNotificationRead } = useNotifications({ passive: true });
  const { pinnedOrders } = useOrdersBar();
  const { visible: visibleNotifications, textFor: notificationTextFor } = useNotificationPresenter(allNotifications);

  const quickGift = useGiftAvailable(quickCard.visible ? quickCard.userId : null);
  const sheetGift = useGiftAvailable(userSheet.visible ? userSheet.userId : null);

  const handleOpenNotificationRoute = useCallback(
    (route: NotificationRoute) =>
      openNotificationRoute(navigation as unknown as { navigate: (screen: string, params?: unknown) => void }, route),
    [navigation],
  );

  // "Salir del local" is the only way (besides leaving the area) to end the venue session.
  const handleLeaveVenue = useCallback(() => {
    Alert.alert(
      t('venueSession.leaveConfirmTitle'),
      t('venueSession.leaveConfirmBody', { business: business?.name ?? '' }),
      [
        { text: i18n.t('menu.cancel', { ns: 'match' }), style: 'cancel' },
        {
          text: t('venueSession.leave'),
          style: 'destructive',
          onPress: () => {
            void venue.leaveVenue().then(() => navigation.goBack());
          },
        },
      ],
    );
  }, [business?.name, navigation, i18n, t, venue]);

  // The online row shows the room on screen; demo mode falls back to demo users.
  const liveUsers = presenceByRoom[activeRoomId] ?? [];
  const usersInRoom = (isSupabaseConfigured ? liveUsers : DEMO_USERS).filter(
    (u) => !hiddenUserIds.has(u.id) && !blockedIds.has(u.id),
  );
  const activeCount = usersInRoom.length;

  // ── Block relations: loaded when entering the room and every time we come back ──
  const refreshBlocks = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      setBlockedIds(await getBlockRelations());
    } catch (err) {
      console.warn('[ChatRoom] block relations error:', err);
    }
  }, []);

  // ── Bans are enforced by the server; here the banned user is told and sent out ──
  const notifyBanned = useCallback(() => {
    Alert.alert(t('chatRoom.bannedTitle'), t('chatRoom.bannedMessage'));
  }, [t]);

  const checkBannedFromRoom = useCallback(
    async (roomId: string): Promise<boolean> => {
      if (!isSupabaseConfigured || !user?.id || isOwner) return false;
      try {
        const { data } = await supabase.rpc('is_banned_from_room', { p_room: roomId, p_user: user.id });
        return data === true;
      } catch {
        return false; // can't tell: the server still refuses what a ban forbids
      }
    },
    [user?.id, isOwner],
  );

  // On entering the room and on every return to it: refresh blocks and re-check the ban.
  useFocusEffect(
    useCallback(() => {
      if (entryVisible) return;
      void refreshBlocks();
      void checkBannedFromRoom(rootRoomId).then((banned) => {
        if (!banned) return;
        notifyBanned();
        navigation.goBack();
      });
    }, [entryVisible, refreshBlocks, checkBannedFromRoom, rootRoomId, notifyBanned, navigation]),
  );

  // Messages from blocked users never render: initial load, pagination and realtime all
  // go through this one filter.
  const visibleMessages = useMemo(
    () => (blockedIds.size === 0 ? messages : messages.filter((m) => !blockedIds.has(m.user_id))),
    [messages, blockedIds],
  );

  // ── Hide native header (we render our own ChatTopBar) ─────────────────────

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // ── Load room + business ───────────────────────────────────────────────────

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Demo mode
      setRoom({
        id: rootRoomId,
        business_id: DEMO_BUSINESS.id,
        parent_room_id: null,
        name: 'Main',
        chat_theme_id: 1,
        is_main: true,
        is_password_protected: false,
        sort: 0,
        description: null,
        check_in_enabled: true,
      });
      setBusiness(DEMO_BUSINESS);
      setSubRooms(DEMO_ROOMS);
      // Inverted list: newest first (demo data is oldest→newest, so reverse once).
      setMessages([...DEMO_MESSAGES].reverse());
      setInitialLoading(false);
      return;
    }

    void (async () => {
      try {
        // Load the room (could be a sub-room)
        const { data: roomData, error: roomErr } = await supabase
          .from('rooms')
          .select('id, business_id, parent_room_id, name, chat_theme_id, is_main, is_password_protected, sort, description')
          .eq('id', rootRoomId)
          .single();

        if (roomErr || !roomData) {
          Alert.alert(t('chatRoom.errorTitle'), t('chatRoom.roomNotFound'));
          navigation.goBack();
          return;
        }

        const typedRoom = roomData as RoomData;
        setRoom(typedRoom);
        setActiveRoomId(typedRoom.id);

        // Load business
        const { data: bizData } = await supabase
          .from('businesses')
          .select('id, name, icon_emoji, menu_enabled, owner_id, slug, menu_mode, external_menu_url')
          .eq('id', typedRoom.business_id)
          .single();

        if (bizData) {
          setBusiness(bizData as BusinessSummary);
          setBusinessOwnerId((bizData as { owner_id: string | null }).owner_id ?? null);
          setBusinessSlug((bizData as { slug: string | null }).slug ?? null);
          setMenuMode((bizData as { menu_mode: string | null }).menu_mode ?? null);
          setExternalMenuUrl((bizData as { external_menu_url: string | null }).external_menu_url ?? null);
        }

        // Load all the business's rooms (main + sub-rooms). RLS allows any
        // authenticated user to read rooms. Aligned with web (DISENO_SUBCHATS §1).
        const { data: subData } = await supabase
          .from('rooms')
          .select('id, name, is_main, is_password_protected, sort, chat_theme_id')
          .eq('business_id', typedRoom.business_id)
          .eq('is_active', true)
          .order('sort', { ascending: true });

        if (subData) {
          // is_main first, then by sort.
          const list = (subData as SubRoom[]).slice().sort((a, b) =>
            a.is_main !== b.is_main ? (a.is_main ? -1 : 1) : a.sort - b.sort,
          );
          setSubRooms(list);
        }

        setInitialLoading(false);
      } catch (err) {
        console.error('ChatRoomScreen load error:', err);
        setInitialLoading(false);
      }
    })();
  }, [rootRoomId, navigation, t]);

  // ── Load messages (initial page) ───────────────────────────────────────────

  const loadMessages = useCallback(async (roomId: string, before?: string) => {
    if (!isSupabaseConfigured) return;
    // A newer load, or a switch to another room, makes this response stale: drop it.
    const requestId = ++loadSeqRef.current;
    const isStale = () => requestId !== loadSeqRef.current || roomId !== activeRoomIdRef.current;
    setLoadingMessages(true);
    try {
      let query = supabase
        .from('messages')
        .select('id, room_id, user_id, body, type, media_url, metadata, is_system, created_at')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (before) {
        query = query.lt('created_at', before);
      }

      const { data, error } = await query;
      if (isStale()) return;
      if (error) {
        console.error('loadMessages error:', error);
        return;
      }
      const rows = data ?? [];

      // Resolver nombres de autores desde public_profiles (la RLS de `users` sólo
      // deja ver la propia fila; public_profiles es la fuente pública correcta).
      const uniqueUserIds = [...new Set(
        rows.map((r: Record<string, unknown>) => r.user_id).filter(Boolean) as string[]
      )];

      if (uniqueUserIds.length > 0) {
        const { data: profs } = await supabase
          .from('public_profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', uniqueUserIds);
        if (isStale()) return;
        for (const p of profs ?? []) {
          const nm = (p.display_name as string | null) ?? (p.username as string | null) ?? undefined;
          if (nm) userNameCacheRef.current.set(p.id as string, nm);
          userAvatarCacheRef.current.set(p.id as string, (p.avatar_url as string | null) ?? null);
        }
      }

      const msgs = rows.map((row: Record<string, unknown>) => {
        const senderName = typeof row.user_id === 'string'
          ? userNameCacheRef.current.get(row.user_id)
          : undefined;
        const senderAvatar = typeof row.user_id === 'string'
          ? userAvatarCacheRef.current.get(row.user_id) ?? undefined
          : undefined;
        return { ...row, sender_name: senderName, sender_avatar: senderAvatar } as unknown as ChatMessage;
      });
      setHasMore(msgs.length === PAGE_SIZE);
      if (msgs.length > 0) {
        // msgs is DESC (newest→oldest); the last element is the oldest of the page.
        oldestTimestampRef.current = msgs[msgs.length - 1]?.created_at ?? null;
      }

      // Inverted list keeps messages in DESC order (index 0 = newest = bottom).
      if (before) {
        // Older page → append at the END (older side, visually the top).
        setMessages((prev) => [...prev, ...msgs]);
      } else {
        setMessages(msgs);
      }
    } finally {
      if (requestId === loadSeqRef.current) setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (initialLoading || entryVisible) return;
    void loadMessages(activeRoomId);
  }, [activeRoomId, initialLoading, entryVisible, loadMessages]);

  // Sembrar el nombre propio en la caché (para envío optimista y para resolver
  // el bubble propio). public_profiles es legible por authenticated.
  useEffect(() => {
    if (!isSupabaseConfigured) { setSelfProfile({ name: null, avatarUrl: null }); return; }
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      let name: string | null = null;
      let avatarUrl: string | null = null;
      try {
        const { data: prof } = await supabase
          .from('public_profiles')
          .select('id, username, display_name, avatar_url')
          .eq('id', user.id)
          .maybeSingle();
        name = prof?.display_name ?? prof?.username ?? null;
        avatarUrl = prof?.avatar_url ?? null;
      } catch {
        // fall back to the translated generic name
      }
      if (cancelled) return;
      if (name) userNameCacheRef.current.set(user.id, name);
      userAvatarCacheRef.current.set(user.id, avatarUrl);
      // Presence waits for this: it is published once, with the real name.
      setSelfProfile({ name, avatarUrl });
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // ── Realtime subscription (messages) ──────────────────────────────────────
  const meId = user?.id;

  useEffect(() => {
    if (!isSupabaseConfigured || entryVisible) return;

    // Unique topic per subscription — see PinnedBanner: repeated topics return the
    // existing (already-subscribed) channel and .on() then throws. The filter below
    // does the real scoping, not the topic.
    const topic = `room-messages:${activeRoomId}:${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${activeRoomId}`,
        },
        (payload) => {
          const raw = payload.new as ChatMessage;
          const cachedName = userNameCacheRef.current.get(raw.user_id);
          const cachedAvatar = userAvatarCacheRef.current.get(raw.user_id);
          const newMsg: ChatMessage = cachedName
            ? { ...raw, sender_name: cachedName, sender_avatar: cachedAvatar ?? undefined }
            : raw;
          setMessages((prev) => {
            // Avoid duplicates. Inverted list → prepend (index 0 = newest = bottom).
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [newMsg, ...prev];
          });
          // With the inverted list a new message at index 0 appears at the bottom
          // automatically: if the user is at the bottom they see it; if they
          // scrolled up to read history, they are not yanked down.
          // If the name wasn't cached (message from a user we haven't seen yet),
          // resolve name + avatar from public_profiles and patch the message in place.
          if (!cachedName && raw.user_id) {
            void (async () => {
              const { data: prof } = await supabase
                .from('public_profiles')
                .select('id, username, display_name, avatar_url')
                .eq('id', raw.user_id)
                .maybeSingle();
              const nm = prof?.display_name ?? prof?.username ?? undefined;
              const av = prof?.avatar_url ?? null;
              if (nm) userNameCacheRef.current.set(raw.user_id, nm);
              userAvatarCacheRef.current.set(raw.user_id, av);
              if (nm) {
                setMessages((prev) =>
                  prev.map((m) => (m.id === raw.id ? { ...m, sender_name: nm, sender_avatar: av ?? undefined } : m)));
              }
            })();
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${activeRoomId}`,
        },
        (payload) => {
          // A moderator hid the message (migration 213): everyone but its author drops it from the list at once.
          const row = payload.new as { id?: string; user_id?: string; hidden_at?: string | null };
          if (row.hidden_at && row.id && row.user_id !== meId) {
            setMessages((prev) => prev.filter((m) => m.id !== row.id));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeRoomId, entryVisible, meId]);

  // Presence (main + anchor + visited) is owned by usePresenceChannels above.

  // ── Handlers ───────────────────────────────────────────────────────────────

  /**
   * Called when the user confirms entry (after incognito selection). For
   * non-owners this now also runs the geofence gate (permission → GPS →
   * RPC) before revealing the chat — the owner skips it entirely (Paso 1).
   */
  const handleEnter = useCallback(async () => {
    // Business (incl. owner_id) hasn't loaded yet — bail rather than risk a
    // false-negative owner check racing the fetch. Button is disabled below
    // while initialLoading anyway; this is the belt-and-suspenders guard.
    if (initialLoading) return;
    if (INCOGNITO_ENABLED && !isIncognitoValid(incognitoState)) {
      setIncognitoError(t('chatRoom.nicknameRequired'));
      return;
    }
    setIncognitoError(undefined);
    const granted = await geoGate.checkAndEnter();
    if (!granted) return; // stays on the entry gate; geoGate.gateStatus drives the message shown
    // Incognito is hidden (INCOGNITO_ENABLED): any stored choice counts as off.
    setEnteredIncognito(INCOGNITO_ENABLED ? incognitoState : null);
    if (matchBusinessId && matchAvailable) {
      void markMatchNoticeSeen(matchBusinessId);
      void setMatchOptIn(matchBusinessId, matchOptInValue);
      // Switching Match off at the entry notice = leaving the venue's Match (same RPC; idempotent).
      if (!matchOptInValue || !gamesEnabled) void matchLeaveVenue(matchBusinessId).catch(() => undefined);
    }
    // Start the venue session (one venue at a time: may ask "Switch to …?"). Owners don't have one.
    if (!isOwner && matchBusinessId) {
      const started = await venue.startSession({
        businessId: matchBusinessId,
        businessName: business?.name ?? '',
        roomId: rootRoomId,
        matchActive: matchAvailable && gamesEnabled && matchOptInValue,
      });
      if (!started) return; // declined to switch: stay at the gate
    }
    setEntryVisible(false);
  }, [incognitoState, t, geoGate, initialLoading, matchBusinessId, matchAvailable, matchOptInValue, gamesEnabled, isOwner, venue, business?.name, rootRoomId]);

  // "Not now" / back: never return into the order flow (it would loop with the order screens).
  const handleBack = useCallback(() => {
    goBackOrHome(navigation);
  }, [navigation]);

  // Golden rule: when the entry gate refuses (outside / no location), the person still gets the menu
  // and — only if the owner enabled it — pick-up orders. The server tells us whether pick-up exists.
  const gateRefused = geoGate.gateStatus !== 'idle' && geoGate.gateStatus !== 'checking';
  // No GPS fix (timeout / error) is not "you are outside": say so, with Retry.
  const noReading = geoGate.gateStatus === 'position_error';
  const [outsidePickup, setOutsidePickup] = useState(false);
  const refusedBusinessId = room?.business_id ?? null;
  useEffect(() => {
    if (!gateRefused || !refusedBusinessId) return;
    let alive = true;
    void fetchVenueAccess(refusedBusinessId, null).then((access) => {
      if (alive) setOutsidePickup(access.pickupEnabled);
    });
    return () => {
      alive = false;
    };
  }, [gateRefused, refusedBusinessId]);

  const handleMenuPress = useCallback(() => {
    if (!business || !room) return;
    if (menuMode === 'web' && businessSlug) {
      navigation.navigate('MenuWebPreview', {
        slug: businessSlug,
        businessName: business.name,
        businessId: room.business_id,
        roomId: activeRoomId,
      });
    } else if (menuMode === 'external' && externalMenuUrl) {
      void Linking.openURL(externalMenuUrl);
    } else {
      navigation.navigate('Menu', {
        businessId: room.business_id,
        roomId: activeRoomId,
        businessName: business.name,
        slug: businessSlug ?? undefined,
      });
    }
  }, [business, room, activeRoomId, businessSlug, menuMode, externalMenuUrl, navigation]);

  const handleServiceCall = useCallback(() => {
    setServiceSheetVisible(true);
  }, []);

  /**
   * A message insert failed: drop the optimistic bubble and tell the user why. A 42501
   * (RLS) may mean the owner muted them here; ask the server and, if so, say so without
   * offering a retry.
   */
  const handleSendFailure = useCallback(
    async (error: unknown, optimisticId: string, fallbackMessage?: string) => {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      const err = error as { code?: unknown; status?: unknown; statusCode?: unknown; message?: unknown } | null;
      // 42501 = RLS refused the insert; Storage reports the same refusal as HTTP 403.
      const forbidden =
        err?.code === '42501' ||
        err?.status === 403 ||
        err?.statusCode === '403' ||
        err?.statusCode === 403 ||
        (typeof err?.message === 'string' && /row-level security/i.test(err.message));
      if (forbidden && user?.id) {
        try {
          const { data: muted } = await supabase.rpc('is_muted_in_room', {
            p_room: activeRoomId,
            p_user: user.id,
          });
          if (muted === true) {
            Alert.alert(t('chatRoom.mutedTitle'), t('chatRoom.mutedMessage'));
            return;
          }
        } catch {
          // fall through to the generic error
        }
      }
      Alert.alert(t('chatRoom.errorTitle'), fallbackMessage ?? t('chatRoom.messageFailed'));
    },
    [user?.id, activeRoomId, t],
  );

  const handleSendText = useCallback(
    async (text: string) => {
      if (!user) return;

      const incognito = enteredIncognito;
      const meta: Record<string, unknown> = incognito?.enabled
        ? { incognito: true, nickname: incognito.nickname }
        : {};

      const optimisticId = `optimistic-${Date.now()}`;
      const optimistic: ChatMessage = {
        id: optimisticId,
        room_id: activeRoomId,
        user_id: user.id,
        body: text,
        type: 'text',
        media_url: null,
        metadata: meta,
        is_system: false,
        created_at: new Date().toISOString(),
        sender_name: incognito?.enabled
          ? incognito.nickname
          : (userNameCacheRef.current.get(user.id) ?? t('chatRoom.fallbackUserName')),
      };

      // Inverted list → prepend (index 0 = newest = bottom).
      setMessages((prev) => [optimistic, ...prev]);
      // Sender always jumps to the bottom (offset 0 in an inverted list).
      isNearBottomRef.current = true;
      setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 50);

      if (!isSupabaseConfigured) return;

      try {
        const { data, error } = await supabase.from('messages').insert({
          room_id: activeRoomId,
          user_id: user.id,
          body: text,
          type: 'text',
          metadata: meta,
          is_system: false,
        }).select('id, room_id, user_id, body, type, media_url, metadata, is_system, created_at').single();

        if (!error && data) {
          // Remove any Realtime-added copy that arrived before the insert resolved,
          // then replace the optimistic with the confirmed row.
          const confirmed = data as ChatMessage;
          setMessages((prev) =>
            prev
              .filter((m) => m.id !== confirmed.id)
              .map((m) => (m.id === optimisticId ? confirmed : m)),
          );
        } else {
          await handleSendFailure(error, optimisticId);
        }
      } catch (sendError) {
        await handleSendFailure(sendError, optimisticId);
      }
    },
    [user, activeRoomId, enteredIncognito, handleSendFailure],
  );

  const sendPhotoRef = useRef<((uri: string) => void) | null>(null);

  const handleSendPhoto = useCallback(
    async (uri: string) => {
      if (!user) return;

      const incognito = enteredIncognito;
      const meta: Record<string, unknown> = incognito?.enabled
        ? { incognito: true, nickname: incognito.nickname }
        : {};

      const optimisticId = `optimistic-photo-${Date.now()}`;
      const optimistic: ChatMessage = {
        id: optimisticId,
        room_id: activeRoomId,
        user_id: user.id,
        body: '',
        type: 'photo',
        media_url: uri,
        metadata: meta,
        is_system: false,
        created_at: new Date().toISOString(),
        sender_name: incognito?.enabled
          ? incognito.nickname
          : (userNameCacheRef.current.get(user.id) ?? t('chatRoom.fallbackUserName')),
      };

      // Inverted list → prepend (index 0 = newest = bottom).
      setMessages((prev) => [optimistic, ...prev]);
      // Sender always jumps to the bottom (offset 0 in an inverted list).
      isNearBottomRef.current = true;
      // The photo comes from a native picker/camera modal that is still
      // dismissing when we get here; a single 50ms scroll fires too early and is
      // lost. Fire it across a couple of frames AND after the dismiss settles
      // (~350ms) so the list actually lands on the new photo.
      const scrollPhotoToBottom = () =>
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      requestAnimationFrame(() => requestAnimationFrame(scrollPhotoToBottom));
      setTimeout(scrollPhotoToBottom, 350);

      if (!isSupabaseConfigured) return;

      try {
        // Upload first. If it fails NO message is created (a local file:// path must never
        // be stored in media_url): the optimistic bubble goes away and the user can retry.
        let publicUrl: string;
        try {
          publicUrl = await uploadImage(user.id, uri, 'post-media');
        } catch (uploadErr) {
          console.warn('[ChatRoom] photo upload failed:', uploadErr);
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
          Alert.alert(t('chatRoom.photoUploadFailedTitle'), t('chatRoom.photoUploadFailedMessage'), [
            { text: t('actions.cancel', { ns: 'common' }), style: 'cancel' },
            { text: t('chatRoom.retry'), onPress: () => { sendPhotoRef.current?.(uri); } },
          ]);
          return;
        }

        const { data, error } = await supabase.from('messages').insert({
          room_id: activeRoomId,
          user_id: user.id,
          body: '',
          type: 'photo',
          media_url: publicUrl,
          metadata: meta,
          is_system: false,
        }).select('id, room_id, user_id, body, type, media_url, metadata, is_system, created_at').single();

        if (!error && data) {
          const confirmed = data as ChatMessage;
          setMessages((prev) =>
            prev
              .filter((m) => m.id !== confirmed.id)
              .map((m) => (m.id === optimisticId ? confirmed : m)),
          );
          // Upload + insert done (the remote image swaps in here). Re-pin to the
          // newest message if the sender was still at the bottom, so the photo
          // lands even if the earlier scroll raced the picker dismissal.
          if (isNearBottomRef.current) {
            requestAnimationFrame(() =>
              flatListRef.current?.scrollToOffset({ offset: 0, animated: true }),
            );
          }
        } else {
          await handleSendFailure(error, optimisticId);
        }
      } catch (sendError) {
        await handleSendFailure(sendError, optimisticId);
      }
    },
    [user, activeRoomId, enteredIncognito, handleSendFailure, t],
  );
  sendPhotoRef.current = handleSendPhoto;

  // ── Voice note: upload to the private voice-notes bucket, then insert type 'voice' ─
  const handleSendVoice = useCallback(
    async (recording: VoiceRecording) => {
      if (!user) {
        void discardLocalRecording(recording.uri);
        return;
      }
      const incognito = enteredIncognito;
      const meta: Record<string, unknown> = {
        ...(incognito?.enabled ? { incognito: true, nickname: incognito.nickname } : {}),
        duration_s: recording.durationSec,
      };
      const optimisticId = `optimistic-voice-${Date.now()}`;
      const optimistic: ChatMessage = {
        id: optimisticId,
        room_id: activeRoomId,
        user_id: user.id,
        body: '',
        type: 'voice',
        media_url: null, // never the local file:// — the bubble shows a spinner until it is sent
        metadata: meta,
        is_system: false,
        created_at: new Date().toISOString(),
        sender_name: incognito?.enabled
          ? incognito.nickname
          : (userNameCacheRef.current.get(user.id) ?? t('chatRoom.fallbackUserName')),
      };
      setMessages((prev) => [optimistic, ...prev]);
      isNearBottomRef.current = true;
      requestAnimationFrame(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }));

      if (!isSupabaseConfigured) {
        void discardLocalRecording(recording.uri);
        return;
      }

      try {
        let path: string;
        try {
          path = await uploadRoomVoice(activeRoomId, user.id, recording.uri);
        } catch (uploadErr) {
          console.warn('[ChatRoom] voice upload failed:', uploadErr);
          await handleSendFailure(uploadErr, optimisticId, toUserMessage(uploadErr, 'errors:app.VOICE_UPLOAD_FAILED'));
          return;
        }

        const { data, error } = await supabase.from('messages').insert({
          room_id: activeRoomId,
          user_id: user.id,
          body: '',
          type: 'voice',
          media_url: path,
          metadata: meta,
          is_system: false,
        }).select('id, room_id, user_id, body, type, media_url, metadata, is_system, created_at').single();

        if (!error && data) {
          const confirmed = data as ChatMessage;
          setMessages((prev) =>
            prev
              .filter((m) => m.id !== confirmed.id)
              .map((m) => (m.id === optimisticId ? confirmed : m)),
          );
        } else {
          await handleSendFailure(error, optimisticId, toUserMessage(error, 'errors:app.VOICE_UPLOAD_FAILED'));
        }
      } catch (sendError) {
        await handleSendFailure(sendError, optimisticId, toUserMessage(sendError, 'errors:app.VOICE_UPLOAD_FAILED'));
      } finally {
        void discardLocalRecording(recording.uri);
      }
    },
    [user, activeRoomId, enteredIncognito, handleSendFailure, t],
  );

  // ── Sub-room switching ─────────────────────────────────────────────────────

  const handleSelectSubRoom = useCallback((subRoom: SubRoom) => {
    void (async () => {
      // A ban can be limited to one room: don't switch into a room the user is banned from.
      if (await checkBannedFromRoom(subRoom.id)) {
        notifyBanned();
        return;
      }
      setActiveRoomId(subRoom.id);
      oldestTimestampRef.current = null;
      isNearBottomRef.current = true;
      setMessages([]);
      setHasMore(true);
    })();
  }, [checkBannedFromRoom, notifyBanned]);

  const handleSelectProtectedSubRoom = useCallback((subRoom: SubRoom) => {
    setPendingProtectedRoom(subRoom);
    setPasswordSheetVisible(true);
  }, []);

  const handlePasswordSuccess = useCallback(() => {
    setPasswordSheetVisible(false);
    if (pendingProtectedRoom) {
      setUnlockedRoomIds((prev) => new Set([...prev, pendingProtectedRoom.id]));
      handleSelectSubRoom(pendingProtectedRoom);
      setPendingProtectedRoom(null);
    }
  }, [pendingProtectedRoom, handleSelectSubRoom]);

  const handlePasswordClose = useCallback(() => {
    setPasswordSheetVisible(false);
    setPendingProtectedRoom(null);
  }, []);

  // ── Long-press user ────────────────────────────────────────────────────────

  const handleCloseUserSheet = useCallback(() => {
    setUserSheet((prev) => ({ ...prev, visible: false }));
    void refreshBlocks(); // the sheet may have just blocked someone
  }, [refreshBlocks]);

  // ── Tap user → anchored quick card (long-press still opens the full sheet) ──
  const handleUserPress = useCallback(
    (userId: string, displayName: string, anchor: UserAnchor) => {
      // Your own avatar has no actions (follow / DM / block yourself): it opens your profile instead of doing nothing.
      if (userId === user?.id) {
        navigation.navigate('UserProfile', { userId });
        return;
      }
      setQuickCard({ visible: true, userId, userName: displayName, anchor });
    },
    [user?.id, navigation],
  );

  // Report: the card / action sheet hand the target over, then the reason picker opens
  // (after the closing sheet has gone, so iOS doesn't stack two modals).
  const [reportTarget, setReportTarget] = useState<{ type: 'user' | 'message'; id: string; name: string } | null>(null);
  const [reportVisible, setReportVisible] = useState(false);

  const handleStartReport = useCallback((userId: string, userName: string) => {
    setReportTarget({ type: 'user', id: userId, name: userName });
    setTimeout(() => setReportVisible(true), 350);
  }, []);

  // Long-press on a message of someone else → report / block (the pin option stays for owners and moderators).
  const [msgAction, setMsgAction] = useState<ChatMessage | null>(null);
  const msgActionName = msgAction
    ? (msgAction.sender_name ?? userNameCacheRef.current.get(msgAction.user_id) ?? t('chatRoom.fallbackUserName'))
    : '';

  const handleReportMessage = useCallback(() => {
    const m = msgAction;
    if (!m) return;
    setMsgAction(null);
    setReportTarget({ type: 'message', id: m.id, name: msgActionName });
    setTimeout(() => setReportVisible(true), 350);
  }, [msgAction, msgActionName]);

  const handleBlockAuthor = useCallback(() => {
    const m = msgAction;
    if (!m) return;
    setMsgAction(null);
    Alert.alert(tc('report.blockTitle', { name: msgActionName }), tc('report.blockMessage'), [
      { text: tc('actions.cancel'), style: 'cancel' },
      {
        text: tc('report.blockConfirm'),
        style: 'destructive',
        onPress: () => {
          void blockUser(m.user_id)
            .then(() => {
              // Their messages disappear right away; refreshBlocks makes it permanent for this session.
              setBlockedIds((prev) => new Set(prev).add(m.user_id));
              void refreshBlocks();
            })
            .catch(() => Alert.alert(tc('actions.errorTitle', { defaultValue: 'Error' }), tc('report.blockError')));
        },
      },
    ]);
  }, [msgAction, msgActionName, refreshBlocks, tc]);

  const handleCloseQuickCard = useCallback(() => {
    setQuickCard((p) => ({ ...p, visible: false }));
    void refreshBlocks(); // the card may have just blocked someone
  }, [refreshBlocks]);

  // Shared profile/DM handlers — reused by both UserActionSheet and UserQuickCard
  // (each caller closes its own surface first).
  const handleViewProfile = useCallback(
    (userId: string) => {
      navigation.navigate('UserProfile', { userId });
    },
    [navigation],
  );

  const handleStartDM = useCallback(
    async (userId: string) => {
      if (!user) return;
      try {
        // start_dm RPC applies the gate (block + whoCanDMMe) server-side.
        const conv = await getOrCreateConversation(user.id, userId);
        navigation.navigate('DMs', {
          screen: 'DMChat',
          params: { conversationId: conv.id, otherUserId: userId },
        });
      } catch (err) {
        if (err instanceof DmGateError) {
          Alert.alert(t('chatRoom.dmTitle'), err.message); // gated: blocked / nobody / not-follower
          return;
        }
        console.warn('[ChatRoom] start DM error', err);
        Alert.alert(t('chatRoom.errorTitle'), t('chatRoom.dmOpenError'));
      }
    },
    [user, navigation, t],
  );

  // ── Role resolution ────────────────────────────────────────────────────────

  // Only the business OWNER moderates from the app: the server (migration 179) lets only the
  // owner ban, mute, write moderation logs and pin messages.
  // TODO(staff-moderation): give employees with chat_moderate / chat_ban / chat_pin the
  // 'moderator' role once the server allows staff to do those things.
  const viewerRole: ViewerRole = isOwner ? 'owner' : 'user';

  // ── Chat permissions (offers_manage gate — migration 022) ──────────────────

  const [chatPermissions, setChatPermissions] = useState<ChatPermissions>(EMPTY_PERMISSIONS);

  useEffect(() => {
    // Demo mode: show all features without a backend call.
    if (!isSupabaseConfigured) {
      setChatPermissions((prev) => ({ ...prev, offers_manage: true }));
      return;
    }
    if (!room?.business_id || !user?.id) return;
    void getChatPermissions({ businessId: room.business_id, userId: user.id })
      .then(setChatPermissions);
  }, [room?.business_id, user?.id]);

  // ── Role badge map (Dueño / Staff) ────────────────────────────────────────

  const [roleMap, setRoleMap] = useState<Map<string, ChatRole>>(new Map());

  useEffect(() => {
    if (!room?.business_id) return;
    void getBusinessRoleMap(room.business_id).then(setRoleMap);
  }, [room?.business_id]);

  // ── Pin & Offer & Service sheets (Tasks 2.5 / 2.6 / Tanda C) ────────────────
  const [pinMsg, setPinMsg] = useState<ChatMessage | null>(null);
  const [offerVisible, setOfferVisible] = useState(false);
  const [serviceSheetVisible, setServiceSheetVisible] = useState(false);

  const handleLongPressMessage = useCallback(
    (m: ChatMessage) => {
      const canPin = viewerRole !== 'user';
      // Own and system messages: only the pin option, and only for owners / moderators (spec 2.5).
      if (m.is_system || m.user_id === user?.id) {
        if (canPin) setPinMsg(m);
        return;
      }
      setMsgAction(m);
    },
    [viewerRole, user?.id],
  );

  const sheetRooms = useMemo(
    () => subRooms.map((r) => ({ id: r.id, name: r.name })),
    [subRooms],
  );

  // ── Infinite scroll — load older on reaching the end (top, inverted) ───────

  const handleLoadOlder = useCallback(() => {
    if (!hasMore || loadingMessages || !isSupabaseConfigured) return;
    const before = oldestTimestampRef.current;
    if (before) {
      void loadMessages(activeRoomId, before);
    }
  }, [hasMore, loadingMessages, activeRoomId, loadMessages]);

  const handleMessageListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Inverted list: offset 0 is the bottom (newest). Near the bottom = small offset.
      isNearBottomRef.current =
        event.nativeEvent.contentOffset.y <= AUTOSCROLL_BOTTOM_THRESHOLD;
    },
    [],
  );

  // ── FlatList key extractor + render ───────────────────────────────────────

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <MessageBubble
        message={item}
        isOwn={item.user_id === user?.id}
        theme={chatTheme}
        authorRole={roleMap.get(item.user_id) ?? null}
        onPressUser={handleUserPress}
        onLongPressMessage={handleLongPressMessage}
        onImagePress={setViewerImage}
        onOrderNow={handleMenuPress}
      />
    ),
    [user?.id, chatTheme, roleMap, handleUserPress, handleLongPressMessage, handleMenuPress],
  );

  // ── Pre-entry incognito gate modal ─────────────────────────────────────────

  if (entryVisible) {
    return (
      <SafeAreaView style={[gateStyles.safeArea, { backgroundColor: themeColors.bgBase }]}>
        <Modal
          visible={screenFocused}
          transparent
          animationType="slide"
          onRequestClose={handleBack}
          statusBarTranslucent
        >
          <View style={gateStyles.overlay}>
            <View style={[gateStyles.sheet, { backgroundColor: themeColors.bgSurface, borderTopColor: themeColors.borderSubtle }]}>
              {/* Drag handle */}
              <View style={[gateStyles.handle, { backgroundColor: themeColors.borderSubtle }]} />

              {!gateRefused && (
                <>
                  {/* Business name / room title */}
                  <Text style={[gateStyles.roomTitle, { color: themeColors.textPrimary }]}>
                    {business?.icon_emoji ?? '🏪'}{' '}
                    {business?.name ?? t('chatRoom.chatRoomFallback')}
                  </Text>
                  <Text style={[gateStyles.roomSub, { color: themeColors.textSecondary }]}>
                    {t('chatRoom.gateSubtitle')}
                  </Text>

                  {/* Match entry notice — only where the owner enabled Match (fase D1) */}
                  {matchAvailable && (
                    <MatchEntryNotice
                      businessName={business?.name ?? t('chatRoom.chatRoomFallback')}
                      full={matchNoticeFull}
                      games={matchGames}
                      gamesEnabled={gamesEnabled}
                      onGamesEnabledChange={handleGamesEnabledChange}
                      matchOptIn={matchOptInValue}
                      onMatchOptInChange={setMatchOptInValue}
                      language={matchLanguage}
                    />
                  )}

                  {/* IncognitoToggle */}
                  {INCOGNITO_ENABLED && (
                    <IncognitoToggle
                      value={incognitoState}
                      onChange={setIncognitoState}
                      error={incognitoError}
                    />
                  )}
                </>
              )}

              {/* Enter button — or the geofence gate status/retry (épica geocerca Fase 3.2).
                  Disabled while initialLoading: owner detection needs business.owner_id
                  loaded first, so a fast tap can't race past it (see handleEnter's guard). */}
              {geoGate.gateStatus === 'idle' && (
                <Pressable
                  testID="chat-enter"
                  onPress={handleEnter}
                  disabled={initialLoading}
                  accessibilityRole="button"
                  accessibilityLabel={t('chatRoom.enterRoomA11y')}
                  style={({ pressed }) => [
                    gateStyles.enterBtn,
                    { backgroundColor: themeColors.brand, opacity: initialLoading ? 0.6 : 1 },
                    pressed && gateStyles.enterBtnPressed,
                  ]}
                >
                  <Text style={[gateStyles.enterBtnLabel, { color: themeColors.bgSurface }]}>
                    {matchAvailable ? t('entry.enter', { ns: 'match' }) : t('chatRoom.enterRoom')}
                  </Text>
                </Pressable>
              )}

              {geoGate.gateStatus === 'checking' && (
                <View style={gateStyles.geoStatus}>
                  <ActivityIndicator size="small" color={themeColors.brand} />
                  <Text style={[gateStyles.geoStatusText, { color: themeColors.textSecondary }]}>
                    {t('chatRoom.geoVerifying')}
                  </Text>
                </View>
              )}

              {gateRefused && (
                <View style={gateStyles.outsideWrap}>
                  <View style={[gateStyles.outsideIcon, { backgroundColor: themeColors.bgElevated }]}>
                    <IconMapPin size={30} color={themeColors.brand} strokeWidth={2} />
                  </View>
                  <Text style={[gateStyles.outsideTitle, { color: themeColors.textPrimary }]}>
                    {noReading
                      ? t('chatRoom.geoNoReadingTitle')
                      : t('chatRoom.geoOutsideTitle', { business: business?.name ?? t('chatRoom.chatRoomFallback') })}
                  </Text>
                  <Text style={[gateStyles.outsideBody, { color: themeColors.textSecondary }]}>
                    {geoGate.gateStatus === 'permission_denied'
                      ? t('chatRoom.geoPermissionNeeded')
                      : geoGate.gateStatus === 'outside_radius'
                        ? t('chatRoom.geoOutsideRadius', { distance: formatDistanceM(geoGate.outsideDistanceM ?? 0) })
                        : noReading
                          ? t('chatRoom.geoNoReadingBody')
                          : t('chatRoom.geoUnavailable')}
                  </Text>
                  <View style={gateStyles.outsideButtons}>
                    <Pressable
                      testID="chat-geo-retry"
                      onPress={handleEnter}
                      accessibilityRole="button"
                      style={({ pressed }) => [gateStyles.outsideBtn, { backgroundColor: themeColors.brand, opacity: pressed ? 0.82 : 1 }]}
                    >
                      <Text style={[gateStyles.outsideBtnLabel, { color: palette.onBrand }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                        {geoGate.gateStatus === 'permission_denied' ? t('chatRoom.geoAllowLocation') : t('chatRoom.geoRetry')}
                      </Text>
                    </Pressable>
                    <Pressable
                      testID="chat-geo-menu"
                      onPress={handleMenuPress}
                      accessibilityRole="button"
                      style={({ pressed }) => [gateStyles.outsideBtn, { borderWidth: 1, borderColor: themeColors.borderSubtle, opacity: pressed ? 0.82 : 1 }]}
                    >
                      <Text style={[gateStyles.outsideBtnLabel, { color: themeColors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                        {outsidePickup ? t('chatRoom.geoMenuAndPickup') : t('chatRoom.geoViewMenu')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Cancel */}
              <Pressable
                onPress={handleBack}
                hitSlop={8}
                accessibilityRole="button"
                style={gateStyles.cancelWrap}
              >
                <Text style={[gateStyles.cancelText, { color: themeColors.textSecondary }]}>
                  {matchAvailable || gateRefused ? t('entry.notNow', { ns: 'match' }) : t('actions.cancel', { ns: 'common' })}
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Background placeholder behind modal */}
        <View style={[gateStyles.bgPlaceholder, { backgroundColor: themeColors.bgBase }]}>
          {initialLoading && (
            <ActivityIndicator size="large" color={themeColors.brand} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (initialLoading) {
    return (
      <View style={[loadStyles.container, { backgroundColor: chatTheme.bg }]}>
        <ActivityIndicator size="large" color={chatTheme.accent} />
      </View>
    );
  }

  // ── Main chat UI ───────────────────────────────────────────────────────────

  // activeSubRoomData is derived near the top (drives the theme). Reuse it here.
  const isMainRoom = activeSubRoomData?.is_main ?? room?.is_main ?? true;

  return (
    <View style={[chatStyles.container, { backgroundColor: chatTheme.bg }]}>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <ChatTopBar
        business={business ?? DEMO_BUSINESS}
        activeCount={activeCount}
        theme={chatTheme}
        usersInRoom={usersInRoom}
        onBack={handleBack}
        onMenuPress={handleMenuPress}
        onBellPress={() => setBellOpen(true)}
        unreadCount={unreadCount}
        onMorePress={!entryVisible ? () => setMoreOpen(true) : undefined}
        onUserPress={handleUserPress}
      >
        {/* Sub-room tabs */}
        <SubRoomTabs
          rooms={subRooms}
          activeRoomId={activeRoomId}
          theme={chatTheme}
          unlockedRoomIds={unlockedRoomIds}
          onSelect={handleSelectSubRoom}
          onSelectProtected={handleSelectProtectedSubRoom}
        />
      </ChatTopBar>

      {/* Pinned banner — sticky below the sub-room tabs (Task 2.5). */}
      <PinnedBanner
        roomId={activeRoomId}
        theme={chatTheme}
        canUnpin={viewerRole !== 'user'}
      />

      {/* Geofence grace warning — left the radius, ~2 min to return (épica geocerca Fase 3.2). */}
      {geoGate.graceWarningVisible && (
        <View style={[chatStyles.geoGraceBanner, { backgroundColor: themeColors.warning }]}>
          <Text style={[chatStyles.geoGraceBannerText, { color: themeColors.bgSurface }]}>
            {t('chatRoom.geoGraceWarning', { business: business?.name ?? '' })}
            {geoGate.graceSecondsLeft != null ? ` (${formatGraceCountdown(geoGate.graceSecondsLeft)})` : ''}
          </Text>
        </View>
      )}
      {/* TODO(Task 2.5/2.6): wire PinMessageSheet (message long-press) + CreateOfferSheet
          (AttachmentPanel Offer) + OfferCard render in MessageBubble offer case. */}

      {/* ── Messages list ────────────────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={chatStyles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          inverted
          data={visibleMessages}
          keyExtractor={keyExtractor}
          renderItem={renderMessage}
          contentContainerStyle={chatStyles.listContent}
          showsVerticalScrollIndicator={false}
          onScroll={handleMessageListScroll}
          scrollEventThrottle={16}
          onScrollToIndexFailed={() => {
            // Safe no-op: we never call scrollToIndex, but guard against crashes.
          }}
          keyboardShouldPersistTaps="handled"
          // Inverted: data is DESC (index 0 = newest = bottom). The "end" of the
          // list is the top (older messages) → load older on onEndReached.
          onEndReached={handleLoadOlder}
          onEndReachedThreshold={0.2}
          // Inverted → the footer renders at the TOP, where older pages appear.
          ListFooterComponent={
            loadingMessages ? (
              <View style={chatStyles.loadingHeader}>
                <ActivityIndicator size="small" color={chatTheme.accent} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            !loadingMessages ? (
              <View style={chatStyles.emptyState}>
                <Text style={[chatStyles.emptyText, { color: chatTheme.tabInactive }]}>
                  {t('chatRoom.emptyState')}
                </Text>
              </View>
            ) : null
          }
        />

        {/* ── Check-in bar — only when enabled for the main room ───────── */}
        {isMainRoom && (room?.check_in_enabled ?? false) && (
          <View style={[chatStyles.checkInBar, { backgroundColor: chatTheme.topBg }]}>
            <CheckInButton
              enabled
              businessId={room?.business_id ?? DEMO_BUSINESS.id}
              roomId={activeRoomId}
              username={selfProfile?.name ?? undefined}
            />
          </View>
        )}

        {/* ── Chat input ───────────────────────────────────────────────── */}
        <ChatInput
          theme={chatTheme}
          onSendText={handleSendText}
          onSendPhoto={handleSendPhoto}
          onSendVoice={handleSendVoice}
          onMenuPress={handleMenuPress}
          onServiceCall={handleServiceCall}
          onOfferPress={() => setOfferVisible(true)}
          canCreateOffer={chatPermissions.offers_manage}
          gamesAvailable={gamesAvailable}
          games={panelGames}
          onGamePress={handleGamePress}
          onScanQr={() => setQrScannerVisible(true)}
        />
      </KeyboardAvoidingView>

      {/* ── Match venue QR scanner (instant presence) ────────────────────── */}
      <MatchQrScanner
        visible={qrScannerVisible}
        onToken={handleQrToken}
        onClose={() => setQrScannerVisible(false)}
      />

      {/* ── Password entry sheet ─────────────────────────────────────────── */}
      {pendingProtectedRoom && (
        <PasswordEntrySheet
          roomId={pendingProtectedRoom.id}
          visible={passwordSheetVisible}
          onSuccess={handlePasswordSuccess}
          onClose={handlePasswordClose}
        />
      )}

      {/* ── Fullscreen image viewer (pinch 1x–4x, double tap, tap outside / swipe down / X to close) ── */}
      <ImageViewerModal visible={viewerImage != null} uri={viewerImage} onClose={() => setViewerImage(null)} />

      {/* ── UserActionSheet ───────────────────────────────────────────────── */}
      <UserActionSheet
        visible={userSheet.visible}
        targetUserId={userSheet.userId}
        targetName={userSheet.userName}
        businessId={room?.business_id ?? DEMO_BUSINESS.id}
        roomId={activeRoomId}
        viewerRole={viewerRole}
        onViewProfile={(userId) => {
          handleCloseUserSheet();
          handleViewProfile(userId);
        }}
        onDM={(userId) => {
          handleCloseUserSheet();
          void handleStartDM(userId);
        }}
        giftAvailable={sheetGift.available}
        onSendGift={(userId, userName) => {
          handleCloseUserSheet();
          setGiftTarget({ id: userId, name: userName });
        }}
        onRemove={(userId) => {
          // Optimistically hide; presence sync catches up when they leave.
          setHiddenUserIds((prev) => new Set(prev).add(userId));
        }}
        onBanned={(userId) => {
          setHiddenUserIds((prev) => new Set(prev).add(userId));
        }}
        onReport={handleStartReport}
        onClose={handleCloseUserSheet}
      />

      {/* ── UserQuickCard (tap on avatar/name) ────────────────────────────── */}
      <UserQuickCard
        visible={quickCard.visible}
        targetUserId={quickCard.userId}
        targetName={quickCard.userName}
        anchor={quickCard.anchor}
        onViewProfile={handleViewProfile}
        onDM={handleStartDM}
        onOpenFull={(userId, userName) => {
          handleCloseQuickCard();
          setUserSheet({ visible: true, userId, userName });
        }}
        viewerIsOwner={viewerRole !== 'user'}
        giftAvailable={quickGift.available}
        onSendGift={(userId, userName) => {
          handleCloseQuickCard();
          setGiftTarget({ id: userId, name: userName });
        }}
        onReport={handleStartReport}
        onClose={handleCloseQuickCard}
      />

      {/* ── Report reason picker ──────────────────────────────────────────── */}
      <ReportReasonSheet
        visible={reportVisible}
        targetName={reportTarget?.name ?? ''}
        contentType={reportTarget?.type ?? 'user'}
        contentId={reportTarget?.id ?? ''}
        onClose={() => setReportVisible(false)}
      />

      {/* ── Long-press on a message of someone else: report / block ───────── */}
      <MessageActionSheet
        visible={msgAction !== null}
        authorName={msgActionName}
        onReport={handleReportMessage}
        onBlock={handleBlockAuthor}
        onPin={msgAction && viewerRole !== 'user' ? () => { const m = msgAction; setMsgAction(null); setPinMsg(m); } : undefined}
        onClose={() => setMsgAction(null)}
      />

      {/* ── Pin message sheet (Task 2.5) ──────────────────────────────────── */}
      {pinMsg && (
        <PinMessageSheet
          visible={!!pinMsg}
          message={{ id: pinMsg.id, previewText: (pinMsg.body ?? '').slice(0, 120) }}
          roomId={activeRoomId}
          rooms={sheetRooms}
          pinnedBy={user?.id ?? ''}
          theme={chatTheme}
          onClose={() => setPinMsg(null)}
          onPinned={() => {
            setPinMsg(null);
            void loadMessages(activeRoomId);
          }}
        />
      )}

      {/* ── Create offer sheet (Task 2.6) ─────────────────────────────────── */}
      <CreateOfferSheet
        visible={offerVisible}
        businessId={room?.business_id ?? DEMO_BUSINESS.id}
        roomId={activeRoomId}
        rooms={sheetRooms}
        createdBy={user?.id ?? ''}
        theme={chatTheme}
        onClose={() => setOfferVisible(false)}
        onCreated={() => {
          setOfferVisible(false);
          void loadMessages(activeRoomId);
        }}
      />

      {giftTarget && room?.business_id ? (
        <GiftSheet
          visible
          onClose={() => setGiftTarget(null)}
          businessId={room.business_id}
          recipient={giftTarget}
          onSent={() => {
            setGiftTarget(null);
            Alert.alert(t('gift.sentTitle'), t('gift.sentBody'));
          }}
        />
      ) : null}
      <ChatNotificationsSheet
        visible={bellOpen}
        onClose={() => setBellOpen(false)}
        notifications={visibleNotifications}
        textFor={notificationTextFor}
        onMarkRead={(id) => void markNotificationRead(id)}
        onOpenRoute={handleOpenNotificationRoute}
        pinnedOrders={pinnedOrders}
      />
      <ChatMoreSheet
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        isOwner={isOwner}
        inVenue={venue.session?.roomId === rootRoomId}
        onMyOrders={() => navigation.navigate('MyOrders')}
        onAskHelp={() => setServiceSheetVisible(true)}
        onLeaveVenue={handleLeaveVenue}
        onOwnerSettings={() => navigation.navigate('Settings')}
      />
      <ServiceCallSheet
        visible={serviceSheetVisible}
        roomId={activeRoomId}
        businessId={room?.business_id ?? DEMO_BUSINESS.id}
        userId={user?.id ?? ''}
        theme={chatTheme}
        onClose={() => setServiceSheetVisible(false)}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const gateStyles = StyleSheet.create({
  outsideWrap: { alignItems: 'center', gap: 12, paddingTop: 8 },
  outsideIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  outsideTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  outsideBody: { fontSize: 15, lineHeight: 21, textAlign: 'center', marginBottom: 4 },
  outsideButtons: { alignSelf: 'stretch', gap: 12 },
  outsideBtn: { alignSelf: 'stretch', minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  outsideBtnLabel: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  safeArea: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: palette.scrimMedium,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 48,
    gap: 16,
    maxHeight: '92%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  roomTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  roomSub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: -8,
  },
  enterBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    marginTop: 4,
  },
  enterBtnPressed: {
    opacity: 0.82,
  },
  enterBtnLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  cancelWrap: {
    alignItems: 'center',
    marginTop: -4,
  },
  cancelText: {
    fontSize: 15,
  },
  geoStatus: {
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  geoStatusText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  bgPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const loadStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const chatStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  geoGraceBanner: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  geoGraceBannerText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  flex: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
    flexGrow: 1,
    // justifyContent: 'flex-end' removed — for long content (> viewport) it has
    // no effect on scroll math but can cause subtle interference with scrollToEnd.
    // Short conversations look fine starting from the top; the app snaps to the
    // bottom via scrollToEnd on mount anyway.
  },
  loadingHeader: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
  checkInBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
