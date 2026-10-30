/**
 * Layout numbers of the profile header (the "JChat · Perfil" canvas, LG1/LG2/LG3) and when the compact header takes over (pure: no React Native).
 *
 * From the top of the screen, with T = the top inset: the cover is T + COVER_BELOW_INSET tall; the content sheet starts SHEET_OVERLAP higher
 * (it overlaps the cover); the avatar is centred on the sheet's top edge; the name block starts NAME_TOP below that edge.
 * The compact header (avatar + name + settings, in glass) appears when the big name has gone off the top of the screen: instantly, with no
 * animation of the glass's opacity.
 */
export const COVER_BELOW_INSET = 189;
export const SHEET_OVERLAP = 40;
export const SHEET_RADIUS = 34;
export const AVATAR_SIZE = 92;
export const AVATAR_BORDER = 4;
/** Left edge of the name block (next to the avatar). */
export const NAME_LEFT = 126;
export const NAME_TOP = 10;
/** Height of the name + @username lines. */
export const NAME_BLOCK_HEIGHT = 51;
/** Where the round buttons sit below the top inset. */
export const BUTTONS_BELOW_INSET = 7;
/** Height of the compact header (its pill and its buttons). */
export const COMPACT_HEIGHT = 48;

/** Scroll offset (px) past which the big name is out of sight: its bottom, measured from the screen top, falls under the compact header. */
export const COMPACT_SCROLL_Y = COVER_BELOW_INSET - SHEET_OVERLAP + NAME_TOP + NAME_BLOCK_HEIGHT - (BUTTONS_BELOW_INSET + COMPACT_HEIGHT);

/** True when the compact header must be shown for this scroll offset (iOS bounces to negative offsets: those are never compact). */
export function isCompactHeader(scrollY: number): boolean {
  return Number.isFinite(scrollY) && scrollY > COMPACT_SCROLL_Y;
}
