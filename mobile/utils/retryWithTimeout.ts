/**
 * JChat 3.0 — run an async request with a per-attempt timeout and a few retries (generic).
 *
 * Retries a request a few times; every attempt is a NEW request (`run` is called again).
 * Right after a network change a request can hang on a dead connection, so an attempt must end. The Supabase
 * client already guarantees it (services/fetchWithTimeout.ts is its `global.fetch`: every request times out), so
 * `timeoutMs` is OPTIONAL — leave it out to rely on that and avoid a second, redundant timeout. When set, the
 * attempt also gets an AbortSignal and is raced against the timer (for a `run` that does not go through that fetch).
 */

export interface RetryOptions {
  /** Per-attempt timeout; omit it when `run` already times out by itself. */
  timeoutMs?: number;
  /** Total attempts (>= 1). */
  attempts: number;
  /** Pause between attempts. */
  delayMs: number;
}

export class RequestTimeoutError extends Error {
  constructor() {
    super('request_timeout');
    this.name = 'RequestTimeoutError';
  }
}

export async function retryWithTimeout<T>(
  run: (signal: AbortSignal) => PromiseLike<T>,
  { timeoutMs, attempts, delayMs }: RetryOptions,
): Promise<T> {
  const total = Math.max(1, Math.floor(attempts));
  let lastError: unknown = new RequestTimeoutError();
  for (let attempt = 0; attempt < total; attempt += 1) {
    if (attempt > 0 && delayMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout =
      timeoutMs === undefined
        ? null
        : new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new RequestTimeoutError());
            }, timeoutMs);
          });
    try {
      const request = Promise.resolve(run(controller.signal));
      return await (timeout ? Promise.race([request, timeout]) : request);
    } catch (err) {
      lastError = err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastError;
}
