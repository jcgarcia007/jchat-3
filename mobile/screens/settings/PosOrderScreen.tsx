/**
 * JChat 3.0 — POS Order Screen
 *
 * Reached after tapping a table in PosHomeScreen.
 * Loads the published menu for the business, lets the waiter build a local
 * cart (tap-to-add, qty +/−, optional note per item), then submits the order
 * via posCreateOrder() — no modifiers at this stage (Task 3.x part B).
 *
 * Layout
 * ──────
 *   ┌─ Header (tableLabel + back) ─────────────────────┐
 *   │ Category tab bar (horizontal scroll)             │
 *   │ Menu item list            (flex 1 — FlatList)    │
 *   └─ Cart panel (always visible at bottom) ──────────┘
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  IconChevronLeft,
  IconMinus,
  IconPlus,
  IconShoppingCart,
} from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { getMenu, type MenuCategory, type MenuItem } from '../../services/menu';
import {
  posCreateOrder,
  type PosCreateOrderError,
  type PosOrderItem,
} from '../../services/pos';
import type { SettingsStackParamList } from '../../navigation/SettingsStack';

// ─── Local types ──────────────────────────────────────────────────────────────

interface CartItem {
  menuItemId: string;
  name: string;
  priceCents: number;
  qty: number;
  note: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Horizontal tab pill for a category */
function TabPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tabPill,
        selected
          ? { backgroundColor: c.brand }
          : { backgroundColor: c.bgSurface, borderColor: c.borderSubtle, borderWidth: 1 },
      ]}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
    >
      <Text
        style={[
          styles.tabPillLabel,
          { color: selected ? '#fff' : c.textSecondary },
          selected && { fontWeight: '600' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A single menu item row in the main list */
function MenuItemRow({
  item,
  onPress,
}: {
  item: MenuItem;
  onPress: () => void;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        { borderBottomColor: c.borderSubtle },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${item.name} — ${formatPrice(item.price_cents)}`}
    >
      <View style={styles.menuRowBody}>
        <Text style={[styles.menuRowName, { color: c.textPrimary }]}>
          {item.name}
        </Text>
        {item.description ? (
          <Text
            numberOfLines={1}
            style={[styles.menuRowDesc, { color: c.textTertiary }]}
          >
            {item.description}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.menuRowPrice, { color: c.brand }]}>
        {formatPrice(item.price_cents)}
      </Text>
    </Pressable>
  );
}

/** A single row in the cart panel */
function CartRow({
  item,
  cartNote,
  onUpdateQty,
  onUpdateNote,
}: {
  item: CartItem;
  cartNote: string;
  onUpdateQty: (menuItemId: string, delta: number) => void;
  onUpdateNote: (menuItemId: string, note: string) => void;
}) {
  const c = useThemeColors();
  return (
    <View style={[styles.cartRow, { borderBottomColor: c.borderSubtle }]}>
      {/* Top row: name + line total */}
      <View style={styles.cartRowTop}>
        <Text
          numberOfLines={1}
          style={[styles.cartRowName, { color: c.textPrimary }]}
        >
          {item.name}
        </Text>
        <Text style={[styles.cartRowTotal, { color: c.textSecondary }]}>
          {formatPrice(item.priceCents * item.qty)}
        </Text>
      </View>
      {/* Bottom row: note input + qty controls */}
      <View style={styles.cartRowBottom}>
        <TextInput
          value={cartNote}
          onChangeText={(v) => onUpdateNote(item.menuItemId, v)}
          placeholder="Note…"
          placeholderTextColor={c.textTertiary}
          maxLength={200}
          returnKeyType="done"
          blurOnSubmit
          style={[
            styles.cartNoteInput,
            {
              color: c.textPrimary,
              backgroundColor: c.bgBase,
              borderColor: c.borderSubtle,
            },
          ]}
        />
        <View style={styles.qtyControls}>
          <Pressable
            onPress={() => onUpdateQty(item.menuItemId, -1)}
            style={styles.qtyButton}
            accessibilityRole="button"
            hitSlop={8}
          >
            <IconMinus size={16} color={c.brand} strokeWidth={2.5} />
          </Pressable>
          <Text style={[styles.qtyValue, { color: c.textPrimary }]}>
            {item.qty}
          </Text>
          <Pressable
            onPress={() => onUpdateQty(item.menuItemId, 1)}
            style={styles.qtyButton}
            accessibilityRole="button"
            hitSlop={8}
          >
            <IconPlus size={16} color={c.brand} strokeWidth={2.5} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type PosOrderNav = NativeStackNavigationProp<SettingsStackParamList, 'PosOrder'>;
type PosOrderRoute = RouteProp<SettingsStackParamList, 'PosOrder'>;

export default function PosOrderScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('settings');
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<PosOrderNav>();
  const route = useRoute<PosOrderRoute>();
  const { businessId, tableId, tableLabel } = route.params;

  // ── Menu state ─────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null); // null = All

  // ── Cart state ─────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // ── Load menu on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    getMenu(businessId)
      .then((cats) => {
        if (mounted) setCategories(cats);
      })
      .catch(() => {
        // Stay empty on error
      })
      .finally(() => {
        if (mounted) setMenuLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [businessId]);

  // ── Filtered items for selected category ───────────────────────────────────
  const filteredItems: MenuItem[] =
    selectedCatId === null
      ? categories.flatMap((cat) => cat.items)
      : (categories.find((cat) => cat.id === selectedCatId)?.items ?? []);

  // ── Cart helpers ───────────────────────────────────────────────────────────

  const addToCart = useCallback((item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.menuItemId === item.id);
      if (existing) {
        return prev.map((ci) =>
          ci.menuItemId === item.id ? { ...ci, qty: ci.qty + 1 } : ci,
        );
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.name,
          priceCents: item.price_cents,
          qty: 1,
          note: '',
        },
      ];
    });
  }, []);

  const updateQty = useCallback((menuItemId: string, delta: number) => {
    setCart((prev) => {
      const next = prev.map((ci) =>
        ci.menuItemId === menuItemId ? { ...ci, qty: ci.qty + delta } : ci,
      );
      return next.filter((ci) => ci.qty > 0);
    });
    // Also clean up note if item removed
    if (delta === -1) {
      setCart((prev) => {
        const found = prev.find((ci) => ci.menuItemId === menuItemId);
        if (found && found.qty - 1 <= 0) {
          setNotes((n) => {
            const copy = { ...n };
            delete copy[menuItemId];
            return copy;
          });
        }
        return prev;
      });
    }
  }, []);

  const updateNote = useCallback((menuItemId: string, note: string) => {
    setNotes((prev) => ({ ...prev, [menuItemId]: note }));
  }, []);

  const subtotal = cart.reduce(
    (sum, ci) => sum + ci.priceCents * ci.qty,
    0,
  );

  // ── Submit order ───────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);

    const items: PosOrderItem[] = cart.map((ci) => {
      const note = (notes[ci.menuItemId] ?? '').trim();
      return {
        menu_item_id: ci.menuItemId,
        qty: ci.qty,
        ...(note ? { special_instructions: note } : {}),
      };
    });

    const result = await posCreateOrder(businessId, tableId, items);
    setSubmitting(false);

    if (result.ok) {
      Alert.alert(t('pos.submitSuccess'), t('pos.submitSuccessMsg'), [
        {
          text: t('pos.submitOk'),
          onPress: () => {
            setCart([]);
            setNotes({});
            navigation.goBack();
          },
        },
      ]);
    } else {
      let errorMsg: string;
      const reason: PosCreateOrderError = result.reason;
      switch (reason) {
        case 'table_not_in_business':
          errorMsg = t('pos.errorTableNotInBusiness');
          break;
        case 'item_not_available':
          errorMsg = t('pos.errorItemNotAvailable');
          break;
        case 'no_valid_items':
          errorMsg = t('pos.errorNoValidItems');
          break;
        case 'no_access':
          errorMsg = t('pos.errorNoAccess');
          break;
        case 'not_configured':
          errorMsg = t('pos.errorNotConfigured');
          break;
        default:
          errorMsg = t('pos.errorDb');
      }
      Alert.alert(t('pos.errorTitle'), errorMsg);
    }
  }, [cart, notes, submitting, businessId, tableId, navigation, t]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const isSubmitDisabled = cart.length === 0 || submitting;

  return (
    <View style={[styles.screen, { backgroundColor: c.bgBase }]}>
      <StatusBar
        barStyle={c.bgBase === palette.bgBase ? 'light-content' : 'dark-content'}
      />

      {/* Header */}
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
          accessibilityLabel={t('workMode.pinCancel')}
        >
          <IconChevronLeft size={24} color={c.brand} strokeWidth={2} />
        </Pressable>
        <Text
          style={[styles.headerTitle, { color: c.textPrimary }]}
          numberOfLines={1}
        >
          {tableLabel}
        </Text>
      </View>

      {/* Menu area (category tabs + item list) */}
      {menuLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.brand} />
        </View>
      ) : (
        <View style={styles.menuArea}>
          {/* Category tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabBar}
            style={[styles.tabBarScroll, { borderBottomColor: c.borderSubtle }]}
            keyboardShouldPersistTaps="handled"
          >
            <TabPill
              label={t('pos.allCategories')}
              selected={selectedCatId === null}
              onPress={() => setSelectedCatId(null)}
            />
            {categories.map((cat) => (
              <TabPill
                key={cat.id}
                label={cat.name}
                selected={selectedCatId === cat.id}
                onPress={() => setSelectedCatId(cat.id)}
              />
            ))}
          </ScrollView>

          {/* Menu items */}
          <FlatList
            style={styles.menuList}
            data={filteredItems}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MenuItemRow item={item} onPress={() => addToCart(item)} />
            )}
            ListEmptyComponent={
              <View style={styles.menuEmpty}>
                <Text style={[styles.menuEmptyText, { color: c.textTertiary }]}>
                  {t('pos.menuEmpty')}
                </Text>
              </View>
            }
            keyboardShouldPersistTaps="handled"
          />
        </View>
      )}

      {/* Cart panel — always visible at the bottom */}
      <View
        style={[
          styles.cartPanel,
          {
            backgroundColor: c.bgSurface,
            borderTopColor: c.borderSubtle,
            paddingBottom: insets.bottom + 8,
          },
        ]}
      >
        {cart.length === 0 ? (
          <View style={styles.cartEmptyRow}>
            <IconShoppingCart size={18} color={c.textTertiary} strokeWidth={1.5} />
            <Text style={[styles.cartEmptyText, { color: c.textTertiary }]}>
              {t('pos.cartEmpty')}
            </Text>
          </View>
        ) : (
          <>
            <ScrollView
              style={styles.cartItemsScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {cart.map((ci) => (
                <CartRow
                  key={ci.menuItemId}
                  item={ci}
                  cartNote={notes[ci.menuItemId] ?? ''}
                  onUpdateQty={updateQty}
                  onUpdateNote={updateNote}
                />
              ))}
            </ScrollView>

            {/* Subtotal row */}
            <View style={[styles.subtotalRow, { borderTopColor: c.borderSubtle }]}>
              <Text style={[styles.subtotalLabel, { color: c.textSecondary }]}>
                {t('pos.cartSubtotal')}
              </Text>
              <Text style={[styles.subtotalValue, { color: c.textPrimary }]}>
                {formatPrice(subtotal)}
              </Text>
            </View>
          </>
        )}

        {/* Submit button */}
        <Pressable
          onPress={handleSubmit}
          disabled={isSubmitDisabled}
          style={({ pressed }) => [
            styles.submitButton,
            { backgroundColor: c.brand },
            isSubmitDisabled && { opacity: 0.45 },
            pressed && !isSubmitDisabled && { opacity: 0.75 },
          ]}
          accessibilityRole="button"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitLabel}>{t('pos.submitButton')}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const H_PAD = 16;

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  backButton: {
    marginRight: 8,
    padding: 4,
  },

  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
  },

  // ── Loading / empty ─────────────────────────────────────────────────────────
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Menu area ───────────────────────────────────────────────────────────────
  menuArea: {
    flex: 1,
  },

  tabBarScroll: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    paddingVertical: 10,
    gap: 8,
  },

  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },

  tabPillLabel: {
    fontSize: 13,
    fontWeight: '400',
  },

  menuList: {
    flex: 1,
  },

  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },

  menuRowBody: {
    flex: 1,
  },

  menuRowName: {
    fontSize: 15,
    fontWeight: '500',
  },

  menuRowDesc: {
    fontSize: 12,
    marginTop: 2,
  },

  menuRowPrice: {
    fontSize: 15,
    fontWeight: '600',
  },

  menuEmpty: {
    padding: 32,
    alignItems: 'center',
  },

  menuEmptyText: {
    fontSize: 14,
    textAlign: 'center',
  },

  // ── Cart panel ──────────────────────────────────────────────────────────────
  cartPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingHorizontal: H_PAD,
  },

  cartEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },

  cartEmptyText: {
    fontSize: 13,
  },

  cartItemsScroll: {
    maxHeight: 220,
  },

  cartRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },

  cartRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  cartRowName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },

  cartRowTotal: {
    fontSize: 14,
    fontWeight: '500',
  },

  cartRowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  cartNoteInput: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 13,
  },

  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  qtyButton: {
    padding: 4,
  },

  qtyValue: {
    fontSize: 15,
    fontWeight: '600',
    minWidth: 20,
    textAlign: 'center',
  },

  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  subtotalLabel: {
    fontSize: 14,
  },

  subtotalValue: {
    fontSize: 16,
    fontWeight: '700',
  },

  // ── Submit button ───────────────────────────────────────────────────────────
  submitButton: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  submitLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
