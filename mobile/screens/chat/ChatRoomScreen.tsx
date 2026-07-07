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
 *
 * // TODO(i18n)
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
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconX } from '@tabler/icons-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { getChatPermissions, EMPTY_PERMISSIONS, getBusinessRoleMap } from '../../services/permissions';
import type { ChatPermissions, ChatRole } from '../../services/permissions';
import { uploadImage } from '../../services/storage';
import { useAuth } from '../../context/AuthContext';
import { getChatTheme } from '../../theme/chatThemes';
import { useThemeColors } from '../../theme/colors';

import { ChatTopBar } from '../../components/chat/ChatTopBar';
import type { BusinessSummary, UserSummary } from '../../components/chat/ChatTopBar';
import { SubRoomTabs } from '../../components/chat/SubRoomTabs';
import type { SubRoom } from '../../components/chat/SubRoomTabs';
import { ChatInput } from '../../components/chat/ChatInput';
import { MessageBubble } from '../../components/chat/MessageBubble';
import type { ChatMessage } from '../../components/chat/MessageBubble';
import ImageView from 'react-native-image-viewing';
import { IncognitoToggle, isIncognitoValid } from '../../components/chat/IncognitoToggle';
import type { IncognitoState } from '../../components/chat/IncognitoToggle';
import { PasswordEntrySheet } from '../../components/chat/PasswordEntrySheet';
import { PinnedBanner } from '../../components/chat/PinnedBanner';
import { PinMessageSheet } from '../../components/chat/PinMessageSheet';
import { CreateOfferSheet } from '../../components/chat/CreateOfferSheet';
import { ServiceCallSheet } from '../../components/chat/ServiceCallSheet';
import { CheckInButton } from '../../components/chat/CheckInButton';
import { UserActionSheet } from '../../components/chat/UserActionSheet';
import type { ViewerRole } from '../../components/chat/UserActionSheet';
import { usePresenceChannels } from './usePresenceChannels';

import type { MainStackParamList } from '../../navigation/AppNavigator';

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

  const rootRoomId = route.params.id;

  // ── State ──────────────────────────────────────────────────────────────────

  // Pre-entry incognito gate
  const [entryVisible, setEntryVisible] = useState(true);
  const [incognitoState, setIncognitoState] = useState<IncognitoState>({ enabled: false, nickname: '' });
  const [incognitoError, setIncognitoError] = useState<string | undefined>(undefined);
  /** Locked after entering — cannot change mid-session. */
  const [enteredIncognito, setEnteredIncognito] = useState<IncognitoState | null>(null);

  // Room data
  const [room, setRoom] = useState<RoomData | null>(null);
  const [business, setBusiness] = useState<BusinessSummary | null>(null);
  const [subRooms, setSubRooms] = useState<SubRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string>(rootRoomId);

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
  const flatListRef = useRef<FlatList>(null);
  // Fullscreen photo viewer: the tapped image's URL (null = closed).
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  // Read once in the screen tree (under the app's SafeAreaProvider) and close
  // over it in the viewer's HeaderComponent — calling the hook inside the
  // library's Modal can return 0 on Android.
  const insets = useSafeAreaInsets();
  // With the inverted list, "near bottom" means scroll offset near 0 (newest).
  const isNearBottomRef = useRef(true);

  // Users optimistically hidden after remove/ban (presence sync catches up).
  const [hiddenUserIds, setHiddenUserIds] = useState<Set<string>>(new Set());

  // UserActionSheet
  const [userSheet, setUserSheet] = useState<{
    visible: boolean;
    userId: string;
    userName: string;
  }>({ visible: false, userId: '', userName: '' });

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
    enteredIncognito,
    entryVisible,
  });

  // The online row shows the room on screen; demo mode falls back to demo users.
  const liveUsers = presenceByRoom[activeRoomId] ?? [];
  const usersInRoom = (isSupabaseConfigured ? liveUsers : DEMO_USERS).filter(
    (u) => !hiddenUserIds.has(u.id),
  );
  const activeCount = usersInRoom.length;

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
          Alert.alert('Error', 'Room not found.'); // TODO(i18n)
          navigation.goBack();
          return;
        }

        const typedRoom = roomData as RoomData;
        setRoom(typedRoom);
        setActiveRoomId(typedRoom.id);

        // Load business
        const { data: bizData } = await supabase
          .from('businesses')
          .select('id, name, icon_emoji, menu_enabled')
          .eq('id', typedRoom.business_id)
          .single();

        if (bizData) {
          setBusiness(bizData as BusinessSummary);
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
  }, [rootRoomId, navigation]);

  // ── Load messages (initial page) ───────────────────────────────────────────

  const loadMessages = useCallback(async (roomId: string, before?: string) => {
    if (!isSupabaseConfigured) return;
    setLoadingMessages(true);
    try {
      let query = supabase
        .from('messages')
        .select('id, room_id, user_id, body, type, media_url, metadata, is_system, created_at, sender:users!messages_user_id_fkey(display_name, username)')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (before) {
        query = query.lt('created_at', before);
      }

      const { data, error } = await query;
      if (error) {
        console.error('loadMessages error:', error);
        return;
      }
      const msgs = (data ?? []).map((row: Record<string, unknown>) => {
        const sender = row.sender as { display_name: string | null; username: string } | null;
        const senderName = sender?.display_name ?? sender?.username ?? undefined;
        if (senderName && typeof row.user_id === 'string') {
          userNameCacheRef.current.set(row.user_id, senderName);
        }
        return { ...row, sender: undefined, sender_name: senderName } as unknown as ChatMessage;
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
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (initialLoading || entryVisible) return;
    void loadMessages(activeRoomId);
  }, [activeRoomId, initialLoading, entryVisible, loadMessages]);

  // ── Realtime subscription (messages) ──────────────────────────────────────

  useEffect(() => {
    if (!isSupabaseConfigured || entryVisible) return;

    const channel = supabase
      .channel(`room-messages:${activeRoomId}`)
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
          const senderName = userNameCacheRef.current.get(raw.user_id);
          const newMsg: ChatMessage = senderName ? { ...raw, sender_name: senderName } : raw;
          setMessages((prev) => {
            // Avoid duplicates. Inverted list → prepend (index 0 = newest = bottom).
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [newMsg, ...prev];
          });
          // With the inverted list a new message at index 0 appears at the bottom
          // automatically: if the user is at the bottom they see it; if they
          // scrolled up to read history, they are not yanked down.
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeRoomId, entryVisible]);

  // Presence (main + anchor + visited) is owned by usePresenceChannels above.

  // ── Handlers ───────────────────────────────────────────────────────────────

  /** Called when the user confirms entry (after incognito selection). */
  const handleEnter = useCallback(() => {
    if (!isIncognitoValid(incognitoState)) {
      setIncognitoError('Please enter a nickname to continue.'); // TODO(i18n)
      return;
    }
    setIncognitoError(undefined);
    setEnteredIncognito(incognitoState);
    setEntryVisible(false);
  }, [incognitoState]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleMenuPress = useCallback(() => {
    if (!business || !room) return;
    navigation.navigate('Menu', {
      businessId: room.business_id,
      roomId: activeRoomId,
      businessName: business.name,
    });
  }, [business, room, activeRoomId, navigation]);

  const handleServiceCall = useCallback(() => {
    setServiceSheetVisible(true);
  }, []);

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
          : (userNameCacheRef.current.get(user.id) ?? (user.user_metadata?.username as string | undefined) ?? user.email ?? 'You'),
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
          // Remove optimistic on failure
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
          Alert.alert('Error', 'Message failed to send.'); // TODO(i18n)
        }
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      }
    },
    [user, activeRoomId, enteredIncognito],
  );

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
          : (userNameCacheRef.current.get(user.id) ?? (user.user_metadata?.username as string | undefined) ?? user.email ?? 'You'),
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
        // Upload to Storage first; fall back to local URI on error so the
        // optimistic message stays visible even if upload fails.
        let publicUrl = uri;
        try {
          publicUrl = await uploadImage(user.id, uri, 'post-media');
        } catch (uploadErr) {
          console.warn('[ChatRoom] photo upload failed, using local URI:', uploadErr);
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
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        }
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      }
    },
    [user, activeRoomId, enteredIncognito],
  );

  // ── Sub-room switching ─────────────────────────────────────────────────────

  const handleSelectSubRoom = useCallback((subRoom: SubRoom) => {
    setActiveRoomId(subRoom.id);
    oldestTimestampRef.current = null;
    isNearBottomRef.current = true;
    setMessages([]);
    setHasMore(true);
  }, []);

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

  const handleUserLongPress = useCallback((userId: string, displayName: string) => {
    if (userId === user?.id) return; // Can't action yourself
    setUserSheet({ visible: true, userId, userName: displayName });
  }, [user?.id]);

  const handleCloseUserSheet = useCallback(() => {
    setUserSheet((prev) => ({ ...prev, visible: false }));
  }, []);

  // ── Role resolution ────────────────────────────────────────────────────────

  // TODO(Task 2.9): resolve viewer role from employees table.
  const viewerRole: ViewerRole = 'user';

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
      // Pin is Owner/Moderator only (spec 2.5).
      if (viewerRole !== 'user') setPinMsg(m);
    },
    [viewerRole],
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
        onLongPressUser={handleUserLongPress}
        onLongPressMessage={handleLongPressMessage}
        onImagePress={setViewerImage}
      />
    ),
    [user?.id, chatTheme, roleMap, handleUserLongPress, handleLongPressMessage],
  );

  // ── Pre-entry incognito gate modal ─────────────────────────────────────────

  if (entryVisible) {
    return (
      <SafeAreaView style={[gateStyles.safeArea, { backgroundColor: themeColors.bgBase }]}>
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={handleBack}
          statusBarTranslucent
        >
          <View style={gateStyles.overlay}>
            <View style={[gateStyles.sheet, { backgroundColor: themeColors.bgSurface, borderTopColor: themeColors.borderSubtle }]}>
              {/* Drag handle */}
              <View style={[gateStyles.handle, { backgroundColor: themeColors.borderSubtle }]} />

              {/* Business name / room title */}
              <Text style={[gateStyles.roomTitle, { color: themeColors.textPrimary }]}>
                {business?.icon_emoji ?? '🏪'}{' '}
                {business?.name ?? 'Chat Room'}
              </Text>
              <Text style={[gateStyles.roomSub, { color: themeColors.textSecondary }]}>
                {/* TODO(i18n) */}
                Choose how you want to appear before entering.
              </Text>

              {/* IncognitoToggle */}
              <IncognitoToggle
                value={incognitoState}
                onChange={setIncognitoState}
                error={incognitoError}
              />

              {/* Enter button */}
              <Pressable
                onPress={handleEnter}
                accessibilityRole="button"
                accessibilityLabel="Enter room" // TODO(i18n)
                style={({ pressed }) => [
                  gateStyles.enterBtn,
                  { backgroundColor: themeColors.brand },
                  pressed && gateStyles.enterBtnPressed,
                ]}
              >
                <Text style={[gateStyles.enterBtnLabel, { color: themeColors.bgSurface }]}>
                  Enter Room {/* TODO(i18n) */}
                </Text>
              </Pressable>

              {/* Cancel */}
              <Pressable
                onPress={handleBack}
                hitSlop={8}
                accessibilityRole="button"
                style={gateStyles.cancelWrap}
              >
                <Text style={[gateStyles.cancelText, { color: themeColors.textSecondary }]}>
                  Cancel {/* TODO(i18n) */}
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
        onUserLongPress={handleUserLongPress}
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
          data={messages}
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
                  {/* TODO(i18n) */}
                  No messages yet. Say hi! 👋
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
            />
          </View>
        )}

        {/* ── Chat input ───────────────────────────────────────────────── */}
        <ChatInput
          theme={chatTheme}
          onSendText={handleSendText}
          onSendPhoto={handleSendPhoto}
          onMenuPress={handleMenuPress}
          onServiceCall={handleServiceCall}
          onOfferPress={() => setOfferVisible(true)}
          canCreateOffer={chatPermissions.offers_manage}
        />
      </KeyboardAvoidingView>

      {/* ── Password entry sheet ─────────────────────────────────────────── */}
      {pendingProtectedRoom && (
        <PasswordEntrySheet
          roomId={pendingProtectedRoom.id}
          visible={passwordSheetVisible}
          onSuccess={handlePasswordSuccess}
          onClose={handlePasswordClose}
        />
      )}

      {/* ── Fullscreen image viewer (pinch-to-zoom + swipe-to-close) ──────── */}
      <ImageView
        images={viewerImage ? [{ uri: viewerImage }] : []}
        imageIndex={0}
        visible={viewerImage != null}
        onRequestClose={() => setViewerImage(null)}
        HeaderComponent={() => (
          <View
            style={{
              alignItems: 'flex-end',
              // react-native core SafeAreaView doesn't respect the Android status
              // bar; compute the top inset per-platform so the X never gets cut.
              paddingTop:
                Platform.OS === 'android'
                  ? (StatusBar.currentHeight ?? 24) + 8
                  : insets.top || 50,
            }}
          >
            <Pressable
              onPress={() => setViewerImage(null)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close image" // TODO(i18n)
              style={{
                margin: 12,
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: 'rgba(0,0,0,0.6)',
                borderWidth: 2,
                borderColor: 'rgba(255,255,255,0.5)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconX size={20} color="#fff" />
            </Pressable>
          </View>
        )}
      />

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
          // TODO: navigate to UserProfile screen
          Alert.alert('Profile', `View profile of ${userId}`); // TODO(i18n)
        }}
        onDM={(userId) => {
          handleCloseUserSheet();
          // TODO: navigate to DM screen
          Alert.alert('DM', `Open DM with ${userId}`); // TODO(i18n)
        }}
        onRemove={(userId) => {
          // Optimistically hide; presence sync catches up when they leave.
          setHiddenUserIds((prev) => new Set(prev).add(userId));
        }}
        onBanned={(userId) => {
          setHiddenUserIds((prev) => new Set(prev).add(userId));
        }}
        onClose={handleCloseUserSheet}
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
  safeArea: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 48,
    gap: 16,
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
