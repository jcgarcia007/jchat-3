/**
 * JChat 3.0 — Map Screen (Task 4.1)
 *
 * Features implemented in this task:
 *   - Google Maps via JChatMap (PROVIDER_GOOGLE, no API key in JS)
 *   - A2 Pastel style (light) / Dark style — auto-switches with system color scheme
 *   - Location permission via expo-location; graceful fallback to city center
 *   - Style switcher: Normal / Dark / Satellite / Terrain
 *   - Filter chips: All / Bars / Cafes / Food / Events / Open now
 *
 * Pending tasks:
 *   - Task 4.2: BusinessPin + HeatmapLayer (slot left inside <JChatMap>)
 *   - Task 4.6: Advanced FilterPanel (TODO comment below)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useColorScheme } from 'react-native';
import * as Location from 'expo-location';
import {
  IconMap,
  IconMoon,
  IconSatellite,
  IconMountain,
  IconAdjustmentsHorizontal,
} from '@tabler/icons-react-native';
import type MapView from 'react-native-maps';
import type { Region } from 'react-native-maps';

import JChatMap, { type MapStyleVariant } from '../../components/map/JChatMap';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fallback city center (Miami, FL) used when location permission is denied. */
const FALLBACK_REGION: Region = {
  latitude: 25.7617,
  longitude: -80.1918,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const DEFAULT_DELTA = { latitudeDelta: 0.01, longitudeDelta: 0.01 };

// ---------------------------------------------------------------------------
// Style switcher config
// ---------------------------------------------------------------------------

interface StyleOption {
  variant: MapStyleVariant;
  label: string; // TODO(i18n)
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
}

const STYLE_OPTIONS: StyleOption[] = [
  { variant: 'pastel',    label: 'Normal',    Icon: IconMap },
  { variant: 'dark',      label: 'Dark',      Icon: IconMoon },
  { variant: 'satellite', label: 'Satellite', Icon: IconSatellite },
  { variant: 'terrain',   label: 'Terrain',   Icon: IconMountain },
];

// ---------------------------------------------------------------------------
// Filter chip config
// ---------------------------------------------------------------------------

type FilterKey = 'all' | 'bars' | 'cafes' | 'food' | 'events' | 'open_now';

interface FilterChip {
  key: FilterKey;
  label: string; // TODO(i18n)
}

const FILTER_CHIPS: FilterChip[] = [
  { key: 'all',      label: 'All' },
  { key: 'bars',     label: 'Bars' },
  { key: 'cafes',    label: 'Cafes' },
  { key: 'food',     label: 'Food' },
  { key: 'events',   label: 'Events' },
  { key: 'open_now', label: 'Open now' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MapScreen() {
  const scheme = useColorScheme();
  const c = useThemeColors();

  // Auto-switch map style with system color scheme
  const [mapVariant, setMapVariant] = useState<MapStyleVariant>(
    scheme === 'dark' ? 'dark' : 'pastel',
  );

  // Sync when OS color scheme changes (e.g., user toggles system dark mode)
  useEffect(() => {
    setMapVariant((prev) => {
      // Only auto-switch between pastel and dark — don't override satellite/terrain
      if (prev === 'pastel' || prev === 'dark') {
        return scheme === 'dark' ? 'dark' : 'pastel';
      }
      return prev;
    });
  }, [scheme]);

  const [region, setRegion] = useState<Region | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationDenied, setLocationDenied] = useState(false);

  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const mapRef = useRef<MapView>(null);

  // ---------------------------------------------------------------------------
  // Location permission + initial position
  // ---------------------------------------------------------------------------

  const requestLocation = useCallback(async () => {
    setLocationLoading(true);
    setLocationDenied(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationDenied(true);
        setRegion(FALLBACK_REGION);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setRegion({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        ...DEFAULT_DELTA,
      });
    } catch {
      // Any OS error (e.g., location services off) → fall back gracefully
      setLocationDenied(true);
      setRegion(FALLBACK_REGION);
    } finally {
      setLocationLoading(false);
    }
  }, []);

  useEffect(() => {
    void requestLocation();
  }, [requestLocation]);

  // ---------------------------------------------------------------------------
  // Style switcher handlers
  // ---------------------------------------------------------------------------

  const handleStyleSelect = useCallback((variant: MapStyleVariant) => {
    setMapVariant(variant);
  }, []);

  // ---------------------------------------------------------------------------
  // Derived colors
  // ---------------------------------------------------------------------------

  const controlBg = c.bgSurface;
  const controlBorder = c.borderSubtle;
  const labelColor = c.textPrimary;
  const subLabelColor = c.textSecondary;
  const chipActiveBg = palette.brand;
  const chipActiveText = palette.bgSurfaceLight; // always white-ish regardless of theme
  const chipInactiveBg = c.bgElevated;
  const chipInactiveText = c.textSecondary;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (locationLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: c.bgBase }]}>
        <ActivityIndicator size="large" color={palette.brand} />
        <Text style={[styles.loadingText, { color: c.textSecondary }]}>
          {/* TODO(i18n) */}
          Finding your location…
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: c.bgBase }]}>
      {/* ── Map fills the entire screen ── */}
      <JChatMap
        ref={mapRef}
        mapStyleVariant={mapVariant}
        style={StyleSheet.absoluteFill}
        initialRegion={region ?? FALLBACK_REGION}
      >
        {/* TODO(Task 4.2): BusinessPin + HeatmapLayer */}
      </JChatMap>

      {/* ── Overlays rendered above the map ── */}
      <SafeAreaView style={styles.overlayContainer} pointerEvents="box-none">

        {/* ── Location denied banner ── */}
        {locationDenied && (
          <TouchableOpacity
            style={[styles.deniedBanner, { backgroundColor: palette.warning + 'EE' }]}
            onPress={requestLocation}
            activeOpacity={0.8}
          >
            <Text style={styles.deniedBannerText}>
              {/* TODO(i18n) */}
              Location access denied — showing default area. Tap to retry.
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Filter chips row ── */}
        <View style={styles.chipsWrapper} pointerEvents="box-none">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
            pointerEvents="box-none"
          >
            {FILTER_CHIPS.map((chip) => {
              const isActive = chip.key === activeFilter;
              return (
                <TouchableOpacity
                  key={chip.key}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isActive ? chipActiveBg : chipInactiveBg,
                      borderColor: isActive ? chipActiveBg : controlBorder,
                    },
                  ]}
                  onPress={() => setActiveFilter(chip.key)}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      { color: isActive ? chipActiveText : chipInactiveText },
                    ]}
                  >
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* TODO(Task 4.6): Advanced FilterPanel trigger */}
            <TouchableOpacity
              style={[
                styles.chip,
                styles.chipFilters,
                { backgroundColor: chipInactiveBg, borderColor: controlBorder },
              ]}
              onPress={() => {
                // TODO(Task 4.6): open advanced FilterPanel
              }}
              activeOpacity={0.75}
            >
              <IconAdjustmentsHorizontal
                size={14}
                color={chipInactiveText}
                strokeWidth={2}
              />
              <Text style={[styles.chipLabel, { color: chipInactiveText, marginLeft: 4 }]}>
                {/* TODO(i18n) */}
                Filters
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* ── Style switcher — bottom-right corner ── */}
        <View
          style={[
            styles.styleSwitcher,
            {
              backgroundColor: controlBg + 'F2', // slight transparency
              borderColor: controlBorder,
            },
          ]}
        >
          {STYLE_OPTIONS.map(({ variant, label, Icon }, idx) => {
            const isActive = mapVariant === variant;
            return (
              <TouchableOpacity
                key={variant}
                style={[
                  styles.styleBtn,
                  isActive && { backgroundColor: palette.brand + '22' },
                  idx < STYLE_OPTIONS.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: controlBorder,
                  },
                ]}
                onPress={() => handleStyleSelect(variant)}
                activeOpacity={0.7}
              >
                <Icon
                  size={18}
                  color={isActive ? palette.brand : subLabelColor}
                  strokeWidth={isActive ? 2.5 : 1.75}
                />
                <Text
                  style={[
                    styles.styleBtnLabel,
                    { color: isActive ? labelColor : subLabelColor },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>
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

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },

  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },

  // Location denied banner
  deniedBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  deniedBannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Filter chips
  chipsWrapper: {
    marginTop: 8,
  },
  chipsContent: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    // Shadow for legibility over the map
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 3,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  chipFilters: {
    paddingHorizontal: 12,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Map style switcher (bottom-right)
  styleSwitcher: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    minWidth: 90,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  styleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  styleBtnLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
});
