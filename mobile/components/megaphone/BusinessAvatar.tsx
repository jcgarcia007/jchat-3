import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '../../theme/colors';

interface BusinessAvatarProps {
  logoUrl: string | null;
  emoji: string | null;
  size?: number;
}

/** Business logo, or its emoji (🏪 by default) when there is no logo. */
export default function BusinessAvatar({ logoUrl, emoji, size = 36 }: BusinessAvatarProps) {
  const colors = useThemeColors();
  const box = { borderRadius: size / 2, height: size, width: size };

  if (logoUrl) {
    return <Image source={{ uri: logoUrl }} style={[styles.base, box, { backgroundColor: colors.bgElevated }]} />;
  }
  return (
    <View style={[styles.base, box, { backgroundColor: colors.bgElevated }]}>
      <Text style={{ fontSize: size * 0.52 }}>{emoji ?? '🏪'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
