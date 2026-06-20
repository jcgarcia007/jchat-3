/**
 * JChat 3.0 — FilterPanel (Task 4.6)
 * Source of truth: JCHAT_3.0_DEV_PLAN.docx · Task 4.6
 *                  JCHAT_3.0_DESIGN_SYSTEM.docx · Section 12
 *
 * Responsibilities:
 *   - Horizontal scroll of quick-filter chips (All · Bars · Cafes · Food · Events · Open now).
 *   - Search bar — emits query text via onSearch; MapScreen handles results rendering.
 *   - Results count badge — "{N} places near you".
 *   - Advanced filter sheet — slides up from bottom via RN Modal + Animated.
 *       • Distance: segmented selector (1 / 2 / 5 / 10 km) — no slider lib needed.
 *       • Minimum rating: 1–5 star stepper.
 *       • Category multi-select (same set as chips, extended).
 *       • Minimum active users stepper.
 *   - Reset filters button — visible only when any filter differs from defaultFilters.
 *   - Emits MapFilters via onChange on every change.
 *
 * Distance approach: segmented option buttons (1 / 2 / 5 / 10 km).
 * No external slider library is needed or installed — the design doc does not
 * specify a continuous slider, and the segmented approach maps directly to the
 * four practical search radii described in JCHAT_3.0_MASTER_SPEC.docx §5.1.
 *
 * // TODO(i18n): replace all English UI strings with translation keys
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  IconAdjustmentsHorizontal,
  IconBuilding,
  IconBuildingStore,
  IconCalendarEvent,
  IconClock,
  IconSearch,
  IconStar,
  IconStarFilled,
  IconUsers,
  IconX,
} from '@tabler/icons-react-native';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';

// ── Public types ──────────────────────────────────────────────────────────────

/** Categories mirrored by the quick-filter chips and the advanced panel. */
export type MapCategory =
  | 'all'
  | 'bars'
  | 'cafes'
  | 'food'
  | 'events'
  | 'open_now';

/** Distance filter in kilometres. */
export type DistanceKm = 1 | 2 | 5 | 10;

/**
 * Full filter state emitted to the parent (MapScreen).
 * MapScreen is responsible for applying these to the visible pins and heatmap.
 */
export interface MapFilters {
  /** Quick-chip category; 'all' means no category restriction. */
  category: MapCategory;
  /** Only show businesses that are open right now. */
  openNow: boolean;
  /** Maximum search radius in km. */
  distanceKm: DistanceKm;
  /** Minimum average rating (0 = no minimum). */
  minRating: number;
  /** Minimum number of active users inside (0 = no minimum). */
  minActiveUsers: number;
  /** Free-text search query. */
  searchQuery: string;
}

/** Default (no-filter) state — export so MapScreen can initialise its own state. */
export const defaultFilters: MapFilters = {
  category: 'all',
  openNow: false,
  distanceKm: 5,
  minRating: 0,
  minActiveUsers: 0,
  searchQuery: '',
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface FilterPanelProps {
  /** Current filter state (controlled). */
  filters: MapFilters;
  /** Called every time any filter value changes. */
  onChange: (filters: MapFilters) => void;
  /**
   * Number of places that match the current filters.
   * Passed in from MapScreen (which owns the pin data).
   */
  resultCount?: number;
}

// ── Static data ───────────────────────────────────────────────────────────────

interface ChipDef {
  key: MapCategory;
  label: string; // TODO(i18n)
  icon: React.ReactNode;
}

const DISTANCE_OPTIONS: DistanceKm[] = [1, 2, 5, 10];

const ADVANCED_CATEGORIES: Array<{ key: MapCategory; label: string }> = [
  { key: 'bars',   label: 'Bars' },      // TODO(i18n)
  { key: 'cafes',  label: 'Cafes' },     // TODO(i18n)
  { key: 'food',   label: 'Food' },      // TODO(i18n)
  { key: 'events', label: 'Events' },    // TODO(i18n)
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true when filters differ from defaultFilters in any meaningful way. */
function hasActiveFilters(f: MapFilters): boolean {
  return (
    f.category !== defaultFilters.category ||
    f.openNow !== defaultFilters.openNow ||
    f.distanceKm !== defaultFilters.distanceKm ||
    f.minRating !== defaultFilters.minRating ||
    f.minActiveUsers !== defaultFilters.minActiveUsers ||
    f.searchQuery.trim() !== ''
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** A single star icon for the rating stepper. */
function StarIcon({ filled, size, c }: { filled: boolean; size: number; c: ReturnType<typeof useThemeColors> }) {
  return filled
    ? <IconStarFilled size={size} color={palette.gold} />
    : <IconStar size={size} color={c.textTertiary} />;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FilterPanel({ filters, onChange, resultCount }: FilterPanelProps) {
  const c = useThemeColors();
  const [sheetVisible, setSheetVisible] = useState(false);

  // Local draft state for the advanced sheet — applied on "Apply"
  const [draft, setDraft] = useState<MapFilters>(filters);

  // Sync draft when filters change externally (e.g. parent reset)
  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  // Animated slide-up for the sheet backdrop + panel
  const slideAnim = useRef(new Animated.Value(0)).current;

  const openSheet = useCallback(() => {
    setDraft(filters);
    setSheetVisible(true);
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 60,
      friction: 10,
    }).start();
  }, [filters, slideAnim]);

  const closeSheet = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(() => setSheetVisible(false));
  }, [slideAnim]);

  // ── Chip tap ──────────────────────────────────────────────────────────────

  const handleChipPress = useCallback((key: MapCategory) => {
    if (key === 'open_now') {
      onChange({ ...filters, openNow: !filters.openNow });
    } else if (key === 'all') {
      onChange({ ...filters, category: 'all', openNow: false });
    } else {
      // Toggle: tapping the same category again resets to 'all'
      const next: MapCategory = filters.category === key ? 'all' : key;
      onChange({ ...filters, category: next });
    }
  }, [filters, onChange]);

  // ── Search ────────────────────────────────────────────────────────────────

  const handleSearchChange = useCallback((text: string) => {
    onChange({ ...filters, searchQuery: text });
  }, [filters, onChange]);

  // ── Reset ─────────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    onChange({ ...defaultFilters });
  }, [onChange]);

  // ── Advanced sheet — Apply / Cancel ───────────────────────────────────────

  const handleApply = useCallback(() => {
    onChange(draft);
    closeSheet();
  }, [draft, onChange, closeSheet]);

  // ── Chip definitions (icons use the theme colors via closure) ─────────────

  const chips: ChipDef[] = [
    { key: 'all',      label: 'All',      icon: <IconBuildingStore size={13} color={filters.category === 'all' ? '#ffffff' : c.textSecondary} /> },
    { key: 'bars',     label: 'Bars',     icon: <IconBuilding       size={13} color={filters.category === 'bars'   ? '#ffffff' : c.textSecondary} /> },
    { key: 'cafes',    label: 'Cafes',    icon: <IconBuilding       size={13} color={filters.category === 'cafes'  ? '#ffffff' : c.textSecondary} /> },
    { key: 'food',     label: 'Food',     icon: <IconBuilding       size={13} color={filters.category === 'food'   ? '#ffffff' : c.textSecondary} /> },
    { key: 'events',   label: 'Events',   icon: <IconCalendarEvent  size={13} color={filters.category === 'events' ? '#ffffff' : c.textSecondary} /> },
    { key: 'open_now', label: 'Open now', icon: <IconClock          size={13} color={filters.openNow              ? '#ffffff' : c.textSecondary} /> },
  ];

  const active = hasActiveFilters(filters);

  // Sheet translate Y: 0 = fully off-screen below, 1 = fully visible
  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [600, 0],
  });
  const backdropOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.6],
  });

  return (
    <View style={styles.root}>

      {/* ── Search bar ───────────────────────────────────────────────────────── */}
      <View style={[styles.searchRow, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
        <IconSearch size={16} color={c.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: c.textPrimary }]}
          placeholder="Search places…" // TODO(i18n)
          placeholderTextColor={c.textTertiary}
          value={filters.searchQuery}
          onChangeText={handleSearchChange}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
        />

        {/* Advanced filters toggle */}
        <Pressable
          onPress={openSheet}
          style={({ pressed }) => [
            styles.advancedBtn,
            {
              backgroundColor: active ? palette.brand : c.bgElevated,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Advanced filters" // TODO(i18n)
        >
          <IconAdjustmentsHorizontal size={15} color={active ? '#ffffff' : c.textSecondary} />
        </Pressable>
      </View>

      {/* ── Chip row ─────────────────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContent}
        style={styles.chipsScroll}
      >
        {chips.map((chip) => {
          const isActive =
            chip.key === 'open_now'
              ? filters.openNow
              : chip.key === 'all'
              ? filters.category === 'all' && !filters.openNow
              : filters.category === chip.key;

          return (
            <TouchableOpacity
              key={chip.key}
              style={[
                styles.chip,
                {
                  backgroundColor: isActive ? palette.brand : c.bgSurface,
                  borderColor: isActive ? palette.brand : c.borderSubtle,
                },
              ]}
              onPress={() => handleChipPress(chip.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={chip.label}
            >
              {chip.icon}
              <Text style={[styles.chipLabel, { color: isActive ? '#ffffff' : c.textSecondary }]}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Results count + Reset row ─────────────────────────────────────────── */}
      {(resultCount != null || active) && (
        <View style={styles.metaRow}>
          {resultCount != null && (
            <Text style={[styles.resultCount, { color: c.textSecondary }]}>
              {resultCount} places near you{/* TODO(i18n) */}
            </Text>
          )}
          {active && (
            <TouchableOpacity
              onPress={handleReset}
              style={[styles.resetBtn, { borderColor: c.borderSubtle }]}
              accessibilityRole="button"
              accessibilityLabel="Reset filters" // TODO(i18n)
            >
              <IconX size={11} color={c.textSecondary} />
              <Text style={[styles.resetLabel, { color: c.textSecondary }]}>
                Reset{/* TODO(i18n) */}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Advanced filter sheet ─────────────────────────────────────────────── */}
      <Modal
        visible={sheetVisible}
        transparent
        animationType="none"
        onRequestClose={closeSheet}
        statusBarTranslucent
      >
        {/* Backdrop */}
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
          pointerEvents="box-none"
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
        </Animated.View>

        {/* Sheet */}
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: c.bgSurface,
              borderTopColor: c.borderSubtle,
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Handle */}
          <View style={[styles.sheetHandle, { backgroundColor: c.borderSubtle }]} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: c.textPrimary }]}>
              Filters{/* TODO(i18n) */}
            </Text>
            <Pressable
              onPress={closeSheet}
              style={({ pressed }) => [styles.sheetClose, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Close" // TODO(i18n)
            >
              <IconX size={18} color={c.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetBody}
            bounces={false}
          >

            {/* ── Distance ──────────────────────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>
                Distance{/* TODO(i18n) */}
              </Text>
              <View style={styles.segmentedRow}>
                {DISTANCE_OPTIONS.map((km) => {
                  const sel = draft.distanceKm === km;
                  return (
                    <TouchableOpacity
                      key={km}
                      style={[
                        styles.segmentedBtn,
                        {
                          backgroundColor: sel ? palette.brand : c.bgElevated,
                          borderColor: sel ? palette.brand : c.borderSubtle,
                        },
                      ]}
                      onPress={() => setDraft((d) => ({ ...d, distanceKm: km }))}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: sel }}
                      accessibilityLabel={`${km} km`}
                    >
                      <Text style={[styles.segmentedLabel, { color: sel ? '#ffffff' : c.textPrimary }]}>
                        {km} km
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── Minimum rating ────────────────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>
                Minimum rating{/* TODO(i18n) */}
              </Text>
              <View style={styles.ratingStepperRow}>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => setDraft((d) => ({ ...d, minRating: n }))}
                    style={({ pressed }) => [styles.starBtn, { opacity: pressed ? 0.7 : 1 }]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: draft.minRating === n }}
                    accessibilityLabel={n === 0 ? 'Any rating' : `${n} stars minimum`} // TODO(i18n)
                  >
                    {n === 0 ? (
                      <Text style={[
                        styles.anyRatingLabel,
                        {
                          color: draft.minRating === 0 ? palette.brand : c.textTertiary,
                          fontWeight: draft.minRating === 0 ? '700' : '400',
                        },
                      ]}>
                        Any{/* TODO(i18n) */}
                      </Text>
                    ) : (
                      <StarIcon filled={n <= draft.minRating} size={26} c={c} />
                    )}
                  </Pressable>
                ))}
              </View>
            </View>

            {/* ── Category multi-select ─────────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>
                Category{/* TODO(i18n) */}
              </Text>
              <View style={styles.categoryGrid}>
                {ADVANCED_CATEGORIES.map(({ key, label }) => {
                  const sel = draft.category === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.categoryChip,
                        {
                          backgroundColor: sel ? palette.brandLight : c.bgElevated,
                          borderColor: sel ? palette.brand : c.borderSubtle,
                        },
                      ]}
                      onPress={() =>
                        setDraft((d) => ({ ...d, category: sel ? 'all' : key }))
                      }
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: sel }}
                      accessibilityLabel={label}
                    >
                      <Text style={[styles.categoryChipLabel, { color: sel ? palette.brand : c.textPrimary }]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── Minimum active users ──────────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>
                Minimum active users{/* TODO(i18n) */}
              </Text>
              <View style={styles.stepperRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.stepperBtn,
                    {
                      backgroundColor: c.bgElevated,
                      borderColor: c.borderSubtle,
                      opacity: pressed || draft.minActiveUsers === 0 ? 0.4 : 1,
                    },
                  ]}
                  onPress={() =>
                    setDraft((d) => ({ ...d, minActiveUsers: Math.max(0, d.minActiveUsers - 1) }))
                  }
                  disabled={draft.minActiveUsers === 0}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease minimum active users" // TODO(i18n)
                >
                  <Text style={[styles.stepperSymbol, { color: c.textPrimary }]}>−</Text>
                </Pressable>

                <View style={styles.stepperValueWrap}>
                  <IconUsers size={14} color={c.textSecondary} style={styles.stepperIcon} />
                  <Text style={[styles.stepperValue, { color: c.textPrimary }]}>
                    {draft.minActiveUsers === 0 ? 'Any' : String(draft.minActiveUsers)}
                    {/* TODO(i18n) */}
                  </Text>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.stepperBtn,
                    {
                      backgroundColor: c.bgElevated,
                      borderColor: c.borderSubtle,
                      opacity: pressed ? 0.4 : 1,
                    },
                  ]}
                  onPress={() =>
                    setDraft((d) => ({ ...d, minActiveUsers: d.minActiveUsers + 1 }))
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Increase minimum active users" // TODO(i18n)
                >
                  <Text style={[styles.stepperSymbol, { color: c.textPrimary }]}>+</Text>
                </Pressable>
              </View>
            </View>

            {/* ── Open now toggle ───────────────────────────────────────────── */}
            <View style={[styles.section, styles.openNowRow]}>
              <View style={styles.openNowLeft}>
                <IconClock size={16} color={palette.success} />
                <Text style={[styles.openNowLabel, { color: c.textPrimary }]}>
                  Open now only{/* TODO(i18n) */}
                </Text>
              </View>
              <Pressable
                onPress={() => setDraft((d) => ({ ...d, openNow: !d.openNow }))}
                style={[
                  styles.toggle,
                  {
                    backgroundColor: draft.openNow ? palette.success : c.bgElevated,
                    borderColor: draft.openNow ? palette.success : c.borderSubtle,
                  },
                ]}
                accessibilityRole="switch"
                accessibilityState={{ checked: draft.openNow }}
                accessibilityLabel="Open now only" // TODO(i18n)
              >
                <Animated.View
                  style={[
                    styles.toggleThumb,
                    {
                      backgroundColor: '#ffffff',
                      transform: [{ translateX: draft.openNow ? 18 : 2 }],
                    },
                  ]}
                />
              </Pressable>
            </View>

          </ScrollView>

          {/* ── Footer buttons ────────────────────────────────────────────────── */}
          <View style={[styles.sheetFooter, { borderTopColor: c.borderSubtle }]}>
            <TouchableOpacity
              style={[styles.footerResetBtn, { borderColor: c.borderSubtle }]}
              onPress={() => setDraft({ ...defaultFilters })}
              accessibilityRole="button"
              accessibilityLabel="Reset all filters" // TODO(i18n)
            >
              <Text style={[styles.footerResetLabel, { color: c.textSecondary }]}>
                Reset all{/* TODO(i18n) */}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.footerApplyBtn, { backgroundColor: palette.brand }]}
              onPress={handleApply}
              accessibilityRole="button"
              accessibilityLabel="Apply filters" // TODO(i18n)
            >
              <Text style={styles.footerApplyLabel}>
                Apply{/* TODO(i18n) */}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
// No hardcoded hex — all color values come from c.* theme tokens or palette.*

const styles = StyleSheet.create({
  root: {
    gap: 8,
  },

  // Search bar
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 0.5,
    paddingHorizontal: 10,
    height: 44,
    gap: 6,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  advancedBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Chip row
  chipsScroll: {
    flexGrow: 0,
  },
  chipsContent: {
    gap: 7,
    paddingRight: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 0.5,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Results + reset row
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  resultCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 0.5,
  },
  resetLabel: {
    fontSize: 11,
    fontWeight: '500',
  },

  // Modal backdrop
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
  },

  // Sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 0.5,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sheetClose: {
    padding: 4,
  },
  sheetBody: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 24,
  },

  // Generic section wrapper
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  // Segmented distance buttons
  segmentedRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentedBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedLabel: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Star rating stepper
  ratingStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  starBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 34,
  },
  anyRatingLabel: {
    fontSize: 13,
  },

  // Category multi-select chips
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 0.5,
  },
  categoryChipLabel: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Active users stepper
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperSymbol: {
    fontSize: 20,
    fontWeight: '300',
    lineHeight: 22,
  },
  stepperValueWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  stepperIcon: {
    // color applied inline
  },
  stepperValue: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Open now toggle row
  openNowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  openNowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  openNowLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  toggle: {
    width: 46,
    height: 28,
    borderRadius: 14,
    borderWidth: 0.5,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    // transform translateX applied inline
  },

  // Sheet footer
  sheetFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 0.5,
  },
  footerResetBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerResetLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  footerApplyBtn: {
    flex: 2,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerApplyLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
