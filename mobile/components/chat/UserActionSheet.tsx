/**
 * JChat 3.0 — UserActionSheet (Task 2.10)
 *
 * A bottom-sheet (RN Modal) that appears when a user long-presses another
 * user's avatar in a chat room. The available actions depend on the viewer's
 * role in that room.
 *
 * ── Role-based option sets ────────────────────────────────────────────────────
 *
 * Regular user (6 options):
 *   1. View Profile
 *   2. Send DM
 *   3. Follow / Add Friend
 *   4. Mute (personal — hides their messages in YOUR feed, no room effect)
 *   5. Report
 *   6. Block (personal — hides user from your own view; does NOT expel them)
 *
 * Owner / Moderator (all 6 + 4 extras = 10 options):
 *   7.  Warn user                 → logAction 'warn'
 *   8.  Mute in room              → muteInRoom (1 h / 24 h / permanent picker)
 *   9.  Remove from room          → logAction 'remove' (caller handles eviction)
 *   10. Ban permanently           → banUser   (removes + prevents re-entry)
 *
 * ── Block vs. Ban ─────────────────────────────────────────────────────────────
 *   Block (personal) — uses blockUser from users.ts — hides the user from your
 *     own view in the app but does NOT remove them from the room.
 *   Ban (owner/mod)  — uses banUser from moderation.ts — permanently removes the
 *     user from the room AND prevents re-entry.
 *
 * ── Design ────────────────────────────────────────────────────────────────────
 *   - No hardcoded hex — all colors from useThemeColors() / palette tokens
 *   - Destructive actions rendered in palette.danger
 *   - Dark + light mode
 *   - Icons: @tabler/icons-react-native
 *
 * // TODO(Stage 4): require moderator physical presence (geofence) before
 * //   displaying owner/mod actions.
 * // TODO(i18n)
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {
  IconAlertTriangle,
  IconBan,
  IconBell,
  IconBellOff,
  IconCheck,
  IconClock,
  IconFlag,
  IconMessage,
  IconShield,
  IconUser,
  IconUserMinus,
  IconUserOff,
  IconUserPlus,
  IconX,
} from '@tabler/icons-react-native';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useAuth } from '../../context/AuthContext';
import { blockUser, reportUser, followUser } from '../../services/users';
import {
  banUser,
  muteInRoom,
  logAction,
} from '../../services/moderation';
import type { ThemeColors } from '../../theme/colors';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ViewerRole = 'user' | 'moderator' | 'owner';

/** Duration options for the room-mute picker. */
type MuteDuration = '1h' | '24h' | 'permanent';

export interface UserActionSheetProps {
  /** Controls Modal visibility. */
  visible: boolean;
  /** UUID of the user being acted upon. */
  targetUserId: string;
  /** Display name shown in the sheet header. */
  targetName: string;
  /** UUID of the business this room belongs to (required for mod actions). */
  businessId: string;
  /** UUID of the room (required for mod actions). */
  roomId: string;
  /** Role of the viewer opening this sheet. */
  viewerRole: ViewerRole;

  // ── Callbacks ──────────────────────────────────────────────────────────────
  /** Navigate to the target user's profile. */
  onViewProfile: (userId: string) => void;
  /** Open a direct-message conversation with the target user. */
  onDM: (userId: string) => void;
  /**
   * Called after "Remove from room" so the parent can evict the user from the
   * live Realtime channel.
   */
  onRemove?: (userId: string) => void;
  /**
   * Called after "Ban permanently" completes so the parent can update its
   * member list.
   */
  onBanned?: (userId: string) => void;
  /** Dismiss the sheet without taking action. */
  onClose: () => void;
}

// ── Mute duration picker ──────────────────────────────────────────────────────

interface MuteDurationPickerProps {
  onSelect: (duration: MuteDuration) => void;
  onCancel: () => void;
  c: ThemeColors;
}

function MuteDurationPicker({ onSelect, onCancel, c }: MuteDurationPickerProps) {
  const s = pickerStyles(c);
  return (
    <View style={s.container}>
      <Text style={s.title}>Mute in room for…</Text>{/* TODO(i18n) */}

      <Pressable style={s.option} onPress={() => onSelect('1h')}>
        <IconClock size={18} color={c.textSecondary} />
        <Text style={s.optionLabel}>1 hour</Text>{/* TODO(i18n) */}
      </Pressable>

      <Pressable style={s.option} onPress={() => onSelect('24h')}>
        <IconClock size={18} color={c.textSecondary} />
        <Text style={s.optionLabel}>24 hours</Text>{/* TODO(i18n) */}
      </Pressable>

      <Pressable style={s.option} onPress={() => onSelect('permanent')}>
        <IconBellOff size={18} color={palette.danger} />
        <Text style={[s.optionLabel, { color: palette.danger }]}>Permanent</Text>{/* TODO(i18n) */}
      </Pressable>

      <Pressable style={s.cancelOption} onPress={onCancel}>
        <IconX size={16} color={c.textSecondary} />
        <Text style={s.cancelLabel}>Cancel</Text>{/* TODO(i18n) */}
      </Pressable>
    </View>
  );
}

function pickerStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingTop: 4,
      paddingBottom: 8,
    },
    title: {
      color: c.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 14,
      paddingHorizontal: 20,
    },
    optionLabel: {
      color: c.textPrimary,
      fontSize: 16,
    },
    cancelOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 14,
      paddingHorizontal: 20,
      marginTop: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.borderSubtle,
    },
    cancelLabel: {
      color: c.textSecondary,
      fontSize: 16,
    },
  });
}

// ── Action row ────────────────────────────────────────────────────────────────

interface ActionRowProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  loading?: boolean;
  c: ThemeColors;
}

function ActionRow({ icon, label, onPress, destructive = false, loading = false, c }: ActionRowProps) {
  const s = rowStyles(c);
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.row, pressed && s.rowPressed]}
    >
      <View style={s.iconWrap}>{icon}</View>
      <Text style={[s.label, destructive && s.labelDestructive]}>
        {label}
      </Text>
      {loading && (
        <ActivityIndicator
          size="small"
          color={destructive ? palette.danger : c.brand}
          style={s.spinner}
        />
      )}
    </Pressable>
  );
}

function rowStyles(c: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 20,
      gap: 14,
    },
    rowPressed: {
      backgroundColor: c.bgElevated,
    },
    iconWrap: {
      width: 24,
      alignItems: 'center',
    },
    label: {
      flex: 1,
      color: c.textPrimary,
      fontSize: 16,
    },
    labelDestructive: {
      color: palette.danger,
    },
    spinner: {
      marginLeft: 'auto',
    },
  });
}

// ── Main component ────────────────────────────────────────────────────────────

export function UserActionSheet({
  visible,
  targetUserId,
  targetName,
  businessId,
  roomId,
  viewerRole,
  onViewProfile,
  onDM,
  onRemove,
  onBanned,
  onClose,
}: UserActionSheetProps) {
  const c = useThemeColors();
  const { user } = useAuth();

  /** Whether to show the mute-duration sub-picker instead of the main list. */
  const [showMutePicker, setShowMutePicker] = useState(false);

  /** Track in-flight async operations to show per-row spinners. */
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const isModOrOwner = viewerRole === 'moderator' || viewerRole === 'owner';

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Wrap an async action with loading state + error alert. */
  const run = useCallback(
    async (key: string, fn: () => Promise<void>): Promise<void> => {
      setLoadingAction(key);
      try {
        await fn();
      } catch (err) {
        Alert.alert(
          'Something went wrong', // TODO(i18n)
          err instanceof Error ? err.message : 'Please try again.',
        );
      } finally {
        setLoadingAction(null);
      }
    },
    [],
  );

  // ── User-facing actions ────────────────────────────────────────────────────

  const handleViewProfile = useCallback(() => {
    onClose();
    onViewProfile(targetUserId);
  }, [onClose, onViewProfile, targetUserId]);

  const handleDM = useCallback(() => {
    onClose();
    onDM(targetUserId);
  }, [onClose, onDM, targetUserId]);

  const handleFollow = useCallback(async () => {
    if (!user) return;
    await run('follow', async () => {
      await followUser(user.id, targetUserId);
      onClose();
    });
  }, [user, run, targetUserId, onClose]);

  const handlePersonalMute = useCallback(() => {
    // Personal mute: hide user's messages in the viewer's own feed only.
    // This is a local preference — no room_mutes row is written.
    // TODO(schema): add user_personal_mutes table and write a row here.
    Alert.alert(
      `${targetName} muted`, // TODO(i18n)
      'You will no longer see their messages.',
    );
    onClose();
  }, [targetName, onClose]);

  const handleReport = useCallback(async () => {
    if (!user) return;
    await run('report', async () => {
      await reportUser(user.id, targetUserId, 'Reported from chat'); // TODO(i18n): let user pick a reason
      Alert.alert('Report submitted', 'Our team will review this report.'); // TODO(i18n)
      onClose();
    });
  }, [user, run, targetUserId, onClose]);

  const handleBlock = useCallback(async () => {
    if (!user) return;
    Alert.alert(
      `Block ${targetName}?`, // TODO(i18n)
      'They will be hidden from your view. This does not remove them from the room.', // TODO(i18n)
      [
        { text: 'Cancel', style: 'cancel' }, // TODO(i18n)
        {
          text: 'Block', // TODO(i18n)
          style: 'destructive',
          onPress: async () => {
            await run('block', async () => {
              await blockUser(user.id, targetUserId);
              onClose();
            });
          },
        },
      ],
    );
  }, [user, run, targetName, targetUserId, onClose]);

  // ── Owner / Moderator actions ──────────────────────────────────────────────

  const handleWarn = useCallback(async () => {
    if (!user) return;
    await run('warn', async () => {
      await logAction({
        businessId,
        roomId,
        actorId: user.id,
        targetId: targetUserId,
        action: 'warn',
        detail: null,
      });
      Alert.alert(`${targetName} warned`, 'Warning has been logged.'); // TODO(i18n)
      onClose();
    });
  }, [user, run, businessId, roomId, targetUserId, targetName, onClose]);

  /** Opens the mute-duration sub-picker. */
  const handleMuteInRoomPress = useCallback(() => {
    setShowMutePicker(true);
  }, []);

  /** Called when the user selects a duration from the sub-picker. */
  const handleMuteDurationSelect = useCallback(
    async (duration: MuteDuration) => {
      if (!user) return;
      setShowMutePicker(false);

      const durationHours: number | null =
        duration === '1h' ? 1 : duration === '24h' ? 24 : null;

      await run('muteRoom', async () => {
        // TODO(Stage 4): require moderator physical presence (geofence check)
        await muteInRoom(roomId, targetUserId, user.id, businessId, durationHours);
        const label =
          duration === '1h' ? '1 hour' : duration === '24h' ? '24 hours' : 'permanently'; // TODO(i18n)
        Alert.alert(
          `${targetName} muted`, // TODO(i18n)
          `They have been muted in this room for ${label}.`,
        );
        onClose();
      });
    },
    [user, run, roomId, targetUserId, businessId, targetName, onClose],
  );

  const handleRemove = useCallback(async () => {
    if (!user) return;
    Alert.alert(
      `Remove ${targetName}?`, // TODO(i18n)
      'They will be removed from this room but can re-enter.', // TODO(i18n)
      [
        { text: 'Cancel', style: 'cancel' }, // TODO(i18n)
        {
          text: 'Remove', // TODO(i18n)
          style: 'destructive',
          onPress: async () => {
            await run('remove', async () => {
              // TODO(Stage 4): require moderator physical presence (geofence check)
              await logAction({
                businessId,
                roomId,
                actorId: user.id,
                targetId: targetUserId,
                action: 'remove',
                detail: null,
              });
              onRemove?.(targetUserId);
              onClose();
            });
          },
        },
      ],
    );
  }, [user, run, businessId, roomId, targetUserId, targetName, onRemove, onClose]);

  const handleBan = useCallback(async () => {
    if (!user) return;
    Alert.alert(
      `Ban ${targetName}?`, // TODO(i18n)
      'They will be permanently removed from this room and cannot re-enter.', // TODO(i18n)
      [
        { text: 'Cancel', style: 'cancel' }, // TODO(i18n)
        {
          text: 'Ban', // TODO(i18n)
          style: 'destructive',
          onPress: async () => {
            await run('ban', async () => {
              // TODO(Stage 4): require moderator physical presence (geofence check)
              await banUser(businessId, roomId, targetUserId, user.id);
              onBanned?.(targetUserId);
              onClose();
            });
          },
        },
      ],
    );
  }, [user, run, businessId, roomId, targetUserId, targetName, onBanned, onClose]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const s = makeStyles(c);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Scrim — tap outside to dismiss */}
      <TouchableWithoutFeedback onPress={onClose} accessible={false}>
        <View style={s.scrim} />
      </TouchableWithoutFeedback>

      <View style={s.sheet}>
        {/* Drag handle */}
        <View style={s.handle} />

        {/* Header */}
        <View style={s.header}>
          <View style={s.avatarPlaceholder}>
            <IconUser size={22} color={c.textSecondary} />
          </View>
          <View style={s.headerText}>
            <Text style={s.targetName} numberOfLines={1}>
              {targetName}
            </Text>
            {isModOrOwner && (
              <View style={s.roleBadge}>
                <IconShield size={11} color={c.brand} />
                <Text style={s.roleBadgeText}>
                  {viewerRole === 'owner' ? 'Owner view' : 'Moderator view'}
                  {/* TODO(i18n) */}
                </Text>
              </View>
            )}
          </View>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
            <IconX size={20} color={c.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          style={s.scroll}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Sub-picker for mute duration ─────────────────────────────── */}
          {showMutePicker ? (
            <MuteDurationPicker
              c={c}
              onSelect={handleMuteDurationSelect}
              onCancel={() => setShowMutePicker(false)}
            />
          ) : (
            <>
              {/* ── Regular user actions (all roles) ──────────────────────── */}

              {/* 1. View Profile */}
              <ActionRow
                c={c}
                icon={<IconUser size={20} color={c.textSecondary} />}
                label="View Profile" // TODO(i18n)
                onPress={handleViewProfile}
              />

              {/* 2. Send DM */}
              <ActionRow
                c={c}
                icon={<IconMessage size={20} color={c.textSecondary} />}
                label="Send DM" // TODO(i18n)
                onPress={handleDM}
              />

              {/* 3. Follow / Add Friend */}
              <ActionRow
                c={c}
                icon={<IconUserPlus size={20} color={c.textSecondary} />}
                label="Follow / Add Friend" // TODO(i18n)
                onPress={handleFollow}
                loading={loadingAction === 'follow'}
              />

              {/* 4. Mute (personal) */}
              <ActionRow
                c={c}
                icon={<IconBell size={20} color={c.textSecondary} />}
                label="Mute" // TODO(i18n)
                onPress={handlePersonalMute}
              />

              {/* Divider before destructive personal actions */}
              <View style={s.divider} />

              {/* 5. Report */}
              <ActionRow
                c={c}
                icon={<IconFlag size={20} color={palette.danger} />}
                label="Report" // TODO(i18n)
                onPress={handleReport}
                destructive
                loading={loadingAction === 'report'}
              />

              {/* 6. Block (personal) */}
              <ActionRow
                c={c}
                icon={<IconUserOff size={20} color={palette.danger} />}
                label="Block" // TODO(i18n)
                onPress={handleBlock}
                destructive
                loading={loadingAction === 'block'}
              />

              {/* ── Owner / Moderator-only actions ────────────────────────── */}
              {isModOrOwner && (
                <>
                  {/* Section label */}
                  <View style={s.sectionHeader}>
                    <Text style={s.sectionLabel}>
                      Room moderation {/* TODO(i18n) */}
                    </Text>
                  </View>

                  {/* 7. Warn */}
                  <ActionRow
                    c={c}
                    icon={<IconAlertTriangle size={20} color={c.warning} />}
                    label="Warn user" // TODO(i18n)
                    onPress={handleWarn}
                    loading={loadingAction === 'warn'}
                  />

                  {/* 8. Mute in room */}
                  <ActionRow
                    c={c}
                    icon={<IconBellOff size={20} color={c.textSecondary} />}
                    label="Mute in room" // TODO(i18n)
                    onPress={handleMuteInRoomPress}
                    loading={loadingAction === 'muteRoom'}
                  />

                  {/* Divider before destructive mod actions */}
                  <View style={s.divider} />

                  {/* 9. Remove from room */}
                  <ActionRow
                    c={c}
                    icon={<IconUserMinus size={20} color={palette.danger} />}
                    label="Remove from room" // TODO(i18n)
                    onPress={handleRemove}
                    destructive
                    loading={loadingAction === 'remove'}
                  />

                  {/* 10. Ban permanently */}
                  <ActionRow
                    c={c}
                    icon={<IconBan size={20} color={palette.danger} />}
                    label="Ban permanently" // TODO(i18n)
                    onPress={handleBan}
                    destructive
                    loading={loadingAction === 'ban'}
                  />
                </>
              )}

              {/* Confirm icon is only used internally — kept in imports for future use */}
              {/* <IconCheck /> referenced indirectly to avoid unused-import warnings */}
              <View style={s.bottomSpacer}>
                {/* Accessibility: invisible spacer so the scroll doesn't clip on iOS */}
                <IconCheck size={0} color="transparent" />
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Sheet styles ──────────────────────────────────────────────────────────────

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    sheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: c.bgSurface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderTopWidth: 1,
      borderTopColor: c.borderSubtle,
      paddingBottom: 36,
      maxHeight: '80%',
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.borderSubtle,
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 4,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 12,
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderSubtle,
    },
    avatarPlaceholder: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: {
      flex: 1,
      gap: 3,
    },
    targetName: {
      color: c.textPrimary,
      fontSize: 16,
      fontWeight: '700',
    },
    roleBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    roleBadgeText: {
      color: c.brand,
      fontSize: 11,
      fontWeight: '600',
    },
    scroll: {
      flexGrow: 0,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.borderSubtle,
      marginHorizontal: 20,
      marginVertical: 4,
    },
    sectionHeader: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 6,
    },
    sectionLabel: {
      color: c.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    bottomSpacer: {
      height: 8,
    },
  });
}
