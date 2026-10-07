/**
 * JChat 3.0 — GiftCard (the gift inside a 1:1 chat, both sides)
 *
 * Reads gift_offer_view (the recipient never gets a price; the sender never gets the table) and keeps
 * itself fresh (realtime on the offer + a 1 s timer while it is open). States: waiting for the answer ·
 * accepted/preparing · not accepted · expired · paid. The recipient answers "No, thanks" / "Accept";
 * accepting asks "Which table are you at?" (number required, details optional, 21+ notice when needed).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { IconGift, IconX } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { supabase, isSupabaseConfigured, channelTopic } from '../../services/supabase';
import { giftErrorCode, giftItemPhotos, respondGiftOffer, viewGiftOffer, type GiftView } from '../../services/giftOffers';

function mmss(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface Props {
  offerId: string;
}

export function GiftCard({ offerId }: Props): React.ReactElement {
  const c = useThemeColors();
  const { t } = useTranslation('chat');
  const [view, setView] = useState<GiftView | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const v = await viewGiftOffer(offerId);
    if (v) setView(v);
    else setFailed(true);
  }, [offerId]);

  useEffect(() => {
    void refresh();
    if (!isSupabaseConfigured) return;
    const channel = supabase
      .channel(channelTopic(`gift-card:${offerId}`))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'gift_offers', filter: `id=eq.${offerId}` }, () => void refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [offerId, refresh]);

  // Safety net: realtime on gift_offers (migration 207) is what updates the card in ~1 s; an open card also re-reads itself
  // every 30 s while the offer can still change state, in case a socket hiccup swallowed an event.
  const open = view?.status === 'awaiting_payment' || view?.status === 'held' || view?.status === 'accepted';
  useEffect(() => {
    if (!open || !isSupabaseConfigured) return;
    const id = setInterval(() => void refresh(), 30000);
    return () => clearInterval(id);
  }, [open, refresh]);

  // 1 s timer only while the offer is waiting for an answer.
  const waiting = view?.status === 'held';
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [waiting]);

  const secondsLeft = view?.expires_at ? Math.round((new Date(view.expires_at).getTime() - now) / 1000) : 0;
  const expiredLocally = waiting && secondsLeft <= 0;

  const title = useMemo(() => {
    if (!view) return '';
    return view.items.length === 1 ? view.items[0].name : t('giftCard.nItems', { count: view.item_count });
  }, [view, t]);

  const decline = useCallback(async () => {
    if (!view || busy) return;
    setBusy(true);
    try {
      await respondGiftOffer(view.id, false);
    } catch (err) {
      const known = giftErrorCode(err);
      Alert.alert(t('gift.errorTitle'), t(known ? `gift.errors.${known}` : 'gift.errors.generic'));
    } finally {
      setBusy(false);
      void refresh();
    }
  }, [view, busy, refresh, t]);

  if (failed && !view) {
    return (
      <View style={[styles.card, { backgroundColor: c.bgElevated, borderColor: c.borderSubtle }]}>
        <Text style={[styles.status, { color: c.textSecondary }]}>{t('giftCard.unavailable')}</Text>
      </View>
    );
  }
  if (!view) {
    return (
      <View style={[styles.card, styles.loading, { backgroundColor: c.bgElevated, borderColor: c.borderSubtle }]}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  const status = view.status === 'held' && expiredLocally ? 'expired' : view.status;
  const headline = view.is_sender
    ? t('giftCard.sent', { title })
    : t('giftCard.received', { name: view.from.name, title });
  const statusText = (() => {
    switch (status) {
      case 'held':
        return view.is_sender ? t('giftCard.waitingSender') : t('giftCard.waitingRecipient', { time: mmss(secondsLeft) });
      case 'accepted':
        return view.is_sender ? t('giftCard.senderAccepted', { name: view.to.name }) : t('giftCard.accepted');
      case 'paid':
        return view.is_sender ? t('giftCard.senderAccepted', { name: view.to.name }) : t('giftCard.paid');
      case 'declined':
        return view.is_sender ? t('giftCard.senderDeclined', { name: view.to.name }) : t('giftCard.declined');
      case 'expired':
        return view.is_sender ? t('giftCard.senderExpired', { name: view.to.name }) : t('giftCard.expired');
      default:
        return t('giftCard.cancelled');
    }
  })();
  const canRespond = !view.is_sender && status === 'held';

  return (
    <View style={[styles.card, { backgroundColor: c.bgElevated, borderColor: c.borderSubtle }]}>
      <View style={styles.top}>
        <View style={[styles.iconWrap, { backgroundColor: c.brandLight }]}>
          <IconGift size={22} color={c.brand} strokeWidth={2} />
        </View>
        <Text style={[styles.headline, { color: c.textPrimary }]}>{headline}</Text>
      </View>
      <Text style={[styles.status, { color: status === 'held' || status === 'accepted' || status === 'paid' ? c.brand : c.textSecondary }]} accessibilityLiveRegion="polite">
        {statusText}
      </Text>

      <Pressable onPress={() => setDetailsOpen(true)} accessibilityRole="button" style={styles.detailsBtn}>
        <Text style={[styles.detailsLabel, { color: c.brand }]}>{t('giftCard.details')}</Text>
      </Pressable>

      {canRespond ? (
        <View style={styles.actions}>
          <Pressable
            testID="gift-decline"
            onPress={() => void decline()}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [styles.actionBtn, { borderWidth: 1, borderColor: c.borderSubtle, opacity: pressed || busy ? 0.7 : 1 }]}
          >
            <Text style={[styles.actionLabel, { color: c.textPrimary }]}>{t('giftCard.decline')}</Text>
          </Pressable>
          <Pressable
            testID="gift-accept"
            onPress={() => setAcceptOpen(true)}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [styles.actionBtn, { backgroundColor: c.brand, opacity: pressed || busy ? 0.7 : 1 }]}
          >
            <Text style={[styles.actionLabel, { color: palette.onBrand }]}>{t('giftCard.accept')}</Text>
          </Pressable>
        </View>
      ) : null}

      <GiftDetailsSheet visible={detailsOpen} onClose={() => setDetailsOpen(false)} view={view} />
      <GiftAcceptSheet
        visible={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        view={view}
        onDone={() => {
          setAcceptOpen(false);
          void refresh();
        }}
      />
    </View>
  );
}

// ── Details ───────────────────────────────────────────────────────────────────

function GiftDetailsSheet({ visible, onClose, view }: { visible: boolean; onClose: () => void; view: GiftView }): React.ReactElement {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('chat');
  const [photos, setPhotos] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void giftItemPhotos(view.items.map((i) => i.menu_item_id)).then((p) => {
      if (alive) setPhotos(p);
    });
    return () => {
      alive = false;
    };
  }, [visible, view.items]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityRole="none" />
      <View style={[styles.sheet, { backgroundColor: c.bgSurface, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: c.textPrimary }]} accessibilityRole="header">
            {t('giftCard.detailsTitle')}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('gift.close')} style={styles.closeBtn}>
            <IconX size={22} color={c.textSecondary} />
          </Pressable>
        </View>
        <ScrollView style={styles.detailsList}>
          {view.items.map((item) => (
            <View key={item.menu_item_id} style={[styles.itemRow, { borderBottomColor: c.borderSubtle }]}>
              {photos[item.menu_item_id] ? (
                <Image source={{ uri: photos[item.menu_item_id] }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, { backgroundColor: c.bgElevated }]} />
              )}
              <View style={styles.itemText}>
                <Text style={[styles.itemName, { color: c.textPrimary }]}>
                  {item.qty} × {item.name}
                </Text>
                {item.description ? (
                  <Text style={[styles.itemDesc, { color: c.textSecondary }]}>{item.description}</Text>
                ) : null}
                {item.id_required ? <Text style={[styles.idBadge, { color: c.warning }]}>{t('gift.idRequired')}</Text> : null}
              </View>
            </View>
          ))}
          {view.note ? (
            <View style={[styles.noteBox, { backgroundColor: c.bgElevated }]}>
              <Text style={[styles.noteLabel, { color: c.textTertiary }]}>{t('giftCard.note')}</Text>
              <Text style={[styles.noteText, { color: c.textPrimary }]}>{view.note}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Accept: "Which table are you at?" ─────────────────────────────────────────

function GiftAcceptSheet({
  visible,
  onClose,
  view,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  view: GiftView;
  onDone: () => void;
}): React.ReactElement {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('chat');
  const [table, setTable] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const needsId = view.items.some((i) => i.id_required);

  const confirm = useCallback(async () => {
    if (sending || !table.trim()) return;
    setSending(true);
    try {
      await respondGiftOffer(view.id, true, table, details);
      onDone();
    } catch (err) {
      const known = giftErrorCode(err);
      Alert.alert(t('gift.errorTitle'), t(known ? `gift.errors.${known}` : 'gift.errors.generic'));
      if (known === 'gift_expired' || known === 'gift_not_open') onDone();
    } finally {
      setSending(false);
    }
  }, [sending, table, details, view.id, onDone, t]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityRole="none" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { backgroundColor: c.bgSurface, paddingBottom: insets.bottom + 12 }]}>
<ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 10 }}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: c.textPrimary }]} accessibilityRole="header">
              {t('giftCard.tableTitle')}
            </Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('gift.close')} style={styles.closeBtn}>
              <IconX size={22} color={c.textSecondary} />
            </Pressable>
          </View>
          <TextInput
            value={table}
            onChangeText={setTable}
            maxLength={40}
            placeholder={t('giftCard.tablePlaceholder')}
            placeholderTextColor={c.textTertiary}
            style={[styles.input, { color: c.textPrimary, borderColor: c.borderSubtle }]}
            accessibilityLabel={t('giftCard.tablePlaceholder')}
          />
          <TextInput
            value={details}
            onChangeText={setDetails}
            maxLength={200}
            placeholder={t('giftCard.detailsPlaceholder')}
            placeholderTextColor={c.textTertiary}
            style={[styles.input, { color: c.textPrimary, borderColor: c.borderSubtle }]}
            accessibilityLabel={t('giftCard.detailsPlaceholder')}
          />
          {needsId ? <Text style={[styles.idNotice, { color: c.warning }]}>{t('giftCard.idNotice')}</Text> : null}
          <Pressable
            onPress={() => void confirm()}
            disabled={sending || !table.trim()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.confirmBtn, { backgroundColor: c.brand, opacity: sending || !table.trim() ? 0.5 : pressed ? 0.85 : 1 }]}
          >
            {sending ? <ActivityIndicator color={palette.onBrand} /> : <Text style={[styles.confirmLabel, { color: palette.onBrand }]}>{t('giftCard.confirmAccept')}</Text>}
          </Pressable>
        </ScrollView>
</View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 320, borderRadius: 16, borderWidth: 1, padding: 14, gap: 8, marginVertical: 4, alignSelf: 'center' },
  loading: { minHeight: 88, alignItems: 'center', justifyContent: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headline: { flex: 1, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  status: { fontSize: 13, fontWeight: '600' },
  detailsBtn: { minHeight: 44, justifyContent: 'center' },
  detailsLabel: { fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 15, fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: palette.scrimMedium },
  sheet: { maxHeight: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 16, gap: 10 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { flex: 1, fontSize: 18, fontWeight: '800' },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  detailsList: { flexGrow: 0 },
  itemRow: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  photo: { width: 64, height: 64, borderRadius: 12 },
  itemText: { flex: 1, gap: 2 },
  itemName: { fontSize: 15, fontWeight: '700' },
  itemDesc: { fontSize: 13, lineHeight: 18 },
  idBadge: { fontSize: 12, fontWeight: '700' },
  noteBox: { borderRadius: 12, padding: 12, marginTop: 10, gap: 4 },
  noteLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  noteText: { fontSize: 14, lineHeight: 20 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  idNotice: { fontSize: 13, lineHeight: 18 },
  confirmBtn: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  confirmLabel: { fontSize: 16, fontWeight: '800' },
});
