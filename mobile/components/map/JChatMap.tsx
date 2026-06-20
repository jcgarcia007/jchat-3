/**
 * JChat 3.0 — Reusable Google Maps wrapper (Task 4.1)
 *
 * Usage:
 *   <JChatMap mapStyleVariant="pastel" style={{ flex: 1 }}>
 *     {/* Task 4.2: BusinessPin + HeatmapLayer go here *\/}
 *   </JChatMap>
 *
 * mapStyleVariant:
 *   - "pastel"    → A2 Pastel light style (built from mapLight* tokens)
 *   - "dark"      → Dark style           (built from mapDark*  tokens)
 *   - "satellite" → MapType satellite    (no custom style)
 *   - "terrain"   → MapType terrain      (no custom style)
 *   The "normal" variant uses the default provider style (no custom style).
 */

import React, { forwardRef } from 'react';
import MapView, {
  PROVIDER_GOOGLE,
  type MapViewProps,
  type MapStyleElement,
  type MapType,
} from 'react-native-maps';
import type { StyleProp, ViewStyle } from 'react-native';
import { palette } from '../../theme/tokens';

// ---------------------------------------------------------------------------
// Map style variant type
// ---------------------------------------------------------------------------

export type MapStyleVariant = 'pastel' | 'dark' | 'satellite' | 'terrain' | 'normal';

// ---------------------------------------------------------------------------
// A2 Pastel custom style — built entirely from Design System map tokens
// ---------------------------------------------------------------------------

const A2_PASTEL_STYLE: MapStyleElement[] = [
  // Canvas / default fill
  {
    elementType: 'geometry',
    stylers: [{ color: palette.mapLightBase }],
  },
  // Roads — geometry
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: palette.mapLightRoads }],
  },
  // Road labels
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: palette.mapLightBlocks }],
  },
  // Road labels stroke (use base for a clean pastel look)
  {
    featureType: 'road',
    elementType: 'labels.text.stroke',
    stylers: [{ color: palette.mapLightBase }],
  },
  // Buildings / land parcels (local blocks)
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry',
    stylers: [{ color: palette.mapLightBlocks }],
  },
  {
    featureType: 'landscape.natural',
    elementType: 'geometry',
    stylers: [{ color: palette.mapLightBlocks }],
  },
  // Parks / green areas
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: palette.mapLightParks }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: palette.mapLightBlocks }],
  },
  // Water bodies
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: palette.mapLightWater }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: palette.mapLightBlocks }],
  },
  // Transit lines
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: palette.mapLightBlocks }],
  },
  // Hide noisy POI icons (keeps the pastel look clean)
  {
    featureType: 'poi',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
];

// ---------------------------------------------------------------------------
// Dark custom style — built from Design System dark map tokens
// ---------------------------------------------------------------------------

const DARK_MAP_STYLE: MapStyleElement[] = [
  {
    elementType: 'geometry',
    stylers: [{ color: palette.mapDarkBase }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: palette.mapDarkRoads }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: palette.mapDarkBlocks }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.stroke',
    stylers: [{ color: palette.mapDarkBase }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry',
    stylers: [{ color: palette.mapDarkBlocks }],
  },
  {
    featureType: 'landscape.natural',
    elementType: 'geometry',
    stylers: [{ color: palette.mapDarkBlocks }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: palette.mapDarkParks }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: palette.mapDarkRoads }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: palette.mapDarkWater }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: palette.mapDarkRoads }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: palette.mapDarkBlocks }],
  },
  {
    featureType: 'poi',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  // Darken all labels to match dark theme
  {
    elementType: 'labels.text.fill',
    stylers: [{ color: palette.mapDarkRoads }],
  },
  {
    elementType: 'labels.text.stroke',
    stylers: [{ color: palette.mapDarkBase }],
  },
];

// ---------------------------------------------------------------------------
// Helper: resolve mapType + customMapStyle from variant
// ---------------------------------------------------------------------------

interface ResolvedMapConfig {
  mapType: MapType;
  customMapStyle: MapStyleElement[] | undefined;
}

export function resolveMapConfig(variant: MapStyleVariant): ResolvedMapConfig {
  switch (variant) {
    case 'satellite':
      return { mapType: 'satellite', customMapStyle: undefined };
    case 'terrain':
      return { mapType: 'terrain', customMapStyle: undefined };
    case 'dark':
      return { mapType: 'standard', customMapStyle: DARK_MAP_STYLE };
    case 'pastel':
      return { mapType: 'standard', customMapStyle: A2_PASTEL_STYLE };
    case 'normal':
    default:
      return { mapType: 'standard', customMapStyle: undefined };
  }
}

// ---------------------------------------------------------------------------
// JChatMap props
// ---------------------------------------------------------------------------

export interface JChatMapProps
  extends Omit<MapViewProps, 'provider' | 'mapType' | 'customMapStyle'> {
  /** Controls which base style + mapType to use. */
  mapStyleVariant?: MapStyleVariant;
  /** Additional style for the MapView itself. */
  style?: StyleProp<ViewStyle>;
  /** Markers, overlays, heatmap layers, etc. */
  children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * JChatMap — thin wrapper around react-native-maps MapView.
 *
 * Always uses PROVIDER_GOOGLE (injected via app.config.ts — no key in JS).
 * Pass `mapStyleVariant` to switch between pastel / dark / satellite / terrain / normal.
 * All other MapView props are forwarded transparently.
 */
const JChatMap = forwardRef<MapView, JChatMapProps>(
  ({ mapStyleVariant = 'pastel', style, children, ...rest }, ref) => {
    const { mapType, customMapStyle } = resolveMapConfig(mapStyleVariant);

    return (
      <MapView
        ref={ref}
        provider={PROVIDER_GOOGLE}
        mapType={mapType}
        customMapStyle={customMapStyle}
        style={style}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        {...rest}
      >
        {/* Task 4.2: BusinessPin + HeatmapLayer rendered here by MapScreen */}
        {children}
      </MapView>
    );
  },
);

JChatMap.displayName = 'JChatMap';

export default JChatMap;

// Re-export style arrays so consumers (e.g. tests, storybook) can inspect them.
export { A2_PASTEL_STYLE, DARK_MAP_STYLE };
