/**
 * Layout numbers of the profile header ("C2 compacto": a 144 pt avatar CENTRED on the sheet's top edge, name, @username, bio, city and capsules centred
 * under it) and when the compact header takes over (pure: no React Native).
 *
 * From the top of the screen, with T = the top inset: the round glass buttons sit at T + BUTTONS_BELOW_INSET and are BUTTON_SIZE tall; the avatar's top
 * edge is AVATAR_GAP_BELOW_BUTTONS under the buttons' bottom edge; the avatar is centred on the sheet's top edge, so the sheet starts AVATAR_SIZE / 2 below
 * the avatar's top. The cover is T + COVER_BELOW_INSET tall and the sheet starts SHEET_OVERLAP higher (it overlaps the cover). The name block starts
 * NAME_TOP below the sheet's top edge (the avatar's lower half plus a gap).
 * The compact header (avatar + name + settings, in glass) appears when the big name has gone off the top of the screen: instantly, with no
 * animation of the glass's opacity.
 */
export const SHEET_OVERLAP = 40;
export const SHEET_RADIUS = 34;
/** The avatar including its ring. */
export const AVATAR_SIZE = 144;
export const AVATAR_BORDER = 4;
/** Where the round buttons sit below the top inset, and their height (GlassIconButton's default size). */
export const BUTTONS_BELOW_INSET = 7;
export const BUTTON_SIZE = 44;
/** Space between the buttons' bottom edge and the avatar's top edge. */
export const AVATAR_GAP_BELOW_BUTTONS = 8;
/** Height of the cover below the top inset: 7 + 44 + 8 + 72 + 40 = 171. */
export const COVER_BELOW_INSET = BUTTONS_BELOW_INSET + BUTTON_SIZE + AVATAR_GAP_BELOW_BUTTONS + AVATAR_SIZE / 2 + SHEET_OVERLAP;
/** Gap between the avatar's bottom edge and the name. */
export const NAME_GAP = 12;
/** Distance from the sheet's top edge to the name block: the avatar's lower half plus the gap (84). */
export const NAME_TOP = AVATAR_SIZE / 2 + NAME_GAP;
/** Height of the name + @username lines. */
export const NAME_BLOCK_HEIGHT = 51;
/** Height of the compact header (its pill and its buttons). */
export const COMPACT_HEIGHT = 48;

/** Scroll offset (px) past which the big name is out of sight: its bottom, measured from the screen top, falls under the compact header. */
export const COMPACT_SCROLL_Y = COVER_BELOW_INSET - SHEET_OVERLAP + NAME_TOP + NAME_BLOCK_HEIGHT - (BUTTONS_BELOW_INSET + COMPACT_HEIGHT);

/** True when the compact header must be shown for this scroll offset (iOS bounces to negative offsets: those are never compact). */
export function isCompactHeader(scrollY: number): boolean {
  return Number.isFinite(scrollY) && scrollY > COMPACT_SCROLL_Y;
}
