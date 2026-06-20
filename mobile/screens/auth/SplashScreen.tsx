/**
 * JChat 3.0 — Splash Screen (Task 1.1)
 * Dark animated city-map background, logo + wordmark, loading dots.
 * Auto-navigates to Welcome after 2.5 s. No user interaction required.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Rect,
  Line,
  Circle,
  Defs,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { IconMapPin } from '@tabler/icons-react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { palette } from '../../theme/tokens';
import type { AuthStackParamList } from '../../navigation/AppNavigator';

// ---------------------------------------------------------------------------
// Design-System splash colors — sourced from JCHAT_3.0_DESIGN_SYSTEM.docx
// These hexes are intentionally NOT in the shared token palette because they
// are exclusive to this full-bleed dark splash canvas.
// ---------------------------------------------------------------------------
const SPLASH_COLORS = {
  /** Main canvas — deeper than bgBase to feel truly cinematic */
  canvasBg: '#060810',
  /** Top gradient stop — same as canvas */
  gradientTop: '#060810',
  /** Mid gradient stop — dark navy with a touch of blue */
  gradientMid: '#080d1a',
  /** Bottom gradient stop — slight purple tint */
  gradientBottom: '#0a0814',
  /** City map block fill */
  mapBlock: '#0d1120',
  /** City map road fill */
  mapRoad: '#111827',
  /** Map heatmap — warm zone (brand-tinted) */
  heatA: 'rgba(92,124,250,0.18)',  // brand tint
  /** Map heatmap — secondary zone (purple tint) */
  heatB: 'rgba(124,58,237,0.12)', // brandPurple tint
  /** Map heatmap — accent zone (success tint) */
  heatC: 'rgba(29,158,117,0.10)', // success tint
  /** Subtle map-pin color on the map layer */
  mapPinDim: 'rgba(92,124,250,0.45)',
} as const;

// ---------------------------------------------------------------------------
// Navigation type
// ---------------------------------------------------------------------------
type SplashNav = NativeStackNavigationProp<AuthStackParamList, 'Splash'>;

// ---------------------------------------------------------------------------
// City-map SVG — static schematic of streets + blocks + heatmap blobs
// Keeps render cost low: one SVG, no canvas, no WebGL.
// ---------------------------------------------------------------------------
const { width: SW, height: SH } = Dimensions.get('window');

function CityMapSvg({ opacity }: { opacity: Animated.Value }) {
  // Build a simple grid of city blocks
  const blockSize = 52;
  const gapH = 14; // horizontal road width
  const gapV = 18; // vertical road width

  const cols = Math.ceil(SW / (blockSize + gapH)) + 2;
  const rows = Math.ceil(SH / (blockSize + gapV)) + 2;

  const blocks: { x: number; y: number; w: number; h: number }[] = [];
  const offsetX = -gapH;
  const offsetY = -gapV;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Vary block sizes slightly so it looks organic
      const vary = ((r * cols + c) % 5) * 4;
      blocks.push({
        x: offsetX + c * (blockSize + gapH),
        y: offsetY + r * (blockSize + gapV),
        w: blockSize + vary,
        h: blockSize + ((vary + 8) % 20),
      });
    }
  }

  // A handful of dim map-pins scattered across the map
  const pins = [
    { cx: SW * 0.22, cy: SH * 0.28 },
    { cx: SW * 0.68, cy: SH * 0.35 },
    { cx: SW * 0.45, cy: SH * 0.55 },
    { cx: SW * 0.15, cy: SH * 0.62 },
    { cx: SW * 0.80, cy: SH * 0.70 },
    { cx: SW * 0.55, cy: SH * 0.18 },
  ];

  // We wrap in an Animated.View because react-native-svg Animated support
  // requires wrapping the whole SVG node — simpler & compatible across SDKs.
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
      <Svg width={SW} height={SH} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* Heatmap radial gradients */}
          <RadialGradient id="heatA" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={SPLASH_COLORS.heatA} stopOpacity="1" />
            <Stop offset="100%" stopColor={SPLASH_COLORS.heatA} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="heatB" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={SPLASH_COLORS.heatB} stopOpacity="1" />
            <Stop offset="100%" stopColor={SPLASH_COLORS.heatB} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="heatC" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={SPLASH_COLORS.heatC} stopOpacity="1" />
            <Stop offset="100%" stopColor={SPLASH_COLORS.heatC} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* City blocks */}
        {blocks.map((b, i) => (
          <Rect
            key={i}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            fill={SPLASH_COLORS.mapBlock}
            rx={2}
          />
        ))}

        {/* Horizontal roads — lines between row groups */}
        {Array.from({ length: rows }).map((_, r) => {
          const y = offsetY + r * (blockSize + gapV) + blockSize;
          return (
            <Line
              key={`hr-${r}`}
              x1={0}
              y1={y + gapV / 2}
              x2={SW}
              y2={y + gapV / 2}
              stroke={SPLASH_COLORS.mapRoad}
              strokeWidth={gapV}
            />
          );
        })}

        {/* Vertical roads — lines between column groups */}
        {Array.from({ length: cols }).map((_, c) => {
          const x = offsetX + c * (blockSize + gapH) + blockSize;
          return (
            <Line
              key={`vr-${c}`}
              x1={x + gapH / 2}
              y1={0}
              x2={x + gapH / 2}
              y2={SH}
              stroke={SPLASH_COLORS.mapRoad}
              strokeWidth={gapH}
            />
          );
        })}

        {/* Heatmap blobs */}
        <Rect
          x={SW * 0.1}
          y={SH * 0.2}
          width={SW * 0.45}
          height={SH * 0.3}
          fill="url(#heatA)"
        />
        <Rect
          x={SW * 0.5}
          y={SH * 0.45}
          width={SW * 0.5}
          height={SH * 0.35}
          fill="url(#heatB)"
        />
        <Rect
          x={SW * 0.05}
          y={SH * 0.6}
          width={SW * 0.4}
          height={SH * 0.25}
          fill="url(#heatC)"
        />

        {/* Dim map pins */}
        {pins.map((p, i) => (
          <Circle
            key={`pin-${i}`}
            cx={p.cx}
            cy={p.cy}
            r={4}
            fill={SPLASH_COLORS.mapPinDim}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Loading dots — three dots that pulse in sequence
// ---------------------------------------------------------------------------
function LoadingDots() {
  const dot1 = useRef(new Animated.Value(0.2)).current;
  const dot2 = useRef(new Animated.Value(0.2)).current;
  const dot3 = useRef(new Animated.Value(0.2)).current;

  useEffect(() => {
    const pulse = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0.2,
            duration: 400,
            useNativeDriver: true,
          }),
          // hold to keep cycle aligned across all three dots
          Animated.delay(400),
        ]),
      );

    const a1 = pulse(dot1, 0);
    const a2 = pulse(dot2, 267);
    const a3 = pulse(dot3, 534);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.dotsRow}>
      {([dot1, dot2, dot3] as Animated.Value[]).map((d, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, { opacity: d, backgroundColor: palette.brand }]}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function SplashScreen() {
  const navigation = useNavigation<SplashNav>();

  // Map subtle fade-in animation
  const mapOpacity = useRef(new Animated.Value(0)).current;
  // Logo + content fade-in
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Fade in the city map first
    Animated.timing(mapOpacity, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    // 2. Then reveal content shortly after
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 500,
      delay: 300,
      useNativeDriver: true,
    }).start();

    // 3. Navigate to Welcome after 2.5 s
    const timer = setTimeout(() => {
      navigation.replace('Welcome');
    }, 2500);

    return () => clearTimeout(timer);
  }, [navigation, mapOpacity, contentOpacity]);

  return (
    <View style={styles.canvas}>
      {/* Base background */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: SPLASH_COLORS.canvasBg }]} />

      {/* City-map SVG layer */}
      <CityMapSvg opacity={mapOpacity} />

      {/* Dark gradient overlay — dims map so content reads clearly */}
      <LinearGradient
        colors={[
          SPLASH_COLORS.gradientTop,
          'transparent',
          SPLASH_COLORS.gradientMid,
          SPLASH_COLORS.gradientBottom,
        ]}
        locations={[0, 0.3, 0.7, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Centered content */}
      <Animated.View style={[styles.center, { opacity: contentOpacity }]}>
        {/* Logo mark — brand-color rounded square with a map pin icon */}
        <View style={styles.logoSquare}>
          <IconMapPin
            size={36}
            color={palette.bgBase}
            strokeWidth={2.2}
          />
        </View>

        {/* Wordmark */}
        {/* TODO(i18n): localize "JChat" if brand name changes per locale */}
        <Text style={styles.wordmark}>JChat</Text>

        {/* Tagline */}
        {/* TODO(i18n): localize tagline */}
        <Text style={styles.tagline}>WHERE YOU ARE</Text>

        {/* Loading dots */}
        <LoadingDots />
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    backgroundColor: SPLASH_COLORS.canvasBg,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: Platform.OS === 'ios' ? 40 : 0,
  },

  // 72×72 brand-color rounded square (r=20 per spec)
  logoSquare: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: palette.brand,
    alignItems: 'center',
    justifyContent: 'center',
    // Subtle glow using shadow — gives depth against the dark map
    shadowColor: palette.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 12, // Android fallback
  },

  wordmark: {
    marginTop: 20,
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1,
    color: palette.textPrimary,
  },

  tagline: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 4,
    color: palette.textTertiary,
    textTransform: 'uppercase',
  },

  dotsRow: {
    flexDirection: 'row',
    marginTop: 48,
    gap: 8,
    alignItems: 'center',
  },

  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});
