/**
 * JChat 3.0 — AttachmentPanel (Task 2.4)
 *
 * Expands from the "+" button in ChatInput.
 * Four options: Photo, Voice, GIF, Offer.
 *
 * Photo  — expo-image-picker (MediaTypeOptions.Images)
 * Voice  — TODO(expo-av): record audio
 * GIF    — TODO(giphy): open GIF picker
 * Offer  — TODO(Task 2.6): open CreateOfferSheet
 *
 * Props:
 *   visible       — controls whether the panel is displayed
 *   theme         — active ChatTheme
 *   onPhoto       — called with the selected image URI
 *   onVoice       — placeholder (not implemented)
 *   onGif         — placeholder (not implemented)
 *   onOffer       — placeholder (will open CreateOfferSheet in Task 2.6)
 *   onClose       — called after any action or dismiss
 *
 * // TODO(i18n)
 */

import React, { useCallback } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  IconCamera,
  IconMicrophone,
  IconGif,
  IconTag,
} from '@tabler/icons-react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ChatTheme } from '../../theme/chatThemes';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AttachmentPanelProps {
  visible: boolean;
  theme: ChatTheme;
  onPhoto: (uri: string) => void;
  onVoice?: () => void;
  onGif?: () => void;
  onOffer?: () => void;
  onClose: () => void;
  /** Gate: show Offer button only when the current user has offers_manage permission. */
  canCreateOffer: boolean;
}

// ── Option button ──────────────────────────────────────────────────────────────

interface OptionButtonProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  theme: ChatTheme;
}

function OptionButton({ icon, label, onPress, theme }: OptionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        optStyles.btn,
        { backgroundColor: theme.inputBg, borderColor: theme.border },
        pressed && optStyles.btnPressed,
      ]}
    >
      {icon}
      <Text style={[optStyles.label, { color: theme.bubbleInText }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const optStyles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    flex: 1,
  },
  btnPressed: {
    opacity: 0.72,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});

// ── Main component ─────────────────────────────────────────────────────────────

export function AttachmentPanel({
  visible,
  theme,
  onPhoto,
  onVoice,
  onGif,
  onOffer,
  onClose,
  canCreateOffer,
}: AttachmentPanelProps) {
  const handlePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission required', // TODO(i18n)
        'Allow photo library access to send images.',
      );
      onClose();
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
    });
    if (!result.canceled && result.assets.length > 0) {
      const uri = result.assets[0]?.uri;
      if (uri) {
        onPhoto(uri);
      }
    }
    onClose();
  }, [onPhoto, onClose]);

  const handleVoice = useCallback(() => {
    onClose();
    if (onVoice) {
      onVoice();
    } else {
      // TODO(expo-av): implement voice recording
      Alert.alert('Coming soon', 'Voice messages will be available soon.'); // TODO(i18n)
    }
  }, [onVoice, onClose]);

  const handleGif = useCallback(() => {
    onClose();
    if (onGif) {
      onGif();
    } else {
      // TODO(giphy): open GIF picker
      Alert.alert('Coming soon', 'GIF picker coming soon.'); // TODO(i18n)
    }
  }, [onGif, onClose]);

  const handleOffer = useCallback(() => {
    onClose();
    if (onOffer) {
      onOffer();
    }
    // TODO(Task 2.6): open CreateOfferSheet
  }, [onOffer, onClose]);

  if (!visible) return null;

  return (
    <View style={[panelStyles.container, { backgroundColor: theme.topBg, borderTopColor: theme.border }]}>
      <View style={panelStyles.row}>
        <OptionButton
          theme={theme}
          icon={<IconCamera size={24} color={theme.accent} />}
          label="Photo" // TODO(i18n)
          onPress={handlePhoto}
        />
        <OptionButton
          theme={theme}
          icon={<IconMicrophone size={24} color={theme.accent} />}
          label="Voice" // TODO(i18n)
          onPress={handleVoice}
        />
        <OptionButton
          theme={theme}
          icon={<IconGif size={24} color={theme.accent} />}
          label="GIF" // TODO(i18n)
          onPress={handleGif}
        />
        {canCreateOffer && (
          <OptionButton
            theme={theme}
            icon={<IconTag size={24} color={theme.accent} />}
            label="Offer" // TODO(i18n)
            onPress={handleOffer}
          />
        )}
      </View>
    </View>
  );
}

const panelStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
});
