/**
 * JChat 3.0 — CartBar (Task 3.2)
 *
 * Sticky bottom bar shown only when the cart has items.
 *   - Shows item count badge + "View cart" label + subtotal.
 *   - Tapping → TODO(Task 3.4): navigate to CartScreen.
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconShoppingCart } from '@tabler/icons-react-native';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { typeCap, typeStyle } from '../../theme/typography';
import { useCart } from '../../context/CartContext';

interface CartBarProps {
  onPress: () => void;
}

export function CartBar({ onPress }: CartBarProps) {
  const { itemCount, subtotalCents } = useCart();
  const c = useThemeColors();
  const { t } = useTranslation('pos');

  if (itemCount === 0) return null;

  const formattedTotal = `$${(subtotalCents / 100).toFixed(2)}`;

  return (
    <View style={[styles.wrapper, { backgroundColor: c.bgSurface, borderTopColor: c.borderSubtle }]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.bar,
          { backgroundColor: palette.brandFill, opacity: pressed ? 0.85 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('cartBar.viewCartA11y', { count: itemCount, total: formattedTotal })}
      >
        {/* Left: cart icon + count badge */}
        <View style={styles.leftGroup}>
          <View style={styles.badgeWrapper}>
            <IconShoppingCart size={20} color={palette.onBrand} strokeWidth={2} />
            <View style={styles.countBadge}>
              <Text maxFontSizeMultiplier={typeCap('caption')} style={styles.countText}>{itemCount > 99 ? '99+' : String(itemCount)}</Text>
            </View>
          </View>
        </View>

        {/* Center label */}
        <Text maxFontSizeMultiplier={typeCap('button')} style={styles.label}>{t('cartBar.viewCart')}</Text>

        {/* Right: total */}
        <Text maxFontSizeMultiplier={typeCap('button')} style={styles.total}>{formattedTotal}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 8,
  },
  leftGroup: {
    flex: 1,
  },
  badgeWrapper: {
    position: 'relative',
    minWidth: 28,
    minHeight: 24,
  },
  countBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    backgroundColor: palette.onBrand,
    borderRadius: 10,
    minWidth: 20,
    minHeight: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  countText: {
    ...typeStyle('caption'),
    fontWeight: '800',
    color: palette.brand,
  },
  label: {
    flex: 2,
    textAlign: 'center',
    ...typeStyle('button'),
    fontWeight: '700',
    color: palette.onBrand,
  },
  // The total never shrinks (a clipped price is worse than a narrower label); the label wraps instead.
  total: {
    flexGrow: 1,
    flexShrink: 0,
    textAlign: 'right',
    ...typeStyle('button'),
    fontWeight: '700',
    color: palette.onBrand,
  },
});
