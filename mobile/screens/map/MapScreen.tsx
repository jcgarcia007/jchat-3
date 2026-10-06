/**
 * JChat 3.0 — Map Screen (Tasks 4.1 + 4.6 integration)
 *
 *   - Native platform maps via JChatMap (Apple Maps on iOS, native Android)
 *   - Location permission via expo-location; city-center fallback
 *   - Style switcher: Normal / Satellite / Terrain
 *   - BusinessPin teardrops (Task 4.2)
 *   - FilterPanel: chips + advanced filters + search (Task 4.6)
 *   - Tap a pin → BusinessPreviewCard bottom sheet (Task 2.3)
 *
 * DEFERRED: HeatmapLayer (Google-Maps-only) — see HeatmapLayer.tsx comment.
 * TODO(Task 4.5): mount <MapReactionOverlay> — needs coordinate→point resolver.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  AppState,
  Modal,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconMap, IconSatellite, IconX, IconPlus, IconMinus, IconCurrentLocation } from '@tabler/icons-react-native';
import type MapView from 'react-native-maps';
import type { Region } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import JChatMap, { type MapStyleVariant } from '../../components/map/JChatMap';
import BusinessPin from '../../components/map/BusinessPin';
import FilterPanel, { defaultFilters, type MapFilters } from '../../components/map/FilterPanel';
import BusinessPreviewCard from '../../components/map/BusinessPreviewCard';
import { isOpenNow, type HoursMap } from '../../utils/hours';
import { haversineMeters } from '../../services/geofence';
import { buildCategoryOptions, categoryMatches } from '../../utils/categories';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import type { MainStackParamList } from '../../navigation/AppNavigator';

type MapNav = NativeStackNavigationProp<MainStackParamList>;

/** Resolve a business's main room id (is_main first, else lowest sort). */
async function resolveMainRoomId(businessId: string): Promise<string | null> {
  if (!isSupabaseConfigured) return businessId;
  const { data } = await supabase
    .from('rooms')
    .select('id, is_main, sort')
    .eq('business_id', businessId)
    .order('is_main', { ascending: false })
    .order('sort', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

interface MapBusiness {
  id: string;
  name: string;
  category: string;
  icon_emoji: string;
  lat: number;
  lng: number;
  status: string;
  activeCount: number;
  address: string;
  cover_url: string | null;
  hours: HoursMap | null;
  rating?: number;
  review_count?: number;
  slug?: string | null;
}

const FALLBACK_REGION: Region = {
  latitude: 25.7617,
  longitude: -80.1918,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};
const DEFAULT_DELTA = { latitudeDelta: 0.02, longitudeDelta: 0.02 };

// GPS timeout — if no fix in 8s, fall back to FALLBACK_REGION (common in emulators).
const LOCATION_TIMEOUT_MS = 8_000;

/** Device position known to the screen. 'unavailable' = permission granted but no fix in time. */
type LocationState = 'checking' | 'granted' | 'denied' | 'unavailable';

/** Resolves/rejects like the promise, but always clears its own timer. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('location_timeout')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Sends the user to the app's page in the system Settings (the only way back after a denial). */
function openAppSettings(): void {
  Linking.openSettings().catch(() => undefined);
}

const DEMO_BUSINESSES: MapBusiness[] = [
  { id: 'b1', name: 'The Rooftop Bar', category: 'Bar', icon_emoji: '🍸', lat: 25.765, lng: -80.193, status: 'verified', activeCount: 62, address: '100 Ocean Dr', cover_url: null, hours: null, rating: 4.6 },
  { id: 'b2', name: 'Bean Scene', category: 'Cafe', icon_emoji: '☕️', lat: 25.758, lng: -80.196, status: 'verified', activeCount: 14, address: '22 Collins Ave', cover_url: null, hours: null, rating: 4.3 },
  { id: 'b3', name: 'Taco Loco', category: 'Restaurant', icon_emoji: '🌮', lat: 25.7705, lng: -80.188, status: 'pending', activeCount: 3, address: '7 Washington Ave', cover_url: null, hours: null, rating: 4.1 },
  { id: 'b4', name: 'Pulse Live', category: 'Event', icon_emoji: '🎉', lat: 25.7555, lng: -80.184, status: 'verified', activeCount: 28, address: '500 Biscayne Blvd', cover_url: null, hours: null, rating: 4.8 },
];

interface StyleOption {
  variant: MapStyleVariant;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
}
const STYLE_OPTIONS: StyleOption[] = [
  { variant: 'normal', Icon: IconMap },
  { variant: 'satellite', Icon: IconSatellite },
];

export default function MapScreen() {
  const { t } = useTranslation('map');
  const c = useThemeColors();
  // Display-only labels for the style switcher — MapStyleVariant itself
  // (the persisted state) never changes.
  const styleLabels: Record<MapStyleVariant, string> = {
    normal: t('mapScreen.styleNormal'),
    satellite: t('mapScreen.styleSatellite'),
  };
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<MapNav>();
  const mapRef = useRef<MapView>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const [mapVariant, setMapVariant] = useState<MapStyleVariant>('normal');

  const [region, setRegion] = useState<Region | null>(null);
  const [locationState, setLocationState] = useState<LocationState>('checking');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [businesses, setBusinesses] = useState<MapBusiness[]>([]);
  const [businessesError, setBusinessesError] = useState(false);
  const [filters, setFilters] = useState<MapFilters>(defaultFilters);
  const [selected, setSelected] = useState<MapBusiness | null>(null);

  /**
   * Reads the device position. The permission prompt is shown only when the user was never
   * asked (`allowPrompt`); a denial is never asked again — the banner sends them to Settings.
   */
  const readPosition = useCallback(async (allowPrompt: boolean): Promise<{ lat: number; lng: number } | null> => {
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status === Location.PermissionStatus.UNDETERMINED && allowPrompt) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (!isMounted.current) return null;
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setLocationState('denied');
        setUserCoords(null);
        return null;
      }
      const pos = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        LOCATION_TIMEOUT_MS,
      );
      if (!isMounted.current) return null;
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserCoords(coords);
      setLocationState('granted');
      return coords;
    } catch {
      if (isMounted.current) setLocationState('unavailable');
      return null;
    }
  }, []);

  const centerOn = useCallback((coords: { lat: number; lng: number }) => {
    const target = { latitude: coords.lat, longitude: coords.lng, ...DEFAULT_DELTA };
    setRegion(target);
    mapRef.current?.animateToRegion(target, 350);
  }, []);

  // First load: ask once if never asked, then place the initial camera. The map is only
  // mounted after this, and it is never unmounted again (retries/recenter keep the camera).
  useEffect(() => {
    void (async () => {
      const coords = await readPosition(true);
      if (!isMounted.current) return;
      setRegion(
        coords
          ? { latitude: coords.lat, longitude: coords.lng, ...DEFAULT_DELTA }
          : FALLBACK_REGION,
      );
    })();
  }, [readPosition]);

  // Back from Settings (permission just granted?): re-read silently, never prompting.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || locationState === 'granted' || locationState === 'checking') return;
      void readPosition(false).then((coords) => { if (coords) centerOn(coords); });
    });
    return () => subscription.remove();
  }, [locationState, readPosition, centerOn]);

  // Verified businesses. A failure keeps what is already on the map and shows a retry banner.
  const loadBusinesses = useCallback(async () => {
    if (!isSupabaseConfigured) { setBusinesses(DEMO_BUSINESSES); return; }
    setBusinessesError(false);
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('id, name, category, icon_emoji, lat, lng, status, address, cover_url, hours, slug')
        .eq('status', 'verified');
      if (error) throw error;
      if (!isMounted.current) return;
      const rows = (data ?? []) as Array<Partial<MapBusiness>>;
      setBusinesses(
        rows
          .filter((r) => typeof r.lat === 'number' && typeof r.lng === 'number')
          .map((r) => ({
            id: r.id!, name: r.name ?? '', category: r.category ?? '',
            icon_emoji: r.icon_emoji ?? '📍', lat: r.lat!, lng: r.lng!,
            status: r.status ?? 'verified', activeCount: 0, // TODO(presence): live count
            address: r.address ?? '', cover_url: r.cover_url ?? null, hours: r.hours ?? null,
            slug: r.slug ?? null,
          })),
      );
    } catch (error) {
      console.warn('[map] businesses load error:', error);
      if (isMounted.current) setBusinessesError(true);
    }
  }, []);

  useEffect(() => { void loadBusinesses(); }, [loadBusinesses]);

  // Chips come from the categories that really exist on the loaded businesses.
  const categoryOptions = useMemo(() => buildCategoryOptions(businesses.map((b) => b.category)), [businesses]);

  const filtered = useMemo(
    () =>
      businesses.filter((b) => {
        if (!categoryMatches(b.category, filters.category)) return false;
        if (filters.openNow && !isOpenNow(b.hours)) return false;
        // Radius: real distance from the user; without a position it is not applied.
        if (userCoords && filters.distanceKm !== 'all') {
          const meters = haversineMeters(userCoords.lat, userCoords.lng, b.lat, b.lng);
          if (meters > filters.distanceKm * 1000) return false;
        }
        if (filters.minActiveUsers > 0 && b.activeCount < filters.minActiveUsers) return false;
        if (filters.minRating > 0 && (b.rating ?? 0) < filters.minRating) return false;
        if (filters.searchQuery && !b.name.toLowerCase().includes(filters.searchQuery.toLowerCase())) return false;
        return true;
      }),
    [businesses, filters, userCoords],
  );

  // Recenter: a denied permission is never re-requested (the system would ignore it) — go to Settings.
  const recenterToUser = useCallback(async () => {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status === Location.PermissionStatus.DENIED) {
      setLocationState('denied');
      openAppSettings();
      return;
    }
    const coords = await readPosition(true);
    if (coords && isMounted.current) centerOn(coords);
  }, [readPosition, centerOn]);

  const handleZoom = useCallback(async (delta: number) => {
    const cam = await mapRef.current?.getCamera();
    if (!cam) return;
    if (Platform.OS === 'ios') {
      // Apple Maps uses altitude: lower = zoomed in, higher = zoomed out.
      // Each step halves (zoom in) or doubles (zoom out) the altitude.
      const currentAlt = cam.altitude ?? 10_000;
      const factor = delta > 0 ? 0.5 : 2;
      const nextAlt = Math.max(100, Math.min(10_000_000, currentAlt * factor));
      mapRef.current?.animateCamera({ ...cam, altitude: nextAlt }, { duration: 250 });
    } else {
      const nextZoom = Math.max(1, Math.min(20, (cam.zoom ?? 14) + delta));
      mapRef.current?.animateCamera({ ...cam, zoom: nextZoom }, { duration: 250 });
    }
  }, []);

  const handleNavigate = useCallback((lat: number, lng: number) => {
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    });
    void Linking.openURL(url);
  }, []);

  if (region === null) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: c.bgBase }]}>
        <ActivityIndicator size="large" color={palette.brand} />
        <Text style={[styles.loadingText, { color: c.textSecondary }]}>{t('mapScreen.findingLocation')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: c.bgBase }]}>
      <JChatMap ref={mapRef} mapStyleVariant={mapVariant} style={StyleSheet.absoluteFill} initialRegion={region ?? FALLBACK_REGION}>
        {filtered.map((b) => (
          <BusinessPin
            key={b.id}
            business={{ id: b.id, name: b.name, lat: b.lat, lng: b.lng, icon_emoji: b.icon_emoji, status: b.status, activeCount: b.activeCount }}
            onPress={() => setSelected(b)}
          />
        ))}
        {/* TODO(Task 4.5): <MapReactionOverlay> — needs coordinate→point resolver */}
      </JChatMap>

      <View style={[styles.overlayContainer, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        {locationState === 'denied' && (
          <TouchableOpacity
            style={[styles.deniedBanner, { backgroundColor: palette.warning }]}
            onPress={openAppSettings}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={styles.deniedBannerText}>{t('mapScreen.locationDenied')}</Text>
            <Text style={[styles.deniedBannerText, styles.bannerAction]}>{t('mapScreen.openSettings')}</Text>
          </TouchableOpacity>
        )}
        {locationState === 'unavailable' && (
          <TouchableOpacity
            style={[styles.deniedBanner, { backgroundColor: palette.warning }]}
            onPress={() => { void readPosition(false).then((coords) => { if (coords) centerOn(coords); }); }}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={styles.deniedBannerText}>{t('mapScreen.locationUnavailable')}</Text>
          </TouchableOpacity>
        )}
        {businessesError && (
          <TouchableOpacity
            style={[styles.deniedBanner, { backgroundColor: palette.danger }]}
            onPress={() => { void loadBusinesses(); }}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={styles.deniedBannerText}>{t('mapScreen.loadError')}</Text>
            <Text style={[styles.deniedBannerText, styles.bannerAction]}>{t('mapScreen.retry')}</Text>
          </TouchableOpacity>
        )}

        {/* Filters (chips + advanced + search) — Task 4.6 */}
        <FilterPanel filters={filters} onChange={setFilters} resultCount={filtered.length} hasLocation={userCoords !== null} categories={categoryOptions} />

        {/* Zoom controls — in-flow, right-aligned, sits just below FilterPanel */}
        <View style={styles.zoomRow} pointerEvents="box-none">
          <View style={[styles.zoomControls, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={() => void handleZoom(1)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('mapScreen.zoomInA11y')}
            >
              <IconPlus size={20} color={c.textSecondary} strokeWidth={1.75} />
            </TouchableOpacity>
            <View style={[styles.zoomDivider, { backgroundColor: c.borderSubtle }]} />
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={() => void handleZoom(-1)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('mapScreen.zoomOutA11y')}
            >
              <IconMinus size={20} color={c.textSecondary} strokeWidth={1.75} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.locateBtn, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}
            onPress={() => void recenterToUser()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('mapScreen.centerOnLocationA11y')}
          >
            <IconCurrentLocation size={20} color={palette.brand} strokeWidth={1.75} />
          </TouchableOpacity>
        </View>

        {/* Style switcher — absolute bottom-right */}
        <View
          style={[
            styles.styleSwitcher,
            {
              bottom: 68 + 26 + 12 + insets.bottom,
              backgroundColor: c.bgSurface,
              borderColor: c.borderSubtle,
            },
          ]}
        >
          {STYLE_OPTIONS.map(({ variant, Icon }, idx) => {
            const isActive = mapVariant === variant;
            return (
              <TouchableOpacity
                key={variant}
                style={[styles.styleBtn, isActive && { backgroundColor: palette.brandLight }, idx < STYLE_OPTIONS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderSubtle }]}
                onPress={() => setMapVariant(variant)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={t('mapScreen.mapStyleA11y', { style: styleLabels[variant] })}
              >
                <Icon size={18} color={isActive ? palette.brand : c.textSecondary} strokeWidth={isActive ? 2.5 : 1.75} />
                <Text style={[styles.styleBtnLabel, { color: isActive ? c.textPrimary : c.textSecondary }]}>{styleLabels[variant]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Business preview bottom sheet (Task 2.3) */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity style={styles.sheetDismiss} activeOpacity={1} onPress={() => setSelected(null)} />
          <View style={[styles.sheetBody, { backgroundColor: c.bgBase }]}>
            <TouchableOpacity
              style={styles.sheetClose}
              onPress={() => setSelected(null)}
              accessibilityRole="button"
              accessibilityLabel={t('mapScreen.closeSheetA11y')}
            >
              <IconX size={22} color={c.textSecondary} />
            </TouchableOpacity>
            {selected && (
              <BusinessPreviewCard
                business={{
                  id: selected.id, name: selected.name, category: selected.category,
                  icon_emoji: selected.icon_emoji, cover_url: selected.cover_url, hours: selected.hours,
                  address: selected.address, lat: selected.lat, lng: selected.lng,
                  rating: selected.rating, active_count: selected.activeCount,
                }}
                onEnterChat={(businessId) => {
                  void (async () => {
                    // ChatRoom expects a ROOM id; resolve the business's main room.
                    const roomId = await resolveMainRoomId(businessId);
                    setSelected(null);
                    navigation.navigate('ChatRoom', { id: roomId ?? businessId });
                  })();
                }}
                onViewMenu={(id) => { setSelected(null); navigation.navigate('Menu', { businessId: id, businessName: selected.name }); }}
                onNavigate={handleNavigate}
                onShare={() => {
                  const handle = selected.slug ?? selected.id;
                  const url = `https://jchat.cloud/b/${handle}`;
                  void Share.share({ message: `${selected.name} — ${url}`, url });
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14 },
  overlayContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  deniedBanner: { marginHorizontal: 16, marginTop: 8, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  deniedBannerText: { color: palette.bgSurfaceLight, fontSize: 13, fontWeight: '500', textAlign: 'center' },
  bannerAction: { fontWeight: '800', marginTop: 2, textDecorationLine: 'underline' },
  styleSwitcher: {
    position: 'absolute', right: 16, borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', minWidth: 90,
    ...Platform.select({ ios: { shadowColor: palette.bgBase, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6 }, android: { elevation: 6 } }),
  },
  styleBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, gap: 8 },
  styleBtnLabel: { fontSize: 13, fontWeight: '500' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.scrim },
  sheetDismiss: { flex: 1 },
  sheetBody: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingBottom: 24, maxHeight: '85%' },
  sheetClose: { alignSelf: 'flex-end', padding: 12 },
  zoomRow: { alignItems: 'flex-end', marginTop: 8, marginRight: 16, pointerEvents: 'box-none' },
  zoomControls: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
    ...Platform.select({ ios: { shadowColor: palette.bgBase, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6 }, android: { elevation: 6 } }),
  },
  zoomBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  zoomDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 8 },
  locateBtn: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginTop: 8,
    ...Platform.select({ ios: { shadowColor: palette.bgBase, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6 }, android: { elevation: 6 } }),
  },
});
