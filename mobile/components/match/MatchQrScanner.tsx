/**
 * JChat 3.0 — Match venue QR scanner (Fase D1)
 *
 * Full-screen camera modal (expo-camera CameraView, QR only) used to activate Match presence
 * instantly by scanning the QR displayed in the venue. Same pattern as the POS BarcodeScanner,
 * with Match's own texts. Extracts the token from `…/c/{token}` URLs (a bare token also works)
 * and hands it to onToken; anything else shows a brief "not a venue QR" hint and keeps scanning.
 *
 * Needs a dev-client/production build that includes expo-camera (not Expo Go).
 */

import React, { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { IconX } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { parseVenueQrToken } from '../../utils/venueQr';

interface MatchQrScannerProps {
  visible: boolean;
  /** A venue QR token was read. The scanner does not close itself; the parent decides. */
  onToken: (token: string) => void;
  onClose: () => void;
}

const DEBOUNCE_MS = 1500;

export function MatchQrScanner({ visible, onToken, onClose }: MatchQrScannerProps) {
  const c = useThemeColors();
  const { t } = useTranslation('match');
  const [permission, requestPermission] = useCameraPermissions();
  const [invalid, setInvalid] = useState(false);
  const lastRef = useRef<{ raw: string; ts: number } | null>(null);

  const handleScanned = useCallback(
    (result: BarcodeScanningResult) => {
      const raw = result.data?.trim();
      if (!raw) return;
      const now = Date.now();
      if (lastRef.current && lastRef.current.raw === raw && now - lastRef.current.ts < DEBOUNCE_MS) return;
      lastRef.current = { raw, ts: now };

      const token = parseVenueQrToken(raw);
      if (!token) {
        setInvalid(true);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      setInvalid(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onToken(token);
    },
    [onToken],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {!permission ? (
        <View style={[styles.center, { backgroundColor: c.bgBase }]} />
      ) : !permission.granted ? (
        <View style={[styles.center, { backgroundColor: c.bgBase }]}>
          <Text style={[styles.title, { color: c.textPrimary }]}>{t('scanner.title')}</Text>
          <Text style={[styles.message, { color: c.textSecondary }]}>{t('scanner.permissionNeeded')}</Text>
          <Pressable
            onPress={() => void requestPermission()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: c.brand, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={[styles.primaryBtnText, { color: palette.onBrand }]}>{t('scanner.grant')}</Text>
          </Pressable>
          <Pressable onPress={onClose} accessibilityRole="button" style={styles.secondaryBtn}>
            <Text style={{ color: c.textSecondary, fontSize: 15 }}>{t('scanner.close')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.camera}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleScanned}
          />
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={styles.shade} />
            <View style={styles.middleRow}>
              <View style={styles.shade} />
              <View style={[styles.frame, { borderColor: palette.onImage }]} />
              <View style={styles.shade} />
            </View>
            <View style={[styles.shade, styles.bottom]}>
              <Text style={styles.hint}>{invalid ? t('scanner.invalid') : t('scanner.hint')}</Text>
            </View>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('scanner.close')}
            hitSlop={12}
            style={styles.closeButton}
          >
            <View style={styles.closeCircle}>
              <IconX size={22} color={palette.onImage} strokeWidth={2.5} />
            </View>
          </Pressable>
        </View>
      )}
    </Modal>
  );
}

const FRAME = 240;

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  message: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  primaryBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, minHeight: 48, justifyContent: 'center' },
  primaryBtnText: { fontWeight: '700', fontSize: 16 },
  secondaryBtn: { minHeight: 44, justifyContent: 'center' },
  camera: { flex: 1, backgroundColor: palette.shadow },
  shade: { flex: 1, backgroundColor: palette.scrimMedium },
  middleRow: { flexDirection: 'row', height: FRAME },
  frame: { width: FRAME, height: FRAME, borderWidth: 3, borderRadius: 16 },
  bottom: { alignItems: 'center', paddingTop: 20, paddingHorizontal: 24 },
  hint: { color: palette.onImage, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  closeButton: { position: 'absolute', top: 56, right: 20, minWidth: 44, minHeight: 44 },
  closeCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.scrimMedium,
  },
});
