/**
 * JChat 3.0 — POS BarcodeScanner
 *
 * Full-screen camera overlay for scanning UPC-A, EAN-13, EAN-8, and Code 128
 * barcodes in the inventory workflow. Renders a guide frame and fires onScanned
 * with the raw barcode string.
 *
 * Features:
 *  - Runtime camera permission request via useCameraPermissions (expo-camera SDK 56)
 *  - 1.5s same-code debounce so picking up the same item doesn't re-fire
 *  - Haptic vibration on each successful scan (expo-haptics)
 *  - Close button in the top-right corner
 *
 * ⚠️ EAS dev-build required: expo-camera is a native module and will NOT work
 * in Expo Go. Run `eas build --profile development` to get a build that includes it.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { BarcodeScanningResult, BarcodeType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { IconX } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BarcodeScannerProps {
  /** Called once per distinct code; subsequent identical codes are debounced for 1.5 s. */
  onScanned: (code: string) => void;
  /** Called when the user taps the close button. */
  onClose: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 1500;

// Barcode types supported by the POS inventory workflow
const BARCODE_TYPES: BarcodeType[] = ['upc_a', 'ean13', 'ean8', 'code128'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function BarcodeScanner({
  onScanned,
  onClose,
}: BarcodeScannerProps): React.ReactElement {
  const c = useThemeColors();
  const { t } = useTranslation('inventory');
  const [permission, requestPermission] = useCameraPermissions();

  // Last scanned code + timestamp for debounce
  const lastCodeRef = useRef<{ code: string; ts: number } | null>(null);

  // Local state to show a brief flash label after each scan
  const [lastScan, setLastScan] = useState<string | null>(null);

  const handleScanned = useCallback(
    (result: BarcodeScanningResult) => {
      const code = result.data?.trim();
      if (!code) return;

      const now = Date.now();
      const last = lastCodeRef.current;
      if (last && last.code === code && now - last.ts < DEBOUNCE_MS) return;

      lastCodeRef.current = { code, ts: now };
      setLastScan(code);

      // Vibrate feedback
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      onScanned(code);
    },
    [onScanned],
  );

  // ── No permission yet ─────────────────────────────────────────────────────
  if (!permission) {
    // Permissions still loading — render nothing to avoid flash
    return <View style={styles.blank} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: c.bgBase }]}>
        <Text style={[styles.permissionTitle, { color: c.textPrimary }]}>
          {t('scanner.permissionTitle')}
        </Text>
        <Text style={[styles.permissionMsg, { color: c.textSecondary }]}>
          {t('scanner.permissionMsg')}
        </Text>
        <Pressable
          onPress={() => void requestPermission()}
          style={({ pressed }) => [
            styles.permissionBtn,
            { backgroundColor: c.brand, opacity: pressed ? 0.8 : 1 },
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.permissionBtnText}>{t('scanner.permissionGrant')}</Text>
        </Pressable>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.permissionDismiss, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
        >
          <Text style={[styles.permissionDismissText, { color: c.textTertiary }]}>
            {t('scanner.permissionDeny')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ── Camera view ───────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <CameraView
        style={[StyleSheet.absoluteFill]}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: BARCODE_TYPES,
        }}
        onBarcodeScanned={handleScanned}
      />

      {/* Darkened overlay with centre cutout — pure UI, doesn't affect scanner */}
      <View style={styles.overlay}>
        {/* Top bar */}
        <View style={styles.overlayDark} />

        {/* Middle row: side darken + guide frame + side darken */}
        <View style={styles.middleRow}>
          <View style={styles.sideShade} />
          <View style={styles.guideFrame}>
            {/* Corner marks */}
            <View style={[styles.corner, styles.cornerTL, { borderColor: '#fff' }]} />
            <View style={[styles.corner, styles.cornerTR, { borderColor: '#fff' }]} />
            <View style={[styles.corner, styles.cornerBL, { borderColor: '#fff' }]} />
            <View style={[styles.corner, styles.cornerBR, { borderColor: '#fff' }]} />
          </View>
          <View style={styles.sideShade} />
        </View>

        {/* Bottom section with guide text */}
        <View style={[styles.overlayDark, styles.bottomSection]}>
          <Text style={styles.guideText}>{t('scanner.guide')}</Text>
          {lastScan ? (
            <Text style={styles.scanFlash}>{lastScan}</Text>
          ) : null}
        </View>
      </View>

      {/* Close button */}
      <Pressable
        onPress={onClose}
        style={({ pressed }) => [
          styles.closeButton,
          { opacity: pressed ? 0.7 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('scanner.close')}
        hitSlop={12}
      >
        <View style={styles.closeCircle}>
          <IconX size={22} color="#fff" strokeWidth={2.5} />
        </View>
      </Pressable>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const GUIDE_W = 260;
const GUIDE_H = 140;
const CORNER_SIZE = 22;
const CORNER_W = 3;

const styles = StyleSheet.create({
  blank: { flex: 1 },

  // ── Permission screens ───────────────────────────────────────────────────────
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  permissionTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  permissionMsg: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  permissionBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  permissionBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  permissionDismiss: { paddingVertical: 8 },
  permissionDismissText: { fontSize: 15 },

  // ── Camera container ─────────────────────────────────────────────────────────
  container: { flex: 1, backgroundColor: '#000' },

  // ── Overlay ──────────────────────────────────────────────────────────────────
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  overlayDark: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)' },

  middleRow: {
    flexDirection: 'row',
    height: GUIDE_H,
  },
  sideShade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)' },

  guideFrame: {
    width: GUIDE_W,
    height: GUIDE_H,
    // transparent centre
  },

  bottomSection: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 20,
    gap: 10,
  },
  guideText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  scanFlash: {
    color: '#5C7CFA',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // ── Corner marks ─────────────────────────────────────────────────────────────
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderWidth: CORNER_W,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },

  // ── Close button ─────────────────────────────────────────────────────────────
  closeButton: {
    position: 'absolute',
    top: 52,
    right: 20,
  },
  closeCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
