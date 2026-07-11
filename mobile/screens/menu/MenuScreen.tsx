/**
 * JChat 3.0 — MenuScreen (Task 3.2)
 *
 * Full-screen menu for a business. Accessed from ChatRoomScreen via
 * navigation.navigate('Menu', { businessId, roomId }).
 *
 * ── Flow ──────────────────────────────────────────────────────────────────────
 * 1. Read businessId + optional roomId from route params.
 * 2. Call cart.setContext(businessId, roomId) so the cart knows the venue.
 * 3. Fetch menu via getMenu(businessId); show demo data when Supabase is off.
 * 4. Header: back + business name + cart icon with item-count badge.
 * 5. Search bar filters items by name (client-side).
 * 6. FeaturedOfferBanner: TODO — fetch active offer; stub shown for demo.
 * 7. CategoryTabs: sticky horizontal tabs; tapping jumps to that section.
 * 8. SectionList with category headers + ProductRow per item.
 * 9. CartBar: sticky bottom bar, visible only when itemCount > 0.
 *
 * ── Task stubs ────────────────────────────────────────────────────────────────
 * // TODO(Task 3.3): open ProductDetailScreen for items with required sizes.
 * // TODO(Task 3.4): navigate to CartScreen from CartBar.
 *
 * Colors: useThemeColors() only. Icons: @tabler/icons-react-native.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  SectionList,
  SectionListData,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  IconArrowLeft,
  IconShoppingCart,
  IconSearch,
} from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useCart } from '../../context/CartContext';
import { getMenu } from '../../services/menu';
import type { MenuCategory, MenuItem } from '../../services/menu';
import { isSupabaseConfigured } from '../../services/supabase';

import { CategoryTabs } from '../../components/menu/CategoryTabs';
import { ProductRow } from '../../components/menu/ProductRow';
import { CartBar } from '../../components/menu/CartBar';
import { FeaturedOfferBanner } from '../../components/menu/FeaturedOfferBanner';
import type { OfferStub } from '../../components/menu/FeaturedOfferBanner';

import type { MainStackParamList } from '../../navigation/AppNavigator';

// ── Types ──────────────────────────────────────────────────────────────────────

type MenuRoute = RouteProp<MainStackParamList, 'Menu'>;
type MenuNav = NativeStackNavigationProp<MainStackParamList, 'Menu'>;

interface MenuSection {
  categoryId: string;
  title: string;
  data: MenuItem[];
}

// ── Demo data ──────────────────────────────────────────────────────────────────

const DEMO_CATEGORIES: MenuCategory[] = [
  {
    id: 'cat-drinks',
    business_id: 'demo-biz',
    name: 'Drinks',
    icon: '🍹',
    sort: 0,
    is_published: true,
    items: [
      {
        id: 'item-1',
        category_id: 'cat-drinks',
        business_id: 'demo-biz',
        name: 'Rooftop Mojito',
        description: 'Fresh mint, lime, rum, soda water — perfectly balanced.',
        price_cents: 1400,
        photo_url: null,
        dietary_tags: ['vegan'],
        id_required: true,
        badge: 'best_seller',
        is_available: true,
        is_published: true,
        has_modifiers: false,
        stock_count: null,
        options: {
          sizes: [
            { label: 'Regular', price_cents: 0 },
            { label: 'Large', price_cents: 300 },
          ],
        },
        sort: 0,
      },
      {
        id: 'item-2',
        category_id: 'cat-drinks',
        business_id: 'demo-biz',
        name: 'Sparkling Water',
        description: null,
        price_cents: 400,
        photo_url: null,
        dietary_tags: ['vegan', 'gluten-free'],
        id_required: false,
        badge: null,
        is_available: true,
        is_published: true,
        has_modifiers: false,
        stock_count: null,
        options: {},
        sort: 1,
      },
      {
        id: 'item-3',
        category_id: 'cat-drinks',
        business_id: 'demo-biz',
        name: 'Tropical Sunrise',
        description: 'Mango, passion fruit, orange juice — non-alcoholic.',
        price_cents: 900,
        photo_url: null,
        dietary_tags: ['vegan', 'non-alcoholic'],
        id_required: false,
        badge: 'new',
        is_available: true,
        is_published: true,
        has_modifiers: false,
        stock_count: null,
        options: {},
        sort: 2,
      },
    ],
  },
  {
    id: 'cat-bites',
    business_id: 'demo-biz',
    name: 'Bites',
    icon: '🍟',
    sort: 1,
    is_published: true,
    items: [
      {
        id: 'item-4',
        category_id: 'cat-bites',
        business_id: 'demo-biz',
        name: 'Loaded Nachos',
        description: 'House-made chips, guacamole, pico de gallo, sour cream.',
        price_cents: 1200,
        photo_url: null,
        dietary_tags: ['vegetarian'],
        id_required: false,
        badge: 'hot',
        is_available: true,
        is_published: true,
        has_modifiers: false,
        stock_count: null,
        options: {},
        sort: 0,
      },
      {
        id: 'item-5',
        category_id: 'cat-bites',
        business_id: 'demo-biz',
        name: 'Slider Trio',
        description: 'Three mini beef sliders with secret sauce.',
        price_cents: 1500,
        photo_url: null,
        dietary_tags: [],
        id_required: false,
        badge: null,
        is_available: true,
        is_published: true,
        has_modifiers: false,
        stock_count: null,
        options: {},
        sort: 1,
      },
    ],
  },
  {
    id: 'cat-desserts',
    business_id: 'demo-biz',
    name: 'Desserts',
    icon: '🍰',
    sort: 2,
    is_published: true,
    items: [
      {
        id: 'item-6',
        category_id: 'cat-desserts',
        business_id: 'demo-biz',
        name: 'Churros with Chocolate',
        description: 'Crispy churros served with warm dark chocolate dipping sauce.',
        price_cents: 800,
        photo_url: null,
        dietary_tags: ['vegetarian'],
        id_required: false,
        badge: null,
        is_available: true,
        is_published: true,
        has_modifiers: false,
        stock_count: null,
        options: {},
        sort: 0,
      },
    ],
  },
];

const DEMO_OFFER: OfferStub = {
  title: '🎉 Happy Hour — 20% off all drinks!',
  description: 'Use code ROOFTOP20 at checkout to claim your discount on any drink.',
  expiryLabel: 'Ends tonight at 11 PM',
};

const DEMO_BUSINESS_NAME = 'The Rooftop Bar';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function buildSections(categories: MenuCategory[], query: string): MenuSection[] {
  const q = query.trim().toLowerCase();
  return categories
    .map((cat) => {
      const items = q
        ? cat.items.filter((it) => it.name.toLowerCase().includes(q))
        : cat.items;
      return { categoryId: cat.id, title: cat.name, data: items };
    })
    .filter((s) => s.data.length > 0);
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MenuScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('pos');
  const navigation = useNavigation<MenuNav>();
  const route = useRoute<MenuRoute>();
  const cart = useCart();

  const { businessId, roomId = null, businessName: routeBusinessName } = route.params;

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [businessName, setBusinessName] = useState(routeBusinessName ?? '');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  // TODO: fetch active offer from offers table (Task 2.6 / 3.16)
  const [activeOffer] = useState<OfferStub | null>(
    isSupabaseConfigured ? null : DEMO_OFFER,
  );

  const listRef = useRef<SectionList<MenuItem, MenuSection>>(null);
  // Target section for a pending scroll — retried if scrollToLocation fails
  // because the destination rows weren't measured yet (variable-height list).
  const pendingScrollSection = useRef<number | null>(null);

  // ── Set cart context once on mount ──────────────────────────────────────────

  useEffect(() => {
    cart.setContext(businessId, roomId);
  }, [businessId, roomId, cart.setContext]);

  // ── Load menu ────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        if (!isSupabaseConfigured) {
          if (!cancelled) {
            setCategories(DEMO_CATEGORIES);
            if (!routeBusinessName) setBusinessName(DEMO_BUSINESS_NAME);
          }
          return;
        }

        const cats = await getMenu(businessId);
        if (!cancelled) {
          setCategories(cats);
          // Business name comes from route params; the menu service doesn't fetch it.
          if (!routeBusinessName && cats.length === 0) {
            setBusinessName(t('menu.menuFallback'));
          }
        }
      } catch (err) {
        if (!cancelled) {
          Alert.alert(t('shared.errorTitle'), t('menu.loadError'));
          console.warn('[MenuScreen] getMenu error:', err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [businessId, routeBusinessName, t]);

  // Set first category as active once categories are loaded
  useEffect(() => {
    if (categories.length > 0 && activeCategoryId === null) {
      setActiveCategoryId(categories[0].id);
    }
  }, [categories, activeCategoryId]);

  // ── Derived sections ─────────────────────────────────────────────────────────

  const sections = useMemo<MenuSection[]>(
    () => buildSections(categories, searchQuery),
    [categories, searchQuery],
  );

  const categoryTabItems = useMemo(
    () => categories.map((cat) => ({ id: cat.id, name: cat.name })),
    [categories],
  );

  // ── Scroll to category ───────────────────────────────────────────────────────

  const scrollToCategory = useCallback(
    (categoryId: string) => {
      setActiveCategoryId(categoryId);
      const sectionIndex = sections.findIndex((s) => s.categoryId === categoryId);
      if (sectionIndex >= 0 && listRef.current) {
        pendingScrollSection.current = sectionIndex;
        listRef.current.scrollToLocation({
          sectionIndex,
          itemIndex: 0,
          viewOffset: 0,
          animated: true,
        });
      }
    },
    [sections],
  );

  // ── Track visible section for tab highlight ───────────────────────────────────

  const handleViewableItemsChanged = useCallback(
    (info: { viewableItems: Array<{ section?: MenuSection }> }) => {
      const firstSection = info.viewableItems.find((vi) => vi.section)?.section;
      if (firstSection) {
        setActiveCategoryId(firstSection.categoryId);
      }
    },
    [],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleCartPress = useCallback(() => {
    navigation.navigate('Cart');
  }, [navigation]);

  const handleOpenDetail = useCallback(
    (item: MenuItem) => {
      navigation.navigate('ProductDetail', { item });
    },
    [navigation],
  );

  // ── Render helpers ────────────────────────────────────────────────────────────

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<MenuItem, MenuSection> }) => (
      <View style={[styles.sectionHeader, { backgroundColor: c.bgBase, borderBottomColor: c.borderSubtle }]}>
        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
          {section.title}
        </Text>
      </View>
    ),
    [c],
  );

  const renderItem = useCallback(
    ({ item }: { item: MenuItem }) => (
      <ProductRow item={item} onOpenDetail={handleOpenDetail} />
    ),
    [handleOpenDetail],
  );

  const keyExtractor = useCallback((item: MenuItem) => item.id, []);

  const ListHeaderComponent = useMemo(
    () => (
      <FeaturedOfferBanner offer={activeOffer} />
    ),
    [activeOffer],
  );

  const ListEmptyComponent = useMemo(() => {
    if (loading) return null;
    return (
      <View style={styles.emptyState}>
        <Text style={[styles.emptyText, { color: c.textSecondary }]}>
          {searchQuery.trim()
            ? t('menu.noMatch', { query: searchQuery })
            : t('menu.noItems')}
        </Text>
      </View>
    );
  }, [loading, searchQuery, c, t]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bgBase }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: c.bgSurface, borderBottomColor: c.borderSubtle }]}>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={t('shared.goBack')}
          hitSlop={8}
        >
          <IconArrowLeft size={24} color={c.textPrimary} strokeWidth={2} />
        </Pressable>

        <Text style={[styles.headerTitle, { color: c.textPrimary }]} numberOfLines={1}>
          {businessName || t('menu.menuFallback')}
        </Text>

        <Pressable
          onPress={handleCartPress}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={t('menu.cartA11y', { count: cart.itemCount })}
          hitSlop={8}
        >
          <View>
            <IconShoppingCart size={24} color={c.textPrimary} strokeWidth={2} />
            {cart.itemCount > 0 ? (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>
                  {cart.itemCount > 9 ? '9+' : String(cart.itemCount)}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      </View>

      {/* ── Search bar ── */}
      <View style={[styles.searchContainer, { backgroundColor: c.bgSurface }]}>
        <View style={[styles.searchBar, { backgroundColor: c.bgElevated }]}>
          <IconSearch size={16} color={c.textTertiary} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: c.textPrimary }]}
            placeholder={t('menu.searchPlaceholder')}
            placeholderTextColor={c.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode={Platform.OS === 'ios' ? 'while-editing' : 'never'}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      </View>

      {/* ── Category tabs (sticky) ── */}
      <CategoryTabs
        categories={categoryTabItems}
        activeId={activeCategoryId}
        onSelect={scrollToCategory}
      />

      {/* ── Loading state ── */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.brand} />
        </View>
      ) : (
        <SectionList<MenuItem, MenuSection>
          ref={listRef}
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          ListHeaderComponent={ListHeaderComponent}
          ListEmptyComponent={ListEmptyComponent}
          stickySectionHeadersEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          onViewableItemsChanged={handleViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 20 }}
          onMomentumScrollEnd={() => {
            pendingScrollSection.current = null;
          }}
          // The destination rows weren't measured yet — retry once after a beat.
          onScrollToIndexFailed={() => {
            const target = pendingScrollSection.current;
            if (target == null) return;
            setTimeout(() => {
              listRef.current?.scrollToLocation({
                sectionIndex: target,
                itemIndex: 0,
                viewOffset: 0,
                animated: true,
              });
            }, 300);
          }}
        />
      )}

      {/* ── Cart bar (bottom, visible when cart has items) ── */}
      <CartBar onPress={handleCartPress} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    padding: 8,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  cartBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: palette.brand,
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#ffffff',
  },
  // Search
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
    margin: 0,
  },
  // List
  listContent: {
    paddingBottom: 16,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  // Loading / empty
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    paddingTop: 60,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
