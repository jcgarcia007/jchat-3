/**
 * JChat 3.0 — PasswordEntrySheet (Task 2.14)
 *
 * A bottom-anchored modal that gates access to password-protected sub-rooms.
 *
 * UX flow:
 *   1. User enters the password and taps "Enter room".
 *   2. The sheet calls `verifyRoomPassword` (server-side RPC — no client hash).
 *   3a. Correct  → `onSuccess()` is called; the parent caches session access.
 *   3b. Wrong    → inline error "Incorrect password"; user may retry.
 *   3c. 5 fails  → account locked for 30 min; input is disabled and a
 *                  countdown is shown, refreshing every 30 seconds.
 *
 * Security:
 *   - `password_hash` is NEVER fetched or compared on the client.
 *   - The plaintext password is passed only via `verifyRoomPassword`, which
 *     delegates to the server-side `verify_room_password` RPC.
 *
 * Props:
 *   roomId   — UUID of the password-protected room.
 *   visible  — controls Modal visibility (parent manages state).
 *   onSuccess — called after successful verification.
 *   onClose  — called when the user dismisses without entering.
 *
 * // TODO(i18n)
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { IconEye, IconEyeOff, IconLock } from '@tabler/icons-react-native';
import { useThemeColors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import {
  clearAttempts,
  getLockState,
  recordFailure,
  verifyRoomPassword,
  LOCKOUT_MS,
  MAX_ATTEMPTS,
} from '../../services/roomAccess';
import type { ThemeColors } from '../../theme/colors';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PasswordEntrySheetProps {
  /** UUID of the password-protected room. */
  roomId: string;
  /** Controls whether the sheet is rendered. */
  visible: boolean;
  /** Called after a correct password is verified. */
  onSuccess: () => void;
  /** Called when the user dismisses the sheet without entering. */
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format remaining lockout duration as "Xm Ys". */
function formatTimeRemaining(lockedUntil: string): string {
  const remainingMs = new Date(lockedUntil).getTime() - Date.now();
  if (remainingMs <= 0) return '0s';
  const totalSecs = Math.ceil(remainingMs / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins === 0) return `${secs}s`;
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PasswordEntrySheet({
  roomId,
  visible,
  onSuccess,
  onClose,
}: PasswordEntrySheetProps) {
  const c = useThemeColors();
  const { user } = useAuth();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  /** Inline error message shown below the input. */
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /** Whether the user is currently locked out. */
  const [locked, setLocked] = useState(false);
  /** ISO-8601 timestamp — when null the lock has expired. */
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  /** Human-readable time remaining (refreshed every 30 s). */
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<TextInput>(null);

  // ── Initial lock state on mount / visibility ──────────────────────────────

  useEffect(() => {
    if (!visible || !user) return;

    // Reset transient state each time the sheet opens
    setPassword('');
    setErrorMsg(null);
    setShowPassword(false);

    void (async () => {
      const state = await getLockState(roomId, user.id);
      setLocked(state.locked);
      setLockedUntil(state.lockedUntil);
    })();
  }, [visible, roomId, user]);

  // ── Countdown ticker ─────────────────────────────────────────────────────

  useEffect(() => {
    // Clear any prior interval whenever the lockedUntil value changes.
    if (countdownRef.current !== null) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    if (!locked || lockedUntil === null) return;

    // Update immediately, then every 30 s.
    const update = () => {
      const remaining = new Date(lockedUntil).getTime() - Date.now();
      if (remaining <= 0) {
        // Lock expired — unlock without clearing the DB row
        // (the next failed attempt will re-lock; a correct attempt clears it).
        setLocked(false);
        setLockedUntil(null);
        setTimeRemaining('');
        if (countdownRef.current !== null) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
        return;
      }
      setTimeRemaining(formatTimeRemaining(lockedUntil));
    };

    update();
    countdownRef.current = setInterval(update, 30_000);

    return () => {
      if (countdownRef.current !== null) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [locked, lockedUntil]);

  // ── Submit handler ────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!user || !password.trim() || locked || loading) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const result = await verifyRoomPassword(roomId, password.trim());

      if (result.ok) {
        // Clear the attempt record from the DB
        await clearAttempts(roomId, user.id);
        setPassword('');
        onSuccess();
        return;
      }

      if (result.error === 'not_configured') {
        // TODO(i18n)
        setErrorMsg('Service unavailable. Please try again later.');
        return;
      }

      if (result.error === 'locked_out') {
        // Server-side lockout is authoritative — reflect it in the UI.
        setLocked(true);
        if (result.lockedUntil) setLockedUntil(result.lockedUntil);
        setPassword('');
        const mins = result.lockedUntil
          ? Math.max(1, Math.ceil((new Date(result.lockedUntil).getTime() - Date.now()) / 60_000))
          : null;
        // TODO(i18n)
        setErrorMsg(
          mins !== null
            ? `Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`
            : 'Too many attempts. Please try again later.',
        );
        return;
      }

      // Wrong password — record the failure and update lock state.
      const nextState = await recordFailure(roomId, user.id);

      if (nextState.locked && nextState.lockedUntil) {
        setLocked(true);
        setLockedUntil(nextState.lockedUntil);
        setPassword('');
        // TODO(i18n)
        setErrorMsg(
          `Too many failed attempts. Locked for ${LOCKOUT_MS / 60_000} minutes.`,
        );
      } else {
        const remaining = MAX_ATTEMPTS - nextState.failCount;
        // TODO(i18n)
        setErrorMsg(
          remaining > 0
            ? `Incorrect password. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`
            : 'Incorrect password.',
        );
      }
    } catch {
      // TODO(i18n)
      setErrorMsg('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user, password, locked, loading, roomId, onSuccess]);

  // ── Render ────────────────────────────────────────────────────────────────

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

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.avoidingView}
        pointerEvents="box-none"
      >
        <View style={s.sheet}>
          {/* Drag handle */}
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <View style={s.lockIconWrap}>
              <IconLock size={22} color={c.brand} />
            </View>
            {/* TODO(i18n) */}
            <Text style={s.title}>This room is members-only</Text>
            <Text style={s.subtitle}>
              Enter the room password to join the conversation.
            </Text>
          </View>

          {/* Password input row */}
          <View
            style={[
              s.inputWrap,
              locked && s.inputWrapDisabled,
              !!errorMsg && s.inputWrapError,
            ]}
          >
            <TextInput
              ref={inputRef}
              style={s.input}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder={locked ? 'Room is locked' : 'Room password'} // TODO(i18n)
              placeholderTextColor={c.textTertiary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
              editable={!locked && !loading}
              accessibilityLabel="Room password" // TODO(i18n)
            />
            {/* Show / hide toggle */}
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} // TODO(i18n)
              disabled={locked}
            >
              {showPassword ? (
                <IconEyeOff size={20} color={c.textSecondary} />
              ) : (
                <IconEye size={20} color={c.textSecondary} />
              )}
            </Pressable>
          </View>

          {/* Inline error / lockout message */}
          {!!errorMsg && (
            <Text style={s.errorText} accessibilityRole="alert">
              {errorMsg}
            </Text>
          )}

          {/* Lockout countdown */}
          {locked && lockedUntil !== null && (
            <Text style={s.lockoutText} accessibilityRole="text">
              {/* TODO(i18n) */}
              Try again in {timeRemaining || formatTimeRemaining(lockedUntil)}
            </Text>
          )}

          {/* CTA button */}
          <Pressable
            onPress={handleSubmit}
            disabled={locked || loading || !password.trim()}
            accessibilityRole="button"
            accessibilityLabel="Enter room" // TODO(i18n)
            accessibilityState={{ disabled: locked || loading || !password.trim() }}
            style={({ pressed }) => [
              s.button,
              (locked || !password.trim()) && s.buttonDisabled,
              pressed && !locked && !loading && password.trim() && s.buttonPressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={c.bgSurface} />
            ) : (
              // TODO(i18n)
              <Text style={s.buttonLabel}>Enter room</Text>
            )}
          </Pressable>

          {/* Dismiss link */}
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            style={s.cancelWrap}
          >
            {/* TODO(i18n) */}
            <Text style={s.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    avoidingView: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.bgSurface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 24,
      paddingTop: 12,
      paddingBottom: 36,
      // Subtle top border for dark-mode clarity
      borderTopWidth: 1,
      borderTopColor: c.borderSubtle,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.borderSubtle,
      alignSelf: 'center',
      marginBottom: 20,
    },
    header: {
      alignItems: 'center',
      marginBottom: 24,
    },
    lockIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: c.brandLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    title: {
      color: c.textPrimary,
      fontSize: 17,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: 6,
    },
    subtitle: {
      color: c.textSecondary,
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
    },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bgElevated,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === 'ios' ? 14 : 10,
      marginBottom: 8,
      gap: 8,
    },
    inputWrapDisabled: {
      opacity: 0.5,
    },
    inputWrapError: {
      borderColor: c.danger,
    },
    input: {
      flex: 1,
      color: c.textPrimary,
      fontSize: 15,
      padding: 0,
    },
    errorText: {
      color: c.danger,
      fontSize: 13,
      marginBottom: 4,
      marginLeft: 2,
    },
    lockoutText: {
      color: c.warning,
      fontSize: 13,
      marginBottom: 8,
      marginLeft: 2,
    },
    button: {
      backgroundColor: c.brand,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
      minHeight: 50,
    },
    buttonDisabled: {
      opacity: 0.45,
    },
    buttonPressed: {
      opacity: 0.82,
    },
    buttonLabel: {
      color: c.bgSurface,
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    cancelWrap: {
      alignItems: 'center',
      marginTop: 16,
    },
    cancelText: {
      color: c.textSecondary,
      fontSize: 15,
    },
  });
}
