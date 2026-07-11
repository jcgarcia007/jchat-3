/**
 * JChat 3.0 — CartScreen (Task 3.4)
 *
 * Full-screen cart review before checkout.
 * Accessed via navigation.navigate('Cart') from CartBar / MenuScreen header.
 * Route is registered in AppNavigator (do NOT edit navigator here).
 *
 * ── Sections ──────────────────────────────────────────────────────────────────
 * 1. Header — back button + title "Your Order"
 * 2. Empty state — when no lines; "Browse menu" navigates back.
 * 3. Order type selector — Table / Counter / Gift (3 equal cards, required).
 * 4. Gift recipient picker — appears only when orderType === 'gift'.
 * 5. Items list — name, options, price, qty −/+, trash delete button.
 * 6. Promo code field — validate against `offers` table; show discount.
 * 7. Totals — Subtotal · Discount · Tax (8% stub) · Total.
 * 8. "Proceed to Checkout" button — disabled until order type + gift recipient
 *    are chosen.
 *
 * ── Stubs ─────────────────────────────────────────────────────────────────────
 * // TODO: tax rate from business location (currently hardcoded 8%).
 * // TODO: gift user picker — queries room members from `room_members` table;
 *          falls back to a manual user-id input when not configured.
 *
 * Colors: useThemeColors() + palette tokens — NO hardcoded hex.
 * Icons: @tabler/icons-react-native.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  IconArrowLeft,
  IconArmchair,
  IconGift,
  IconMinus,
  IconPlus,
  IconShoppingBag,
  IconTrash,
} from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useCart } from '../../context/CartContext';
import type { CartLine, OrderType } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { getTaxRateForBusiness, DEFAULT_TAX_RATE } from '../../services/tax';
import type { MainStackParamList } from '../../navigation/AppNavigator';

// ── Types ─────────────────────────────────────────────────────────────────────

type CartNav = NativeStackNavigationProp<MainStackParamList>;

interface RoomUser {
  userId: string;
  displayName: string;
  username: string;
}

interface PromoResult {
  valid: boolean;
  discountCents: number;
  /** Human-readable label, e.g. "20% off" or "−$5.00" */
  label: string;
  error?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Tax rate is resolved per business via getTaxRateForBusiness (localized).

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function buildOptionsLabel(line: CartLine, notePrefix: string): string {
  const parts: string[] = [];
  if (line.size) parts.push(line.size.label);
  for (const extra of line.extras) parts.push(extra.label);
  if (line.specialInstructions) parts.push(`${notePrefix} ${line.specialInstructions}`);
  return parts.join(' · ');
}

// ── Order type card data ──────────────────────────────────────────────────────

type OrderCardLabelKey = 'cart.orderTable' | 'cart.orderCounter' | 'cart.orderGift';
type OrderCardSubKey = 'cart.orderTableSub' | 'cart.orderCounterSub' | 'cart.orderGiftSub';

interface OrderTypeCard {
  type: OrderType;
  labelKey: OrderCardLabelKey;
  sublabelKey: OrderCardSubKey;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
}

const ORDER_TYPE_CARDS: OrderTypeCard[] = [
  {
    type: 'table',
    labelKey: 'cart.orderTable',
    sublabelKey: 'cart.orderTableSub',
    Icon: IconArmchair,
  },
  {
    type: 'counter',
    labelKey: 'cart.orderCounter',
    sublabelKey: 'cart.orderCounterSub',
    Icon: IconShoppingBag,
  },
  // 'gift' hidden for now (gift features deferred to P0-2/P0-3). The OrderType and the
  // gift recipient picker logic stay intact so it can be re-enabled by restoring this card.
];

// ── Sub-components ────────────────────────────────────────────────────────────

interface QtyButtonProps {
  onPress: () => void;
  disabled?: boolean;
  icon: 'minus' | 'plus';
}

function QtyButton({ onPress, disabled = false, icon }: QtyButtonProps) {
  const c = useThemeColors();
  const active = !disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.qtyBtn,
        {
          backgroundColor: active ? palette.brandLight : c.bgElevated,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {icon === 'minus' ? (
        <IconMinus size={16} color={active ? palette.brand : c.textTertiary} strokeWidth={2.5} />
      ) : (
        <IconPlus size={16} color={active ? palette.brand : c.textTertiary} strokeWidth={2.5} />
      )}
    </Pressable>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CartScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('pos');
  const navigation = useNavigation<CartNav>();
  const { user } = useAuth();

  const {
    lines,
    orderType,
    giftRecipientId,
    promoCode,
    subtotalCents,
    roomId,
    businessId,
    updateQty,
    removeLine,
    setOrderType,
    setGiftRecipient,
    setPromoCode,
  } = useCart();

  // ── Local state ─────────────────────────────────────────────────────────────

  const [promoInput, setPromoInput] = useState(promoCode ?? '');
  const [promoResult, setPromoResult] = useState<PromoResult | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);

  // Localized tax rate, resolved from the business (Stage 3 cleanup).
  const [taxRate, setTaxRate] = useState<number>(DEFAULT_TAX_RATE);
  useEffect(() => {
    let cancelled = false;
    getTaxRateForBusiness(businessId).then((rate) => {
      if (!cancelled) setTaxRate(rate);
    });
    return () => { cancelled = true; };
  }, [businessId]);

  // Gift recipient picker state
  const [roomUsers, setRoomUsers] = useState<RoomUser[]>([]);
  const [roomUsersLoading, setRoomUsersLoading] = useState(false);
  const [giftPickerOpen, setGiftPickerOpen] = useState(false);

  // ── Load room users when gift mode is active ────────────────────────────────

  useEffect(() => {
    if (orderType !== 'gift' || !roomId) return;
    if (!isSupabaseConfigured) {
      // Demo fallback — no real users available without Supabase
      setRoomUsers([]);
      return;
    }

    let cancelled = false;
    setRoomUsersLoading(true);

    async function loadRoomUsers() {
      try {
        // TODO(presence): use a room_members table once live presence exists.
        // Heuristic: recent message authors in this room as a proxy for members.
        // Correct schema: messages.user_id → users (not sender_id/profiles).
        const { data, error } = await supabase
          .from('messages')
          .select('user_id, users:user_id(display_name, username)')
          .eq('room_id', roomId!)
          .neq('user_id', user?.id ?? '')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        if (cancelled) return;

        // De-duplicate by user_id
        const seen = new Set<string>();
        const users: RoomUser[] = [];
        for (const row of (data ?? []) as unknown as Array<{
          user_id: string;
          users: { display_name: string | null; username: string } | null;
        }>) {
          if (seen.has(row.user_id)) continue;
          seen.add(row.user_id);
          users.push({
            userId: row.user_id,
            displayName: row.users?.display_name ?? row.users?.username ?? t('cart.userFallback'),
            username: row.users?.username ?? '',
          });
        }
        setRoomUsers(users);
      } catch (err) {
        console.warn('[CartScreen] loadRoomUsers error:', err);
      } finally {
        if (!cancelled) setRoomUsersLoading(false);
      }
    }

    void loadRoomUsers();
    return () => { cancelled = true; };
  }, [orderType, roomId, user?.id, t]);

  // ── Promo code validation ────────────────────────────────────────────────────

  const handleApplyPromo = useCallback(async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;

    if (!isSupabaseConfigured) {
      // Demo mode: accept any code with a flat 10% discount
      const discount = Math.round(subtotalCents * 0.1);
      setPromoResult({ valid: true, discountCents: discount, label: t('cart.demoDiscount') });
      setPromoCode(code);
      return;
    }

    setPromoLoading(true);
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('offers')
        .select('id, title, discount_type, discount_value, min_order_cents, expires_at')
        .eq('code', code)
        .eq('status', 'active')
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setPromoResult({ valid: false, discountCents: 0, label: '', error: t('cart.invalidCode') });
        setPromoCode(null);
        return;
      }

      // Check minimum order
      const minOrder: number = (data as { min_order_cents: number | null }).min_order_cents ?? 0;
      if (subtotalCents < minOrder) {
        setPromoResult({
          valid: false,
          discountCents: 0,
          label: '',
          error: t('cart.minOrder', { amount: formatCents(minOrder) }),
        });
        setPromoCode(null);
        return;
      }

      // Compute discount
      const offer = data as {
        discount_type: 'percent' | 'fixed';
        discount_value: number;
        title: string;
      };
      let discountCents = 0;
      let label = '';

      if (offer.discount_type === 'percent') {
        discountCents = Math.round(subtotalCents * (offer.discount_value / 100));
        label = t('cart.percentOff', { value: offer.discount_value });
      } else {
        discountCents = Math.min(offer.discount_value, subtotalCents);
        label = t('cart.fixedOff', { amount: formatCents(offer.discount_value) });
      }

      setPromoResult({ valid: true, discountCents, label });
      setPromoCode(code);
    } catch (err) {
      console.warn('[CartScreen] applyPromo error:', err);
      Alert.alert(t('shared.errorTitle'), t('cart.promoValidateError'));
    } finally {
      setPromoLoading(false);
    }
  }, [promoInput, subtotalCents, setPromoCode, t]);

  const handleClearPromo = useCallback(() => {
    setPromoInput('');
    setPromoResult(null);
    setPromoCode(null);
  }, [setPromoCode]);

  // ── Totals ───────────────────────────────────────────────────────────────────

  const discountCents = promoResult?.valid ? promoResult.discountCents : 0;
  const afterDiscount = Math.max(0, subtotalCents - discountCents);
  // Localized tax rate (from business.tax_rate or address).
  const taxCents = Math.round(afterDiscount * taxRate);
  const totalCents = afterDiscount + taxCents;

  // ── Checkout eligibility ─────────────────────────────────────────────────────

  const canCheckout = useMemo(() => {
    if (lines.length === 0) return false;
    if (orderType === 'gift') return !!giftRecipientId;
    return true; // table or counter — no extra requirement
  }, [lines.length, orderType, giftRecipientId]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleBrowseMenu = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleIncrement = useCallback((lineId: string, qty: number) => {
    updateQty(lineId, qty + 1);
  }, [updateQty]);

  const handleDecrement = useCallback((lineId: string, qty: number) => {
    if (qty <= 1) {
      Alert.alert(
        t('cart.removeItemTitle'),
        t('cart.removeItemMessage'),
        [
          { text: t('actions.cancel', { ns: 'common' }), style: 'cancel' },
          { text: t('cart.remove'), style: 'destructive', onPress: () => removeLine(lineId) },
        ],
      );
    } else {
      updateQty(lineId, qty - 1);
    }
  }, [updateQty, removeLine, t]);

  const handleDelete = useCallback((lineId: string, itemName: string) => {
    Alert.alert(
      t('cart.removeItemTitle'),
      t('cart.removeItemNamed', { name: itemName }),
      [
        { text: t('actions.cancel', { ns: 'common' }), style: 'cancel' },
        { text: t('cart.remove'), style: 'destructive', onPress: () => removeLine(lineId) },
      ],
    );
  }, [removeLine, t]);

  const handleSelectOrderType = useCallback((type: OrderType) => {
    setOrderType(type);
    if (type !== 'gift') {
      setGiftRecipient(null);
    }
  }, [setOrderType, setGiftRecipient]);

  const handleSelectGiftRecipient = useCallback((userId: string) => {
    setGiftRecipient(userId);
    setGiftPickerOpen(false);
  }, [setGiftRecipient]);

  const handleProceedToCheckout = useCallback(() => {
    if (!canCheckout) return;
    // Checkout is registered in AppNavigator (Task 3.5).
    // Use CommonActions.navigate so the route name isn't checked against
    // the current stack's ParamList — avoids TS error before the screen exists.
    navigation.dispatch(CommonActions.navigate({ name: 'Checkout' }));
  }, [canCheckout, navigation]);

  // ── Render: cart line item ───────────────────────────────────────────────────

  const renderLine = useCallback(({ item: line }: { item: CartLine }) => {
    const optionsLabel = buildOptionsLabel(line, t('cart.notePrefix'));
    return (
      <View style={[styles.lineRow, { backgroundColor: c.bgSurface, borderBottomColor: c.borderSubtle }]}>
        {/* Left: name + options */}
        <View style={styles.lineInfo}>
          <Text style={[styles.lineName, { color: c.textPrimary }]} numberOfLines={2}>
            {line.item.name}
          </Text>
          {optionsLabel ? (
            <Text style={[styles.lineOptions, { color: c.textSecondary }]} numberOfLines={2}>
              {optionsLabel}
            </Text>
          ) : null}
          <Text style={[styles.lineUnitPrice, { color: c.textSecondary }]}>
            {t('cart.each', { price: formatCents(line.unitPriceCents) })}
          </Text>
        </View>

        {/* Right: qty controls + line total + delete */}
        <View style={styles.lineControls}>
          {/* Qty row */}
          <View style={styles.qtyRow}>
            <QtyButton
              icon="minus"
              onPress={() => handleDecrement(line.lineId, line.qty)}
            />
            <Text style={[styles.qtyCount, { color: c.textPrimary }]}>
              {line.qty}
            </Text>
            <QtyButton
              icon="plus"
              onPress={() => handleIncrement(line.lineId, line.qty)}
            />
          </View>

          {/* Line total */}
          <Text style={[styles.lineTotal, { color: c.textPrimary }]}>
            {formatCents(line.unitPriceCents * line.qty)}
          </Text>

          {/* Delete */}
          <Pressable
            onPress={() => handleDelete(line.lineId, line.item.name)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('cart.removeA11y', { name: line.item.name })}
            style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <IconTrash size={18} color={c.danger} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    );
  }, [c, handleDecrement, handleIncrement, handleDelete, t]);

  const keyExtractor = useCallback((line: CartLine) => line.lineId, []);

  // ── Render: empty state ──────────────────────────────────────────────────────

  if (lines.length === 0) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bgBase }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: c.bgSurface, borderBottomColor: c.borderSubtle }]}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('shared.goBack')}
            hitSlop={8}
          >
            <IconArrowLeft size={24} color={c.textPrimary} strokeWidth={2} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: c.textPrimary }]}>
            {t('cart.yourOrder')}
          </Text>
          <View style={styles.headerBtn} />
        </View>

        {/* Empty */}
        <View style={styles.emptyContainer}>
          <IconShoppingBag size={56} color={c.textTertiary} strokeWidth={1.5} />
          <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
            {t('cart.emptyTitle')}
          </Text>
          <Text style={[styles.emptySubtitle, { color: c.textSecondary }]}>
            {t('cart.emptySubtitle')}
          </Text>
          <Pressable
            onPress={handleBrowseMenu}
            style={({ pressed }) => [
              styles.browseButton,
              { backgroundColor: palette.brand, opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('cart.browseMenuA11y')}
          >
            <Text style={styles.browseButtonText}>{t('cart.browseMenu')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render: full cart ────────────────────────────────────────────────────────

  const selectedGiftUser = roomUsers.find((u) => u.userId === giftRecipientId);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bgBase }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { backgroundColor: c.bgSurface, borderBottomColor: c.borderSubtle }]}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('shared.goBack')}
            hitSlop={8}
          >
            <IconArrowLeft size={24} color={c.textPrimary} strokeWidth={2} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: c.textPrimary }]}>
            {t('cart.yourOrder')}
          </Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Order type selector ── */}
          <View style={[styles.section, { backgroundColor: c.bgSurface }]}>
            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
              {t('cart.orderTypeTitle')}
            </Text>
            <View style={styles.orderTypeRow}>
              {ORDER_TYPE_CARDS.map(({ type, labelKey, sublabelKey, Icon }) => {
                const isSelected = orderType === type;
                const label = t(labelKey);
                const sublabel = t(sublabelKey);
                return (
                  <Pressable
                    key={type}
                    onPress={() => handleSelectOrderType(type)}
                    style={({ pressed }) => [
                      styles.orderTypeCard,
                      {
                        borderColor: isSelected ? palette.brand : c.borderSubtle,
                        backgroundColor: isSelected ? palette.brandLight : c.bgElevated,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={t('cart.orderTypeCardA11y', { label, sublabel })}
                  >
                    <Icon
                      size={24}
                      color={isSelected ? palette.brand : c.textSecondary}
                      strokeWidth={isSelected ? 2.5 : 2}
                    />
                    <Text
                      style={[
                        styles.orderTypeLabel,
                        { color: isSelected ? palette.brand : c.textPrimary },
                      ]}
                    >
                      {label}
                    </Text>
                    <Text style={[styles.orderTypeSublabel, { color: c.textSecondary }]}>
                      {sublabel}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ── Gift recipient picker ── */}
          {orderType === 'gift' ? (
            <View style={[styles.section, { backgroundColor: c.bgSurface }]}>
              <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
                {t('cart.sendGiftTo')}
              </Text>

              {/* Selected recipient chip */}
              {giftRecipientId && selectedGiftUser ? (
                <View style={styles.recipientRow}>
                  <View style={[styles.recipientChip, { backgroundColor: palette.brandLight, borderColor: palette.brand }]}>
                    <Text style={[styles.recipientName, { color: palette.brand }]}>
                      {selectedGiftUser.displayName}
                    </Text>
                    {selectedGiftUser.username ? (
                      <Text style={[styles.recipientUsername, { color: palette.brandDark }]}>
                        @{selectedGiftUser.username}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => { setGiftRecipient(null); setGiftPickerOpen(true); }}
                    style={({ pressed }) => [styles.changeBtn, { opacity: pressed ? 0.7 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel={t('cart.changeRecipientA11y')}
                  >
                    <Text style={[styles.changeBtnText, { color: palette.brand }]}>
                      {t('cart.change')}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {/* No recipient selected yet */}
              {!giftRecipientId ? (
                <Pressable
                  onPress={() => setGiftPickerOpen((v) => !v)}
                  style={({ pressed }) => [
                    styles.pickRecipientBtn,
                    { borderColor: c.borderSubtle, backgroundColor: c.bgElevated, opacity: pressed ? 0.8 : 1 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('cart.selectRecipientA11y')}
                >
                  <IconGift size={18} color={c.textSecondary} strokeWidth={2} />
                  <Text style={[styles.pickRecipientText, { color: c.textSecondary }]}>
                    {giftPickerOpen ? t('cart.closePicker') : t('cart.selectRecipient')}
                  </Text>
                </Pressable>
              ) : null}

              {/* User list */}
              {giftPickerOpen && !giftRecipientId ? (
                <View style={[styles.userPickerList, { borderColor: c.borderSubtle }]}>
                  {roomUsersLoading ? (
                    <View style={styles.pickerLoading}>
                      <ActivityIndicator size="small" color={palette.brand} />
                    </View>
                  ) : roomUsers.length === 0 ? (
                    <Text style={[styles.pickerEmpty, { color: c.textTertiary }]}>
                      {isSupabaseConfigured
                        ? t('cart.noOtherUsers')
                        : t('cart.connectSupabase')}
                    </Text>
                  ) : (
                    roomUsers.map((u) => (
                      <Pressable
                        key={u.userId}
                        onPress={() => handleSelectGiftRecipient(u.userId)}
                        style={({ pressed }) => [
                          styles.userPickerRow,
                          { borderBottomColor: c.borderSubtle, opacity: pressed ? 0.7 : 1 },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={t('cart.sendGiftToUserA11y', { name: u.displayName })}
                      >
                        <View style={[styles.avatarCircle, { backgroundColor: palette.brandLight }]}>
                          <Text style={[styles.avatarInitial, { color: palette.brand }]}>
                            {u.displayName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View>
                          <Text style={[styles.userPickerName, { color: c.textPrimary }]}>
                            {u.displayName}
                          </Text>
                          {u.username ? (
                            <Text style={[styles.userPickerUsername, { color: c.textSecondary }]}>
                              @{u.username}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    ))
                  )}
                </View>
              ) : null}

              {/* Required notice */}
              {!giftRecipientId ? (
                <Text style={[styles.recipientRequired, { color: palette.warning }]}>
                  {t('cart.recipientRequired')}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* ── Items list ── */}
          <View style={[styles.section, { backgroundColor: c.bgSurface }]}>
            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
              {t('cart.items')}
            </Text>
            <FlatList
              data={lines}
              keyExtractor={keyExtractor}
              renderItem={renderLine}
              scrollEnabled={false}
              ItemSeparatorComponent={null}
            />
          </View>

          {/* ── Promo code ── */}
          <View style={[styles.section, { backgroundColor: c.bgSurface }]}>
            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
              {t('cart.promoCode')}
            </Text>

            <View style={styles.promoRow}>
              <TextInput
                style={[
                  styles.promoInput,
                  {
                    backgroundColor: c.bgElevated,
                    borderColor: promoResult
                      ? promoResult.valid
                        ? palette.success
                        : palette.danger
                      : c.borderSubtle,
                    color: c.textPrimary,
                  },
                ]}
                placeholder={t('cart.promoPlaceholder')}
                placeholderTextColor={c.textTertiary}
                value={promoInput}
                onChangeText={setPromoInput}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => { void handleApplyPromo(); }}
                editable={!promoResult?.valid}
              />

              {promoResult?.valid ? (
                <Pressable
                  onPress={handleClearPromo}
                  style={({ pressed }) => [
                    styles.promoBtn,
                    { backgroundColor: c.bgElevated, opacity: pressed ? 0.7 : 1 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('cart.removePromoA11y')}
                >
                  <Text style={[styles.promoBtnText, { color: palette.danger }]}>
                    {t('cart.remove')}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => { void handleApplyPromo(); }}
                  disabled={promoLoading || !promoInput.trim()}
                  style={({ pressed }) => [
                    styles.promoBtn,
                    {
                      backgroundColor: promoInput.trim() ? palette.brand : c.bgElevated,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('cart.applyPromoA11y')}
                  accessibilityState={{ disabled: promoLoading || !promoInput.trim() }}
                >
                  {promoLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text
                      style={[
                        styles.promoBtnText,
                        { color: promoInput.trim() ? '#ffffff' : c.textTertiary },
                      ]}
                    >
                      {t('cart.apply')}
                    </Text>
                  )}
                </Pressable>
              )}
            </View>

            {/* Promo feedback */}
            {promoResult ? (
              <Text
                style={[
                  styles.promoFeedback,
                  { color: promoResult.valid ? palette.success : palette.danger },
                ]}
              >
                {promoResult.valid
                  ? t('cart.codeApplied', { label: promoResult.label, amount: formatCents(promoResult.discountCents) })
                  : promoResult.error ?? t('cart.invalidCodeShort')}
              </Text>
            ) : null}
          </View>

          {/* ── Totals ── */}
          <View style={[styles.section, styles.totalsSection, { backgroundColor: c.bgSurface }]}>
            {/* Subtotal */}
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: c.textSecondary }]}>{t('cart.subtotal')}</Text>
              <Text style={[styles.totalValue, { color: c.textPrimary }]}>
                {formatCents(subtotalCents)}
              </Text>
            </View>

            {/* Discount */}
            {discountCents > 0 ? (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: palette.success }]}>
                  {t('cart.discountLabel', { label: promoResult?.label ?? '' })}
                </Text>
                <Text style={[styles.totalValue, { color: palette.success }]}>
                  −{formatCents(discountCents)}
                </Text>
              </View>
            ) : null}

            {/* Tax */}
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: c.textSecondary }]}>
                {/* TODO: tax from business location */}
                {t('cart.taxLabel')}
              </Text>
              <Text style={[styles.totalValue, { color: c.textPrimary }]}>
                {formatCents(taxCents)}
              </Text>
            </View>

            {/* Divider */}
            <View style={[styles.totalDivider, { backgroundColor: c.borderSubtle }]} />

            {/* Total */}
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabelBold, { color: c.textPrimary }]}>{t('cart.total')}</Text>
              <Text style={[styles.totalValueBold, { color: c.textPrimary }]}>
                {formatCents(totalCents)}
              </Text>
            </View>
          </View>

          {/* Bottom padding to clear the sticky button */}
          <View style={{ height: 24 }} />
        </ScrollView>

        {/* ── Checkout button (sticky) ── */}
        <View style={[styles.checkoutBar, { backgroundColor: c.bgSurface, borderTopColor: c.borderSubtle }]}>
          {/* Disabled hint */}
          {!canCheckout && orderType === 'gift' && !giftRecipientId ? (
            <Text style={[styles.checkoutHint, { color: palette.warning }]}>
              {t('cart.checkoutHint')}
            </Text>
          ) : null}

          <Pressable
            onPress={handleProceedToCheckout}
            disabled={!canCheckout}
            style={({ pressed }) => [
              styles.checkoutButton,
              {
                backgroundColor: canCheckout ? palette.brand : c.bgElevated,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={canCheckout ? t('cart.proceedCheckoutA11y', { amount: formatCents(totalCents) }) : t('cart.selectOrderType')}
            accessibilityState={{ disabled: !canCheckout }}
          >
            <Text
              style={[
                styles.checkoutButtonText,
                { color: canCheckout ? '#ffffff' : c.textTertiary },
              ]}
            >
              {canCheckout ? t('cart.proceedCheckout', { amount: formatCents(totalCents) }) : t('cart.selectOrderType')}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },

  // ── Header ────────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    padding: 8,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.1,
  },

  // ── Empty state ───────────────────────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  browseButton: {
    marginTop: 8,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  browseButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // ── Sections ──────────────────────────────────────────────────────────────────
  section: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },

  // ── Order type cards ──────────────────────────────────────────────────────────
  orderTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  orderTypeCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 4,
  },
  orderTypeLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  orderTypeSublabel: {
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 13,
  },

  // ── Gift recipient ────────────────────────────────────────────────────────────
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  recipientChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  recipientName: {
    fontSize: 14,
    fontWeight: '700',
  },
  recipientUsername: {
    fontSize: 12,
  },
  changeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  changeBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pickRecipientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  pickRecipientText: {
    fontSize: 14,
  },
  userPickerList: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 8,
  },
  pickerLoading: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  pickerEmpty: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
  },
  userPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 15,
    fontWeight: '700',
  },
  userPickerName: {
    fontSize: 14,
    fontWeight: '600',
  },
  userPickerUsername: {
    fontSize: 12,
  },
  recipientRequired: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },

  // ── Line items ────────────────────────────────────────────────────────────────
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  lineInfo: {
    flex: 1,
    gap: 3,
  },
  lineName: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  lineOptions: {
    fontSize: 12,
    lineHeight: 16,
  },
  lineUnitPrice: {
    fontSize: 12,
  },
  lineControls: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyCount: {
    fontSize: 15,
    fontWeight: '700',
    minWidth: 20,
    textAlign: 'center',
  },
  lineTotal: {
    fontSize: 15,
    fontWeight: '700',
  },
  deleteBtn: {
    padding: 4,
  },

  // ── Promo code ────────────────────────────────────────────────────────────────
  promoRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  promoInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 1,
  },
  promoBtn: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  promoBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  promoFeedback: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 4,
  },

  // ── Totals ────────────────────────────────────────────────────────────────────
  totalsSection: {
    gap: 10,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  totalLabelBold: {
    fontSize: 17,
    fontWeight: '700',
  },
  totalValueBold: {
    fontSize: 17,
    fontWeight: '700',
  },
  totalDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },

  // ── Checkout bar ──────────────────────────────────────────────────────────────
  checkoutBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  checkoutHint: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  checkoutButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutButtonText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
