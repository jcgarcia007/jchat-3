/**
 * JChat 3.0 — collision-aware map pins (pure: no React, no theme, runs in Node tests).
 *
 * The map draws every venue as a name pill. When two pills would cover each other the one with more people keeps its
 * pill and the other is drawn as a 14 px dot of its activity colour. This module projects each venue to screen pixels
 * (Web Mercator), builds the pill's box, and decides pill or dot. MapScreen recomputes it in onRegionChangeComplete,
 * never on every frame.
 *
 * Priority, highest first: more people → closer to the user → name (A–Z) → id.
 */

import { counterLabel, pillName } from './mapPin';

export type PinMode = 'pill' | 'dot';

export interface CollisionRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** The map as the user sees it: its region and the size of the view in pixels. */
export interface CollisionViewport {
  region: CollisionRegion;
  width: number;
  height: number;
}

export interface CollisionPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** People in the venue's chat now (0 when nobody; ignored for the pill text when closed). */
  count: number;
  closed: boolean;
  /** The pin draws a logo circle above its pill (iOS only). */
  logo: boolean;
}

// ── Layout of the pill pin (shared with components/map/BusinessPin.tsx) ────────

export const PILL_HEIGHT = 32;
export const CLOSED_PILL_HEIGHT = 28;
export const PILL_TAIL = 8;
export const PILL_STEM = 8;
/** Diameter of the dot a hidden pill becomes. */
export const DOT_SIZE = 14;
/** Logo circle (image + 3 px white border) by activity count: 44–52 px, plus its 3 px activity ring on each side. */
export function logoDiameter(count: number): number {
  if (count >= 50) return 52;
  if (count >= 20) return 50;
  if (count >= 5) return 48;
  return 44;
}
export const LOGO_RING = 3;

/** Space kept between two pills before they count as touching. */
const GAP = 2;
/** Estimated average width of one character of the 13 px / 800 weight pill text (12 px when closed). */
const CHAR_WIDTH = 7.6;
const CLOSED_CHAR_WIDTH = 7;
/** The closed pill reads "{name} · closed": the suffix counted as this many characters (es "cerrado" is the longer). */
const CLOSED_SUFFIX_CHARS = 11;
const PILL_PADDING = 6 + 6 + 10; // left pad + gap after the circle + right pad

// ── Projection (Web Mercator) ──────────────────────────────────────────────────

/** 0 (north pole) … 1 (south pole) position of a latitude on the Web Mercator world square. */
function worldY(lat: number): number {
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
}

/** Screen pixels of a coordinate; the region's centre is the middle of the view, north is up. */
export function projectToPixels(lat: number, lng: number, viewport: CollisionViewport): { x: number; y: number } {
  const { region, width, height } = viewport;
  // The whole world (360° of longitude) is this many pixels wide at the current zoom.
  const worldWidth = (width * 360) / region.longitudeDelta;
  return {
    x: width / 2 + ((lng - region.longitude) / 360) * worldWidth,
    y: height / 2 + (worldY(lat) - worldY(region.latitude)) * worldWidth,
  };
}

// ── Boxes ──────────────────────────────────────────────────────────────────────

/** Estimated width of a pill: circle + the (truncated) name + " · N" or the closed suffix. */
export function pillWidth(pin: Pick<CollisionPin, 'name' | 'count' | 'closed'>): number {
  const nameChars = Array.from(pillName(pin.name)).length;
  if (pin.closed) {
    const circle = 20;
    return PILL_PADDING + circle + (nameChars + CLOSED_SUFFIX_CHARS) * CLOSED_CHAR_WIDTH;
  }
  const suffixChars = pin.count > 0 ? 3 + counterLabel(pin.count).length : 0; // " · " + digits
  return PILL_PADDING + 24 + (nameChars + suffixChars) * CHAR_WIDTH;
}

/** The pin's box in pixels: its width and height; the coordinate is the bottom centre (the tip of the tail). */
export function pinBox(pin: CollisionPin): { width: number; height: number } {
  const pillH = pin.closed ? CLOSED_PILL_HEIGHT : PILL_HEIGHT;
  let width = pillWidth(pin);
  let height = pillH + PILL_TAIL;
  if (pin.logo) {
    const ring = logoDiameter(pin.count) + LOGO_RING * 2;
    width = Math.max(width, ring);
    height += PILL_STEM + ring;
  }
  return { width, height };
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * The pin as the rectangles it really fills: the pill with its tail, and (iOS) the narrower logo ring with its stem
 * above it. Two pins collide only when one of their rectangles touches one of the other's: the bounding box of a pin
 * with a logo is mostly empty at its upper corners, and using it hid pins that did not touch on screen.
 */
function rectsAt(pin: CollisionPin, point: { x: number; y: number }): Box[] {
  const pillBottom = point.y;
  const pillTop = point.y - (pin.closed ? CLOSED_PILL_HEIGHT : PILL_HEIGHT) - PILL_TAIL;
  const half = pillWidth(pin) / 2;
  const rects: Box[] = [{ left: point.x - half, right: point.x + half, top: pillTop, bottom: pillBottom }];
  if (pin.logo) {
    const ring = logoDiameter(pin.count) + LOGO_RING * 2;
    rects.push({ left: point.x - ring / 2, right: point.x + ring / 2, top: pillTop - PILL_STEM - ring, bottom: pillTop });
  }
  return rects;
}

function touches(a: Box, b: Box): boolean {
  return a.left < b.right + GAP && a.right + GAP > b.left && a.top < b.bottom + GAP && a.bottom + GAP > b.top;
}

function intersects(pin: Box[], other: Box[]): boolean {
  return pin.some((a) => other.some((b) => touches(a, b)));
}

// ── Priority ───────────────────────────────────────────────────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Pill or dot for each pin. Pins are taken in priority order (more people, then closer to `user`, then name, then id);
 * a pin keeps its pill unless its box touches the box of a pill already kept, and then it becomes a dot. Pins far
 * outside the view take no space (they stay pills). Pure and deterministic for the same input.
 */
export function resolvePinModes(
  pins: CollisionPin[],
  viewport: CollisionViewport,
  user?: { lat: number; lng: number } | null,
): Record<string, PinMode> {
  const modes: Record<string, PinMode> = {};
  if (viewport.width <= 0 || viewport.height <= 0 || viewport.region.longitudeDelta <= 0) {
    for (const pin of pins) modes[pin.id] = 'pill';
    return modes;
  }

  const distance = (pin: CollisionPin) => (user ? haversineMeters(user.lat, user.lng, pin.lat, pin.lng) : Number.POSITIVE_INFINITY);
  const ordered = [...pins].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const da = distance(a);
    const db = distance(b);
    if (da !== db) return da - db;
    const byName = a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
    if (byName !== 0) return byName;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const kept: Box[][] = [];
  for (const pin of ordered) {
    const point = projectToPixels(pin.lat, pin.lng, viewport);
    const farOff = point.x < -300 || point.x > viewport.width + 300 || point.y < -400 || point.y > viewport.height + 200;
    if (farOff) {
      modes[pin.id] = 'pill';
      continue;
    }
    const rects = rectsAt(pin, point);
    if (kept.some((other) => intersects(rects, other))) {
      modes[pin.id] = 'dot';
    } else {
      modes[pin.id] = 'pill';
      kept.push(rects);
    }
  }
  return modes;
}
