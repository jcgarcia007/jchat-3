/**
 * JChat 3.0 — M1: the request chips of a reservation, as the dashboard shows them.
 *
 * The app stores reservations.special_requests as a comma-separated list of KEYS ("birthday,terrace"); reservations made before the keyboard-free
 * flow hold free text. parseRequests tells them apart so the dashboard can translate the keys (messages › dashboardCommon › resRequest_<key>) and
 * show the old text as it is. Keep the key list in sync with mobile/utils/reservationFlow.ts (REQUEST_KEYS).
 */

export const REQUEST_KEYS = ["birthday", "anniversary", "terrace", "indoor", "high_chair", "accessibility", "allergies", "quiet", "near_tv"] as const;
export type RequestKey = (typeof REQUEST_KEYS)[number];

const KNOWN = new Set<string>(REQUEST_KEYS);

export function isRequestKey(value: string): value is RequestKey {
  return KNOWN.has(value);
}

/** All tokens known → the keys (in the chips' order); anything else → the old free text; empty → nothing. */
export function parseRequests(value: string | null | undefined): { keys: RequestKey[]; legacy: string | null } {
  const text = (value ?? "").trim();
  if (text === "") return { keys: [], legacy: null };
  const tokens = text.split(",").map((s) => s.trim());
  if (tokens.every(isRequestKey)) return { keys: REQUEST_KEYS.filter((k) => tokens.includes(k)), legacy: null };
  return { keys: [], legacy: text };
}

/** The text to display: translated keys joined with " · ", or the old text unchanged. `translate` gets a key such as "birthday". */
export function requestsDisplay(value: string | null | undefined, translate: (key: RequestKey) => string): string | null {
  const parsed = parseRequests(value);
  if (parsed.keys.length > 0) return parsed.keys.map(translate).join(" · ");
  return parsed.legacy;
}
