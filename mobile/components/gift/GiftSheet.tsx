/**
 * JChat 3.0 — GiftSheet ("Regalo para {nombre}")
 *
 * The venue's menu with quantities (+/−), an optional note and the total. "Send gift" creates the
 * offer (gift_offer_create) and asks the server to HOLD the card (payments/gift_hold → Stripe
 * PaymentSheet). Nothing is charged now: the card is only charged if the recipient accepts. The
 * amounts shown here are an estimate; the server re-prices the offer. Items with options (modifier
 * groups) are not offered: a gift has no way to choose them.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Spinner } from '../common/Spinner';
import { AppModal } from '../common/AppModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconMinus, IconPlus, IconX } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { useKeyboardCover } from '../../hooks/useKeyboardCover';
import { palette } from '../../theme/tokens';
import { getMenu, type MenuCategory } from '../../services/menu';
import { cancelGiftOffer, createGiftOffer, giftErrorCode } from '../../services/giftOffers';
import { holdGiftPayment } from '../../services/stripe';
import { fetchGiftHold } from '../../services/giftHold';
import type { GiftHoldParams } from '../../utils/giftHold';
import { GiftPaymentForm } from './GiftPaymentForm';
import { formatCents } from '../../utils/currency';
import { showAlert } from '../../utils/dialog';

interface Props {
  visible: boolean;
  onClose: () => void;
  businessId: string;
  recipient: { id: string; name: string };
  conversationId?: string | null;
  /** The card is on hold (the offer is on its way to the recipient's chat). */
  onSent: () => void;
}

/** Web card step: px the sheet spends outside the Stripe field area, keyboard closed / open (see cardChrome in the component). */
const CARD_CHROME = 334;
const CARD_CHROME_KEYBOARD = 184;

const MAX_QTY = 10;
const MAX_LINES = 10;

export function GiftSheet({ visible, onClose, businessId, recipient, conversationId, onSent }: Props): React.ReactElement {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  // Web card step: the sheet's own `maxHeight: '88%'` has no definite parent height there, so Stripe's tall form (card, country,
  // postal code, Link) pushed the buttons off the screen. The card step scrolls inside a pixel cap instead (it is never shown on devices).
  const { height: windowHeight } = useWindowDimensions();
  // Web card step + on-screen keyboard: Safari does not shrink the layout viewport, only the visual one, so the sheet is lifted
  // by the keyboard's height and capped to what the visual viewport still shows. The chat composer's useVisualViewportInset is
  // measured against <body> (already fitted to the visible area) and answers 0 for a fixed modal, hence useKeyboardCover. On devices
  // the hook answers 0 and none of this is applied.
  const keyboardInset = useKeyboardCover();
  const { t } = useTranslation('chat');
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  // Once the offer exists its items are locked; a cancelled payment retries the SAME offer.
  const [offerId, setOfferId] = useState<string | null>(null);
  // True once the card is on hold: from then on the offer belongs to the recipient's chat and must not be cancelled.
  const heldRef = useRef(false);
  // Web only: the PaymentIntent to confirm with the card form (null = the picker is shown), and whether the card is being
  // confirmed right now (the sheet cannot be closed then: a hold could land on a cancelled offer).
  const [payParams, setPayParams] = useState<GiftHoldParams | null>(null);
  const [payBusy, setPayBusy] = useState(false);

  // Web card step only (payParams is never set on devices). The keyboard counts as open past 100 px: below that it is just
  // Safari's address bar moving.
  const onCardStep = Platform.OS === 'web' && payParams !== null;
  const keyboardOpen = onCardStep && keyboardInset > 100;
  const visibleHeight = onCardStep && typeof window !== 'undefined' && window.visualViewport ? window.visualViewport.height : windowHeight;
  const cardSheetMaxHeight = Math.max(240, Math.floor(visibleHeight - 24));
  // What the sheet spends OUTSIDE Stripe's field area (paddings, header, titles, Pay + Back buttons, fine print), measured on a phone
  // with the real PaymentElement. The field area gets the rest (never under 160 px: card number, expiry and CVC), scrolling on its own
  // past that, so the buttons never leave the screen. With the keyboard open the header carries the short pay title and the hint,
  // the form title and the fine print are folded.
  const cardChrome = keyboardOpen ? CARD_CHROME_KEYBOARD : CARD_CHROME;
  const cardFieldMaxHeight = Math.max(160, Math.min(420, cardSheetMaxHeight - cardChrome));
  const cardScrollMaxHeight = Math.max(240, cardSheetMaxHeight - (keyboardOpen ? 60 : 118));

  // Every opening starts clean (the offer of a previous opening was either sent or cancelled).
  useEffect(() => {
    if (visible) return;
    setOfferId(null);
    setQty({});
    setNote('');
    setPayParams(null);
    setPayBusy(false);
    heldRef.current = false;
  }, [visible]);

  /** An offer that never got paid is cancelled so it stops blocking the next gift to this person. */
  const cancelUnpaidOffer = useCallback(
    (id: string | null) => {
      if (!id || heldRef.current) return;
      void cancelGiftOffer(id);
      setOfferId(null);
    },
    [],
  );

  const handleClose = useCallback(() => {
    if (payBusy) return; // the card is being confirmed (web): wait for the answer
    cancelUnpaidOffer(offerId);
    onClose();
  }, [cancelUnpaidOffer, offerId, onClose, payBusy]);

  /** Web: the card is on hold — the offer now belongs to the recipient's chat (never cancelled from here). */
  const handleHeld = useCallback(() => {
    heldRef.current = true;
    setPayParams(null);
    setPayBusy(false);
    onSent();
  }, [onSent]);

  /** Web: "Volver" from the card form without paying → the unpaid offer is cancelled; the picker comes back. */
  const handlePayBack = useCallback(() => {
    cancelUnpaidOffer(offerId);
    setPayParams(null);
  }, [cancelUnpaidOffer, offerId]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setLoading(true);
    void getMenu(businessId)
      .then((cats) => {
        if (alive) setCategories(cats.map((cat) => ({ ...cat, items: cat.items.filter((i) => !i.has_modifiers) })).filter((cat) => cat.items.length > 0));
      })
      .catch(() => {
        if (alive) setCategories([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [visible, businessId]);

  const priceById = useMemo(() => {
    const map = new Map<string, number>();
    categories.forEach((cat) => cat.items.forEach((i) => map.set(i.id, i.price_cents)));
    return map;
  }, [categories]);

  const lines = useMemo(() => Object.entries(qty).filter(([, n]) => n > 0), [qty]);
  const count = lines.reduce((sum, [, n]) => sum + n, 0);
  const subtotal = lines.reduce((sum, [id, n]) => sum + (priceById.get(id) ?? 0) * n, 0);
  const locked = offerId !== null;

  // Web card step heading: "Pagar Mini Corn Dogs · $X" (first two items, "+N" for the rest). The amount is the server's total.
  const cardTitle = useMemo(() => {
    if (!payParams) return undefined;
    const nameById = new Map<string, string>();
    categories.forEach((cat) => cat.items.forEach((i) => nameById.set(i.id, i.name)));
    const names = lines.map(([id]) => nameById.get(id)).filter((n): n is string => Boolean(n));
    if (names.length === 0) return t('gift.payTitle');
    const items = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
    return t('gift.payTitleFor', { items, amount: formatCents(payParams.totalCents) });
  }, [payParams, categories, lines, t]);

  const change = useCallback(
    (id: string, delta: number) => {
      if (locked) return;
      setQty((prev) => {
        const next = Math.max(0, Math.min(MAX_QTY, (prev[id] ?? 0) + delta));
        const lineCount = Object.entries({ ...prev, [id]: next }).filter(([, n]) => n > 0).length;
        if (lineCount > MAX_LINES) return prev;
        return { ...prev, [id]: next };
      });
    },
    [locked],
  );

  const handleSend = useCallback(async () => {
    if (sending || count === 0) return;
    setSending(true);
    try {
      let id = offerId;
      if (!id) {
        const created = await createGiftOffer({
          businessId,
          toUserId: recipient.id,
          items: lines.map(([menu_item_id, n]) => ({ menu_item_id, qty: n })),
          note,
          conversationId,
        });
        id = created.id;
        setOfferId(id);
      }
      if (Platform.OS === 'web') {
        // Web: no native PaymentSheet. The server creates the SAME hold PaymentIntent and the card form (Stripe.js) confirms it.
        const hold = await fetchGiftHold(id);
        if (hold.ok) {
          setPayParams(hold);
          return;
        }
        const knownWeb = giftErrorCode(hold.code) ?? giftErrorCode(hold.message);
        showAlert(t('gift.errorTitle'), knownWeb ? t(`gift.errors.${knownWeb}`) : hold.message);
        return;
      }
      const result = await holdGiftPayment(id);
      if (result.ok) {
        heldRef.current = true;
        onSent();
        return;
      }
      if (result.code === 'Canceled') {
        // Payment sheet dismissed without paying: drop the offer; "Send" creates a fresh one.
        cancelUnpaidOffer(id);
        return;
      }
      const known = giftErrorCode(result.code) ?? giftErrorCode(result.message);
      showAlert(t('gift.errorTitle'), known ? t(`gift.errors.${known}`) : result.message);
    } catch (err) {
      const known = giftErrorCode(err);
      showAlert(t('gift.errorTitle'), t(known ? `gift.errors.${known}` : 'gift.errors.generic'));
    } finally {
      setSending(false);
    }
  }, [sending, count, offerId, businessId, recipient.id, lines, note, conversationId, onSent, cancelUnpaidOffer, t]);

  const sendLabel = t('gift.send', { count, amount: formatCents(subtotal) });
  const holdNote = t('gift.holdNote', { name: recipient.name });

  return (
    <AppModal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable accessible={false} style={styles.overlay} onPress={handleClose} accessibilityRole="none" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={onCardStep ? { paddingBottom: keyboardInset } : undefined}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: c.bgSurface, paddingBottom: (keyboardOpen ? 0 : insets.bottom) + 12 },
            onCardStep && { maxHeight: cardSheetMaxHeight },
          ]}
        >
          {keyboardOpen ? null : <View style={[styles.handle, { backgroundColor: c.borderSubtle }]} />}
          <View style={styles.header}>
            <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1} accessibilityRole="header">
              {keyboardOpen && cardTitle ? cardTitle : t('gift.title', { name: recipient.name })}
            </Text>
            <Pressable onPress={handleClose} accessibilityRole="button" accessibilityLabel={t('gift.close')} style={styles.closeBtn}>
              <IconX size={22} color={c.textSecondary} />
            </Pressable>
          </View>
          {keyboardOpen ? null : <Text style={[styles.hint, { color: c.textSecondary }]}>{t('gift.hint')}</Text>}

          {payParams ? (
            // Web only: the card step. `payParams` is never set on devices (they use the native PaymentSheet).
            <ScrollView style={[styles.payScroll, { maxHeight: cardScrollMaxHeight }]} keyboardShouldPersistTaps="handled">
              <GiftPaymentForm
                title={cardTitle}
                compact={keyboardOpen}
                fieldMaxHeight={cardFieldMaxHeight}
                note={holdNote}
                clientSecret={payParams.clientSecret}
                publishableKey={payParams.publishableKey}
                totalCents={payParams.totalCents}
                onHeld={handleHeld}
                onCancel={handlePayBack}
                onBusyChange={setPayBusy}
              />
            </ScrollView>
          ) : (
          <>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {loading ? (
              <Spinner color={c.brandText} style={styles.loader} />
            ) : categories.length === 0 ? (
              <Text style={[styles.empty, { color: c.textSecondary }]}>{t('gift.emptyMenu')}</Text>
            ) : (
              categories.map((cat) => (
                <View key={cat.id}>
                  <Text style={[styles.category, { color: c.textTertiary }]}>{cat.name}</Text>
                  {cat.items.map((item) => {
                    const n = qty[item.id] ?? 0;
                    return (
                      <View key={item.id} style={[styles.itemRow, { borderBottomColor: c.borderSubtle }]}>
                        <View style={styles.itemText}>
                          <Text style={[styles.itemName, { color: c.textPrimary }]} numberOfLines={2}>
                            {item.name}
                          </Text>
                          <Text style={[styles.itemPrice, { color: c.textSecondary }]}>
                            {formatCents(item.price_cents)}
                            {item.id_required ? `  ·  ${t('gift.idRequired')}` : ''}
                          </Text>
                        </View>
                        <View style={styles.stepper}>
                          <Pressable
                            onPress={() => change(item.id, -1)}
                            disabled={locked || n === 0}
                            accessibilityRole="button"
                            accessibilityLabel={t('gift.less', { name: item.name })}
                            style={[styles.stepBtn, { borderColor: c.borderSubtle, opacity: locked || n === 0 ? 0.35 : 1 }]}
                          >
                            <IconMinus size={18} color={c.textPrimary} />
                          </Pressable>
                          <Text style={[styles.qty, { color: c.textPrimary }]}>{n}</Text>
                          <Pressable
                            onPress={() => change(item.id, 1)}
                            disabled={locked || n >= MAX_QTY}
                            accessibilityRole="button"
                            accessibilityLabel={t('gift.more', { name: item.name })}
                            style={[styles.stepBtn, { borderColor: c.borderSubtle, opacity: locked ? 0.35 : 1 }]}
                          >
                            <IconPlus size={18} color={c.textPrimary} />
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>

          <TextInput
            value={note}
            onChangeText={setNote}
            editable={!locked}
            maxLength={200}
            placeholder={t('gift.notePlaceholder')}
            placeholderTextColor={c.textTertiary}
            style={[styles.note, { color: c.textPrimary, borderColor: c.borderSubtle }]}
            accessibilityLabel={t('gift.notePlaceholder')}
          />

          <Pressable
            onPress={() => void handleSend()}
            disabled={sending || count === 0}
            accessibilityRole="button"
            accessibilityLabel={sendLabel}
            style={({ pressed }) => [styles.sendBtn, { backgroundColor: c.brandFill, opacity: sending || count === 0 ? 0.5 : pressed ? 0.85 : 1 }]}
          >
            {sending ? <Spinner color={palette.onBrand} /> : <Text style={[styles.sendLabel, { color: palette.onBrand }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{sendLabel}</Text>}
          </Pressable>
          <Text style={[styles.fine, { color: c.textSecondary }]}>{holdNote}</Text>
          </>
          )}
        </View>
      </KeyboardAvoidingView>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: palette.scrimMedium },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingHorizontal: 16, gap: 8 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1, fontSize: 18, fontWeight: '800' },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 13, lineHeight: 18 },
  list: { flexGrow: 0, maxHeight: 340 },
  payScroll: { flexGrow: 0, flexShrink: 1 },
  loader: { paddingVertical: 32 },
  empty: { textAlign: 'center', paddingVertical: 32, fontSize: 14 },
  category: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 10, marginBottom: 2 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  itemText: { flex: 1, gap: 2 },
  itemName: { fontSize: 15, fontWeight: '600' },
  itemPrice: { fontSize: 13 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  qty: { minWidth: 22, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  note: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  sendBtn: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  sendLabel: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  fine: { fontSize: 12, textAlign: 'center' },
});
