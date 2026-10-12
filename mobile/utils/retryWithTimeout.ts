/**
 * JChat 3.0 — run an async request with a per-attempt timeout and a few retries (generic).
 *
 * Why: right after a network change a request can hang for minutes on a dead pooled connection — fetch has no
 * default timeout in React Native — so the promise neither resolves nor rejects. Every attempt gets an
 * AbortSignal (pass it to `.abortSignal()` / fetch) AND is raced against the timer, so a request that ignores the
 * signal is abandoned too. The next attempt opens a fresh connection.
 */

export interface RetryOptions {
  /** Per-attempt timeout. */
  timeoutMs: number;
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
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new RequestTimeoutError());
      }, timeoutMs);
    });
    try {
      return await Promise.race([Promise.resolve(run(controller.signal)), timeout]);
    } catch (err) {
      lastError = err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastError;
}
