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
} from 'react-native';
import { Spinner } from '../../components/common/Spinner';
import { AppModal } from '../../components/common/AppModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconMap, IconSatellite, IconPlus, IconMinus, IconCurrentLocation } from '@tabler/icons-react-native';
import type MapView from 'react-native-maps';
import type { Region } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import JChatMap, { type MapStyleVariant } from '../../components/map/JChatMap';
import BusinessPin from '../../components/map/BusinessPin';
import FilterPanel, { defaultFilters, type MapFilters } from '../../components/map/FilterPanel';
import BusinessPreviewCard from '../../components/map/BusinessPreviewCard';
import { getOpenStatus, isOpenNow, type HoursMap } from '../../utils/hours';
import { haversineMeters } from '../../services/geofence';
import { formatMeters } from '../../utils/businessCard';
import { resolvePinModes, type CollisionPin } from '../../utils/pinCollision';
import { fetchPeopleCounts } from '../../services/venuePresence';
import { PIN_SHOWS_LOGO } from '../../components/map/pinLogoSupport';
import { usesKilometers } from '../../utils/distanceUnits';
import ReservationScreen from '../reservations/ReservationScreen';
import { buildCategoryOptions, categoryMatches } from '../../utils/categories';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useHomeBarInset } from '../../components/venue/HomeBarInset';
import { shareContent } from '../../utils/shareContent';

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
  icon_url?: string | null;
  /** businesses.logo_url: the logo drawn in the map pin. */
  logo_url?: string | null;
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
  /** businesses.description: the card shows it under the buttons. */
  description?: string | null;
  /** businesses.geofence_radius_m (meters): inside it the user can enter the chat. */
  geofence_radius_m?: number | null;
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

/** How often the people counts of the visible venues are refreshed while the map is open (foreground only). */
const PEOPLE_REFRESH_MS = 60_000;

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
  const homeBarInset = useHomeBarInset();
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
  /** People in each venue now (venue_people_counts): only numbers, never who. A venue that is not here has 0. */
  const [peopleCounts, setPeopleCounts] = useState<Record<string, number>>({});
  const [businessesError, setBusinessesError] = useState(false);
  const [filters, setFilters] = useState<MapFilters>(defaultFilters);
  const [selected, setSelected] = useState<MapBusiness | null>(null);
  /** Size of the map view and the region it shows when it last stopped moving: pills that would cover each other become dots. */
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const [viewRegion, setViewRegion] = useState<Region | null>(null);
  /** The business a table is being reserved at (the reservation form is open); null = closed. */
  const [reserveFor, setReserveFor] = useState<string | null>(null);

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
        .select('id, name, category, icon_emoji, icon_url, logo_url, lat, lng, status, address, cover_url, hours, slug, description, geofence_radius_m')
        .eq('status', 'verified');
      if (error) throw error;
      if (!isMounted.current) return;
      const rows = (data ?? []) as Array<Partial<MapBusiness>>;
      setBusinesses(
        rows
          .filter((r) => typeof r.lat === 'number' && typeof r.lng === 'number')
          .map((r) => ({
            id: r.id!, name: r.name ?? '', category: r.category ?? '',
            icon_emoji: r.icon_emoji ?? '📍', icon_url: r.icon_url ?? null, logo_url: r.logo_url ?? null, lat: r.lat!, lng: r.lng!,
            status: r.status ?? 'verified', activeCount: 0, // the live count comes from venue_people_counts (peopleCounts)
            address: r.address ?? '', cover_url: r.cover_url ?? null, hours: r.hours ?? null,
            slug: r.slug ?? null,
            description: r.description ?? null,
            geofence_radius_m: typeof r.geofence_radius_m === 'number' ? r.geofence_radius_m : null,
          })),
      );
    } catch (error) {
      console.warn('[map] businesses load error:', error);
      if (isMounted.current) setBusinessesError(true);
    }
  }, []);

  useEffect(() => { void loadBusinesses(); }, [loadBusinesses]);

  // People per venue: asked once the venues are loaded and again every minute while the map is open. If the database
  // function does not exist yet (or the call fails) fetchPeopleCounts answers null: the counts stay 0, the failure is
  // logged once, and the map stops asking.
  useEffect(() => {
    if (businesses.length === 0) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const ids = businesses.map((b) => b.id);
    const refresh = async () => {
      const counts = await fetchPeopleCounts(ids);
      if (cancelled) return;
      if (counts === null) {
        if (timer) { clearInterval(timer); timer = null; }
        return;
      }
      setPeopleCounts(counts);
    };
    void refresh();
    timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, PEOPLE_REFRESH_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [businesses]);

  // The venues with their live count (the demo venues keep the number they carry).
  const businessesNow = useMemo(
    () => businesses.map((b) => ({ ...b, activeCount: peopleCounts[b.id] ?? b.activeCount })),
    [businesses, peopleCounts],
  );

  // Chips come from the categories that really exist on the loaded businesses.
  const categoryOptions = useMemo(() => buildCategoryOptions(businesses.map((b) => b.category)), [businesses]);

  const filtered = useMemo(
    () =>
      businessesNow.filter((b) => {
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
    [businessesNow, filters, userCoords],
  );

  // Pill or dot for each pin (utils/pinCollision.ts). Recomputed when the map stops moving (onRegionChangeComplete),
  // when the venues or the user's position change, never on every frame.
  const pinModes = useMemo(() => {
    const shown = viewRegion ?? region;
    if (!shown) return {};
    const pins: CollisionPin[] = filtered.map((b) => ({
      id: b.id,
      name: b.name,
      lat: b.lat,
      lng: b.lng,
      count: b.activeCount,
      closed: getOpenStatus(b.hours) === 'closed',
      logo: PIN_SHOWS_LOGO && !!(b.logo_url || b.icon_url),
    }));
    return resolvePinModes(pins, { region: shown, width: viewSize.width, height: viewSize.height }, userCoords);
  }, [filtered, viewRegion, region, viewSize, userCoords]);

  // The tapped business, with the real distance from the user. inside_radius: inside the venue's radius or not;
  // null (unknown) when there is no position or the venue has no radius — the card then does not warn and the
  // server decides on entry.
  const selectedGeo = useMemo(() => {
    if (!selected || !userCoords) return { distance_m: undefined, distance: undefined, inside_radius: null as boolean | null };
    const distance_m = haversineMeters(userCoords.lat, userCoords.lng, selected.lat, selected.lng);
    const radius = selected.geofence_radius_m;
    return {
      distance_m,
      distance: formatMeters(distance_m, usesKilometers()),
      inside_radius: typeof radius === 'number' && radius > 0 ? distance_m <= radius : null,
    };
  }, [selected, userCoords]);

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
        <Spinner size="large" color={palette.brand} />
        <Text style={[styles.loadingText, { color: c.textSecondary }]}>{t('mapScreen.findingLocation')}</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.root, { backgroundColor: c.bgBase }]}
      onLayout={(e) => setViewSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      <JChatMap
        ref={mapRef}
        mapStyleVariant={mapVariant}
        style={StyleSheet.absoluteFill}
        initialRegion={region ?? FALLBACK_REGION}
        onRegionChangeComplete={(r) => setViewRegion(r)}
        // iOS shows a region different from the one asked for (it fits it to the portrait view) and does not always
        // report it before the first gesture: read the real visible area once the map is ready, so the first
        // pill / dot decision is not taken with a wrong zoom.
        onMapReady={() => {
          // Read now, and twice more after MapKit has finished fitting the region to the view (the first read can
          // still see the region that was asked for).
          const readVisibleArea = () => {
            void mapRef.current?.getMapBoundaries().then(({ northEast, southWest }) => {
              if (!isMounted.current) return;
              setViewRegion({
                latitude: (northEast.latitude + southWest.latitude) / 2,
                longitude: (northEast.longitude + southWest.longitude) / 2,
                latitudeDelta: Math.abs(northEast.latitude - southWest.latitude),
                longitudeDelta: Math.abs(northEast.longitude - southWest.longitude),
              });
            }).catch(() => undefined);
          };
          readVisibleArea();
          setTimeout(readVisibleArea, 500);
          setTimeout(readVisibleArea, 1500);
        }}
      >
        {filtered.map((b) => (
          <BusinessPin
            key={b.id}
            mode={pinModes[b.id] ?? 'pill'}
            business={{
              id: b.id,
              name: b.name,
              lat: b.lat,
              lng: b.lng,
              icon_emoji: b.icon_emoji,
              logo_url: b.logo_url,
              icon_url: b.icon_url,
              category: b.category,
              status: b.status,
              closed: getOpenStatus(b.hours) === 'closed', // grey pin while closed ('unknown' hours are not "closed")
              activeCount: b.activeCount,
            }}
            onPress={() => setSelected(b)}
          />
        ))}
        {/* TODO(Task 4.5): <MapReactionOverlay> — needs coordinate→point resolver */}
      </JChatMap>

      <View style={[styles.overlayContainer, { paddingTop: insets.top + Math.max(8, homeBarInset) }]} pointerEvents="box-none">
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
      <AppModal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity accessible={false} style={styles.sheetDismiss} activeOpacity={1} onPress={() => setSelected(null)} />
          <View style={[styles.sheetBody, { backgroundColor: c.bgBase, paddingBottom: insets.bottom + 8 }]}>
            {selected && (
              <BusinessPreviewCard
                business={{
                  id: selected.id, name: selected.name, category: selected.category,
                  icon_emoji: selected.icon_emoji, icon_url: selected.icon_url, logo_url: selected.logo_url, cover_url: selected.cover_url, hours: selected.hours,
                  address: selected.address, lat: selected.lat, lng: selected.lng,
                  description: selected.description, geofence_radius_m: selected.geofence_radius_m,
                  distance: selectedGeo.distance, distance_m: selectedGeo.distance_m,
                  rating: selected.rating, active_count: selected.activeCount,
                  // has_active_offers is not passed: the feed does not tell by venue yet, so no red dot.
                }}
                inside_radius={selectedGeo.inside_radius}
                onClose={() => setSelected(null)}
                onOffers={() => {
                  // NOTE: the Offers feed is not filtered by venue yet; this opens the general feed.
                  setSelected(null);
                  navigation.navigate('Offers');
                }}
                onReserve={(businessId) => {
                  setSelected(null);
                  setReserveFor(businessId);
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
                  void shareContent({ message: `${selected.name} — ${url}`, url });
                }}
              />
            )}
          </View>
        </View>
      </AppModal>

      {/* Reservation form (ReservationScreen), full screen, opened from the card's Reserve button */}
      <AppModal visible={reserveFor !== null} animationType="slide" onRequestClose={() => setReserveFor(null)}>
        <View style={{ flex: 1, backgroundColor: c.bgBase, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          {reserveFor !== null && (
            <ReservationScreen
              businessId={reserveFor}
              onSuccess={() => { /* the form shows its own confirmation; Done calls onCancel */ }}
              onCancel={() => setReserveFor(null)}
              onViewMine={() => { setReserveFor(null); navigation.navigate('MyReservations'); }}
            />
          )}
        </View>
      </AppModal>
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
  // The card owns the top (its cover reaches the rounded corners) and the close button.
  sheetBody: { borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', maxHeight: '90%' },
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
