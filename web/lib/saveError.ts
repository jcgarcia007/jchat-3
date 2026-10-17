/**
 * JChat 3.0 — turns the raw error of a failed dashboard save (Supabase / PostgREST / fetch) into something the owner can act on.
 *
 * Why: Configuración → Portada e ícono answered 403 "permission denied for table businesses" and the page showed that raw text in a
 * banner at the top, out of sight of the Save button that had just been pressed, so the owner thought nothing had happened.
 * The page now shows a human message beside the button; this module decides WHICH message (and which small technical code to keep).
 * Pure on purpose: unit-tested in scripts/save-error.test.mjs.
 */

export type SaveErrorKind = 'permission' | 'network' | 'generic';

export interface SaveErrorInfo {
  kind: SaveErrorKind;
  /** Short technical detail for support (SQLSTATE / HTTP status / trimmed message); null when there is nothing useful. */
  code: string | null;
}

const MAX_CODE_LENGTH = 80;

function readField(e: unknown, field: string): string | null {
  if (typeof e !== 'object' || e === null) return null;
  const v = (e as Record<string, unknown>)[field];
  return typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null;
}

export function describeSaveError(e: unknown): SaveErrorInfo {
  const message = (e instanceof Error ? e.message : readField(e, 'message') ?? (typeof e === 'string' ? e : '')).trim();
  const code = readField(e, 'code') ?? readField(e, 'status');
  const text = message.toLowerCase();

  if (code === '42501' || code === '401' || code === '403' || /permission denied|row-level security|row level security/.test(text)) {
    return { kind: 'permission', code };
  }
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|network error|offline/.test(text)) {
    return { kind: 'network', code: null };
  }
  const detail = code ?? (message ? message.slice(0, MAX_CODE_LENGTH) : null);
  return { kind: 'generic', code: detail };
}
