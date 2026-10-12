/**
 * JChat 3.0 — layout numbers of the profile as a side panel on the web (pure, shared by ProfileSheetFrame,
 * WebFrame and the tests).
 */

/** Browser widths from which the profile opens as a side panel instead of a sheet. */
export const PROFILE_PANEL_MIN_WIDTH = 900;
/** Width of the side panel (px). */
export const PROFILE_PANEL_WIDTH = 420;
/** Width of the phone-width column of the web app (WebFrame). */
export const WEB_COLUMN = 480;

/** A panel (not a sheet) on this browser width? */
export function isProfilePanelWidth(width: number): boolean {
  return width >= PROFILE_PANEL_MIN_WIDTH;
}

/**
 * Left padding that centers "column + panel" as one block in the window, so the chat column sits to the left of
 * the panel with an even gap (>= 0 from the breakpoint on).
 */
export function columnLeftWithPanel(windowWidth: number): number {
  return Math.max(0, (windowWidth - PROFILE_PANEL_WIDTH - WEB_COLUMN) / 2);
}
