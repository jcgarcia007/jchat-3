/**
 * JChat 3.0 — CartBar (Task 3.2)
 *
 * Sticky bottom bar shown only when the cart has items.
 *   - Shows item count badge + "View cart" label + subtotal.
 *   - Tapping → TODO(Task 3.4): navigate to CartScreen.
 *
 * // TODO(i18n)
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconShoppingCart } from '@tabler/icons-react-native';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useCart } from '../../context/CartContext';

interface CartBarProps {
  onPress: () => void;
}

export function CartBar({ onPress }: CartBarProps) {
  const { itemCount, subtotalCents } = useCart();
  const c = useThemeColors();

  if (itemCount === 0) return null;

  const formattedTotal = `$${(subtotalCents / 100).toFixed(2)}`;

  return (
    <View style={[styles.wrapper, { backgroundColor: c.bgSurface, borderTopColor: c.borderSubtle }]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.bar,
          { backgroundColor: palette.brand, opacity: pressed ? 0.85 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`View cart — ${itemCount} items, ${formattedTotal}`}
      >
        {/* Left: cart icon + count badge */}
        <View style={styles.leftGroup}>
          <View style={styles.badgeWrapper}>
            <IconShoppingCart size={20} color="#ffffff" strokeWidth={2} />
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{itemCount > 99 ? '99+' : String(itemCount)}</Text>
            </View>
          </View>
        </View>

        {/* Center label */}
        <Text style={styles.label}>View Cart</Text>

        {/* Right: total */}
        <Text style={styles.total}>{formattedTotal}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: 8,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  leftGroup: {
    flex: 1,
  },
  badgeWrapper: {
    position: 'relative',
    width: 28,
    height: 24,
  },
  countBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  countText: {
    fontSize: 10,
    fontWeight: '800',
    color: palette.brand,
  },
  label: {
    flex: 2,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  total: {
    flex: 1,
    textAlign: 'right',
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
});
