import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  PanResponder,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconBuildingStore, IconChevronDown, IconChevronUp } from '@tabler/icons-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useNearbyBusinesses } from '../../hooks/useNearbyBusinesses';
import type { MainStackParamList } from '../../navigation/AppNavigator';
import type { NearbyBusiness } from '../../services/nearby';
import { useThemeColors } from '../../theme/colors';
import BusinessCard from '../nearby/BusinessCard';
import NearbyFilters from '../nearby/NearbyFilters';
import GlassSheetSurface from '../navigation/GlassSheetSurface';

export const NEARBY_SHEET_BOTTOM_OFFSET = 136;
export const NEARBY_SHEET_COLLAPSED_HEIGHT = 184;

export default function NearbySheet() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const mapTranslation = useTranslation('map');
  const nearbyTranslation = useTranslation('nearby');
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const nearby = useNearbyBusinesses();
  const [expanded, setExpanded] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  const expandedHeight = Math.max(
    NEARBY_SHEET_COLLAPSED_HEIGHT,
    Math.min(
      windowHeight * 0.85,
      windowHeight - NEARBY_SHEET_BOTTOM_OFFSET - insets.bottom - insets.top - 12,
    ),
  );

  useEffect(() => {
    Animated.timing(progress, {
      toValue: expanded ? 1 : 0,
      duration: 260,
      useNativeDriver: false,
    }).start();
  }, [expanded, progress]);

  const toggle = useCallback(() => setExpanded((value) => !value), []);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 6,
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy < -24) setExpanded(true);
      else if (gesture.dy > 24) setExpanded(false);
      else toggle();
    },
  }), [toggle]);

  const enterBusiness = useCallback((business: NearbyBusiness) => {
    navigation.navigate('ChatRoom', { id: business.main_room_id ?? business.id });
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<NearbyBusiness>) => (
      <BusinessCard item={item} onEnter={enterBusiness} />
    ),
    [enterBusiness],
  );

  const animatedHeight = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [NEARBY_SHEET_COLLAPSED_HEIGHT, expandedHeight],
  });

  return (
    <Animated.View
      style={[
        styles.position,
        {
          bottom: NEARBY_SHEET_BOTTOM_OFFSET + insets.bottom,
          height: animatedHeight,
        },
      ]}
    >
      <GlassSheetSurface style={styles.surface}>
        <Pressable
          accessibilityLabel={mapTranslation.t('nearbySwipe')}
          accessibilityRole="button"
          onPress={toggle}
          style={styles.header}
          {...panResponder.panHandlers}
        >
          <View style={[styles.handle, { backgroundColor: colors.textTertiary }]} />
          <View style={styles.titleRow}>
            <View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                {mapTranslation.t('nearbyTitle')}
              </Text>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                {mapTranslation.t('nearbySwipe')}
              </Text>
            </View>
            {expanded
              ? <IconChevronDown size={22} color={colors.textSecondary} strokeWidth={2} />
              : <IconChevronUp size={22} color={colors.textSecondary} strokeWidth={2} />}
          </View>
        </Pressable>

        {nearby.loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color={colors.brand} />
          </View>
        ) : expanded ? (
          <View style={styles.expandedBody}>
            <NearbyFilters
              allLabel={nearbyTranslation.t('allCategories')}
              categories={nearby.categories}
              onChangeSearch={nearby.setSearchQuery}
              onSelectCategory={nearby.setSelectedCategory}
              placeholder={nearbyTranslation.t('searchPlaceholder')}
              searchQuery={nearby.searchQuery}
              selectedCategory={nearby.selectedCategory}
            />
            <FlatList
              contentContainerStyle={styles.list}
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
                  <IconBuildingStore size={32} color={colors.textTertiary} strokeWidth={1.5} />
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    {nearbyTranslation.t(nearby.businesses.length === 0 ? 'noVenuesTitle' : 'noResultsTitle')}
                  </Text>
                </View>
              )}
            />
          </View>
        ) : nearby.filtered[0] ? (
          <View style={styles.collapsedCard}>
            <BusinessCard item={nearby.filtered[0]} onEnter={enterBusiness} />
          </View>
        ) : (
          <View style={styles.centered}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {nearbyTranslation.t('noVenuesTitle')}
            </Text>
          </View>
        )}
      </GlassSheetSurface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  position: { position: 'absolute', left: 16, right: 16, zIndex: 30 },
  surface: { flex: 1, borderRadius: 24 },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  handle: { width: 42, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 8, marginBottom: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '800' },
  hint: { marginTop: 1, fontSize: 11 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  collapsedCard: { paddingHorizontal: 10, paddingBottom: 10 },
  expandedBody: { flex: 1, paddingHorizontal: 12, paddingBottom: 10, gap: 10 },
  list: { gap: 9, paddingBottom: 8, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 28 },
  emptyText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
