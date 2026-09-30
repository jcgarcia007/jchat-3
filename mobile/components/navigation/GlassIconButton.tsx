import React from 'react';
import { Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import { BlurView } from 'expo-blur';

import { useThemeColors } from '../../theme/colors';
import type { GlassIconButtonProps } from './GlassIconButton.types';

export default function GlassIconButton({ accessibilityLabel, children, onPress }: GlassIconButtonProps) {
  const colors = useThemeColors();
  const scheme = useColorScheme();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
    >
      <BlurView
        intensity={72}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        style={[styles.body, { borderColor: colors.glassBorder }]}
      >
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassBackground }]}
        />
        {children}
      </BlurView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { width: 48, height: 48, borderRadius: 24 },
  pressed: { transform: [{ scale: 0.96 }] },
  body: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
