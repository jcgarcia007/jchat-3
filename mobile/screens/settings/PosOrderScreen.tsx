/**
 * JChat 3.0 — POS Order Screen
 *
 * Reached from PosHomeScreen after tapping a table.
 * Shows category tabs + menu item list. Tapping an item either:
 *   • adds it to the cart directly (no modifiers), or
 *   • opens the ModifierSheet modal to configure options first.
 *
 * Cart deduplication: items with the same modifiers share a line (qty++);
 * items with different modifier combos get separate cart lines.
 *
 * handleSubmit sends the full order (including options) via posCreateOrder.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
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
  IconCheck,
  IconChevronLeft,
  IconInfoCircle,
  IconMinus,
  IconPlus,
  IconShoppingCart,
  IconX,
} from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import {
  getMenu,
  getItemModifierGroups,
} from '../../services/menu';
import type { MenuItem, MenuCategory, ModifierGroup } from '../../services/menu';
import { posCreateOrder } from '../../services/pos';
import type { PosOrderItem } from '../../services/pos';
import { usePosDraft } from '../../contexts/PosDraftContext';
import type { DraftItem } from '../../contexts/PosDraftContext';
import type { PosStackParamList } from '../../navigation/PosNavigator';

// ─── Navigation types ─────────────────────────────────────────────────────────

type PosOrderNav = NativeStackNavigationProp<PosStackParamList, 'PosOrder'>;
type PosOrderRoute = RouteProp<PosStackParamList, 'PosOrder'>;

// ─── Internal types ───────────────────────────────────────────────────────────

/** One selected modifier group ready for the payload. */
interface PosModifierSelection {
  group_id: string;
  group_label: string;
  choice_labels: string[];
}

/** One line in the cart. */
interface CartItem {
  /** Deterministic key — menuItemId alone when no modifiers, composite otherwise. */
  cartKey: string;
  menuItemId: string;
  name: string;
  /** Base price without modifier surcharges (cents). */
  basePriceCents: number;
  /** Sum of all selected modifier surcharges (cents). */
  modifierExtraCents: number;
  /** basePriceCents + modifierExtraCents — displayed price per unit. */
  priceCents: number;
  qty: number;
  /** Modifier selections (empty array when none). */
  modifiers: PosModifierSelection[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format cents as a locale-agnostic price string (e.g. "$12.50"). */
function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Build a deterministic cart key.
 * Items with no modifiers use the menuItemId.
 * Items with modifiers encode group IDs + sorted choice labels so that the same
 * combination always maps to the same key regardless of selection order.
 */
function buildCartKey(menuItemId: string, mods: PosModifierSelection[]): string {
  if (mods.length === 0) return menuItemId;
  const canonical = [...mods]
    .sort((a, b) => a.group_id.localeCompare(b.group_id))
    .map((m) => `${m.group_id}:${[...m.choice_labels].sort().join(',')}`)
    .join('|');
  return `${menuItemId}|${canonical}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Single category pill for the horizontal tab bar. */
function TabPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tabPill,
        {
          backgroundColor: active ? c.brand : c.bgSurface,
          borderColor: active ? c.brand : c.borderSubtle,
        },
      ]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={[
          styles.tabPillText,
          { color: active ? '#fff' : c.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * One card in the 2-column menu grid.
 * Shows photo (or initial-letter placeholder) on top; name + price overlaid at
 * the bottom with a dark scrim. Same tap behavior as the old list row.
 * An ⓘ button in the top-right corner opens staff details (Pro only).
 */
function MenuItemCard({
  item,
  onPress,
  onInfoPress,
  isPro,
}: {
  item: MenuItem;
  onPress: (item: MenuItem) => void;
  onInfoPress: (item: MenuItem) => void;
  isPro: boolean;
}) {
  const c = useThemeColors();
  const { t } = useTranslation('settings');
  // Prefer image_url (newer column), fall back to photo_url.
  const photoUri: string | null = item.image_url ?? item.photo_url ?? null;

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.menuCard,
        { backgroundColor: c.bgSurface },
        pressed && { opacity: 0.80 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${formatPrice(item.price_cents)}${item.has_modifiers ? ', options available' : ''}`}
    >
      {/* Photo area — square aspect ratio, rounded corners */}
      <View style={[styles.cardImgWrapper, { backgroundColor: c.bgSurface }]}>
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          /* Placeholder: brand-tinted background with initial letter */
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.cardPlaceholder,
              { backgroundColor: c.brandLight },
            ]}
          >
            <Text style={[styles.cardInitial, { color: c.brand }]}>
              {item.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        {/* Dark scrim at bottom — name + price overlay */}
        <View style={styles.cardOverlay} pointerEvents="none">
          <Text numberOfLines={2} style={styles.cardName}>
            {item.name}
          </Text>
          <View style={styles.cardPriceRow}>
            <Text style={styles.cardPrice}>{formatPrice(item.price_cents)}</Text>
            {item.has_modifiers && (
              <Text style={[styles.cardModDot, { color: c.brandLight }]}>✦</Text>
            )}
          </View>
        </View>

        {/* ⓘ info button — top-right corner, separate tap zone.
            Always visible (dimmed when not Pro) to motivate upgrade. */}
        <Pressable
          onPress={() => onInfoPress(item)}
          style={[styles.cardInfoBtn, !isPro && styles.cardInfoBtnDimmed]}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t('pos.staffDetailA11y', { name: item.name })}
        >
          <IconInfoCircle size={16} color="#fff" strokeWidth={2} />
        </Pressable>
      </View>

      {/* Description — below the photo, muted, max 2 lines */}
      {item.description ? (
        <Text
          numberOfLines={2}
          style={[styles.cardDesc, { color: c.textSecondary }]}
        >
          {item.description}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** One line in the cart panel. */
function CartRow({
  item,
  cartNote,
  notePlaceholder,
  onUpdateQty,
  onUpdateNote,
}: {
  item: CartItem;
  cartNote: string;
  notePlaceholder: string;
  onUpdateQty: (cartKey: string, delta: number) => void;
  onUpdateNote: (cartKey: string, note: string) => void;
}) {
  const c = useThemeColors();
  return (
    <View style={[styles.cartRow, { borderBottomColor: c.borderSubtle }]}>
      {/* Top row: name + modifier summary + line total */}
      <View style={styles.cartRowTop}>
        <View style={styles.cartRowNameBlock}>
          <Text numberOfLines={1} style={[styles.cartRowName, { color: c.textPrimary }]}>
            {item.name}
          </Text>
          {item.modifiers.length > 0 && (
            <Text
              numberOfLines={2}
              style={[styles.cartModSummary, { color: c.textTertiary }]}
            >
              {item.modifiers
                .map((m) => `${m.group_label}: ${m.choice_labels.join(', ')}`)
                .join(' · ')}
            </Text>
          )}
        </View>
        <Text style={[styles.cartRowTotal, { color: c.textSecondary }]}>
          {formatPrice(item.priceCents * item.qty)}
        </Text>
      </View>

      {/* Bottom row: note input + qty stepper */}
      <View style={styles.cartRowBottom}>
        <TextInput
          value={cartNote}
          onChangeText={(v) => onUpdateNote(item.cartKey, v)}
          placeholder={notePlaceholder}
          placeholderTextColor={c.textTertiary}
          style={[
            styles.cartNoteInput,
            { color: c.textPrimary, borderColor: c.borderSubtle },
          ]}
          maxLength={120}
          returnKeyType="done"
        />
        <View style={styles.qtyControls}>
          <Pressable
            onPress={() => onUpdateQty(item.cartKey, -1)}
            style={[styles.qtyBtn, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}
            accessibilityRole="button"
          >
            <IconMinus size={14} color={c.textSecondary} strokeWidth={2} />
          </Pressable>
          <Text style={[styles.qtyText, { color: c.textPrimary }]}>{item.qty}</Text>
          <Pressable
            onPress={() => onUpdateQty(item.cartKey, 1)}
            style={[styles.qtyBtn, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}
            accessibilityRole="button"
          >
            <IconPlus size={14} color={c.textSecondary} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Modifier Sheet ───────────────────────────────────────────────────────────

function ModifierSheet({
  item,
  onClose,
  onAdd,
}: {
  item: MenuItem;
  onClose: () => void;
  onAdd: (mods: PosModifierSelection[], extraCents: number) => void;
}) {
  const c = useThemeColors();
  const { t } = useTranslation('settings');

  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  /** groupId → array of selected choice labels */
  const [selections, setSelections] = useState<Record<string, string[]>>({});

  // Load modifier groups on mount
  useEffect(() => {
    let mounted = true;
    getItemModifierGroups(item.id)
      .then((g) => {
        if (mounted) setGroups(g);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [item.id]);

  // Live price = base + selected modifier surcharges
  const modifierExtraCents = useMemo(() => {
    return groups.reduce((sum, g) => {
      const chosen = selections[g.id] ?? [];
      return (
        sum +
        g.choices
          .filter((ch) => chosen.includes(ch.label))
          .reduce((s, ch) => s + ch.price_cents, 0)
      );
    }, 0);
  }, [groups, selections]);

  const livePrice = item.price_cents + modifierExtraCents;

  // All required groups satisfied?
  const canAdd = useMemo(
    () => groups.every((g) => (selections[g.id] ?? []).length >= g.min_select),
    [groups, selections],
  );

  const toggleChoice = useCallback(
    (group: ModifierGroup, label: string) => {
      setSelections((prev) => {
        const current = prev[group.id] ?? [];
        if (group.type === 'single') {
          // Radio: always select this one exclusively
          return { ...prev, [group.id]: [label] };
        }
        // Multi: toggle on/off, respecting max_select
        if (current.includes(label)) {
          return { ...prev, [group.id]: current.filter((l) => l !== label) };
        }
        if (current.length >= group.max_select) {
          return prev; // at capacity — silently ignore
        }
        return { ...prev, [group.id]: [...current, label] };
      });
    },
    [],
  );

  const handleAdd = useCallback(() => {
    const mods: PosModifierSelection[] = groups
      .filter((g) => (selections[g.id] ?? []).length > 0)
      .map((g) => ({
        group_id: g.id,
        group_label: g.label,
        choice_labels: selections[g.id] ?? [],
      }));
    onAdd(mods, modifierExtraCents);
  }, [groups, selections, modifierExtraCents, onAdd]);

  return (
    <View style={[styles.modSheet, { backgroundColor: c.bgSurface }]}>
      {/* Handle bar */}
      <View style={[styles.modHandle, { backgroundColor: c.borderSubtle }]} />

      {/* Header: item name + live price + close button */}
      <View style={styles.modHeader}>
        <View style={styles.modTitleBlock}>
          <Text style={[styles.modItemName, { color: c.textPrimary }]}>
            {item.name}
          </Text>
          <Text style={[styles.modLivePrice, { color: c.brand }]}>
            {t('pos.modLivePrice', { price: formatPrice(livePrice) })}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          style={styles.modCloseBtn}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <IconX size={20} color={c.textSecondary} strokeWidth={2} />
        </Pressable>
      </View>

      {/* Groups */}
      {loading ? (
        <View style={styles.modLoadingBox}>
          <ActivityIndicator color={c.brand} />
          <Text style={[styles.modLoadingText, { color: c.textTertiary }]}>
            {t('pos.modLoading')}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.modScroll}
          contentContainerStyle={styles.modScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {groups.map((group) => {
            const chosen = selections[group.id] ?? [];
            const isMulti = group.type === 'multi';
            const atMax = isMulti && chosen.length >= group.max_select;

            return (
              <View key={group.id} style={styles.modGroup}>
                {/* Group label + badges */}
                <View style={styles.modGroupHeader}>
                  <Text style={[styles.modGroupLabel, { color: c.textPrimary }]}>
                    {group.label}
                  </Text>
                  <View style={styles.modGroupMeta}>
                    {group.min_select > 0 && (
                      <View style={[styles.modRequiredBadge, { backgroundColor: c.brandLight }]}>
                        <Text style={[styles.modRequiredText, { color: c.brand }]}>
                          {t('pos.modRequired')}
                        </Text>
                      </View>
                    )}
                    {isMulti && group.max_select > 1 && (
                      <Text style={[styles.modGroupHint, { color: c.textTertiary }]}>
                        {t('pos.modChooseUpTo', { max: group.max_select })}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Choices */}
                {group.choices.map((choice) => {
                  const isSelected = chosen.includes(choice.label);
                  const isDisabled = !isSelected && atMax;

                  return (
                    <Pressable
                      key={choice.label}
                      onPress={() => toggleChoice(group, choice.label)}
                      disabled={isDisabled}
                      style={({ pressed }) => [
                        styles.choiceRow,
                        { borderBottomColor: c.borderSubtle },
                        (pressed || isDisabled) && { opacity: 0.5 },
                      ]}
                      accessibilityRole={isMulti ? 'checkbox' : 'radio'}
                      accessibilityState={{ checked: isSelected, disabled: isDisabled }}
                      accessibilityLabel={choice.label}
                    >
                      {/* Indicator: radio circle or checkbox square */}
                      {isMulti ? (
                        <View
                          style={[
                            styles.checkbox,
                            {
                              borderColor: isSelected ? c.brand : c.borderSubtle,
                              backgroundColor: isSelected ? c.brand : 'transparent',
                            },
                          ]}
                        >
                          {isSelected && (
                            <IconCheck size={11} color="#fff" strokeWidth={3} />
                          )}
                        </View>
                      ) : (
                        <View
                          style={[
                            styles.radio,
                            { borderColor: isSelected ? c.brand : c.borderSubtle },
                          ]}
                        >
                          {isSelected && (
                            <View style={[styles.radioDot, { backgroundColor: c.brand }]} />
                          )}
                        </View>
                      )}

                      <Text
                        style={[
                          styles.choiceLabel,
                          { color: isDisabled ? c.textTertiary : c.textPrimary },
                        ]}
                      >
                        {choice.label}
                      </Text>

                      {choice.price_cents > 0 && (
                        <Text style={[styles.choicePrice, { color: c.textSecondary }]}>
                          +{formatPrice(choice.price_cents)}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Add button */}
      <Pressable
        onPress={handleAdd}
        disabled={!canAdd || loading}
        style={({ pressed }) => [
          styles.modAddBtn,
          { backgroundColor: canAdd && !loading ? c.brand : c.borderSubtle },
          pressed && { opacity: 0.8 },
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canAdd || loading }}
      >
        <Text
          style={[
            styles.modAddBtnText,
            { color: canAdd && !loading ? '#fff' : c.textTertiary },
          ]}
        >
          {t('pos.modAdd')}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PosOrderScreen() {
  const c = useThemeColors();
  const { t, i18n } = useTranslation('settings');
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<PosOrderNav>();
  const route = useRoute<PosOrderRoute>();
  const { businessId, businessName, tableId, tableLabel, plan } = route.params;
  /** Seat being ordered for; null = whole-table / center order. */
  const seatParam: number | null = route.params.seat ?? null;
  /**
   * 'draft' (default) — save to PosDraftContext and goBack.
   * 'submit' — original direct-to-kitchen flow.
   */
  const modeParam: 'draft' | 'submit' = route.params.mode ?? 'draft';

  // ── Draft context ───────────────────────────────────────────────────────────
  const { getSeatDraft, setSeatDraft } = usePosDraft();

  // ── Plan features ───────────────────────────────────────────────────────────
  const isPro = plan === 'pro';

  // ── Menu state ──────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  // ── Cart state — pre-populated from draft on first render ───────────────────
  const [cart, setCart] = useState<CartItem[]>(() => {
    const draft = getSeatDraft(tableId, seatParam);
    return draft.map((d) => ({
      cartKey: d.cartKey,
      menuItemId: d.menuItemId,
      name: d.name,
      basePriceCents: d.basePriceCents,
      modifierExtraCents: d.modifierExtraCents,
      priceCents: d.basePriceCents + d.modifierExtraCents,
      qty: d.qty,
      modifiers: d.modifiers,
    }));
  });
  /** Notes keyed by cartKey — pre-populated from draft. */
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    const draft = getSeatDraft(tableId, seatParam);
    const n: Record<string, string> = {};
    draft.forEach((d) => { if (d.note) n[d.cartKey] = d.note; });
    return n;
  });

  // ── Modifier sheet state ────────────────────────────────────────────────────
  const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);

  // ── Staff detail sheet state ─────────────────────────────────────────────────
  const [staffDetailItem, setStaffDetailItem] = useState<MenuItem | null>(null);

  // ── Submit state ────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);

  // ── Load menu ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    // getMenu returns categories with nested items; flatten items for the flat list
    getMenu(businessId)
      .then((cats) => {
        if (!mounted) return;
        setCategories(cats);
        setItems(cats.flatMap((c) => c.items));
        setActiveCategoryId(cats.length > 0 ? cats[0].id : null);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoadingMenu(false);
      });
    return () => {
      mounted = false;
    };
  }, [businessId]);

  // ── Filtered items for active category ─────────────────────────────────────
  const filteredItems = useMemo(() => {
    if (!activeCategoryId) return items;
    return items.filter((item) => item.category_id === activeCategoryId);
  }, [items, activeCategoryId]);

  // ── Cart subtotal ───────────────────────────────────────────────────────────
  const subtotal = useMemo(
    () => cart.reduce((sum, ci) => sum + ci.priceCents * ci.qty, 0),
    [cart],
  );

  // ── Add to cart (no modifiers) ──────────────────────────────────────────────
  const addToCart = useCallback((item: MenuItem) => {
    const key = item.id; // no modifiers → key = menuItemId
    setCart((prev) => {
      const existing = prev.find((ci) => ci.cartKey === key);
      if (existing) {
        return prev.map((ci) =>
          ci.cartKey === key ? { ...ci, qty: ci.qty + 1 } : ci,
        );
      }
      return [
        ...prev,
        {
          cartKey: key,
          menuItemId: item.id,
          name: item.name,
          basePriceCents: item.price_cents,
          modifierExtraCents: 0,
          priceCents: item.price_cents,
          qty: 1,
          modifiers: [],
        },
      ];
    });
  }, []);

  // ── Add to cart (from ModifierSheet) ────────────────────────────────────────
  const addWithModifiers = useCallback(
    (item: MenuItem, mods: PosModifierSelection[], extraCents: number) => {
      const key = buildCartKey(item.id, mods);
      setCart((prev) => {
        const existing = prev.find((ci) => ci.cartKey === key);
        if (existing) {
          return prev.map((ci) =>
            ci.cartKey === key ? { ...ci, qty: ci.qty + 1 } : ci,
          );
        }
        return [
          ...prev,
          {
            cartKey: key,
            menuItemId: item.id,
            name: item.name,
            basePriceCents: item.price_cents,
            modifierExtraCents: extraCents,
            priceCents: item.price_cents + extraCents,
            qty: 1,
            modifiers: mods,
          },
        ];
      });
    },
    [],
  );

  // ── Item tap dispatcher ─────────────────────────────────────────────────────
  const handleItemPress = useCallback(
    (item: MenuItem) => {
      if (item.has_modifiers) {
        setModifierItem(item);
      } else {
        addToCart(item);
      }
    },
    [addToCart],
  );

  // ── Qty update (keyed by cartKey) ───────────────────────────────────────────
  const updateQty = useCallback((key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((ci) => (ci.cartKey === key ? { ...ci, qty: ci.qty + delta } : ci))
        .filter((ci) => ci.qty > 0),
    );
  }, []);

  // ── Note update (keyed by cartKey) ──────────────────────────────────────────
  const updateNote = useCallback((key: string, note: string) => {
    setNotes((prev) => ({ ...prev, [key]: note }));
  }, []);

  // ── Submit order ────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);

    const posItems: PosOrderItem[] = cart.map((ci) => {
      const note = (notes[ci.cartKey] ?? '').trim();
      return {
        menu_item_id: ci.menuItemId,
        qty: ci.qty,
        ...(note ? { special_instructions: note } : {}),
        ...(ci.modifiers.length > 0
          ? { options: { modifiers: ci.modifiers } }
          : {}),
      };
    });

    const result = await posCreateOrder(businessId, tableId, posItems);
    setSubmitting(false);

    if (result.ok) {
      Alert.alert(
        t('pos.submitSuccess'),
        t('pos.submitSuccessMsg'),
        [{ text: t('pos.submitOk'), onPress: () => navigation.goBack() }],
      );
      return;
    }

    let errorMsg: string;
    switch (result.reason) {
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
      case 'invalid_modifier':
        errorMsg = t('pos.errorModifier');
        break;
      default:
        errorMsg = t('pos.errorDb');
    }
    Alert.alert(t('pos.errorTitle'), errorMsg);
  }, [businessId, tableId, cart, notes, submitting, navigation, t]);

  // ── Draft save (mode === 'draft') ───────────────────────────────────────────
  /**
   * Save the current cart to PosDraftContext and return to PosTableHub.
   * Called instead of handleSubmit when modeParam === 'draft'.
   */
  const handleDraftSave = useCallback(() => {
    const draftItems: DraftItem[] = cart.map((ci) => ({
      cartKey: ci.cartKey,
      menuItemId: ci.menuItemId,
      name: ci.name,
      basePriceCents: ci.basePriceCents,
      modifierExtraCents: ci.modifierExtraCents,
      qty: ci.qty,
      seat: seatParam,
      modifiers: ci.modifiers,
      note: notes[ci.cartKey] ?? '',
    }));
    setSeatDraft(tableId, seatParam, draftItems);
    navigation.goBack();
  }, [cart, notes, seatParam, tableId, setSeatDraft, navigation]);

  // ── ModifierSheet callbacks ─────────────────────────────────────────────────
  const handleModClose = useCallback(() => setModifierItem(null), []);

  const handleModAdd = useCallback(
    (mods: PosModifierSelection[], extraCents: number) => {
      if (!modifierItem) return;
      addWithModifiers(modifierItem, mods, extraCents);
      setModifierItem(null);
    },
    [modifierItem, addWithModifiers],
  );

  // ── Staff detail callbacks ───────────────────────────────────────────────────

  const handleInfoPress = useCallback(
    (item: MenuItem) => {
      if (!isPro) {
        Alert.alert(t('pos.staffDetailProUpsellTitle'), t('pos.staffDetailProUpsell'));
        return;
      }
      setStaffDetailItem(item);
    },
    [isPro, t],
  );

  const closeStaffDetail = useCallback(() => setStaffDetailItem(null), []);

  /** Language-adaptive staff detail text. Re-computed when item or locale changes. */
  const resolvedStaffDetail = useMemo<string | null>(() => {
    if (!staffDetailItem) return null;
    const isEs = i18n.language.startsWith('es');
    return isEs
      ? (staffDetailItem.staff_details_alt ?? staffDetailItem.staff_details)
      : (staffDetailItem.staff_details ?? staffDetailItem.staff_details_alt);
  }, [staffDetailItem, i18n.language]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: c.bgBase }]}>
      <StatusBar
        barStyle={c.bgBase === palette.bgBase ? 'light-content' : 'dark-content'}
      />

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
        >
          <IconChevronLeft size={24} color={c.brand} strokeWidth={2} />
        </Pressable>
        <View style={styles.headerTitleBlock}>
          <Text style={[styles.headerTitle, { color: c.textPrimary }]} numberOfLines={1}>
            {businessName}
          </Text>
          <Text style={[styles.headerSub, { color: c.textTertiary }]}>
            {tableLabel}
          </Text>
        </View>
      </View>

      {/* ── Category tabs ───────────────────────────────────────────────────── */}
      {categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.tabBar, { borderBottomColor: c.borderSubtle }]}
          contentContainerStyle={styles.tabBarContent}
        >
          <TabPill
            label={t('pos.allCategories')}
            active={activeCategoryId === null}
            onPress={() => setActiveCategoryId(null)}
          />
          {categories.map((cat) => (
            <TabPill
              key={cat.id}
              label={cat.name}
              active={activeCategoryId === cat.id}
              onPress={() => setActiveCategoryId(cat.id)}
            />
          ))}
        </ScrollView>
      )}

      {/* ── Menu items ──────────────────────────────────────────────────────── */}
      {loadingMenu ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={c.brand} />
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.loadingCenter}>
          <Text style={[styles.emptyText, { color: c.textTertiary }]}>
            {t('pos.menuEmpty')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          numColumns={2}
          renderItem={({ item }) => (
            <MenuItemCard
              item={item}
              onPress={handleItemPress}
              onInfoPress={handleInfoPress}
              isPro={isPro}
            />
          )}
          columnWrapperStyle={styles.menuGridRow}
          style={styles.menuList}
          contentContainerStyle={[
            styles.menuListContent,
            { paddingBottom: cart.length > 0 ? 0 : insets.bottom + 16 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Cart panel ──────────────────────────────────────────────────────── */}
      {cart.length === 0 ? (
        <View
          style={[
            styles.cartEmpty,
            {
              backgroundColor: c.bgSurface,
              borderTopColor: c.borderSubtle,
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          <IconShoppingCart size={18} color={c.textTertiary} strokeWidth={1.5} />
          <Text style={[styles.cartEmptyText, { color: c.textTertiary }]}>
            {t('pos.cartEmpty')}
          </Text>
        </View>
      ) : (
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
          {/* Scrollable cart rows */}
          <ScrollView style={styles.cartScroll} showsVerticalScrollIndicator={false}>
            {cart.map((ci) => (
              <CartRow
                key={ci.cartKey}
                item={ci}
                cartNote={notes[ci.cartKey] ?? ''}
                notePlaceholder={t('pos.cartNote')}
                onUpdateQty={updateQty}
                onUpdateNote={updateNote}
              />
            ))}
          </ScrollView>

          {/* Subtotal + submit */}
          <View style={styles.cartFooter}>
            <Text style={[styles.cartSubtotalLabel, { color: c.textSecondary }]}>
              {t('pos.cartSubtotal')}
            </Text>
            <Text style={[styles.cartSubtotalValue, { color: c.textPrimary }]}>
              {formatPrice(subtotal)}
            </Text>
          </View>

          <Pressable
            onPress={modeParam === 'draft' ? handleDraftSave : handleSubmit}
            disabled={modeParam === 'submit' && submitting}
            style={({ pressed }) => [
              styles.submitBtn,
              { backgroundColor: c.brand },
              ((modeParam === 'submit' && submitting) || pressed) && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ disabled: modeParam === 'submit' && submitting }}
          >
            {modeParam === 'submit' && submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>
                {modeParam === 'draft' ? t('pos.draftDone') : t('pos.submitButton')}
              </Text>
            )}
          </Pressable>
        </View>
      )}

      {/* ── Modifier Sheet Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={modifierItem !== null}
        animationType="slide"
        transparent
        onRequestClose={handleModClose}
        statusBarTranslucent
      >
        <View style={styles.modOverlay}>
          {/* Backdrop tap closes the sheet */}
          <Pressable style={styles.modBackdrop} onPress={handleModClose} />
          {modifierItem !== null && (
            <ModifierSheet
              item={modifierItem}
              onClose={handleModClose}
              onAdd={handleModAdd}
            />
          )}
        </View>
      </Modal>

      {/* ── Staff Detail Modal ───────────────────────────────────────────────── */}
      <Modal
        visible={staffDetailItem !== null}
        animationType="slide"
        transparent
        onRequestClose={closeStaffDetail}
        statusBarTranslucent
      >
        <View style={styles.modOverlay}>
          <Pressable style={styles.modBackdrop} onPress={closeStaffDetail} />
          {staffDetailItem !== null && (
            <View style={[styles.modSheet, { backgroundColor: c.bgSurface }]}>
              {/* Handle bar */}
              <View style={[styles.modHandle, { backgroundColor: c.borderSubtle }]} />

              {/* Header: item name + close button */}
              <View style={styles.modHeader}>
                <View style={styles.modTitleBlock}>
                  <Text style={[styles.modItemName, { color: c.textPrimary }]}>
                    {staffDetailItem.name}
                  </Text>
                </View>
                <Pressable
                  onPress={closeStaffDetail}
                  style={styles.modCloseBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <IconX size={20} color={c.textSecondary} strokeWidth={2} />
                </Pressable>
              </View>

              {/* Staff detail content */}
              <ScrollView
                style={styles.detailScroll}
                contentContainerStyle={styles.detailScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={[styles.staffDetailText, { color: c.textPrimary }]}>
                  {resolvedStaffDetail ?? t('pos.staffDetailNoDetails')}
                </Text>
              </ScrollView>
            </View>
          )}
        </View>
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
  headerTitleBlock: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  headerSub: { fontSize: 12, marginTop: 1 },

  // ── Category tabs ────────────────────────────────────────────────────────────
  tabBar: {
    maxHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBarContent: {
    paddingHorizontal: H_PAD,
    paddingVertical: 8,
    gap: 8,
  },
  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabPillText: { fontSize: 13, fontWeight: '500' },

  // ── Menu grid (2-column photo grid, Square-style) ────────────────────────────
  menuList: { flex: 1 },
  menuListContent: { paddingTop: 12, paddingHorizontal: H_PAD, gap: 12 },
  menuGridRow: { gap: 12 },

  // Each card: flex:1 so both columns are equal width in the row.
  menuCard: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },

  // Square photo area — aspect ratio 1:1, clips photo + overlay.
  cardImgWrapper: {
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },

  // Placeholder shown when there is no photo.
  cardPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInitial: {
    fontSize: 36,
    fontWeight: '700',
  },

  // Dark scrim at bottom of photo — white text stays legible over any image.
  // rgba(0,0,0,0.52) follows the same pattern as modOverlay above.
  cardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingTop: 18,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  cardName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
    marginBottom: 3,
  },
  cardPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardPrice: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  cardModDot: {
    fontSize: 11,
    fontWeight: '600',
  },
  // Dish description shown below the photo card — muted, max 2 lines.
  cardDesc: {
    fontSize: 11,
    lineHeight: 15,
    paddingHorizontal: 8,
    paddingTop: 5,
    paddingBottom: 6,
  },

  // ── Loading / empty ──────────────────────────────────────────────────────────
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: 14 },

  // ── Cart panel ───────────────────────────────────────────────────────────────
  cartEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 14,
    paddingHorizontal: H_PAD,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cartEmptyText: { fontSize: 13 },

  cartPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    maxHeight: 360,
  },

  cartScroll: { maxHeight: 220 },

  cartRow: {
    paddingHorizontal: H_PAD,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  cartRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  cartRowNameBlock: { flex: 1, gap: 2 },
  cartRowName: { fontSize: 14, fontWeight: '500' },
  cartModSummary: { fontSize: 11, lineHeight: 15 },
  cartRowTotal: { fontSize: 13, fontWeight: '600', minWidth: 60, textAlign: 'right' },

  cartRowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cartNoteInput: {
    flex: 1,
    fontSize: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    height: 30,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 20,
    textAlign: 'center',
  },

  cartFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingTop: 10,
    paddingBottom: 4,
  },
  cartSubtotalLabel: { fontSize: 13 },
  cartSubtotalValue: { fontSize: 16, fontWeight: '700' },

  submitBtn: {
    marginHorizontal: H_PAD,
    marginTop: 8,
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ── Modifier modal overlay ───────────────────────────────────────────────────
  modOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modBackdrop: { flex: 1 },

  // ── Modifier sheet ───────────────────────────────────────────────────────────
  modSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingTop: 8,
  },
  modHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  modHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: H_PAD,
    paddingBottom: 12,
    gap: 12,
  },
  modTitleBlock: { flex: 1, gap: 2 },
  modItemName: { fontSize: 17, fontWeight: '700' },
  modLivePrice: { fontSize: 14, fontWeight: '600' },
  modCloseBtn: { padding: 4, marginTop: 2 },

  modLoadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  modLoadingText: { fontSize: 14 },

  modScroll: {},
  modScrollContent: { paddingBottom: 12 },

  modGroup: { marginBottom: 4 },

  modGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingVertical: 10,
    gap: 8,
  },
  modGroupLabel: { fontSize: 14, fontWeight: '700', flex: 1 },
  modGroupMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modRequiredBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  modRequiredText: { fontSize: 11, fontWeight: '600' },
  modGroupHint: { fontSize: 12 },

  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },

  // Radio (single-select)
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  // Checkbox (multi-select)
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  choiceLabel: { flex: 1, fontSize: 14 },
  choicePrice: { fontSize: 13, fontWeight: '500' },

  modAddBtn: {
    marginHorizontal: H_PAD,
    marginTop: 12,
    marginBottom: 16,
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modAddBtnText: { fontSize: 16, fontWeight: '700' },

  // ── ⓘ info button (top-right of each menu card) ──────────────────────────────
  cardInfoBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Dimmed state — shown for non-Pro users to motivate upgrade. */
  cardInfoBtnDimmed: {
    opacity: 0.45,
  },

  // ── Staff detail sheet ────────────────────────────────────────────────────────
  detailScroll: {},
  detailScrollContent: {
    paddingHorizontal: H_PAD,
    paddingBottom: 32,
  },
  staffDetailText: {
    fontSize: 15,
    lineHeight: 22,
  },
});
