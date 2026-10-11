/**
 * JChat 3.0 — Truth or Dare · shared constants for the dashboard (configuration section + owner page).
 *
 * Categories match tod_settings.categories / tod_rounds.category (migration 222). The terms version is the same text
 * value the mobile app sends to tod_accept_terms (p_version is text, default '2026-10').
 */

export const TOD_CATEGORY_KEYS = ["classic", "party", "laughs", "confessions", "talent"] as const;
export type TodCategoryKey = (typeof TOD_CATEGORY_KEYS)[number];

export const TOD_TERMS_VERSION = "2026-10";

/** Shape returned by the tod_* RPCs that answer jsonb ({ status: 'ok' | 'denied' | 'cooldown', reason?, seconds? }). */
export interface TodRpcResult {
  status: string;
  reason?: string;
  seconds?: number;
}

export function asTodResult(data: unknown): TodRpcResult {
  if (data && typeof data === "object" && typeof (data as { status?: unknown }).status === "string") {
    return data as TodRpcResult;
  }
  return { status: "denied", reason: "default" };
}
