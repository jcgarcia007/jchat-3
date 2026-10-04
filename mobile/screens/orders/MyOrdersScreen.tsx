/**
 * JChat 3.0 — MyOrdersScreen
 *
 * The signed-in user's own orders (orders.user_id = me), newest first. Each row shows the
 * real order number, the business, the status and the total; tapping opens OrderTracking.
 * Reachable from Settings ("My orders"), from PaymentSuccess and from the chat header.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { IconArrowLeft, IconReceipt, IconChevronRight } from '@tabler/icons-react-native';

import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useAuth } from '../../context/AuthContext';
import { listMyOrders, myOrderBusinessName, type MyOrderRow } from '../../services/orders';
import { formatCents } from '../../utils/currency';
import { orderStatusLabelKey } from './orderStatus';

type MyOrdersNav = NativeStackNavigationProp<MainStackParamList, 'MyOrders'>;

export default function MyOrdersScreen(): React.ReactElement {
  const c = useThemeColors();
  const { t, i18n } = useTranslation('pos');
  const navigation = useNavigation<MyOrdersNav>();
  const { user } = useAuth();

  const [orders, setOrders] = useState<MyOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(async (asRefresh = false) => {
    if (!user?.id) { setLoading(false); return; }
    const requestId = ++requestRef.current;
    if (asRefresh) setRefreshing(true); else setLoading(true);
    setFailed(false);
    try {
      const rows = await listMyOrders(user.id);
      if (requestId === requestRef.current) setOrders(rows);
    } catch (error) {
      console.warn('[my-orders] load error:', error);
      if (requestId === requestRef.current) setFailed(true);
    } finally {
      if (requestId === requestRef.current) { setLoading(false); setRefreshing(false); }
    }
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const renderOrder = useCallback(({ item }: ListRenderItemInfo<MyOrderRow>) => {
    const business = myOrderBusinessName(item);
    const date = new Date(item.created_at).toLocaleDateString(i18n.language, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('OrderTracking', { orderId: item.id, roomId: item.room_id ?? undefined })}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: c.bgSurface, borderColor: c.borderSubtle, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <View style={styles.rowMain}>
          <Text style={[styles.rowTitle, { color: c.textPrimary }]} numberOfLines={1}>
            {item.order_number != null ? t('success.orderNumberValue', { number: item.order_number }) : t('myOrders.orderFallback')}
            {business ? ` · ${business}` : ''}
          </Text>
          <Text style={[styles.rowMeta, { color: c.textTertiary }]}>{date}</Text>
          <Text style={[styles.rowStatus, { color: c.brand }]}>
            {t(orderStatusLabelKey(item.status, item.approval_status))}
          </Text>
        </View>
        <Text style={[styles.rowTotal, { color: c.textPrimary }]}>{formatCents(item.total_cents)}</Text>
        <IconChevronRight size={18} color={c.textTertiary} />
      </Pressable>
    );
  }, [c, i18n.language, navigation, t]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bgBase }]}>
      <View style={[styles.header, { borderBottomColor: c.borderSubtle }]}>
        <Pressable
          accessibilityLabel={t('shared.goBack')}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <IconArrowLeft size={24} color={c.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: c.textPrimary }]}>{t('myOrders.title')}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={c.brand} size="large" /></View>
      ) : failed && orders.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.message, { color: c.textSecondary }]}>{t('myOrders.loadError')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => { void load(); }}
            style={[styles.retryBtn, { backgroundColor: c.brand }]}
          >
            <Text style={styles.retryText}>{t('myOrders.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[styles.list, orders.length === 0 && styles.emptyList]}
          data={orders}
          keyExtractor={(order) => order.id}
          renderItem={renderOrder}
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
              <IconReceipt size={46} color={c.textTertiary} strokeWidth={1.5} />
              <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>{t('myOrders.emptyTitle')}</Text>
              <Text style={[styles.message, { color: c.textSecondary }]}>{t('myOrders.emptySub')}</Text>
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
  center: { alignItems: 'center', flex: 1, gap: 10, justifyContent: 'center', padding: 24 },
  list: { gap: 10, padding: 16 },
  emptyList: { flexGrow: 1 },
  row: { alignItems: 'center', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, padding: 14 },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowMeta: { fontSize: 12 },
  rowStatus: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  rowTotal: { fontSize: 15, fontWeight: '700' },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  message: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  retryBtn: { borderRadius: 12, marginTop: 6, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: palette.bgSurfaceLight, fontSize: 14, fontWeight: '700' },
});
