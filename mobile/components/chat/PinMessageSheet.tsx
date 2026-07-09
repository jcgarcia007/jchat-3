/**
 * JChat 3.0 — PinMessageSheet (Task 2.5)
 *
 * Bottom-sheet (RN Modal) shown when an Owner/Moderator chooses to pin a
 * message. The long-press gating and role check live in the parent
 * (ChatRoomScreen); this sheet assumes the action is already authorized.
 *
 * UX flow:
 *   1. Parent passes the message preview + available rooms.
 *   2. Owner selects notification mode (Notify / Silent).
 *   3. Owner picks which rooms to pin to (multi-select; current room pre-checked).
 *   4. Owner optionally sets an auto-unpin timer (1 h / 6 h / 24 h / None).
 *   5. "Pin Message" → inserts into pinned_messages (one row per room) and
 *      inserts a system message into messages for each room.
 *   6. onPinned() is called; the sheet closes.
 *
 * Colors: ChatTheme prop only — no hardcoded hex. Falls back to useThemeColors()
 *   for text/border colors that are not part of the chat theme.
 * Icons: @tabler/icons-react-native
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {
  IconBell,
  IconBellOff,
  IconCheck,
  IconClock,
  IconPin,
  IconX,
} from '@tabler/icons-react-native';
import { useThemeColors } from '../../theme/colors';
import type { ThemeColors } from '../../theme/colors';
import type { ChatTheme } from '../../theme/chatThemes';
import { supabase, isSupabaseConfigured } from '../../services/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Minimal message descriptor passed from the parent. */
export interface PinMessageRef {
  id: string;
  /** Short preview text shown in the sheet (first ~120 chars). */
  previewText: string;
}

/** A room the user can pin to. */
export interface PinRoomOption {
  id: string;
  name: string;
}

/** Timer options for auto-unpin. */
type PinTimer = '1h' | '6h' | '24h' | 'none';

export interface PinMessageSheetProps {
  /** Controls Modal visibility. */
  visible: boolean;
  /** The message being pinned. */
  message: PinMessageRef;
  /** The current room id — pre-selected in the room list. */
  roomId: string;
  /** Rooms the owner can pin to (should include the current room). */
  rooms: PinRoomOption[];
  /** UUID of the user performing the pin action. */
  pinnedBy: string;
  /** Active ChatTheme — drives accent, bg, bubble colors. */
  theme: ChatTheme;
  /** Dismiss without saving. */
  onClose: () => void;
  /** Called after all rows have been inserted successfully. */
  onPinned: () => void;
}

// ── Timer label map ───────────────────────────────────────────────────────────

type TimerLabelKey =
  | 'pin.timer1h'
  | 'pin.timer6h'
  | 'pin.timer24h'
  | 'pin.timerNone';

const TIMER_OPTIONS: { value: PinTimer; labelKey: TimerLabelKey }[] = [
  { value: '1h',   labelKey: 'pin.timer1h'   },
  { value: '6h',   labelKey: 'pin.timer6h'   },
  { value: '24h',  labelKey: 'pin.timer24h'  },
  { value: 'none', labelKey: 'pin.timerNone' },
];

function timerToExpiresAt(timer: PinTimer): string | null {
  if (timer === 'none') return null;
  const hours = timer === '1h' ? 1 : timer === '6h' ? 6 : 24;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

// ── Pill button ───────────────────────────────────────────────────────────────

interface PillProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  accent: string;
  c: ThemeColors;
}

function Pill({ label, selected, onPress, accent, c }: PillProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      style={[
        pillStyles.base,
        {
          borderColor: selected ? accent : c.borderSubtle,
          backgroundColor: selected
            ? accent + '22' // ~13 % opacity tint
            : c.bgElevated,
        },
      ]}
    >
      {selected && (
        <IconCheck size={12} color={accent} style={pillStyles.icon} />
      )}
      <Text
        style={[
          pillStyles.label,
          { color: selected ? accent : c.textSecondary },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const pillStyles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  icon: {
    marginRight: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
  },
});

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ label, c }: { label: string; c: ThemeColors }) {
  return (
    <Text
      style={[
        sectionStyles.label,
        { color: c.textSecondary },
      ]}
    >
      {label}
    </Text>
  );
}

const sectionStyles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
    marginTop: 4,
  },
});

// ── Main component ────────────────────────────────────────────────────────────

export function PinMessageSheet({
  visible,
  message,
  roomId,
  rooms,
  pinnedBy,
  theme,
  onClose,
  onPinned,
}: PinMessageSheetProps) {
  const c = useThemeColors();
  const { t } = useTranslation('chat');

  /** Notification mode. */
  const [notify, setNotify] = useState(true);
  /** Selected room ids (current room pre-checked). */
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(
    () => new Set([roomId]),
  );
  /** Auto-unpin timer. */
  const [timer, setTimer] = useState<PinTimer>('none');
  /** Saving indicator. */
  const [saving, setSaving] = useState(false);

  // Reset state each time the sheet opens.
  const handleOpen = useCallback(() => {
    setNotify(true);
    setSelectedRooms(new Set([roomId]));
    setTimer('none');
    setSaving(false);
  }, [roomId]);

  const toggleRoom = useCallback((id: string) => {
    setSelectedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const canSave = selectedRooms.size > 0;
  const preview = message.previewText.slice(0, 120);

  // ── Save handler ────────────────────────────────────────────────────────────

  const handlePin = useCallback(async () => {
    if (!canSave) return;

    if (!isSupabaseConfigured) {
      // Demo mode: pretend it worked.
      onPinned();
      onClose();
      return;
    }

    setSaving(true);
    try {
      const expiresAt = timerToExpiresAt(timer);
      const roomIds = Array.from(selectedRooms);

      // Insert pinned_messages rows (upsert — unique on room_id + message_id).
      const { error: pinError } = await supabase.from('pinned_messages').upsert(
        roomIds.map((rid) => ({
          room_id:    rid,
          message_id: message.id,
          pinned_by:  pinnedBy,
          expires_at: expiresAt,
          notify,
        })),
        { onConflict: 'room_id,message_id' },
      );
      if (pinError) throw pinError;

      // Insert a system message per room.
      const { error: msgError } = await supabase.from('messages').insert(
        roomIds.map((rid) => ({
          room_id:   rid,
          user_id:   pinnedBy,
          body:      t('pin.systemPinned'),
          type:      'system',
          is_system: true,
          metadata:  { pinned_message_id: message.id },
        })),
      );
      if (msgError) throw msgError;

      onPinned();
      onClose();
    } catch (err) {
      Alert.alert(
        t('pin.couldNotPinTitle'),
        err instanceof Error ? err.message : t('pin.tryAgain'),
      );
    } finally {
      setSaving(false);
    }
  }, [canSave, timer, selectedRooms, message.id, pinnedBy, notify, onPinned, onClose, t]);

  // ── Styles ──────────────────────────────────────────────────────────────────

  const s = useMemo(() => makeStyles(c, theme), [c, theme]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      onShow={handleOpen}
    >
      {/* Scrim */}
      <TouchableWithoutFeedback onPress={onClose} accessible={false}>
        <View style={s.scrim} />
      </TouchableWithoutFeedback>

      <View style={s.sheet}>
        {/* Drag handle */}
        <View style={s.handle} />

        {/* Header */}
        <View style={s.header}>
          <IconPin size={20} color={theme.accent} />
          <Text style={s.headerTitle}>{t('pin.sheetTitle')}</Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('actions.close', { ns: 'common' })}
            style={s.closeBtn}
          >
            <IconX size={20} color={c.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Message preview */}
          <View style={s.previewCard}>
            <Text style={s.previewText} numberOfLines={3}>
              {preview}
            </Text>
          </View>

          {/* ── Notification mode ──────────────────────────────────────────── */}
          <SectionLabel label={t('pin.notification')} c={c} />
          <View style={s.row}>
            <Pressable
              onPress={() => setNotify(true)}
              style={[
                s.notifyBtn,
                notify && {
                  borderColor: theme.accent,
                  backgroundColor: theme.accent + '22',
                },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: notify }}
            >
              <IconBell size={16} color={notify ? theme.accent : c.textSecondary} />
              <Text
                style={[
                  s.notifyLabel,
                  { color: notify ? theme.accent : c.textSecondary },
                ]}
              >
                {t('pin.notify')}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setNotify(false)}
              style={[
                s.notifyBtn,
                !notify && {
                  borderColor: theme.accent,
                  backgroundColor: theme.accent + '22',
                },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: !notify }}
            >
              <IconBellOff
                size={16}
                color={!notify ? theme.accent : c.textSecondary}
              />
              <Text
                style={[
                  s.notifyLabel,
                  { color: !notify ? theme.accent : c.textSecondary },
                ]}
              >
                {t('pin.silent')}
              </Text>
            </Pressable>
          </View>

          {/* ── Room selector ──────────────────────────────────────────────── */}
          {rooms.length > 1 && (
            <>
              <SectionLabel label={t('pin.pinToRooms')} c={c} />
              <View style={s.pillWrap}>
                {rooms.map((room) => (
                  <Pill
                    key={room.id}
                    label={room.name}
                    selected={selectedRooms.has(room.id)}
                    onPress={() => toggleRoom(room.id)}
                    accent={theme.accent}
                    c={c}
                  />
                ))}
              </View>
            </>
          )}

          {/* ── Auto-unpin timer ───────────────────────────────────────────── */}
          <SectionLabel label={t('pin.autoUnpin')} c={c} />
          <View style={s.pillWrap}>
            {TIMER_OPTIONS.map((opt) => (
              <Pill
                key={opt.value}
                label={t(opt.labelKey)}
                selected={timer === opt.value}
                onPress={() => setTimer(opt.value)}
                accent={theme.accent}
                c={c}
              />
            ))}
          </View>

          {/* ── Save button ────────────────────────────────────────────────── */}
          <Pressable
            onPress={handlePin}
            disabled={!canSave || saving}
            accessibilityRole="button"
            accessibilityLabel={t('pin.pinButtonA11y')}
            style={({ pressed }) => [
              s.saveBtn,
              {
                backgroundColor:
                  canSave && !saving ? theme.accent : c.borderSubtle,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <IconPin size={18} color="#ffffff" />
                <Text style={s.saveBtnLabel}>
                  {t('pin.pinButton')}
                </Text>
              </>
            )}
          </Pressable>

          {/* Bottom safe-area padding (accounts for home indicator). */}
          <View style={s.bottomPad} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(c: ThemeColors, theme: ChatTheme) {
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
      maxHeight: Platform.OS === 'android' ? '90%' : '85%',
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
      paddingVertical: 14,
      gap: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderSubtle,
    },
    headerTitle: {
      flex: 1,
      color: c.textPrimary,
      fontSize: 17,
      fontWeight: '700',
    },
    closeBtn: {
      padding: 4,
    },
    scroll: {
      flexGrow: 0,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 16,
    },
    previewCard: {
      backgroundColor: theme.bubbleInBg,
      borderRadius: 12,
      padding: 12,
      marginBottom: 20,
      borderLeftWidth: 3,
      borderLeftColor: theme.accent,
    },
    previewText: {
      color: theme.bubbleInText,
      fontSize: 14,
      lineHeight: 20,
    },
    row: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 20,
    },
    notifyBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      backgroundColor: c.bgElevated,
      paddingVertical: 10,
    },
    notifyLabel: {
      fontSize: 14,
      fontWeight: '600',
    },
    pillWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: 20,
    },
    saveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 14,
      paddingVertical: 14,
      marginTop: 4,
    },
    saveBtnLabel: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '700',
    },
    bottomPad: {
      height: 24,
    },
  });
}
