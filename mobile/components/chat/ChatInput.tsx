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
 *   text is empty  → microphone icon (tapping shows "coming soon" alert)
 *   text has chars → send icon (tapping sends the message)
 *
 * // TODO(i18n)
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
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
import { AttachmentPanel } from './AttachmentPanel';
import type { ChatTheme } from '../../theme/chatThemes';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ChatInputProps {
  theme: ChatTheme;
  onSendText: (text: string) => void;
  onSendPhoto: (uri: string) => void;
  onOfferPress?: () => void;
  /** Forwarded to AttachmentPanel — hides Offer button when false. */
  canCreateOffer?: boolean;
  disabled?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ChatInput({
  theme,
  onSendText,
  onSendPhoto,
  onOfferPress,
  canCreateOffer = false,
  disabled = false,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

  const canSend = text.trim().length > 0 && !disabled;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSendText(trimmed);
    setText('');
  }, [text, disabled, onSendText]);

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
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission required', // TODO(i18n)
        'Allow camera access to take photos in chat.',
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
    });
    if (!result.canceled && result.assets.length > 0) {
      const uri = result.assets[0]?.uri;
      if (uri) {
        onSendPhoto(uri);
      }
    }
  }, [onSendPhoto]);

  const handleMicPress = useCallback(() => {
    // TODO(audio): implement voice recording in a future tanda
    Alert.alert('Coming soon', 'Voice messages will be available soon.'); // TODO(i18n)
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Attachment panel — above the input bar */}
      <AttachmentPanel
        visible={attachmentOpen}
        theme={theme}
        onPhoto={handleGalleryPhoto}
        onOffer={onOfferPress}
        onClose={handleCloseAttachment}
        canCreateOffer={canCreateOffer}
      />

      {/* Input bar */}
      <View style={[barStyles.container, { backgroundColor: theme.topBg, borderTopColor: theme.border }]}>

        {/* + / X toggle — opens AttachmentPanel */}
        <Pressable
          onPress={handleToggleAttachment}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={attachmentOpen ? 'Close attachment panel' : 'Open attachment panel'} // TODO(i18n)
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
          placeholder="Message…" // TODO(i18n)
          placeholderTextColor={theme.tabInactive}
          multiline
          maxLength={4000}
          returnKeyType="default"
          editable={!disabled}
          onFocus={() => setAttachmentOpen(false)}
          accessibilityLabel="Message input" // TODO(i18n)
        />

        {/* Camera — quick photo without opening panel */}
        <Pressable
          onPress={() => void handleCamera()}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Take a photo" // TODO(i18n)
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
        <Pressable
          onPress={canSend ? handleSend : handleMicPress}
          accessibilityRole="button"
          accessibilityLabel={canSend ? 'Send message' : 'Voice message (coming soon)'} // TODO(i18n)
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

      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const barStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
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
    width: 38,
    height: 38,
    borderRadius: 19,
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
