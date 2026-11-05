/**
 * JChat 3.0 — useKeyboardOpen: true while the soft keyboard is up (native; the web build reports false, it lifts the
 * composer with useVisualViewportInset). Screens use it to give the keyboard's room back to what matters, e.g. the
 * chat hides its avatar strip so the message list is not squeezed to a sliver at large font sizes.
 */

import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}
