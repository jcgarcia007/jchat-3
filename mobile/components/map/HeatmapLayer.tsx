/**
 * JChat 3.0 — HeatmapLayer (Task 4.2)
 * Source of truth: JCHAT_3.0_DEV_PLAN.docx · Task 4.2
 *                  JCHAT_3.0_DESIGN_SYSTEM.docx · Section 12 (Map)
 *
 * Renders a soft radial-gradient heatmap effect under the BusinessPins by
 * drawing two layered react-native-maps `Circle`s per business:
 *   - Outer circle: large radius, low opacity  → diffuse "glow"
 *   - Inner circle: smaller radius, higher opacity → hot core
 *
 * Both circles are colored with the same palette.heat* token as the pin for
 * that business (determined by activeCount), so hot businesses pulse red while
 * quiet ones glow green.
 *
 * Refresh:
 *   - If `businesses` prop is provided the layer is purely presentational
 *     (MapScreen owns the data, HeatmapLayer just renders).
 *   - If no `businesses` prop is provided the layer fetches independently
 *     from Supabase and refreshes every 60 s (+ Realtime channel for live
 *     active_count updates).  Interval + subscription are cleaned up on unmount.
 *
 * Color mapping (NO hardcoded hex — all from palette tokens):
 *   activeCount < 5   → palette.heatCool  (#34C759)
 *   5 ≤ count < 20   → palette.heatMild  (#FFCC00)
 *   20 ≤ count < 50  → palette.heatWarm  (#FF9500)
 *   count ≥ 50       → palette.heatHot   (#FF3B30)
 *
 * // TODO(i18n): no user-visible strings in this file
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Circle } from 'react-native-maps';
import { supabase } from '../../services/supabase';
import { palette } from '../../theme/tokens';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HeatmapBusiness {
  id: string;
  lat: number;
  lng: number;
  /** Number of users currently active in this business (live count). */
  activeCount: number;
}

/** Supabase row shape returned by the heatmap query. */
interface HeatmapRow {
  id: string;
  lat: number | null;
  lng: number | null;
  active_count: number | null;
}

export interface HeatmapLayerProps {
  /**
   * If supplied, the layer is purely presentational and renders exactly these
   * businesses. MapScreen (Task 4.1) passes its already-fetched list here.
   *
   * If omitted, the layer fetches and maintains its own live data from Supabase
   * (useful for standalone use or storybook). In that case refresh happens every
   * 60 s + Realtime.
   */
  businesses?: HeatmapBusiness[];
}

// ── Heat color helpers ────────────────────────────────────────────────────────

/**
 * Returns the palette.heat* token (exact hex string) for a given activeCount.
 * Mirrors the same mapping used in BusinessPin so colors are always in sync.
 * NO hardcoded hex — all values come from palette.
 */
function heatColor(count: number): string {
  if (count >= 50) return palette.heatHot;   // #FF3B30
  if (count >= 20) return palette.heatWarm;  // #FF9500
  if (count >= 5)  return palette.heatMild;  // #FFCC00
  return palette.heatCool;                   // #34C759
}

// ── Circle geometry ──────────────────────────────────────────────────────────

/**
 * Outer glow radius (metres).  Scales up with activity so busy locations
 * have a wider visible heat footprint on the map.
 */
function outerRadius(count: number): number {
  if (count >= 50) return 160;
  if (count >= 20) return 120;
  if (count >= 5)  return 80;
  return 50;
}

/** Inner core radius is 40% of the outer radius. */
function innerRadius(count: number): number {
  return Math.round(outerRadius(count) * 0.4);
}

/** Outer glow opacity — subtle, lets the map show through. */
function outerOpacity(count: number): number {
  if (count >= 50) return 0.28;
  if (count >= 20) return 0.22;
  if (count >= 5)  return 0.16;
  return 0.12;
}

/** Inner core opacity — slightly stronger to show the hot center. */
function innerOpacity(count: number): number {
  return Math.min(outerOpacity(count) + 0.18, 0.60);
}

// ── Refresh interval ──────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 60_000; // 60 seconds

// ── Supabase fetch ────────────────────────────────────────────────────────────

async function fetchHeatmapData(): Promise<HeatmapBusiness[]> {
  const { data, error } = await supabase
    .from('businesses')
    .select('id, lat, lng, active_count')
    .eq('is_active', true)
    .not('lat', 'is', null)
    .not('lng', 'is', null);

  if (error || !data) return [];

  return (data as HeatmapRow[])
    .filter((row): row is HeatmapRow & { lat: number; lng: number } =>
      row.lat !== null && row.lng !== null,
    )
    .map((row) => ({
      id: row.id,
      lat: row.lat,
      lng: row.lng,
      activeCount: row.active_count ?? 0,
    }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HeatmapLayer({ businesses: propBusinesses }: HeatmapLayerProps) {
  // Internal state used only when no prop is provided (self-fetching mode).
  const [internalBusinesses, setInternalBusinesses] = useState<HeatmapBusiness[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Whether this layer manages its own data (no businesses prop passed).
  const isSelfFetching = propBusinesses === undefined;

  const loadData = useCallback(async () => {
    if (!isSelfFetching) return;
    const rows = await fetchHeatmapData();
    setInternalBusinesses(rows);
  }, [isSelfFetching]);

  useEffect(() => {
    if (!isSelfFetching) return;

    // Initial fetch
    void loadData();

    // 60-second polling interval
    intervalRef.current = setInterval(() => {
      void loadData();
    }, REFRESH_INTERVAL_MS);

    // Supabase Realtime — listen for any change to businesses.active_count.
    // We re-fetch on INSERT / UPDATE / DELETE so the circles stay current.
    const channel = supabase
      .channel('heatmap_businesses')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'businesses',
          filter: 'is_active=eq.true',
        },
        () => {
          // Re-fetch rather than patch state to keep logic simple and correct.
          void loadData();
        },
      )
      .subscribe();

    // Cleanup: clear interval + unsubscribe realtime channel on unmount.
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [isSelfFetching, loadData]);

  // Resolve the list to render — prop takes priority over internal state.
  const businesses = propBusinesses ?? internalBusinesses;

  return (
    <>
      {businesses.map((biz) => {
        if (biz.lat === null || biz.lng === null) return null;

        const coord = { latitude: biz.lat, longitude: biz.lng };
        const color = heatColor(biz.activeCount);
        const oRadius = outerRadius(biz.activeCount);
        const iRadiusValue = innerRadius(biz.activeCount);
        const oOpacity = outerOpacity(biz.activeCount);
        const iOpacity = innerOpacity(biz.activeCount);

        return (
          <React.Fragment key={biz.id}>
            {/* Outer diffuse glow */}
            <Circle
              center={coord}
              radius={oRadius}
              fillColor={`${color}${opacityToHex(oOpacity)}`}
              strokeWidth={0}
              strokeColor="transparent"
            />
            {/* Inner hot core */}
            <Circle
              center={coord}
              radius={iRadiusValue}
              fillColor={`${color}${opacityToHex(iOpacity)}`}
              strokeWidth={0}
              strokeColor="transparent"
            />
          </React.Fragment>
        );
      })}
    </>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Converts a 0–1 float opacity to a 2-char uppercase hex suffix, so we can
 * build an 8-digit hex color string (#RRGGBBAA) for react-native-maps Circle
 * fillColor without using rgba() strings (which some Android map versions
 * do not parse reliably).
 */
function opacityToHex(opacity: number): string {
  const clamped = Math.max(0, Math.min(1, opacity));
  const hex = Math.round(clamped * 255).toString(16).padStart(2, '0').toUpperCase();
  return hex;
}

// ── Exports ───────────────────────────────────────────────────────────────────

export { heatColor, outerRadius, innerRadius, outerOpacity, innerOpacity };
