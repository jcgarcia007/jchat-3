/**
 * JChat 3.0 — the Apple slot of the login / sign-up screens. Android and web: the existing browser-OAuth button (`fallback`).
 * iOS uses AppleAuthSlot.ios.tsx: the official native button and the native flow.
 */

import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export interface AppleAuthSlotProps {
  /** The browser-OAuth button of the screen (used when the native flow is not available). */
  fallback: React.ReactElement;
  /** 'signIn' (Log in) or 'signUp' (Sign up) wording of the official button. */
  mode: 'signIn' | 'signUp';
  disabled?: boolean;
  /**
   * What the button sits on. 'theme' (default): the app theme decides (black in light mode, white in dark). 'light': a light surface in
   * BOTH themes (the paper ticket of LoginScreen) → always the black button, as the HIG asks for contrast.
   */
  surface?: 'theme' | 'light';
  /** Size / flex of the official button (it must be as prominent as the Google button next to it). */
  style?: StyleProp<ViewStyle>;
  cornerRadius?: number;
  /** A translated notice for an error that is not a cancellation. */
  onError: (message: string) => void;
}

export function AppleAuthSlot({ fallback }: AppleAuthSlotProps): React.ReactElement {
  return fallback;
}

export default AppleAuthSlot;
