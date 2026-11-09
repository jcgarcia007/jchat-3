/**
 * JChat 3.0 — Reservation Screen (M1: reserve without a keyboard, with a review step)
 *
 * The customer only SELECTS: a date (strip of 14 days + calendar up to 60), a time slot (the server's reservation_slots, in the venue's zone),
 * the party size (1–8, "9+" opens 9–20) and optional request chips. A review screen shows everything with "Change" links; "Confirm reservation"
 * inserts a `reservations` row (status 'pending', is_waitlist when the slot was full). special_requests stores chip KEYS, never free text.
 * No TextInput anywhere in this flow. Pure rules: utils/reservationFlow.ts. Pickers: components/reservations/FlowPickers.tsx.
 *
 * The slots come from the server because the customer's own client cannot see other people's reservations (RLS): the server knows the venue's
 * hours, zone and daily capacity. Right before confirming the slots are asked again: if the venue closed that day or the slot is gone, nothing is
 * sent and the person goes back to the step that needs a new choice.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { IconAlertCircle, IconCheck, IconListCheck } from '@tabler/icons-react-native';

import AppText from '../../components/common/AppText';
import { Spinner } from '../../components/common/Spinner';
import { DayStrip, MonthCalendar, PartyPicker, RequestChips, SlotGrid } from '../../components/reservations/FlowPickers';
import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { controlMinHeight, sectionGap, space } from '../../theme/spacing';
import { supabase, isSupabaseConfigured, channelTopic } from '../../services/supabase';
import { toUserMessage } from '../../utils/errors';
import {
  EMPTY_FLOW,
  bookingName,
  canContinue,
  firstIncompleteStep,
  longDateLabel,
  nextStep,
  pickDate,
  pickSlot,
  reservationPayload,
  reviewReady,
  safeZone,
  slotStillAvailable,
  slotTimeLabel,
  slotsFromHours,
  toggleRequest,
  type FlowLocale,
  type FlowState,
  type FlowStep,
  type HoursMap,
  type RequestKey,
  type Slot,
} from '../../utils/reservationFlow';

interface Props {
  /** The business to book with. Required for a real reservation; without it (or without Supabase) the flow runs in demo mode. */
  businessId?: string;
  /** Called after a successful submission. */
  onSuccess?: (reservationId: string, isWaitlist: boolean) => void;
  /** Called when the user wants to dismiss / go back. */
  onCancel?: () => void;
  /** Called from the confirmation's "View my reservations" link (the host closes the form and opens the list). */
  onViewMine?: () => void;
}

interface Venue {
  name: string;
  timezone: string;
  hours: HoursMap;
}

const DEMO_HOURS: HoursMap = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((k) => [k, { open: '12:00', close: '22:00', closed: false }]));
const STEP_TITLE_KEY: Record<Exclude<FlowStep, 'done'>, string> = {
  date: 'stepDate',
  time: 'stepTime',
  people: 'stepPeople',
  requests: 'stepRequests',
  review: 'stepReview',
};
const PROGRESS_STEPS: readonly FlowStep[] = ['date', 'time', 'people', 'requests', 'review'];

/** One labelled row of the review card / the success summary. */
function SummaryRow({ label, value, onChange, changeLabel }: { label: string; value: string; onChange?: () => void; changeLabel?: string }) {
  const { t } = useTranslation('reservations');
  const c = useThemeColors();
  return (
    <View style={styles.summaryRow}>
      <View style={styles.flex}>
        <AppText variant="label" color={c.textTertiary}>{label}</AppText>
        <AppText variant="body">{value}</AppText>
      </View>
      {onChange && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={changeLabel ?? t('change')}
          onPress={onChange}
          hitSlop={8}
          style={styles.changeBtn}
        >
          <AppText variant="compact" color={c.brandText} style={styles.underline}>{t('change')}</AppText>
        </Pressable>
      )}
    </View>
  );
}

export default function ReservationScreen({ businessId, onSuccess, onCancel, onViewMine }: Props) {
  const { t, i18n } = useTranslation('reservations');
  const { user } = useAuth();
  const c = useThemeColors();
  const locale: FlowLocale = i18n.language?.startsWith('es') ? 'es' : 'en';
  const live = isSupabaseConfigured && !!businessId;

  const [venue, setVenue] = useState<Venue | null>(live ? null : { name: '', timezone: safeZone(Intl.DateTimeFormat().resolvedOptions().timeZone), hours: DEMO_HOURS });
  const [venueFailed, setVenueFailed] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [step, setStep] = useState<FlowStep>('date');
  const [editing, setEditing] = useState(false);
  const [flow, setFlow] = useState<FlowState>(EMPTY_FLOW);
  const [showCalendar, setShowCalendar] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsFailed, setSlotsFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneWaitlist, setDoneWaitlist] = useState(false);
  const submittingRef = useRef(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // the strip and the calendar only need today's date: read the clock once when the flow opens (the slots come from the server)
  const nowMs = useMemo(() => Date.now(), []);

  // ── Venue (name, zone, hours) and the person's name ────────────────────────
  const loadVenue = useCallback(async () => {
    if (!live) return;
    setVenueFailed(false);
    const { data, error: venueError } = await supabase.from('businesses').select('name, timezone, hours').eq('id', businessId as string).maybeSingle();
    if (venueError || !data) { setVenueFailed(true); return; }
    const row = data as { name: string | null; timezone: string | null; hours: HoursMap };
    setVenue({ name: row.name ?? '', timezone: safeZone(row.timezone), hours: row.hours ?? {} });
  }, [live, businessId]);

  useEffect(() => { void loadVenue(); }, [loadVenue]);

  useEffect(() => {
    if (!isSupabaseConfigured || !user) return;
    let cancelled = false;
    supabase.from('users').select('display_name, username').eq('id', user.id).maybeSingle().then(({ data }) => {
      if (!cancelled) setProfileName(bookingName(data as { display_name?: string | null; username?: string | null } | null));
    });
    return () => { cancelled = true; };
  }, [user]);

  // ── Slots of the picked date (the server decides: hours, zone, notice, capacity) ──
  const fetchSlots = useCallback(async (day: string): Promise<Slot[] | null> => {
    if (!venue) return null;
    if (!live) return slotsFromHours(venue.hours, venue.timezone, day, Date.now());
    const { data, error: slotsError } = await supabase.rpc('reservation_slots', { p_business_id: businessId as string, p_date: day });
    if (slotsError || !Array.isArray(data)) return null;
    return (data as { slot_at: string; status: string }[])
      .filter((r) => r.status === 'open' || r.status === 'full')
      .map((r) => ({ slot_at: r.slot_at, status: r.status as 'open' | 'full' }));
  }, [venue, live, businessId]);

  const date = flow.date;
  useEffect(() => {
    if (!date || !venue) { setSlots([]); return; }
    let cancelled = false;
    setSlotsLoading(true);
    setSlotsFailed(false);
    void fetchSlots(date).then((rows) => {
      if (cancelled) return;
      setSlotsLoading(false);
      if (rows === null) { setSlotsFailed(true); setSlots([]); } else setSlots(rows);
    });
    return () => { cancelled = true; };
  }, [date, venue, fetchSlots]);

  // Realtime: a reservation change can fill the day. Subscribe on mount, unsubscribe on unmount.
  useEffect(() => {
    if (!live || !date) return;
    channelRef.current = supabase
      .channel(channelTopic(`reservation-slot-check-${businessId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `business_id=eq.${businessId}` }, () => {
        void fetchSlots(date).then((rows) => { if (rows) setSlots(rows); });
      })
      .subscribe();
    return () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [live, date, businessId, fetchSlots]);

  // ── Navigation between steps ───────────────────────────────────────────────
  const goAfter = useCallback((from: FlowStep, next: FlowState) => {
    setError(null);
    if (editing && reviewReady(next)) { setEditing(false); setStep('review'); return; }
    setStep(nextStep(from));
  }, [editing]);

  const onPickDate = (d: string) => {
    const next = pickDate(flow, d);
    setFlow(next);
    setError(null);
    // a new date needs a new time; the same date (editing) goes straight back to the review
    if (next.slotAt === null) setStep('time'); else goAfter('date', next);
  };
  const onPickSlot = (slot: Slot) => { const next = pickSlot(flow, slot); setFlow(next); goAfter('time', next); };
  const onPickParty = (n: number) => { const next = { ...flow, party: n }; setFlow(next); goAfter('people', next); };
  const onToggleRequest = (key: RequestKey) => setFlow((f) => ({ ...f, requests: toggleRequest(f.requests, key) }));
  const change = (to: FlowStep) => { setEditing(true); setError(null); setStep(to); };
  const back = () => {
    setError(null);
    if (step === 'date') { onCancel?.(); return; }
    setEditing(false);
    setStep(PROGRESS_STEPS[Math.max(0, PROGRESS_STEPS.indexOf(step) - 1)]);
  };

  // ── Confirm ────────────────────────────────────────────────────────────────
  const confirm = useCallback(async () => {
    if (submittingRef.current) return; // double submit blocked
    const payload = reservationPayload(flow);
    if (!payload || !flow.date) { setStep(firstIncompleteStep(flow)); return; }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (!live) {
        setDoneWaitlist(payload.is_waitlist);
        setStep('done');
        onSuccess?.('demo-res-' + Date.now(), payload.is_waitlist);
        return;
      }
      if (!user) { setError(t('mustSignInError')); return; }
      // The venue may have closed that day, or the slot filled, since the person chose: ask again before sending anything.
      const fresh = await fetchSlots(flow.date);
      if (fresh !== null) {
        if (fresh.length === 0) {
          setSlots([]);
          setFlow((f) => ({ ...f, date: null, slotAt: null, slotStatus: null }));
          setError(t('dayClosedNowError'));
          setEditing(false);
          setStep('date');
          return;
        }
        const still = slotStillAvailable(fresh, flow.slotAt);
        if (!still) {
          setSlots(fresh);
          setFlow((f) => ({ ...f, slotAt: null, slotStatus: null }));
          setError(t('slotGoneError'));
          setEditing(false);
          setStep('time');
          return;
        }
        // the slot may have just filled (or freed up): the waitlist flag follows the server's current answer
        payload.is_waitlist = still.status === 'full';
      }
      const { data, error: insertErr } = await supabase
        .from('reservations')
        .insert({
          business_id: businessId as string,
          user_id: user.id,
          reserved_at: payload.reserved_at,
          party_size: payload.party_size,
          special_requests: payload.special_requests,
          status: 'pending',
          is_waitlist: payload.is_waitlist,
        })
        .select('id')
        .single();
      if (insertErr || !data) throw insertErr ?? new Error(t('insertFailedError'));
      setDoneWaitlist(payload.is_waitlist);
      setStep('done');
      onSuccess?.((data as { id: string }).id, payload.is_waitlist);
    } catch (e: unknown) {
      setError(t('bookingFailedError', { msg: toUserMessage(e) }));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [flow, live, user, fetchSlots, businessId, onSuccess, t]);

  // ── Derived labels ─────────────────────────────────────────────────────────
  const tz = venue?.timezone;
  const dateLabel = flow.date ? longDateLabel(flow.date, locale) : '';
  const timeLabel = flow.slotAt ? slotTimeLabel(flow.slotAt, tz, locale) : '';
  const requestsLabel = flow.requests.length > 0 ? flow.requests.map((k) => t(`request.${k}`)).join(' · ') : t('reviewNone');
  const waitlist = flow.slotStatus === 'full';

  const summary = (editable: boolean) => (
    <View style={[styles.card, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
      {venue?.name ? <AppText variant="headline" accessibilityRole="header">{venue.name}</AppText> : null}
      <SummaryRow label={t('reviewDate')} value={dateLabel} onChange={editable ? () => change('date') : undefined} changeLabel={t('changeA11y', { what: t('reviewDate') })} />
      <SummaryRow label={t('reviewTime')} value={timeLabel} onChange={editable ? () => change('time') : undefined} changeLabel={t('changeA11y', { what: t('reviewTime') })} />
      <SummaryRow label={t('reviewPeople')} value={flow.party !== null ? t('people', { count: flow.party }) : ''} onChange={editable ? () => change('people') : undefined} changeLabel={t('changeA11y', { what: t('reviewPeople') })} />
      <SummaryRow label={t('reviewRequests')} value={requestsLabel} onChange={editable ? () => change('requests') : undefined} changeLabel={t('changeA11y', { what: t('reviewRequests') })} />
      {profileName ? <AppText variant="compact" color={c.textSecondary}>{t('reviewName', { name: profileName })}</AppText> : null}
    </View>
  );

  // ── Success ────────────────────────────────────────────────────────────────
  if (step === 'done') {
    const tint = doneWaitlist ? palette.brandPurple : palette.success;
    return (
      <ScrollView style={[styles.flex, { backgroundColor: c.bgBase }]} contentContainerStyle={styles.successContent}>
        <View style={[styles.successIcon, { backgroundColor: `${tint}20` }]}>
          {doneWaitlist ? <IconListCheck size={36} color={tint} /> : <IconCheck size={36} color={tint} />}
        </View>
        <AppText variant="title" accessibilityRole="header" style={styles.center}>{doneWaitlist ? t('waitlistSuccessTitle') : t('requestSentTitle')}</AppText>
        <AppText variant="body" color={c.textSecondary} style={styles.center}>{doneWaitlist ? t('waitlistSuccessSubtitle') : t('requestSentSubtitle')}</AppText>
        <View style={styles.fullWidth}>{summary(false)}</View>
        {onViewMine && (
          <Pressable accessibilityRole="button" accessibilityLabel={t('viewMine')} onPress={onViewMine} style={[styles.primaryBtn, styles.fullWidth, { backgroundColor: tint }]}>
            <AppText variant="button" color={palette.onBrand} style={styles.center}>{t('viewMine')}</AppText>
          </Pressable>
        )}
        {onCancel && (
          <Pressable accessibilityRole="button" accessibilityLabel={t('doneButton')} onPress={onCancel} style={[styles.secondaryBtn, styles.fullWidth, { borderColor: c.borderSubtle }]}>
            <AppText variant="button" color={c.textSecondary} style={styles.center}>{t('doneButton')}</AppText>
          </Pressable>
        )}
      </ScrollView>
    );
  }

  // ── Steps ──────────────────────────────────────────────────────────────────
  const stepIndex = PROGRESS_STEPS.indexOf(step) + 1;
  const showContinue = step === 'requests';

  return (
    <View style={[styles.flex, { backgroundColor: c.bgBase }]}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <AppText variant="title" accessibilityRole="header">{t('headerTitle')}</AppText>
          <AppText variant="compact" color={c.textSecondary}>
            {venue?.name ? `${venue.name} · ` : ''}{t('stepCounter', { current: stepIndex, total: PROGRESS_STEPS.length })}
          </AppText>
        </View>

        {!live && (
          <View style={[styles.banner, { backgroundColor: `${palette.warning}18` }]}>
            <IconAlertCircle size={16} color={palette.warning} />
            <AppText variant="caption" color={palette.warning} style={styles.flex}>{t('demoModeMessage')}</AppText>
          </View>
        )}
        {error && (
          <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: `${palette.danger}15`, borderColor: palette.danger, borderWidth: 1 }]}>
            <IconAlertCircle size={16} color={palette.danger} />
            <AppText variant="caption" color={palette.danger} style={styles.flex}>{error}</AppText>
          </View>
        )}

        {venueFailed && (
          <View style={styles.block}>
            <AppText variant="body" color={c.textSecondary}>{t('venueLoadError')}</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel={t('retry')} onPress={() => void loadVenue()} style={[styles.secondaryBtn, { borderColor: c.borderSubtle }]}>
              <AppText variant="button" color={c.textPrimary} style={styles.center}>{t('retry')}</AppText>
            </Pressable>
          </View>
        )}
        {venue === null && !venueFailed && <Spinner />}

        {venue !== null && step !== 'review' && (
          <AppText variant="headline" accessibilityRole="header" style={styles.stepTitle}>{t(STEP_TITLE_KEY[step as Exclude<FlowStep, 'done'>])}</AppText>
        )}

        {venue !== null && step === 'date' && (
          <View style={styles.block}>
            <DayStrip hours={venue.hours} tz={tz} nowMs={nowMs} selected={flow.date} locale={locale} onPick={onPickDate} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showCalendar ? t('hideCalendar') : t('moreDates')}
              accessibilityState={{ expanded: showCalendar }}
              onPress={() => setShowCalendar((s) => !s)}
              style={[styles.secondaryBtn, { borderColor: c.borderSubtle }]}
            >
              <AppText variant="button" color={c.textPrimary} style={styles.center}>{showCalendar ? t('hideCalendar') : t('moreDates')}</AppText>
            </Pressable>
            {showCalendar && <MonthCalendar hours={venue.hours} tz={tz} nowMs={nowMs} selected={flow.date} locale={locale} onPick={onPickDate} />}
          </View>
        )}

        {venue !== null && step === 'time' && (
          <View style={styles.block}>
            <AppText variant="compact" color={c.textSecondary}>{dateLabel}</AppText>
            {slotsLoading && <Spinner />}
            {!slotsLoading && slotsFailed && (
              <>
                <AppText variant="body" color={c.textSecondary}>{t('slotsError')}</AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('retry')}
                  onPress={() => { if (flow.date) void fetchSlots(flow.date).then((rows) => { if (rows) { setSlots(rows); setSlotsFailed(false); } }); }}
                  style={[styles.secondaryBtn, { borderColor: c.borderSubtle }]}
                >
                  <AppText variant="button" color={c.textPrimary} style={styles.center}>{t('retry')}</AppText>
                </Pressable>
              </>
            )}
            {!slotsLoading && !slotsFailed && slots.length === 0 && <AppText variant="body" color={c.textSecondary}>{t('noSlots')}</AppText>}
            {!slotsLoading && slots.length > 0 && (
              <>
                {slots.some((s) => s.status === 'full') && <AppText variant="caption" color={palette.brandPurple}>{t('slotFullWarning')}</AppText>}
                <SlotGrid slots={slots} tz={tz} selected={flow.slotAt} locale={locale} onPick={onPickSlot} />
              </>
            )}
          </View>
        )}

        {venue !== null && step === 'people' && (
          <View style={styles.block}>
            <PartyPicker value={flow.party} onPick={onPickParty} />
          </View>
        )}

        {venue !== null && step === 'requests' && (
          <View style={styles.block}>
            <AppText variant="compact" color={c.textSecondary}>{t('requestsHint')}</AppText>
            <RequestChips selected={flow.requests} onToggle={onToggleRequest} />
            {flow.requests.includes('allergies') && (
              <View style={[styles.banner, { backgroundColor: `${palette.warning}18` }]}>
                <IconAlertCircle size={16} color={palette.warning} />
                <AppText variant="caption" color={c.textPrimary} style={styles.flex}>{t('allergiesNote')}</AppText>
              </View>
            )}
          </View>
        )}

        {venue !== null && step === 'review' && (
          <View style={styles.block}>
            <AppText variant="title" accessibilityRole="header">{t('reviewTitle')}</AppText>
            {summary(true)}
            {waitlist && <AppText variant="compact" color={palette.brandPurple}>{t('waitlistNote')}</AppText>}
          </View>
        )}
      </ScrollView>

      {/* Footer: Back (Cancel on the first step), Continue on the optional step, Confirm on the review */}
      {venue !== null && (
        <View style={[styles.footer, { borderTopColor: c.borderSubtle, backgroundColor: c.bgBase }]}>
          {step === 'review' && (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={waitlist ? t('confirmWaitlistButton') : t('confirmButton')}
                accessibilityState={{ disabled: submitting || !reviewReady(flow), busy: submitting }}
                disabled={submitting || !reviewReady(flow)}
                onPress={() => void confirm()}
                style={[styles.primaryBtn, { backgroundColor: waitlist ? palette.brandPurple : palette.brand, opacity: submitting ? 0.6 : 1 }]}
              >
                {submitting ? <Spinner /> : <AppText variant="button" color={palette.onBrand} style={styles.center}>{waitlist ? t('confirmWaitlistButton') : t('confirmButton')}</AppText>}
              </Pressable>
              <AppText variant="caption" color={c.textSecondary} style={styles.center}>{t('venueConfirms')}</AppText>
            </>
          )}
          {showContinue && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('continueButton')}
              accessibilityState={{ disabled: !canContinue(flow, step) }}
              disabled={!canContinue(flow, step)}
              onPress={() => goAfter('requests', flow)}
              style={[styles.primaryBtn, { backgroundColor: palette.brand }]}
            >
              <AppText variant="button" color={palette.onBrand} style={styles.center}>{t('continueButton')}</AppText>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel={step === 'date' ? t('closeFlow') : t('back')} onPress={back} style={[styles.secondaryBtn, { borderColor: c.borderSubtle }]}>
            <AppText variant="button" color={c.textSecondary} style={styles.center}>{step === 'date' ? t('closeFlow') : t('back')}</AppText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  underline: { textDecorationLine: 'underline' },
  fullWidth: { alignSelf: 'stretch' },
  scrollContent: { padding: space.lg, gap: space.lg },
  header: { gap: space.xs },
  stepTitle: { marginTop: space.xs },
  block: { gap: space.md },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: 10 },
  card: { borderRadius: 12, borderWidth: 1, padding: space.lg, gap: space.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  changeBtn: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  footer: { padding: space.lg, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  primaryBtn: { minHeight: controlMinHeight, paddingHorizontal: space.xl, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryBtn: { minHeight: controlMinHeight, paddingHorizontal: space.xl, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  successContent: { padding: space.xl, gap: sectionGap, alignItems: 'center', flexGrow: 1, justifyContent: 'center' },
  successIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
});
