import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconArrowLeft, IconSpeakerphone } from '@tabler/icons-react-native';
import { useTranslation } from 'react-i18next';

import type { MainStackParamList } from '../../navigation/AppNavigator';
import { fetchActiveOffers, type ActiveOffer } from '../../services/offers';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';

type OffersNavigation = NativeStackNavigationProp<MainStackParamList, 'Offers'>;

export default function OffersScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<OffersNavigation>();
  const translation = useTranslation('offers');
  const commonTranslation = useTranslation('common');
  const [offers, setOffers] = useState<ActiveOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(translation.i18n.language, { dateStyle: 'medium' }),
    [translation.i18n.language],
  );

  const load = useCallback(async () => {
    try {
      setOffers(await fetchActiveOffers());
    } catch (error) {
      console.warn('[offers] fetch error:', error);
      setOffers([]);
    }
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const enterOffer = useCallback((offer: ActiveOffer) => {
    navigation.navigate('ChatRoom', {
      id: offer.room_id ?? offer.main_room_id ?? offer.business_id,
    });
  }, [navigation]);

  const renderOffer = useCallback(({ item }: ListRenderItemInfo<ActiveOffer>) => (
    <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}>
      <View style={styles.businessRow}>
        <View style={[styles.emoji, { backgroundColor: colors.bgElevated }]}>
          <Text style={styles.emojiText}>{item.business.icon_emoji ?? '🏪'}</Text>
        </View>
        <Text numberOfLines={1} style={[styles.businessName, { color: colors.textSecondary }]}>
          {item.business.name}
        </Text>
      </View>

      <Text style={[styles.offerTitle, { color: colors.textPrimary }]}>{item.title}</Text>
      {item.description ? (
        <Text numberOfLines={2} style={[styles.description, { color: colors.textSecondary }]}>
          {item.description}
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
        onPress={() => enterOffer(item)}
        style={[styles.enterButton, { backgroundColor: colors.brand }]}
      >
        <Text style={[styles.enterText, { color: palette.bgSurfaceLight }]}>{translation.t('enter')}</Text>
      </TouchableOpacity>
    </View>
  ), [colors, dateFormatter, enterOffer, translation]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bgBase, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <Pressable
          accessibilityLabel={commonTranslation.t('back')}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <IconArrowLeft size={24} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{translation.t('title')}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[styles.list, offers.length === 0 && styles.emptyList]}
          data={offers}
          keyExtractor={(item) => item.id}
          renderItem={renderOffer}
          refreshControl={(
            <RefreshControl
              colors={[colors.brand]}
              onRefresh={() => { void refresh(); }}
              refreshing={refreshing}
              tintColor={colors.brand}
            />
          )}
          ListEmptyComponent={(
            <View style={styles.empty}>
              <IconSpeakerphone size={46} color={colors.textTertiary} strokeWidth={1.5} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {translation.t('emptyTitle')}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {translation.t('emptySubtitle')}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 58,
    paddingHorizontal: 16,
  },
  backButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  headerTitle: { fontSize: 22, fontWeight: '700', marginLeft: 4 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  list: { gap: 12, padding: 16, paddingBottom: 36 },
  emptyList: { flexGrow: 1 },
  empty: { alignItems: 'center', flex: 1, gap: 10, justifyContent: 'center', paddingHorizontal: 36 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, gap: 10, padding: 16 },
  businessRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  emoji: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  emojiText: { fontSize: 19 },
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
