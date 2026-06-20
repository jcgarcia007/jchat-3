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
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { supabase, isSupabaseConfigured } from '../../services/supabase';
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
import { IncognitoToggle, isIncognitoValid } from '../../components/chat/IncognitoToggle';
import type { IncognitoState } from '../../components/chat/IncognitoToggle';
import { PasswordEntrySheet } from '../../components/chat/PasswordEntrySheet';
import { PinnedBanner } from '../../components/chat/PinnedBanner';
import { MapReactionButton } from '../../components/chat/MapReactionButton';
import { CheckInButton } from '../../components/chat/CheckInButton';
import { UserActionSheet } from '../../components/chat/UserActionSheet';
import type { ViewerRole } from '../../components/chat/UserActionSheet';

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
  { id: 'demo-main', name: 'Main', is_main: true, is_password_protected: false, sort: 0 },
  { id: 'demo-vip', name: 'VIP Lounge', is_main: false, is_password_protected: true, sort: 1 },
  { id: 'demo-bar', name: 'Bar', is_main: false, is_password_protected: false, sort: 2 },
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

  // Users in room
  const [usersInRoom, setUsersInRoom] = useState<UserSummary[]>([]);
  const [activeCount, setActiveCount] = useState(0);

  // UserActionSheet
  const [userSheet, setUserSheet] = useState<{
    visible: boolean;
    userId: string;
    userName: string;
  }>({ visible: false, userId: '', userName: '' });

  // Loading state
  const [initialLoading, setInitialLoading] = useState(true);

  // ── Theme ──────────────────────────────────────────────────────────────────

  const chatTheme = getChatTheme(room?.chat_theme_id ?? 1);

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
      setUsersInRoom(DEMO_USERS);
      setActiveCount(DEMO_USERS.length);
      setMessages(DEMO_MESSAGES);
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

        // Load sub-rooms (siblings + this room's children if main)
        const parentId = typedRoom.is_main ? typedRoom.id : (typedRoom.parent_room_id ?? typedRoom.id);
        const { data: subData } = await supabase
          .from('rooms')
          .select('id, name, is_main, is_password_protected, sort')
          .or(`id.eq.${parentId},parent_room_id.eq.${parentId}`)
          .order('sort');

        if (subData) {
          setSubRooms(subData as SubRoom[]);
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
        .select('id, room_id, user_id, body, type, media_url, metadata, is_system, created_at')
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
      const msgs = (data ?? []) as ChatMessage[];
      setHasMore(msgs.length === PAGE_SIZE);
      if (msgs.length > 0) {
        oldestTimestampRef.current = msgs[msgs.length - 1]?.created_at ?? null;
      }

      if (before) {
        // Prepend older messages
        setMessages((prev) => [...msgs.reverse(), ...prev]);
      } else {
        setMessages(msgs.reverse());
      }
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (initialLoading || entryVisible) return;
    void loadMessages(activeRoomId);
  }, [activeRoomId, initialLoading, entryVisible, loadMessages]);

  // ── Realtime subscription ──────────────────────────────────────────────────

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
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeRoomId, entryVisible]);

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
    if (!business) return;
    // TODO(Task 3.2): navigate to MenuScreen for business.id
    Alert.alert('Menu', `Opening menu for ${business.name}…`); // TODO(i18n)
  }, [business]);

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
        sender_name: incognito?.enabled ? incognito.nickname : (user.user_metadata?.username as string | undefined) ?? user.email ?? 'You',
      };

      setMessages((prev) => [...prev, optimistic]);

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
          // Replace optimistic with the real row
          setMessages((prev) =>
            prev.map((m) => (m.id === optimisticId ? (data as ChatMessage) : m)),
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
        body: null,
        type: 'photo',
        media_url: uri,
        metadata: meta,
        is_system: false,
        created_at: new Date().toISOString(),
        sender_name: incognito?.enabled ? incognito.nickname : (user.user_metadata?.username as string | undefined) ?? user.email ?? 'You',
      };

      setMessages((prev) => [...prev, optimistic]);

      if (!isSupabaseConfigured) return;

      try {
        // TODO(Storage): upload photo to Supabase Storage and get public URL before inserting
        // For now store the local URI; in production: upload → get URL → insert media_url
        const { data, error } = await supabase.from('messages').insert({
          room_id: activeRoomId,
          user_id: user.id,
          body: null,
          type: 'photo',
          media_url: uri,
          metadata: meta,
          is_system: false,
        }).select('id, room_id, user_id, body, type, media_url, metadata, is_system, created_at').single();

        if (!error && data) {
          setMessages((prev) =>
            prev.map((m) => (m.id === optimisticId ? (data as ChatMessage) : m)),
          );
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

  // ── Infinite scroll (load older on reaching top) ───────────────────────────

  const handleScrollTop = useCallback(() => {
    if (!hasMore || loadingMessages || !isSupabaseConfigured) return;
    const before = oldestTimestampRef.current;
    if (before) {
      void loadMessages(activeRoomId, before);
    }
  }, [hasMore, loadingMessages, activeRoomId, loadMessages]);

  // ── FlatList key extractor + render ───────────────────────────────────────

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <MessageBubble
        message={item}
        isOwn={item.user_id === user?.id}
        theme={chatTheme}
        onLongPressUser={handleUserLongPress}
      />
    ),
    [user?.id, chatTheme, handleUserLongPress],
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

  const activeSubRoomData = subRooms.find((r) => r.id === activeRoomId) ?? null;
  const isMainRoom = activeSubRoomData?.is_main ?? room?.is_main ?? true;

  return (
    <View style={[chatStyles.container, { backgroundColor: chatTheme.bg }]}>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <ChatTopBar
        business={business ?? DEMO_BUSINESS}
        activeCount={activeCount > 0 ? activeCount : usersInRoom.length}
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
          data={messages}
          keyExtractor={keyExtractor}
          renderItem={renderMessage}
          contentContainerStyle={chatStyles.listContent}
          showsVerticalScrollIndicator={false}
          // Newest at bottom — we render in ascending order
          // When list reaches the top (index 0 visible), load more
          onStartReached={handleScrollTop}
          onStartReachedThreshold={0.2}
          ListHeaderComponent={
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

        {/* ── Bottom action row (MapReaction + CheckIn) ─────────────────── */}
        <View style={[chatStyles.actionRow, { backgroundColor: chatTheme.topBg, borderTopColor: chatTheme.border }]}>
          <MapReactionButton
            businessId={room?.business_id ?? DEMO_BUSINESS.id}
            roomId={activeRoomId}
            inRoom
          />

          {/* Check-in — only for the main room */}
          {isMainRoom && (
            <CheckInButton
              enabled={room?.check_in_enabled ?? false}
              businessId={room?.business_id ?? DEMO_BUSINESS.id}
              roomId={activeRoomId}
            />
          )}
        </View>

        {/* ── Chat input ───────────────────────────────────────────────── */}
        <ChatInput
          theme={chatTheme}
          onSendText={handleSendText}
          onSendPhoto={handleSendPhoto}
          onOfferPress={() => {
            // TODO(Task 2.6): open CreateOfferSheet
            Alert.alert('Coming soon', 'Offer creation will be available soon.'); // TODO(i18n)
          }}
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
          setUsersInRoom((prev) => prev.filter((u) => u.id !== userId));
        }}
        onBanned={(userId) => {
          setUsersInRoom((prev) => prev.filter((u) => u.id !== userId));
        }}
        onClose={handleCloseUserSheet}
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
    justifyContent: 'flex-end',
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
});
