/**
 * JChat 3.0 — ServiceCallSheet (Tanda C)
 *
 * Bottom-sheet modal that lets a user call a waiter.
 * Inserts a row into service_calls; the dashboard picks it up via realtime.
 *
 * Cooldown: 5 minutes, enforced both client-side (AsyncStorage) and server-side
 * (trigger enforce_service_call_cooldown — migration 023). If the server rejects
 * with 'service_call_cooldown' we display a friendly message.
 *
 * Props:
 *   visible     — controls Modal visibility
 *   roomId      — active chat room
 *   businessId  — owning business
 *   userId      — current authenticated user
 *   theme       — active ChatTheme (for colors)
 *   onClose     — called after dismiss or successful call
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { IconBell } from '@tabler/icons-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../services/supabase';
import { useThemeColors } from '../../theme/colors';
import type { ThemeColors } from '../../theme/colors';
import type { ChatTheme } from '../../theme/chatThemes';

// ── Constants ─────────────────────────────────────────────────────────────────

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const STORAGE_KEY_PREFIX = 'service_call_cooldown_';

// ── Helpers ───────────────────────────────────────────────────────────────────

function storageKey(roomId: string): string {
  return `${STORAGE_KEY_PREFIX}${roomId}`;
}

async function getLastCallTime(roomId: string): Promise<number | null> {
  try {
    const val = await AsyncStorage.getItem(storageKey(roomId));
    return val ? parseInt(val, 10) : null;
  } catch {
    return null;
  }
}

async function saveLastCallTime(roomId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(roomId), String(Date.now()));
  } catch {
    // non-critical
  }
}

function remainingMs(lastCallTime: number): number {
  return Math.max(0, COOLDOWN_MS - (Date.now() - lastCallTime));
}

function formatMinutes(ms: number): string {
  const totalSecs = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins === 0) return `${secs}s`;
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ServiceCallSheetProps {
  visible: boolean;
  roomId: string;
  businessId: string;
  userId: string;
  theme: ChatTheme;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ServiceCallSheet({
  visible,
  roomId,
  businessId,
  userId,
  theme,
  onClose,
}: ServiceCallSheetProps) {
  const c = useThemeColors();
  const { t } = useTranslation('chat');

  const [tableLabel, setTableLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cooldown state
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null); // epoch ms
  const [timeLeft, setTimeLeft] = useState('');
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Check cooldown on open ─────────────────────────────────────────────────

  useEffect(() => {
    if (!visible) return;

    // Reset form fields on each open
    setTableLabel('');
    setNotes('');
    setErrorMsg(null);

    void (async () => {
      const last = await getLastCallTime(roomId);
      if (last !== null) {
        const rem = remainingMs(last);
        if (rem > 0) {
          setCooldownUntil(last + COOLDOWN_MS);
        } else {
          setCooldownUntil(null);
        }
      } else {
        setCooldownUntil(null);
      }
    })();
  }, [visible, roomId]);

  // ── Cooldown countdown ticker ──────────────────────────────────────────────

  useEffect(() => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }

    if (cooldownUntil === null) {
      setTimeLeft('');
      return;
    }

    const update = () => {
      const rem = cooldownUntil - Date.now();
      if (rem <= 0) {
        setCooldownUntil(null);
        setTimeLeft('');
        if (tickRef.current !== null) {
          clearInterval(tickRef.current);
          tickRef.current = null;
        }
        return;
      }
      setTimeLeft(formatMinutes(rem));
    };

    update();
    tickRef.current = setInterval(update, 1000);

    return () => {
      if (tickRef.current !== null) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [cooldownUntil]);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (loading || cooldownUntil !== null) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase.from('service_calls').insert({
        room_id: roomId,
        business_id: businessId,
        user_id: userId,
        type: 'waiter',
        table_label: tableLabel.trim() || null,
        notes: notes.trim() || null,
        status: 'pending',
      });

      if (error) {
        // Server-side cooldown trigger raises 'service_call_cooldown'
        if (error.message?.includes('service_call_cooldown')) {
          setErrorMsg(t('service.errorCooldown'));
          // Restore client-side cooldown so the UI stays consistent
          const last = await getLastCallTime(roomId);
          if (last !== null) {
            const rem = remainingMs(last);
            if (rem > 0) setCooldownUntil(last + COOLDOWN_MS);
          }
          return;
        }
        setErrorMsg(t('service.errorSend'));
        return;
      }

      // Success
      await saveLastCallTime(roomId);
      onClose();
      // Brief delay so the sheet closes before the alert appears
      setTimeout(() => {
        Alert.alert(t('service.successTitle'), t('service.successMessage'));
      }, 300);
    } catch {
      setErrorMsg(t('service.errorConnection'));
    } finally {
      setLoading(false);
    }
  }, [loading, cooldownUntil, roomId, businessId, userId, tableLabel, notes, onClose]);

  // ── Render ────────────────────────────────────────────────────────────────

  const s = makeStyles(c);
  const isDisabled = loading || cooldownUntil !== null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Scrim */}
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
            <View style={[s.iconWrap, { backgroundColor: theme.bg }]}>
              <IconBell size={22} color={theme.accent} />
            </View>
            <Text style={s.title}>{t('service.callWaiter')}</Text>
            <Text style={s.subtitle}>
              {t('service.subtitle')}
            </Text>
          </View>

          {/* table_label input */}
          <View style={[s.inputWrap, isDisabled && s.inputWrapDisabled]}>
            <TextInput
              style={s.input}
              value={tableLabel}
              onChangeText={setTableLabel}
              placeholder={t('service.tablePlaceholder')}
              placeholderTextColor={c.textTertiary}
              autoCapitalize="words"
              returnKeyType="next"
              editable={!isDisabled}
              accessibilityLabel={t('service.tableA11y')}
            />
          </View>

          {/* notes input */}
          <View style={[s.inputWrap, s.inputWrapMultiline, isDisabled && s.inputWrapDisabled]}>
            <TextInput
              style={[s.input, s.inputMultiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t('service.notesPlaceholder')}
              placeholderTextColor={c.textTertiary}
              multiline
              numberOfLines={3}
              returnKeyType="done"
              editable={!isDisabled}
              accessibilityLabel={t('service.notesA11y')}
            />
          </View>

          {/* Error message */}
          {!!errorMsg && (
            <Text style={s.errorText} accessibilityRole="alert">
              {errorMsg}
            </Text>
          )}

          {/* Cooldown message */}
          {cooldownUntil !== null && (
            <View style={s.cooldownRow}>
              <Text style={s.cooldownText} accessibilityRole="text">
                {t('service.cooldown', { time: timeLeft || '…' })}
              </Text>
            </View>
          )}

          {/* CTA */}
          <Pressable
            onPress={() => void handleSubmit()}
            disabled={isDisabled}
            accessibilityRole="button"
            accessibilityLabel={t('service.callWaiter')}
            accessibilityState={{ disabled: isDisabled }}
            style={({ pressed }) => [
              s.button,
              { backgroundColor: theme.accent },
              isDisabled && s.buttonDisabled,
              pressed && !isDisabled && s.buttonPressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={c.bgSurface} />
            ) : (
              <Text style={s.buttonLabel}>{t('service.callWaiter')}</Text>
            )}
          </Pressable>

          {/* Cancel */}
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            style={s.cancelWrap}
          >
            <Text style={s.cancelText}>{t('actions.cancel', { ns: 'common' })}</Text>
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
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
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
      backgroundColor: c.bgElevated,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === 'ios' ? 14 : 10,
      marginBottom: 10,
    },
    inputWrapMultiline: {
      paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    },
    inputWrapDisabled: {
      opacity: 0.5,
    },
    input: {
      color: c.textPrimary,
      fontSize: 15,
      padding: 0,
    },
    inputMultiline: {
      minHeight: 64,
      textAlignVertical: 'top',
    },
    errorText: {
      color: c.danger,
      fontSize: 13,
      marginBottom: 8,
      marginLeft: 2,
    },
    cooldownRow: {
      marginBottom: 10,
    },
    cooldownText: {
      color: c.warning,
      fontSize: 13,
      marginLeft: 2,
    },
    button: {
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
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
