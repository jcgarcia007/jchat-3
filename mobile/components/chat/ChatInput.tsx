/**
 * JChat 3.0 — ChatInput (Task 2.4, WhatsApp-style bar)
 *
 * The bottom input bar of the chat room.
 * Layout: [AttachmentPanel above when open] [+] [TextInput] [camera] [mic/send]
 *
 * Props:
 *   theme          — active ChatTheme
 *   onSendText     — called with the trimmed text string
 *   onSendPhoto    — called with the image URI (gallery OR camera)
 *   onOfferPress   — TODO(Task 2.6): opens CreateOfferSheet
 *   canCreateOffer — forwarded to AttachmentPanel (offers_manage permission gate)
 *   disabled       — prevents sending (e.g. muted)
 *
 * Dynamic mic/send button:
 *   text is empty  → microphone icon (tapping starts a voice recording)
 *   text has chars → send icon (tapping sends the message)
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  IconCamera,
  IconMicrophone,
  IconPlus,
  IconSend,
  IconX,
} from '@tabler/icons-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { AttachmentPanel } from './AttachmentPanel';
import { VoiceRecorderBar } from '../common/VoiceRecorderBar';
import { canRecordVoice } from '../../services/webVoice';
import type { VoiceRecording } from '../common/VoiceRecorderBar';
import type { ChatTheme } from '../../theme/chatThemes';
import { normalizeImageUri } from '../../utils/normalizeImage';
import { pickPhotoFromLibrary } from '../../services/photoPicker';
import { checkMessage } from '../../utils/messageFilter';
import { showAlert } from '../../utils/dialog';
import { useComposerBottomPadding } from '../../hooks/useComposerBottomPadding';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ChatInputProps {
  theme: ChatTheme;
  onSendText: (text: string) => void;
  onSendPhoto: (uri: string) => void;
  /** Called with the finished voice recording (local file + duration); the parent uploads it. */
  onSendVoice: (recording: VoiceRecording) => void;
  onMenuPress?: () => void;
  onServiceCall?: () => void;
  onOfferPress?: () => void;
  /** Forwarded to AttachmentPanel — hides Offer button when false. */
  canCreateOffer?: boolean;
  /** Match (D1) — forwarded to AttachmentPanel. */
  gamesAvailable?: boolean;
  games?: { key: string; name: string }[];
  onGamePress?: (key: string) => void;
  onScanQr?: () => void;
  disabled?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ChatInput({
  theme,
  onSendText,
  onSendPhoto,
  onSendVoice,
  onMenuPress,
  onServiceCall,
  onOfferPress,
  canCreateOffer = false,
  gamesAvailable = false,
  games,
  onGamePress,
  onScanQr,
  disabled = false,
}: ChatInputProps) {
  const { t } = useTranslation('chat');
  const [text, setText] = useState('');
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const inputRef = useRef<TextInput>(null);
  // Closed keyboard: the bar (and its background) clears the home indicator; open keyboard: 8.
  const bottomPadding = useComposerBottomPadding();

  // ── Derived ────────────────────────────────────────────────────────────────

  const canSend = text.trim().length > 0 && !disabled;
  // Web without MP4 recording: no mic (see services/webVoice.web.ts); a short hint is shown instead.
  const voiceOk = canRecordVoice();

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    // Grave insults/threats are not sent; the text stays in the box so the person can rewrite it.
    if (!checkMessage(trimmed).allowed) {
      showAlert(t('common:contentFilter.title'), t('common:contentFilter.blocked'));
      return;
    }
    onSendText(trimmed);
    setText('');
  }, [text, disabled, onSendText, t]);

  const handleToggleAttachment = useCallback(() => {
    setAttachmentOpen((prev) => !prev);
    inputRef.current?.blur();
  }, []);

  const handleCloseAttachment = useCallback(() => {
    setAttachmentOpen(false);
  }, []);

  const handleGalleryPhoto = useCallback((uri: string) => {
    onSendPhoto(uri);
  }, [onSendPhoto]);

  const handleCamera = useCallback(async () => {
    setAttachmentOpen(false);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showAlert(
          t('input.cameraPermissionTitle'),
          t('input.cameraPermissionMessage'),
        );
        return;
      }
      // SDK 56: MediaTypeOptions is deprecated → mediaTypes accepts string[].
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
      });
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset?.uri) {
          onSendPhoto((await normalizeImageUri(asset.uri, asset.mimeType)).uri);
        }
      }
    } catch (err) {
      // Don't fail silently — surface a clear message and log for debugging.
      console.error('[ChatInput] launchCameraAsync failed:', err);
      showAlert(
        t('input.cameraErrorTitle'),
        t('input.cameraErrorMessage'),
      );
    }
  }, [onSendPhoto]);

  // Where "Games" replaced "Photo" in the panel, the camera button offers Camera / Gallery so
  // sending from the gallery isn't lost.
  const handleGallery = useCallback(async () => {
    try {
      // No library permission (services/photoPicker.ts). legacy:true — classic Android picker (see AttachmentPanel).
      const result = await pickPhotoFromLibrary({ allowsEditing: true, quality: 0.85, legacy: true });
      const asset = result && !result.canceled ? result.assets[0] : undefined;
      if (asset?.uri) onSendPhoto(asset.uri); // already normalized by the helper
    } catch (err) {
      console.error('[ChatInput] photo library failed:', err);
      showAlert(t('input.cameraErrorTitle'), t('input.cameraErrorMessage'));
    }
  }, [onSendPhoto, t]);

  const handleCameraPress = useCallback(() => {
    if (!gamesAvailable) {
      void handleCamera();
      return;
    }
    setAttachmentOpen(false);
    showAlert(t('input.sourceTitle'), undefined, [
      { text: t('input.sourceCamera'), onPress: () => void handleCamera() },
      { text: t('input.sourceGallery'), onPress: () => void handleGallery() },
      { text: t('actions.cancel', { ns: 'common' }), style: 'cancel' },
    ]);
  }, [gamesAvailable, handleCamera, handleGallery, t]);

  const handleMicPress = useCallback(() => {
    setAttachmentOpen(false);
    setRecordingVoice(true);
  }, []);

  const handleVoiceSend = useCallback(
    (recording: VoiceRecording) => {
      setRecordingVoice(false);
      onSendVoice(recording);
    },
    [onSendVoice],
  );
  const handleVoiceCancel = useCallback(() => setRecordingVoice(false), []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    // The keyboard is handled once, by the KeyboardAvoidingView in ChatRoomScreen (it lifts the list and this bar as a
    // unit; web uses useVisualViewportInset there). A second one here lifted the bar twice.
    <View>
      {/* Attachment panel — above the input bar */}
      <AttachmentPanel
        visible={attachmentOpen}
        theme={theme}
        onPhoto={handleGalleryPhoto}
        onMenu={onMenuPress}
        onServiceCall={onServiceCall}
        onOffer={onOfferPress}
        onClose={handleCloseAttachment}
        canCreateOffer={canCreateOffer}
        gamesAvailable={gamesAvailable}
        games={games}
        onGamePress={onGamePress}
        onScanQr={onScanQr}
      />

      {!voiceOk && !recordingVoice ? (
        <Text style={[barStyles.voiceHint, { color: theme.tabInactive, backgroundColor: theme.topBg }]}>
          {t('voice.webUnsupported', { ns: 'common' })}
        </Text>
      ) : null}

      {/* Input bar — replaced by the voice recorder while recording */}
      {recordingVoice ? (
        <View style={{ backgroundColor: theme.topBg, paddingBottom: bottomPadding - 8 }}>
          <VoiceRecorderBar
            onSend={handleVoiceSend}
            onCancel={handleVoiceCancel}
            textColor={theme.bubbleInText}
            accentColor={theme.accent}
            backgroundColor={theme.topBg}
            borderColor={theme.border}
          />
        </View>
      ) : (
      <View
        style={[
          barStyles.container,
          { backgroundColor: theme.topBg, borderTopColor: theme.border, paddingBottom: bottomPadding },
        ]}
      >

        {/* + / X toggle — opens AttachmentPanel */}
        <Pressable
          onPress={handleToggleAttachment}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={attachmentOpen ? t('input.closeAttachment') : t('input.openAttachment')}
          style={({ pressed }) => [
            barStyles.iconBtn,
            { backgroundColor: attachmentOpen ? theme.accent : theme.inputBg, borderColor: theme.border },
            pressed && barStyles.iconBtnPressed,
            disabled && barStyles.disabled,
          ]}
        >
          {attachmentOpen ? (
            <IconX size={20} color={theme.topBg} />
          ) : (
            <IconPlus size={20} color={theme.accent} />
          )}
        </Pressable>

        {/* Text field */}
        <TextInput
          ref={inputRef}
          style={[
            barStyles.input,
            { backgroundColor: theme.inputBg, color: theme.bubbleInText, borderColor: theme.border },
          ]}
          value={text}
          onChangeText={setText}
          placeholder={t('input.placeholder')}
          placeholderTextColor={theme.tabInactive}
          multiline
          maxLength={4000}
          returnKeyType="default"
          editable={!disabled}
          onFocus={() => setAttachmentOpen(false)}
          accessibilityLabel={t('input.a11yInput')}
        />

        {/* Camera — quick photo without opening panel */}
        <Pressable
          onPress={handleCameraPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={t('input.takePhoto')}
          style={({ pressed }) => [
            barStyles.iconBtn,
            { backgroundColor: theme.inputBg, borderColor: theme.border },
            pressed && barStyles.iconBtnPressed,
            disabled && barStyles.disabled,
          ]}
        >
          <IconCamera size={20} color={theme.accent} />
        </Pressable>

        {/* Dynamic: mic (text empty) ↔ send (text present) */}
        {canSend || voiceOk ? (
        <Pressable
          testID={canSend ? 'chat-send' : 'chat-mic'}
          onPress={canSend ? handleSend : handleMicPress}
          accessibilityRole="button"
          accessibilityLabel={canSend ? t('input.send') : t('voice.record', { ns: 'common' })}
          style={({ pressed }) => [
            barStyles.iconBtn,
            { backgroundColor: canSend ? theme.accent : theme.inputBg, borderColor: theme.border },
            pressed && barStyles.iconBtnPressed,
            disabled && barStyles.disabled,
          ]}
        >
          {canSend ? (
            <IconSend size={20} color={theme.topBg} />
          ) : (
            <IconMicrophone size={20} color={disabled ? theme.tabInactive : theme.accent} />
          )}
        </Pressable>
        ) : null}

      </View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const barStyles = StyleSheet.create({
  voiceHint: { fontSize: 12, textAlign: 'center', paddingTop: 6 },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    // paddingBottom comes from useComposerBottomPadding (safe-area aware).
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    maxHeight: 120,
    lineHeight: 20,
  },
  iconBtn: {
    // 44 pt = the minimum touch target (react-native-web ignores hitSlop, so the button itself is 44).
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  iconBtnPressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.45,
  },
});
