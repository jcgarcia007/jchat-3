/**
 * JChat 3.0 — "My places" on the profile (pure: runs in Node tests).
 *
 * What the owner chose to show of their check-ins lives in users.privacy_settings (JSON): who sees the places
 * (whoSeesPlacesTab), whether the section exists at all (tabPlaces) and whether the city shows (showCity).
 * A person who never chose gets the SAFE value: places visible to nobody (only the owner). Someone who already
 * chose keeps their choice.
 *
 * PRIVACY (decision A.1): the section shows venue, logo and a number of visits — never dates, never a live location.
 */

export type PlacesVisibility = 'everyone' | 'followers' | 'nobody';

/** The value for someone with nothing saved: only me. */
export const DEFAULT_PLACES_VISIBILITY: PlacesVisibility = 'nobody';

export interface ProfilePrivacyView {
  placesVisibility: PlacesVisibility;
  /** privacy_settings.tabPlaces: false hides the whole section. */
  tabPlaces: boolean;
  showCity: boolean;
}

const VISIBILITIES: readonly string[] = ['everyone', 'followers', 'nobody'];

/** Reads the three flags from the raw privacy_settings JSON, with the safe default for anything missing or invalid. */
export function parseProfilePrivacy(raw: unknown): ProfilePrivacyView {
  const r = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const chosen = r.whoSeesPlacesTab;
  return {
    placesVisibility: typeof chosen === 'string' && VISIBILITIES.includes(chosen) ? (chosen as PlacesVisibility) : DEFAULT_PLACES_VISIBILITY,
    tabPlaces: typeof r.tabPlaces === 'boolean' ? r.tabPlaces : true,
    showCity: typeof r.showCity === 'boolean' ? r.showCity : true,
  };
}

/** i18n key (namespace `profile`) of the visibility chip: "Todos" / "Seguidores" / "Solo yo". */
export function placesVisibilityLabelKey(visibility: PlacesVisibility): string {
  if (visibility === 'everyone') return 'places.visEveryone';
  if (visibility === 'followers') return 'places.visFollowers';
  return 'places.visOnlyMe';
}

/** Total check-ins: the sum of the visits of every place (the number on the "Lugares" statistic). */
export function totalVisits(places: ReadonlyArray<{ visitCount: number }>): number {
  let total = 0;
  for (const place of places) {
    if (Number.isFinite(place.visitCount) && place.visitCount > 0) total += Math.floor(place.visitCount);
  }
  return total;
}
