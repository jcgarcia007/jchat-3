/**
 * JChat 3.0 — Biometric enrollment prompt (M2+)
 *
 * One-tap modal offered once after the first successful login, inviting the user
 * to turn on the biometric app-lock. Copy adapts to the device's biometric kind
 * (Face ID / fingerprint / generic). Purely presentational — the gate owns the
 * "show once" + enable logic.
 */

import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconFaceId, IconFingerprint } from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';

interface BiometricEnrollSheetProps {
  visible: boolean;
  kind: 'face' | 'fingerprint' | 'generic';
  onEnable: () => void; // usuario tocó "Activar"
  onDismiss: () => void; // usuario tocó "Ahora no"
}

export default function BiometricEnrollSheet({
  visible,
  kind,
  onEnable,
  onDismiss,
}: BiometricEnrollSheetProps) {
  const c = useThemeColors();
  const { t } = useTranslation('auth');

  const method =
    kind === 'face'
      ? t('biometricEnroll.methodFace')
      : kind === 'fingerprint'
        ? t('biometricEnroll.methodFingerprint')
        : t('biometricEnroll.methodGeneric');

  const Icon = kind === 'fingerprint' ? IconFingerprint : IconFaceId;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: c.bgSurface }]}>
          <View style={[styles.iconCircle, { backgroundColor: palette.brand }]}>
            <Icon size={32} color="#fff" strokeWidth={1.8} />
          </View>

          <Text style={[styles.title, { color: c.textPrimary }]}>
            {t('biometricEnroll.title', { method })}
          </Text>
          <Text style={[styles.body, { color: c.textSecondary }]}>
            {t('biometricEnroll.body', { method })}
          </Text>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: palette.brand }]}
            onPress={onEnable}
            accessibilityRole="button"
            accessibilityLabel={t('biometricEnroll.enable')}
          >
            <Text style={styles.primaryLabel}>{t('biometricEnroll.enable')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t('biometricEnroll.notNow')}
          >
            <Text style={[styles.secondaryLabel, { color: c.textTertiary }]}>
              {t('biometricEnroll.notNow')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 22,
  },
  primaryBtn: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtn: {
    width: '100%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  secondaryLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
});
