import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconClock, IconMapPin, IconMessage, IconUsers } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { type NearbyBusiness } from '../../services/nearby';
import { getOpenStatus } from '../../utils/hours';
import { BusinessIcon } from '../common/BusinessIcon';
import { Skeleton } from '../common/Skeleton';
import { LABEL_TEXT_CAP } from '../../theme/textScale';

interface BusinessCardProps {
  item: NearbyBusiness;
  onEnter: (item: NearbyBusiness) => void;
}

export default function BusinessCard({ item, onEnter }: BusinessCardProps) {
  const colors = useThemeColors();
  const nearbyTranslation = useTranslation('nearby');
  const mapTranslation = useTranslation('map');
  const status = getOpenStatus(item.hours, new Date(), item.timezone ?? null);

  return (
    <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}>
      <View style={[styles.avatar, { backgroundColor: colors.bgElevated }]}>
        <BusinessIcon iconUrl={item.icon_url} emoji={item.icon_emoji} size={48} radius={13} emojiStyle={styles.emoji} />
      </View>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text maxFontSizeMultiplier={LABEL_TEXT_CAP} numberOfLines={1} style={[styles.name, { color: colors.textPrimary }]}>
            {item.name}
          </Text>
          <View style={[styles.badge, { backgroundColor: colors.bgElevated }]}>
            <Text maxFontSizeMultiplier={LABEL_TEXT_CAP} style={[styles.badgeText, { color: status === 'open' ? colors.success : status === 'closed' ? colors.dangerText : colors.textSecondary }]}>
              {nearbyTranslation.t(status === 'open' ? 'openBadge' : status === 'closed' ? 'closedBadge' : 'hoursUnavailable')}
            </Text>
          </View>
        </View>
        <Text maxFontSizeMultiplier={LABEL_TEXT_CAP} numberOfLines={1} style={[styles.category, { color: colors.textSecondary }]}>
          {item.category}
        </Text>
        <View style={styles.bottomRow}>
          <View style={styles.stats}>
            {item.distanceLabel ? (
              <View style={styles.stat}>
                <IconMapPin size={12} color={colors.textTertiary} strokeWidth={2} />
                <Text maxFontSizeMultiplier={LABEL_TEXT_CAP} style={[styles.statText, { color: colors.textTertiary }]}>{item.distanceLabel}</Text>
              </View>
            ) : null}
            {item.room_count > 0 ? (
              <View style={styles.stat}>
                <IconMessage size={12} color={colors.textTertiary} strokeWidth={2} />
                <Text maxFontSizeMultiplier={LABEL_TEXT_CAP} style={[styles.statText, { color: colors.textTertiary }]}>
                  {nearbyTranslation.t('roomCount', { count: item.room_count })}
                </Text>
              </View>
            ) : null}
            {item.active_users != null ? (
              <View style={styles.stat}>
                <IconUsers size={12} color={colors.textTertiary} strokeWidth={2} />
                <Text maxFontSizeMultiplier={LABEL_TEXT_CAP} style={[styles.statText, { color: colors.textTertiary }]}>
                  {nearbyTranslation.t('activeUsersCount', { count: item.active_users })}
                </Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.8}
            onPress={() => onEnter(item)}
            style={[styles.enter, { backgroundColor: colors.brandFill }]}
          >
            <Text maxFontSizeMultiplier={LABEL_TEXT_CAP} style={[styles.enterText, { color: palette.bgSurfaceLight }]}>
              {mapTranslation.t('nearbyEnter')}
            </Text>
          </TouchableOpacity>
        </View>
        {status === 'closed' ? (
          <View style={styles.closedNote} accessible accessibilityRole="text" accessibilityLabel={nearbyTranslation.t('closedNowA11y')}>
            <IconClock size={13} color={colors.warningText} strokeWidth={2} />
            <Text maxFontSizeMultiplier={LABEL_TEXT_CAP} style={[styles.closedNoteText, { color: colors.warningText }]}>{nearbyTranslation.t('closedNow')}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Placeholder with the real card's container, avatar tile (48, radius 13), title and category lines and the 34 pt button, so the list does not jump. */
export function BusinessCardSkeleton() {
  const colors = useThemeColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}>
      <Skeleton width={48} height={48} radius={13} />
      <View style={styles.content}>
        <View style={styles.skeletonTitleLine}>
          <Skeleton width="60%" height={13} />
        </View>
        <View style={styles.skeletonCategoryLine}>
          <Skeleton width="40%" height={10} />
        </View>
        <View style={styles.bottomRow}>
          <View style={styles.stats}>
            <Skeleton width="45%" height={10} />
          </View>
          <Skeleton width={72} height={34} radius={17} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonTitleLine: { height: 20, justifyContent: 'center' },
  skeletonCategoryLine: { height: 15, justifyContent: 'center' },
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
  closedNote: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  closedNoteText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  enter: { minHeight: 34, borderRadius: 17, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  enterText: { fontSize: 12, fontWeight: '800' },
});
