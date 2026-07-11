/**
 * JChat 3.0 — User quick card (tap on avatar/name in chat)
 *
 * Anchored popover shown when a user TAPS a sender's avatar/name (long-press still
 * opens the full UserActionSheet). Opaque card with a small arrow pointing at the
 * avatar; flips above/below depending on available space. Tap outside to close.
 *
 * Actions reuse the existing services (report/follow/block) and the parent's
 * profile/DM callbacks. "Mute" delegates to the full sheet (which owns the
 * duration selector) via onOpenFull.
 */

import React, { useCallback } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  IconUser,
  IconMessage,
  IconUserPlus,
  IconBell,
  IconFlag,
  IconBan,
} from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { reportUser } from '../../services/users';
import { requestOrFollow } from '../../services/follows';
import { blockUser } from '../../services/blocks';
import type { UserAnchor } from './MessageBubble';

const CARD_W = 264;
const CARD_H_EST = 176; // header + 2 grid rows — for the flip decision + above positioning
const ARROW_SIZE = 16;
const EDGE = 8;

interface UserQuickCardProps {
  visible: boolean;
  targetUserId: string;
  targetName: string;
  targetAvatar?: string;
  anchor: UserAnchor;
  onViewProfile: (userId: string) => void;
  onDM: (userId: string) => void;
  onOpenFull: (userId: string, userName: string) => void;
  onClose: () => void;
}

/** One grid cell: icon on top, label below. */
function Cell({
  icon,
  label,
  labelColor,
  borderColor,
  onPress,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  labelColor: string;
  borderColor: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.cell, !last && { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: borderColor }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon}
      <Text style={[styles.cellLabel, { color: labelColor }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function UserQuickCard({
  visible,
  targetUserId,
  targetName,
  targetAvatar,
  anchor,
  onViewProfile,
  onDM,
  onOpenFull,
  onClose,
}: UserQuickCardProps) {
  const c = useThemeColors();
  const { t } = useTranslation('chat');
  const { user } = useAuth();

  const { width: screenW, height: screenH } = Dimensions.get('window');

  // Flip: show below the avatar when there's room, else above.
  const spaceBelow = screenH - (anchor.y + anchor.height);
  const showBelow = spaceBelow > CARD_H_EST + ARROW_SIZE + EDGE;

  const centerX = anchor.x + anchor.width / 2;
  const cardLeft = Math.max(EDGE, Math.min(centerX - CARD_W / 2, screenW - CARD_W - EDGE));
  const cardTop = showBelow
    ? anchor.y + anchor.height + ARROW_SIZE / 2
    : Math.max(EDGE, anchor.y - CARD_H_EST - ARROW_SIZE / 2);
  // Arrow x relative to the card's left edge, clamped so it stays over the card.
  const arrowLeft = Math.max(
    12,
    Math.min(centerX - cardLeft - ARROW_SIZE / 2, CARD_W - 12 - ARROW_SIZE),
  );

  const bg = c.bgSurface;

  const handleProfile = useCallback(() => {
    onViewProfile(targetUserId);
    onClose();
  }, [onViewProfile, targetUserId, onClose]);

  const handleDM = useCallback(() => {
    onDM(targetUserId);
    onClose();
  }, [onDM, targetUserId, onClose]);

  const handleFollow = useCallback(() => {
    void (async () => {
      try {
        const res = await requestOrFollow(targetUserId);
        Alert.alert(
          t('quickCard.follow'),
          res === 'following' ? t('quickCard.followedMsg') : t('quickCard.requestedMsg'),
        );
      } catch {
        Alert.alert(t('quickCard.errorTitle'), t('quickCard.errorMsg'));
      }
      onClose();
    })();
  }, [targetUserId, t, onClose]);

  const handleReport = useCallback(() => {
    Alert.alert(t('quickCard.report'), t('quickCard.reportConfirm', { name: targetName }), [
      { text: t('actions.cancel', { ns: 'common' }), style: 'cancel' },
      {
        text: t('quickCard.report'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              if (user?.id) await reportUser(user.id, targetUserId, 'Reported from chat');
            } catch {
              Alert.alert(t('quickCard.errorTitle'), t('quickCard.errorMsg'));
            }
            onClose();
          })();
        },
      },
    ]);
  }, [t, targetName, targetUserId, user?.id, onClose]);

  const handleBlock = useCallback(() => {
    Alert.alert(t('quickCard.block'), t('quickCard.blockConfirm', { name: targetName }), [
      { text: t('actions.cancel', { ns: 'common' }), style: 'cancel' },
      {
        text: t('quickCard.block'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await blockUser(targetUserId);
            } catch {
              Alert.alert(t('quickCard.errorTitle'), t('quickCard.errorMsg'));
            }
            onClose();
          })();
        },
      },
    ]);
  }, [t, targetName, targetUserId, onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <View style={[styles.wrapper, { top: cardTop, left: cardLeft }]} pointerEvents="box-none">
          {/* Arrow above the card (card is below the avatar). Painted over by the card. */}
          {showBelow && (
            <View style={[styles.arrow, { backgroundColor: bg, left: arrowLeft, top: -ARROW_SIZE / 2 }]} />
          )}

          {/* Card. Its own Pressable swallows taps so the backdrop doesn't close it. */}
          <Pressable onPress={() => {}} style={[styles.card, { backgroundColor: bg }]}>
            <Pressable style={styles.header} onPress={handleProfile} accessibilityRole="button">
              {targetAvatar ? (
                <Image source={{ uri: targetAvatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: c.bgElevated }]}>
                  <Text style={[styles.avatarInitial, { color: c.textPrimary }]}>
                    {targetName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.headerText}>
                <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>
                  {targetName}
                </Text>
                <Text style={[styles.subtitle, { color: c.textSecondary }]} numberOfLines={1}>
                  {t('quickCard.tapForProfile')}
                </Text>
              </View>
            </Pressable>

            {/* Row 1 */}
            <View style={[styles.gridRow, { borderTopColor: c.borderSubtle }]}>
              <Cell borderColor={c.borderSubtle} labelColor={c.textPrimary} label={t('quickCard.profile')}
                icon={<IconUser size={18} color={c.textPrimary} strokeWidth={1.8} />} onPress={handleProfile} />
              <Cell borderColor={c.borderSubtle} labelColor={c.textPrimary} label={t('quickCard.dm')}
                icon={<IconMessage size={18} color={c.textPrimary} strokeWidth={1.8} />} onPress={handleDM} />
              <Cell borderColor={c.borderSubtle} labelColor={c.textPrimary} label={t('quickCard.follow')} last
                icon={<IconUserPlus size={18} color={c.textPrimary} strokeWidth={1.8} />} onPress={handleFollow} />
            </View>

            {/* Row 2 */}
            <View style={[styles.gridRow, { borderTopColor: c.borderSubtle }]}>
              <Cell borderColor={c.borderSubtle} labelColor={c.textPrimary} label={t('quickCard.mute')}
                icon={<IconBell size={18} color={c.textPrimary} strokeWidth={1.8} />}
                onPress={() => onOpenFull(targetUserId, targetName)} />
              <Cell borderColor={c.borderSubtle} labelColor={c.danger} label={t('quickCard.report')}
                icon={<IconFlag size={18} color={c.danger} strokeWidth={1.8} />} onPress={handleReport} />
              <Cell borderColor={c.borderSubtle} labelColor={c.danger} label={t('quickCard.block')} last
                icon={<IconBan size={18} color={c.danger} strokeWidth={1.8} />} onPress={handleBlock} />
            </View>
          </Pressable>

          {/* Arrow below the card (card is above the avatar). Painted on top of the card. */}
          {!showBelow && (
            <View style={[styles.arrow, { backgroundColor: bg, left: arrowLeft, bottom: -ARROW_SIZE / 2 }]} />
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    width: CARD_W,
  },
  arrow: {
    position: 'absolute',
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    borderRadius: 3,
    transform: [{ rotate: '45deg' }],
  },
  card: {
    width: CARD_W,
    borderRadius: 14,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerText: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    fontSize: 14,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  gridRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  cellLabel: {
    fontSize: 11,
    marginTop: 4,
  },
});
