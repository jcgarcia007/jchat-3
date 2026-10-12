/**
 * JChat 3.0 — fetch with a timeout, used as supabase-js's `global.fetch` (REST, auth, storage, functions; the
 * Realtime websocket does not go through it).
 *
 * Why: on React Native / Android a fetch has no timeout, and after a network change a request can sit on a dead
 * connection for minutes — screens spin forever. Every request now ends: 20 s by default (REST, auth), 45 s for Edge
 * Functions ('/functions/v1/': payments, account deletion… can be slow on a cold start) and 120 s for file transfers
 * ('/storage/v1/object'). The timeout covers the time until the response headers arrive.
 *
 * - An AbortSignal already in `init` is respected: if the caller aborts, the request aborts too.
 * - On timeout it rejects with an Error named 'TimeoutError' (the request is aborted and the timer is always cleared).
 *   The rejection is raced against the timer, so it settles even if the platform never settles the aborted fetch.
 */

export const DEFAULT_FETCH_TIMEOUT_MS = 20_000;
export const FUNCTIONS_FETCH_TIMEOUT_MS = 45_000;
export const STORAGE_FETCH_TIMEOUT_MS = 120_000;
const FUNCTIONS_URL_PART = '/functions/v1/';
const STORAGE_URL_PART = '/storage/v1/object';

export class FetchTimeoutError extends Error {
  constructor(url: string, ms: number) {
    super(`request timed out after ${ms} ms: ${url.split('?')[0]}`);
    this.name = 'TimeoutError';
  }
}

type FetchFn = (input: any, init?: any) => Promise<any>;

export interface FetchWithTimeoutOptions {
  /** Default timeout (ms). */
  defaultMs?: number;
  /** Timeout (ms) for URLs containing '/functions/v1/' (Edge Functions). */
  functionsMs?: number;
  /** Timeout (ms) for URLs containing '/storage/v1/object'. */
  storageMs?: number;
  /** The underlying fetch (injectable for tests). Defaults to the global fetch at call time. */
  fetchImpl?: FetchFn;
}

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input && typeof (input as { url?: unknown }).url === 'string') return (input as { url: string }).url;
  return String(input);
}

export function createFetchWithTimeout({
  defaultMs = DEFAULT_FETCH_TIMEOUT_MS,
  functionsMs = FUNCTIONS_FETCH_TIMEOUT_MS,
  storageMs = STORAGE_FETCH_TIMEOUT_MS,
  fetchImpl,
}: FetchWithTimeoutOptions = {}): FetchFn {
  return (input, init) => {
    const url = urlOf(input);
    const ms = url.includes(STORAGE_URL_PART) ? storageMs : url.includes(FUNCTIONS_URL_PART) ? functionsMs : defaultMs;
    const doFetch: FetchFn = fetchImpl ?? ((i, o) => fetch(i, o));

    const controller = new AbortController();
    const external: AbortSignal | undefined = init?.signal ?? undefined;
    const onExternalAbort = () => controller.abort();
    if (external) {
      if (external.aborted) controller.abort();
      else external.addEventListener('abort', onExternalAbort, { once: true });
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // Reject first: the abort makes the fetch reject with an AbortError, which must not win the race.
        reject(new FetchTimeoutError(url, ms));
        controller.abort();
      }, ms);
    });

    return Promise.race([doFetch(input, { ...init, signal: controller.signal }), timeout]).finally(() => {
      if (timer) clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    });
  };
}

export const fetchWithTimeout: FetchFn = createFetchWithTimeout();
