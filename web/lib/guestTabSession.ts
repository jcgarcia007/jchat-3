/**
 * guestTabSession — Tab POS F3
 * Gestión de la sesión de invitado en sessionStorage.
 * El token NUNCA va a localStorage (per spec).
 */

export const GUEST_TAB_KEY = 'tabpos.guestTabSession';

export interface GuestTabSession {
  token:           string;
  expiresAt:       string;    // ISO 8601
  tableLabel:      string;
  businessSlug:    string;
  posPaymentMode:  'stripe' | 'external';
}

/** Lee la sesión; null si no existe, no pertenece a este slug, o está expirada. */
export function readGuestSession(slug: string): GuestTabSession | null {
  try {
    const raw = sessionStorage.getItem(GUEST_TAB_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GuestTabSession;
    if (s.businessSlug !== slug) return null;
    if (new Date(s.expiresAt) <= new Date()) {
      sessionStorage.removeItem(GUEST_TAB_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function saveGuestSession(s: GuestTabSession): void {
  try {
    sessionStorage.setItem(GUEST_TAB_KEY, JSON.stringify(s));
  } catch {
    // sessionStorage no disponible — la sesión queda efímera
  }
}

export function clearGuestSession(): void {
  try {
    sessionStorage.removeItem(GUEST_TAB_KEY);
  } catch { /* noop */ }
}

// ─── Cliente HTTP para la EF guest-tab ───────────────────────────────────────

const EF_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1/guest-tab';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

async function callGuestTab<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(EF_BASE, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body:    JSON.stringify(body),
  });
  const json = await res.json() as { error?: { code: string; message: string; retry_after_s?: number; blocked_until?: string } } & T;
  if (!res.ok || json.error) throw Object.assign(new Error(json.error?.message ?? 'Error'), { code: json.error?.code, ...json.error });
  return json;
}

export const guestTab = {
  createSession: (params: {
    table_qr_token: string;
    access_code:    string;
    device_id:      string;
    fingerprint:    string;
    captcha_token:  string;
  }) => callGuestTab<{ session_token: string; expires_at: string; table_label: string; business: { id: string; slug: string; name: string; pos_payment_mode: 'stripe' | 'external' } }>(
    { action: 'create_session', ...params }
  ),

  sessionStatus: (session_token: string) => callGuestTab<{ ok: boolean; table_label: string; pos_payment_mode: 'stripe' | 'external'; expires_at: string }>(
    { action: 'session_status', session_token }
  ),

  addOrder: (params: {
    session_token:   string;
    idempotency_key: string;
    items:           Array<{ menu_item_id: string; qty: number; options?: object; special_instructions?: string }>;
    contact_name?:   string;
    notes?:          string;
  }) => callGuestTab<{ order_id: string; approval_status: null; subtotal_cents: number; total_cents: number; items: Array<{ name: string; qty: number }> }>(
    { action: 'add_order', ...params }
  ),
};
