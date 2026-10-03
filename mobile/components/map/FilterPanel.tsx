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
 *   - Reset filters button — visible only when any filter differs from defaultFilters.
 *   - Emits MapFilters via onChange on every change.
 *
 * Distance approach: segmented option buttons (1 / 2 / 5 / 10 km).
 * No external slider library is needed or installed — the design doc does not
 * specify a continuous slider, and the segmented approach maps directly to the
 * four practical search radii described in JCHAT_3.0_MASTER_SPEC.docx §5.1.
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
import { useTranslation } from 'react-i18next';
import {
  IconAdjustmentsHorizontal,
  IconBuilding,
  IconBuildingStore,
  IconClock,
  IconSearch,
  IconX,
} from '@tabler/icons-react-native';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { usesKilometers } from '../../utils/distanceUnits';
import type { CategoryOption } from '../../utils/categories';

// ── Public types ──────────────────────────────────────────────────────────────

/** 'all' (no restriction) or the normalized key of a real category (see utils/categories). */
export type MapCategory = string;

/** Distance filter in kilometres; 'all' = no radius (the default). */
export type DistanceKm = 'all' | 1 | 2 | 5 | 10;

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
  distanceKm: 'all',
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
  /** Whether the user's position is known; without it the radius can't be applied. */
  hasLocation?: boolean;
  /** Real categories present on the map (one chip each). */
  categories: CategoryOption[];
}

// ── Static data ───────────────────────────────────────────────────────────────

interface ChipDef {
  /** 'all', 'open_now', or a category key. */
  key: string;
  kind: 'all' | 'category' | 'open_now';
  label: string;
  icon: React.ReactNode;
}

const DISTANCE_OPTIONS: DistanceKm[] = ['all', 1, 2, 5, 10];
const MILES_PER_KM = 0.621371;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true when filters differ from defaultFilters in any meaningful way. Without a user
 * location the radius can't be applied, so it does not count as an active filter.
 */
function hasActiveFilters(f: MapFilters, hasLocation: boolean): boolean {
  return (
    f.category !== defaultFilters.category ||
    f.openNow !== defaultFilters.openNow ||
    (hasLocation && f.distanceKm !== defaultFilters.distanceKm) ||
    f.minRating !== defaultFilters.minRating ||
    f.minActiveUsers !== defaultFilters.minActiveUsers ||
    f.searchQuery.trim() !== ''
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FilterPanel({ filters, onChange, resultCount, hasLocation = true, categories }: FilterPanelProps) {
  const { t } = useTranslation('map');
  // Radius labels follow the region: kilometres, or miles for everyone else.
  const inKilometers = usesKilometers();
  const distanceLabel = (km: DistanceKm): string => {
    if (km === 'all') return t('filterPanel.distanceAll');
    if (inKilometers) return t('filterPanel.distanceKm', { count: km });
    return t('filterPanel.distanceMiles', { count: Math.round(km * MILES_PER_KM * 10) / 10 });
  };
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

  const handleChipPress = useCallback((chip: ChipDef) => {
    if (chip.kind === 'open_now') {
      onChange({ ...filters, openNow: !filters.openNow });
    } else if (chip.kind === 'all') {
      onChange({ ...filters, category: 'all', openNow: false });
    } else {
      // Toggle: tapping the same category again resets to 'all'
      onChange({ ...filters, category: filters.category === chip.key ? 'all' : chip.key });
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

  const chipIconColor = (isActive: boolean) => (isActive ? palette.bgSurfaceLight : c.textSecondary);
  const chips: ChipDef[] = [
    {
      key: 'all', kind: 'all', label: t('filterPanel.categoryAll'),
      icon: <IconBuildingStore size={13} color={chipIconColor(filters.category === 'all' && !filters.openNow)} />,
    },
    ...categories.map((option): ChipDef => ({
      key: option.key, kind: 'category', label: option.label,
      icon: <IconBuilding size={13} color={chipIconColor(filters.category === option.key)} />,
    })),
    {
      key: 'open_now', kind: 'open_now', label: t('filterPanel.categoryOpenNow'),
      icon: <IconClock size={13} color={chipIconColor(filters.openNow)} />,
    },
  ];

  const active = hasActiveFilters(filters, hasLocation);

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
          placeholder={t('filterPanel.searchPlaceholder')}
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
          accessibilityLabel={t('filterPanel.advancedFiltersA11y')}
        >
          <IconAdjustmentsHorizontal size={15} color={active ? palette.bgSurfaceLight : c.textSecondary} />
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
            chip.kind === 'open_now'
              ? filters.openNow
              : chip.kind === 'all'
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
              onPress={() => handleChipPress(chip)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={chip.label}
            >
              {chip.icon}
              <Text style={[styles.chipLabel, { color: isActive ? palette.bgSurfaceLight : c.textSecondary }]}>
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
              {t('filterPanel.resultsCount', { count: resultCount })}
            </Text>
          )}
          {active && (
            <TouchableOpacity
              onPress={handleReset}
              style={[styles.resetBtn, { borderColor: c.borderSubtle }]}
              accessibilityRole="button"
              accessibilityLabel={t('filterPanel.resetFiltersA11y')}
            >
              <IconX size={11} color={c.textSecondary} />
              <Text style={[styles.resetLabel, { color: c.textSecondary }]}>
                {t('filterPanel.reset')}
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
              {t('filterPanel.sheetTitle')}
            </Text>
            <Pressable
              onPress={closeSheet}
              style={({ pressed }) => [styles.sheetClose, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={t('filterPanel.close')}
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
                {t('filterPanel.distanceSectionLabel')}
              </Text>
              <View style={styles.segmentedRow}>
                {DISTANCE_OPTIONS.map((km) => {
                  const sel = draft.distanceKm === km;
                  return (
                    <TouchableOpacity
                      key={String(km)}
                      disabled={!hasLocation}
                      style={[
                        styles.segmentedBtn,
                        {
                          backgroundColor: sel ? palette.brand : c.bgElevated,
                          borderColor: sel ? palette.brand : c.borderSubtle,
                          opacity: hasLocation ? 1 : 0.4,
                        },
                      ]}
                      onPress={() => setDraft((d) => ({ ...d, distanceKm: km }))}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: sel, disabled: !hasLocation }}
                      accessibilityLabel={distanceLabel(km)}
                    >
                      <Text style={[styles.segmentedLabel, { color: sel ? palette.bgSurfaceLight : c.textPrimary }]}>
                        {distanceLabel(km)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!hasLocation ? (
                <Text style={[styles.sectionLabel, { color: c.textTertiary, marginTop: 8, textTransform: 'none' }]}>
                  {t('filterPanel.distanceNeedsLocation')}
                </Text>
              ) : null}
            </View>

            {/* TODO(rating): Reactivate this control when business rating data is available. */}

            {/* TODO(presence): Reactivate this control when live presence data is available. */}

            {/* ── Open now toggle ───────────────────────────────────────────── */}
            <View style={[styles.section, styles.openNowRow]}>
              <View style={styles.openNowLeft}>
                <IconClock size={16} color={palette.success} />
                <Text style={[styles.openNowLabel, { color: c.textPrimary }]}>
                  {t('filterPanel.openNowOnly')}
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
                accessibilityLabel={t('filterPanel.openNowOnly')}
              >
                <Animated.View
                  style={[
                    styles.toggleThumb,
                    {
                      backgroundColor: palette.bgSurfaceLight,
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
              accessibilityLabel={t('filterPanel.resetAllFiltersA11y')}
            >
              <Text style={[styles.footerResetLabel, { color: c.textSecondary }]}>
                {t('filterPanel.resetAll')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.footerApplyBtn, { backgroundColor: palette.brand }]}
              onPress={handleApply}
              accessibilityRole="button"
              accessibilityLabel={t('filterPanel.applyFiltersA11y')}
            >
              <Text style={styles.footerApplyLabel}>
                {t('filterPanel.apply')}
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
    backgroundColor: palette.scrim,
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

  // Category multi-select chips

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
    color: palette.bgSurfaceLight,
  },
});
