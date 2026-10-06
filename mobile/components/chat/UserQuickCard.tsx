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

import React, { useCallback, useEffect, useState } from 'react';
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
  IconUserCheck,
  IconBell,
  IconGift,
  IconFlag,
  IconBan,
} from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { cancelRequest, hasPendingRequestTo, requestOrFollow } from '../../services/follows';
import { isFollowing, unfollowUser } from '../../services/users';
import { blockUser } from '../../services/blocks';
import type { UserAnchor } from './MessageBubble';
import { getInitials } from '../../utils/initials';

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
  /** The viewer is the venue owner/staff: the 'Mute' cell becomes 'Moderate'. */
  viewerIsOwner?: boolean;
  /** A gift can be sent to this person right now (server verdict): the 'Mute' cell becomes 'Gift'. */
  giftAvailable?: boolean;
  onSendGift?: (userId: string, userName: string) => void;
  /** Report flow lives at screen level (reason picker); the card just hands the target over. */
  onReport: (userId: string, userName: string) => void;
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
  testID,
}: {
  testID?: string;
  icon: React.ReactNode;
  label: string;
  labelColor: string;
  borderColor: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      testID={testID}
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
  viewerIsOwner = false,
  giftAvailable = false,
  onSendGift,
  onReport,
  onClose,
}: UserQuickCardProps) {
  const c = useThemeColors();
  const { t } = useTranslation('chat');
  const { user } = useAuth();

  // Real follow state, read each time the card opens: the cell reads Follow / Following / Requested.
  const [relation, setRelation] = useState<'none' | 'following' | 'requested'>('none');
  useEffect(() => {
    if (!visible || !user?.id || user.id === targetUserId) return;
    let alive = true;
    setRelation('none');
    void (async () => {
      try {
        if (await isFollowing(user.id, targetUserId)) { if (alive) setRelation('following'); return; }
        if (await hasPendingRequestTo(targetUserId) && alive) setRelation('requested');
      } catch {
        // Unknown state: the cell stays on "Follow"; the server decides on tap.
      }
    })();
    return () => { alive = false; };
  }, [visible, user?.id, targetUserId]);

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
        if (relation === 'following' || relation === 'requested') {
          const undo = async () => {
            try {
              if (relation === 'following') {
                if (user?.id) await unfollowUser(user.id, targetUserId);
              } else {
                await cancelRequest(targetUserId);
              }
              setRelation('none');
            } catch {
              Alert.alert(t('quickCard.errorTitle'), t('quickCard.errorMsg'));
            }
            onClose();
          };
          Alert.alert(
            relation === 'following'
              ? t('quickCard.unfollowTitle', { name: targetName })
              : t('quickCard.cancelRequestTitle', { name: targetName }),
            undefined,
            [
              { text: t('actions.cancel', { ns: 'common' }), style: 'cancel' },
              {
                text: relation === 'following' ? t('quickCard.unfollow') : t('quickCard.cancelRequest'),
                style: 'destructive',
                onPress: () => void undo(),
              },
            ],
          );
          return;
        }
        const res = await requestOrFollow(targetUserId);
        setRelation(res === 'following' ? 'following' : 'requested');
        Alert.alert(
          t('quickCard.follow'),
          res === 'following' ? t('quickCard.followedMsg') : t('quickCard.requestedMsg'),
        );
      } catch {
        Alert.alert(t('quickCard.errorTitle'), t('quickCard.errorMsg'));
      }
      onClose();
    })();
  }, [relation, user?.id, targetUserId, targetName, t, onClose]);

  const handleReport = useCallback(() => {
    onClose();
    onReport(targetUserId, targetName);
  }, [onClose, onReport, targetUserId, targetName]);

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
                    {getInitials(targetName)}
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
              <Cell borderColor={c.borderSubtle} labelColor={c.textPrimary} label={t(relation === 'following' ? 'quickCard.following' : relation === 'requested' ? 'quickCard.requested' : 'quickCard.follow')} last
                testID="quick-card-follow"
                icon={relation === 'none'
                  ? <IconUserPlus size={18} color={c.textPrimary} strokeWidth={1.8} />
                  : <IconUserCheck size={18} color={c.success} strokeWidth={1.8} />} onPress={handleFollow} />
            </View>

            {/* Row 2 */}
            <View style={[styles.gridRow, { borderTopColor: c.borderSubtle }]}>
              {!viewerIsOwner && giftAvailable && onSendGift ? (
                // Regular users: "Gift" replaces "Mute" (only while both are present at the venue).
                <Cell borderColor={c.borderSubtle} labelColor={c.textPrimary} label={t('quickCard.gift')} testID="quick-card-gift"
                  icon={<IconGift size={18} color={c.textPrimary} strokeWidth={1.8} />}
                  onPress={() => onSendGift(targetUserId, targetName)} />
              ) : (
                <Cell borderColor={c.borderSubtle} labelColor={c.textPrimary} label={viewerIsOwner ? t('quickCard.moderate') : t('quickCard.mute')}
                  icon={<IconBell size={18} color={c.textPrimary} strokeWidth={1.8} />}
                  onPress={() => onOpenFull(targetUserId, targetName)} />
              )}
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
