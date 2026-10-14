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
 *   businessName — venue name for the messages ("Tienes que estar en {local}…")
 *
 * The SERVER decides (services/checkIn.ts): before calling the check_in RPC the button refreshes the presence with the
 * same runGeoCheck the chat gate uses (fresh position → check_geofence_and_join_room), then the RPC proves the person is
 * at the venue itself. No coordinates are logged or sent by this component.
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

import React, { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Spinner } from '../common/Spinner';
import { IconMapPin } from '@tabler/icons-react-native';
import { useThemeColors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { checkIn, type CheckInResult } from '../../services/checkIn';
import { runGeoCheck } from '../../screens/chat/useGeofenceGate';
import { toUserMessage } from '../../utils/errors';
import { showAlert } from '../../utils/dialog';

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
  /** The viewer's display name from public_profiles (never from auth metadata). */
  username?: string;
  /** Venue name, for the "you have to be at {venue}" message; generic text when missing. */
  businessName?: string;
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
  | 'checkIn.ownerTitle' | 'checkIn.ownerMessage'
  | 'checkIn.inactiveTitle' | 'checkIn.inactiveMessage'
  | 'checkIn.invalidTitle' | 'checkIn.invalidMessage'
  | 'checkIn.notSignedInTitle' | 'checkIn.notSignedInMessage'
  | 'checkIn.unavailableTitle' | 'checkIn.unavailableMessage'
  | 'checkIn.errorTitle' | 'checkIn.tryAgain';

/** Every refusal except `not_present` (that one has its own message with the venue name and a retry button). */
function blockedReasonKeys(
  reason: Exclude<Extract<CheckInResult, { ok: false }>['reason'], 'not_present'>,
): { titleKey: CheckInErrorKey; messageKey: CheckInErrorKey } {
  switch (reason) {
    case 'already_checked_in_24h':
      return { titleKey: 'checkIn.alreadyTitle', messageKey: 'checkIn.alreadyMessage' };
    case 'owner':
      return { titleKey: 'checkIn.ownerTitle', messageKey: 'checkIn.ownerMessage' };
    case 'business_inactive':
      return { titleKey: 'checkIn.inactiveTitle', messageKey: 'checkIn.inactiveMessage' };
    case 'invalid_business':
      return { titleKey: 'checkIn.invalidTitle', messageKey: 'checkIn.invalidMessage' };
    case 'auth_required':
      return { titleKey: 'checkIn.notSignedInTitle', messageKey: 'checkIn.notSignedInMessage' };
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
  username,
  businessName,
  onSuccess,
}: CheckInButtonProps) {
  const c = useThemeColors();
  const { user } = useAuth();
  const { t } = useTranslation('chat');
  const [loading, setLoading] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);

  const handlePress = useCallback(async () => {
    if (!user) {
      showAlert(t('checkIn.notSignedInTitle'), t('checkIn.notSignedInMessage'));
      return;
    }

    setLoading(true);
    try {
      // Refresh the presence first (fresh position → check_geofence_and_join_room, the chat gate's own check); the
      // check_in RPC then proves it server-side. The outcome of this refresh is not interpreted here: the RPC decides.
      await runGeoCheck(roomId, undefined, { interactive: true });

      const result = await checkIn({
        businessId,
        roomId,
        username: username ?? t('chatRoom.fallbackUserName'),
        businessName,
      });

      if (result.ok) {
        setCheckedIn(true);
        onSuccess?.(result.checkInId);
        showAlert(t('checkIn.successTitle'), t('checkIn.successMessage'));
      } else if (result.reason === 'not_present') {
        showAlert(
          t('checkIn.notPresentTitle'),
          businessName ? t('checkIn.notPresentMessage', { business: businessName }) : t('checkIn.notPresentMessageGeneric'),
          [
            { text: t('checkIn.retry'), onPress: () => void handlePressRef.current() },
            { text: t('checkIn.close'), style: 'cancel' },
          ],
        );
      } else {
        const { titleKey, messageKey } = blockedReasonKeys(result.reason);
        showAlert(t(titleKey), t(messageKey)); // never the raw server message
      }
    } catch (err) {
      showAlert(
        t('checkIn.errorTitle'),
        toUserMessage(err, 'chat:checkIn.tryAgain'),
      );
    } finally {
      setLoading(false);
    }
  }, [user, businessId, roomId, username, businessName, onSuccess, t]);

  // "Reintentar" re-runs the latest handler (the alert's callback outlives this render).
  const handlePressRef = useRef(handlePress);
  handlePressRef.current = handlePress;

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
        <Spinner
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
      backgroundColor: c.brandFill,
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
