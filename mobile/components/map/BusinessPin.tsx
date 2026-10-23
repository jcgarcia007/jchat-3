/**
 * JChat 3.0 — BusinessPin (Task 4.2, name-pill design)
 * Source of truth: JCHAT_3.0_DEV_PLAN.docx · Task 4.2
 *                  JCHAT_3.0_DESIGN_SYSTEM.docx · Section 12 (Map)
 *
 * A react-native-maps Marker drawing the venue as a name pill:
 *   - the pill (32 px high, radius 16, soft shadow): a 24 px circle with the category icon on the activity colour
 *     (palette.heatCool / Mild / Warm / Hot), the venue name (13 px, weight 800, at most 18 characters) and " · N"
 *     with the people in the chat (hidden when nobody), and an 8 px triangular tail pointing at the place;
 *   - the top activity level: a dark pill with a soft halo of the hot colour; every other level: a light pill;
 *   - closed: a smaller grey pill (28 px) reading "{name} · closed", no number;
 *   - iOS (PIN_SHOWS_LOGO): above the pill the venue's logo in a 44–52 px circle with a 3 px white border and a ring in
 *     the activity colour, joined to the pill by a 2 × 8 px stem. No logo → no circle, only the pill. Android: only
 *     the pill (an image does not make it into the marker bitmap there; see pinLogoSupport.android.ts);
 *   - mode 'dot': when pills would cover each other the pin is a 14 px dot of its activity colour
 *     (utils/pinCollision.ts decides; MapScreen recomputes it when the map stops moving).
 * What it shows is decided in utils/mapPin.ts and utils/pinCollision.ts, which have their own tests.
 *
 * Android performance: a Marker freezes its view after the first frame (tracksViewChanges={false}). The pin tracks
 * changes only until its logo has loaded (or failed, or a ceiling passes) and again, briefly, when what it draws
 * changes; then it goes back to false so the map does not keep re-rendering every marker.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { PIN_SHOWS_LOGO } from './pinLogoSupport';
import { palette } from '../../theme/tokens';
import { CATEGORY_ICONS } from './pinAppearance';
import {
  counterLabel,
  heatLevel,
  isMuted,
  pillName,
  pinCategory,
  type HeatLevel,
} from '../../utils/mapPin';
import {
  CLOSED_PILL_HEIGHT,
  DOT_SIZE,
  LOGO_RING,
  PILL_HEIGHT,
  PILL_STEM,
  PILL_TAIL,
  logoDiameter,
  type PinMode,
} from '../../utils/pinCollision';

// ── Types ─────────────────────────────────────────────────────────────────────

export type { HeatLevel };

export interface BusinessPinBusiness {
  /** Unique business identifier. */
  id: string;
  /** Business name — shown in the pill and in the accessibility label. */
  name?: string;
  /** Latitude coordinate. */
  lat: number;
  /** Longitude coordinate. */
  lng: number;
  /** Kept for callers that still pass it; the pin no longer draws the emoji. */
  icon_emoji?: string;
  /** businesses.logo_url — the logo shown above the pill on iOS (preferred). */
  logo_url?: string | null;
  /** businesses.icon_url — the icon the owner uploaded; the logo when there is no logo_url. */
  icon_url?: string | null;
  /** businesses.category (free text chosen at registration): picks the pill's icon. */
  category?: string | null;
  /** Approval status. A 'pending' venue is not drawn (the map only loads verified ones, this is a second guard). */
  status: string;
  /** The venue is closed right now (from its hours): grey pill. */
  closed?: boolean;
  /** Number of users currently active in this business's chat room(s). */
  activeCount: number;
}

export interface BusinessPinProps {
  business: BusinessPinBusiness;
  /** 'pill' (default) or the 14 px 'dot' MapScreen picks when pills would cover each other. */
  mode?: PinMode;
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

/** Closed: neutral grey, distinct from every heat colour. */
const MUTED_COLOR = palette.textTertiary;

// ── Layout constants ──────────────────────────────────────────────────────────

/** Room at the sides for the soft shadow and the halo. */
const SIDE_PAD = 6;
const HALO_EXTRA = 4;
/** Tracking ceiling while a logo loads, and the short window after a change in what the pin draws. */
const TRACKING_IMAGE_MS = 4000;
const TRACKING_CHANGE_MS = 400;
const LOGO_BORDER = 3;

// ── Component ─────────────────────────────────────────────────────────────────

export default function BusinessPin({ business, mode = 'pill', onPress }: BusinessPinProps) {
  const { t } = useTranslation('map');
  const count = Math.max(0, business.activeCount);
  const level = heatLevel(count);
  const closed = isMuted(business.status, business.closed);
  const hot = !closed && level === 'hot';
  const accent = closed ? MUTED_COLOR : HEAT_COLORS[level];
  const isDot = mode === 'dot';

  // iOS draws the venue logo above the pill; Android has none (see pinLogoSupport.android.ts).
  const imageUrl = PIN_SHOWS_LOGO ? business.logo_url || business.icon_url || null : null;
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [imageUrl]); // a new url gets its own chance
  const showLogo = !isDot && !!imageUrl && !imageFailed;

  const CategoryIcon = CATEGORY_ICONS[pinCategory(business.category)];
  const name = pillName(business.name);
  const countText = !closed && count > 0 ? ` · ${counterLabel(count)}` : '';

  // tracksViewChanges: true until the logo has loaded (or failed / the ceiling), and briefly when the pin changes.
  const signature = `${mode}|${closed}|${level}|${showLogo}|${countText}|${name}`;
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), showLogo ? TRACKING_IMAGE_MS : TRACKING_CHANGE_MS);
    return () => clearTimeout(timer);
  }, [signature, showLogo]);
  const settle = () => setTracking(false);

  // A pending venue is not drawn (after the hooks, so their order never changes).
  if (business.status === 'pending') return null;

  const accessibilityLabel = t('businessPin.a11y', {
    name: business.name ?? '',
    count,
    state: t(closed ? 'businessPin.stateClosed' : 'businessPin.stateOpen'),
  });

  if (isDot) {
    return (
      <Marker
        coordinate={{ latitude: business.lat, longitude: business.lng }}
        anchor={{ x: 0.5, y: 0.5 }}
        onPress={() => onPress(business)}
        tracksViewChanges={tracking}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        testID={`map-pin-${business.id}`}
      >
        <View style={styles.dotWrap}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
        </View>
      </Marker>
    );
  }

  const pillHeight = closed ? CLOSED_PILL_HEIGHT : PILL_HEIGHT;
  const circleSize = closed ? 20 : 24;
  const pillBackground = closed ? palette.bgElevatedLight : hot ? palette.bgSurface : palette.bgSurfaceLight;
  const textColor = closed ? palette.textTertiary : hot ? palette.onImage : palette.textPrimaryLight;
  // Dark icon on the light heat colours (green / yellow / orange), white on red and on grey.
  const iconColor = !closed && level !== 'hot' ? palette.bgBase : palette.onBrand;
  const logoSize = logoDiameter(count);
  const logoBlock = showLogo ? logoSize + LOGO_RING * 2 + PILL_STEM : 0;
  const height = logoBlock + pillHeight + PILL_TAIL;
  const label = closed ? t('businessPin.closedPill', { name }) : `${name}${countText}`;

  return (
    <Marker
      coordinate={{ latitude: business.lat, longitude: business.lng }}
      // The coordinate is the tip of the tail: the bottom centre of the pin.
      anchor={{ x: 0.5, y: 1 }}
      calloutAnchor={{ x: 0.5, y: 0 }}
      onPress={() => onPress(business)}
      tracksViewChanges={tracking}
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={`map-pin-${business.id}`}
    >
      <View style={[styles.root, { height, paddingHorizontal: SIDE_PAD }]}>
        {/* iOS: the logo in its ring, joined to the pill by a stem */}
        {showLogo ? (
          <>
            <View
              style={[
                styles.logoRing,
                {
                  width: logoSize + LOGO_RING * 2,
                  height: logoSize + LOGO_RING * 2,
                  borderRadius: (logoSize + LOGO_RING * 2) / 2,
                  borderColor: accent,
                },
              ]}
            >
              <View style={[styles.logoCircle, { width: logoSize, height: logoSize, borderRadius: logoSize / 2 }]}>
                <Image
                  source={{ uri: imageUrl as string }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  accessible={false}
                  onLoad={settle}
                  onError={() => {
                    setImageFailed(true); // no logo: only the pill
                    settle();
                  }}
                />
              </View>
            </View>
            <View style={[styles.stem, { backgroundColor: accent }]} />
          </>
        ) : null}

        {/* The pill: soft halo at the top level, category circle, name and people */}
        <View>
          {hot ? (
            <View
              style={[
                styles.halo,
                { top: -HALO_EXTRA, bottom: -HALO_EXTRA, left: -HALO_EXTRA, right: -HALO_EXTRA, borderRadius: pillHeight / 2 + HALO_EXTRA, backgroundColor: accent },
              ]}
            />
          ) : null}
          <View style={[styles.pill, { height: pillHeight, borderRadius: pillHeight / 2, backgroundColor: pillBackground }]}>
            <View style={[styles.categoryCircle, { width: circleSize, height: circleSize, borderRadius: circleSize / 2, backgroundColor: accent }]}>
              <CategoryIcon size={closed ? 12 : 14} color={iconColor} strokeWidth={2.2} />
            </View>
            <Text style={[styles.pillText, { color: textColor, fontSize: closed ? 12 : 13 }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        </View>

        {/* Tail */}
        <View style={[styles.tail, { borderTopColor: pillBackground }]} />
      </View>
    </Marker>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { alignItems: 'center' },
  halo: { position: 'absolute', opacity: 0.28 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
    paddingRight: 10,
    gap: 6,
    // Soft shadow so the pill lifts off the map
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  categoryCircle: { alignItems: 'center', justifyContent: 'center' },
  pillText: { fontWeight: '800', letterSpacing: -0.1 },
  tail: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: PILL_TAIL,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  logoRing: {
    borderWidth: LOGO_RING,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.bgSurfaceLight,
  },
  logoCircle: {
    borderWidth: LOGO_BORDER,
    borderColor: palette.bgSurfaceLight, // white
    overflow: 'hidden',
    backgroundColor: palette.bgSurfaceLight,
  },
  stem: { width: 2, height: PILL_STEM },
  dotWrap: { padding: 2 },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2,
    borderColor: palette.bgSurfaceLight,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
});

// ── Exports ───────────────────────────────────────────────────────────────────

export { heatLevel };
