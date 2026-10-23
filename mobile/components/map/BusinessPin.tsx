/**
 * JChat 3.0 — BusinessPin (Task 4.2)
 * Source of truth: JCHAT_3.0_DEV_PLAN.docx · Task 4.2
 *                  JCHAT_3.0_DESIGN_SYSTEM.docx · Section 12 (Map)
 *
 * A react-native-maps Marker drawing the "P2" pin (the teardrop with an emoji was replaced):
 *   - a circle with the venue's logo, or its two initials on a colour that is stable per venue, a 3 px white
 *     border and a soft shadow; 40 / 48 / 54 / 60 px by activity;
 *   - a small round category chip centred below it (bar, restaurant, café, club, other), its border in the
 *     activity colour;
 *   - the people counter at the top right in the heat colours (palette.heatCool / Mild / Warm / Hot), a soft halo
 *     at the top level, nothing when there is nobody;
 *   - grey (no heat colour, no halo) while the venue is closed or pending.
 * What it shows is decided in utils/mapPin.ts, which has its own tests.
 *
 * Android: the pin shows the initials, not the logo (an image does not make it into the marker bitmap there; see
 * pinLogoSupport.android.ts). iOS and web draw the logo.
 *
 * Android performance: a Marker freezes its view after the first frame (tracksViewChanges={false}). The pin tracks
 * changes only until its logo has loaded (or failed, or a ceiling passes) and again, briefly, when what it draws
 * changes; then it goes back to false so the map does not keep re-rendering every marker.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { Image } from 'expo-image';
import { PIN_SHOWS_LOGO } from './pinLogoSupport';
import { palette } from '../../theme/tokens';
import { CATEGORY_ICONS, initialsColor } from './pinAppearance';
import {
  counterLabel,
  heatLevel,
  initials,
  isMuted,
  pinCategory,
  pinSize,
  showCounter,
  showHalo,
  type HeatLevel,
} from '../../utils/mapPin';

// ── Types ─────────────────────────────────────────────────────────────────────

export type { HeatLevel };

export interface BusinessPinBusiness {
  /** Unique business identifier (also the seed of the initials colour). */
  id: string;
  /** Business name — the pin's accessibility label and the source of the initials. */
  name?: string;
  /** Latitude coordinate. */
  lat: number;
  /** Longitude coordinate. */
  lng: number;
  /** Kept for callers that still pass it; the pin no longer draws the emoji. */
  icon_emoji?: string;
  /** businesses.logo_url — the logo shown in the circle (preferred). */
  logo_url?: string | null;
  /** businesses.icon_url — the icon the owner uploaded; the logo when there is no logo_url. */
  icon_url?: string | null;
  /** businesses.category (free text chosen at registration): picks the chip icon. */
  category?: string | null;
  /**
   * Approval status. 'pending' renders the grey pin without counter.
   * Any other value renders the heat-coloured pin.
   */
  status: string;
  /** The venue is closed right now (from its hours): grey pin. */
  closed?: boolean;
  /** Number of users currently active in this business's chat room(s). */
  activeCount: number;
}

export interface BusinessPinProps {
  business: BusinessPinBusiness;
  /** Called when the marker is tapped — MapScreen mounts BusinessPreviewCard. */
  onPress: (business: BusinessPinBusiness) => void;
}

// ── Colours (tokens only) ─────────────────────────────────────────────────────

const HEAT_COLORS: Record<HeatLevel, string> = {
  cool: palette.heatCool,
  mild: palette.heatMild,
  warm: palette.heatWarm,
  hot: palette.heatHot,
};

/** Closed / pending: neutral grey, distinct from every heat colour. */
const MUTED_COLOR = palette.textTertiary;

// ── Layout constants ──────────────────────────────────────────────────────────

const BORDER = 3;
const CHIP_SIZE = 22;
/** How far the chip overlaps the bottom of the circle. */
const CHIP_OVERLAP = 7;
/** Room around the circle for the counter (top right) and the halo. */
const PAD = 10;
const HALO_EXTRA = 6;
const COUNTER_HEIGHT = 18;
/** Tracking ceiling while a logo loads, and the short window after a change in what the pin draws. */
const TRACKING_IMAGE_MS = 4000;
const TRACKING_CHANGE_MS = 400;

// ── Component ─────────────────────────────────────────────────────────────────

export default function BusinessPin({ business, onPress }: BusinessPinProps) {
  const count = Math.max(0, business.activeCount);
  const level = heatLevel(count);
  const size = pinSize(count);
  const muted = isMuted(business.status, business.closed);
  const accent = muted ? MUTED_COLOR : HEAT_COLORS[level];
  const fill = muted ? MUTED_COLOR : initialsColor(business.id);

  // Android draws the initials instead of the logo (see pinLogoSupport.android.ts).
  const imageUrl = PIN_SHOWS_LOGO ? business.logo_url || business.icon_url || null : null;
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [imageUrl]); // a new url gets its own chance
  const showImage = !!imageUrl && !imageFailed;

  const label = useMemo(() => initials(business.name), [business.name]);
  const ChipIcon = CATEGORY_ICONS[pinCategory(business.category)];
  const counterShown = showCounter(count, business.status);
  const haloShown = showHalo(count, muted);
  const counterBackground = muted ? MUTED_COLOR : HEAT_COLORS[level];
  // Dark text on the light heat colours (green / yellow / orange), white on red and on grey.
  const counterText = !muted && level !== 'hot' ? palette.bgBase : palette.onBrand;

  // tracksViewChanges: true until the logo has loaded (or failed / the ceiling), and briefly when the pin changes.
  const signature = `${size}|${muted}|${level}|${showImage}|${counterShown}|${counterLabel(count)}`;
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), showImage ? TRACKING_IMAGE_MS : TRACKING_CHANGE_MS);
    return () => clearTimeout(timer);
  }, [signature, showImage]);
  const settle = () => setTracking(false);

  const width = size + PAD * 2;
  const height = PAD + size + CHIP_SIZE - CHIP_OVERLAP + 2;
  // The coordinate is the bottom centre of the chip: the tip of the pin.
  const anchor = { x: 0.5, y: (PAD + size + CHIP_SIZE - CHIP_OVERLAP) / height };

  return (
    <Marker
      coordinate={{ latitude: business.lat, longitude: business.lng }}
      anchor={anchor}
      calloutAnchor={{ x: 0.5, y: 0 }}
      onPress={() => onPress(business)}
      tracksViewChanges={tracking}
      accessible
      accessibilityRole="button"
      accessibilityLabel={business.name || undefined}
      testID={`map-pin-${business.id}`}
    >
      <View style={{ width, height }}>
        {/* Soft halo at the top level */}
        {haloShown ? (
          <View
            style={[
              styles.halo,
              {
                left: PAD - HALO_EXTRA,
                top: PAD - HALO_EXTRA,
                width: size + HALO_EXTRA * 2,
                height: size + HALO_EXTRA * 2,
                borderRadius: (size + HALO_EXTRA * 2) / 2,
                backgroundColor: accent,
              },
            ]}
          />
        ) : null}

        {/* Logo circle: the outer view carries border + shadow, the inner one clips the image */}
        <View
          style={[
            styles.circle,
            { left: PAD, top: PAD, width: size, height: size, borderRadius: size / 2, backgroundColor: fill },
          ]}
        >
          <View style={[styles.clip, { borderRadius: size / 2 - BORDER }]}>
            {showImage ? (
              <Image
                source={{ uri: imageUrl as string }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                accessible={false}
                onLoad={settle}
                onError={() => {
                  setImageFailed(true); // back to the initials
                  settle();
                }}
              />
            ) : (
              <Text style={[styles.initials, { fontSize: Math.round(size * 0.36) }]}>{label}</Text>
            )}
          </View>
        </View>

        {/* Category chip, centred below the circle */}
        <View
          style={[
            styles.chip,
            { left: (width - CHIP_SIZE) / 2, top: PAD + size - CHIP_OVERLAP, borderColor: accent },
          ]}
        >
          <ChipIcon size={12} color={palette.textPrimaryLight} strokeWidth={2.2} />
        </View>

        {/* People counter, top right */}
        {counterShown ? (
          <View style={[styles.counter, { backgroundColor: counterBackground }]}>
            <Text style={[styles.counterText, { color: counterText }]}>{counterLabel(count)}</Text>
          </View>
        ) : null}
      </View>
    </Marker>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  halo: { position: 'absolute', opacity: 0.28 },
  circle: {
    position: 'absolute',
    borderWidth: BORDER,
    borderColor: palette.bgSurfaceLight, // white
    // Soft shadow so the pin lifts off the map
    shadowColor: palette.bgBase,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  clip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: palette.onBrand,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  chip: {
    position: 'absolute',
    width: CHIP_SIZE,
    height: CHIP_SIZE,
    borderRadius: CHIP_SIZE / 2,
    borderWidth: 2,
    backgroundColor: palette.bgSurfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.bgBase,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 6,
  },
  counter: {
    position: 'absolute',
    top: PAD - COUNTER_HEIGHT / 2,
    right: PAD - COUNTER_HEIGHT / 2,
    minWidth: COUNTER_HEIGHT,
    height: COUNTER_HEIGHT,
    borderRadius: COUNTER_HEIGHT / 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: palette.bgSurfaceLight,
    elevation: 7,
  },
  counterText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});

// ── Exports ───────────────────────────────────────────────────────────────────

export { heatLevel, pinSize };
