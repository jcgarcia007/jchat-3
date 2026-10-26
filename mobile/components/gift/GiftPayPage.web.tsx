/**
 * JChat 3.0 — GiftPayPage (web): the card step of a gift as a FULL-SCREEN page ("← Regalo para {name}").
 *
 * Why a page and not the bottom sheet: Safari on an iPhone does not shrink the layout viewport when the keyboard opens, only the
 * visual one, and a bottom sheet in the Modal's fixed portal (which is anchored to the layout viewport) ended up under the keyboard
 * and its autofill bar. public/index.html keeps <body> fitted to the visual viewport, so this page — rendered INSIDE <body>, not in
 * a Modal — shrinks with the keyboard by itself and needs no keyboard compensation. It has ONE scroller (the ScrollView below):
 * the summary, Stripe's card form, the Pay button right after the last field (in the flow, never pinned to the bottom) and the
 * fine print scroll together, with a gap under them for the autofill bar; focusing a card field scrolls the form into view
 * (GiftPaymentForm.web.tsx). Nothing is fixed to the bottom, so the keyboard can never cover the Pay button.
 *
 * The arrow does what "Volver" / the X always did (GiftSheet.handleClose: the unpaid offer is cancelled, back to the chat).
 * Only the web renders this; devices keep the native PaymentSheet (GiftPayPage.tsx renders nothing). Theme tokens only.
 */

import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconArrowLeft } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { formatCents } from '../../utils/currency';
import { GiftPaymentForm } from './GiftPaymentForm';
import type { GiftPayPageProps } from './GiftPayPage';

export type { GiftPayPageProps } from './GiftPayPage';

/** px under the content so the Pay button can scroll above the keyboard's autofill bar. */
const AUTOFILL_BAR_GAP = 88;

export function GiftPayPage({ recipientName, venueName, itemsSummary, itemCount, payParams, note, onBack, onHeld, onBusyChange }: GiftPayPageProps): React.ReactElement {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('chat');
  const headerRef = useRef<View>(null);

  // Opening the page moves the focus to its header (the button that opened it is gone): keyboard / screen-reader users do not
  // lose their place, and no field is focused, so the keyboard does not open by itself.
  useEffect(() => {
    const node = headerRef.current as unknown as HTMLElement | null;
    if (!node?.focus) return;
    node.setAttribute('tabindex', '-1');
    node.focus({ preventScroll: true });
  }, []);

  const meta = [venueName, t('gift.paySummaryCount', { count: itemCount })].filter((part) => part.length > 0).join(' · ');

  return (
    <View testID="gift-pay-page" style={[styles.page, { backgroundColor: c.bgBase, paddingTop: insets.top }]}>
      <View ref={headerRef} style={[styles.header, { borderBottomColor: c.borderSubtle }]}>
        <Pressable
          testID="gift-pay-page-back"
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('gift.payBack')}
          style={styles.backBtn}
        >
          <IconArrowLeft size={24} color={c.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1} accessibilityRole="header">
          {t('gift.title', { name: recipientName })}
        </Text>
      </View>
      <ScrollView
        testID="gift-pay-scroll"
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: AUTOFILL_BAR_GAP + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.summary, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
          <Text style={[styles.summaryItems, { color: c.textPrimary }]} numberOfLines={2}>{itemsSummary}</Text>
          <Text style={[styles.summaryMeta, { color: c.textSecondary }]} numberOfLines={1}>{meta}</Text>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: c.textSecondary }]}>{t('gift.payTotal')}</Text>
            <Text style={[styles.totalValue, { color: c.textPrimary }]}>{formatCents(payParams.totalCents)}</Text>
          </View>
        </View>
        <GiftPaymentForm
          clientSecret={payParams.clientSecret}
          publishableKey={payParams.publishableKey}
          totalCents={payParams.totalCents}
          note={note}
          onHeld={onHeld}
          onBusyChange={onBusyChange}
        />
      </ScrollView>
    </View>
  );
}

export default GiftPayPage;

const styles = StyleSheet.create({
  // Absolute inside the screen (which lives in <body>, fitted to the visual viewport): never `fixed`, which would anchor to the layout viewport.
  page: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 18, fontWeight: '800' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  summary: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  summaryItems: { fontSize: 15, fontWeight: '700' },
  summaryMeta: { fontSize: 13 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  totalLabel: { fontSize: 13, fontWeight: '600' },
  totalValue: { fontSize: 18, fontWeight: '800' },
});
