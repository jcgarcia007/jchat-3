/**
 * JChat 3.0 — a business's icon: the image the owner uploaded (businesses.icon_url) when there is one and it loads, otherwise
 * its emoji (businesses.icon_emoji), otherwise `fallbackEmoji`. One place, so every screen that shows a business icon
 * (map pin and preview card, nearby list, chat top bar, chat entry sheet, post header) follows the same rule.
 *
 * `onSettled` fires once the image has loaded or failed (never for the emoji path): map markers need it, because a Marker
 * freezes its view after the first frame (tracksViewChanges={false}) and would keep the empty frame of a remote image.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Image } from 'expo-image';

interface BusinessIconProps {
  iconUrl?: string | null;
  emoji?: string | null;
  /** Shown when there is neither an image nor an emoji. */
  fallbackEmoji?: string;
  /** Side of the square the image fills (px). The emoji uses `emojiStyle` for its own size. */
  size: number;
  /** Corner radius of the image (default: a circle). */
  radius?: number;
  emojiStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  onSettled?: () => void;
}

export function BusinessIcon({ iconUrl, emoji, fallbackEmoji = '🏪', size, radius, emojiStyle, style, onSettled }: BusinessIconProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [iconUrl]); // a new url gets its own chance
  const showImage = !!iconUrl && !failed;

  if (showImage) {
    return (
      <View style={[styles.box, { width: size, height: size, borderRadius: radius ?? size / 2 }, style]}>
        <Image
          source={{ uri: iconUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessible={false}
          onLoad={onSettled}
          onError={() => {
            setFailed(true); // back to the emoji
            onSettled?.();
          }}
        />
      </View>
    );
  }
  return <Text style={emojiStyle}>{emoji || fallbackEmoji}</Text>;
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
});
