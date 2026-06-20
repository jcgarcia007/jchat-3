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
 *
 * // TODO(i18n)
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

function blockedReasonMessage(
  reason: 'already_checked_in_24h' | 'outside_radius' | 'not_configured' | 'db_error',
  extra?: string,
): { title: string; message: string } {
  // TODO(i18n)
  switch (reason) {
    case 'already_checked_in_24h':
      return {
        title: 'Already Checked In',
        message: 'You can only check in once every 24 hours at this location.',
      };
    case 'outside_radius':
      return {
        title: 'Too Far Away',
        message: 'You must be inside the venue to check in.',
      };
    case 'not_configured':
      return {
        title: 'Unavailable',
        message: 'Check-ins are not available right now.',
      };
    case 'db_error':
      return {
        title: 'Something Went Wrong',
        message: extra ?? 'Please try again.',
      };
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
  const [loading, setLoading] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);

  const handlePress = useCallback(async () => {
    if (!user) {
      // TODO(i18n)
      Alert.alert('Not Signed In', 'Please sign in to check in.');
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
        // TODO(i18n)
        Alert.alert('Checked In!', 'Your check-in was recorded.');
      } else {
        const { title, message } = blockedReasonMessage(
          result.reason,
          result.reason === 'db_error' ? result.message : undefined,
        );
        Alert.alert(title, message);
      }
    } catch (err) {
      // TODO(i18n)
      Alert.alert(
        'Something Went Wrong',
        err instanceof Error ? err.message : 'Please try again.',
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
      accessibilityLabel={checkedIn ? 'Checked in' : 'Check in'} // TODO(i18n)
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
            {checkedIn ? 'Checked In' : 'Check In'}
            {/* TODO(i18n) */}
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
