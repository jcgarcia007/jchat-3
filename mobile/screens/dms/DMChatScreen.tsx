/**
 * JChat 3.0 — DM Chat Screen (Task 1.12)
 *
 * Full direct-message chat between two users.
 *
 * Features:
 *   - Inverted FlatList showing newest messages at the bottom
 *   - In/out bubbles styled the same as chat rooms
 *   - Read receipts via single check (sent) / double check (read) marks
 *   - Text composer + photo picker (expo-image-picker) + voice note stub
 *   - Realtime subscription for incoming messages — unsubscribes on unmount
 *   - markRead called on screen open (stamps read_at on received messages)
 *
 * TODOs:
 *   - TODO(expo-av not installed): voice recording — stubbed with an alert
 *   - TODO(Task 1.13): respect read-receipts privacy setting before showing ticks
 *   - TODO(Task 1.13/1.15): filter blocked + DM-permission check
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import {
  IconArrowLeft,
  IconCheck,
  IconChecks,
  IconDots,
  IconGift,
  IconMicrophone,
  IconPhoto,
  IconSend,
} from '@tabler/icons-react-native';

import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { supabase, isSupabaseConfigured, channelTopic } from '../../services/supabase';
import {
  listMessages,
  markRead,
  sendMessage,
  uploadDmPhoto,
  resolveDmMediaUrl,
  type DmMessageRow,
} from '../../services/dms';
import type { DMStackParamList } from '../../navigation/DMStack';
import { VoiceBubble } from '../../components/common/VoiceBubble';
import { GiftCard } from '../../components/gift/GiftCard';
import { GiftSheet } from '../../components/gift/GiftSheet';
import { useGiftAvailable } from '../../hooks/useGiftAvailable';
import { VoiceRecorderBar } from '../../components/common/VoiceRecorderBar';
import type { VoiceRecording } from '../../components/common/VoiceRecorderBar';
import { discardLocalRecording, uploadDmVoice } from '../../services/voiceNotes';
import { isDmVoicePath } from '../../utils/mediaUrl';
import { toUserMessage } from '../../utils/errors';
import { useFollowSystem } from '../../hooks/useFollowSystem';
import { useMatchSafety } from '../../components/match/MatchSafety';
import { getChatMeta, isAwaitingReplyError } from '../../services/matchChat';
import type { ChatMeta } from '../../services/matchChat';
import { getMatchPresence } from '../../services/matchPresence';
import { safeLaunchLibrary } from '../../utils/safePicker';
import { checkMessage } from '../../utils/messageFilter';

// ─── Nav / Route types ───────────────────────────────────────────────────────

type ChatNav = NativeStackNavigationProp<DMStackParamList, 'DMChat'>;
type ChatRoute = RouteProp<DMStackParamList, 'DMChat'>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// ─── Bubble component ────────────────────────────────────────────────────────

interface BubbleProps {
  message: DmMessageRow;
  isOwn: boolean;
}

function MessageBubble({ message, isOwn }: BubbleProps) {
  const c = useThemeColors();
  const { t } = useTranslation('social');

  // Bubble colors mirror chatThemes "default" style
  const bubbleOutBg = palette.brand;
  const bubbleOutText = palette.onBrand;
  const bubbleInBg = c.bgElevated;
  const bubbleInText = c.textPrimary;

  const bg = isOwn ? bubbleOutBg : bubbleInBg;
  const textColor = isOwn ? bubbleOutText : bubbleInText;

  // dm-media is private → resolve the stored path to a short-lived signed URL.
  // Legacy/demo values that already carry a scheme are returned as-is.
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const raw = message.media_url;
    if (raw == null) {
      setMediaUri(null);
      return;
    }
    resolveDmMediaUrl(raw)
      .then((u) => { if (alive) setMediaUri(u); })
      .catch(() => { if (alive) setMediaUri(null); });
    return () => { alive = false; };
  }, [message.media_url]);

  // A gift card replaces the bubble (the 🎁 body is just a fallback for older clients).
  if (message.gift_offer_id) return <GiftCard offerId={message.gift_offer_id} />;

  return (
    <View
      style={[
        styles.bubbleWrapper,
        isOwn ? styles.bubbleWrapperOut : styles.bubbleWrapperIn,
      ]}
    >
      <View
        style={[
          styles.bubble,
          { backgroundColor: bg },
          isOwn ? styles.bubbleOut : styles.bubbleIn,
        ]}
      >
        {/* Text body */}
        {message.body != null && message.body.length > 0 && (
          <Text style={[styles.bubbleText, { color: textColor }]}>
            {message.body}
          </Text>
        )}

        {/* Media image (signed URL resolved from the private dm-media bucket) */}
        {mediaUri != null && (
          <Image
            source={{ uri: mediaUri }}
            style={styles.bubbleImage}
            resizeMode="cover"
          />
        )}

        {/* Voice note (private dm-media bucket; voice_url holds the storage PATH) */}
        {message.voice_url != null && (
          <VoiceBubble
            id={message.id}
            source={
              isDmVoicePath(message.voice_url, message.conversation_id)
                ? { bucket: 'dm-media', path: message.voice_url }
                : null
            }
            durationSec={message.voice_duration_s}
            textColor={textColor}
          />
        )}

        {/* Meta row: time + read receipt (own messages only) */}
        <View
          style={[
            styles.bubbleMeta,
            isOwn ? styles.bubbleMetaOut : styles.bubbleMetaIn,
          ]}
        >
          <Text
            style={[
              styles.bubbleTime,
              { color: isOwn ? palette.onImageMuted : c.textTertiary },
            ]}
          >
            {formatTime(message.created_at)}
          </Text>

          {/* TODO(Task 1.13): respect read-receipts privacy setting before showing ticks */}
          {isOwn && (
            <View style={styles.readReceipt}>
              {message.read_at ? (
                // Double check = read
                <IconChecks size={14} color={palette.onImageStrong} strokeWidth={2} />
              ) : (
                // Single check = delivered/sent
                <IconCheck size={14} color={palette.onImageMuted} strokeWidth={2} />
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function DMChatScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('social');
  const { t: tc } = useTranslation('common');
  const { t: tm } = useTranslation('match');
  const { t: tg } = useTranslation('chat');
  const insets = useSafeAreaInsets();
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setAndroidKeyboardHeight(Math.max(0, Dimensions.get('screen').height - e.endCoordinates.screenY)));
    const hide = Keyboard.addListener('keyboardDidHide', () => setAndroidKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const navigation = useNavigation<ChatNav>();
  const route = useRoute<ChatRoute>();
  const { user } = useAuth();

  const { conversationId } = route.params;

  const [messages, setMessages] = useState<DmMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState(route.params.prefill ?? '');
  const [sending, setSending] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Ephemeral Match chat (Fase D5) ───────────────────────────────────────────
  const [meta, setMeta] = useState<ChatMeta | null>(null);
  const loadMeta = useCallback(async () => {
    if (!user) return;
    setMeta(await getChatMeta(conversationId, user.id));
  }, [conversationId, user]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const isEphemeral = meta?.ephemeralBusinessId != null;

  // 🎁: only while both of us are present at my current venue (server verdict, re-asked on focus).
  const [giftTick, setGiftTick] = useState(0);
  useFocusEffect(useCallback(() => setGiftTick((n) => n + 1), []));
  const { available: giftAvailable, businessId: giftBusinessId } = useGiftAvailable(meta?.otherUserId, giftTick);
  const [giftOpen, setGiftOpen] = useState(false);
  // Real follow state with the other person; a mutual follow makes the chat permanent server-side.
  const follow = useFollowSystem(isEphemeral ? meta?.otherUserId : null);
  useEffect(() => {
    if (isEphemeral && !follow.loading) void loadMeta(); // relation changed → ephemeral flag may be gone
  }, [follow.relation, follow.loading, isEphemeral, loadMeta]);

  const safety = useMatchSafety({
    businessId: meta?.ephemeralBusinessId ?? '',
    roomId: getMatchPresence().roomId,
    targetUserId: meta?.otherUserId ?? null,
    targetName: meta?.otherName ?? '',
    onBlocked: () => navigation.goBack(),
  });

  // The first sender must wait for a reply (server rule); I'm waiting when I sent the first message.
  const waitingForReply = isEphemeral && meta?.awaitingReply === true && meta?.firstSenderId === user?.id;

  // ── Fetch messages ──────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    if (!user) return;
    try {
      const data = await listMessages(conversationId, user.id);
      // listMessages returns newest-first; FlatList is inverted so this is correct
      setMessages(data);
    } catch (err) {
      console.warn('[DMChat] fetch error', err);
    }
  }, [conversationId, user]);

  // ── Initial load + markRead ─────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;

    fetchMessages().finally(() => setLoading(false));

    // Mark received messages as read when the screen opens
    markRead(conversationId, user.id).catch((err) =>
      console.warn('[DMChat] markRead error', err),
    );
  }, [conversationId, user, fetchMessages]);

  // ── Realtime subscription ────────────────────────────────────────────────────

  useEffect(() => {
    if (!isSupabaseConfigured || !user) return;

    const channel = supabase
      .channel(channelTopic(`dm_chat_${conversationId}`))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dm_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as DmMessageRow;
          setMessages((prev) => [newMsg, ...prev]);
          // Their reply frees me; my first message puts me in "waiting" (ephemeral chats only).
          setMeta((m) => {
            if (!m || m.ephemeralBusinessId == null) return m;
            if (newMsg.sender_id !== user.id) return { ...m, awaitingReply: false };
            return m.firstSenderId == null ? { ...m, firstSenderId: user.id, awaitingReply: true } : m;
          });

          // If the message is from the other user, mark it read immediately
          if (newMsg.sender_id !== user.id) {
            markRead(conversationId, user.id).catch(() => {});
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      // Unsubscribe on unmount
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [conversationId, user]);

  // ── Send text ───────────────────────────────────────────────────────────────

  const handleSendText = useCallback(async () => {
    if (!user || text.trim().length === 0 || sending) return;
    const body = text.trim();
    if (!checkMessage(body).allowed) {
      Alert.alert(tc('contentFilter.title'), tc('contentFilter.blocked'));
      return; // the text stays in the box
    }
    setText('');
    setSending(true);
    try {
      await sendMessage({ conversationId, senderId: user.id, body });
    } catch (err) {
      console.warn('[DMChat] send error', err);
      if (isAwaitingReplyError(err)) {
        setMeta((m) => (m ? { ...m, firstSenderId: user.id, awaitingReply: true } : m));
        Alert.alert(t('dmChat.errorTitle'), tm('chat.waitingBody'));
      } else {
        Alert.alert(t('dmChat.errorTitle'), t('dmChat.sendTextError'));
      }
      setText(body); // restore on failure
    } finally {
      setSending(false);
    }
  }, [user, text, sending, conversationId, t, tm, tc]);

  // ── Pick & send photo ───────────────────────────────────────────────────────

  const handlePickPhoto = useCallback(async () => {
    if (!user) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        t('dmChat.permissionTitle'),
        t('dmChat.permissionMessage'),
      );
      return;
    }

    const result = await safeLaunchLibrary({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result || result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    // Upload to the PRIVATE dm-media bucket; store the returned path in media_url
    // (resolved to a signed URL on render). Path: {conversationId}/{uid}/{ts}_{rand}.jpg
    try {
      const path = await uploadDmPhoto(conversationId, user.id, asset.uri);
      await sendMessage({
        conversationId,
        senderId: user.id,
        mediaUrl: path,
      });
    } catch (err) {
      console.warn('[DMChat] photo send error', err);
      Alert.alert(t('dmChat.errorTitle'), t('dmChat.sendPhotoError'));
    }
  }, [user, conversationId, t]);

  // ── Voice note ──────────────────────────────────────────────────────────────

  const [recordingVoice, setRecordingVoice] = useState(false);

  const handleVoiceSend = useCallback(
    async (recording: VoiceRecording) => {
      setRecordingVoice(false);
      if (!user) {
        void discardLocalRecording(recording.uri);
        return;
      }
      try {
        // Upload to the PRIVATE dm-media bucket; store the PATH (never file://) in voice_url.
        const path = await uploadDmVoice(conversationId, user.id, recording.uri);
        await sendMessage({
          conversationId,
          senderId: user.id,
          voiceUrl: path,
          voiceDurationSeconds: recording.durationSec,
        });
      } catch (err) {
        console.warn('[DMChat] voice send error', err);
        Alert.alert(t('dmChat.errorTitle'), toUserMessage(err, 'errors:app.VOICE_UPLOAD_FAILED'));
      } finally {
        void discardLocalRecording(recording.uri);
      }
    },
    [user, conversationId, t],
  );
  const handleVoiceCancel = useCallback(() => setRecordingVoice(false), []);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.bgBase, paddingBottom: androidKeyboardHeight }]}
      // iOS: KeyboardAvoidingView. Android: the window is not resized (edge-to-edge) and KeyboardAvoidingView's
      // 'height' mode over-corrected and left a grey strip once the keyboard closed, so the keyboard height is
      // applied as bottom padding instead (androidKeyboardHeight).
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.bottom}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: c.bgSurface,
            borderBottomColor: c.borderSubtle,
            paddingTop: insets.top + 8,
          },
        ]}
      >
        <TouchableOpacity
          testID="dm-back"
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={tc('back')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconArrowLeft size={24} color={c.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.textPrimary }]} numberOfLines={1}>
          {meta?.otherName ?? t('dmChat.title')}
        </Text>
        {giftAvailable && giftBusinessId && meta?.otherUserId ? (
          <Pressable
            testID="dm-gift-button"
            onPress={() => setGiftOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={tg('gift.buttonA11y', { name: meta.otherName ?? '' })}
            style={styles.giftBtn}
          >
            <IconGift size={22} color={palette.brand} strokeWidth={2} />
          </Pressable>
        ) : null}
        {isEphemeral && (
          <>
            <Pressable
              onPress={() => void follow.follow()}
              disabled={follow.relation !== 'none' || follow.busy || follow.loading}
              accessibilityRole="button"
              style={[styles.followBtn, { borderColor: palette.brand, backgroundColor: follow.relation === 'none' ? palette.brand : 'transparent' }]}
            >
              <Text style={[styles.followBtnText, { color: follow.relation === 'none' ? palette.onBrand : palette.brand }]}>
                {follow.relation === 'following'
                  ? tm('chat.following')
                  : follow.relation === 'requested'
                    ? tm('chat.requested')
                    : tm('chat.follow')}
              </Text>
            </Pressable>
            <Pressable
              onPress={safety.openMenu}
              accessibilityRole="button"
              accessibilityLabel={tm('safety.menuTitle')}
              hitSlop={10}
              style={styles.moreBtn}
            >
              <IconDots size={22} color={c.textPrimary} />
            </Pressable>
          </>
        )}
      </View>

      {/* Permanent banner while the chat only exists inside the venue */}
      {isEphemeral && (
        <View style={[styles.ephemeralBanner, { backgroundColor: c.bgElevated, borderBottomColor: c.borderSubtle }]}>
          <Text style={[styles.ephemeralBannerText, { color: c.textSecondary }]}>
            {tm('chat.banner', { business: meta?.businessName ?? '' })}
          </Text>
        </View>
      )}

      {/* Messages */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.brand} />
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          inverted
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isOwn={item.sender_id === user?.id}
            />
          )}
          contentContainerStyle={styles.messageList}
          ListEmptyComponent={
            <View style={styles.emptyCenter}>
              <Text style={[styles.emptyText, { color: c.textTertiary }]}>
                {t('dmChat.sayHello')}
              </Text>
            </View>
          }
        />
      )}

      {/* Composer — replaced by the voice recorder while recording */}
      {recordingVoice ? (
        <View style={{ paddingBottom: insets.bottom, backgroundColor: c.bgSurface }}>
          <VoiceRecorderBar
            onSend={(rec) => void handleVoiceSend(rec)}
            onCancel={handleVoiceCancel}
            textColor={c.textPrimary}
            accentColor={palette.brand}
            backgroundColor={c.bgSurface}
            borderColor={c.borderSubtle}
          />
        </View>
      ) : (
      <View
        style={[
          styles.composer,
          {
            backgroundColor: c.bgSurface,
            borderTopColor: c.borderSubtle,
            paddingBottom: (androidKeyboardHeight > 0 ? 0 : insets.bottom) + 8,
          },
        ]}
      >
        {/* Photo picker */}
        <TouchableOpacity
          testID="dm-photo"
          accessibilityRole="button"
          accessibilityLabel={t('dmChat.sendPhotoA11y')}
          style={styles.composerIconBtn}
          onPress={handlePickPhoto}
          disabled={waitingForReply}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconPhoto size={22} color={c.textSecondary} strokeWidth={2} />
        </TouchableOpacity>

        {/* Voice note */}
        <TouchableOpacity
          style={styles.composerIconBtn}
          onPress={() => setRecordingVoice(true)}
          disabled={waitingForReply}
          accessibilityRole="button"
          accessibilityLabel={tc('voice.record')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconMicrophone size={22} color={c.textSecondary} strokeWidth={2} />
        </TouchableOpacity>

        {/* Text input */}
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: c.bgElevated,
              color: c.textPrimary,
              borderColor: c.borderSubtle,
            },
          ]}
          placeholder={waitingForReply ? tm('chat.waitingPlaceholder') : t('dmChat.placeholder')}
          placeholderTextColor={c.textTertiary}
          editable={!waitingForReply}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          returnKeyType="default"
        />

        {/* Send button */}
        <TouchableOpacity
          style={[
            styles.sendBtn,
            {
              backgroundColor:
                text.trim().length > 0 ? palette.brand : c.bgElevated,
              opacity: sending ? 0.6 : 1,
            },
          ]}
          testID="dm-send"
          accessibilityRole="button"
          accessibilityLabel={tc('sendMessage')}
          onPress={handleSendText}
          disabled={text.trim().length === 0 || sending || waitingForReply}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSend
            size={18}
            color={text.trim().length > 0 ? palette.onBrand : c.textTertiary}
            strokeWidth={2}
          />
        </TouchableOpacity>
      </View>
      )}
      {safety.sheets}
      {giftBusinessId && meta?.otherUserId ? (
        <GiftSheet
          visible={giftOpen}
          onClose={() => setGiftOpen(false)}
          businessId={giftBusinessId}
          recipient={{ id: meta.otherUserId, name: meta.otherName ?? '' }}
          conversationId={conversationId}
          onSent={() => {
            setGiftOpen(false);
            Alert.alert(tg('gift.sentTitle'), tg('gift.sentBody'));
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    marginRight: 12,
  },
  followBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  followBtnText: { fontSize: 13, fontWeight: '700' },
  moreBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  ephemeralBanner: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  ephemeralBannerText: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  giftBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageList: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emptyCenter: {
    // inverted list so "empty" shows at bottom; padding compensates
    paddingTop: 200,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
  },

  // Bubbles
  bubbleWrapper: {
    marginVertical: 3,
    maxWidth: '80%',
  },
  bubbleWrapperOut: {
    alignSelf: 'flex-end',
  },
  bubbleWrapperIn: {
    alignSelf: 'flex-start',
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bubbleOut: {
    borderBottomRightRadius: 4,
  },
  bubbleIn: {
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },
  bubbleImage: {
    width: 200,
    height: 160,
    borderRadius: 12,
    marginVertical: 4,
  },
  bubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  bubbleMetaOut: {
    justifyContent: 'flex-end',
  },
  bubbleMetaIn: {
    justifyContent: 'flex-start',
  },
  bubbleTime: {
    fontSize: 11,
  },
  readReceipt: {
    marginLeft: 4,
  },

  // Composer
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  composerIconBtn: {
    paddingBottom: 8,
  },
  textInput: {
    flex: 1,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: 15,
    maxHeight: 120,
    lineHeight: 20,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
});
