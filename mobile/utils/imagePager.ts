/**
 * The maths of the image viewer's pager (components/ImageViewerModal.tsx). Pure: no React, no React Native, so a Node test drives it. The functions are
 * worklets because the gesture handlers call them on the UI thread.
 *
 * Paging only happens at 1x (the modal checks the zoom before it asks): while the photo is zoomed a one-finger drag moves the photo, not the page.
 */

/** A drag must pass this share of the width, or the flick this speed (px/s), to change page. */
export const PAGE_SWIPE_RATIO = 0.2;
export const PAGE_SWIPE_VELOCITY = 500;
/** Past the first / last page the strip follows the finger only this much (it springs back on release). */
export const EDGE_RESISTANCE = 0.3;

export type PanIntent = 'page' | 'dismiss';

/** What a one-finger drag at 1x means: a mostly horizontal one pages (only with more than one photo), anything else drags the photo down to close. */
export function panIntent(dx: number, dy: number, count: number): PanIntent {
  'worklet';
  return count > 1 && Math.abs(dx) > Math.abs(dy) ? 'page' : 'dismiss';
}

export function clampPage(index: number, count: number): number {
  'worklet';
  return Math.min(Math.max(index, 0), Math.max(count - 1, 0));
}

/** How far the strip moves for a finger drag `dx` on page `index`: all of it, except for a drag past the first or last page. */
export function dragOffset(dx: number, index: number, count: number): number {
  'worklet';
  if ((index <= 0 && dx > 0) || (index >= count - 1 && dx < 0)) return dx * EDGE_RESISTANCE;
  return dx;
}

/** The page shown once the finger lifts: the next / previous one if the drag passed 20 % of the width or the flick was fast, otherwise the same one. */
export function pageAfterRelease(index: number, dx: number, vx: number, width: number, count: number): number {
  'worklet';
  const fast = Math.abs(vx) > PAGE_SWIPE_VELOCITY;
  if (!fast && Math.abs(dx) <= width * PAGE_SWIPE_RATIO) return index;
  const lead = fast ? vx : dx;
  return clampPage(index + (lead < 0 ? 1 : -1), count);
}

/** The photos the viewer holds: `uris` when given, else the single `uri` (the DMs and the venue chat keep passing just that). */
export function viewerImages(uris: readonly string[] | undefined | null, uri: string | null | undefined): string[] {
  if (uris && uris.length > 0) return [...uris];
  return uri ? [uri] : [];
}
