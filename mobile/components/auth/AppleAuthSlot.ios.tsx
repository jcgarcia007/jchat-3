/**
 * JChat 3.0 — the Apple slot on iOS: the OFFICIAL button (AppleAuthenticationButton: Apple's style and wording, light / dark
 * variants follow the system theme) and the native flow (services/appleSignIn.ios.ts). If the device cannot do native
 * Apple sign-in the screen's browser-OAuth button is shown instead.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTranslation } from 'react-i18next';

import { isNativeAppleSignInAvailable, signInWithApple } from '../../services/appleSignIn';
import { toUserMessage } from '../../utils/errors';
import type { AppleAuthSlotProps } from './AppleAuthSlot';

export function AppleAuthSlot({ fallback, mode, disabled, surface = 'theme', style, cornerRadius = 14, onError }: AppleAuthSlotProps): React.ReactElement {
  const scheme = useColorScheme();
  const { t } = useTranslation('auth');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    void isNativeAppleSignInAvailable().then((ok) => mounted && setAvailable(ok));
    return () => {
      mounted = false;
    };
  }, []);

  const press = useCallback(async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      await signInWithApple(); // success: AuthContext's onAuthStateChange takes the person in; cancel: nothing to say
    } catch (err) {
      onError(toUserMessage(err, 'auth:login.alerts.signInErrorMessage') || t('login.alerts.signInErrorMessage'));
    } finally {
      setBusy(false);
    }
  }, [busy, disabled, onError, t]);

  if (available === null) return <></>; // checking: keep the slot empty (no flash of the browser button)
  if (!available) return fallback;

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={mode === 'signUp' ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={surface === 'theme' && scheme === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={cornerRadius}
      onPress={() => void press()}
      style={[style, (busy || disabled) && { opacity: 0.6 }]}
    />
  );
}

export default AppleAuthSlot;
