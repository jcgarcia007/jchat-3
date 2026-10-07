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
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconMinus, IconPlus, IconX } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { getMenu, type MenuCategory } from '../../services/menu';
import { cancelGiftOffer, createGiftOffer, giftErrorCode } from '../../services/giftOffers';
import { holdGiftPayment } from '../../services/stripe';
import { formatCents } from '../../utils/currency';

interface Props {
  visible: boolean;
  onClose: () => void;
  businessId: string;
  recipient: { id: string; name: string };
  conversationId?: string | null;
  /** The card is on hold (the offer is on its way to the recipient's chat). */
  onSent: () => void;
}

const MAX_QTY = 10;
const MAX_LINES = 10;

export function GiftSheet({ visible, onClose, businessId, recipient, conversationId, onSent }: Props): React.ReactElement {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
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

  // Every opening starts clean (the offer of a previous opening was either sent or cancelled).
  useEffect(() => {
    if (visible) return;
    setOfferId(null);
    setQty({});
    setNote('');
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
    cancelUnpaidOffer(offerId);
    onClose();
  }, [cancelUnpaidOffer, offerId, onClose]);

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
      Alert.alert(t('gift.errorTitle'), known ? t(`gift.errors.${known}`) : result.message);
    } catch (err) {
      const known = giftErrorCode(err);
      Alert.alert(t('gift.errorTitle'), t(known ? `gift.errors.${known}` : 'gift.errors.generic'));
    } finally {
      setSending(false);
    }
  }, [sending, count, offerId, businessId, recipient.id, lines, note, conversationId, onSent, cancelUnpaidOffer, t]);

  const sendLabel = t('gift.send', { count, amount: formatCents(subtotal) });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose} accessibilityRole="none" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { backgroundColor: c.bgSurface, paddingBottom: insets.bottom + 12 }]}>
          <View style={[styles.handle, { backgroundColor: c.borderSubtle }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1} accessibilityRole="header">
              {t('gift.title', { name: recipient.name })}
            </Text>
            <Pressable onPress={handleClose} accessibilityRole="button" accessibilityLabel={t('gift.close')} style={styles.closeBtn}>
              <IconX size={22} color={c.textSecondary} />
            </Pressable>
          </View>
          <Text style={[styles.hint, { color: c.textSecondary }]}>{t('gift.hint')}</Text>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {loading ? (
              <ActivityIndicator color={c.brand} style={styles.loader} />
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
            style={({ pressed }) => [styles.sendBtn, { backgroundColor: c.brand, opacity: sending || count === 0 ? 0.5 : pressed ? 0.85 : 1 }]}
          >
            {sending ? <ActivityIndicator color={palette.onBrand} /> : <Text style={[styles.sendLabel, { color: palette.onBrand }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{sendLabel}</Text>}
          </Pressable>
          <Text style={[styles.fine, { color: c.textTertiary }]}>{t('gift.holdNote')}</Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
