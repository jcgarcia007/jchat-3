/**
 * JChat 3.0 — PosTipPicker (shared POS component)
 *
 * Renders the tip selection card used in both PosCheckoutScreen (full tab) and
 * PosSplitScreen (per-check). The parent owns all state; this component is
 * purely presentational.
 *
 * Exports:
 *   TipOption          — { key: string; pct: number }
 *   TIP_PRESETS        — default 15 / 18 / 20 % — easy to make configurable per-business
 *   PosTipPickerProps  — props interface
 *   default PosTipPicker — the component
 */

import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../theme/colors';

// ─── Tip presets ──────────────────────────────────────────────────────────────

export interface TipOption {
  /** String key used as React key + selectedOption value. */
  key: string;
  /** Percentage (e.g. 15 = 15 %). */
  pct: number;
}

/**
 * Default presets: 15 / 18 / 20 %.
 * Leave as a constant here — when per-business configurability is needed,
 * replace this constant with a prop (no other callsites need to change).
 */
export const TIP_PRESETS: TipOption[] = [
  { key: '15', pct: 15 },
  { key: '18', pct: 18 },
  { key: '20', pct: 20 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PosTipPickerProps {
  /** Server-confirmed base amount in cents (displayed + used for % presets). */
  baseCents: number;
  /** Currently selected option key: preset key | 'custom' | 'none'. */
  selectedOption: string;
  onSelectOption: (key: string) => void;
  /** Whether the custom field is in percentage or fixed-dollar mode. */
  customMode: 'pct' | 'amt';
  onCustomModeChange: (mode: 'pct' | 'amt') => void;
  /** Raw text in the custom input field. */
  customInput: string;
  onCustomInputChange: (text: string) => void;
  /** Pre-computed tip in cents (derived from the above state by the parent). */
  computedTipCents: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PosTipPicker({
  baseCents,
  selectedOption,
  onSelectOption,
  customMode,
  onCustomModeChange,
  customInput,
  onCustomInputChange,
  computedTipCents,
}: PosTipPickerProps): React.ReactElement {
  const c = useThemeColors();
  const { t } = useTranslation('settings');

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.card, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>

        {/* Title */}
        <Text style={[styles.title, { color: c.textPrimary }]}>
          {t('pos.tipTitle')}
        </Text>

        {/* Base row */}
        <View style={styles.baseRow}>
          <Text style={[styles.baseLabel, { color: c.textSecondary }]}>
            {t('pos.tipBase')}
          </Text>
          <Text style={[styles.baseValue, { color: c.textPrimary }]}>
            {formatCents(baseCents)}
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: c.borderSubtle }]} />

        {/* Preset buttons: 15 / 18 / 20 */}
        <View style={styles.presets}>
          {TIP_PRESETS.map(({ key, pct }) => {
            const tipAmt = Math.round((baseCents * pct) / 100);
            const isActive = selectedOption === key;
            return (
              <Pressable
                key={key}
                onPress={() => onSelectOption(key)}
                style={({ pressed }) => [
                  styles.presetBtn,
                  isActive
                    ? { backgroundColor: c.brand, borderColor: c.brand }
                    : { backgroundColor: c.bgBase, borderColor: c.borderSubtle },
                  pressed && !isActive && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${pct}% — ${formatCents(tipAmt)}`}
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.presetPct,
                    { color: isActive ? '#fff' : c.textPrimary },
                  ]}
                >
                  {pct}%
                </Text>
                <Text
                  style={[
                    styles.presetAmt,
                    { color: isActive ? 'rgba(255,255,255,0.85)' : c.textSecondary },
                  ]}
                >
                  {formatCents(tipAmt)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Custom tip */}
        <Pressable
          onPress={() => onSelectOption('custom')}
          style={[
            styles.customRow,
            selectedOption === 'custom'
              ? { borderColor: c.brand, backgroundColor: c.brandLight }
              : { borderColor: c.borderSubtle, backgroundColor: c.bgBase },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('pos.tipCustom')}
          accessibilityState={{ selected: selectedOption === 'custom' }}
        >
          <Text
            style={[
              styles.customLabel,
              { color: selectedOption === 'custom' ? c.brand : c.textSecondary },
            ]}
          >
            {t('pos.tipCustom')}
          </Text>

          {selectedOption === 'custom' ? (
            <View style={styles.customInputRow}>
              {/* Mode toggle: % / $ */}
              <Pressable
                onPress={() => { onCustomModeChange('pct'); onCustomInputChange(''); }}
                style={[
                  styles.modeBtn,
                  customMode === 'pct'
                    ? { backgroundColor: c.brand }
                    : { backgroundColor: 'transparent', borderColor: c.borderSubtle, borderWidth: 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="percent"
              >
                <Text
                  style={[
                    styles.modeBtnText,
                    { color: customMode === 'pct' ? '#fff' : c.textSecondary },
                  ]}
                >
                  %
                </Text>
              </Pressable>
              <Pressable
                onPress={() => { onCustomModeChange('amt'); onCustomInputChange(''); }}
                style={[
                  styles.modeBtn,
                  customMode === 'amt'
                    ? { backgroundColor: c.brand }
                    : { backgroundColor: 'transparent', borderColor: c.borderSubtle, borderWidth: 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="dollar amount"
              >
                <Text
                  style={[
                    styles.modeBtnText,
                    { color: customMode === 'amt' ? '#fff' : c.textSecondary },
                  ]}
                >
                  $
                </Text>
              </Pressable>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: c.textPrimary,
                    borderColor: c.brand,
                    backgroundColor: c.bgSurface,
                  },
                ]}
                value={customInput}
                onChangeText={onCustomInputChange}
                keyboardType="decimal-pad"
                placeholder={
                  customMode === 'pct'
                    ? t('pos.tipCustomPctPlaceholder')
                    : t('pos.tipCustomAmtPlaceholder')
                }
                placeholderTextColor={c.textTertiary}
                autoFocus
                selectTextOnFocus
              />
            </View>
          ) : null}
        </Pressable>

        {/* No tip — always visible, never hidden */}
        <Pressable
          onPress={() => onSelectOption('none')}
          style={[
            styles.noneBtn,
            selectedOption === 'none'
              ? { borderColor: c.textSecondary, backgroundColor: c.bgBase }
              : { borderColor: c.borderSubtle, backgroundColor: 'transparent' },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('pos.tipNone')}
          accessibilityState={{ selected: selectedOption === 'none' }}
        >
          <Text
            style={[
              styles.noneBtnText,
              { color: selectedOption === 'none' ? c.textPrimary : c.textTertiary },
            ]}
          >
            {t('pos.tipNone')}
          </Text>
        </Pressable>

        <View style={[styles.divider, { backgroundColor: c.borderSubtle }]} />

        {/* Total summary */}
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: c.textSecondary }]}>
            {t('pos.tipTotalLabel')}
          </Text>
          <Text style={[styles.summaryValue, { color: c.textPrimary }]}>
            {formatCents(baseCents + computedTipCents)}
          </Text>
        </View>

      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  baseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  baseLabel: { fontSize: 14, fontWeight: '500' },
  baseValue: { fontSize: 18, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth },

  // Preset buttons
  presets: { flexDirection: 'row', gap: 10 },
  presetBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  presetPct: { fontSize: 18, fontWeight: '800' },
  presetAmt: { fontSize: 12, fontWeight: '500' },

  // Custom
  customRow: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  customLabel: { fontSize: 14, fontWeight: '600' },
  customInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modeBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBtnText: { fontSize: 16, fontWeight: '700' },
  input: {
    flex: 1,
    height: 40,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 16,
    fontWeight: '600',
  },

  // No tip
  noneBtn: { borderRadius: 10, borderWidth: 1, paddingVertical: 11, alignItems: 'center' },
  noneBtnText: { fontSize: 15, fontWeight: '500' },

  // Summary
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 13, fontWeight: '500' },
  summaryValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
});
