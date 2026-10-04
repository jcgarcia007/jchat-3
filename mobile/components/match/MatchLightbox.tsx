/**
 * JChat 3.0 — Match photo lightbox (Fase D4)
 *
 * Tap a thumbnail → the photo enlarges; tap anywhere outside the photo (or the close button, or
 * the back gesture) → it closes. Uses the same already-WebP ~800 px photo (no second asset).
 */

import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { IconX } from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';

interface MatchLightboxProps {
  /** Signed URL to show; null = closed. */
  url: string | null;
  onClose: () => void;
}

export function MatchLightbox({ url, onClose }: MatchLightboxProps) {
  const { t } = useTranslation('match');
  return (
    <Modal visible={url != null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('lightbox.close')}
      >
        {url ? (
          // The photo itself swallows taps so only the dark area outside it closes the lightbox.
          <Pressable onPress={() => undefined} accessible={false} style={styles.photoWrap}>
            <Image source={{ uri: url }} style={styles.photo} contentFit="contain" />
          </Pressable>
        ) : null}
        <View style={styles.closeCircle} pointerEvents="none">
          <IconX size={22} color={palette.onImage} strokeWidth={2.5} />
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: palette.shadow, alignItems: 'center', justifyContent: 'center', padding: 16 },
  photoWrap: { width: '100%', aspectRatio: 3 / 4, maxHeight: '85%' },
  photo: { width: '100%', height: '100%', borderRadius: 16 },
  closeCircle: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.scrimMedium,
  },
});
