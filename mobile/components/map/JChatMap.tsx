/**
 * JChat 3.0 — Map wrapper (native platform maps, no API key required)
 *
 * Uses the platform's default native map provider:
 *   - iOS:     Apple Maps
 *   - Android: native Google Maps tiles (no API key required for basic tiles)
 *
 * mapStyleVariant:
 *   - "normal"    → default provider style
 *   - "satellite" → satellite imagery
 *   - "terrain"   → terrain view
 *
 * DEFERRED: custom pastel/dark JSON styles (Google-Maps-only) — not compatible
 * with the native provider. See HeatmapLayer.tsx comment for context.
 */

import React, { forwardRef } from 'react';
import MapView, {
  type MapViewProps,
  type MapType,
} from 'react-native-maps';
import type { StyleProp, ViewStyle } from 'react-native';

// ---------------------------------------------------------------------------
// Map style variant type
// ---------------------------------------------------------------------------

export type MapStyleVariant = 'satellite' | 'terrain' | 'normal';

// ---------------------------------------------------------------------------
// Helper: resolve mapType from variant
// ---------------------------------------------------------------------------

interface ResolvedMapConfig {
  mapType: MapType;
}

export function resolveMapConfig(variant: MapStyleVariant): ResolvedMapConfig {
  switch (variant) {
    case 'satellite':
      return { mapType: 'satellite' };
    case 'terrain':
      return { mapType: 'terrain' };
    case 'normal':
    default:
      return { mapType: 'standard' };
  }
}

// ---------------------------------------------------------------------------
// JChatMap props
// ---------------------------------------------------------------------------

export interface JChatMapProps
  extends Omit<MapViewProps, 'provider' | 'mapType' | 'customMapStyle'> {
  /** Controls which mapType to use. */
  mapStyleVariant?: MapStyleVariant;
  /** Additional style for the MapView itself. */
  style?: StyleProp<ViewStyle>;
  /** Markers, overlays, etc. */
  children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * JChatMap — thin wrapper around react-native-maps MapView.
 *
 * Uses the platform's native map provider (no PROVIDER_GOOGLE, no API key).
 * Pass `mapStyleVariant` to switch between normal / satellite / terrain.
 * All other MapView props are forwarded transparently.
 */
const JChatMap = forwardRef<MapView, JChatMapProps>(
  ({ mapStyleVariant = 'normal', style, children, ...rest }, ref) => {
    const { mapType } = resolveMapConfig(mapStyleVariant);

    return (
      <MapView
        ref={ref}
        mapType={mapType}
        style={style}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        {...rest}
      >
        {children}
      </MapView>
    );
  },
);

JChatMap.displayName = 'JChatMap';

export default JChatMap;
