/**
 * JChat 3.0 — cross-platform dialog types. showAlert mirrors the React Native
 * `Alert.alert(title, message, buttons, options)` signature so call sites keep working
 * unchanged; confirm() is the promise-based shortcut for the cancel/confirm pair.
 */

import type { AlertButton, AlertOptions } from 'react-native';

export type DialogButton = AlertButton;
export type DialogOptions = AlertOptions;

export interface ConfirmOptions {
  /** Defaults to the localized "OK". */
  confirmText?: string;
  /** Defaults to the localized "Cancel". */
  cancelText?: string;
  /** Styles the confirm button as destructive. */
  destructive?: boolean;
}
