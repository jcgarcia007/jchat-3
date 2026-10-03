import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconMapPin, IconMessage, IconUsers } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { type NearbyBusiness } from '../../services/nearby';
import { getOpenStatus } from '../../utils/hours';

interface BusinessCardProps {
  item: NearbyBusiness;
  onEnter: (item: NearbyBusiness) => void;
}

export default function BusinessCard({ item, onEnter }: BusinessCardProps) {
  const colors = useThemeColors();
  const nearbyTranslation = useTranslation('nearby');
  const mapTranslation = useTranslation('map');
  const status = getOpenStatus(item.hours);

  return (
    <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}>
      <View style={[styles.avatar, { backgroundColor: colors.bgElevated }]}>
        <Text style={styles.emoji}>{item.icon_emoji ?? '🏪'}</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={[styles.name, { color: colors.textPrimary }]}>
            {item.name}
          </Text>
          <View style={[styles.badge, { backgroundColor: colors.bgElevated }]}>
            <Text style={[styles.badgeText, { color: status === 'open' ? colors.success : status === 'closed' ? colors.danger : colors.textSecondary }]}>
              {nearbyTranslation.t(status === 'open' ? 'openBadge' : status === 'closed' ? 'closedBadge' : 'hoursUnavailable')}
            </Text>
          </View>
        </View>
        <Text numberOfLines={1} style={[styles.category, { color: colors.textSecondary }]}>
          {item.category}
        </Text>
        <View style={styles.bottomRow}>
          <View style={styles.stats}>
            {item.distanceLabel ? (
              <View style={styles.stat}>
                <IconMapPin size={12} color={colors.textTertiary} strokeWidth={2} />
                <Text style={[styles.statText, { color: colors.textTertiary }]}>{item.distanceLabel}</Text>
              </View>
            ) : null}
            {item.room_count > 0 ? (
              <View style={styles.stat}>
                <IconMessage size={12} color={colors.textTertiary} strokeWidth={2} />
                <Text style={[styles.statText, { color: colors.textTertiary }]}>
                  {nearbyTranslation.t('roomCount', { count: item.room_count })}
                </Text>
              </View>
            ) : null}
            {item.active_users != null ? (
              <View style={styles.stat}>
                <IconUsers size={12} color={colors.textTertiary} strokeWidth={2} />
                <Text style={[styles.statText, { color: colors.textTertiary }]}>
                  {nearbyTranslation.t('activeUsersCount', { count: item.active_users })}
                </Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.8}
            onPress={() => onEnter(item)}
            style={[styles.enter, { backgroundColor: colors.brand }]}
          >
            <Text style={[styles.enterText, { color: palette.bgSurfaceLight }]}>
              {mapTranslation.t('nearbyEnter')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 24 },
  content: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: '700' },
  category: { fontSize: 12 },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  bottomRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 8 },
  stats: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { fontSize: 11 },
  enter: { minHeight: 34, borderRadius: 17, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  enterText: { fontSize: 12, fontWeight: '800' },
});
