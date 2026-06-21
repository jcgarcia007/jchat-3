/**
 * JChat 3.0 — Nearby Businesses Screen (Task 2.13)
 *
 * Shows a searchable, filterable list of active businesses sorted by distance.
 *
 * Features:
 *   - Search bar (real-time text filter on name + category)
 *   - Category filter chips (horizontal scroll)
 *   - Each row: emoji icon, name, category, distance, room count,
 *     active-user count, open/closed badge
 *   - Tap → TODO(Task 2.3): open BusinessPreviewCard
 *   - Empty state when no results or Supabase not configured
 *   - Pull-to-refresh
 *
 * Stubs:
 *   - Distance: "—" with // TODO(Stage 4): sort by live GPS distance
 *   - Active user count: 0 with // TODO(presence): live active counts
 *
 * Colors: useThemeColors() only. Icons: @tabler/icons-react-native only.
 * // TODO(i18n): all strings are English; wire to i18n once the layer is set up.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  IconBuildingStore,
  IconMapPin,
  IconSearch,
  IconUsers,
  IconMessage,
  IconX,
} from '@tabler/icons-react-native';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import type { MainStackParamList } from '../../navigation/AppNavigator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HoursEntry {
  open: string;   // "HH:MM"
  close: string;  // "HH:MM"
  closed?: boolean;
}

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
type Hours = Partial<Record<DayKey, HoursEntry>>;

interface BusinessRow {
  id: string;
  name: string;
  slug: string;
  category: string;
  address: string | null;
  icon_emoji: string | null;
  hours: Hours | null;
  room_count: number;
  /** Main room of the business — navigation target for "Join Chat". */
  main_room_id?: string | null;
  /** // TODO(presence): replace 0 with live active counts from presence channel */
  active_users: number;
}

// ---------------------------------------------------------------------------
// Demo fallback
// ---------------------------------------------------------------------------

const DEMO_BUSINESSES: BusinessRow[] = [
  {
    id: 'demo-1',
    name: 'The Blue Note',
    slug: 'the-blue-note',
    category: 'Bar & Lounge',
    address: '123 Main St',
    icon_emoji: '🎵',
    hours: {
      mon: { open: '17:00', close: '02:00' },
      tue: { open: '17:00', close: '02:00' },
      wed: { open: '17:00', close: '02:00' },
      thu: { open: '17:00', close: '02:00' },
      fri: { open: '16:00', close: '03:00' },
      sat: { open: '14:00', close: '03:00' },
      sun: { open: '14:00', close: '00:00' },
    },
    room_count: 3,
    active_users: 0,
  },
  {
    id: 'demo-2',
    name: 'Rooftop Garden',
    slug: 'rooftop-garden',
    category: 'Restaurant',
    address: '456 Oak Ave',
    icon_emoji: '🌿',
    hours: {
      mon: { open: '11:00', close: '22:00' },
      tue: { open: '11:00', close: '22:00' },
      wed: { open: '11:00', close: '22:00' },
      thu: { open: '11:00', close: '22:00' },
      fri: { open: '11:00', close: '23:00' },
      sat: { open: '10:00', close: '23:00' },
      sun: { closed: true, open: '00:00', close: '00:00' },
    },
    room_count: 2,
    active_users: 0,
  },
  {
    id: 'demo-3',
    name: 'Neon Club',
    slug: 'neon-club',
    category: 'Nightclub',
    address: '789 Electric Blvd',
    icon_emoji: '🌟',
    hours: {
      mon: { closed: true, open: '00:00', close: '00:00' },
      tue: { closed: true, open: '00:00', close: '00:00' },
      wed: { closed: true, open: '00:00', close: '00:00' },
      thu: { open: '22:00', close: '05:00' },
      fri: { open: '22:00', close: '06:00' },
      sat: { open: '22:00', close: '06:00' },
      sun: { closed: true, open: '00:00', close: '00:00' },
    },
    room_count: 5,
    active_users: 0,
  },
  {
    id: 'demo-4',
    name: 'Coffee House Co.',
    slug: 'coffee-house-co',
    category: 'Café',
    address: '321 Brew Street',
    icon_emoji: '☕',
    hours: {
      mon: { open: '07:00', close: '20:00' },
      tue: { open: '07:00', close: '20:00' },
      wed: { open: '07:00', close: '20:00' },
      thu: { open: '07:00', close: '20:00' },
      fri: { open: '07:00', close: '21:00' },
      sat: { open: '08:00', close: '21:00' },
      sun: { open: '08:00', close: '18:00' },
    },
    room_count: 1,
    active_users: 0,
  },
  {
    id: 'demo-5',
    name: 'Sports Arena Bar',
    slug: 'sports-arena-bar',
    category: 'Sports Bar',
    address: '55 Stadium Way',
    icon_emoji: '🏟️',
    hours: {
      mon: { open: '12:00', close: '01:00' },
      tue: { open: '12:00', close: '01:00' },
      wed: { open: '12:00', close: '01:00' },
      thu: { open: '12:00', close: '02:00' },
      fri: { open: '12:00', close: '03:00' },
      sat: { open: '11:00', close: '03:00' },
      sun: { open: '11:00', close: '00:00' },
    },
    room_count: 4,
    active_users: 0,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function getTodayKey(): DayKey {
  return DAY_KEYS[new Date().getDay()];
}

/** Returns true if the business is currently open based on hours. */
function isOpenNow(hours: Hours | null): boolean {
  if (!hours) return false;
  const todayKey = getTodayKey();
  const entry = hours[todayKey];
  if (!entry || entry.closed) return false;

  const now = new Date();
  const [openH, openM] = entry.open.split(':').map(Number);
  const [closeH, closeM] = entry.close.split(':').map(Number);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openH * 60 + openM;
  let closeMinutes = closeH * 60 + closeM;

  // Handle midnight-crossing hours (e.g. open: 22:00, close: 05:00)
  if (closeMinutes < openMinutes) {
    closeMinutes += 24 * 60;
  }

  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchBusinesses(): Promise<BusinessRow[]> {
  if (!isSupabaseConfigured) return DEMO_BUSINESSES;

  const { data: businesses, error } = await supabase
    .from('businesses')
    .select('id, name, slug, category, address, icon_emoji, hours')
    .in('status', ['pending', 'verified'])
    .order('name');

  if (error || !businesses) {
    console.warn('[NearbyScreen] fetchBusinesses error:', error?.message);
    return [];
  }

  // Fetch rooms per business in a single query (count + main room id)
  const ids = businesses.map((b: { id: string }) => b.id);
  const { data: roomRows } = await supabase
    .from('rooms')
    .select('id, business_id, is_main, sort')
    .in('business_id', ids)
    .order('is_main', { ascending: false })
    .order('sort', { ascending: true });

  const countMap: Record<string, number> = {};
  const mainRoomMap: Record<string, string> = {};
  (roomRows ?? []).forEach((r: { id: string; business_id: string; is_main: boolean }) => {
    countMap[r.business_id] = (countMap[r.business_id] ?? 0) + 1;
    // First row per business wins (is_main desc, sort asc) → the main room.
    if (!mainRoomMap[r.business_id]) mainRoomMap[r.business_id] = r.id;
  });

  return businesses.map((b: {
    id: string;
    name: string;
    slug: string;
    category: string;
    address: string | null;
    icon_emoji: string | null;
    hours: unknown;
  }) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    category: b.category,
    address: b.address,
    icon_emoji: b.icon_emoji,
    hours: (b.hours as Hours) ?? null,
    room_count: countMap[b.id] ?? 0,
    main_room_id: mainRoomMap[b.id] ?? null,
    // TODO(presence): replace 0 with live active counts from presence channel
    active_users: 0,
  }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface OpenBadgeProps {
  open: boolean;
}

function OpenBadge({ open }: OpenBadgeProps) {
  const c = useThemeColors();
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: open
            ? `${palette.success}22`
            : `${palette.danger}22`,
        },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          { color: open ? palette.success : palette.danger },
        ]}
      >
        {open ? 'Open' : 'Closed'}
      </Text>
    </View>
  );
}

interface BusinessCardProps {
  item: BusinessRow;
  onPress: (item: BusinessRow) => void;
}

function BusinessCard({ item, onPress }: BusinessCardProps) {
  const c = useThemeColors();
  const open = isOpenNow(item.hours);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}
      onPress={() => onPress(item)}
      activeOpacity={0.75}
    >
      {/* Left: emoji avatar */}
      <View style={[styles.avatarWrap, { backgroundColor: c.bgElevated }]}>
        <Text style={styles.avatarEmoji}>{item.icon_emoji ?? '🏪'}</Text>
      </View>

      {/* Center: info */}
      <View style={styles.cardContent}>
        <View style={styles.cardTopRow}>
          <Text
            style={[styles.cardName, { color: c.textPrimary }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <OpenBadge open={open} />
        </View>

        <Text
          style={[styles.cardCategory, { color: c.textSecondary }]}
          numberOfLines={1}
        >
          {item.category}
        </Text>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {/* Distance — Stage 4 GPS placeholder */}
          <View style={styles.statChip}>
            <IconMapPin size={12} color={c.textTertiary} strokeWidth={2} />
            {/* TODO(Stage 4): sort by live GPS distance and show real value */}
            <Text style={[styles.statText, { color: c.textTertiary }]}>—</Text>
          </View>

          {/* Rooms */}
          <View style={styles.statChip}>
            <IconMessage size={12} color={c.textTertiary} strokeWidth={2} />
            <Text style={[styles.statText, { color: c.textTertiary }]}>
              {item.room_count} {item.room_count === 1 ? 'room' : 'rooms'}
            </Text>
          </View>

          {/* Active users */}
          <View style={styles.statChip}>
            <IconUsers size={12} color={c.textTertiary} strokeWidth={2} />
            {/* TODO(presence): replace 0 with live active counts */}
            <Text style={[styles.statText, { color: c.textTertiary }]}>
              {item.active_users} active
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

interface CategoryChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

function CategoryChip({ label, active, onPress }: CategoryChipProps) {
  const c = useThemeColors();
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: active ? palette.brand : c.bgSurface,
          borderColor: active ? palette.brand : c.borderSubtle,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text
        style={[
          styles.chipText,
          // Active chip sits on brand-blue bg; use the light surface token for contrast
          { color: active ? palette.bgSurfaceLight : c.textSecondary },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function NearbyScreen() {
  const c = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const data = await fetchBusinesses();
    setBusinesses(data);

    if (isRefresh) setRefreshing(false);
    else setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Derived data ──────────────────────────────────────────────────────────

  /** Unique sorted category list from all loaded businesses */
  const categories = useMemo<string[]>(() => {
    const cats = new Set(businesses.map((b) => b.category));
    return Array.from(cats).sort();
  }, [businesses]);

  /** Filtered businesses: search query + category chip */
  const filtered = useMemo<BusinessRow[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    return businesses.filter((b) => {
      const matchesSearch =
        !q ||
        b.name.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q);
      const matchesCategory =
        !selectedCategory || b.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [businesses, searchQuery, selectedCategory]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handlePress = useCallback(
    (item: BusinessRow) => {
      // Enter the business's main room chat. In demo mode (no main_room_id) we
      // pass the business id — ChatRoomScreen falls back to demo data there.
      const target = item.main_room_id ?? item.id;
      navigation.navigate('ChatRoom', { id: target });
    },
    [navigation],
  );

  const handleCategoryPress = useCallback((cat: string) => {
    setSelectedCategory((prev) => (prev === cat ? null : cat));
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<BusinessRow>) => (
      <BusinessCard item={item} onPress={handlePress} />
    ),
    [handlePress],
  );

  const keyExtractor = useCallback((item: BusinessRow) => item.id, []);

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.bgBase }]}>
        <ActivityIndicator size="large" color={palette.brand} />
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: c.bgBase }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.borderSubtle }]}>
        <View style={styles.headerRow}>
          <IconBuildingStore size={22} color={palette.brand} strokeWidth={2} />
          <Text style={[styles.headerTitle, { color: c.textPrimary }]}>
            Nearby
          </Text>
        </View>

        {/* Search bar */}
        <View
          style={[
            styles.searchBar,
            { backgroundColor: c.bgSurface, borderColor: c.borderSubtle },
          ]}
        >
          <IconSearch size={16} color={c.textTertiary} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: c.textPrimary }]}
            placeholder="Search venues…"
            placeholderTextColor={c.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="never"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={handleClearSearch} hitSlop={8}>
              <IconX size={14} color={c.textTertiary} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category chips */}
      {categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContainer}
          style={[styles.chipsScroll, { borderBottomColor: c.borderSubtle }]}
        >
          {categories.map((cat) => (
            <CategoryChip
              key={cat}
              label={cat}
              active={selectedCategory === cat}
              onPress={() => handleCategoryPress(cat)}
            />
          ))}
        </ScrollView>
      )}

      {/* List */}
      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={palette.brand}
            colors={[palette.brand]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <IconBuildingStore size={40} color={c.textTertiary} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
              {businesses.length === 0
                ? 'No venues nearby'
                : 'No results found'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: c.textTertiary }]}>
              {businesses.length === 0
                ? 'Check back soon — more venues are joining JChat.'
                : 'Try a different search or clear the filter.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header
  header: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.3,
  },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
    margin: 0,
  },

  // Category chips
  chipsScroll: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chipsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // List
  listContent: {
    padding: 16,
    gap: 10,
    flexGrow: 1,
  },

  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarEmoji: {
    fontSize: 26,
  },
  cardContent: {
    flex: 1,
    gap: 3,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  cardCategory: {
    fontSize: 12,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statText: {
    fontSize: 11,
  },

  // Badge
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Empty state
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
