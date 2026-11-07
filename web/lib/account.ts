/**
 * JChat 3.0 — Client-side account lifecycle (browser).
 * `deleteMyAccount` calls the existing `delete-account` Edge Function, which
 * verifies the caller's JWT and hard-deletes auth.users (cascades personal data).
 * Used for accounts that fail the 18+ check.
 */

import { supabase, authedFetch } from "@/lib/supabase";
import { TERMS_VERSION } from "@/lib/terms";

export type DeleteAccountResult = "ok" | "owns_business" | "error";

/** Deletes the account and says why not: "owns_business" (409) when the user still owns a business. Never throws. */
export async function deleteMyAccountDetailed(): Promise<DeleteAccountResult> {
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!base || !anon) return "error";
    // authedFetch adds the access token and applies the session guard (401 → refresh once → retry).
    const res = await authedFetch(`${base}/functions/v1/delete-account`, {
      method: "POST",
      headers: {
        apikey: anon,
        "Content-Type": "application/json",
      },
    });
    if (res.ok) return "ok";
    if (res.status === 409) {
      const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
      // "owns_business" is the old name of the code; the function now sends "owner_has_business" (both accepted while it rolls out).
      const code = body?.code ?? body?.error;
      if (code === "owner_has_business" || code === "owns_business") return "owns_business";
    }
    return "error";
  } catch {
    return "error";
  }
}

// ── D4: venue owners ──────────────────────────────────────────────────────────────────────────────
// Same contract as the app (mobile/utils/ownerDelete.ts): a GET dry run (an older function answers 405 and nothing is deleted) and a POST with
// confirmOwnerClose once the person confirmed. Only short codes, ids, names and numbers are read from an answer.

export interface OwnerVenue { id: string; name: string }
export type OwnerBlocker =
  | { kind: "open_orders" }
  | { kind: "balance"; totals: { currency: string; amount: number }[] };

export type OwnerCheck =
  | { kind: "not_owner" }
  | { kind: "owner"; venues: OwnerVenue[] }
  | OwnerBlocker
  | { kind: "error"; code: string };

const CODE_RE = /^[a-z][a-z0-9_]{0,39}$/;
const safeCode = (v: unknown, status: number) => (typeof v === "string" && CODE_RE.test(v) ? v : `http_${status}`);

function parseVenues(raw: unknown): OwnerVenue[] {
  if (!Array.isArray(raw)) return [];
  const out: OwnerVenue[] = [];
  for (const r of raw) {
    const rec = r && typeof r === "object" ? (r as Record<string, unknown>) : null;
    if (typeof rec?.id === "string" && typeof rec?.name === "string" && rec.name) out.push({ id: rec.id, name: rec.name.slice(0, 120) });
  }
  return out;
}

function blockerFrom(status: number, body: unknown): OwnerBlocker | null {
  if (status !== 409) return null;
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const code = rec?.code ?? rec?.error;
  if (code === "owner_open_orders") return { kind: "open_orders" };
  if (code === "stripe_balance_pending") {
    const map = new Map<string, number>();
    for (const b of Array.isArray(rec?.balances) ? (rec!.balances as unknown[]) : []) {
      const r = b && typeof b === "object" ? (b as Record<string, unknown>) : null;
      const amount = Number(r?.amount);
      if (typeof r?.currency === "string" && /^[a-zA-Z]{3}$/.test(r.currency) && Number.isFinite(amount) && amount > 0) {
        const cur = r.currency.toLowerCase();
        map.set(cur, (map.get(cur) ?? 0) + Math.round(amount));
      }
    }
    return { kind: "balance", totals: [...map].map(([currency, amount]) => ({ currency, amount })) };
  }
  return null;
}

/** Dry run: does this account own venues, and does something block closing them? Changes nothing. Never throws. */
export async function checkOwnerDeletion(): Promise<OwnerCheck> {
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!base || !anon) return { kind: "error", code: "not_configured" };
    const res = await authedFetch(`${base}/functions/v1/delete-account`, { method: "GET", headers: { apikey: anon } });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.ok) {
      if (body?.owner === false) return { kind: "not_owner" };
      const venues = parseVenues(body?.businesses);
      return body?.owner === true && venues.length > 0 ? { kind: "owner", venues } : { kind: "error", code: "bad_response" };
    }
    // 405 = an older function without the dry run: the plain flow (an owner's delete is refused there and nothing is touched).
    if (res.status === 405) return { kind: "not_owner" };
    const blocker = blockerFrom(res.status, body);
    if (blocker) return blocker;
    return { kind: "error", code: safeCode(body?.code ?? body?.error, res.status) };
  } catch {
    return { kind: "error", code: "network" };
  }
}

export type OwnerDeleteResult = { result: "ok" } | { result: "blocked"; blocker: OwnerBlocker } | { result: "error"; code: string };

/** The owner's real delete: closes the venues, cancels the subscription, deletes the account. Never throws. */
export async function deleteOwnerAccount(): Promise<OwnerDeleteResult> {
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!base || !anon) return { result: "error", code: "not_configured" };
    const res = await authedFetch(`${base}/functions/v1/delete-account`, {
      method: "POST",
      headers: { apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({ confirmOwnerClose: true }),
    });
    if (res.ok) return { result: "ok" };
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const blocker = blockerFrom(res.status, body);
    if (blocker) return { result: "blocked", blocker };
    return { result: "error", code: safeCode(body?.code ?? body?.error, res.status) };
  } catch {
    return { result: "error", code: "network" };
  }
}

/** "$42.50". Never throws. */
export function formatMoney(amountCents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** true only when the server confirmed the deletion. Never throws. */
export async function deleteMyAccount(): Promise<boolean> {
  return (await deleteMyAccountDetailed()) === "ok";
}

export type ConfirmAgeResult = "ok" | "underage" | "error";

/** Sends the picked date (YYYY-MM-DD) to rpc confirm_age. The date is never stored client-side. */
export async function confirmAge(isoDate: string): Promise<ConfirmAgeResult> {
  try {
    const { data, error } = await supabase.rpc("confirm_age", {
      p_birth_date: isoDate,
      p_terms_version: TERMS_VERSION,
    });
    if (error) return "error";
    const res = data as { ok?: boolean; reason?: string } | null;
    if (res?.ok === true) return "ok";
    if (res?.ok === false && res.reason === "underage") return "underage";
    return "error";
  } catch {
    return "error";
  }
}
