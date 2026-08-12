/**
 * JChat 3.0 — POS Inventory Screen (Fase 3+4 móvil)
 *
 * Warehouse-optimised inventory management screen for POS employees with the
 * `inventory_manage` permission (or owners).
 *
 * Flows:
 *   List  → tap item → AdjustSheet (mode: count / receive / waste)
 *   List  → "Escanear código" → BarcodeScanner
 *     ├─ match  → AdjustSheet (item pre-selected)
 *     └─ no match → LinkSheet → pick item → link barcode → AdjustSheet
 *
 * i18n: 'inventory' namespace (ES + EN).
 *
 * ⚠️ EAS rebuild required: expo-camera is a native module not available in Expo Go.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import {
  IconBarcode,
  IconChevronLeft,
  IconPackage,
  IconSearch,
  IconX,
} from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import {
  posApplyStockMovement,
  posGetInventory,
  posLinkBarcode,
  type PosInventoryItem,
  type PosStockMode,
} from '../../services/pos';
import type { PosStackParamList } from '../../navigation/PosNavigator';
import BarcodeScanner from '../../components/pos/BarcodeScanner';

// ─── Navigation types ─────────────────────────────────────────────────────────

type PosInventoryNav = NativeStackNavigationProp<PosStackParamList, 'PosInventory'>;
type PosInventoryRoute = RouteProp<PosStackParamList, 'PosInventory'>;

// ─── AdjustSheet ──────────────────────────────────────────────────────────────

interface AdjustSheetProps {
  item: PosInventoryItem;
  businessId: string;
  onDone: (newStock: number) => void;
  onClose: () => void;
}

function AdjustSheet({ item, businessId, onDone, onClose }: AdjustSheetProps) {
  const c = useThemeColors();
  const { t } = useTranslation('inventory');

  const [mode, setMode] = useState<PosStockMode>('count');
  const [qty, setQty] = useState(String(item.stock_count ?? 0));
  const [note, setNote] = useState('');
  const [applying, setApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successStock, setSuccessStock] = useState<number | null>(null);

  const MODES: PosStockMode[] = ['count', 'receive', 'waste'];
  const modeLabel: Record<PosStockMode, string> = {
    count:   t('sheet.modeCount'),
    receive: t('sheet.modeReceive'),
    waste:   t('sheet.modeWaste'),
  };
  const modeHint: Record<PosStockMode, string> = {
    count:   t('sheet.modeCountHint'),
    receive: t('sheet.modeReceiveHint'),
    waste:   t('sheet.modeWasteHint'),
  };

  const handleApply = useCallback(async () => {
    const quantity = parseInt(qty, 10);
    if (isNaN(quantity) || quantity < 0) {
      setErrorMsg(t('errors.bad_quantity'));
      return;
    }
    setErrorMsg(null);
    setApplying(true);
    try {
      const result = await posApplyStockMovement(
        businessId,
        item.id,
        mode,
        quantity,
        note.trim() || undefined,
      );
      if (!result.ok) {
        setErrorMsg(t(`errors.${result.reason}` as const, { defaultValue: t('errors.generic') }));
        return;
      }
      setSuccessStock(result.newStock);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Auto-dismiss after 1.8 s
      setTimeout(() => onDone(result.newStock), 1800);
    } catch {
      setErrorMsg(t('errors.generic'));
    } finally {
      setApplying(false);
    }
  }, [businessId, item.id, mode, qty, note, t, onDone]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.sheetContainer, { backgroundColor: c.bgSurface }]}
    >
      <View style={[styles.sheetHandle, { backgroundColor: c.borderSubtle }]} />

      {/* Header */}
      <View style={styles.sheetHeader}>
        <Text style={[styles.sheetTitle, { color: c.textPrimary }]} numberOfLines={2}>
          {item.name}
        </Text>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('scanner.close')}
        >
          <IconX size={24} color={c.textTertiary} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
        {/* Current stock */}
        <View style={[styles.currentStockRow, { backgroundColor: c.bgBase, borderColor: c.borderSubtle }]}>
          <Text style={[styles.currentStockLabel, { color: c.textTertiary }]}>
            {t('sheet.currentStock')}
          </Text>
          <Text style={[styles.currentStockValue, { color: c.textPrimary }]}>
            {item.stock_count ?? 0}
          </Text>
        </View>

        {/* Mode selector */}
        <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>
          {/* spacer */}
        </Text>
        <View style={styles.modeRow}>
          {MODES.map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={({ pressed }) => [
                styles.modeChip,
                {
                  backgroundColor: mode === m ? c.brand : c.bgBase,
                  borderColor: mode === m ? c.brand : c.borderSubtle,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ checked: mode === m }}
            >
              <Text
                style={[
                  styles.modeChipText,
                  { color: mode === m ? '#fff' : c.textSecondary },
                ]}
              >
                {modeLabel[m]}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.modeHint, { color: c.textTertiary }]}>
          {modeHint[mode]}
        </Text>

        {/* Quantity input */}
        <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>
          {t('sheet.qtyLabel')}
        </Text>
        <TextInput
          style={[styles.qtyInput, { color: c.textPrimary, backgroundColor: c.bgBase, borderColor: c.borderSubtle }]}
          value={qty}
          onChangeText={setQty}
          keyboardType="number-pad"
          returnKeyType="done"
          maxLength={7}
          accessibilityLabel={t('sheet.qtyLabel')}
        />

        {/* Note */}
        <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>
          {t('sheet.noteLabel')}
        </Text>
        <TextInput
          style={[styles.noteInput, { color: c.textPrimary, backgroundColor: c.bgBase, borderColor: c.borderSubtle }]}
          value={note}
          onChangeText={setNote}
          placeholder={t('sheet.notePlaceholder')}
          placeholderTextColor={c.textTertiary}
          maxLength={200}
          multiline
          numberOfLines={2}
          returnKeyType="done"
          accessibilityLabel={t('sheet.noteLabel')}
        />

        {/* Error / success */}
        {errorMsg ? (
          <Text style={[styles.errorText, { color: c.danger }]}>{errorMsg}</Text>
        ) : null}
        {successStock !== null ? (
          <Text style={[styles.successText, { color: c.success }]}>
            {t('sheet.newStock', { count: successStock })}
          </Text>
        ) : null}

        {/* Apply button */}
        <Pressable
          onPress={() => void handleApply()}
          disabled={applying || successStock !== null}
          style={({ pressed }) => [
            styles.applyBtn,
            {
              backgroundColor: c.brand,
              opacity: applying || successStock !== null ? 0.6 : pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.applyBtnText}>
            {applying ? t('sheet.applying') : t('sheet.apply')}
          </Text>
        </Pressable>

        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── LinkSheet ────────────────────────────────────────────────────────────────

interface LinkSheetProps {
  scannedCode: string;
  items: PosInventoryItem[];
  businessId: string;
  onLinked: (item: PosInventoryItem) => void;
  onDismiss: () => void;
}

function LinkSheet({ scannedCode, items, businessId, onLinked, onDismiss }: LinkSheetProps) {
  const c = useThemeColors();
  const { t } = useTranslation('inventory');
  const [search, setSearch] = useState('');
  const [linking, setLinking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      search.trim()
        ? items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
        : items,
    [items, search],
  );

  const handleLink = useCallback(
    async (item: PosInventoryItem) => {
      setLinking(true);
      setErrorMsg(null);
      try {
        const result = await posLinkBarcode(businessId, item.id, scannedCode);
        if (!result.ok) {
          setErrorMsg(t(`errors.${result.reason}` as const, { defaultValue: t('errors.generic') }));
          return;
        }
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onLinked({ ...item, barcode: scannedCode });
      } catch {
        setErrorMsg(t('errors.generic'));
      } finally {
        setLinking(false);
      }
    },
    [businessId, scannedCode, t, onLinked],
  );

  return (
    <View style={[styles.sheetContainer, { backgroundColor: c.bgSurface }]}>
      <View style={[styles.sheetHandle, { backgroundColor: c.borderSubtle }]} />

      <View style={styles.sheetHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sheetTitle, { color: c.textPrimary }]}>
            {t('link.unknownTitle')}
          </Text>
          <Text style={[styles.linkCodeText, { color: c.textTertiary }]}>
            {t('link.unknownMsg', { code: scannedCode })}
          </Text>
        </View>
        <Pressable onPress={onDismiss} hitSlop={12} accessibilityRole="button">
          <IconX size={24} color={c.textTertiary} strokeWidth={2} />
        </Pressable>
      </View>

      <Text style={[styles.linkPickTitle, { color: c.textSecondary }]}>
        {t('link.pickTitle')}
      </Text>

      {/* Search */}
      <View style={[styles.linkSearch, { backgroundColor: c.bgBase, borderColor: c.borderSubtle }]}>
        <IconSearch size={18} color={c.textTertiary} strokeWidth={2} />
        <TextInput
          style={[styles.linkSearchInput, { color: c.textPrimary }]}
          value={search}
          onChangeText={setSearch}
          placeholder={t('link.searchPlaceholder')}
          placeholderTextColor={c.textTertiary}
          returnKeyType="search"
        />
      </View>

      {errorMsg ? (
        <Text style={[styles.errorText, { color: c.danger, marginHorizontal: 16 }]}>
          {errorMsg}
        </Text>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        style={styles.linkList}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => void handleLink(item)}
            disabled={linking}
            style={({ pressed }) => [
              styles.linkItemRow,
              { borderColor: c.borderSubtle, opacity: pressed ? 0.7 : 1 },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.linkItemName, { color: c.textPrimary }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.linkItemStock, { color: c.textTertiary }]}>
              {item.stock_count ?? 0}
            </Text>
          </Pressable>
        )}
        ItemSeparatorComponent={() => (
          <View style={[styles.sep, { backgroundColor: c.borderSubtle }]} />
        )}
      />
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PosInventoryScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('inventory');
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<PosInventoryNav>();
  const route = useRoute<PosInventoryRoute>();
  const { businessId, businessName } = route.params;

  // ── Data ─────────────────────────────────────────────────────────────────
  const [items, setItems] = useState<PosInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Filters ──────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [lowOnly, setLowOnly] = useState(false);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [scannerOpen, setScannerOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState<PosInventoryItem | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null); // barcode with no match

  // ── Load ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const rows = await posGetInventory(businessId);
      setItems(rows);
    } catch {
      setErrorMsg(t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [businessId, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = items;
    if (query.trim()) {
      const lq = query.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(lq));
    }
    if (lowOnly) {
      list = list.filter(
        (i) => (i.stock_count ?? 0) <= i.low_stock_threshold,
      );
    }
    return list;
  }, [items, query, lowOnly]);

  // ── Barcode scan handler ──────────────────────────────────────────────────
  const handleScanned = useCallback(
    (code: string) => {
      const match = items.find((i) => i.barcode === code);
      if (match) {
        setScannerOpen(false);
        setAdjustItem(match);
      } else {
        setScannerOpen(false);
        setLinkCode(code);
      }
    },
    [items],
  );

  // ── After adjustment, update local list ───────────────────────────────────
  const handleAdjustDone = useCallback(
    (newStock: number) => {
      if (adjustItem) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === adjustItem.id ? { ...i, stock_count: newStock } : i,
          ),
        );
      }
      setAdjustItem(null);
    },
    [adjustItem],
  );

  // ── After link, open adjust sheet for the newly linked item ───────────────
  const handleLinked = useCallback((item: PosInventoryItem) => {
    setLinkCode(null);
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? item : i)),
    );
    setAdjustItem(item);
  }, []);

  // ── Render item ───────────────────────────────────────────────────────────
  const renderItem = ({ item }: { item: PosInventoryItem }) => {
    const isLow = (item.stock_count ?? 0) <= item.low_stock_threshold;
    const stockColor = isLow ? c.danger : c.textPrimary;

    return (
      <Pressable
        onPress={() => setAdjustItem(item)}
        style={({ pressed }) => [
          styles.itemRow,
          { borderColor: c.borderSubtle, opacity: pressed ? 0.75 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${t('stockLabel')} ${item.stock_count ?? 0}`}
      >
        <View style={styles.itemLeft}>
          <Text style={[styles.itemName, { color: c.textPrimary }]} numberOfLines={2}>
            {item.name}
          </Text>
          {item.barcode ? (
            <Text style={[styles.itemBarcode, { color: c.textTertiary }]} numberOfLines={1}>
              {item.barcode}
            </Text>
          ) : null}
        </View>
        <View style={styles.itemRight}>
          <Text style={[styles.itemStock, { color: stockColor }]}>
            {item.stock_count ?? 0}
          </Text>
          {isLow ? (
            <View style={[styles.lowBadge, { backgroundColor: c.danger + '20', borderColor: c.danger + '44' }]}>
              <Text style={[styles.lowBadgeText, { color: c.danger }]}>
                {t('badgeLow')}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: c.bgBase }]}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 12,
            backgroundColor: c.bgBase,
            borderBottomColor: c.borderSubtle,
          },
        ]}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('scanner.close')}
        >
          <IconChevronLeft size={24} color={c.brand} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: c.textPrimary }]} numberOfLines={1}>
          {t('title')}
        </Text>

        {/* Scan button */}
        <Pressable
          onPress={() => setScannerOpen(true)}
          style={({ pressed }) => [styles.scanButton, { opacity: pressed ? 0.65 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={t('scanBtn')}
        >
          <IconBarcode size={26} color={c.brand} strokeWidth={2} />
        </Pressable>
      </View>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <View style={[styles.filterBar, { backgroundColor: c.bgSurface, borderBottomColor: c.borderSubtle }]}>
        {/* Search */}
        <View style={[styles.searchBox, { backgroundColor: c.bgBase, borderColor: c.borderSubtle }]}>
          <IconSearch size={17} color={c.textTertiary} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: c.textPrimary }]}
            value={query}
            onChangeText={setQuery}
            placeholder={t('searchPlaceholder')}
            placeholderTextColor={c.textTertiary}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        {/* Low stock toggle */}
        <Pressable
          onPress={() => setLowOnly((v) => !v)}
          style={({ pressed }) => [
            styles.lowFilter,
            {
              backgroundColor: lowOnly ? c.danger + '20' : c.bgBase,
              borderColor: lowOnly ? c.danger : c.borderSubtle,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: lowOnly }}
        >
          <Text style={[styles.lowFilterText, { color: lowOnly ? c.danger : c.textSecondary }]}>
            {t('filterLow')}
          </Text>
        </Pressable>
      </View>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.brand} />
        </View>
      ) : errorMsg ? (
        <View style={styles.center}>
          <Text style={[styles.errorBody, { color: c.danger }]}>{errorMsg}</Text>
          <Pressable onPress={() => void load()} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.retryText, { color: c.brand }]}>{t('loadError')}</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <IconPackage size={48} color={c.textTertiary} strokeWidth={1.5} />
          <Text style={[styles.emptyText, { color: c.textTertiary }]}>{t('noItems')}</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: c.textTertiary }]}>
            {t('noMatch', { query })}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => (
            <View style={[styles.sep, { backgroundColor: c.borderSubtle }]} />
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* ── Big scan FAB ─────────────────────────────────────────────────── */}
      {!loading && !errorMsg && items.length > 0 ? (
        <Pressable
          onPress={() => setScannerOpen(true)}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: c.brand, bottom: insets.bottom + 20, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('scanBtn')}
        >
          <IconBarcode size={26} color="#fff" strokeWidth={2} />
          <Text style={styles.fabText}>{t('scanBtn')}</Text>
        </Pressable>
      ) : null}

      {/* ── Scanner modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={scannerOpen}
        animationType="slide"
        onRequestClose={() => setScannerOpen(false)}
        statusBarTranslucent
      >
        <BarcodeScanner
          onScanned={handleScanned}
          onClose={() => setScannerOpen(false)}
        />
      </Modal>

      {/* ── Adjust sheet modal ────────────────────────────────────────────── */}
      <Modal
        visible={adjustItem !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setAdjustItem(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setAdjustItem(null)}
        >
          <Pressable style={styles.modalSheetWrapper} onPress={() => { /* stop propagation */ }}>
            {adjustItem ? (
              <AdjustSheet
                item={adjustItem}
                businessId={businessId}
                onDone={handleAdjustDone}
                onClose={() => setAdjustItem(null)}
              />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Link-barcode sheet modal ──────────────────────────────────────── */}
      <Modal
        visible={linkCode !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setLinkCode(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setLinkCode(null)}
        >
          <Pressable style={styles.modalSheetWrapper} onPress={() => { /* stop propagation */ }}>
            {linkCode ? (
              <LinkSheet
                scannedCode={linkCode}
                items={items}
                businessId={businessId}
                onLinked={handleLinked}
                onDismiss={() => setLinkCode(null)}
              />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const H_PAD = 16;

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { marginRight: 8, padding: 4 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '600' },
  scanButton: { padding: 6, marginLeft: 4 },

  // ── Filters ──────────────────────────────────────────────────────────────────
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  searchInput: { flex: 1, fontSize: 15 },
  lowFilter: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lowFilterText: { fontSize: 13, fontWeight: '600' },

  // ── Body ─────────────────────────────────────────────────────────────────────
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyText: { fontSize: 15, textAlign: 'center' },
  errorBody: { fontSize: 15, textAlign: 'center' },
  retryText: { fontSize: 15, fontWeight: '600' },

  // ── Item row ─────────────────────────────────────────────────────────────────
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemLeft: { flex: 1, gap: 2 },
  itemName: { fontSize: 17, fontWeight: '500' },
  itemBarcode: { fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  itemRight: { alignItems: 'flex-end', gap: 4, marginLeft: 12 },
  itemStock: { fontSize: 22, fontWeight: '700', minWidth: 36, textAlign: 'right' },

  // ── Low stock badge ────────────────────────────────────────────────────────────
  lowBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  lowBadgeText: { fontSize: 11, fontWeight: '700' },

  sep: { height: StyleSheet.hairlineWidth },

  // ── FAB ──────────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    left: H_PAD,
    right: H_PAD,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: 18,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  fabText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  // ── Sheet modal ────────────────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheetWrapper: { maxHeight: '92%' },

  sheetContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: H_PAD,
    paddingVertical: 14,
    gap: 12,
  },
  sheetTitle: { flex: 1, fontSize: 19, fontWeight: '700' },
  sheetScroll: { maxHeight: 560 },

  currentStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: H_PAD,
    marginBottom: 18,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  currentStockLabel: { fontSize: 14 },
  currentStockValue: { fontSize: 28, fontWeight: '800' },

  modeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: H_PAD,
    marginBottom: 6,
  },
  modeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  modeChipText: { fontSize: 14, fontWeight: '600' },
  modeHint: { fontSize: 12, paddingHorizontal: H_PAD, marginBottom: 18 },

  fieldLabel: { fontSize: 13, fontWeight: '600', paddingHorizontal: H_PAD, marginBottom: 6 },
  qtyInput: {
    marginHorizontal: H_PAD,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 18,
  },
  noteInput: {
    marginHorizontal: H_PAD,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 16,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  errorText: { fontSize: 14, paddingHorizontal: H_PAD, marginBottom: 10, textAlign: 'center' },
  successText: { fontSize: 16, fontWeight: '700', paddingHorizontal: H_PAD, marginBottom: 10, textAlign: 'center' },
  applyBtn: {
    marginHorizontal: H_PAD,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  applyBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  // ── Link sheet ────────────────────────────────────────────────────────────────
  linkCodeText: { fontSize: 13, marginTop: 4 },
  linkPickTitle: { fontSize: 13, fontWeight: '600', paddingHorizontal: H_PAD, marginBottom: 8 },
  linkSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: H_PAD,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    marginBottom: 8,
  },
  linkSearchInput: { flex: 1, fontSize: 15 },
  linkList: { maxHeight: 320 },
  linkItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linkItemName: { flex: 1, fontSize: 16 },
  linkItemStock: { fontSize: 14, marginLeft: 12 },
});
