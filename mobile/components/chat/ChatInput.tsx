/**
 * JChat 3.0 — ChatInput (Task 2.4)
 *
 * The bottom input bar of the chat room.
 * Layout: [AttachmentPanel above when open] [+ button] [TextInput] [Send button]
 *
 * Props:
 *   theme          — active ChatTheme
 *   onSendText     — called with the trimmed text string
 *   onSendPhoto    — called with the image URI from the gallery picker
 *   onOfferPress   — TODO(Task 2.6): will open CreateOfferSheet
 *   disabled       — prevents sending (e.g. muted)
 *
 * // TODO(i18n)
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { IconPlus, IconSend, IconX } from '@tabler/icons-react-native';
import { AttachmentPanel } from './AttachmentPanel';
import type { ChatTheme } from '../../theme/chatThemes';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ChatInputProps {
  theme: ChatTheme;
  onSendText: (text: string) => void;
  onSendPhoto: (uri: string) => void;
  onOfferPress?: () => void;
  disabled?: boolean;
  /** Optional button rendered between the TextInput and the Send button. */
  reactionButton?: React.ReactNode;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ChatInput({
  theme,
  onSendText,
  onSendPhoto,
  onOfferPress,
  disabled = false,
  reactionButton,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSendText(trimmed);
    setText('');
  }, [text, disabled, onSendText]);

  const handleToggleAttachment = useCallback(() => {
    setAttachmentOpen((prev) => !prev);
    // Dismiss keyboard when opening the panel
    inputRef.current?.blur();
  }, []);

  const handleCloseAttachment = useCallback(() => {
    setAttachmentOpen(false);
  }, []);

  const handlePhoto = useCallback((uri: string) => {
    onSendPhoto(uri);
  }, [onSendPhoto]);

  const canSend = text.trim().length > 0 && !disabled;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Attachment panel — above the input bar */}
      <AttachmentPanel
        visible={attachmentOpen}
        theme={theme}
        onPhoto={handlePhoto}
        onOffer={onOfferPress}
        onClose={handleCloseAttachment}
      />

      {/* Input bar */}
      <View style={[barStyles.container, { backgroundColor: theme.topBg, borderTopColor: theme.border }]}>
        {/* + / X toggle */}
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

        {/* Reaction / emoji button slot */}
        {reactionButton}

        {/* Send button */}
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message" // TODO(i18n)
          accessibilityState={{ disabled: !canSend }}
          style={({ pressed }) => [
            barStyles.iconBtn,
            { backgroundColor: canSend ? theme.accent : theme.inputBg, borderColor: theme.border },
            pressed && canSend && barStyles.iconBtnPressed,
            !canSend && barStyles.disabled,
          ]}
        >
          <IconSend
            size={20}
            color={canSend ? theme.topBg : theme.tabInactive}
          />
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
