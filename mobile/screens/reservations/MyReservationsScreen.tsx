/**
 * JChat 3.0 — MyReservationsScreen
 *
 * The signed-in customer's own reservations, in two sections: "Upcoming" (in the future, not cancelled) and "Past"
 * (already happened, or cancelled). A pending or confirmed reservation that has not happened yet can be cancelled
 * from here (the database lets a customer change a reservation's status to 'cancelled' and nothing else).
 * Reachable from Settings ("My reservations") and from the confirmation of a new reservation.
 * Same pattern as screens/orders/MyOrdersScreen.tsx.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
  type SectionListData,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { IconArrowLeft, IconCalendarEvent, IconCheck } from '@tabler/icons-react-native';

import { Spinner } from '../../components/common/Spinner';
import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import {
  cancelMyReservation,
  listMyReservations,
  reservationBusiness,
  type MyReservationRow,
} from '../../services/reservations';
import { confirm } from '../../utils/dialog';
import { colorIndex, initials } from '../../utils/mapPin';
import {
  canCancel,
  formatReservationWhen,
  splitReservations,
  statusLabelKey,
  statusTone,
  type StatusTone,
} from '../../utils/reservationStatus';

type MyReservationsNav = NativeStackNavigationProp<MainStackParamList, 'MyReservations'>;

/** Theme colours of the initials circle (a venue always gets the same one). */
const AVATAR_COLORS = [palette.brand, palette.brandPurple, palette.success, palette.gold];
const NOTICE_MS = 3000;

interface Section {
  key: 'upcoming' | 'past';
  data: MyReservationRow[];
}

export default function MyReservationsScreen(): React.ReactElement {
  const c = useThemeColors();
  const { t, i18n } = useTranslation('reservations');
  const navigation = useNavigation<MyReservationsNav>();

  const [rows, setRows] = useState<MyReservationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  const requestRef = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((text: string, tone: 'success' | 'error') => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ text, tone });
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  const load = useCallback(async (asRefresh = false) => {
    const requestId = ++requestRef.current;
    if (asRefresh) setRefreshing(true); else setLoading(true);
    setFailed(false);
    try {
      const list = await listMyReservations();
      if (requestId === requestRef.current) setRows(list);
    } catch (error) {
      console.warn('[my-reservations] load error:', error);
      if (requestId === requestRef.current) setFailed(true);
    } finally {
      if (requestId === requestRef.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // "Now" is read when the list changes, so a reservation that starts while the screen is open moves on the next refresh.
  const sections = useMemo<Section[]>(() => {
    const { upcoming, past } = splitReservations(rows, new Date());
    return [
      { key: 'upcoming' as const, data: upcoming },
      { key: 'past' as const, data: past },
    ].filter((section) => section.data.length > 0);
  }, [rows]);

  const askToCancel = useCallback(async (item: MyReservationRow) => {
    const business = reservationBusiness(item).name || t('venueFallback');
    const when = formatReservationWhen(item.reserved_at, i18n.language);
    const accepted = await confirm(
      t('confirmCancelTitle'),
      t('confirmCancelBody', { business, when }),
      { confirmText: t('cancelButton'), cancelText: t('keep'), destructive: true },
    );
    if (!accepted) return;
    setCancellingId(item.id);
    try {
      const status = await cancelMyReservation(item.id);
      // Show the new status without reloading the whole list.
      setRows((current) => current.map((row) => (row.id === item.id ? { ...row, status } : row)));
      showNotice(t('cancelled'), 'success');
    } catch (error) {
      console.warn('[my-reservations] cancel error:', error);
      showNotice(t('cancelError'), 'error');
    } finally {
      setCancellingId(null);
    }
  }, [i18n.language, showNotice, t]);

  const toneColor = useCallback((tone: StatusTone): string => {
    if (tone === 'warning') return c.warning;
    if (tone === 'success') return c.success;
    if (tone === 'brand') return c.brandText;
    return c.textSecondary;
  }, [c]);

  const renderItem = useCallback(({ item }: ListRenderItemInfo<MyReservationRow>) => {
    const business = reservationBusiness(item);
    const name = business.name || t('venueFallback');
    const when = formatReservationWhen(item.reserved_at, i18n.language);
    const people = t('people', { count: item.party_size });
    const statusText = t(statusLabelKey(item.status));
    const tone = toneColor(statusTone(item.status));
    const cancellable = canCancel(item, new Date());
    const busy = cancellingId === item.id;
    return (
      <View
        accessible
        accessibilityLabel={t('rowA11y', { business: name, when, people, status: statusText })}
        style={[styles.row, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}
      >
        <View style={styles.rowTop}>
          {business.logoUrl ? (
            <Image source={{ uri: business.logoUrl }} style={styles.avatar} contentFit="cover" accessible={false} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: AVATAR_COLORS[colorIndex(item.business_id, AVATAR_COLORS.length)] }]}>
              <Text style={styles.avatarText}>{initials(name)}</Text>
            </View>
          )}
          <View style={styles.rowMain}>
            <Text style={[styles.rowTitle, { color: c.textPrimary }]} numberOfLines={1}>{name}</Text>
            <Text style={[styles.rowMeta, { color: c.textSecondary }]}>{when}</Text>
            <Text style={[styles.rowMeta, { color: c.textTertiary }]}>{people}</Text>
          </View>
          <View style={styles.chips}>
            <View style={[styles.chip, { borderColor: tone }]}>
              <Text style={[styles.chipText, { color: tone }]}>{statusText}</Text>
            </View>
            {item.is_waitlist ? (
              <View style={[styles.chip, { borderColor: c.textSecondary }]}>
                <Text style={[styles.chipText, { color: c.textSecondary }]}>{t('waitlistChip')}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {cancellable ? (
          <Pressable
            accessibilityLabel={t('cancelA11y', { business: name })}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            onPress={() => { void askToCancel(item); }}
            style={({ pressed }) => [styles.cancelBtn, { borderColor: c.danger, opacity: pressed || busy ? 0.6 : 1 }]}
          >
            {busy ? <Spinner color={c.dangerText} size="small" /> : <Text style={[styles.cancelText, { color: c.dangerText }]}>{t('cancelButton')}</Text>}
          </Pressable>
        ) : null}
      </View>
    );
  }, [askToCancel, c, cancellingId, i18n.language, t, toneColor]);

  const renderSectionHeader = useCallback(({ section }: { section: SectionListData<MyReservationRow, Section> }) => (
    <View style={[styles.sectionHeader, { backgroundColor: c.bgBase, borderBottomColor: c.borderSubtle }]}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: c.textSecondary }]}>
        {t(section.key === 'upcoming' ? 'upcoming' : 'past')}
      </Text>
    </View>
  ), [c, t]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bgBase }]}>
      <View style={[styles.header, { borderBottomColor: c.borderSubtle }]}>
        <Pressable
          accessibilityLabel={t('goBack')}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <IconArrowLeft size={24} color={c.textPrimary} />
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: c.textPrimary }]}>{t('title')}</Text>
      </View>

      {notice ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.notice, { backgroundColor: notice.tone === 'success' ? c.success : c.danger }]}
        >
          {notice.tone === 'success' ? <IconCheck size={18} color={palette.bgSurfaceLight} /> : null}
          <Text style={styles.noticeText}>{notice.text}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}><Spinner color={c.brandText} size="large" /></View>
      ) : failed && rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.message, { color: c.textSecondary }]}>{t('loadError')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => { void load(); }}
            style={[styles.retryBtn, { backgroundColor: c.brandFill }]}
          >
            <Text style={styles.retryText}>{t('retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <SectionList
          contentContainerStyle={[styles.list, sections.length === 0 && styles.emptyList]}
          sections={sections}
          keyExtractor={(row) => row.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          refreshControl={(
            <RefreshControl
              colors={[c.brand]}
              onRefresh={() => { void load(true); }}
              refreshing={refreshing}
              tintColor={c.brand}
            />
          )}
          ListEmptyComponent={(
            <View style={styles.center}>
              <IconCalendarEvent size={46} color={c.textTertiary} strokeWidth={1.5} />
              <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>{t('empty')}</Text>
              <Text style={[styles.message, { color: c.textSecondary }]}>{t('emptySub')}</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 56, paddingHorizontal: 12 },
  backBtn: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  title: { flex: 1, fontSize: 20, fontWeight: '700', marginLeft: 4 },
  notice: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  noticeText: { color: palette.bgSurfaceLight, fontSize: 14, fontWeight: '700' },
  center: { alignItems: 'center', flex: 1, gap: 10, justifyContent: 'center', padding: 24 },
  list: { gap: 10, padding: 16 },
  emptyList: { flexGrow: 1 },
  sectionHeader: { borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 10, marginTop: 6, paddingBottom: 6 },
  sectionTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  row: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, gap: 12, padding: 14 },
  rowTop: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  avatar: { borderRadius: 22, height: 44, width: 44 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: palette.bgSurfaceLight, fontSize: 15, fontWeight: '800' },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowMeta: { fontSize: 13 },
  chips: { alignItems: 'flex-end', gap: 6 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: 12, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', borderRadius: 12, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 16 },
  cancelText: { fontSize: 14, fontWeight: '700' },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  message: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  retryBtn: { borderRadius: 12, marginTop: 6, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: palette.bgSurfaceLight, fontSize: 14, fontWeight: '700' },
});
