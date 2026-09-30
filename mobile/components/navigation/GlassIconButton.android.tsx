import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useThemeColors } from '../../theme/colors';
import type { GlassIconButtonProps } from './GlassIconButton.types';

export default function GlassIconButton({ accessibilityLabel, children, onPress }: GlassIconButtonProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
    >
      <View
        style={[
          styles.body,
          {
            backgroundColor: colors.glassBackground,
            borderColor: colors.glassBorder,
          },
        ]}
      >
        {children}
      </View>
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
