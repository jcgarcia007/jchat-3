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
 * Tap the avatar/name row → onPressUser callback (opens the anchored quick card).
 * Long-press the bubble    → future: message options (reply, copy, etc.)
 *
 * // TODO(Task 2.5): pinned banner is rendered by PinnedBanner, not here.
 * // TODO(Task 2.6): offer type renders OfferCard placeholder below.
 */

import React, { useCallback, useRef } from 'react';
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
import { useTranslation } from 'react-i18next';
import type { ChatTheme } from '../../theme/chatThemes';
import { palette } from '../../theme/tokens';
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

/** On-screen rectangle of a tapped avatar (window coords), used to anchor the quick card. */
export interface UserAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MessageBubbleProps {
  message: ChatMessage;
  /** Whether this message was sent by the current viewer. */
  isOwn: boolean;
  theme: ChatTheme;
  /** Role of the author in this business chat room. Hidden for incognito messages. */
  authorRole?: 'owner' | 'staff' | null;
  /**
   * Called with the sender's user_id + the avatar's on-screen rect when the
   * avatar/name area is TAPPED (opens the anchored quick card).
   */
  onPressUser?: (userId: string, displayName: string, anchor: UserAnchor) => void;
  /** Called when the message bubble itself is long-pressed (e.g. to pin). */
  onLongPressMessage?: (message: ChatMessage) => void;
  /** Called with a photo message's media_url when its image is tapped. */
  onImagePress?: (url: string) => void;
}

/** Build an Offer object from an offer message's metadata snapshot (Task 2.6). */
function offerFromMessage(message: ChatMessage, fallbackTitle: string): Offer {
  const meta = message.metadata;
  return {
    id: typeof meta.offer_id === 'string' ? meta.offer_id : message.id,
    title: typeof meta.title === 'string' ? meta.title : message.body ?? fallbackTitle,
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

function resolveDisplayName(message: ChatMessage, unknownName: string): string {
  const meta = message.metadata;
  if (meta.incognito === true && typeof meta.nickname === 'string' && meta.nickname.trim()) {
    return meta.nickname.trim();
  }
  return message.sender_name ?? unknownName;
}

function isIncognito(message: ChatMessage): boolean {
  return message.metadata.incognito === true;
}

// ── Bubble content variants ────────────────────────────────────────────────────

interface BubbleContentProps {
  message: ChatMessage;
  isOwn: boolean;
  theme: ChatTheme;
  onImagePress?: (url: string) => void;
}

function BubbleContent({ message, isOwn, theme, onImagePress }: BubbleContentProps) {
  const { t } = useTranslation('chat');
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
            <Pressable
              onPress={() => onImagePress?.(message.media_url!)}
              accessibilityRole="imagebutton"
              accessibilityLabel={t('bubble.openPhotoA11y')}
            >
              <Image
                source={{ uri: message.media_url }}
                style={styles.photoImage}
                resizeMode="cover"
                accessibilityLabel={t('bubble.photoA11y')}
              />
            </Pressable>
          ) : (
            <View style={styles.mediaPlaceholder}>
              <IconPhoto size={28} color={textColor} />
              <Text style={[styles.mediaLabel, { color: textColor }]}>{t('bubble.photo')}</Text>
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
              accessibilityLabel={t('bubble.gifA11y')}
            />
          ) : (
            <View style={styles.mediaPlaceholder}>
              <IconGif size={28} color={textColor} />
              <Text style={[styles.mediaLabel, { color: textColor }]}>{t('bubble.gif')}</Text>
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
            {t('bubble.voiceNote')}
            {typeof message.metadata.duration_s === 'number'
              ? ` · ${Math.round(message.metadata.duration_s as number)}s`
              : ''}
          </Text>
        </View>
      );

    case 'offer':
      return <OfferCard offer={offerFromMessage(message, t('bubble.offerFallback'))} theme={theme} />;

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
  authorRole,
  onPressUser,
  onLongPressMessage,
  onImagePress,
}: MessageBubbleProps) {
  const { t } = useTranslation('chat');
  const displayName = resolveDisplayName(message, t('bubble.unknownUser'));
  const incognito = isIncognito(message);
  const isOffer = message.type === 'offer';
  const avatarRef = useRef<View>(null);

  // Tap → measure the avatar rect (window coords) and open the anchored quick card.
  const handlePressUser = useCallback(() => {
    if (!onPressUser) return;
    const node = avatarRef.current;
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x, y, width, height) => {
        onPressUser(message.user_id, displayName, { x, y, width, height });
      });
    } else {
      onPressUser(message.user_id, displayName, { x: 0, y: 0, width: 0, height: 0 });
    }
  }, [onPressUser, message.user_id, displayName]);

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
          ref={avatarRef}
          onPress={handlePressUser}
          accessibilityRole="button"
          accessibilityLabel={t('bubble.userLongPressA11y', { name: displayName })}
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
          <Pressable
            onPress={handlePressUser}
            style={styles.senderNameRow}
          >
            <Text style={[styles.senderName, { color: theme.accent }]} numberOfLines={1}>
              {displayName}
              {incognito ? ' 🎭' : ''}
            </Text>
            {!incognito && authorRole != null && (
              <View
                style={[
                  styles.roleBadge,
                  authorRole === 'owner'
                    ? styles.roleBadgeOwner
                    : styles.roleBadgeStaff,
                ]}
              >
                <Text
                  style={[
                    styles.roleBadgeText,
                    authorRole === 'owner'
                      ? styles.roleBadgeTextOwner
                      : styles.roleBadgeTextStaff,
                  ]}
                >
                  {authorRole === 'owner' ? t('bubble.roleOwner') : t('bubble.roleStaff')}
                </Text>
              </View>
            )}
          </Pressable>
        )}

        {/* Bubble (offer messages render the full OfferCard with no bubble chrome) */}
        <Pressable onLongPress={handleLongPressMessage} delayLongPress={400}>
          {isOffer ? (
            <BubbleContent message={message} isOwn={isOwn} theme={theme} onImagePress={onImagePress} />
          ) : (
            <View style={[styles.bubble, { backgroundColor: bubbleBg }]}>
              <BubbleContent message={message} isOwn={isOwn} theme={theme} onImagePress={onImagePress} />
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

  senderNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    marginLeft: 4,
    marginBottom: 2,
    gap: 4,
  },

  senderName: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },

  roleBadge: {
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },

  roleBadgeOwner: {
    backgroundColor: `${palette.gold}26`,
  },

  roleBadgeStaff: {
    backgroundColor: `${palette.brand}26`,
  },

  roleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },

  roleBadgeTextOwner: {
    color: palette.gold,
  },

  roleBadgeTextStaff: {
    color: palette.brand,
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
