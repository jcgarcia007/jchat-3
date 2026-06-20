/**
 * JChat 3.0 — ProductRow (Task 3.2)
 *
 * Renders a single menu item:
 *   - Large photo layout  → when item.photo_url exists
 *   - Compact layout      → no photo
 *   - Badges: best_seller | new | hot
 *   - "+ " button: direct addLine when no required size options;
 *     otherwise TODO(Task 3.3) → open ProductDetail (fallback: first size).
 *
 * // TODO(i18n)
 */

import React, { useCallback } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconPlus } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useCart } from '../../context/CartContext';
import type { MenuItem } from '../../services/menu';

// Badge accent colors — intentionally local (not in global design tokens per spec note)
const BADGE_COLORS: Record<NonNullable<MenuItem['badge']>, string> = {
  best_seller: palette.gold,
  new: palette.brand,
  hot: palette.danger,
};

const BADGE_LABELS: Record<NonNullable<MenuItem['badge']>, string> = {
  best_seller: 'Best Seller',
  new: 'New',
  hot: 'Hot',
};

interface ProductRowProps {
  item: MenuItem;
  /** Called when the item has required size options — parent opens ProductDetail. */
  onOpenDetail: (item: MenuItem) => void;
}

export function ProductRow({ item, onOpenDetail }: ProductRowProps) {
  const c = useThemeColors();
  const { addLine } = useCart();

  const hasPhoto = !!item.photo_url;
  const hasRequiredSizes = (item.options?.sizes?.length ?? 0) > 0;

  const formatPrice = useCallback((cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  }, []);

  const handleAdd = useCallback(() => {
    if (hasRequiredSizes) {
      // TODO(Task 3.3): navigate to ProductDetailScreen for size selection.
      // Fallback: use the first size option so the cart still works.
      const firstSize = item.options.sizes![0];
      addLine({
        item,
        qty: 1,
        size: firstSize,
        extras: [],
        unitPriceCents: item.price_cents + firstSize.price_cents,
      });
    } else {
      addLine({
        item,
        qty: 1,
        size: null,
        extras: [],
        unitPriceCents: item.price_cents,
      });
    }
  }, [hasRequiredSizes, item, addLine]);

  const badgeColor = item.badge ? BADGE_COLORS[item.badge] : null;
  const badgeLabel = item.badge ? BADGE_LABELS[item.badge] : null;

  return (
    <View style={[styles.container, { backgroundColor: c.bgSurface, borderBottomColor: c.borderSubtle }]}>
      {/* Main row content */}
      <View style={styles.content}>
        {/* Text area */}
        <View style={styles.textArea}>
          {/* Badge */}
          {badgeColor && badgeLabel ? (
            <View style={[styles.badge, { backgroundColor: badgeColor + '22' }]}>
              <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
            </View>
          ) : null}

          <Text style={[styles.itemName, { color: c.textPrimary }]} numberOfLines={2}>
            {item.name}
          </Text>

          {item.description ? (
            <Text style={[styles.description, { color: c.textSecondary }]} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}

          {/* Dietary tags */}
          {item.dietary_tags.length > 0 ? (
            <View style={styles.tagsRow}>
              {item.dietary_tags.slice(0, 3).map((tag) => (
                <View key={tag} style={[styles.dietTag, { borderColor: c.borderSubtle }]}>
                  <Text style={[styles.dietTagText, { color: c.textTertiary }]}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: c.textPrimary }]}>
              {formatPrice(item.price_cents)}
            </Text>
            {hasRequiredSizes ? (
              <Text style={[styles.fromLabel, { color: c.textSecondary }]}>  from</Text>
            ) : null}
          </View>
        </View>

        {/* Right side: photo (large layout) + add button */}
        <View style={styles.rightColumn}>
          {hasPhoto ? (
            <Image
              source={{ uri: item.photo_url! }}
              style={[styles.photo, { backgroundColor: c.bgElevated }]}
              resizeMode="cover"
            />
          ) : null}

          <Pressable
            onPress={handleAdd}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: palette.brand, opacity: pressed ? 0.75 : 1 },
              hasPhoto ? styles.addButtonPhoto : styles.addButtonCompact,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Add ${item.name} to cart`}
          >
            <IconPlus size={18} color="#ffffff" strokeWidth={2.5} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  textArea: {
    flex: 1,
    paddingRight: 12,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
  },
  dietTag: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  dietTagText: {
    fontSize: 10,
    fontWeight: '500',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontSize: 15,
    fontWeight: '700',
  },
  fromLabel: {
    fontSize: 12,
  },
  rightColumn: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  photo: {
    width: 88,
    height: 88,
    borderRadius: 8,
    marginBottom: 8,
  },
  addButton: {
    borderRadius: 20,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonPhoto: {
    // when there's a photo, button is below it
  },
  addButtonCompact: {
    // compact: button is vertically centered with text
    marginTop: 4,
  },
});
