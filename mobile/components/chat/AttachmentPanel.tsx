/**
 * JChat 3.0 — AttachmentPanel (Task 2.4, restructured)
 *
 * Expands from the "+" button in ChatInput.
 * Buttons (in order): Photo · Menú · Servicio · Offer*
 *
 * Photo    — expo-image-picker (MediaTypeOptions.Images)
 * Menú     — opens the business menu (calls onMenu, wired in ChatRoomScreen)
 * Servicio — calls service alert / waiter call (calls onServiceCall — Tanda C)
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
 */

import React, { useCallback, useState } from 'react';
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
  IconTag,
  IconDeviceGamepad2,
  IconHeart,
  IconQrcode,
} from '@tabler/icons-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import type { ChatTheme } from '../../theme/chatThemes';
import { useMatchPresenceState } from '../../services/matchPresence';

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
  /** Match (D1): when true, "Games" replaces "Photo" (the input bar keeps its camera button). */
  gamesAvailable?: boolean;
  /** Catalog games to list in the games row (today only Match), already localized. */
  games?: { key: string; name: string }[];
  onGamePress?: (key: string) => void;
  /** Opens the venue QR scanner (shown while Match presence is still being verified). */
  onScanQr?: () => void;
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
  gamesAvailable = false,
  games = [],
  onGamePress,
  onScanQr,
}: AttachmentPanelProps) {
  const { t } = useTranslation('chat');
  const { t: tm } = useTranslation('match');
  const presence = useMatchPresenceState();
  const [gamesOpen, setGamesOpen] = useState(false);
  const handlePhoto = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          t('attachment.photoPermissionTitle'),
          t('attachment.photoPermissionMessage'),
        );
        return;
      }
      // SDK 56: MediaTypeOptions is deprecated → mediaTypes accepts string[].
      // legacy:true forces the classic Android picker (ACTION_GET_CONTENT)
      // instead of the Android 13+ Photo Picker (PICK_IMAGES), which throws
      // ActivityNotFoundException on devices/emulators without the Photo Picker
      // module (non-GMS images).
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
        legacy: true,
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
        t('attachment.galleryErrorTitle'),
        t('attachment.galleryErrorMessage'),
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

  const handleGame = useCallback(
    (key: string) => {
      onClose();
      onGamePress?.(key);
    },
    [onGamePress, onClose],
  );

  const handleScanQr = useCallback(() => {
    onClose();
    onScanQr?.();
  }, [onScanQr, onClose]);

  if (!visible) return null;

  // Match status line under the Match button: verifying (+ QR option) or a translated denial.
  // Match activates instantly; 'pending' only with a mocked location → scan the venue QR.
  const pending = presence.status === 'pending';
  const denied = presence.status === 'denied';
  const deniedText = denied
    ? tm(presence.reason ? `presence.denied.${presence.reason}` : 'presence.denied.default', {
        defaultValue: tm('presence.denied.default'),
      })
    : null;

  return (
    <View style={[panelStyles.container, { backgroundColor: theme.topBg, borderTopColor: theme.border }]}>
      <View style={panelStyles.row}>

        {/* Games (Match available) replaces Photo; the input bar keeps its camera button */}
        {gamesAvailable ? (
          <OptionButton
            theme={theme}
            icon={<IconDeviceGamepad2 size={24} color={theme.accent} />}
            label={tm('games.button')}
            onPress={() => setGamesOpen((v) => !v)}
          />
        ) : (
          <OptionButton
            theme={theme}
            icon={<IconCamera size={24} color={theme.accent} />}
            label={t('attachment.photo')}
            onPress={handlePhoto}
          />
        )}

        {/* Menú */}
        <OptionButton
          theme={theme}
          icon={<IconToolsKitchen2 size={24} color={theme.accent} />}
          label={t('attachment.menu')}
          onPress={handleMenu}
        />

        {/* Servicio */}
        <OptionButton
          theme={theme}
          icon={<IconBell size={24} color={theme.accent} />}
          label={t('attachment.service')}
          onPress={handleServiceCall}
        />

        {/* Offer — visible only to users with offers_manage permission */}
        {canCreateOffer && (
          <OptionButton
            theme={theme}
            icon={<IconTag size={24} color={theme.accent} />}
            label={t('attachment.offer')}
            onPress={handleOffer}
          />
        )}

      </View>

      {/* Games row — only the catalog games (today Match) */}
      {gamesAvailable && gamesOpen && (
        <View style={panelStyles.gamesBlock} accessibilityLabel={tm('games.rowA11y')}>
          <View style={panelStyles.row}>
            {games.map((game) => (
              <OptionButton
                key={game.key}
                theme={theme}
                icon={<IconHeart size={24} color={theme.accent} />}
                label={game.name}
                onPress={() => handleGame(game.key)}
              />
            ))}
          </View>
          {pending && (
            <View style={panelStyles.statusRow}>
              <Text style={[panelStyles.statusText, { color: theme.tabInactive }]}>
                {tm('presence.mocked')}
              </Text>
              <Pressable
                onPress={handleScanQr}
                accessibilityRole="button"
                style={[panelStyles.qrBtn, { borderColor: theme.accent }]}
              >
                <IconQrcode size={16} color={theme.accent} />
                <Text style={[panelStyles.qrText, { color: theme.accent }]}>{tm('presence.scanQr')}</Text>
              </Pressable>
            </View>
          )}
          {deniedText && (
            <Text style={[panelStyles.statusText, { color: theme.tabInactive }]}>{deniedText}</Text>
          )}
        </View>
      )}
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
  gamesBlock: { marginTop: 10, gap: 8 },
  statusRow: { gap: 8 },
  statusText: { fontSize: 13, lineHeight: 18 },
  qrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  qrText: { fontSize: 13, fontWeight: '600' },
});
