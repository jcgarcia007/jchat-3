/**
 * JChat 3.0 — the name Apple returns (pure). Apple sends the full name and e-mail ONLY the first time a person signs in
 * with it, so it has to be kept then: when the profile has no display name yet, this becomes it.
 */

export interface AppleFullName {
  givenName?: string | null;
  middleName?: string | null;
  familyName?: string | null;
}

/** "Given Middle Family" from what Apple returned, or null when there is nothing (the person can hide it). Max 60 chars. */
export function displayNameFromApple(fullName: AppleFullName | null | undefined): string | null {
  if (!fullName) return null;
  const name = [fullName.givenName, fullName.middleName, fullName.familyName]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 60)
    .trim();
  return name || null;
}

/** Save it only when the profile has no display name (never overwrite one the person chose). */
export function shouldSaveAppleName(currentDisplayName: string | null | undefined, appleName: string | null): appleName is string {
  return appleName !== null && !(currentDisplayName ?? '').trim();
}
