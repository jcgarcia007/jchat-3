/**
 * JChat 3.0 — review mode, app side (migration 262).
 *
 * The SERVER decides who is inside a venue. For the review group (reviewer and QA accounts, only while the super-admin switch is on) the server
 * lets the person into a group venue from anywhere; this file only keeps the app from blocking them first with a distance it measured itself.
 */

/** The card's "inside the radius" flag, or null (unknown: no warning, the server decides on entry) when the server will not ask for a distance. */
export function insideRadiusForCard(
  insideRadius: boolean | null,
  businessId: string | null | undefined,
  bypassBusinessIds: ReadonlySet<string>,
): boolean | null {
  return businessId && bypassBusinessIds.has(businessId) ? null : insideRadius;
}

/** Reasons of a failed geofence check that are worth asking the server once more WITHOUT coordinates (the review group can enter without them). */
export function shouldTryReviewEntry(reason: string): boolean {
  return reason === 'permission_denied' || reason === 'position_error' || reason === 'outside_radius' || reason === 'unavailable';
}
