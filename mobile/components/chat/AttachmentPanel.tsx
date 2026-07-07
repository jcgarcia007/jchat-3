/**
 * JChat 3.0 — AttachmentPanel (Task 2.4, restructured)
 *
 * Expands from the "+" button in ChatInput.
 * Buttons (in order): Photo · Menú · Servicio · Match · Offer*
 *
 * Photo    — expo-image-picker (MediaTypeOptions.Images)
 * Menú     — opens the business menu (calls onMenu, wired in ChatRoomScreen)
 * Servicio — calls service alert / waiter call (calls onServiceCall — Tanda C)
 * Match    — DISABLED / coming soon, no-op (renders faded with "pronto" badge)
 * Offer*   — gated by canCreateOffer (offers_manage permission); calls onOffer
 *
 * Props:
 *   visible         — controls whether the panel is displayed
 *   theme           — active ChatTheme
 *   onPhoto         — called with the selected image URI
 *   onMenu          — called when user taps Menú (optional; ChatRoomScreen wires this)
 *   onServiceCall   — called when user taps Servicio (optional; Tanda C)
 *   onOffer         — called when user taps Offer (optional; CreateOfferSheet)
 *   onClose         — called after any action or dismiss
 *   canCreateOffer  — hides Offer button when false (offers_manage permission gate)
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
  IconToolsKitchen2,
  IconBell,
  IconHeart,
  IconTag,
} from '@tabler/icons-react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ChatTheme } from '../../theme/chatThemes';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AttachmentPanelProps {
  visible: boolean;
  theme: ChatTheme;
  onPhoto: (uri: string) => void;
  onMenu?: () => void;
  onServiceCall?: () => void;
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
    paddingVertical: 11,
    paddingHorizontal: 4,
    flex: 1,
    minWidth: 60,
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
  onMenu,
  onServiceCall,
  onOffer,
  onClose,
  canCreateOffer,
}: AttachmentPanelProps) {
  const handlePhoto = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permiso requerido', // TODO(i18n)
          'Permite el acceso a tus fotos para enviar imágenes.',
        );
        return;
      }
      // SDK 56: MediaTypeOptions is deprecated → mediaTypes accepts string[].
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
      });
      if (!result.canceled && result.assets.length > 0) {
        const uri = result.assets[0]?.uri;
        if (uri) {
          onPhoto(uri);
        }
      }
    } catch (err) {
      // Don't fail silently — surface a clear message and log for debugging.
      console.error('[AttachmentPanel] launchImageLibraryAsync failed:', err);
      Alert.alert(
        'Galería no disponible', // TODO(i18n)
        'No se pudo abrir la galería. Verifica los permisos.',
      );
    } finally {
      onClose();
    }
  }, [onPhoto, onClose]);

  const handleMenu = useCallback(() => {
    onClose();
    if (onMenu) onMenu();
    // ChatRoomScreen wires this to navigation.navigate('Menu', ...)
  }, [onMenu, onClose]);

  const handleServiceCall = useCallback(() => {
    onClose();
    if (onServiceCall) onServiceCall();
    // TODO(Tanda C): open service-call sheet
  }, [onServiceCall, onClose]);

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

        {/* Photo */}
        <OptionButton
          theme={theme}
          icon={<IconCamera size={24} color={theme.accent} />}
          label="Photo" // TODO(i18n)
          onPress={handlePhoto}
        />

        {/* Menú */}
        <OptionButton
          theme={theme}
          icon={<IconToolsKitchen2 size={24} color={theme.accent} />}
          label="Menú" // TODO(i18n)
          onPress={handleMenu}
        />

        {/* Servicio */}
        <OptionButton
          theme={theme}
          icon={<IconBell size={24} color={theme.accent} />}
          label="Servicio" // TODO(i18n)
          onPress={handleServiceCall}
        />

        {/* Match — disabled / coming soon */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Match — Próximamente" // TODO(i18n)
          accessibilityState={{ disabled: true }}
          onPress={() => Alert.alert('Próximamente', 'Match estará disponible pronto.')} // TODO(i18n)
          style={[
            optStyles.btn,
            { backgroundColor: theme.inputBg, borderColor: theme.border, opacity: 0.4 },
          ]}
        >
          <IconHeart size={24} color={theme.accent} />
          <Text style={[optStyles.label, { color: theme.bubbleInText }]}>
            Match
          </Text>
          <Text style={[panelStyles.pronto, { color: theme.accent }]}>
            pronto
          </Text>
        </Pressable>

        {/* Offer — visible only to users with offers_manage permission */}
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
    flexWrap: 'wrap',
    gap: 8,
  },
  pronto: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: -2,
  },
});
