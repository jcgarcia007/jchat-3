import React from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { BlurView } from 'expo-blur';

import { useThemeColors } from '../../theme/colors';
import type { GlassSheetSurfaceProps } from './GlassSheetSurface.types';

export default function GlassSheetSurface({ children, style }: GlassSheetSurfaceProps) {
  const colors = useThemeColors();
  const scheme = useColorScheme();
  return (
    <BlurView
      intensity={72}
      tint={scheme === 'dark' ? 'dark' : 'light'}
      style={[styles.surface, { borderColor: colors.glassBorder }, style]}
    >
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassBackground }]}
      />
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  surface: { overflow: 'hidden', borderWidth: 1 },
});
