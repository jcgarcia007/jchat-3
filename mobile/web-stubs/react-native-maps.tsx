/**
 * Web stub for react-native-maps (Metro alias, web only — see metro.config.js).
 * The map is out of scope for web v1: MapView renders a notice, overlays are no-ops.
 * Covers the exports the app imports: default MapView, Marker, Circle, PROVIDER_GOOGLE.
 */

import React, { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../theme/colors';

export const PROVIDER_GOOGLE = 'google';

interface MapViewStubProps {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

interface MapViewStubHandle {
  animateToRegion: (...args: unknown[]) => void;
  animateCamera: (...args: unknown[]) => void;
  getCamera: () => Promise<undefined>;
}

const MapView = forwardRef<MapViewStubHandle, MapViewStubProps>(function MapView({ style }, ref) {
  const { t } = useTranslation('map');
  const c = useThemeColors();

  useImperativeHandle(ref, () => ({
    animateToRegion: () => undefined,
    animateCamera: () => undefined,
    getCamera: () => Promise.resolve(undefined),
  }));

  return (
    <View style={[styles.root, { backgroundColor: c.bgSurface }, style]}>
      <Text style={[styles.text, { color: c.textSecondary }]}>{t('mapScreen.webUnavailable')}</Text>
    </View>
  );
});

export function Marker(): null {
  return null;
}

export function Circle(): null {
  return null;
}

export default MapView;

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  text: { fontSize: 15, textAlign: 'center' },
});
