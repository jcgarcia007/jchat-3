/**
 * PosApproval — Tab POS F4
 *
 * Pantalla que lista todas las órdenes de clientes sin código que están
 * esperando aprobación (approval_status='awaiting'). El mesero puede:
 *
 *   • Aprobar  → pos_approve_order → imprime comanda + KDS la ve
 *   • Editar   → pos_reject_order(mode='edit') → reconstruye el draft en PosTableHub
 *   • Rechazar → pos_reject_order(mode='reject', reason) → incrementa strike del dispositivo
 *
 * Realtime: canal INSERT+UPDATE en orders filtrado por business_id;
 * recarga cuando llega una orden awaiting nueva o cambia el approval_status.
 *
 * Props (route): businessId, tableId? (pre-filtro), tableLabel?
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { IconArrowLeft, IconCheck, IconEdit, IconX, IconAlertTriangle } from '@tabler/icons-react-native';
import { supabase } from '../../services/supabase';
import {
  posAwaitingOrders,
  posApproveOrder,
  posRejectOrder,
  type PosAwaitingOrder,
} from '../../services/pos';
import type { PosStackParamList } from '../../navigation/PosNavigator';

// ─── Types ────────────────────────────────────────────────────────────────────

type PosApprovalRoute = RouteProp<PosStackParamList, 'PosApproval'>;
type PosApprovalNav   = NativeStackNavigationProp<PosStackParamList, 'PosApproval'>;

type ProcessingState = { orderId: string; action: 'approve' | 'edit' | 'reject' } | null;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PosApprovalScreen(): React.ReactElement {
  const { t }       = useTranslation('settings');
  const navigation  = useNavigation<PosApprovalNav>();
  const route       = useRoute<PosApprovalRoute>();
  const { businessId, tableId, tableLabel } = route.params;

  const [orders, setOrders]       = useState<PosAwaitingOrder[]>([]);
  const [loading, setLoading]     = useState(true);
  const [processing, setProcessing] = useState<ProcessingState>(null);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadOrders = useCallback(async () => {
    try {
      const all = await posAwaitingOrders(businessId);
      // Pre-filter to a specific table when coming from PosTableHub
      const filtered = tableId ? all.filter((o) => o.table_id === tableId) : all;
      setOrders(filtered);
    } catch (err) {
      console.warn('[PosApproval] loadOrders error:', err);
    } finally {
      setLoading(false);
    }
  }, [businessId, tableId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadOrders();
    }, [loadOrders]),
  );

  // ── Realtime ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const ch = supabase
      .channel(`pos-approval-screen-${businessId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as { approval_status?: string } | undefined;
          // Reload whenever something related to awaiting changes
          if (
            payload.eventType === 'INSERT' && row?.approval_status === 'awaiting' ||
            payload.eventType === 'UPDATE'
          ) {
            void loadOrders();
          }
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(ch); };
  }, [businessId, loadOrders]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleApprove = useCallback(async (order: PosAwaitingOrder) => {
    setProcessing({ orderId: order.order_id, action: 'approve' });
    try {
      const result = await posApproveOrder(businessId, order.order_id);
      if (!result.ok) {
        if (result.reason === 'already_processed') {
          Alert.alert(t('pos.approval.alreadyProcessed'));
        } else {
          Alert.alert(t('pos.approval.approveError'));
        }
      } else {
        // The comanda bridge in PosNavigator will catch the UPDATE (awaiting→approved)
        // and trigger the print automatically (claim-based dedup prevents double print).
        Alert.alert(t('pos.approval.sentToKitchen'));
        void loadOrders();
      }
    } finally {
      setProcessing(null);
    }
  }, [businessId, loadOrders, t]);

  const handleEdit = useCallback((order: PosAwaitingOrder) => {
    Alert.alert(
      t('pos.approval.editConfirm'),
      undefined,
      [
        { text: t('pos.approval.cancel'), style: 'cancel' },
        {
          text: t('pos.approval.edit'),
          onPress: async () => {
            setProcessing({ orderId: order.order_id, action: 'edit' });
            try {
              const result = await posRejectOrder(businessId, order.order_id, 'edit');
              if (!result.ok) {
                if (result.reason === 'already_processed') {
                  Alert.alert(t('pos.approval.alreadyProcessed'));
                } else {
                  Alert.alert(t('pos.approval.editError'));
                }
              } else {
                Alert.alert(t('pos.approval.editDone'));
                // Navigate to PosTableHub so the waiter can edit with the pre-loaded draft
                navigation.navigate('PosTableHub', {
                  businessId,
                  businessName: '',
                  tableId: order.table_id,
                  tableLabel: order.table_label,
                  plan: null,
                });
              }
            } finally {
              setProcessing(null);
              void loadOrders();
            }
          },
        },
      ],
    );
  }, [businessId, loadOrders, navigation, t]);

  const handleReject = useCallback((order: PosAwaitingOrder) => {
    const strikes       = order.device_strikes ?? 0;
    const strikeWarning = strikes >= 1
      ? `\n\n${t('pos.approval.strikeWarning', { count: strikes + 1 })}`
      : '';

    Alert.alert(
      t('pos.approval.rejectTitle'),
      t('pos.approval.rejectSubtitle') + strikeWarning,
      [
        { text: t('pos.approval.cancel'), style: 'cancel' },
        {
          text: t('pos.approval.reasonNoStock'),
          onPress: () => void doReject(order, t('pos.approval.reasonNoStock')),
        },
        {
          text: t('pos.approval.reasonSuspicious'),
          onPress: () => void doReject(order, t('pos.approval.reasonSuspicious')),
        },
        {
          text: t('pos.approval.reasonOther'),
          onPress: () => void doReject(order, 'other'),
        },
      ],
    );
  }, [t]); // doReject is stable

  const doReject = useCallback(async (order: PosAwaitingOrder, reason: string) => {
    setProcessing({ orderId: order.order_id, action: 'reject' });
    try {
      const result = await posRejectOrder(businessId, order.order_id, 'reject', reason);
      if (!result.ok) {
        if (result.reason === 'already_processed') {
          Alert.alert(t('pos.approval.alreadyProcessed'));
        } else {
          Alert.alert(t('pos.approval.rejectError'));
        }
      } else {
        void loadOrders();
      }
    } finally {
      setProcessing(null);
    }
  }, [businessId, loadOrders, t]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderItem = useCallback(({ item }: { item: PosAwaitingOrder }) => {
    const isProcessing = processing?.orderId === item.order_id;
    const strikes      = item.device_strikes ?? 0;
    const strikeColor  = strikes > 0 ? '#f59e0b' : '#6b7280';
    const subtotal     = item.subtotal_cents ?? 0;

    return (
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.tableLabel}>{item.table_label}</Text>
            {item.contact_name ? (
              <Text style={styles.contactName}>{item.contact_name}</Text>
            ) : null}
          </View>
          <View style={styles.strikesBadge}>
            {strikes > 0 && (
              <>
                <IconAlertTriangle size={14} color={strikeColor} />
                <Text style={[styles.strikesText, { color: strikeColor }]}>
                  {t('pos.approval.deviceStrikes', { count: strikes })}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Items list */}
        <View style={styles.itemsList}>
          {(item.items ?? []).map((it) => {
            // options shape: { modifiers: [{group_label, choice_labels}] } | null
            const mods = it.options?.modifiers ?? [];
            return (
              <View key={it.order_item_id} style={styles.itemRow}>
                <Text style={styles.itemQty}>×{it.qty}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{it.name}</Text>
                  {mods.map((mod, i) => {
                    const choices = Array.isArray(mod.choice_labels)
                      ? mod.choice_labels.join(', ')
                      : '';
                    if (!choices) return null;
                    return (
                      <Text key={i} style={styles.modifierText}>
                        {mod.group_label ? `${mod.group_label}: ${choices}` : choices}
                      </Text>
                    );
                  })}
                  {it.special_instructions ? (
                    <Text style={styles.noteText}>{it.special_instructions}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        {/* Total */}
        <Text style={styles.total}>
          ${(subtotal / 100).toFixed(2)}
        </Text>

        {/* Action buttons */}
        {isProcessing ? (
          <ActivityIndicator style={{ marginTop: 12 }} />
        ) : (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() => handleReject(item)}
              accessibilityLabel={t('pos.approval.reject')}
            >
              <IconX size={16} color="#ef4444" />
              <Text style={[styles.actionText, { color: '#ef4444' }]}>
                {t('pos.approval.reject')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.editBtn]}
              onPress={() => handleEdit(item)}
              accessibilityLabel={t('pos.approval.edit')}
            >
              <IconEdit size={16} color="#f59e0b" />
              <Text style={[styles.actionText, { color: '#f59e0b' }]}>
                {t('pos.approval.edit')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.approveBtn]}
              onPress={() => void handleApprove(item)}
              accessibilityLabel={t('pos.approval.approve')}
            >
              <IconCheck size={16} color="#fff" />
              <Text style={[styles.actionText, { color: '#fff' }]}>
                {t('pos.approval.approve')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }, [handleApprove, handleEdit, handleReject, processing, t]);

  // ── Render ────────────────────────────────────────────────────────────────

  const title = tableLabel
    ? t('pos.approval.titleTable', { table: tableLabel })
    : t('pos.approval.title');

  return (
    <View style={styles.container}>
      {/* Nav header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityLabel={t('workMode.pinCancel')}
        >
          <IconArrowLeft size={22} color="var(--color-text, #111)" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : orders.length === 0 ? (
        <ScrollView contentContainerStyle={styles.empty}>
          <Text style={styles.emptyText}>{t('pos.approval.empty')}</Text>
        </ScrollView>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.order_id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f5f7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backBtn: {
    padding: 4,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    flex: 1,
  },
  list: {
    padding: 12,
    gap: 12,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 15,
    color: '#9ca3af',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  tableLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  contactName: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  strikesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  strikesText: {
    fontSize: 12,
    fontWeight: '600',
  },
  itemsList: {
    gap: 6,
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: 'row',
    gap: 8,
  },
  itemQty: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    width: 28,
  },
  itemName: {
    fontSize: 14,
    color: '#111',
    fontWeight: '600',
  },
  modifierText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 1,
  },
  noteText: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
    marginTop: 2,
  },
  total: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    textAlign: 'right',
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    borderRadius: 8,
  },
  rejectBtn: {
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
  },
  editBtn: {
    borderWidth: 1,
    borderColor: '#fcd34d',
    backgroundColor: '#fffbeb',
  },
  approveBtn: {
    backgroundColor: '#1D9E75',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
