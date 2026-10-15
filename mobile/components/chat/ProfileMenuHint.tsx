/**
 * JChat 3.0 — ProfileMenuHint: the first-time hint that points at the ⋯ button of the chat ("Tu perfil está aquí").
 * The screen dims, ⋯ is highlighted with a ring and a bubble below it explains where the profile lives; "Entendido"
 * (or a tap outside) closes it. A dialog for assistive tech: the focus lands on "Entendido".
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View, findNodeHandle } from 'react-native';
import { AppModal } from '../common/AppModal';
import { useTranslation } from 'react-i18next';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useAppModalFrame } from '../common/useAppModalFrame';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  visible: boolean;
  /** The ⋯ button of the top bar. */
  anchorRef: React.RefObject<View | null>;
  onDismiss: () => void;
}

const RING_PAD = 6;
const CARD_MAX_WIDTH = 320;

export function ProfileMenuHint({ visible, anchorRef, onDismiss }: Props): React.ReactElement | null {
  const c = useThemeColors();
  const { t } = useTranslation('chat');
  // AppModal draws inside the app column on a wide web screen: window coordinates (measureInWindow) are shifted by its left edge.
  const { left: frameLeft, width: windowWidth } = useAppModalFrame();
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const buttonRef = useRef<View>(null);

  const measure = useCallback(() => {
    const node = anchorRef.current;
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x, y, width, height) => setAnchor({ x: x - frameLeft, y, width, height }));
    }
  }, [anchorRef, frameLeft]);

  useEffect(() => {
    if (visible) measure();
    else setAnchor(null);
  }, [visible, measure, windowWidth, frameLeft]);

  // Focus "Entendido" once the hint is on screen.
  useEffect(() => {
    if (!visible || !anchor) return undefined;
    const timer = setTimeout(() => {
      const node = buttonRef.current as unknown as { focus?: () => void } | null;
      if (Platform.OS === 'web') node?.focus?.();
      else {
        const handle = findNodeHandle(buttonRef.current);
        if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [visible, anchor]);

  if (!visible) return null;

  const cardWidth = Math.min(CARD_MAX_WIDTH, windowWidth - 24);
  const cardTop = anchor ? anchor.y + anchor.height + RING_PAD + 14 : 120;
  const anchorCenter = anchor ? anchor.x + anchor.width / 2 : windowWidth - 30;
  const cardLeft = Math.max(12, Math.min(windowWidth - cardWidth - 12, anchorCenter + 24 - cardWidth));
  const arrowLeft = Math.max(16, Math.min(cardWidth - 32, anchorCenter - cardLeft - 8));

  return (
    <AppModal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View
        testID="profile-menu-hint"
        role="dialog"
        accessibilityViewIsModal
        accessibilityLabel={t('profileHint.title')}
        style={StyleSheet.absoluteFill}
      >
        {/* Tap outside closes. */}
        <Pressable accessible={false} style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim }]} onPress={onDismiss} accessibilityRole="none" />
        {anchor ? (
          <>
            <View
              pointerEvents="none"
              style={[
                styles.ring,
                {
                  left: anchor.x - RING_PAD,
                  top: anchor.y - RING_PAD,
                  width: anchor.width + RING_PAD * 2,
                  height: anchor.height + RING_PAD * 2,
                  borderRadius: (anchor.height + RING_PAD * 2) / 2,
                  borderColor: palette.onBrand,
                },
              ]}
            />
            <View style={[styles.card, { top: cardTop, left: cardLeft, width: cardWidth, backgroundColor: c.bgSurface }]}>
              <View style={[styles.arrow, { left: arrowLeft, backgroundColor: c.bgSurface }]} />
              <Text accessibilityRole="header" style={[styles.title, { color: c.textPrimary }]}>{t('profileHint.title')}</Text>
              <Text style={[styles.body, { color: c.textSecondary }]}>{t('profileHint.body')}</Text>
              <Pressable
                ref={buttonRef}
                testID="profile-menu-hint-ok"
                onPress={onDismiss}
                accessibilityRole="button"
                style={({ pressed }) => [styles.ok, { backgroundColor: palette.brandFill, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={[styles.okLabel, { color: palette.onBrand }]}>{t('profileHint.ok')}</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 3 },
  card: { position: 'absolute', borderRadius: 16, padding: 18, gap: 8 },
  arrow: { position: 'absolute', top: -7, width: 16, height: 16, transform: [{ rotate: '45deg' }] },
  title: { fontSize: 17, fontWeight: '800' },
  body: { fontSize: 14, lineHeight: 20 },
  ok: { marginTop: 8, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  okLabel: { fontSize: 15, fontWeight: '700' },
});
