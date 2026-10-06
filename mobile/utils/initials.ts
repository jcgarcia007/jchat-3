/** Display name without symbols or brackets ("[QA] Test" → "QA Test"); keeps letters, digits and spaces. */
export function cleanDisplayName(name: string | null | undefined): string {
  return (name ?? '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Initials for avatar fallbacks: first letter of each word (up to `max`), symbols ignored, "?" when empty. */
export function getInitials(name: string | null | undefined, max = 1): string {
  const letters = cleanDisplayName(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, max)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase();
  return letters || '?';
}

/** First two letters of the cleaned name ("Test" → "TE"), for the compact fallbacks that use letters rather than words. */
export function getLeadingLetters(name: string | null | undefined): string {
  return Array.from(cleanDisplayName(name).replace(/\s/g, '')).slice(0, 2).join('').toUpperCase() || '?';
}
