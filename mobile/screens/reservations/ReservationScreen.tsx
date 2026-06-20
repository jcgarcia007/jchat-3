/**
 * JChat 3.0 — Reservation Screen (Task 3.11)
 *
 * Customer-facing reservation booking form:
 *  - Pick date and time (controlled inputs via TextInput + date string).
 *  - Set party size (stepper).
 *  - Optional special requests (multiline TextInput).
 *  - Submit inserts a `reservations` row with status='pending'.
 *  - Waitlist offer: if the slot appears full (heuristic — daily count vs
 *    dailySlots capacity), customer is offered to join the waitlist.
 *    is_waitlist=true is set in that case.
 *
 * TODO(i18n): Replace all user-facing strings with t() calls once the
 *             reservations locale keys are added.
 * TODO(server): Push notification sent to business owner on new request
 *               (Edge Function trigger on reservations INSERT).
 * TODO(server): Scheduled reminders to customer at 24h + 2h before
 *               reserved_at (Edge Function / pg_cron job).
 * TODO(Task 3.12): No-show tracking feeds loyalty deduction — note only.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  IconCalendarEvent,
  IconClock,
  IconUsers,
  IconNotes,
  IconCheck,
  IconAlertCircle,
  IconChevronUp,
  IconChevronDown,
  IconListCheck,
} from '@tabler/icons-react-native';

import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { supabase, isSupabaseConfigured } from '../../services/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  /**
   * The business to book with. Required for a real reservation.
   * Falls back to demo mode when absent or when Supabase is not configured.
   */
  businessId?: string;
  /** Called after a successful submission. */
  onSuccess?: (reservationId: string, isWaitlist: boolean) => void;
  /** Called when the user wants to dismiss / go back. */
  onCancel?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns today's date as YYYY-MM-DD. */
function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Builds a datetime string from separate date (YYYY-MM-DD) + time (HH:MM). */
function combineDateTime(date: string, time: string): string {
  return `${date}T${time}:00`;
}

/**
 * Heuristic slot-full check.
 * Counts confirmed+pending reservations for the same business on the same date
 * and compares against the DAILY_SLOTS_DEFAULT constant.
 * TODO(schema): replace constant with businesses.daily_slots column once added.
 */
const DAILY_SLOTS_DEFAULT = 20;

async function isFull(businessId: string, date: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const startOfDay = `${date}T00:00:00`;
    const endOfDay = `${date}T23:59:59`;
    const { count, error } = await supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .in('status', ['pending', 'confirmed'])
      .eq('is_waitlist', false)
      .gte('reserved_at', startOfDay)
      .lte('reserved_at', endOfDay);
    if (error) return false;
    return (count ?? 0) >= DAILY_SLOTS_DEFAULT;
  } catch {
    return false;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Small info row with icon. */
function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  const c = useThemeColors();
  return (
    <View style={styles.infoRow}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>{label}</Text>
        {children}
      </View>
    </View>
  );
}

/** Numeric stepper used for party size. */
function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const c = useThemeColors();
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        style={[
          styles.stepperBtn,
          {
            backgroundColor: c.bgElevated,
            borderColor: c.borderSubtle,
            opacity: value <= min ? 0.4 : 1,
          },
        ]}
        accessibilityLabel="Decrease party size"
      >
        <IconChevronDown size={16} color={c.textSecondary} />
      </Pressable>
      <View
        style={[
          styles.stepperValue,
          { backgroundColor: c.bgElevated, borderColor: c.borderSubtle },
        ]}
      >
        <Text
          style={[styles.stepperValueText, { color: c.textPrimary }]}
        >
          {value}
        </Text>
      </View>
      <Pressable
        onPress={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        style={[
          styles.stepperBtn,
          {
            backgroundColor: c.bgElevated,
            borderColor: c.borderSubtle,
            opacity: value >= max ? 0.4 : 1,
          },
        ]}
        accessibilityLabel="Increase party size"
      >
        <IconChevronUp size={16} color={c.textSecondary} />
      </Pressable>
    </View>
  );
}

// ── ReservationScreen ─────────────────────────────────────────────────────────

export default function ReservationScreen({
  businessId,
  onSuccess,
  onCancel,
}: Props) {
  const { user } = useAuth();
  const c = useThemeColors();

  // Form state
  const [date, setDate] = useState(todayString());
  const [time, setTime] = useState('19:00');
  const [partySize, setPartySize] = useState(2);
  const [specialRequests, setSpecialRequests] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [checkingFull, setCheckingFull] = useState(false);
  const [slotFull, setSlotFull] = useState(false);
  const [wantsWaitlist, setWantsWaitlist] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedWaitlist, setSubmittedWaitlist] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Realtime channel to watch own reservations (optional: could be used to
  // detect same-day slot count changes in near-real-time).
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Check slot availability when date changes ──────────────────────────────
  useEffect(() => {
    if (!businessId || !date) return;
    setSlotFull(false);
    setWantsWaitlist(false);

    let cancelled = false;
    setCheckingFull(true);

    isFull(businessId, date).then((full) => {
      if (!cancelled) {
        setSlotFull(full);
        setCheckingFull(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [businessId, date]);

  // ── Realtime subscription for slot count (refresh on reservation changes) ──
  useEffect(() => {
    if (!isSupabaseConfigured || !businessId) return;

    channelRef.current = supabase
      .channel(`reservation-slot-check-${businessId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
          filter: `business_id=eq.${businessId}`,
        },
        () => {
          if (!date) return;
          isFull(businessId, date).then((full) => {
            setSlotFull(full);
          });
        }
      )
      .subscribe();

    return () => {
      // Unsubscribe on unmount — required per architecture rules
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [businessId, date]);

  // ── Validate form ─────────────────────────────────────────────────────────
  const validate = useCallback((): string | null => {
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return 'Please enter a valid date (YYYY-MM-DD).';
    }
    if (!time.match(/^\d{2}:\d{2}$/)) {
      return 'Please enter a valid time (HH:MM).';
    }
    const dt = new Date(combineDateTime(date, time));
    if (isNaN(dt.getTime())) {
      return 'Invalid date or time.';
    }
    if (dt < new Date()) {
      return 'Reservation must be in the future.';
    }
    if (partySize < 1 || partySize > 20) {
      return 'Party size must be between 1 and 20.';
    }
    return null;
  }, [date, time, partySize]);

  // ── Submit reservation ────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!isSupabaseConfigured) {
      // Demo mode — simulate success
      setSubmitted(true);
      setSubmittedWaitlist(wantsWaitlist);
      onSuccess?.('demo-res-' + Date.now(), wantsWaitlist);
      return;
    }

    if (!user) {
      setError('You must be signed in to make a reservation.');
      return;
    }

    if (!businessId) {
      setError('No business selected.');
      return;
    }

    setSubmitting(true);
    try {
      const reserved_at = combineDateTime(date, time);
      const is_waitlist = slotFull ? wantsWaitlist : false;

      const { data, error: insertErr } = await supabase
        .from('reservations')
        .insert({
          business_id: businessId,
          user_id: user.id,
          reserved_at,
          party_size: partySize,
          special_requests: specialRequests.trim() || null,
          status: 'pending',
          is_waitlist,
        })
        .select('id')
        .single();

      if (insertErr || !data) {
        throw insertErr ?? new Error('Insert failed — no data returned.');
      }

      // TODO(server): business owner push notification is sent server-side via
      //               a Supabase Database Webhook / Edge Function on INSERT.
      // TODO(server): schedule 24h + 2h reminder to customer via pg_cron or
      //               Edge Function triggered on INSERT.

      const resId = (data as { id: string }).id;
      setSubmitted(true);
      setSubmittedWaitlist(is_waitlist);
      onSuccess?.(resId, is_waitlist);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Booking failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }, [
    validate,
    user,
    businessId,
    date,
    time,
    partySize,
    specialRequests,
    slotFull,
    wantsWaitlist,
    onSuccess,
  ]);

  // ── Success screen ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <View style={[styles.successContainer, { backgroundColor: c.bgBase }]}>
        <View
          style={[
            styles.successIcon,
            {
              backgroundColor: submittedWaitlist
                ? `${palette.brandPurple}20`
                : `${palette.success}20`,
            },
          ]}
        >
          {submittedWaitlist ? (
            <IconListCheck size={36} color={palette.brandPurple} />
          ) : (
            <IconCheck size={36} color={palette.success} />
          )}
        </View>
        <Text style={[styles.successTitle, { color: c.textPrimary }]}>
          {submittedWaitlist ? "You're on the waitlist!" : 'Request sent!'}
        </Text>
        <Text style={[styles.successSubtitle, { color: c.textSecondary }]}>
          {submittedWaitlist
            ? "We'll notify you if a slot opens up for your selected date."
            : "The business will confirm or reject your reservation shortly. We'll send you a notification."}
        </Text>
        {/* TODO(i18n) */}
        {onCancel && (
          <Pressable
            onPress={onCancel}
            style={[
              styles.doneBtn,
              {
                backgroundColor: submittedWaitlist
                  ? palette.brandPurple
                  : palette.success,
              },
            ]}
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        )}
      </View>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: c.bgBase }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: c.textPrimary }]}>
            Make a Reservation
          </Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            Fill in the details below and we'll send your request to the venue.
            {/* TODO(i18n) */}
          </Text>
        </View>

        {/* Demo mode notice */}
        {!isSupabaseConfigured && (
          <View
            style={[
              styles.bannerRow,
              { backgroundColor: `${palette.warning}18` },
            ]}
          >
            <IconAlertCircle size={14} color={palette.warning} />
            <Text style={[styles.bannerText, { color: palette.warning }]}>
              Demo mode — connect Supabase to submit live reservations
              {/* TODO(i18n) */}
            </Text>
          </View>
        )}

        {/* Error banner */}
        {error && (
          <View
            style={[
              styles.bannerRow,
              {
                backgroundColor: `${palette.danger}15`,
                borderColor: palette.danger,
                borderWidth: 1,
              },
            ]}
          >
            <IconAlertCircle size={14} color={palette.danger} />
            <Text style={[styles.bannerText, { color: palette.danger }]}>
              {error}
            </Text>
          </View>
        )}

        {/* Slot-full warning */}
        {slotFull && !checkingFull && (
          <View
            style={[
              styles.bannerRow,
              { backgroundColor: `${palette.brandPurple}15` },
            ]}
          >
            <IconListCheck size={14} color={palette.brandPurple} />
            <Text
              style={[styles.bannerText, { color: palette.brandPurple }]}
            >
              This date appears fully booked. You can join the waitlist instead.
              {/* TODO(i18n) */}
            </Text>
          </View>
        )}

        {/* ── Form fields ─────────────────────────────────────────────────── */}
        <View
          style={[
            styles.card,
            { backgroundColor: c.bgSurface, borderColor: c.borderSubtle },
          ]}
        >
          {/* Date */}
          <InfoRow
            icon={
              <IconCalendarEvent
                size={18}
                color={palette.brand}
                style={styles.infoIcon}
              />
            }
            label="Date (YYYY-MM-DD)"
            // TODO(i18n)
          >
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="2025-12-31"
              placeholderTextColor={c.textTertiary}
              keyboardType="numbers-and-punctuation"
              returnKeyType="done"
              style={[
                styles.textInput,
                {
                  color: c.textPrimary,
                  backgroundColor: c.bgElevated,
                  borderColor: c.borderSubtle,
                },
              ]}
              accessibilityLabel="Reservation date"
            />
          </InfoRow>

          <View style={[styles.divider, { backgroundColor: c.borderSubtle }]} />

          {/* Time */}
          <InfoRow
            icon={
              <IconClock
                size={18}
                color={palette.brand}
                style={styles.infoIcon}
              />
            }
            label="Time (HH:MM)"
            // TODO(i18n)
          >
            <TextInput
              value={time}
              onChangeText={setTime}
              placeholder="19:00"
              placeholderTextColor={c.textTertiary}
              keyboardType="numbers-and-punctuation"
              returnKeyType="done"
              style={[
                styles.textInput,
                {
                  color: c.textPrimary,
                  backgroundColor: c.bgElevated,
                  borderColor: c.borderSubtle,
                },
              ]}
              accessibilityLabel="Reservation time"
            />
            {checkingFull && (
              <ActivityIndicator
                size="small"
                color={palette.brand}
                style={{ marginTop: 6 }}
              />
            )}
          </InfoRow>

          <View style={[styles.divider, { backgroundColor: c.borderSubtle }]} />

          {/* Party size */}
          <InfoRow
            icon={
              <IconUsers
                size={18}
                color={palette.brand}
                style={styles.infoIcon}
              />
            }
            label="Party size"
            // TODO(i18n)
          >
            <Stepper
              value={partySize}
              min={1}
              max={20}
              onChange={setPartySize}
            />
          </InfoRow>

          <View style={[styles.divider, { backgroundColor: c.borderSubtle }]} />

          {/* Special requests */}
          <InfoRow
            icon={
              <IconNotes
                size={18}
                color={palette.brand}
                style={styles.infoIcon}
              />
            }
            label="Special requests (optional)"
            // TODO(i18n)
          >
            <TextInput
              value={specialRequests}
              onChangeText={setSpecialRequests}
              placeholder="Allergies, seating preferences, celebrations…"
              placeholderTextColor={c.textTertiary}
              multiline
              numberOfLines={3}
              style={[
                styles.textArea,
                {
                  color: c.textPrimary,
                  backgroundColor: c.bgElevated,
                  borderColor: c.borderSubtle,
                },
              ]}
              accessibilityLabel="Special requests"
            />
          </InfoRow>
        </View>

        {/* Waitlist option */}
        {slotFull && (
          <Pressable
            onPress={() => setWantsWaitlist((v) => !v)}
            style={[
              styles.waitlistRow,
              {
                backgroundColor: wantsWaitlist
                  ? `${palette.brandPurple}15`
                  : c.bgSurface,
                borderColor: wantsWaitlist
                  ? palette.brandPurple
                  : c.borderSubtle,
              },
            ]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: wantsWaitlist }}
          >
            <View
              style={[
                styles.checkbox,
                {
                  backgroundColor: wantsWaitlist
                    ? palette.brandPurple
                    : c.bgElevated,
                  borderColor: wantsWaitlist
                    ? palette.brandPurple
                    : c.borderSubtle,
                },
              ]}
            >
              {wantsWaitlist && <IconCheck size={12} color="#fff" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.waitlistTitle, { color: c.textPrimary }]}
              >
                Join the waitlist
                {/* TODO(i18n) */}
              </Text>
              <Text
                style={[styles.waitlistSub, { color: c.textSecondary }]}
              >
                You'll be notified if a slot opens up for this date.
                {/* TODO(i18n) */}
              </Text>
            </View>
          </Pressable>
        )}

        {/* Submit / cancel */}
        <View style={styles.actionRow}>
          {onCancel && (
            <Pressable
              onPress={onCancel}
              style={[
                styles.cancelBtn,
                { borderColor: c.borderSubtle },
              ]}
              disabled={submitting}
            >
              <Text style={[styles.cancelBtnText, { color: c.textSecondary }]}>
                Cancel
                {/* TODO(i18n) */}
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => void handleSubmit()}
            disabled={submitting}
            style={[
              styles.submitBtn,
              {
                backgroundColor: submitting
                  ? c.textTertiary
                  : slotFull && wantsWaitlist
                  ? palette.brandPurple
                  : palette.brand,
                flex: onCancel ? 1 : undefined,
              },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>
                {slotFull && wantsWaitlist
                  ? 'Join Waitlist'
                  : 'Request Reservation'}
                {/* TODO(i18n) */}
              </Text>
            )}
          </Pressable>
        </View>

        {/* Footer note */}
        <Text style={[styles.footerNote, { color: c.textTertiary }]}>
          Your request will be reviewed by the venue. You'll receive a
          notification once it's confirmed or rejected.
          {/* TODO(i18n) */}
          {'\n'}
          {/* TODO(server): reminders sent 24h and 2h before via server job */}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // Header
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },

  // Banners
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  bannerText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },

  // Card
  card: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },

  // Info row
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 12,
  },
  infoIcon: {
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },

  // Text inputs
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: 'top',
  },

  // Stepper
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    minWidth: 48,
    height: 36,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
    borderRadius: 4,
  },
  stepperValueText: {
    fontSize: 16,
    fontWeight: '600',
  },

  // Waitlist
  waitlistRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 20,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  waitlistTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  waitlistSub: {
    fontSize: 12,
    lineHeight: 17,
  },

  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  cancelBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // Footer
  footerNote: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 8,
  },

  // Success
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  successSubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
    marginBottom: 32,
  },
  doneBtn: {
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  doneBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
