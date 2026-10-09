/**
 * JChat 3.0 — Fullscreen single-image viewer (DMs, venue chat).
 *
 * Replaces react-native-image-viewing, which has no tap-outside-to-close, caps zoom at 2x and cannot report load errors.
 *
 *  - black background, status bar hidden, image fitted with "contain"
 *  - pinch 1x–4x centred on the pinch point; one-finger drag while zoomed, clamped to the image edges
 *  - double tap toggles 1x ↔ 2.5x at the tapped point
 *  - single tap OUTSIDE the image rectangle at 1x closes (it waits for the double tap to fail); a tap ON the image does nothing
 *  - drag down at 1x closes: the image follows the finger and the background fades; below the threshold it springs back
 *  - X button (top-left, safe-area aware), loading indicator and a translated error message
 *
 * The Modal hosts its own GestureHandlerRootView: gestures do not work inside an Android Modal without one.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconX } from '@tabler/icons-react-native';

import { palette } from '../theme/tokens';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const ZOOMED_EPSILON = 1.01;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

/** Largest translation that keeps the scaled image covering the screen edges (0 when it is smaller than the screen). */
function maxOffset(display: number, scale: number, box: number): number {
  'worklet';
  return Math.max(0, (display * scale - box) / 2);
}

interface ImageViewerModalProps {
  visible: boolean;
  /** Image to show (a signed URL for private media). */
  uri: string | null;
  onClose: () => void;
}

export function ImageViewerModal({ visible, uri, onClose }: ImageViewerModalProps) {
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();

  const [box, setBox] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // Rendered ("contain") size of the image at 1x.
  const fit = natural && box.w > 0 && box.h > 0 ? Math.min(box.w / natural.w, box.h / natural.h) : 0;
  const dispW = natural ? natural.w * fit : 0;
  const dispH = natural ? natural.h * fit : 0;

  // Gesture state lives on the UI thread.
  const boxW = useSharedValue(0);
  const boxH = useSharedValue(0);
  const imgW = useSharedValue(0);
  const imgH = useSharedValue(0);
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const drag = useSharedValue(0);
  const pinchStartScale = useSharedValue(1);
  const pinchStartTx = useSharedValue(0);
  const pinchStartTy = useSharedValue(0);
  const pinchFocalX = useSharedValue(0);
  const pinchFocalY = useSharedValue(0);
  const panStartTx = useSharedValue(0);
  const panStartTy = useSharedValue(0);
  const dismissing = useSharedValue(false);

  useEffect(() => {
    boxW.value = box.w;
    boxH.value = box.h;
    imgW.value = dispW;
    imgH.value = dispH;
  }, [box.w, box.h, dispW, dispH, boxW, boxH, imgW, imgH]);

  // A new image (or re-opening) starts at 1x, loading.
  useEffect(() => {
    scale.value = 1;
    tx.value = 0;
    ty.value = 0;
    drag.value = 0;
    setNatural(null);
    setStatus('loading');
  }, [visible, uri, scale, tx, ty, drag]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeFromGesture = useCallback(() => onCloseRef.current(), []);

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onStart((e) => {
        pinchStartScale.value = scale.value;
        pinchStartTx.value = tx.value;
        pinchStartTy.value = ty.value;
        pinchFocalX.value = e.focalX - boxW.value / 2;
        pinchFocalY.value = e.focalY - boxH.value / 2;
      })
      .onUpdate((e) => {
        const s = clamp(pinchStartScale.value * e.scale, 1, MAX_SCALE);
        // The content point under the pinch (relative to the image centre, unscaled) stays under the fingers.
        const qx = (pinchFocalX.value - pinchStartTx.value) / pinchStartScale.value;
        const qy = (pinchFocalY.value - pinchStartTy.value) / pinchStartScale.value;
        const fx = e.focalX - boxW.value / 2;
        const fy = e.focalY - boxH.value / 2;
        const mx = maxOffset(imgW.value, s, boxW.value);
        const my = maxOffset(imgH.value, s, boxH.value);
        scale.value = s;
        tx.value = clamp(fx - qx * s, -mx, mx);
        ty.value = clamp(fy - qy * s, -my, my);
      });

    const pan = Gesture.Pan()
      .maxPointers(1)
      .minDistance(6)
      .onStart(() => {
        panStartTx.value = tx.value;
        panStartTy.value = ty.value;
        dismissing.value = scale.value <= ZOOMED_EPSILON;
      })
      .onUpdate((e) => {
        if (dismissing.value) {
          drag.value = e.translationY;
          return;
        }
        const mx = maxOffset(imgW.value, scale.value, boxW.value);
        const my = maxOffset(imgH.value, scale.value, boxH.value);
        tx.value = clamp(panStartTx.value + e.translationX, -mx, mx);
        ty.value = clamp(panStartTy.value + e.translationY, -my, my);
      })
      .onEnd((e) => {
        if (!dismissing.value) return;
        if (e.translationY > DISMISS_DISTANCE || (e.translationY > 0 && e.velocityY > DISMISS_VELOCITY)) {
          drag.value = withTiming(boxH.value, { duration: 180 }, (finished) => {
            if (finished) scheduleOnRN(closeFromGesture);
          });
        } else {
          drag.value = withSpring(0, { damping: 20, stiffness: 220 });
        }
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd((e, success) => {
        if (!success) return;
        if (scale.value > ZOOMED_EPSILON) {
          scale.value = withTiming(1, { duration: 220 });
          tx.value = withTiming(0, { duration: 220 });
          ty.value = withTiming(0, { duration: 220 });
          return;
        }
        const fx = e.x - boxW.value / 2;
        const fy = e.y - boxH.value / 2;
        const mx = maxOffset(imgW.value, DOUBLE_TAP_SCALE, boxW.value);
        const my = maxOffset(imgH.value, DOUBLE_TAP_SCALE, boxH.value);
        scale.value = withTiming(DOUBLE_TAP_SCALE, { duration: 220 });
        tx.value = withTiming(clamp(fx - fx * DOUBLE_TAP_SCALE, -mx, mx), { duration: 220 });
        ty.value = withTiming(clamp(fy - fy * DOUBLE_TAP_SCALE, -my, my), { duration: 220 });
      });

    const singleTap = Gesture.Tap().onEnd((e, success) => {
      if (!success || scale.value > ZOOMED_EPSILON) return;
      // At 1x the image is centred, so its rectangle is the centred imgW × imgH box (0 × 0 until it has loaded).
      const inside =
        Math.abs(e.x - boxW.value / 2) <= imgW.value / 2 && Math.abs(e.y - boxH.value / 2) <= imgH.value / 2;
      if (!inside) scheduleOnRN(closeFromGesture);
    });

    // The single tap only fires once the double tap has failed.
    return Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap));
  }, [
    boxH, boxW, closeFromGesture, dismissing, drag, imgH, imgW, panStartTx, panStartTy,
    pinchFocalX, pinchFocalY, pinchStartScale, pinchStartTx, pinchStartTy, scale, tx, ty,
  ]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value + drag.value }, { scale: scale.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(drag.value), [0, Math.max(boxH.value * 0.5, 1)], [1, 0], Extrapolation.CLAMP),
  }));

  const closeTop = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : insets.top || 50;

  return (
    <Modal
      visible={visible && uri != null}
      transparent
      animationType="fade"
      statusBarTranslucent
      supportedOrientations={['portrait']}
      onRequestClose={onClose}
    >
      <StatusBar hidden />
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
        <GestureDetector gesture={gesture}>
          <View
            style={styles.stage}
            collapsable={false}
            onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          >
            {uri != null ? (
              <Animated.View
                style={[{ width: natural ? dispW : box.w, height: natural ? dispH : box.h }, imageStyle]}
              >
                <Image
                  source={{ uri }}
                  style={styles.fill}
                  contentFit={natural ? 'fill' : 'contain'}
                  onLoad={(e) => {
                    setNatural({ w: e.source.width, h: e.source.height });
                    setStatus('ready');
                  }}
                  onError={() => setStatus('error')}
                />
              </Animated.View>
            ) : null}
            {status === 'loading' ? (
              <View style={styles.center} pointerEvents="none">
                <ActivityIndicator color={palette.onImage} />
              </View>
            ) : null}
            {status === 'error' ? (
              <View style={styles.center} pointerEvents="none">
                <Text style={styles.errorText}>{t('imageViewer.error')}</Text>
              </View>
            ) : null}
          </View>
        </GestureDetector>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('imageViewer.close')}
          style={[styles.close, { top: closeTop }]}
        >
          <IconX size={20} color={palette.onImage} />
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backdrop: { backgroundColor: palette.imageViewerBg },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: palette.onImageStrong, fontSize: 15, textAlign: 'center' },
  close: {
    position: 'absolute',
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.scrimMedium,
    borderWidth: 2,
    borderColor: palette.onImageFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
