/**
 * JChat 3.0 — Sentry configuration and privacy rules (pure: no Sentry import, no React; runs in Node tests).
 *
 * Privacy by default: no PII (`sendDefaultPii: false`), only the user's ID is ever attached, console breadcrumbs are
 * dropped, and `scrubEvent` removes e-mail / IP / location and any field that may carry a coordinate, a token or a
 * password, wherever it sits in the event. Without a DSN nothing is initialised (`buildSentryOptions` → null).
 */

/** Field names that never leave the device (compared in lower case, at any depth). */
export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'lat',
  'lng',
  'latitude',
  'longitude',
  'token',
  'table_qr_token',
  'password',
  // closely related names, same risk
  'access_token',
  'refresh_token',
  'authorization',
  'tracking_code',
  'trackingcode',
]);

const MAX_DEPTH = 12;

function scrubValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) continue;
    out[key] = scrubValue(inner, depth + 1, seen);
  }
  return out;
}

/** `beforeSend`: returns a copy of the event without e-mail, IP, location and sensitive fields (everything else is kept). */
export function scrubEvent<T>(event: T): T {
  if (event === null || typeof event !== 'object') return event;
  const copy = scrubValue(event, 0, new WeakSet()) as Record<string, any>;
  if (copy.user && typeof copy.user === 'object') {
    delete copy.user.email;
    delete copy.user.ip_address;
  }
  if (copy.contexts && typeof copy.contexts === 'object') delete copy.contexts.location;
  return copy as T;
}

/** `beforeBreadcrumb`: drops console breadcrumbs (they may print anything) and scrubs the data of the rest. */
export function scrubBreadcrumb<T extends { category?: string; data?: unknown }>(breadcrumb: T): T | null {
  if (breadcrumb.category === 'console') return null;
  return breadcrumb.data === undefined ? breadcrumb : ({ ...breadcrumb, data: scrubValue(breadcrumb.data, 0, new WeakSet()) } as T);
}

/** The DSN, or null when it is missing / blank / a placeholder (then Sentry is NOT initialised). */
export function resolveDsn(raw: string | null | undefined): string | null {
  const dsn = (raw ?? '').trim();
  if (!dsn || /^(PENDIENTE|TODO|CHANGEME|your[-_ ]?dsn)/i.test(dsn)) return null;
  return /^https?:\/\//i.test(dsn) ? dsn : null;
}

export interface MonitoringOptions {
  dsn: string;
  sendDefaultPii: false;
  tracesSampleRate: number;
  replaysSessionSampleRate: number;
  replaysOnErrorSampleRate: number;
  beforeSend: typeof scrubEvent;
  beforeBreadcrumb: typeof scrubBreadcrumb;
}

/** The options for Sentry.init, or null (no DSN → no initialisation). Integrations (replay) are added by the caller. */
export function buildSentryOptions(rawDsn: string | null | undefined): MonitoringOptions | null {
  const dsn = resolveDsn(rawDsn);
  if (!dsn) return null;
  return {
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
