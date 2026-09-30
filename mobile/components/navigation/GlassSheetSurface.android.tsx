import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useThemeColors } from '../../theme/colors';
import type { GlassSheetSurfaceProps } from './GlassSheetSurface.types';

export default function GlassSheetSurface({ children, style }: GlassSheetSurfaceProps) {
  const colors = useThemeColors();
  return (
    <View
      style={[
        styles.surface,
        {
          backgroundColor: colors.glassBackground,
          borderColor: colors.glassBorder,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: { overflow: 'hidden', borderWidth: 1 },
});
