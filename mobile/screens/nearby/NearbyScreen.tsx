import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconBuildingStore } from '@tabler/icons-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import BusinessCard from '../../components/nearby/BusinessCard';
import NearbyFilters from '../../components/nearby/NearbyFilters';
import { useNearbyBusinesses } from '../../hooks/useNearbyBusinesses';
import type { MainStackParamList } from '../../navigation/AppNavigator';
import { haversineMeters } from '../../services/geofence';
import { formatDistanceLabel, type NearbyBusiness } from '../../services/nearby';
import { useThemeColors } from '../../theme/colors';
import { useHomeBarInset } from '../../components/venue/HomeBarInset';

export default function NearbyScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const translation = useTranslation('nearby');
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const nearby = useNearbyBusinesses();
  const homeBarInset = useHomeBarInset();

  const enterBusiness = useCallback((business: NearbyBusiness) => {
    navigation.navigate('ChatRoom', { id: business.main_room_id ?? business.id });
  }, [navigation]);

  const { position } = nearby;
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<NearbyBusiness>) => {
      const withDistance = position && typeof item.lat === 'number' && typeof item.lng === 'number'
        ? { ...item, distanceLabel: formatDistanceLabel(haversineMeters(position.lat, position.lng, item.lat, item.lng)) }
        : item;
      return <BusinessCard item={withDistance} onEnter={enterBusiness} />;
    },
    [enterBusiness, position],
  );

  if (nearby.loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bgBase }]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bgBase }]}>
      <View
        style={[
          styles.header,
          {
            borderBottomColor: colors.borderSubtle,
            paddingTop: insets.top + 12,
          },
        ]}
      >
        <View style={styles.titleRow}>
          <IconBuildingStore size={22} color={colors.brand} strokeWidth={2} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {translation.t('headerTitle')}
          </Text>
        </View>
        <NearbyFilters
          allLabel={translation.t('allCategories')}
          categories={nearby.categories}
          onChangeSearch={nearby.setSearchQuery}
          onSelectCategory={nearby.setSelectedCategory}
          placeholder={translation.t('searchPlaceholder')}
          searchQuery={nearby.searchQuery}
          selectedCategory={nearby.selectedCategory}
        />
      </View>
      <FlatList
        contentContainerStyle={[styles.list, { paddingBottom: 102 + insets.bottom + homeBarInset }]}
        data={nearby.filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            colors={[colors.brand]}
            onRefresh={() => { void nearby.load(true); }}
            refreshing={nearby.refreshing}
            tintColor={colors.brand}
          />
        )}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <IconBuildingStore size={40} color={colors.textTertiary} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {translation.t(nearby.businesses.length === 0 ? 'noVenuesTitle' : 'noResultsTitle')}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
              {translation.t(nearby.businesses.length === 0 ? 'noVenuesSubtitle' : 'noResultsSubtitle')}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 16, paddingBottom: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.3 },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  emptySubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
