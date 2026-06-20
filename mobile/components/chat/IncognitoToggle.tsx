/**
 * JChat 3.0 — IncognitoToggle (Task 2.11)
 *
 * Shown BEFORE entering a chat room so the user can opt into incognito mode.
 * Once the room is entered the toggle is no longer accessible — the setting
 * is locked for the duration of that session (enforced in Task 2.4 /
 * ChatRoomScreen, not here).
 *
 * Incognito behaviour (enforced at the room level in Task 2.4):
 *   - The incognito user sees other participants' real display names and
 *     avatars, but cannot tap through to their full profiles or photos.
 *   - Other participants see only the incognito user's chosen nickname; the
 *     real name and avatar are never exposed while incognito is active.
 *   - Incognito is per-room-entry: leaving and re-entering starts a fresh
 *     incognito session with the same or a different nickname.
 *
 * Props:
 *   value     — current IncognitoState ({ enabled, nickname })
 *   onChange  — called with the next full IncognitoState on any change
 *   error     — optional validation message displayed below the nickname field
 *
 * // TODO(i18n)
 */

import React, { useCallback } from 'react';
import {
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { IconMask } from '@tabler/icons-react-native';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Incognito state passed to / received from IncognitoToggle. */
export interface IncognitoState {
  /** Whether incognito mode is active. */
  enabled: boolean;
  /**
   * The nickname displayed to other participants while incognito.
   * Must be non-empty when `enabled` is true (see `isIncognitoValid`).
   */
  nickname: string;
}

export interface IncognitoToggleProps {
  /** Current state. */
  value: IncognitoState;
  /** Called with the next full state whenever the toggle or nickname changes. */
  onChange: (next: IncognitoState) => void;
  /**
   * Optional validation error displayed below the nickname field.
   * Typically set by the consumer after calling `isIncognitoValid`.
   */
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true when the state is valid for room entry:
 *   - incognito OFF → always valid
 *   - incognito ON  → nickname must be non-empty after trimming
 */
export function isIncognitoValid(state: IncognitoState): boolean {
  if (!state.enabled) return true;
  return state.nickname.trim().length > 0;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function IncognitoToggle({ value, onChange, error }: IncognitoToggleProps) {
  const c = useThemeColors();

  const handleToggle = useCallback(
    (next: boolean) => {
      onChange({ enabled: next, nickname: value.nickname });
    },
    [onChange, value.nickname],
  );

  const handleNicknameChange = useCallback(
    (text: string) => {
      onChange({ enabled: value.enabled, nickname: text });
    },
    [onChange, value.enabled],
  );

  const styles = makeStyles(c);

  return (
    <View style={styles.container}>
      {/* ── Toggle row ──────────────────────────────────────────────────────── */}
      <View style={styles.row}>
        <View style={styles.labelGroup}>
          <IconMask size={20} color={c.brand} />
          <View style={styles.labelText}>
            <Text style={styles.label}>
              Incognito Mode
              {/* TODO(i18n) */}
            </Text>
            <Text style={styles.sublabel}>
              Enter this room without revealing your identity
              {/* TODO(i18n) */}
            </Text>
          </View>
        </View>

        <Switch
          value={value.enabled}
          onValueChange={handleToggle}
          trackColor={{ false: c.bgOverlay, true: c.brand }}
          thumbColor={palette.bgSurfaceLight}
          ios_backgroundColor={c.bgOverlay}
          accessibilityLabel="Toggle incognito mode" // TODO(i18n)
          accessibilityRole="switch"
          accessibilityState={{ checked: value.enabled }}
        />
      </View>

      {/* ── Nickname field (visible only when enabled) ───────────────────── */}
      {value.enabled && (
        <View style={styles.nicknameSection}>
          <Text style={styles.nicknameLabel}>
            Nickname
            {/* TODO(i18n) */}
            <Text style={styles.required}> *</Text>
          </Text>

          <TextInput
            style={[
              styles.input,
              error != null && styles.inputError,
            ]}
            value={value.nickname}
            onChangeText={handleNicknameChange}
            placeholder="Choose a nickname…" // TODO(i18n)
            placeholderTextColor={c.textTertiary}
            autoCorrect={false}
            autoCapitalize="none"
            maxLength={32}
            returnKeyType="done"
            accessibilityLabel="Incognito nickname" // TODO(i18n)
          />

          {error != null && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          <Text style={styles.hint}>
            Others will only see this nickname — not your real name or photo.
            {/* TODO(i18n) */}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(c: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    container: {
      backgroundColor: c.bgSurface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 14,
    },

    // Toggle row
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    labelGroup: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      flex: 1,
    },
    labelText: {
      flex: 1,
      gap: 2,
    },
    label: {
      color: c.textPrimary,
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: 0.1,
    },
    sublabel: {
      color: c.textSecondary,
      fontSize: 12,
      lineHeight: 17,
    },

    // Nickname section
    nicknameSection: {
      gap: 6,
    },
    nicknameLabel: {
      color: c.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    required: {
      color: palette.danger,
    },
    input: {
      backgroundColor: c.bgElevated,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: c.textPrimary,
      fontSize: 15,
    },
    inputError: {
      borderColor: palette.danger,
    },
    errorText: {
      color: palette.danger,
      fontSize: 12,
      lineHeight: 17,
    },
    hint: {
      color: c.textTertiary,
      fontSize: 12,
      lineHeight: 17,
    },
  });
}
