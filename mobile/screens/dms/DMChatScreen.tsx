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
 *   - TODO(i18n): all strings in English
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
  FlatList,
  Image,
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
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import {
  IconArrowLeft,
  IconCheck,
  IconChecks,
  IconMicrophone,
  IconPhoto,
  IconSend,
} from '@tabler/icons-react-native';

import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import {
  listMessages,
  markRead,
  sendMessage,
  uploadDmPhoto,
  resolveDmMediaUrl,
  type DmMessageRow,
} from '../../services/dms';
import type { DMStackParamList } from '../../navigation/DMStack';

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

  // Bubble colors mirror chatThemes "default" style
  const bubbleOutBg = palette.brand;
  const bubbleOutText = '#ffffff';
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

        {/* Voice note placeholder */}
        {message.voice_url != null && (
          <View style={styles.voiceRow}>
            <IconMicrophone size={16} color={textColor} strokeWidth={2} />
            <Text style={[styles.voiceLabel, { color: textColor }]}>
              Voice note
            </Text>
          </View>
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
              { color: isOwn ? 'rgba(255,255,255,0.7)' : c.textTertiary },
            ]}
          >
            {formatTime(message.created_at)}
          </Text>

          {/* TODO(Task 1.13): respect read-receipts privacy setting before showing ticks */}
          {isOwn && (
            <View style={styles.readReceipt}>
              {message.read_at ? (
                // Double check = read
                <IconChecks size={14} color="rgba(255,255,255,0.9)" strokeWidth={2} />
              ) : (
                // Single check = delivered/sent
                <IconCheck size={14} color="rgba(255,255,255,0.7)" strokeWidth={2} />
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
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<ChatNav>();
  const route = useRoute<ChatRoute>();
  const { user } = useAuth();

  const { conversationId } = route.params;

  const [messages, setMessages] = useState<DmMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Fetch messages ──────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    if (!user) return;
    try {
      const data = await listMessages(conversationId);
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
      .channel(`dm_chat_${conversationId}`)
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
    setText('');
    setSending(true);
    try {
      await sendMessage({ conversationId, senderId: user.id, body });
    } catch (err) {
      console.warn('[DMChat] send error', err);
      Alert.alert('Error', 'Failed to send message.'); // TODO(i18n)
      setText(body); // restore on failure
    } finally {
      setSending(false);
    }
  }, [user, text, sending, conversationId]);

  // ── Pick & send photo ───────────────────────────────────────────────────────

  const handlePickPhoto = useCallback(async () => {
    if (!user) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission required',
        'Allow photo access to send images.', // TODO(i18n)
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (result.canceled || result.assets.length === 0) return;

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
      Alert.alert('Error', 'Failed to send photo.'); // TODO(i18n)
    }
  }, [user, conversationId]);

  // ── Voice note stub ─────────────────────────────────────────────────────────

  const handleVoiceNote = useCallback(() => {
    // TODO(expo-av not installed): voice recording
    // When expo-av is available, implement record → stop → upload → sendMessage({voiceUrl})
    Alert.alert(
      'Voice notes',
      'Voice recording coming soon.', // TODO(i18n)
    );
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.bgBase }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconArrowLeft size={24} color={c.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.textPrimary }]} numberOfLines={1}>
          {/* TODO: load other user's display_name here */}
          Chat {/* TODO(i18n) */}
        </Text>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.brand} />
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
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
                Say hello! {/* TODO(i18n) */}
              </Text>
            </View>
          }
        />
      )}

      {/* Composer */}
      <View
        style={[
          styles.composer,
          {
            backgroundColor: c.bgSurface,
            borderTopColor: c.borderSubtle,
            paddingBottom: insets.bottom + 8,
          },
        ]}
      >
        {/* Photo picker */}
        <TouchableOpacity
          style={styles.composerIconBtn}
          onPress={handlePickPhoto}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconPhoto size={22} color={c.textSecondary} strokeWidth={2} />
        </TouchableOpacity>

        {/* Voice note */}
        <TouchableOpacity
          style={styles.composerIconBtn}
          onPress={handleVoiceNote}
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
          placeholder="Message…" // TODO(i18n)
          placeholderTextColor={c.textTertiary}
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
          onPress={handleSendText}
          disabled={text.trim().length === 0 || sending}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSend
            size={18}
            color={text.trim().length > 0 ? '#ffffff' : c.textTertiary}
            strokeWidth={2}
          />
        </TouchableOpacity>
      </View>
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
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  voiceLabel: {
    fontSize: 14,
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
