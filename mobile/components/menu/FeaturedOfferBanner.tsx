/**
 * JChat 3.0 — FeaturedOfferBanner (Task 3.2)
 *
 * Displays the active offer for a business at the top of the menu, below search.
 * TODO: fetch active offer from offers table (Task 2.6 / 3.16 schema).
 *       For now accepts an optional offer stub and renders a placeholder when
 *       no real data is available.
 *
 * // TODO(i18n)
 */

import React from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';

export interface OfferStub {
  title: string;
  description: string;
  /** Expiry label, e.g. "Ends tonight at 11 PM" */
  expiryLabel?: string;
}

interface FeaturedOfferBannerProps {
  offer: OfferStub | null;
}

export function FeaturedOfferBanner({ offer }: FeaturedOfferBannerProps) {
  const c = useThemeColors();

  if (!offer) return null;

  return (
    <View style={[styles.banner, { backgroundColor: palette.brand + '18', borderColor: palette.brand + '44' }]}>
      <View style={styles.pill}>
        <Text style={styles.pillText}>OFFER</Text>
      </View>
      <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>
        {offer.title}
      </Text>
      <Text style={[styles.description, { color: c.textSecondary }]} numberOfLines={2}>
        {offer.description}
      </Text>
      {offer.expiryLabel ? (
        <Text style={[styles.expiry, { color: palette.warning }]}>
          {offer.expiryLabel}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: palette.brand,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  expiry: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
});
