import React from 'react';
import { Platform, StyleSheet, View, useColorScheme, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

import { useReduceTransparency } from '../../hooks/useReduceTransparency';
import { useThemeColors } from '../../theme/colors';

/**
 * A "glass" surface for the profile: a translucent fill over a blur (iOS), a plain translucent fill (Android, no blur), a SOLID surface when iOS's
 * "Reduce transparency" is on. Variants: `button` (round buttons over the cover), `bar` (the compact header, like the tab bar) and `sheet` (the
 * capsules over the page). Only theme tokens; the shape (radius) comes from the style.
 */
export type GlassVariant = 'button' | 'bar' | 'sheet';

interface Props {
  variant: GlassVariant;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function GlassSurface({ variant, style, children }: Props) {
  const colors = useThemeColors();
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const reduceTransparency = useReduceTransparency();
  const isIos = Platform.OS === 'ios';

  const translucent =
    variant === 'button' ? colors.glassButtonFill : variant === 'sheet' ? colors.glassSheetButtonFill : isIos ? colors.tabBarGlass : colors.tabBarGlassAndroid;
  const solid = variant === 'bar' ? colors.bgSurface : colors.bgElevated;
  const border = variant === 'button' ? colors.glassButtonBorder : colors.glassEdgeLine;

  return (
    <View
      style={[
        styles.surface,
        { backgroundColor: reduceTransparency ? solid : translucent, borderColor: reduceTransparency ? colors.glassEdgeLine : border },
        style,
      ]}
    >
      {isIos && !reduceTransparency ? <BlurView intensity={variant === 'bar' ? 60 : 40} pointerEvents="none" style={StyleSheet.absoluteFill} tint={scheme} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: { borderWidth: 1, overflow: 'hidden' },
});
