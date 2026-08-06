/**
 * JChat 3.0 — POS data-access service (Task 3.x — Work Mode)
 *
 * Wraps the three Supabase RPCs that power employee POS access:
 *   pos_my_businesses()  → list of businesses where the current user has pos_access
 *   pos_set_pin(...)     → store a 4-6 digit PIN for a business
 *   pos_verify_pin(...)  → verify a PIN, returns boolean (errors: no pin set, locked, no pos access)
 *
 * All functions guard against unconfigured Supabase with isSupabaseConfigured.
 * RPCs are not yet in generated types — cast will be removed once types are regenerated.
 */

import { supabase, isSupabaseConfigured } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PosMyBusinessesRow {
  business_id: string;
  business_name: string;
  employee_id: string;
  role: string;
  has_pin: boolean;
  /** Subscription plan of the business ('pro', 'basic', etc.). Used to gate Pro features in the POS. */
  plan: string | null;
}

export type PosSetPinError =
  | 'pin_digits'
  | 'no_access'
  | 'db_error'
  | 'not_configured';

export type PosSetPinResult =
  | { ok: true }
  | { ok: false; reason: PosSetPinError };

export type PosVerifyPinError =
  | 'no_pin'
  | 'locked'
  | 'no_access'
  | 'db_error'
  | 'not_configured';

export type PosVerifyPinResult =
  | { ok: true; verified: boolean }
  | { ok: false; reason: PosVerifyPinError };

export interface PosTableRow {
  id: string;
  label: string;
  floor: string | null;
  seats: number | null;
}

/** Rich table row returned by the pos_tables_overview RPC. */
export interface PosTablesOverviewRow {
  table_id: string;
  label: string;
  floor: string | null;
  seats: number | null;
  /** Current number of guests at the table (null = not set). */
  party_size: number | null;
  /** Table occupancy state. */
  state: 'libre' | 'ocupada';
  /**
   * Waiter assignment relative to the authenticated employee:
   *   'mine'       — this employee is assigned
   *   'other'      — another employee is assigned
   *   'unassigned' — no employee assigned yet
   */
  assignment: 'mine' | 'other' | 'unassigned';
  /** Sum of all unpaid order totals for this table (cents). 0 when no open orders. */
  open_total_cents: number;
  /** ISO timestamp of the first unpaid order, or null. */
  open_since: string | null;
}

export interface PosOrderItem {
  menu_item_id: string;
  qty: number;
  /** Seat number this item belongs to; null = table-level order. */
  seat?: number | null;
  special_instructions?: string;
  /** Modifier selections to send to pos_create_order. */
  options?: {
    modifiers: {
      group_id: string;
      group_label: string;
      choice_labels: string[];
    }[];
  };
}

/** One served item row returned by the pos_table_items RPC. */
export interface PosTableItemRow {
  order_item_id: string;
  order_id: string;
  /** null = not seat-specific (ordered for the whole table). */
  seat: number | null;
  item_name: string;
  qty: number;
  /** Price per unit (cents). */
  price_cents: number;
  /**
   * Kitchen status of this item. Known values: 'pending' | 'preparing' | 'ready'.
   * Treat any unknown value as a fallback (display as-is).
   */
  item_status: string;
  options: { modifiers: { group_label: string; choice_labels: string[] }[] } | null;
  special_instructions: string | null;
}

/**
 * One split-check row returned by the pos_create_split RPC.
 * Each row represents one payment unit (a "check") created for the table.
 * The amount is server-computed — never trust or send it from the client.
 */
export interface PosSplitCheckRow {
  /** UUID of the pos_payments record — passed to chargeSplitCheck. */
  payment_id: string;
  /** Split method that generated this row (e.g. 'even'). */
  kind: string;
  /** Seat number this check covers, or null for table-level split. */
  seat: number | null;
  /** Amount this check must collect (cents). Server-authoritative. */
  amount_cents: number;
  /** order_item IDs covered by this check (may be empty for even split). */
  order_item_ids: string[];
}

export type PosCreateSplitError =
  | 'no_access'
  | 'empty_tab'
  | 'db_error'
  | 'not_configured';

export type PosCreateSplitResult =
  | { ok: true; checks: PosSplitCheckRow[] }
  | { ok: false; reason: PosCreateSplitError };

export type PosCreateOrderError =
  | 'table_not_in_business'
  | 'item_not_available'
  | 'no_valid_items'
  | 'no_access'
  | 'db_error'
  | 'not_configured'
  | 'invalid_modifier'; // modifier not linked to item / not found / invalid count or choice

export type PosCreateOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; reason: PosCreateOrderError };

// ─── Internal RPC helper ──────────────────────────────────────────────────────

// These RPCs are not yet in generated types; cast until types are regenerated.
type PosRpc = {
  rpc(fn: 'pos_my_businesses'): Promise<{
    data: PosMyBusinessesRow[] | null;
    error: { message: string } | null;
  }>;
  rpc(
    fn: 'pos_set_pin',
    params: { p_business_id: string; p_pin: string },
  ): Promise<{ data: null; error: { message: string } | null }>;
  rpc(
    fn: 'pos_verify_pin',
    params: { p_business_id: string; p_pin: string },
  ): Promise<{ data: boolean | null; error: { message: string } | null }>;
  rpc(
    fn: 'pos_create_order',
    params: {
      p_business_id: string;
      p_table_id: string;
      p_items: PosOrderItem[];
      p_notes: null;
    },
  ): Promise<{ data: string | null; error: { message: string } | null }>;
  rpc(
    fn: 'pos_tables_overview',
    params: { p_business_id: string },
  ): Promise<{ data: PosTablesOverviewRow[] | null; error: { message: string } | null }>;
  rpc(
    fn: 'pos_set_party_size',
    params: { p_business_id: string; p_table_id: string; p_party_size: number },
  ): Promise<{ data: null; error: { message: string } | null }>;
  rpc(
    fn: 'pos_table_items',
    params: { p_business_id: string; p_table_id: string },
  ): Promise<{ data: PosTableItemRow[] | null; error: { message: string } | null }>;
  rpc(
    fn: 'pos_create_split',
    params: {
      p_business_id: string;
      p_table_id: string;
      p_method: string;
      p_ways: number | null;
      p_checks: null;
    },
  ): Promise<{ data: PosSplitCheckRow[] | null; error: { message: string } | null }>;
};

const posRpc = supabase as unknown as PosRpc;

// ─── posMyBusinesses ─────────────────────────────────────────────────────────

/**
 * Return all businesses where the current user has the `pos_access` permission.
 * Each row includes whether a PIN has been set for that business.
 *
 * Returns an empty array when Supabase is not configured or the user has no
 * POS-access employees.
 */
export async function posMyBusinesses(): Promise<PosMyBusinessesRow[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await posRpc.rpc('pos_my_businesses');

  if (error) throw new Error(error.message);
  return (data ?? []) as PosMyBusinessesRow[];
}

// ─── posSetPin ───────────────────────────────────────────────────────────────

/**
 * Store a 4-6 digit numeric PIN for the current user at the given business.
 *
 * Possible failure reasons:
 *   'pin_digits'       — PIN is not 4-6 digits
 *   'no_access'        — user does not have pos_access at this business
 *   'db_error'         — unexpected database error
 *   'not_configured'   — Supabase is not configured
 */
export async function posSetPin(
  businessId: string,
  pin: string,
): Promise<PosSetPinResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  const { error } = await posRpc.rpc('pos_set_pin', {
    p_business_id: businessId,
    p_pin: pin,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('pin must be 4 to 6 digits')) return { ok: false, reason: 'pin_digits' };
    if (msg.includes('no pos access')) return { ok: false, reason: 'no_access' };
    return { ok: false, reason: 'db_error' };
  }

  return { ok: true };
}

// ─── posVerifyPin ────────────────────────────────────────────────────────────

/**
 * Verify the current user's PIN at the given business.
 * Returns { ok: true, verified: true } on correct PIN, { verified: false } on wrong PIN.
 *
 * Possible failure reasons:
 *   'no_pin'         — no PIN has been set yet for this business
 *   'locked'         — too many incorrect attempts; account is locked
 *   'no_access'      — user does not have pos_access at this business
 *   'db_error'       — unexpected database error
 *   'not_configured' — Supabase is not configured
 */
export async function posVerifyPin(
  businessId: string,
  pin: string,
): Promise<PosVerifyPinResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  const { data, error } = await posRpc.rpc('pos_verify_pin', {
    p_business_id: businessId,
    p_pin: pin,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('no pin set')) return { ok: false, reason: 'no_pin' };
    if (msg.includes('locked')) return { ok: false, reason: 'locked' };
    if (msg.includes('no pos access')) return { ok: false, reason: 'no_access' };
    return { ok: false, reason: 'db_error' };
  }

  return { ok: true, verified: data === true };
}

// ─── posTables ────────────────────────────────────────────────────────────────

/**
 * Return active tables for a business, ordered by their sort column.
 * The 'tables' table may not be in generated types — cast is removed once
 * types are regenerated.
 */
export async function posTables(businessId: string): Promise<PosTableRow[]> {
  if (!isSupabaseConfigured) return [];

  // 'tables' not yet in generated types — remove cast once types are regenerated.
  const result = await (supabase as unknown as { from(t: string): unknown })
    .from('tables') as {
      select(cols: string): {
        eq(col: string, val: unknown): {
          eq(col: string, val: unknown): {
            order(col: string): Promise<{
              data: PosTableRow[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };

  const { data, error } = await result
    .select('id, label, floor, seats')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('sort');

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─── posOpenOrders ────────────────────────────────────────────────────────────

/** A single unpaid order on a table, as returned by posOpenOrders(). */
export interface PosOpenOrder {
  id: string;
  /** Denormalized from the table row at order creation time. May be '' if not stored. */
  table_label: string;
  total_cents: number;
  created_at: string;
  status: string;
}

/**
 * Return all unpaid orders for a specific table, oldest first.
 * Used by PosCheckoutScreen to load the order(s) to charge.
 */
export async function posOpenOrders(
  businessId: string,
  tableId: string,
): Promise<PosOpenOrder[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await (supabase as unknown as {
    from(t: string): {
      select(cols: string): {
        eq(col: string, val: unknown): {
          eq(col: string, val: unknown): {
            is(col: string, val: null): {
              order(col: string, opts: { ascending: boolean }): Promise<{
                data: PosOpenOrder[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  })
    .from('orders')
    .select('id, table_label, total_cents, created_at, status')
    .eq('business_id', businessId)
    .eq('table_id', tableId)
    .is('paid_at', null)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Per-table open-order aggregate for badge display in PosHomeScreen. */
export interface PosTableOpenSummary {
  tableId: string;
  totalCents: number;
  count: number;
}

/**
 * Return a map of tableId → open-order summary for a business.
 * Executes a single query (no N+1) — used by PosHomeScreen for badge data.
 * Errors are silenced: on failure the map is empty and badges won't appear.
 */
export async function posOpenOrdersSummary(
  businessId: string,
): Promise<Record<string, PosTableOpenSummary>> {
  if (!isSupabaseConfigured) return {};

  const { data, error } = await (supabase as unknown as {
    from(t: string): {
      select(cols: string): {
        eq(col: string, val: unknown): {
          is(col: string, val: null): Promise<{
            data: Array<{ table_id: string; total_cents: number }> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from('orders')
    .select('table_id, total_cents')
    .eq('business_id', businessId)
    .is('paid_at', null);

  if (error) return {}; // non-fatal — badges just won't render

  const summary: Record<string, PosTableOpenSummary> = {};
  for (const row of data ?? []) {
    const existing = summary[row.table_id];
    if (existing) {
      existing.totalCents += row.total_cents;
      existing.count += 1;
    } else {
      summary[row.table_id] = { tableId: row.table_id, totalCents: row.total_cents, count: 1 };
    }
  }
  return summary;
}

// ─── posCreateOrder ───────────────────────────────────────────────────────────

/**
 * Submit a new order to the kitchen via the pos_create_order RPC.
 * Prices and totals are computed server-side — only item ids + quantities are sent.
 *
 * Possible failure reasons:
 *   'table_not_in_business' — tableId does not belong to businessId
 *   'item_not_available'    — one or more items are unavailable
 *   'no_valid_items'        — none of the items passed server-side validation
 *   'no_access'             — user does not have pos_access at this business
 *   'db_error'              — unexpected database error
 *   'not_configured'        — Supabase is not configured
 */
export async function posCreateOrder(
  businessId: string,
  tableId: string,
  items: PosOrderItem[],
): Promise<PosCreateOrderResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  const { data, error } = await posRpc.rpc('pos_create_order', {
    p_business_id: businessId,
    p_table_id: tableId,
    p_items: items,
    p_notes: null,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('table not in this business')) return { ok: false, reason: 'table_not_in_business' };
    if (msg.includes('not available')) return { ok: false, reason: 'item_not_available' };
    if (msg.includes('no valid items')) return { ok: false, reason: 'no_valid_items' };
    if (msg.includes('no pos access')) return { ok: false, reason: 'no_access' };
    if (msg.includes('not linked to item')) return { ok: false, reason: 'invalid_modifier' };
    if (msg.includes('not found')) return { ok: false, reason: 'invalid_modifier' };
    if (msg.includes('invalid selection count')) return { ok: false, reason: 'invalid_modifier' };
    if (msg.includes('invalid choice')) return { ok: false, reason: 'invalid_modifier' };
    return { ok: false, reason: 'db_error' };
  }

  if (!data) return { ok: false, reason: 'db_error' };
  return { ok: true, orderId: data };
}

// ─── posTablesOverview ────────────────────────────────────────────────────────

/**
 * Return a rich overview of all active tables for a business in one RPC call.
 * Each row includes state (libre/ocupada), assignment (mine/other/unassigned),
 * party_size, and aggregated open-order total — replacing the previous
 * posTables + posOpenOrdersSummary two-call pattern.
 */
export async function posTablesOverview(businessId: string): Promise<PosTablesOverviewRow[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await posRpc.rpc('pos_tables_overview', {
    p_business_id: businessId,
  });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─── posSetPartySize ──────────────────────────────────────────────────────────

// ─── posTableItems ────────────────────────────────────────────────────────────

/**
 * Return all open (unpaid) order items for a specific table, including the seat
 * assignment of each item. Used by PosTableHub to show the per-seat summary of
 * what has already been sent to the kitchen.
 *
 * Returns an empty array when Supabase is not configured or on error.
 */
export async function posTableItems(
  businessId: string,
  tableId: string,
): Promise<PosTableItemRow[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await posRpc.rpc('pos_table_items', {
    p_business_id: businessId,
    p_table_id: tableId,
  });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Set the party size (number of guests) for a table.
 * Called optimistically from the POS home screen party-size stepper.
 * Throws on RPC error so the caller can revert local state.
 */
export async function posSetPartySize(
  businessId: string,
  tableId: string,
  partySize: number,
): Promise<void> {
  if (!isSupabaseConfigured) return;

  const { error } = await posRpc.rpc('pos_set_party_size', {
    p_business_id: businessId,
    p_table_id: tableId,
    p_party_size: partySize,
  });

  if (error) throw new Error(error.message);
}

// ─── posCreateSplit ───────────────────────────────────────────────────────────

/**
 * Create N equal-split payment rows for a table via the pos_create_split RPC.
 *
 * The server computes the amount for each part from the tab total — the client
 * sends only method + N. Returns an array of PosSplitCheckRow, one per part.
 * Pass each row's payment_id to chargeSplitCheck to collect payment.
 *
 * @param businessId — business whose tab is being split
 * @param tableId    — the table to split
 * @param method     — split strategy; currently only 'even' is supported
 * @param ways       — number of equal parts (≥ 2); null means use server default
 * @param checks     — reserved for future seat-specific split; always pass null
 *
 * Possible failure reasons:
 *   'no_access'      — user does not have pos_access at this business
 *   'empty_tab'      — tab total is zero; nothing to split
 *   'db_error'       — unexpected database error
 *   'not_configured' — Supabase is not configured
 */
export async function posCreateSplit(
  businessId: string,
  tableId: string,
  method: 'even',
  ways?: number | null,
  checks?: null,
): Promise<PosCreateSplitResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  const { data, error } = await posRpc.rpc('pos_create_split', {
    p_business_id: businessId,
    p_table_id: tableId,
    p_method: method,
    p_ways: ways ?? null,
    p_checks: checks ?? null,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('no pos access')) return { ok: false, reason: 'no_access' };
    if (msg.includes('empty tab') || msg.includes('nothing to split')) {
      return { ok: false, reason: 'empty_tab' };
    }
    return { ok: false, reason: 'db_error' };
  }

  return { ok: true, checks: data ?? [] };
}
