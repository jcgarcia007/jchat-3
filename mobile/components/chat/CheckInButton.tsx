/**
 * JChat 3.0 — CheckInButton (Task 1.18)
 *
 * A button rendered inside a chat room that lets the user check in at the
 * associated business. The owner activates check-ins per business; this
 * component is rendered only when `enabled` is true.
 *
 * Props:
 *   enabled     — owner has activated check-ins for this business (pass false to hide)
 *   businessId  — uuid of the business being checked into
 *   roomId      — uuid of the room the user is currently in (for system message stub)
 *   venueData   — optional; when present enables the geofence check
 *                 // TODO(Stage 4): obtain device location from expo-location and
 *                 // pass userLat/userLng here to enforce the geofence
 *
 * Stage 2 notes:
 *   - `roomId` is required but chat rooms (Task 2.4) are not built yet.
 *     Pass any placeholder roomId string; the system-message posting is a stub.
 *   - // TODO(Stage 2): wire up live room context via ChatRoomScreen (Task 2.4)
 *
 * Design:
 *   - Colors come exclusively from useThemeColors() — no hardcoded hex
 *   - Icon: IconMapPin from @tabler/icons-react-native
 *   - Shows loading indicator while the check-in call is in-flight
 *   - Success / blocked reason surfaced via Alert
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconMapPin } from '@tabler/icons-react-native';
import { useThemeColors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { checkIn } from '../../services/checkIn';
import type { CheckInParams } from '../../services/checkIn';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CheckInButtonProps {
  /** Owner has enabled check-ins for this business. Pass false to not render. */
  enabled: boolean;
  /** UUID of the business the room belongs to. */
  businessId: string;
  /**
   * UUID of the room — forwarded to the system-message stub.
   * // TODO(Stage 2): wire up via ChatRoomScreen context (Task 2.4)
   */
  roomId: string;
  /**
   * Optional venue location data for geofence enforcement.
   * When omitted the geofence check is skipped.
   * // TODO(Stage 4): pass userLat/userLng from expo-location once available
   */
  venueData?: CheckInParams['venueData'];
  /**
   * Optional callback invoked after a successful check-in.
   * Useful for updating parent UI (e.g. show a confetti overlay).
   */
  onSuccess?: (checkInId: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns i18n keys (resolved with t() at the call site) so this can stay at
// module scope. Keys map to the `chat` namespace's `checkIn.*` block.
type CheckInErrorKey =
  | 'checkIn.alreadyTitle' | 'checkIn.alreadyMessage'
  | 'checkIn.tooFarTitle' | 'checkIn.tooFarMessage'
  | 'checkIn.unavailableTitle' | 'checkIn.unavailableMessage'
  | 'checkIn.errorTitle' | 'checkIn.tryAgain';

function blockedReasonKeys(
  reason: 'already_checked_in_24h' | 'outside_radius' | 'not_configured' | 'db_error',
): { titleKey: CheckInErrorKey; messageKey: CheckInErrorKey } {
  switch (reason) {
    case 'already_checked_in_24h':
      return { titleKey: 'checkIn.alreadyTitle', messageKey: 'checkIn.alreadyMessage' };
    case 'outside_radius':
      return { titleKey: 'checkIn.tooFarTitle', messageKey: 'checkIn.tooFarMessage' };
    case 'not_configured':
      return { titleKey: 'checkIn.unavailableTitle', messageKey: 'checkIn.unavailableMessage' };
    case 'db_error':
      return { titleKey: 'checkIn.errorTitle', messageKey: 'checkIn.tryAgain' };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CheckInButton({
  enabled,
  businessId,
  roomId,
  venueData,
  onSuccess,
}: CheckInButtonProps) {
  const c = useThemeColors();
  const { user } = useAuth();
  const { t } = useTranslation('chat');
  const [loading, setLoading] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);

  const handlePress = useCallback(async () => {
    if (!user) {
      Alert.alert(t('checkIn.notSignedInTitle'), t('checkIn.notSignedInMessage'));
      return;
    }

    setLoading(true);
    try {
      const result = await checkIn({
        userId: user.id,
        businessId,
        roomId,
        username: user.user_metadata?.username as string ?? user.email ?? user.id,
        venueData,
        // TODO(Stage 4): pass userLat/userLng from expo-location here
        // userLat: deviceLocation.coords.latitude,
        // userLng: deviceLocation.coords.longitude,
      });

      if (result.ok) {
        setCheckedIn(true);
        onSuccess?.(result.checkInId);
        Alert.alert(t('checkIn.successTitle'), t('checkIn.successMessage'));
      } else {
        const { titleKey, messageKey } = blockedReasonKeys(result.reason);
        const dynamicMessage = result.reason === 'db_error' ? result.message : undefined;
        Alert.alert(t(titleKey), dynamicMessage ?? t(messageKey));
      }
    } catch (err) {
      Alert.alert(
        t('checkIn.errorTitle'),
        err instanceof Error ? err.message : t('checkIn.tryAgain'),
      );
    } finally {
      setLoading(false);
    }
  }, [user, businessId, roomId, venueData, onSuccess]);

  // Owner has not enabled check-ins — render nothing
  if (!enabled) return null;

  const styles = makeStyles(c);

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading || checkedIn}
      accessibilityRole="button"
      accessibilityLabel={checkedIn ? t('checkIn.a11yCheckedIn') : t('checkIn.a11yCheckIn')}
      accessibilityState={{ disabled: loading || checkedIn }}
      style={({ pressed }) => [
        styles.button,
        checkedIn && styles.buttonCheckedIn,
        pressed && !loading && !checkedIn && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={c.bgSurface}
          style={styles.icon}
        />
      ) : (
        <View style={styles.inner}>
          <IconMapPin
            size={18}
            color={checkedIn ? c.success : c.bgSurface}
          />
          <Text style={[styles.label, checkedIn && styles.labelCheckedIn]}>
            {checkedIn ? t('checkIn.labelCheckedIn') : t('checkIn.labelCheckIn')}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(c: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.brand,
      borderRadius: 20,
      paddingVertical: 8,
      paddingHorizontal: 16,
      minWidth: 110,
      minHeight: 36,
    },
    buttonCheckedIn: {
      backgroundColor: c.bgOverlay,
      borderWidth: 1,
      borderColor: c.success,
    },
    buttonPressed: {
      opacity: 0.82,
    },
    inner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    icon: {
      marginHorizontal: 4,
    },
    label: {
      color: c.bgSurface,
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: 0.2,
    },
    labelCheckedIn: {
      color: c.success,
    },
  });
}
