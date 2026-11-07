/**
 * JChat 3.0 — D4: the pure logic behind the "delete account" screens of a venue OWNER (no React, no I/O; a Node test drives it).
 *
 * The delete-account function answers a GET (dry run, changes nothing) with the owner's venues or the thing that blocks the deletion:
 *   200 { owner: false }                          → the generic two confirmations (screen C is for owners only)
 *   200 { owner: true, businesses: [...] }        → screen A ("Tienes un local")
 *   409 owner_open_orders { open: [...] }         → screen G, with the list of what is open
 *   409 stripe_balance_pending { balances: [...] } → screen B (money still at Stripe)
 *   502 stripe_balance_check_failed               → screen G (error, code)
 *   405                                           → an older deployed function without the dry run: the generic flow (the old function answers an
 *                                                   owner's delete with the legacy 409 owner_has_business and touches nothing)
 * The real POST ({ confirmOwnerClose: true }) can answer the same 409/502/500 codes if something changed in between.
 * Only short snake_case codes, ids, names and numbers are read from a response: any other shape is dropped.
 */

export interface OwnerBusiness {
  id: string;
  name: string;
  city: string | null;
}

export interface OpenItem {
  businessId: string;
  businessName: string;
  kind: 'orders' | 'tabs';
  n: number;
}

export interface BalanceLine {
  businessId: string;
  businessName: string;
  currency: string;
  /** Minor units (cents). */
  amount: number;
}

export type OwnerBlocker =
  | { kind: 'open_orders'; open: OpenItem[] }
  | { kind: 'balance'; balances: BalanceLine[] };

export type OwnerCheck =
  | { kind: 'not_owner' }
  | { kind: 'unsupported' }
  | { kind: 'owner'; businesses: OwnerBusiness[] }
  | OwnerBlocker
  | { kind: 'error'; code: string };

const CODE_RE = /^[a-z][a-z0-9_]{0,39}$/;

export function sanitizeOwnerCode(value: unknown): string {
  return typeof value === 'string' && CODE_RE.test(value) ? value : 'unknown';
}

function asString(v: unknown, max = 120): string | null {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null;
}

export function parseBusinesses(raw: unknown): OwnerBusiness[] {
  if (!Array.isArray(raw)) return [];
  const out: OwnerBusiness[] = [];
  for (const r of raw) {
    const rec = r && typeof r === 'object' ? (r as Record<string, unknown>) : null;
    const id = asString(rec?.id, 64);
    const name = asString(rec?.name);
    if (id && name) out.push({ id, name, city: asString(rec?.city) });
  }
  return out;
}

export function parseOpenItems(raw: unknown): OpenItem[] {
  if (!Array.isArray(raw)) return [];
  const out: OpenItem[] = [];
  for (const r of raw) {
    const rec = r && typeof r === 'object' ? (r as Record<string, unknown>) : null;
    const businessId = asString(rec?.business_id, 64);
    const kind = rec?.kind === 'orders' || rec?.kind === 'tabs' ? rec.kind : null;
    const n = Number(rec?.n);
    if (businessId && kind && Number.isFinite(n) && n > 0) {
      out.push({ businessId, businessName: asString(rec?.business_name) ?? '', kind, n: Math.floor(n) });
    }
  }
  return out;
}

export function parseBalances(raw: unknown): BalanceLine[] {
  if (!Array.isArray(raw)) return [];
  const out: BalanceLine[] = [];
  for (const r of raw) {
    const rec = r && typeof r === 'object' ? (r as Record<string, unknown>) : null;
    const businessId = asString(rec?.business_id, 64);
    const currency = typeof rec?.currency === 'string' && /^[a-zA-Z]{3}$/.test(rec.currency) ? rec.currency.toLowerCase() : null;
    const amount = Number(rec?.amount);
    if (businessId && currency && Number.isFinite(amount) && amount > 0) {
      out.push({ businessId, businessName: asString(rec?.business_name) ?? '', currency, amount: Math.round(amount) });
    }
  }
  return out;
}

/** The blocker a 409 answer carries, or null when the body is not one of the two blockers. */
export function blockerFromBody(status: number, body: unknown): OwnerBlocker | null {
  if (status !== 409) return null;
  const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const code = rec?.code ?? rec?.error;
  if (code === 'owner_open_orders') return { kind: 'open_orders', open: parseOpenItems(rec?.open) };
  if (code === 'stripe_balance_pending') return { kind: 'balance', balances: parseBalances(rec?.balances) };
  return null;
}

export function ownerCheckFromResponse(status: number, ok: boolean, body: unknown): OwnerCheck {
  const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  if (ok) {
    if (rec?.owner === false) return { kind: 'not_owner' };
    if (rec?.owner === true) {
      const businesses = parseBusinesses(rec.businesses);
      // An owner without a readable venue list cannot be shown screen A safely: treat it as an error, never as "not an owner".
      return businesses.length > 0 ? { kind: 'owner', businesses } : { kind: 'error', code: 'bad_response' };
    }
    return { kind: 'error', code: 'bad_response' };
  }
  if (status === 405) return { kind: 'unsupported' };
  const blocker = blockerFromBody(status, body);
  if (blocker) return blocker;
  const code = sanitizeOwnerCode(rec?.code ?? rec?.error);
  return { kind: 'error', code: code === 'unknown' ? `http_${status}` : code };
}

// ── what the screens show ───────────────────────────────────────────────────────────────────────

/** Screen A lists at most 5 venues, then "and N more". */
export const MAX_LISTED_BUSINESSES = 5;

export function listForScreen<T>(items: T[], max: number = MAX_LISTED_BUSINESSES): { shown: T[]; more: number } {
  return { shown: items.slice(0, max), more: Math.max(0, items.length - max) };
}

/** Per currency, the money at Stripe summed over the venues (screen B shows the total, plus the venues when there are several). */
export function totalsByCurrency(balances: BalanceLine[]): { currency: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const b of balances) map.set(b.currency, (map.get(b.currency) ?? 0) + b.amount);
  return [...map].map(([currency, amount]) => ({ currency, amount }));
}

/** "$42.50". Never throws: an engine or currency Intl does not know falls back to "42.50 USD". */
export function formatMoney(amountCents: number, currency: string, language: string): string {
  try {
    return new Intl.NumberFormat(language === 'en' ? 'en-US' : 'es-US', { style: 'currency', currency: currency.toUpperCase() }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** Screen G's variants: which text a code gets (all show the code and the support contact). */
export type OwnerErrorKind = 'subscription' | 'balanceCheck' | 'generic';

export function ownerErrorKind(code: string): OwnerErrorKind {
  if (code === 'subscription_cancel_failed') return 'subscription';
  if (code === 'stripe_balance_check_failed') return 'balanceCheck';
  return 'generic';
}
