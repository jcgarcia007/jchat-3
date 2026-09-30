import React from 'react';
import { Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { IconPlus } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import PostHalo from './PostHalo';
import type { PostButtonProps } from './PostButton.types';

export default function PostButton({ accessibilityLabel, onPress }: PostButtonProps) {
  const colors = useThemeColors();
  const scheme = useColorScheme();

  return (
    <View style={styles.root}>
      <PostHalo />
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
          <LinearGradient
            pointerEvents="none"
            colors={[colors.glassBorder, colors.transparent]}
            style={styles.reflection}
          />
          <IconPlus size={30} color={colors.brand} strokeWidth={2.4} />
        </BlurView>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: 98,
    height: 98,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressable: {
    width: 74,
    height: 74,
    borderRadius: 37,
  },
  pressed: { transform: [{ scale: 0.96 }] },
  body: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  reflection: {
    position: 'absolute',
    top: 0,
    left: 8,
    right: 8,
    height: 25,
    borderRadius: 18,
  },
});
