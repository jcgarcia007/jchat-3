import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GlassSurface, type GlassVariant } from './GlassSurface';

/**
 * A round glass button (44 pt, or 48 pt in the compact header) with an icon. The 44 pt touch area is the button itself.
 * `tone="cover"` floats over the cover (the icon colour comes from the profile theme: readable on its cover); `tone="bar"` sits in the compact header.
 */
interface Props {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
  tone?: 'cover' | 'bar';
  size?: number;
  testID?: string;
  /** A small dot over the corner (e.g. pending requests). */
  dot?: React.ReactNode;
}

export function GlassIconButton({ label, onPress, children, tone = 'cover', size = 44, testID, dot }: Props) {
  const variant: GlassVariant = tone === 'cover' ? 'button' : 'bar';
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => [{ width: size, height: size, opacity: pressed ? 0.7 : 1 }]}>
      <GlassSurface variant={variant} style={[styles.round, { width: size, height: size, borderRadius: size / 2 }]}>
        <View style={styles.center}>{children}</View>
      </GlassSurface>
      {dot}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  round: { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', flex: 1, alignSelf: 'stretch' },
});
