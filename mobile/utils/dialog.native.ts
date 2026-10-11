/**
 * JChat 3.0 — dialogs (iOS / Android): thin delegation to React Native's Alert.
 */

import { Alert } from 'react-native';
import i18n from 'i18next';
import type { ConfirmOptions, DialogButton, DialogOptions } from './dialog.types';

export type { ConfirmOptions, DialogButton, DialogOptions } from './dialog.types';

export function showAlert(
  title: string,
  message?: string,
  buttons?: DialogButton[],
  options?: DialogOptions,
): void {
  Alert.alert(title, message, buttons, options);
}

/** Resolves true when the user confirms, false on cancel or dismissal. */
export function confirm(
  title: string,
  message?: string,
  { confirmText, cancelText, destructive }: ConfirmOptions = {},
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        {
          text: cancelText ?? i18n.t('actions.cancel', { ns: 'common' }),
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: confirmText ?? i18n.t('actions.ok', { ns: 'common' }),
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
