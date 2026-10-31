/**
 * Skeleton screens: grey "bones" that pulse softly while the FIRST load of a screen has no data yet.
 *
 *  - `Skeleton`          one bone (a View in `bgElevated`; round with `circle`). Put bones inside a `SkeletonGroup`.
 *  - `SkeletonGroup`     owns the pulse (ONE shared Animated.Value for every bone on the screen, so they beat together and it costs little) and is the
 *                        only thing a screen reader sees: one `progressbar` announcing "Loading…" once; the bones are hidden from it.
 *  - `useDelayedLoading` true only when loading has lasted >= 200 ms in a row, so a fast load never flashes a skeleton.
 *  - `useArrivalFade`    opacity for the real content: it fades in (200 ms) when it replaces a skeleton; no fade with "Reduce motion".
 *
 * Reduce motion (iOS/Android setting, and `prefers-reduced-motion` on the web through react-native-web's AccessibilityInfo): the bones stay still at a
 * fixed opacity. Only JS + the `Animated` of react-native (native driver off on the web): nothing native is added, so it ships over the air.
 */
import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useReduceMotion } from '../../hooks/useReduceMotion';
import { useThemeColors } from '../../theme/colors';
import { createDelayedFlag, type DelayedFlag } from '../../utils/delayedFlag';

/** One full pulse cycle: opacity 1 → MIN → 1. */
export const SKELETON_PULSE_MS = 1200;
export const SKELETON_MIN_OPACITY = 0.45;
/** Bones are still (no pulse) at this opacity with "Reduce motion". */
export const SKELETON_STILL_OPACITY = 0.7;
/** A load shorter than this never shows a skeleton. */
export const SKELETON_DELAY_MS = 200;
export const CONTENT_FADE_MS = 200;

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

// ── The shared pulse ───────────────────────────────────────────────────────────

const pulse = new Animated.Value(1);
let pulseUsers = 0;
let pulseLoop: Animated.CompositeAnimation | null = null;

function acquirePulse() {
  pulseUsers += 1;
  if (pulseUsers !== 1) return;
  const half = SKELETON_PULSE_MS / 2;
  pulseLoop = Animated.loop(
    Animated.sequence([
      Animated.timing(pulse, { toValue: SKELETON_MIN_OPACITY, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(pulse, { toValue: 1, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
    ]),
  );
  pulseLoop.start();
}

function releasePulse() {
  pulseUsers = Math.max(0, pulseUsers - 1);
  if (pulseUsers !== 0) return;
  pulseLoop?.stop();
  pulseLoop = null;
  pulse.setValue(1);
}

/** The opacity every bone of a group uses: the shared pulse, or a fixed value with "Reduce motion" (or until the OS has answered). */
function useSkeletonOpacity(): Animated.Value | number {
  const reduceMotion = useReduceMotion();
  const animate = reduceMotion === false;
  useEffect(() => {
    if (!animate) return undefined;
    acquirePulse();
    return releasePulse;
  }, [animate]);
  return animate ? pulse : SKELETON_STILL_OPACITY;
}

/** Bones outside a SkeletonGroup do not pulse (they stay at the still opacity). */
const SkeletonOpacityContext = createContext<Animated.Value | number>(SKELETON_STILL_OPACITY);

// ── Components ─────────────────────────────────────────────────────────────────

interface SkeletonProps {
  /** Number (points) or a percentage string. With `circle` it defaults to `height`. */
  width?: DimensionValue;
  height: number;
  /** Corner radius; default 6. Ignored with `circle`. */
  radius?: number;
  /** A circle of diameter `height`. */
  circle?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width, height, radius = 6, circle = false, style }: SkeletonProps) {
  const colors = useThemeColors();
  const opacity = useContext(SkeletonOpacityContext);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={[
        {
          backgroundColor: colors.bgElevated,
          borderRadius: circle ? height / 2 : radius,
          height,
          opacity,
          width: circle ? (width ?? height) : width,
        },
        style,
      ]}
    />
  );
}

interface SkeletonGroupProps {
  children: React.ReactNode;
  /** What a screen reader says; default "Loading…". */
  label?: string;
  /** False for a second group on the same screen: it stays hidden from screen readers so "Loading…" is announced only once. Default true. */
  announce?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Wrap ONLY bones in it: a group is a single accessible element, so anything real inside would not be reachable. */
export function SkeletonGroup({ children, label, announce = true, style, testID }: SkeletonGroupProps) {
  const { t } = useTranslation('common');
  const opacity = useSkeletonOpacity();
  return (
    <SkeletonOpacityContext.Provider value={opacity}>
      {announce ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={label ?? t('state.loading')}
          accessibilityState={{ busy: true }}
          style={style}
          testID={testID}
        >
          {children}
        </View>
      ) : (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={style} testID={testID}>
          {children}
        </View>
      )}
    </SkeletonOpacityContext.Provider>
  );
}

// ── Hooks ──────────────────────────────────────────────────────────────────────

/** True only while `loading` has lasted at least `delayMs` in a row. A load that ends sooner never shows the skeleton. */
export function useDelayedLoading(loading: boolean, delayMs: number = SKELETON_DELAY_MS): boolean {
  const [on, setOn] = useState(false);
  const flagRef = useRef<DelayedFlag | null>(null);

  useEffect(() => {
    const flag = createDelayedFlag(setOn, delayMs);
    flagRef.current = flag;
    return () => {
      flag.dispose();
      flagRef.current = null;
    };
  }, [delayMs]);

  useEffect(() => {
    flagRef.current?.set(loading);
  }, [loading, delayMs]);

  return loading && on;
}

/**
 * Opacity for a container that holds the skeleton first and the real content afterwards. It stays 1 while loading (the skeleton must be visible); when the
 * data arrives the real content fades in from 0 over 200 ms. If there was nothing to wait for (data already in memory) nothing animates. With "Reduce
 * motion" (or before the OS has answered) there is no fade. The switch to 0 runs in a layout effect so the real content never flashes at full opacity.
 */
export function useArrivalFade(loading: boolean): Animated.Value {
  const reduceMotion = useReduceMotion();
  const sawLoading = useRef(loading);
  const opacity = useRef(new Animated.Value(1)).current;

  useLayoutEffect(() => {
    if (loading) {
      sawLoading.current = true;
      opacity.setValue(1);
      return;
    }
    if (!sawLoading.current) return;
    sawLoading.current = false;
    if (reduceMotion !== false) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: CONTENT_FADE_MS, easing: Easing.out(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }).start();
  }, [loading, reduceMotion, opacity]);

  return opacity;
}

/** Wrapper that applies `useArrivalFade` to its children. */
export function ArrivalFade({ loading, style, children }: { loading: boolean; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const opacity = useArrivalFade(loading);
  // needsOffscreenAlphaCompositing: on Android, opacity < 1 would fade every child on its own, and whatever sits behind a row (SwipeToDelete's red
  // layer) would show through; compositing the group first fades it as one picture.
  return <Animated.View needsOffscreenAlphaCompositing style={[style, { opacity }]}>{children}</Animated.View>;
}
