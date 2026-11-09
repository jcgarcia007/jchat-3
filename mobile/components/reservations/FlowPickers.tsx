/**
 * JChat 3.0 — M1: the pickers of the keyboard-free reservation flow (date strip, month calendar, time slots, party size, request chips).
 * Every control is a button: no TextInput anywhere. Pure rules (days, slots, chips) live in utils/reservationFlow.ts.
 * Touch targets are at least `controlMinHeight`, text uses the type standard (AppText roles, which also cap Dynamic Type), colours are theme tokens.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react-native';

import AppText from '../common/AppText';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { controlMinHeight, space } from '../../theme/spacing';
import {
  REQUEST_KEYS,
  calendarMonths,
  dayStrip,
  longDateLabel,
  monthGrid,
  monthTitle,
  partyOptions,
  shortWeekday,
  slotTimeLabel,
  type FlowLocale,
  type HoursMap,
  type RequestKey,
  type Slot,
} from '../../utils/reservationFlow';

/** A selectable pill: filled with the brand colour when selected, muted and inert when disabled. */
function Pill({
  label,
  selected,
  disabled,
  onPress,
  a11yLabel,
  minWidth,
  children,
}: {
  label?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  a11yLabel: string;
  minWidth?: number;
  children?: React.ReactNode;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={[
        styles.pill,
        { minWidth: minWidth ?? controlMinHeight, backgroundColor: selected ? palette.brand : c.bgElevated, borderColor: selected ? palette.brand : c.borderSubtle, opacity: disabled ? 0.4 : 1 },
      ]}
    >
      {children ?? (
        <AppText variant="compact" color={selected ? palette.onBrand : c.textPrimary} style={styles.center}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

// ── date strip ───────────────────────────────────────────────────────────────

export function DayStrip({
  hours,
  tz,
  nowMs,
  selected,
  locale,
  onPick,
}: {
  hours: HoursMap;
  tz: string | null | undefined;
  nowMs: number;
  selected: string | null;
  locale: FlowLocale;
  onPick: (date: string) => void;
}) {
  const { t } = useTranslation('reservations');
  const c = useThemeColors();
  const days = useMemo(() => dayStrip(hours, tz, nowMs), [hours, tz, nowMs]);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {days.map((d) => {
        const isSel = selected === d.date;
        const a11y = d.open ? longDateLabel(d.date, locale) : t('dayClosedA11y', { date: longDateLabel(d.date, locale) });
        return (
          <Pressable
            key={d.date}
            accessibilityRole="button"
            accessibilityLabel={a11y}
            accessibilityState={{ selected: isSel, disabled: !d.open }}
            disabled={!d.open}
            onPress={() => onPick(d.date)}
            style={[
              styles.dayCard,
              { backgroundColor: isSel ? palette.brand : c.bgElevated, borderColor: isSel ? palette.brand : d.isToday ? palette.brand : c.borderSubtle, opacity: d.open ? 1 : 0.4 },
            ]}
          >
            <AppText variant="caption" color={isSel ? palette.onBrand : c.textSecondary} style={styles.center}>
              {d.isToday ? t('today') : shortWeekday(d.date, locale)}
            </AppText>
            <AppText variant="headline" color={isSel ? palette.onBrand : c.textPrimary} style={styles.center}>
              {Number(d.date.slice(8, 10))}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── month calendar ───────────────────────────────────────────────────────────

export function MonthCalendar({
  hours,
  tz,
  nowMs,
  selected,
  locale,
  onPick,
}: {
  hours: HoursMap;
  tz: string | null | undefined;
  nowMs: number;
  selected: string | null;
  locale: FlowLocale;
  onPick: (date: string) => void;
}) {
  const { t } = useTranslation('reservations');
  const c = useThemeColors();
  const months = useMemo(() => calendarMonths(tz, nowMs), [tz, nowMs]);
  const [index, setIndex] = useState(0);
  const month = months[Math.min(index, months.length - 1)];
  const weeks = useMemo(() => (month ? monthGrid(month.year, month.month, hours, tz, nowMs) : []), [month, hours, tz, nowMs]);
  // 2026-11-08 is a Sunday: seven consecutive days give the weekday headers in the person's language
  const heads = useMemo(() => Array.from({ length: 7 }, (_, i) => shortWeekday(`2026-11-${String(8 + i).padStart(2, '0')}`, locale)), [locale]);
  if (!month) return null;
  return (
    <View style={[styles.calendar, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
      <View style={styles.calendarHead}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('previousMonth')}
          accessibilityState={{ disabled: index === 0 }}
          disabled={index === 0}
          onPress={() => setIndex((i) => Math.max(0, i - 1))}
          style={[styles.monthBtn, { opacity: index === 0 ? 0.4 : 1 }]}
        >
          <IconChevronLeft size={20} color={c.textSecondary} />
        </Pressable>
        <AppText variant="headline" accessibilityRole="header" style={styles.center}>
          {monthTitle(month.year, month.month, locale)}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('nextMonth')}
          accessibilityState={{ disabled: index >= months.length - 1 }}
          disabled={index >= months.length - 1}
          onPress={() => setIndex((i) => Math.min(months.length - 1, i + 1))}
          style={[styles.monthBtn, { opacity: index >= months.length - 1 ? 0.4 : 1 }]}
        >
          <IconChevronRight size={20} color={c.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {heads.map((h, i) => (
          <AppText key={i} variant="caption" color={c.textTertiary} style={[styles.weekCell, styles.center]}>
            {h}
          </AppText>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((cell, ci) => {
            if (!cell) return <View key={ci} style={styles.weekCell} />;
            const isSel = selected === cell.date;
            const a11y = cell.selectable ? longDateLabel(cell.date, locale) : t('dayClosedA11y', { date: longDateLabel(cell.date, locale) });
            return (
              <Pressable
                key={ci}
                accessibilityRole="button"
                accessibilityLabel={a11y}
                accessibilityState={{ selected: isSel, disabled: !cell.selectable }}
                disabled={!cell.selectable}
                onPress={() => onPick(cell.date)}
                style={[
                  styles.weekCell,
                  styles.dayCell,
                  { backgroundColor: isSel ? palette.brand : 'transparent', borderColor: cell.isToday && !isSel ? palette.brand : 'transparent', opacity: cell.selectable ? 1 : 0.35 },
                ]}
              >
                <AppText variant="compact" color={isSel ? palette.onBrand : c.textPrimary} style={styles.center}>
                  {Number(cell.date.slice(8, 10))}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ── time slots ───────────────────────────────────────────────────────────────

export function SlotGrid({
  slots,
  tz,
  selected,
  locale,
  onPick,
}: {
  slots: Slot[];
  tz: string | null | undefined;
  selected: string | null;
  locale: FlowLocale;
  onPick: (slot: Slot) => void;
}) {
  const { t } = useTranslation('reservations');
  const c = useThemeColors();
  return (
    <View style={styles.wrap}>
      {slots.map((s) => {
        const time = slotTimeLabel(s.slot_at, tz, locale);
        const isSel = selected !== null && Date.parse(selected) === Date.parse(s.slot_at);
        const full = s.status === 'full';
        return (
          <Pill
            key={s.slot_at}
            selected={isSel}
            minWidth={96}
            a11yLabel={full ? t('slotFullA11y', { time }) : time}
            onPress={() => onPick(s)}
          >
            <View style={styles.slotInner}>
              <AppText variant="compact" color={isSel ? palette.onBrand : c.textPrimary} style={styles.center}>
                {time}
              </AppText>
              {full && (
                <AppText variant="caption" color={isSel ? palette.onBrand : palette.brandPurple} style={styles.center}>
                  {t('waitlistChip')}
                </AppText>
              )}
            </View>
          </Pill>
        );
      })}
    </View>
  );
}

// ── party size ───────────────────────────────────────────────────────────────

export function PartyPicker({ value, onPick }: { value: number | null; onPick: (n: number) => void }) {
  const { t } = useTranslation('reservations');
  const [expanded, setExpanded] = useState(value !== null && value > 8);
  return (
    <View style={styles.wrap}>
      {partyOptions(expanded).map((n) => (
        <Pill key={n} label={String(n)} selected={value === n} a11yLabel={t('people', { count: n })} onPress={() => onPick(n)} />
      ))}
      <Pill
        label={expanded ? t('partyFewer') : t('partyMore')}
        selected={false}
        a11yLabel={expanded ? t('partyFewerA11y') : t('partyMoreA11y')}
        onPress={() => setExpanded((e) => !e)}
        minWidth={controlMinHeight}
      />
    </View>
  );
}

// ── request chips ────────────────────────────────────────────────────────────

export function RequestChips({ selected, onToggle }: { selected: readonly RequestKey[]; onToggle: (key: RequestKey) => void }) {
  const { t } = useTranslation('reservations');
  return (
    <View style={styles.wrap}>
      {REQUEST_KEYS.map((key) => (
        <Pill key={key} label={t(`request.${key}`)} selected={selected.includes(key)} a11yLabel={t(`request.${key}`)} onPress={() => onToggle(key)} minWidth={controlMinHeight} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  pill: { minHeight: controlMinHeight, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  slotInner: { alignItems: 'center', justifyContent: 'center' },
  strip: { gap: space.sm, paddingVertical: space.xs },
  dayCard: { minWidth: 56, minHeight: 72, paddingHorizontal: space.sm, paddingVertical: space.sm, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  calendar: { borderRadius: 12, borderWidth: 1, padding: space.md, gap: space.xs },
  calendarHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  monthBtn: { minWidth: controlMinHeight, minHeight: controlMinHeight, alignItems: 'center', justifyContent: 'center' },
  weekRow: { flexDirection: 'row' },
  weekCell: { flex: 1 },
  dayCell: { minHeight: 44, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
