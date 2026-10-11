/**
 * JChat 3.0 — dialogs (web): requests are queued and rendered by <DialogHost /> (mounted once
 * in App.tsx), because the browser has no React Native Alert.
 */

import i18n from 'i18next';
import { enqueueDialog } from './dialogStore';
import type { ConfirmOptions, DialogButton, DialogOptions } from './dialog.types';

export type { ConfirmOptions, DialogButton, DialogOptions } from './dialog.types';

export function showAlert(
  title: string,
  message?: string,
  buttons?: DialogButton[],
  options?: DialogOptions,
): void {
  enqueueDialog({
    title,
    message,
    buttons: buttons && buttons.length > 0 ? buttons : [{ text: i18n.t('actions.ok', { ns: 'common' }) }],
    options,
  });
}

/** Resolves true when the user confirms, false on cancel or dismissal. */
export function confirm(
  title: string,
  message?: string,
  { confirmText, cancelText, destructive }: ConfirmOptions = {},
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    showAlert(
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
