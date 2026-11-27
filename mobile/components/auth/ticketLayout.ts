/** Inner padding of the ticket paper; the perforation notches are positioned against it. */
export const TICKET_PADDING = 22;

/** Height of the fixed top bar (Back button 44 pt + 8 pt gap above it), under the safe area. The ES · EN pill (≈ 40 pt) fits inside it. */
export const TOP_BAR_CLEARANCE = 52;
/** Room the ticket keeps above its top edge inside the scroll area (its -2° tilt lifts the corner a few points). */
export const TICKET_TILT_ROOM = 16;

/** Where the scroll area starts: right under the top bar, so scrolled content never slides beneath the ES · EN pill or the Back button. */
export function ticketScrollTop(safeTop: number): number {
  return safeTop + TOP_BAR_CLEARANCE;
}

/**
 * Padding above the ticket INSIDE the scroll area. The ticket keeps the same screen position as before (photo height minus the
 * overlap, never above safeTop + 68); only the clipped scroll area moved down, so the padding is measured from its top.
 */
export function ticketTopPadding(opts: { safeTop: number; photoHeight: number; overlap: number; keyboardOpen: boolean }): number {
  const { safeTop, photoHeight, overlap, keyboardOpen } = opts;
  if (keyboardOpen) return TICKET_TILT_ROOM;
  return Math.max(photoHeight - overlap - ticketScrollTop(safeTop), TICKET_TILT_ROOM);
}
