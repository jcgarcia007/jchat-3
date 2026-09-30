import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { IconPlus } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import PostHalo from './PostHalo';
import type { PostButtonProps } from './PostButton.types';

export default function PostButton({ accessibilityLabel, onPress }: PostButtonProps) {
  const colors = useThemeColors();

  return (
    <View style={styles.root}>
      <PostHalo />
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
          <LinearGradient
            pointerEvents="none"
            colors={[colors.glassBorder, colors.transparent]}
            style={styles.reflection}
          />
          <IconPlus size={30} color={colors.brand} strokeWidth={2.4} />
        </View>
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
