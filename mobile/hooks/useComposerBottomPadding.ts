/**
 * JChat 3.0 — useComposerBottomPadding
 *
 * Bottom padding for the composer bar of the venue chat (ChatInput) and the DM chat, so both behave the same:
 * keyboard closed → max(safe-area bottom, 8); keyboard open → 8. The bar's own background fills that padding, so it
 * reaches the bottom edge of the screen. Web returns 8 (the web build lifts the composer with useVisualViewportInset).
 */

import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COMPOSER_MIN_PADDING, composerBottomPadding } from '../utils/composerPadding';

export function useComposerBottomPadding(): number {
  const insets = useSafeAreaInsets();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (Platform.OS === 'web') return COMPOSER_MIN_PADDING;
  return composerBottomPadding(insets.bottom, keyboardOpen);
}
