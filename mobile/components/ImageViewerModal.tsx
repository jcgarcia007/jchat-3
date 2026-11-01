/**
 * JChat 3.0 — Fullscreen image viewer (DMs, venue chat, profile avatar, post photos).
 *
 * Replaces react-native-image-viewing, which has no tap-outside-to-close, caps zoom at 2x and cannot report load errors.
 *
 *  - black background, status bar hidden, image fitted with "contain"
 *  - pinch 1x–4x centred on the pinch point; one-finger drag while zoomed, clamped to the image edges
 *  - double tap toggles 1x ↔ 2.5x at the tapped point
 *  - single tap OUTSIDE the image rectangle at 1x closes (it waits for the double tap to fail); a tap ON the image does nothing
 *  - drag down at 1x closes: the image follows the finger and the background fades; below the threshold it springs back
 *  - X button (top-left, safe-area aware), loading indicator and a translated error message
 *  - SEVERAL photos (`uris` + `initialIndex`): a one-finger horizontal drag at 1x pages between them (a strip that follows the finger, pure JS: no native
 *    pager), dots at the bottom; while a photo is zoomed the drag moves the photo, not the page; changing page puts the zoom back to 1x. A single photo
 *    (`uri`, or `uris` with one item) behaves exactly as before. `fallbackUris[i]` replaces photo i if it fails to load (e.g. the 256 px avatar when the
 *    1024 px one does not exist yet).
 *
 * The Modal hosts its own GestureHandlerRootView: gestures do not work inside an Android Modal without one.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Spinner } from './common/Spinner';
import { AppModal } from './common/AppModal';
import { Image } from 'expo-image';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconX } from '@tabler/icons-react-native';

import { palette } from '../theme/tokens';
import { clampPage, dragOffset, pageAfterRelease, panIntent, viewerImages } from '../utils/imagePager';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const ZOOMED_EPSILON = 1.01;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;
const PAGE_ANIMATION_MS = 220;
/** What a one-finger drag does, decided when it starts. */
const MODE_DISMISS = 0;
const MODE_PAGE = 1;
const MODE_ZOOMED = 2;

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

/** Largest translation that keeps the scaled image covering the screen edges (0 when it is smaller than the screen). */
function maxOffset(display: number, scale: number, box: number): number {
  'worklet';
  return Math.max(0, (display * scale - box) / 2);
}

type Natural = { w: number; h: number } | null;
type Status = 'loading' | 'ready' | 'error';
type Box = { w: number; h: number };

/** The size an image of `natural` pixels takes inside the box with "contain" (0 × 0 until it has loaded). */
function displaySize(natural: Natural, box: Box): { w: number; h: number } {
  if (!natural || box.w <= 0 || box.h <= 0) return { w: 0, h: 0 };
  const fit = Math.min(box.w / natural.w, box.h / natural.h);
  return { w: natural.w * fit, h: natural.h * fit };
}

interface ViewerPageProps {
  page: number;
  source: string;
  box: Box;
  natural: Natural;
  indexSV: SharedValue<number>;
  scale: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  drag: SharedValue<number>;
  onLoad: (page: number, width: number, height: number) => void;
  onError: (page: number) => void;
}

/** One photo of the strip. Only the CURRENT page carries the zoom / pan / drag-to-close transform. */
function ViewerPage({ page, source, box, natural, indexSV, scale, tx, ty, drag, onLoad, onError }: ViewerPageProps) {
  const size = displaySize(natural, box);
  const style = useAnimatedStyle(() => {
    const active = indexSV.value === page;
    return {
      transform: [
        { translateX: active ? tx.value : 0 },
        { translateY: active ? ty.value + drag.value : 0 },
        { scale: active ? scale.value : 1 },
      ],
    };
  });
  return (
    <View style={[styles.page, { left: page * box.w, width: box.w, height: box.h }]}>
      <Animated.View style={[{ width: natural ? size.w : box.w, height: natural ? size.h : box.h }, style]}>
        <Image
          source={{ uri: source }}
          style={styles.fill}
          contentFit={natural ? 'fill' : 'contain'}
          onLoad={(e) => onLoad(page, e.source.width, e.source.height)}
          onError={() => onError(page)}
        />
      </Animated.View>
    </View>
  );
}

interface ImageViewerModalProps {
  visible: boolean;
  /** One image to show (a signed URL for private media): the DMs and the venue chat. Same as `uris={[uri]}`. */
  uri?: string | null;
  /** Several photos to page through. Wins over `uri`. */
  uris?: readonly string[];
  /** The photo shown first (default 0). */
  initialIndex?: number;
  /** `fallbackUris[i]` is shown instead of photo i if it fails to load. */
  fallbackUris?: readonly (string | null | undefined)[];
  onClose: () => void;
}

export function ImageViewerModal({ visible, uri, uris, initialIndex = 0, fallbackUris, onClose }: ImageViewerModalProps) {
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();

  // The photos, keyed by their content so a caller that builds a new array on every render does not reset the viewer.
  const imagesKey = uris && uris.length > 0 ? uris.join('\n') : (uri ?? '');
  const images = useMemo(() => viewerImages(uris, uri), [imagesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = images.length;
  const startIndex = clampPage(initialIndex, count);

  const [box, setBox] = useState<Box>({ w: 0, h: 0 });
  const [index, setIndex] = useState(startIndex);
  const [naturals, setNaturals] = useState<Natural[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [fallbackUsed, setFallbackUsed] = useState<boolean[]>([]);

  const activeNatural = naturals[index] ?? null;
  const active = displaySize(activeNatural, box);
  const activeStatus: Status = statuses[index] ?? 'loading';

  // Gesture state lives on the UI thread.
  const boxW = useSharedValue(0);
  const boxH = useSharedValue(0);
  const imgW = useSharedValue(0);
  const imgH = useSharedValue(0);
  const indexSV = useSharedValue(startIndex);
  const strip = useSharedValue(0);
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
  const panMode = useSharedValue(MODE_DISMISS);

  useEffect(() => {
    boxW.value = box.w;
    boxH.value = box.h;
    imgW.value = active.w;
    imgH.value = active.h;
  }, [box.w, box.h, active.w, active.h, boxW, boxH, imgW, imgH]);

  // A new set of photos (or re-opening) starts at its first photo, at 1x, loading.
  useEffect(() => {
    scale.value = 1;
    tx.value = 0;
    ty.value = 0;
    drag.value = 0;
    indexSV.value = startIndex;
    setIndex(startIndex);
    setNaturals(images.map(() => null));
    setStatuses(images.map(() => 'loading'));
    setFallbackUsed(images.map(() => false));
  }, [visible, imagesKey, startIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // The strip sits on the current page; changing page puts the zoom of the photo left behind back to 1x.
  useEffect(() => {
    indexSV.value = index;
    strip.value = -index * box.w;
    scale.value = 1;
    tx.value = 0;
    ty.value = 0;
    drag.value = 0;
  }, [index, box.w, indexSV, strip, scale, tx, ty, drag]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeFromGesture = useCallback(() => onCloseRef.current(), []);
  const commitPage = useCallback((target: number) => setIndex(target), []);

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
      .onStart((e) => {
        panStartTx.value = tx.value;
        panStartTy.value = ty.value;
        // Zoomed: the drag moves the photo. At 1x: mostly horizontal → page (more than one photo), otherwise → drag down to close.
        if (scale.value > ZOOMED_EPSILON) panMode.value = MODE_ZOOMED;
        else panMode.value = panIntent(e.translationX, e.translationY, count) === 'page' ? MODE_PAGE : MODE_DISMISS;
      })
      .onUpdate((e) => {
        if (panMode.value === MODE_PAGE) {
          strip.value = -indexSV.value * boxW.value + dragOffset(e.translationX, indexSV.value, count);
          return;
        }
        if (panMode.value === MODE_DISMISS) {
          drag.value = e.translationY;
          return;
        }
        const mx = maxOffset(imgW.value, scale.value, boxW.value);
        const my = maxOffset(imgH.value, scale.value, boxH.value);
        tx.value = clamp(panStartTx.value + e.translationX, -mx, mx);
        ty.value = clamp(panStartTy.value + e.translationY, -my, my);
      })
      .onEnd((e) => {
        if (panMode.value === MODE_PAGE) {
          const current = indexSV.value;
          const target = pageAfterRelease(current, e.translationX, e.velocityX, boxW.value, count);
          strip.value = withTiming(-target * boxW.value, { duration: PAGE_ANIMATION_MS }, (finished) => {
            if (finished && target !== current) scheduleOnRN(commitPage, target);
          });
          return;
        }
        if (panMode.value !== MODE_DISMISS) return;
        if (e.translationY > DISMISS_DISTANCE || (e.translationY > 0 && e.velocityY > DISMISS_VELOCITY)) {
          drag.value = withTiming(boxH.value, { duration: 180 }, (finished) => {
            if (finished) scheduleOnRN(closeFromGesture);
          });
        } else {
          drag.value = withSpring(0, { damping: 20, stiffness: 220 });
        }
      })
      .onFinalize((_e, success) => {
        // A drag that was cancelled half way (a second finger, the system): the strip goes back to its page.
        if (!success && panMode.value === MODE_PAGE) strip.value = withTiming(-indexSV.value * boxW.value, { duration: 180 });
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
      // At 1x the current photo is centred, so its rectangle is the centred imgW × imgH box (0 × 0 until it has loaded).
      const inside =
        Math.abs(e.x - boxW.value / 2) <= imgW.value / 2 && Math.abs(e.y - boxH.value / 2) <= imgH.value / 2;
      if (!inside) scheduleOnRN(closeFromGesture);
    });

    // The single tap only fires once the double tap has failed.
    return Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap));
  }, [
    boxH, boxW, closeFromGesture, commitPage, count, drag, imgH, imgW, indexSV, panMode, panStartTx, panStartTy,
    pinchFocalX, pinchFocalY, pinchStartScale, pinchStartTx, pinchStartTy, scale, strip, tx, ty,
  ]);

  const stripStyle = useAnimatedStyle(() => ({ transform: [{ translateX: strip.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(drag.value), [0, Math.max(boxH.value * 0.5, 1)], [1, 0], Extrapolation.CLAMP),
  }));

  const onPageLoad = useCallback((page: number, width: number, height: number) => {
    setNaturals((previous) => previous.map((value, i) => (i === page ? { w: width, h: height } : value)));
    setStatuses((previous) => previous.map((value, i) => (i === page ? 'ready' : value)));
  }, []);

  const fallbackRef = useRef(fallbackUris);
  fallbackRef.current = fallbackUris;
  const fallbackUsedRef = useRef(fallbackUsed);
  fallbackUsedRef.current = fallbackUsed;
  const onPageError = useCallback((page: number) => {
    // A smaller stand-in for this photo exists and was not tried yet: use it. Otherwise it is an error.
    if (fallbackRef.current?.[page] && !fallbackUsedRef.current[page]) {
      setFallbackUsed((previous) => previous.map((value, i) => (i === page ? true : value)));
      return;
    }
    setStatuses((previous) => previous.map((value, i) => (i === page ? 'error' : value)));
  }, []);

  const closeTop = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : insets.top || 50;

  return (
    <AppModal
      visible={visible && count > 0}
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
            <Animated.View style={[styles.strip, { width: box.w * Math.max(count, 1), height: box.h }, stripStyle]}>
              {images.map((image, page) => (Math.abs(page - index) <= 1 ? (
                <ViewerPage
                  key={`${page}:${image}`}
                  page={page}
                  source={fallbackUsed[page] && fallbackUris?.[page] ? (fallbackUris[page] as string) : image}
                  box={box}
                  natural={naturals[page] ?? null}
                  indexSV={indexSV}
                  scale={scale}
                  tx={tx}
                  ty={ty}
                  drag={drag}
                  onLoad={onPageLoad}
                  onError={onPageError}
                />
              ) : null))}
            </Animated.View>
            {activeStatus === 'loading' ? (
              <View style={styles.center} pointerEvents="none">
                <Spinner color={palette.onImage} />
              </View>
            ) : null}
            {activeStatus === 'error' ? (
              <View style={styles.center} pointerEvents="none">
                <Text style={styles.errorText}>{t('imageViewer.error')}</Text>
              </View>
            ) : null}
          </View>
        </GestureDetector>
        {count > 1 ? (
          <View
            testID="image-viewer-dots"
            style={[styles.dots, { bottom: insets.bottom + 24 }]}
            pointerEvents="none"
            accessible
            accessibilityLabel={t('imageViewer.page', { current: index + 1, total: count })}
          >
            {images.map((image, page) => (
              <View key={`${page}:${image}`} style={[styles.dot, page === index ? styles.dotActive : null]} />
            ))}
          </View>
        ) : null}
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
    </AppModal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  strip: { position: 'absolute', left: 0, top: 0 },
  page: { position: 'absolute', top: 0, alignItems: 'center', justifyContent: 'center' },
  backdrop: { backgroundColor: palette.imageViewerBg },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: palette.onImageStrong, fontSize: 15, textAlign: 'center' },
  dots: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.onImageFaint },
  dotActive: { backgroundColor: palette.onImage },
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
