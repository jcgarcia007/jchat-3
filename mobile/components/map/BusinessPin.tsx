/**
 * JChat 3.0 — BusinessPin (Task 4.2)
 * Source of truth: JCHAT_3.0_DEV_PLAN.docx · Task 4.2
 *                  JCHAT_3.0_DESIGN_SYSTEM.docx · Section 12 (Map)
 *
 * A react-native-maps Marker with a custom teardrop view.
 *
 * Teardrop shape (RN equivalents of CSS `border-radius: 50% 50% 50% 0`):
 *   - borderTopLeftRadius / borderTopRightRadius / borderBottomRightRadius = size / 2
 *   - borderBottomLeftRadius = 0
 *   - transform: [{ rotate: '-45deg' }]  (points down-left like a classic map pin)
 *   - Inner emoji counter-rotated +45deg so it reads upright.
 *
 * Size tiers (by activeCount):
 *   small   < 5      36 × 36
 *   medium  5–19     44 × 44
 *   large   20–49    52 × 52
 *   featured ≥ 50    62 × 62
 *
 * Color tiers (by activeCount → heat level → palette.heat*):
 *   heatCool  count < 5   (palette.heatCool  #34C759)
 *   heatMild  5–19        (palette.heatMild  #FFCC00)
 *   heatWarm  20–49       (palette.heatWarm  #FF9500)
 *   heatHot   ≥ 50        (palette.heatHot   #FF3B30)
 *
 * Pending businesses: grey teardrop + "Pending" badge, no heat color.
 *
 * // TODO(i18n): replace English strings with translation keys
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { palette } from '../../theme/tokens';

// ── Types ─────────────────────────────────────────────────────────────────────

export type HeatLevel = 'cool' | 'mild' | 'warm' | 'hot';

export interface BusinessPinBusiness {
  /** Unique business identifier. */
  id: string;
  /** Latitude coordinate. */
  lat: number;
  /** Longitude coordinate. */
  lng: number;
  /** Single emoji representing the business category / brand. */
  icon_emoji: string;
  /**
   * Approval status.
   * 'pending' renders a distinct grey teardrop with a Pending badge.
   * Any other value (e.g. 'active', 'approved') renders the heat-colored pin.
   */
  status: string;
  /** Number of users currently active in this business's chat room(s). */
  activeCount: number;
}

export interface BusinessPinProps {
  business: BusinessPinBusiness;
  /** Called when the marker is tapped — MapScreen mounts BusinessPreviewCard. */
  onPress: (business: BusinessPinBusiness) => void;
}

// ── Size tiers ────────────────────────────────────────────────────────────────

interface SizeTier {
  /** Outer teardrop box (square before rotation). */
  boxSize: number;
  /** Emoji font size. */
  emojiSize: number;
  /** Badge pill dimensions. */
  badgeFontSize: number;
  badgePadH: number;
  badgePadV: number;
}

function getSizeTier(count: number): SizeTier {
  if (count < 5) {
    return { boxSize: 36, emojiSize: 14, badgeFontSize: 7, badgePadH: 3, badgePadV: 1 };
  }
  if (count < 20) {
    return { boxSize: 44, emojiSize: 18, badgeFontSize: 7, badgePadH: 3, badgePadV: 1 };
  }
  if (count < 50) {
    return { boxSize: 52, emojiSize: 22, badgeFontSize: 7, badgePadH: 3, badgePadV: 1 };
  }
  return { boxSize: 62, emojiSize: 26, badgeFontSize: 7, badgePadH: 3, badgePadV: 1 };
}

// ── Color / heat level mapping ────────────────────────────────────────────────

/**
 * Maps an active-user count to a heat level name, then to the exact
 * palette token color. Uses palette.heat* — NO hardcoded hex.
 */
function getHeatColor(count: number): string {
  if (count >= 50) return palette.heatHot;    // #FF3B30 — featured
  if (count >= 20) return palette.heatWarm;   // #FF9500 — large
  if (count >= 5)  return palette.heatMild;   // #FFCC00 — medium
  return palette.heatCool;                    // #34C759 — small / quiet
}

function getHeatLevel(count: number): HeatLevel {
  if (count >= 50) return 'hot';
  if (count >= 20) return 'warm';
  if (count >= 5)  return 'mild';
  return 'cool';
}

// ── Teardrop anchor ──────────────────────────────────────────────────────────
//
// react-native-maps uses "anchor" to align the pin to the coordinate:
//   { x: 0.5, y: 1 } = bottom center (default balloon)
// After -45deg rotation the visual tip of our teardrop is the bottom-left
// corner of the box. We compensate with a slight offset so the coordinate
// stays at the visual tip.
//
// The teardrop rotated -45deg: its bottom-left corner (borderBottomLeftRadius=0)
// becomes the lowest visual point. Anchor (0.25, 0.75) places the callout
// close enough to the pin tip without MapView jitter.
const TEARDROP_ANCHOR = { x: 0.25, y: 0.75 };
const TEARDROP_CALL_ANCHOR = { x: 0.5, y: 0 };

// ── Pending color ──────────────────────────────────────────────────────────
const PENDING_COLOR = palette.textTertiary; // #636366 — neutral, distinct from heat

// ── Component ─────────────────────────────────────────────────────────────────

export default function BusinessPin({ business, onPress }: BusinessPinProps) {
  const { boxSize, emojiSize, badgeFontSize, badgePadH, badgePadV } =
    useMemo(() => getSizeTier(business.activeCount), [business.activeCount]);

  const isPending = business.status === 'pending';
  const pinColor = isPending ? PENDING_COLOR : getHeatColor(business.activeCount);

  const radius = boxSize / 2;

  // Badge count string — clamp at 99+
  const badgeLabel =
    business.activeCount > 99 ? '99+' : String(business.activeCount);

  return (
    <Marker
      coordinate={{ latitude: business.lat, longitude: business.lng }}
      anchor={TEARDROP_ANCHOR}
      calloutAnchor={TEARDROP_CALL_ANCHOR}
      onPress={() => onPress(business)}
      tracksViewChanges={false}
    >
      {/* Outer wrapper gives the Marker a sized container */}
      <View
        style={[
          styles.markerWrapper,
          {
            width: boxSize + BADGE_OFFSET + BADGE_SIZE,
            height: boxSize + BADGE_OFFSET + BADGE_SIZE,
          },
        ]}
      >
        {/* ── Teardrop ───────────────────────────────────────────────────── */}
        <View
          style={[
            styles.teardrop,
            {
              width: boxSize,
              height: boxSize,
              borderTopLeftRadius: radius,
              borderTopRightRadius: radius,
              borderBottomRightRadius: radius,
              borderBottomLeftRadius: 0,
              backgroundColor: pinColor,
            },
          ]}
        >
          {/* Emoji counter-rotated +45deg so it's upright */}
          <View style={styles.emojiWrapper}>
            <Text style={[styles.emoji, { fontSize: emojiSize }]}>
              {business.icon_emoji}
            </Text>
          </View>
        </View>

        {/* ── Active user count badge (top-right) ────────────────────────── */}
        {business.activeCount > 0 && !isPending && (
          <View
            style={[
              styles.badge,
              {
                paddingHorizontal: badgePadH,
                paddingVertical: badgePadV,
              },
            ]}
          >
            <Text style={[styles.badgeText, { fontSize: badgeFontSize }]}>
              {badgeLabel}
            </Text>
          </View>
        )}

        {/* ── Pending badge ───────────────────────────────────────────────── */}
        {isPending && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>
              Pending{/* TODO(i18n) */}
            </Text>
          </View>
        )}
      </View>
    </Marker>
  );
}

// ── Layout constants ──────────────────────────────────────────────────────────

/** Diameter of the active-user count badge pill. */
const BADGE_SIZE = 14;
/** How far the badge overflows the top-right corner of the teardrop. */
const BADGE_OFFSET = 4;

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  /**
   * markerWrapper: a transparent container that gives the Marker enough room
   * for the teardrop plus the badge overflow. Position absolute lets us place
   * the badge at (boxSize - BADGE_SIZE/2, 0) relative to the wrapper.
   */
  markerWrapper: {
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    // The teardrop sits at the bottom-left; the badge overflows top-right.
  },

  /**
   * teardrop: the square box that becomes a teardrop via asymmetric border
   * radii + -45deg rotation.
   *
   * CSS equivalent: border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
   *
   * In RN:
   *   borderTopLeftRadius = boxSize / 2   (round)
   *   borderTopRightRadius = boxSize / 2  (round)
   *   borderBottomRightRadius = boxSize / 2 (round)
   *   borderBottomLeftRadius = 0           (sharp tip)
   *   transform: [{ rotate: '-45deg' }]   (rotates the sharp corner to point down-left)
   *
   * backgroundColor and radii are applied inline (depend on boxSize/pinColor).
   */
  teardrop: {
    alignItems: 'center',
    justifyContent: 'center',
    // Subtle shadow so pin lifts off the map
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 6,
    transform: [{ rotate: '-45deg' }],
  },

  /**
   * emojiWrapper: counter-rotates the emoji +45deg so it faces upright
   * despite the teardrop being rotated -45deg.
   */
  emojiWrapper: {
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },

  emoji: {
    // fontSize applied inline
    lineHeight: undefined, // let OS pick natural line height
    textAlign: 'center',
  },

  /**
   * badge: red pill in the top-right corner showing the live user count.
   * Positioned absolutely relative to markerWrapper so it sits above the
   * rotated teardrop without affecting layout.
   */
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: palette.danger, // #ef4444 — design system danger token
    alignItems: 'center',
    justifyContent: 'center',
    // Border so it stays readable on any pin color
    borderWidth: 1,
    borderColor: '#ffffff',
  },

  badgeText: {
    color: '#ffffff',
    fontWeight: '700',
    letterSpacing: -0.2,
    // fontSize applied inline
  },

  /**
   * pendingBadge: shown below the teardrop for status==='pending' businesses.
   * Uses a neutral pill distinct from the heat-colored active badge.
   */
  pendingBadge: {
    position: 'absolute',
    bottom: -2,
    left: 0,
    right: 0,
    alignItems: 'center',
  },

  pendingBadgeText: {
    fontSize: 7,
    fontWeight: '700',
    color: palette.textSecondary, // #aeaeb2
    backgroundColor: palette.bgOverlay, // #2a2a2e — semi-opaque dark pill
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
    // TODO(i18n)
  },
});

// ── Exports ───────────────────────────────────────────────────────────────────

export { getHeatColor, getHeatLevel, getSizeTier };
