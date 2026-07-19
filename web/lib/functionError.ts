/**
 * Pull the server's { error } message out of a supabase.functions.invoke failure.
 *
 * A FunctionsHttpError carries the Response in `context`; without reading it you
 * only get "Edge Function returned a non-2xx status code", which tells the user
 * nothing. Same shape already used inline by the checkout / billing / pricing
 * callers — lifted here so new callers don't grow a fourth copy.
 *
 * Never consumes the body twice (clones when it can).
 */
type FnCtx = { status?: unknown; json?: unknown; clone?: unknown; text?: unknown };

export async function readFunctionError(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : "Algo salió mal";
  const ctx = (error as { context?: unknown })?.context as FnCtx | undefined;
  if (!ctx || typeof ctx !== "object") return fallback;

  const source: FnCtx = typeof ctx.clone === "function" ? (ctx.clone as () => FnCtx)() : ctx;

  if (typeof source.json === "function") {
    try {
      const body = await (source.json as () => Promise<unknown>)();
      const msg = (body as { error?: unknown })?.error;
      if (typeof msg === "string" && msg.length > 0) return msg;
    } catch {
      /* fall through to text */
    }
  }

  if (typeof source.text === "function") {
    try {
      const raw = await (source.text as () => Promise<string>)();
      if (raw) {
        try {
          const body = JSON.parse(raw);
          const msg = (body as { error?: unknown })?.error;
          if (typeof msg === "string" && msg.length > 0) return msg;
        } catch {
          return raw;
        }
      }
    } catch {
      /* fall through */
    }
  }

  return fallback;
}
