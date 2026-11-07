/**
 * JChat 3.0 — D4: the full-screen sheet a venue OWNER sees when they delete their account (mockup docs/design/owner-delete-mockup.md).
 *   A  "Tienes un local"        — the venues that close, what will happen, the required checkbox. Primary button = Cancel (the safe way out);
 *                                  the destructive one is secondary, red, and stays disabled until the box is ticked.
 *   B  money still at Stripe    — amount, per venue, what to do; nothing was deleted.
 *   G  open orders / tables     — the list of what is open; and the errors with their code and the support contact.
 * The second confirmation (C) and the success message stay in SettingsScreen (`confirm` / `showAlert`). Colours from the theme, text from the type
 * standard, spacing from the 4-point grid, every string through i18n (es = en).
 */

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconAlertTriangle, IconCheck, IconBuildingStore } from '@tabler/icons-react-native';

import AppText from '../common/AppText';
import { AppModal } from '../common/AppModal';
import { ACCOUNT_SUPPORT_EMAIL } from '../../constants/contact';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { controlMinHeight, space } from '../../theme/spacing';
import {
  formatMoney,
  listForScreen,
  ownerErrorKind,
  totalsByCurrency,
  type BalanceLine,
  type OpenItem,
  type OwnerBusiness,
} from '../../utils/ownerDelete';

export type OwnerDeleteView =
  | { kind: 'confirm'; businesses: OwnerBusiness[] }
  | { kind: 'balance'; balances: BalanceLine[] }
  | { kind: 'open'; open: OpenItem[] }
  | { kind: 'error'; code: string };

interface Props {
  view: OwnerDeleteView | null;
  /** Cancel / Got it / Close: leaves everything as it was. */
  onClose: () => void;
  /** A: "Continuar y eliminar" (only reachable with the box ticked). */
  onContinue: () => void;
  /** G (error): try again. */
  onRetry: () => void;
  /** B: open the Stripe dashboard. */
  onOpenStripe: () => void;
}

export function OwnerDeleteModal({ view, onClose, onContinue, onRetry, onOpenStripe }: Props) {
  const { t, i18n } = useTranslation('settings');
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Every time the sheet opens on screen A the box starts unticked.
    if (view?.kind === 'confirm') setChecked(false);
  }, [view]);

  const Button = ({ label, onPress, tone, disabled, testID }: { label: string; onPress: () => void; tone: 'primary' | 'danger' | 'neutral'; disabled?: boolean; testID?: string }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        tone === 'primary' && { backgroundColor: c.brandFill },
        tone === 'danger' && { borderWidth: 1, borderColor: c.dangerText },
        tone === 'neutral' && { borderWidth: 1, borderColor: c.borderSubtle },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <AppText variant="button" color={tone === 'primary' ? palette.onBrand : tone === 'danger' ? c.dangerText : c.textPrimary} style={styles.buttonText}>
        {label}
      </AppText>
    </Pressable>
  );

  const Bullet = ({ text }: { text: string }) => (
    <View style={styles.bulletRow}>
      <AppText variant="body" color={c.textSecondary} style={styles.bulletDot} accessible={false}>•</AppText>
      <AppText variant="body" color={c.textSecondary} style={styles.flex}>{text}</AppText>
    </View>
  );

  const renderBody = () => {
    if (!view) return null;

    if (view.kind === 'confirm') {
      const n = view.businesses.length;
      const { shown, more } = listForScreen(view.businesses);
      return (
        <>
          <AppText variant="title" accessibilityRole="header">{t('ownerDelete.title', { count: n })}</AppText>
          <AppText variant="body" color={c.textSecondary} style={styles.gapSm}>{t('ownerDelete.subtitle', { count: n })}</AppText>

          <View style={[styles.card, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
            {shown.map((b, i) => (
              <View key={b.id} style={[styles.venueRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderSubtle }]}>
                <IconBuildingStore size={20} color={c.textSecondary} />
                <View style={styles.flex}>
                  <AppText variant="body">{b.name}</AppText>
                  {b.city ? <AppText variant="caption" color={c.textSecondary}>{b.city}</AppText> : null}
                </View>
              </View>
            ))}
            {more > 0 ? (
              <AppText variant="compact" color={c.textSecondary} style={styles.moreRow}>{t('ownerDelete.more', { count: more })}</AppText>
            ) : null}
          </View>

          <AppText variant="headline" accessibilityRole="header" style={styles.gapLg}>{t('ownerDelete.whatHappens')}</AppText>
          <View style={styles.bullets}>
            <Bullet text={t('ownerDelete.b1')} />
            <Bullet text={t('ownerDelete.b2')} />
            <Bullet text={t('ownerDelete.b3')} />
            <Bullet text={t('ownerDelete.b4')} />
            <Bullet text={t('ownerDelete.b5')} />
            <Bullet text={t('ownerDelete.b6')} />
            {n > 1 ? <Bullet text={t('ownerDelete.b7')} /> : null}
          </View>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={`${t('ownerDelete.checkboxA11y')}. ${t('ownerDelete.checkbox', { count: n })}`}
            onPress={() => setChecked((v) => !v)}
            style={styles.checkRow}
            testID="owner-delete-checkbox"
          >
            <View style={[styles.checkBox, { borderColor: checked ? c.brandFill : c.textSecondary }, checked && { backgroundColor: c.brandFill }]}>
              {checked ? <IconCheck size={16} color={palette.onBrand} /> : null}
            </View>
            <AppText variant="body" style={styles.flex}>{t('ownerDelete.checkbox', { count: n })}</AppText>
          </Pressable>

          <View style={styles.buttons}>
            <Button label={t('ownerDelete.cancel')} onPress={onClose} tone="primary" testID="owner-delete-cancel" />
            <Button label={t('ownerDelete.continue')} onPress={onContinue} tone="danger" disabled={!checked} testID="owner-delete-continue" />
          </View>
        </>
      );
    }

    if (view.kind === 'balance') {
      const totals = totalsByCurrency(view.balances);
      const many = new Set(view.balances.map((b) => b.businessId)).size > 1;
      const totalText = totals.map((x) => formatMoney(x.amount, x.currency, i18n.language)).join(' + ');
      return (
        <>
          <View style={styles.iconRow} accessible={false}><IconAlertTriangle size={32} color={c.warningText} /></View>
          <AppText variant="title" accessibilityRole="header">{t('ownerDelete.balanceTitle')}</AppText>
          <AppText variant="body" color={c.textSecondary} style={styles.gapSm}>
            {t('ownerDelete.balanceBody', { count: many ? 2 : 1, amount: totalText })}
          </AppText>

          {many ? (
            <View style={[styles.card, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
              {view.balances.map((b, i) => (
                <View key={`${b.businessId}-${b.currency}`} style={[styles.moneyRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderSubtle }]}>
                  <AppText variant="body" style={styles.flex}>{b.businessName}</AppText>
                  <AppText variant="body">{formatMoney(b.amount, b.currency, i18n.language)}</AppText>
                </View>
              ))}
              <View style={[styles.moneyRow, { borderTopWidth: 1, borderTopColor: c.borderSubtle }]}>
                <AppText variant="body" style={styles.flex}>{t('ownerDelete.balanceTotal')}</AppText>
                <AppText variant="body">{totalText}</AppText>
              </View>
            </View>
          ) : null}

          <AppText variant="headline" accessibilityRole="header" style={styles.gapLg}>{t('ownerDelete.balanceWhatToDo')}</AppText>
          <View style={styles.bullets}>
            <Bullet text={t('ownerDelete.balanceStep1')} />
            <Bullet text={t('ownerDelete.balanceStep2')} />
          </View>
          <AppText variant="caption" color={c.textSecondary} style={styles.gapLg}>{t('ownerDelete.balanceNote')}</AppText>

          <View style={styles.buttons}>
            <Button label={t('ownerDelete.openStripe')} onPress={onOpenStripe} tone="primary" testID="owner-delete-open-stripe" />
            <Button label={t('ownerDelete.gotIt')} onPress={onClose} tone="neutral" testID="owner-delete-got-it" />
          </View>
        </>
      );
    }

    if (view.kind === 'open') {
      return (
        <>
          <View style={styles.iconRow} accessible={false}><IconAlertTriangle size={32} color={c.warningText} /></View>
          <AppText variant="title" accessibilityRole="header">{t('ownerDelete.openTitle')}</AppText>
          <AppText variant="body" color={c.textSecondary} style={styles.gapSm}>{t('ownerDelete.openBody')}</AppText>
          <View style={[styles.card, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
            {view.open.map((o, i) => (
              <View key={`${o.businessId}-${o.kind}`} style={[styles.moneyRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderSubtle }]}>
                <AppText variant="body" style={styles.flex}>{o.businessName}</AppText>
                <AppText variant="body" color={c.textSecondary}>{t(o.kind === 'orders' ? 'ownerDelete.openOrders' : 'ownerDelete.openTabs', { count: o.n })}</AppText>
              </View>
            ))}
          </View>
          <View style={styles.buttons}>
            <Button label={t('ownerDelete.gotIt')} onPress={onClose} tone="primary" testID="owner-delete-got-it" />
          </View>
        </>
      );
    }

    // error (G)
    const kind = ownerErrorKind(view.code);
    const key = kind === 'subscription' ? 'errorSubscription' : kind === 'balanceCheck' ? 'errorBalanceCheck' : 'errorGeneric';
    return (
      <>
        <View style={styles.iconRow} accessible={false}><IconAlertTriangle size={32} color={c.dangerText} /></View>
        <AppText variant="title" accessibilityRole="header">{t('ownerDelete.errorTitle')}</AppText>
        <AppText variant="body" color={c.textSecondary} style={styles.gapSm} accessibilityRole="alert">
          {t(`ownerDelete.${key}`, { contact: ACCOUNT_SUPPORT_EMAIL, code: view.code })}
        </AppText>
        <View style={styles.buttons}>
          <Button label={t('ownerDelete.retry')} onPress={onRetry} tone="primary" testID="owner-delete-retry" />
          <Button label={t('ownerDelete.close')} onPress={onClose} tone="neutral" testID="owner-delete-close" />
        </View>
      </>
    );
  };

  return (
    <AppModal visible={view !== null} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={[styles.screen, { backgroundColor: c.bgBase, paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg }]} testID="owner-delete-screen">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {renderBody()}
        </ScrollView>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space.lg },
  content: { paddingBottom: space.xl },
  flex: { flex: 1 },
  gapSm: { marginTop: space.sm },
  gapLg: { marginTop: space.xl },
  iconRow: { marginBottom: space.md },
  card: { marginTop: space.lg, borderWidth: 1, borderRadius: space.md, overflow: 'hidden' },
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  moreRow: { paddingHorizontal: space.lg, paddingBottom: space.md },
  moneyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  bullets: { marginTop: space.sm, gap: space.sm },
  bulletRow: { flexDirection: 'row', gap: space.sm },
  bulletDot: { width: space.md },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xl, minHeight: controlMinHeight },
  checkBox: { width: space.xl, height: space.xl, borderWidth: 2, borderRadius: space.xs, alignItems: 'center', justifyContent: 'center' },
  buttons: { marginTop: space.xl, gap: space.md },
  button: { minHeight: controlMinHeight, borderRadius: space.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg, paddingVertical: space.sm },
  buttonText: { textAlign: 'center' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
});
