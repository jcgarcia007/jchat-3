import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useThemeColors } from '../../theme/colors';
import { BusinessIcon } from '../common/BusinessIcon';

interface BusinessAvatarProps {
  /** The icon image the owner uploaded (businesses.icon_url). */
  iconUrl?: string | null;
  logoUrl: string | null;
  emoji: string | null;
  size?: number;
}

/** Business icon image, else its logo, else its emoji (🏪 by default). A picture that fails to load falls back to the emoji. */
export default function BusinessAvatar({ iconUrl, logoUrl, emoji, size = 36 }: BusinessAvatarProps) {
  const colors = useThemeColors();
  const box = { borderRadius: size / 2, height: size, width: size };

  return (
    <View style={[styles.base, box, { backgroundColor: colors.bgElevated }]}>
      <BusinessIcon iconUrl={iconUrl || logoUrl} emoji={emoji} size={size} radius={size / 2} emojiStyle={{ fontSize: size * 0.52 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
