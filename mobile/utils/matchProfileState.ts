/**
 * JChat 3.0 — the state of my Match profile (pure: no React, no I/O; a Node test drives it).
 *
 * A Match profile needs four things: who I am (gender), who I want to meet (seeking), at least one photo and one APPROVED photo. From them:
 *   • progress: how many of the four are done (the "n of 4" bar);
 *   • state: 'incomplete' (something is missing), 'reviewing' (everything is there and a photo is still being checked), 'rejected' (every photo was
 *     refused, so there is nothing left to show) or 'complete'.
 * `prefsAvailable` is false while the server cannot answer about gender / seeking (the migration that creates match_profiles is not applied yet): then
 * those two are not asked of anyone, so an app update never locks people out before the database is ready.
 */

export type MatchGender = 'woman' | 'man' | 'nonbinary';
export type MatchSeeking = 'women' | 'men' | 'all';
export type MatchPhotoState = 'pending' | 'approved' | 'rejected';
export type MatchProfileState = 'incomplete' | 'reviewing' | 'rejected' | 'complete';

export const MATCH_GENDERS: readonly MatchGender[] = ['woman', 'man', 'nonbinary'];
export const MATCH_SEEKINGS: readonly MatchSeeking[] = ['women', 'men', 'all'];
export const MATCH_PROFILE_STEPS = 4;
export const MAX_MATCH_INTERESTS = 5;

export function isMatchGender(value: unknown): value is MatchGender {
  return typeof value === 'string' && (MATCH_GENDERS as readonly string[]).includes(value);
}

export function isMatchSeeking(value: unknown): value is MatchSeeking {
  return typeof value === 'string' && (MATCH_SEEKINGS as readonly string[]).includes(value);
}

export interface MatchProfileInput {
  gender: MatchGender | null;
  seeking: MatchSeeking | null;
  photos: ReadonlyArray<{ status: MatchPhotoState }>;
  /** false → the gender / seeking columns cannot be read yet: they are not asked (see the header). */
  prefsAvailable?: boolean;
}

export interface MatchProfileSummary {
  hasGender: boolean;
  hasSeeking: boolean;
  hasPhoto: boolean;
  hasApproved: boolean;
  /** 0–4 */
  done: number;
  total: number;
  state: MatchProfileState;
  pending: number;
  approved: number;
  rejected: number;
}

export function summarizeMatchProfile(input: MatchProfileInput): MatchProfileSummary {
  const prefsAvailable = input.prefsAvailable !== false;
  const approved = input.photos.filter((p) => p.status === 'approved').length;
  const pending = input.photos.filter((p) => p.status === 'pending').length;
  const rejected = input.photos.filter((p) => p.status === 'rejected').length;
  const hasGender = !prefsAvailable || input.gender !== null;
  const hasSeeking = !prefsAvailable || input.seeking !== null;
  const hasPhoto = input.photos.length > 0;
  const hasApproved = approved > 0;
  const done = [hasGender, hasSeeking, hasPhoto, hasApproved].filter(Boolean).length;

  let state: MatchProfileState;
  if (hasGender && hasSeeking && hasApproved) state = 'complete';
  else if (hasGender && hasSeeking && pending > 0) state = 'reviewing';
  else if (hasGender && hasSeeking && hasPhoto && rejected === input.photos.length) state = 'rejected';
  else state = 'incomplete';

  return { hasGender, hasSeeking, hasPhoto, hasApproved, done, total: MATCH_PROFILE_STEPS, state, pending, approved, rejected };
}

/** What the "Confirmar perfil" button needs: gender, seeking and one photo. */
export function canConfirmMatchProfile(summary: MatchProfileSummary): boolean {
  return summary.hasGender && summary.hasSeeking && summary.hasPhoto;
}

/** What is still missing before the profile can be confirmed, in the order the screen asks for it. */
export function missingForConfirm(summary: MatchProfileSummary): Array<'gender' | 'seeking' | 'photo'> {
  const missing: Array<'gender' | 'seeking' | 'photo'> = [];
  if (!summary.hasGender) missing.push('gender');
  if (!summary.hasSeeking) missing.push('seeking');
  if (!summary.hasPhoto) missing.push('photo');
  return missing;
}

/** The label of "Mi perfil de Match" in Settings. A refused photo counts as incomplete (the person has to act). */
export function settingsStatus(summary: MatchProfileSummary): 'complete' | 'reviewing' | 'incomplete' {
  if (summary.state === 'complete') return 'complete';
  if (summary.state === 'reviewing') return 'reviewing';
  return 'incomplete';
}

/**
 * What the Match deck shows instead of cards, or null when the person can see the deck:
 *   'noProfile'  — gender, seeking or a photo is missing ("Crea tu perfil de Match");
 *   'reviewing'  — everything is there, a photo is being checked;
 *   'rejected'   — every photo was refused.
 */
export function deckGate(summary: MatchProfileSummary): 'noProfile' | 'reviewing' | 'rejected' | null {
  if (summary.state === 'complete') return null;
  if (summary.state === 'reviewing') return 'reviewing';
  if (summary.state === 'rejected') return 'rejected';
  return 'noProfile';
}

/** The row sent to match_profiles when I save: ONLY these three columns (the client may update only gender and seeking). */
export function matchPrefsInsertPayload(userId: string, gender: MatchGender | null, seeking: MatchSeeking | null) {
  return { user_id: userId, gender, seeking };
}

/** …and what an UPDATE of that row sends: only the two columns the client is granted. */
export function matchPrefsUpdatePayload(gender: MatchGender | null, seeking: MatchSeeking | null) {
  return { gender, seeking };
}

/** The server refuses a 4th change of gender / seeking in 24 h with P0001 'match_profile_change_limit'. */
export function isChangeLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === 'P0001' && typeof message === 'string' && message.includes('match_profile_change_limit');
}

/** The table does not exist yet (the migration is not applied): Postgres 42P01, or PostgREST's schema-cache PGRST205. */
export function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code } = error as { code?: unknown };
  return code === '42P01' || code === 'PGRST205';
}

/** Age from the year of birth (the profile shows "Name, age" to its owner only), or null when unknown / implausible. */
export function ageFromBirthYear(birthYear: number | null | undefined, now: Date = new Date()): number | null {
  if (typeof birthYear !== 'number' || !Number.isFinite(birthYear)) return null;
  const age = now.getFullYear() - birthYear;
  return age >= 18 && age <= 120 ? age : null;
}
