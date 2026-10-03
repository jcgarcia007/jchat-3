import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { MegaphoneItem } from '../../services/megaphone';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { formatDistance } from '../../utils/distanceUnits';
import BusinessAvatar from './BusinessAvatar';

interface MegaphoneOfferCardProps {
  item: MegaphoneItem;
  onEnter: (item: MegaphoneItem) => void;
}

export default function MegaphoneOfferCard({ item, onEnter }: MegaphoneOfferCardProps) {
  const colors = useThemeColors();
  const translation = useTranslation('offers');
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(translation.i18n.language, { dateStyle: 'medium' }),
    [translation.i18n.language],
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}>
      <View style={styles.businessRow}>
        <BusinessAvatar emoji={item.icon_emoji} logoUrl={item.logo_url} />
        <Text numberOfLines={1} style={[styles.businessName, { color: colors.textSecondary }]}>
          {item.business_name}
        </Text>
        {item.distance_miles !== null ? (
          <Text style={[styles.meta, { color: colors.textTertiary }]}>
            {translation.t('distanceAway', { distance: formatDistance(item.distance_miles) })}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.offerTitle, { color: colors.textPrimary }]}>{item.title}</Text>
      {item.body ? (
        <Text numberOfLines={2} style={[styles.description, { color: colors.textSecondary }]}>
          {item.body}
        </Text>
      ) : null}

      <View style={styles.detailRow}>
        {item.discount ? (
          <View style={[styles.discountPill, { backgroundColor: colors.brandLight }]}>
            <Text style={[styles.discountText, { color: colors.brand }]}>{item.discount}</Text>
          </View>
        ) : null}
        {item.expires_at ? (
          <Text style={[styles.meta, { color: colors.textTertiary }]}>
            {translation.t('expires', { date: dateFormatter.format(new Date(item.expires_at)) })}
          </Text>
        ) : null}
      </View>

      {item.code ? (
        <Text style={[styles.code, { color: colors.textPrimary }]}>
          {translation.t('code', { code: item.code })}
        </Text>
      ) : null}

      <TouchableOpacity
        accessibilityRole="button"
        activeOpacity={0.8}
        onPress={() => onEnter(item)}
        style={[styles.enterButton, { backgroundColor: colors.brand }]}
      >
        <Text style={[styles.enterText, { color: palette.bgSurfaceLight }]}>{translation.t('enter')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, gap: 10, padding: 16 },
  businessRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  businessName: { flex: 1, fontSize: 13, fontWeight: '600' },
  offerTitle: { fontSize: 19, fontWeight: '800' },
  description: { fontSize: 14, lineHeight: 20 },
  detailRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  discountPill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  discountText: { fontSize: 13, fontWeight: '800' },
  meta: { fontSize: 12 },
  code: { fontSize: 13, fontWeight: '700' },
  enterButton: { alignItems: 'center', borderRadius: 14, marginTop: 2, paddingVertical: 12 },
  enterText: { fontSize: 15, fontWeight: '800' },
});
