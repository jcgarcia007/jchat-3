/**
 * JChat 3.0 — payment-method-domain sync (pure: no Deno, no Stripe import, no database; runs in Node tests).
 *
 * Apple Pay / Google Pay in Stripe Elements need the page's domain registered (docs.stripe.com/payments/payment-methods/pmd-registration).
 * Each verified venue is served from <subdomain||slug>.jchat.cloud. This module holds the decisions and the loop; the Edge Function
 * (payment-domains-sync) hands it a Stripe client, the venue list and a logger.
 *
 *   scope 'platform'  (default) → register on the PLATFORM account (no Stripe-Account header). This is what Stripe documents for destination
 *                                 charges and separate charges and transfers (our gifts are destination charges with on_behalf_of).
 *   scope 'connected'           → register on the venue's connected account (Stripe-Account header). Documented by Stripe for DIRECT charges.
 *   scope 'both'                → both. 'connected' and 'both' are only used on explicit request.
 *
 * Idempotent: it lists what exists (domain_name filter) before creating anything, never repeats a registration and, for a domain that exists
 * but whose Apple Pay / Google Pay is not active, asks Stripe to /validate it. A domain a person disabled on purpose is left disabled.
 * It never receives, builds or prints a key: errors are redacted before they leave this module.
 */

export const DOMAIN_SUFFIX = '.jchat.cloud';
export type SyncScope = 'platform' | 'connected' | 'both';
export const DEFAULT_SCOPE: SyncScope = 'platform';
/** Venues handled per call (sequential Stripe calls must fit the function's time limit); `after` continues from the last id. */
export const MAX_VENUES_PER_CALL = 50;

export type DomainResult = 'registered' | 'already_registered' | 'validated' | 'disabled' | 'error';

export interface VenueRow {
  id: string;
  slug: string | null;
  subdomain: string | null;
  stripe_account_id: string | null;
}

/** The part of Stripe's PaymentMethodDomain object that matters here. */
export interface PmdLike {
  id: string;
  domain_name: string;
  enabled: boolean;
  apple_pay?: { status?: string } | null;
  google_pay?: { status?: string } | null;
}

/** The three Stripe calls used. `opts.stripeAccount` is the Stripe-Account header (absent = the platform). */
export interface PmdApi {
  list(params: { domain_name: string; limit: number }, opts?: { stripeAccount?: string }): Promise<{ data: PmdLike[] }>;
  create(params: { domain_name: string }, opts?: { stripeAccount?: string }): Promise<PmdLike>;
  validate(id: string, opts?: { stripeAccount?: string }): Promise<PmdLike>;
}

export interface AccountOutcome {
  result: DomainResult;
  id?: string;
  enabled?: boolean;
  apple_pay?: string;
  google_pay?: string;
  error?: string;
}

export interface VenueOutcome {
  business_id: string;
  host: string | null;
  platform?: AccountOutcome;
  connected?: AccountOutcome;
}

const HOST_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "<subdomain || slug>.jchat.cloud", or null when the label is empty or not a valid DNS label. */
export function hostForVenue(venue: Pick<VenueRow, 'slug' | 'subdomain'>): string | null {
  const label = (venue.subdomain || venue.slug || '').trim().toLowerCase();
  return HOST_LABEL_RE.test(label) ? `${label}${DOMAIN_SUFFIX}` : null;
}

export function parseScope(value: unknown): SyncScope | null {
  if (value === undefined || value === null) return DEFAULT_SCOPE;
  return value === 'platform' || value === 'connected' || value === 'both' ? value : null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Constant-time comparison so a secret can't be probed by timing. */
export function secretsMatch(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/**
 * Only the database (x-push-secret = PUSH_WEBHOOK_SECRET) or a caller holding the project's secret key (Authorization: Bearer <SB_SECRET_KEY>,
 * the service-role equivalent) is let in. A missing expected value never matches an empty header.
 */
export function isAuthorized(headers: { get(name: string): string | null }, env: { pushSecret?: string; secretKey?: string }): boolean {
  const push = headers.get('x-push-secret') ?? '';
  if (env.pushSecret && push && secretsMatch(push, env.pushSecret)) return true;
  const bearer = (headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  return Boolean(env.secretKey && bearer && secretsMatch(bearer, env.secretKey));
}

const KEY_RE = /\b(?:sk|rk|pk|whsec|sb_secret|sb_publishable)_[A-Za-z0-9_]{6,}/g;
/** An error message safe to return and log: anything that looks like a key is replaced. */
export function redact(message: unknown): string {
  return String(message ?? 'error').replace(KEY_RE, '[redacted]').slice(0, 300);
}

/** What to do with a domain Stripe already has. */
export function actionFor(existing: PmdLike | null): 'create' | 'validate' | 'none' | 'disabled' {
  if (!existing) return 'create';
  if (existing.enabled === false) return 'disabled';
  const active = existing.apple_pay?.status === 'active' && existing.google_pay?.status === 'active';
  return active ? 'none' : 'validate';
}

function describe(pmd: PmdLike, result: DomainResult): AccountOutcome {
  return { result, id: pmd.id, enabled: pmd.enabled, apple_pay: pmd.apple_pay?.status ?? 'unknown', google_pay: pmd.google_pay?.status ?? 'unknown' };
}

/** Registers (or checks, or validates) ONE host on ONE account. Never throws: a failure becomes `{ result: 'error' }`. */
export async function syncHost(api: PmdApi, host: string, stripeAccount?: string): Promise<AccountOutcome> {
  const opts = stripeAccount ? { stripeAccount } : undefined;
  try {
    const found = await api.list({ domain_name: host, limit: 1 }, opts);
    const existing = found.data.find((d) => d.domain_name === host) ?? null;
    switch (actionFor(existing)) {
      case 'create':
        return describe(await api.create({ domain_name: host }, opts), 'registered');
      case 'validate':
        return describe(await api.validate(existing!.id, opts), 'validated');
      case 'disabled':
        return describe(existing!, 'disabled');
      default:
        return describe(existing!, 'already_registered');
    }
  } catch (err) {
    return { result: 'error', error: redact((err as { message?: unknown })?.message) };
  }
}

/** The venues of one call and where the next one starts (null = done). */
export function pageOf(rows: VenueRow[], limit: number = MAX_VENUES_PER_CALL): { venues: VenueRow[]; next: string | null } {
  const venues = rows.slice(0, limit);
  return { venues, next: rows.length > limit ? venues[venues.length - 1].id : null };
}

export async function syncVenues(api: PmdApi, venues: VenueRow[], scope: SyncScope): Promise<VenueOutcome[]> {
  const out: VenueOutcome[] = [];
  for (const venue of venues) {
    const host = hostForVenue(venue);
    const row: VenueOutcome = { business_id: venue.id, host };
    if (!host) {
      row.platform = { result: 'error', error: 'invalid_host' };
      out.push(row);
      continue;
    }
    if (scope === 'platform' || scope === 'both') row.platform = await syncHost(api, host);
    if ((scope === 'connected' || scope === 'both') && venue.stripe_account_id) row.connected = await syncHost(api, host, venue.stripe_account_id);
    out.push(row);
  }
  return out;
}
