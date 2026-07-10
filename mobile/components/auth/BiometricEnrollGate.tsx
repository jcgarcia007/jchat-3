/**
 * JChat 3.0 — Biometric enrollment gate (M2+)
 *
 * Mounted once inside the authenticated tree. After a FRESH login (justSignedIn),
 * offers the biometric app-lock enrollment prompt ONCE per device, only when:
 *   - the device can use biometrics, AND
 *   - the lock isn't already enabled, AND
 *   - we haven't prompted before.
 * Consumes the justSignedIn signal immediately so it never re-fires.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../context/AuthContext';
import {
  canUseBiometrics,
  isBiometricEnabled,
  setBiometricEnabled,
  authenticateBiometric,
  wasBiometricPrompted,
  setBiometricPrompted,
  biometricKind,
} from '../../services/biometric';
import BiometricEnrollSheet from './BiometricEnrollSheet';

export default function BiometricEnrollGate() {
  const { justSignedIn, clearJustSignedIn } = useAuth();
  const { t } = useTranslation('auth');
  const [visible, setVisible] = useState(false);
  const [kind, setKind] = useState<'face' | 'fingerprint' | 'generic'>('generic');

  useEffect(() => {
    if (!justSignedIn) return;
    let cancelled = false;
    void (async () => {
      // Consume the signal right away so it never re-triggers.
      clearJustSignedIn();
      const [available, enabled, prompted] = await Promise.all([
        canUseBiometrics(),
        isBiometricEnabled(),
        wasBiometricPrompted(),
      ]);
      if (cancelled) return;
      if (available && !enabled && !prompted) {
        setKind(await biometricKind());
        if (!cancelled) setVisible(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [justSignedIn, clearJustSignedIn]);

  const handleEnable = useCallback(async () => {
    const ok = await authenticateBiometric(t('lock.prompt'));
    if (ok) await setBiometricEnabled(true);
    await setBiometricPrompted();
    setVisible(false);
  }, [t]);

  const handleDismiss = useCallback(async () => {
    await setBiometricPrompted();
    setVisible(false);
  }, []);

  return (
    <BiometricEnrollSheet
      visible={visible}
      kind={kind}
      onEnable={() => {
        void handleEnable();
      }}
      onDismiss={() => {
        void handleDismiss();
      }}
    />
  );
}
