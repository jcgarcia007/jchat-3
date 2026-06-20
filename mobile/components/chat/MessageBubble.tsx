/**
 * JChat 3.0 — MessageBubble (Task 2.4)
 *
 * Renders a single chat message. Supports:
 *   text | photo | voice | gif | system | offer
 *
 * Incognito rule:
 *   When the sender is incognito (message.metadata.incognito === true),
 *   display only their nickname (message.metadata.nickname); never show
 *   real name or avatar.
 *
 * Long-press the avatar/name row → onLongPressUser callback (opens UserActionSheet).
 * Long-press the bubble         → future: message options (reply, copy, etc.)
 *
 * // TODO(Task 2.5): pinned banner is rendered by PinnedBanner, not here.
 * // TODO(Task 2.6): offer type renders OfferCard placeholder below.
 * // TODO(i18n)
 */

import React, { useCallback } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  IconMicrophone,
  IconGif,
  IconPhoto,
} from '@tabler/icons-react-native';
import type { ChatTheme } from '../../theme/chatThemes';
import { OfferCard } from './OfferCard';
import type { Offer } from './OfferCard';

// ── Types ──────────────────────────────────────────────────────────────────────

export type MessageType = 'text' | 'photo' | 'voice' | 'gif' | 'system' | 'offer';

export interface ChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  body: string | null;
  type: MessageType;
  media_url: string | null;
  metadata: Record<string, unknown>;
  is_system: boolean;
  created_at: string;
  /** Joined from users — may be absent for incognito senders */
  sender_name?: string;
  sender_avatar?: string;
}

export interface MessageBubbleProps {
  message: ChatMessage;
  /** Whether this message was sent by the current viewer. */
  isOwn: boolean;
  theme: ChatTheme;
  /** Called with the sender's user_id when avatar/name area is long-pressed. */
  onLongPressUser?: (userId: string, displayName: string) => void;
  /** Called when the message bubble itself is long-pressed (e.g. to pin). */
  onLongPressMessage?: (message: ChatMessage) => void;
}

/** Build an Offer object from an offer message's metadata snapshot (Task 2.6). */
function offerFromMessage(message: ChatMessage): Offer {
  const meta = message.metadata;
  return {
    id: typeof meta.offer_id === 'string' ? meta.offer_id : message.id,
    title: typeof meta.title === 'string' ? meta.title : message.body ?? 'Offer',
    discount: typeof meta.discount === 'string' ? meta.discount : null,
    description: typeof meta.description === 'string' ? meta.description : null,
    expires_at: typeof meta.expires_at === 'string' ? meta.expires_at : null,
    type: (meta.offer_type as Offer['type']) ?? null,
    min_purchase_cents:
      typeof meta.min_purchase_cents === 'number' ? meta.min_purchase_cents : null,
    created_by: typeof meta.created_by === 'string' ? meta.created_by : null,
    business_id: typeof meta.business_id === 'string' ? meta.business_id : '',
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function resolveDisplayName(message: ChatMessage): string {
  const meta = message.metadata;
  if (meta.incognito === true && typeof meta.nickname === 'string' && meta.nickname.trim()) {
    return meta.nickname.trim();
  }
  return message.sender_name ?? 'Unknown';
}

function isIncognito(message: ChatMessage): boolean {
  return message.metadata.incognito === true;
}

// ── Bubble content variants ────────────────────────────────────────────────────

interface BubbleContentProps {
  message: ChatMessage;
  isOwn: boolean;
  theme: ChatTheme;
}

function BubbleContent({ message, isOwn, theme }: BubbleContentProps) {
  const textColor = isOwn ? theme.bubbleOutText : theme.bubbleInText;

  switch (message.type) {
    case 'text':
      return (
        <Text style={[styles.bodyText, { color: textColor }]}>
          {message.body ?? ''}
        </Text>
      );

    case 'photo':
      return (
        <View>
          {message.media_url ? (
            <Image
              source={{ uri: message.media_url }}
              style={styles.photoImage}
              resizeMode="cover"
              accessibilityLabel="Photo message" // TODO(i18n)
            />
          ) : (
            <View style={styles.mediaPlaceholder}>
              <IconPhoto size={28} color={textColor} />
              <Text style={[styles.mediaLabel, { color: textColor }]}>Photo</Text>
            </View>
          )}
          {message.body ? (
            <Text style={[styles.bodyText, { color: textColor, marginTop: 6 }]}>
              {message.body}
            </Text>
          ) : null}
        </View>
      );

    case 'gif':
      return (
        <View>
          {message.media_url ? (
            <Image
              source={{ uri: message.media_url }}
              style={styles.gifImage}
              resizeMode="cover"
              accessibilityLabel="GIF message" // TODO(i18n)
            />
          ) : (
            <View style={styles.mediaPlaceholder}>
              <IconGif size={28} color={textColor} />
              <Text style={[styles.mediaLabel, { color: textColor }]}>GIF</Text>
            </View>
          )}
        </View>
      );

    case 'voice':
      // TODO(expo-av): render waveform + play button
      return (
        <View style={styles.voiceRow}>
          <IconMicrophone size={18} color={textColor} />
          <Text style={[styles.bodyText, { color: textColor }]}>
            Voice note
            {typeof message.metadata.duration_s === 'number'
              ? ` · ${Math.round(message.metadata.duration_s as number)}s`
              : ''}
          </Text>
        </View>
      );

    case 'offer':
      return <OfferCard offer={offerFromMessage(message)} theme={theme} />;

    case 'system':
    default:
      // System messages are handled by the parent list, but this is a safe fallback.
      return (
        <Text style={[styles.bodyText, { color: textColor, fontStyle: 'italic' }]}>
          {message.body ?? ''}
        </Text>
      );
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

export function MessageBubble({
  message,
  isOwn,
  theme,
  onLongPressUser,
  onLongPressMessage,
}: MessageBubbleProps) {
  const displayName = resolveDisplayName(message);
  const incognito = isIncognito(message);
  const isOffer = message.type === 'offer';

  const handleLongPressUser = useCallback(() => {
    if (onLongPressUser) {
      onLongPressUser(message.user_id, displayName);
    }
  }, [onLongPressUser, message.user_id, displayName]);

  const handleLongPressMessage = useCallback(() => {
    onLongPressMessage?.(message);
  }, [onLongPressMessage, message]);

  // System messages render centered with no bubble (offer messages are NOT system).
  if ((message.is_system || message.type === 'system') && !isOffer) {
    return (
      <View style={styles.systemRow} accessibilityRole="text">
        <Text style={[styles.systemText, { color: theme.tabInactive }]}>
          {message.body ?? ''}
        </Text>
      </View>
    );
  }

  const bubbleBg = isOwn ? theme.bubbleOutBg : theme.bubbleInBg;

  return (
    <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
      {/* Avatar — hidden for incognito senders */}
      {!isOwn && (
        <Pressable
          onLongPress={handleLongPressUser}
          delayLongPress={400}
          accessibilityRole="button"
          accessibilityLabel={`Long press for actions on ${displayName}`} // TODO(i18n)
          style={styles.avatarWrap}
        >
          {!incognito && message.sender_avatar ? (
            <Image
              source={{ uri: message.sender_avatar }}
              style={[styles.avatar, { borderColor: theme.border }]}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.bubbleInBg, borderColor: theme.border }]}>
              <Text style={[styles.avatarInitial, { color: theme.bubbleInText }]}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </Pressable>
      )}

      <View style={[styles.bubbleCol, isOwn ? styles.bubbleColOwn : styles.bubbleColOther]}>
        {/* Sender name row — only for others */}
        {!isOwn && (
          <Pressable onLongPress={handleLongPressUser} delayLongPress={400}>
            <Text style={[styles.senderName, { color: theme.accent }]} numberOfLines={1}>
              {displayName}
              {incognito ? ' 🎭' : ''}
            </Text>
          </Pressable>
        )}

        {/* Bubble (offer messages render the full OfferCard with no bubble chrome) */}
        <Pressable onLongPress={handleLongPressMessage} delayLongPress={400}>
          {isOffer ? (
            <BubbleContent message={message} isOwn={isOwn} theme={theme} />
          ) : (
            <View style={[styles.bubble, { backgroundColor: bubbleBg }]}>
              <BubbleContent message={message} isOwn={isOwn} theme={theme} />
            </View>
          )}
        </Pressable>

        {/* Timestamp */}
        <Text style={[styles.timestamp, { color: theme.tabInactive }, isOwn && styles.timestampOwn]}>
          {formatTime(message.created_at)}
        </Text>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // System message
  systemRow: {
    alignItems: 'center',
    marginVertical: 6,
    paddingHorizontal: 24,
  },
  systemText: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Message row
  row: {
    flexDirection: 'row',
    marginVertical: 3,
    paddingHorizontal: 12,
    alignItems: 'flex-end',
    gap: 8,
  },
  rowOwn: {
    justifyContent: 'flex-end',
  },
  rowOther: {
    justifyContent: 'flex-start',
  },

  // Avatar
  avatarWrap: {
    marginBottom: 2,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 14,
    fontWeight: '700',
  },

  // Bubble column
  bubbleCol: {
    maxWidth: '72%',
    gap: 2,
  },
  bubbleColOwn: {
    alignItems: 'flex-end',
  },
  bubbleColOther: {
    alignItems: 'flex-start',
  },

  senderName: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
    marginBottom: 2,
  },

  bubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '100%',
  },

  // Text body
  bodyText: {
    fontSize: 15,
    lineHeight: 21,
  },

  // Timestamp
  timestamp: {
    fontSize: 10,
    marginHorizontal: 4,
    marginTop: 1,
  },
  timestampOwn: {
    textAlign: 'right',
  },

  // Photo
  photoImage: {
    width: 220,
    height: 165,
    borderRadius: 10,
  },

  // GIF
  gifImage: {
    width: 200,
    height: 150,
    borderRadius: 10,
  },

  // Media placeholder (when url missing)
  mediaPlaceholder: {
    width: 120,
    height: 80,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    opacity: 0.6,
  },
  mediaLabel: {
    fontSize: 12,
  },

  // Voice note
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Offer slot — TODO(Task 2.6)
  offerSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
