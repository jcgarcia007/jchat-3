/**
 * JChat 3.0 — the list under the Map's search bar.
 *
 * One row per business that matches what was typed (utils/mapSearch.ts): avatar, name, category and — when the position is known — the distance. A row
 * opens that business on the map (the screen centres on it and shows its BusinessPreviewCard). With no match, a single "Sin resultados para «…»" row.
 * It floats over the map (the filter panel gives it a higher layer than the pins and the zoom controls); the rows scroll when the screen is short.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import BusinessAvatar from '../megaphone/BusinessAvatar';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';

export interface SearchResultBusiness {
  id: string;
  name: string;
  category: string;
  icon_emoji: string;
  icon_url?: string | null;
  logo_url?: string | null;
}

interface Props<T extends SearchResultBusiness> {
  query: string;
  results: readonly T[];
  /** "120 m" / "1.2 km" for a business, or undefined when the position is not known. */
  distanceLabel: (business: T) => string | undefined;
  onSelect: (business: T) => void;
}

export default function MapSearchResults<T extends SearchResultBusiness>({ query, results, distanceLabel, onSelect }: Props<T>): React.ReactElement {
  const c = useThemeColors();
  const { t } = useTranslation('map');

  return (
    <View
      testID="map-search-results"
      accessibilityLabel={t('filterPanel.searchResultsA11y')}
      style={[styles.panel, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}
    >
      {results.length === 0 ? (
        <View testID="map-search-empty" style={styles.emptyRow}>
          <Text style={[styles.emptyText, { color: c.textSecondary }]} numberOfLines={2}>
            {t('filterPanel.searchNoResults', { query: query.trim() })}
          </Text>
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll} nestedScrollEnabled>
          {results.map((business, index) => {
            const distance = distanceLabel(business);
            return (
              <Pressable
                key={business.id}
                testID={`map-search-result-${business.id}`}
                onPress={() => onSelect(business)}
                accessibilityRole="button"
                accessibilityLabel={[business.name, business.category, distance].filter(Boolean).join(', ')}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && { borderTopColor: c.borderSubtle, borderTopWidth: StyleSheet.hairlineWidth },
                  pressed && { backgroundColor: c.bgElevated },
                ]}
              >
                <BusinessAvatar iconUrl={business.icon_url} logoUrl={business.logo_url ?? null} emoji={business.icon_emoji} size={36} />
                <View style={styles.texts}>
                  <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>{business.name}</Text>
                  {business.category ? <Text style={[styles.category, { color: c.textSecondary }]} numberOfLines={1}>{business.category}</Text> : null}
                </View>
                {distance ? <Text style={[styles.distance, { color: c.textSecondary }]} numberOfLines={1}>{distance}</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const ROW_HEIGHT = 56;

const styles = StyleSheet.create({
  panel: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: palette.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  // 8 rows at most: taller than that never fits next to the keyboard anyway, so the list scrolls.
  scroll: { maxHeight: ROW_HEIGHT * 5 },
  row: { minHeight: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  texts: { flex: 1, gap: 1 },
  name: { fontSize: 15, fontWeight: '600' },
  category: { fontSize: 12 },
  distance: { fontSize: 12, fontWeight: '600' },
  emptyRow: { minHeight: ROW_HEIGHT, justifyContent: 'center', paddingHorizontal: 14 },
  emptyText: { fontSize: 14 },
});
