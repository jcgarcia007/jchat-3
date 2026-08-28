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
  /**
   * UUID of the primary table this table is annexed to, or null when not combined.
   * When non-null, orders/tab live on the primary table — navigate there instead.
   */
  combined_into: string | null;
  /**
   * Total seat capacity counting this table plus all annexed secondaries.
   * Equals `seats` when the table is not combined.
   */
  combined_seats: number;
  /**
   * True only when this table can be annexed as a secondary:
   * no open orders, no active table_tab, no party_size set, and not already combined.
   * A table can be 'libre' (free) but still not combinable (e.g. has guests but no order).
   */
  combinable: boolean;
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
  /** Menu item that was ordered — needed to reconstruct the draft on edit/void. */
  menu_item_id: string;
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
  /**
   * Kitchen status of the parent order. Known values: 'pending' | 'confirmed' |
   * 'preparing' | 'ready'. The kitchen marks orders at the order level, so this
   * is the authoritative source for gating Cancel/Edit.
   */
  order_status: string;
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

/**
 * One check element for the 'items' split method.
 * Specifies which order_items belong to a single check.
 * The server validates the partition and computes amounts — never send prices.
 */
export interface PosCheckItem {
  /** Physical seat this check corresponds to; null for mixed or custom checks. */
  seat: number | null;
  /** order_item_ids (from PosTableItemRow) included in this check. */
  order_item_ids: string[];
}

export type PosCombineTablesError =
  | 'secondary_in_use'
  | 'secondary_has_open_orders'
  | 'secondary_already_combined'
  | 'no_access'
  | 'db_error'
  | 'not_configured';

export type PosCombineTablesResult =
  | { ok: true }
  | { ok: false; reason: PosCombineTablesError };

export type PosUncombineTableError =
  | 'no_access'
  | 'db_error'
  | 'not_configured';

export type PosUncombineTableResult =
  | { ok: true }
  | { ok: false; reason: PosUncombineTableError };

export type PosCreateCheckError =
  | 'invalid_item'   // 'invalid or already-paid item'
  | 'no_items'       // 'no items'
  | 'no_access'      // 'no pos access'
  | 'db_error'
  | 'not_configured';

export type PosCreateCheckResult =
  | { ok: true; payment_id: string; amount_cents: number }
  | { ok: false; reason: PosCreateCheckError };

/** One item row returned by the pos_pickup_board RPC (waiter pickup board). */
export interface PosPickupItem {
  order_item_id: string;
  order_id: string;
  /** Table name shown in the board header. */
  table_label: string;
  item_name: string;
  qty: number;
  /** Seat number, or null for a table-level (no-seat) order. */
  seat: number | null;
  /** Current kitchen status. 'ready' items can be marked delivered. */
  item_status: 'pending' | 'preparing' | 'ready';
}

export type PosSetItemStatusError =
  | 'invalid_status'
  | 'item_not_found'
  | 'no_access'
  | 'db_error'
  | 'not_configured';

export type PosSetItemStatusResult =
  | { ok: true }
  | { ok: false; reason: PosSetItemStatusError };

export type PosVoidOrderError =
  | 'in_preparation'
  | 'split_in_progress'
  | 'already_paid'
  | 'no_access'
  | 'db_error'
  | 'not_configured';

export type PosVoidOrderResult =
  | { ok: true }
  | { ok: false; reason: PosVoidOrderError };

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
      p_checks: PosCheckItem[] | null;
    },
  ): Promise<{ data: PosSplitCheckRow[] | null; error: { message: string } | null }>;
  rpc(
    fn: 'pos_void_order',
    params: {
      p_business_id: string;
      p_order_id: string;
    },
  ): Promise<{ data: null; error: { message: string } | null }>;
  rpc(
    fn: 'pos_combine_tables',
    params: {
      p_business_id: string;
      p_primary_table_id: string;
      p_secondary_table_id: string;
    },
  ): Promise<{ data: null; error: { message: string } | null }>;
  rpc(
    fn: 'pos_uncombine_table',
    params: {
      p_business_id: string;
      p_table_id: string;
    },
  ): Promise<{ data: null; error: { message: string } | null }>;
  rpc(
    fn: 'pos_create_check',
    params: {
      p_business_id: string;
      p_table_id: string;
      p_order_item_ids: string[];
    },
  ): Promise<{
    data: { payment_id: string; amount_cents: number } | null;
    error: { message: string } | null;
  }>;
  rpc(
    fn: 'pos_pickup_board',
    params: { p_business_id: string },
  ): Promise<{ data: PosPickupItem[] | null; error: { message: string } | null }>;
  rpc(
    fn: 'set_item_status',
    params: { p_order_item_id: string; p_status: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: 'pos_kds_settings',
    params: { p_business_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
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
  method: 'even' | 'items',
  ways?: number | null,
  checks?: PosCheckItem[] | null,
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

// ─── posVoidOrder ─────────────────────────────────────────────────────────────

/**
 * Void (cancel) a pending order that the kitchen has not yet started.
 * The server validates that every item in the order is still 'pending'
 * and that no active split covers it before deleting the order.
 *
 * The client sends only businessId + orderId — no amounts, no status changes.
 *
 * Possible failure reasons:
 *   'in_preparation'    — one or more items are already being prepared
 *   'split_in_progress' — an active split covers this order
 *   'already_paid'      — the order has already been paid
 *   'no_access'         — user does not have pos_access at this business
 *   'db_error'          — unexpected database error
 *   'not_configured'    — Supabase is not configured
 */
export async function posVoidOrder(
  businessId: string,
  orderId: string,
): Promise<PosVoidOrderResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  const { error } = await posRpc.rpc('pos_void_order', {
    p_business_id: businessId,
    p_order_id: orderId,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('order in preparation')) return { ok: false, reason: 'in_preparation' };
    if (msg.includes('split in progress'))    return { ok: false, reason: 'split_in_progress' };
    if (msg.includes('order already paid'))   return { ok: false, reason: 'already_paid' };
    if (msg.includes('no pos access'))        return { ok: false, reason: 'no_access' };
    return { ok: false, reason: 'db_error' };
  }

  return { ok: true };
}

// ─── posCombineTables ─────────────────────────────────────────────────────────

/**
 * Annex secondaryTableId to primaryTableId.
 * The secondary must be free (no active table_tab) and have no open orders.
 * After combining, the secondary's capacity is added to the primary's
 * combined_seats and the secondary's combined_into is set to primaryTableId.
 *
 * Possible failure reasons:
 *   'secondary_in_use'           — secondary table has an active table_tab
 *   'secondary_has_open_orders'  — secondary has unpaid orders
 *   'secondary_already_combined' — secondary is already annexed to another table
 *   'no_access'                  — user does not have pos_access at this business
 *   'db_error'                   — unexpected database error
 *   'not_configured'             — Supabase is not configured
 */
export async function posCombineTables(
  businessId: string,
  primaryTableId: string,
  secondaryTableId: string,
): Promise<PosCombineTablesResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  const { error } = await posRpc.rpc('pos_combine_tables', {
    p_business_id: businessId,
    p_primary_table_id: primaryTableId,
    p_secondary_table_id: secondaryTableId,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('secondary in use'))           return { ok: false, reason: 'secondary_in_use' };
    if (msg.includes('secondary has open orders'))  return { ok: false, reason: 'secondary_has_open_orders' };
    if (msg.includes('secondary already combined')) return { ok: false, reason: 'secondary_already_combined' };
    if (msg.includes('no pos access'))              return { ok: false, reason: 'no_access' };
    return { ok: false, reason: 'db_error' };
  }

  return { ok: true };
}

// ─── posUncombineTable ────────────────────────────────────────────────────────

/**
 * Detach tableId from its primary table.
 * tableId must currently have combined_into set (be a secondary).
 * The server clears combined_into and recomputes combined_seats on the primary.
 *
 * Possible failure reasons:
 *   'no_access'      — user does not have pos_access at this business
 *   'db_error'       — unexpected database error (incl. table not combined)
 *   'not_configured' — Supabase is not configured
 */
export async function posUncombineTable(
  businessId: string,
  tableId: string,
): Promise<PosUncombineTableResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  const { error } = await posRpc.rpc('pos_uncombine_table', {
    p_business_id: businessId,
    p_table_id: tableId,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('no pos access')) return { ok: false, reason: 'no_access' };
    return { ok: false, reason: 'db_error' };
  }

  return { ok: true };
}

// ─── posCreateCheck ───────────────────────────────────────────────────────────

/**
 * Create a single payment record for a specific group of order items.
 * Used by the "Per-seat / item" split method to charge one sub-account
 * at a time without creating a full split upfront.
 *
 * The server validates that every item belongs to the table, is unpaid,
 * and computes the amount — the client only sends IDs, never amounts.
 *
 * @param businessId    — business whose tab is being charged
 * @param tableId       — the table containing the items
 * @param orderItemIds  — order_item_id values to cover in this check
 *
 * Possible failure reasons:
 *   'invalid_item'   — one or more items are invalid or already paid
 *   'no_items'       — orderItemIds is empty or all items were rejected
 *   'no_access'      — user does not have pos_access at this business
 *   'db_error'       — unexpected database error
 *   'not_configured' — Supabase is not configured
 */
export async function posCreateCheck(
  businessId: string,
  tableId: string,
  orderItemIds: string[],
): Promise<PosCreateCheckResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  const { data, error } = await posRpc.rpc('pos_create_check', {
    p_business_id: businessId,
    p_table_id: tableId,
    p_order_item_ids: orderItemIds,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('invalid or already-paid item')) return { ok: false, reason: 'invalid_item' };
    if (msg.includes('no items'))                     return { ok: false, reason: 'no_items' };
    if (msg.includes('no pos access'))                return { ok: false, reason: 'no_access' };
    return { ok: false, reason: 'db_error' };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.payment_id) return { ok: false, reason: 'db_error' };
  return { ok: true, payment_id: row.payment_id, amount_cents: row.amount_cents };
}

// ─── Receipt log (Fase 4B) ────────────────────────────────────────────────────

export interface PosReceiptRow {
  id: string;
  receipt_code: string | null;
  table_label: string | null;
  amount_cents: number;
  tip_cents: number;
  status: string;
  paid_by: string | null;
  created_at: string;
}

export type PosReceiptsResult =
  | { ok: true; rows: PosReceiptRow[] }
  | { ok: false; reason: 'no_access' | 'db_error' | 'not_configured' };

/**
 * Returns today's succeeded payments for a business.
 * Owner sees all; employee sees only their own (paid_by = auth.uid()).
 * "Today" is anchored to America/New_York on the server (migration 156).
 */
export async function posReceiptsToday(
  businessId: string,
): Promise<PosReceiptsResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  // Cast through unknown: pos_receipts_today is not in the generated DB types yet.
  const { data, error } = await (posRpc as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> })
    .rpc('pos_receipts_today', { p_business_id: businessId });

  if (error) {
    if (error.message.toLowerCase().includes('no access')) {
      return { ok: false, reason: 'no_access' };
    }
    return { ok: false, reason: 'db_error' };
  }

  return { ok: true, rows: ((data ?? []) as unknown) as PosReceiptRow[] };
}

// ─── Alert config types ───────────────────────────────────────────────────────

export interface PosAlertConfig {
  sound: boolean;
  vibration: boolean;
  tone: string; // 'ding' | 'bell' | 'chime' | 'alert' — kept for forward-compat
}

export interface PosAlertsConfig {
  ready: PosAlertConfig;
  service_call: PosAlertConfig;
}

const DEFAULT_ALERTS: PosAlertsConfig = {
  ready:        { sound: true, vibration: true, tone: 'ding' },
  service_call: { sound: true, vibration: true, tone: 'bell' },
};

// ─── posPickupBoard ───────────────────────────────────────────────────────────

/**
 * Return all open (non-delivered) order items for a business, grouped for the
 * waiter pickup board. Each row includes table_label, item_name, qty, seat, and
 * item_status ('pending' | 'preparing' | 'ready').
 *
 * Used by PosPickupScreen — read-only, does not touch checkout or split.
 */
export async function posPickupBoard(businessId: string): Promise<PosPickupItem[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await posRpc.rpc('pos_pickup_board', {
    p_business_id: businessId,
  });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─── posSetItemStatus ─────────────────────────────────────────────────────────

/**
 * Mark a kitchen item as delivered ('done'). Only the waiter pickup screen calls this.
 * The server validates that the caller has pos_access at the business.
 *
 * Possible failure reasons:
 *   'invalid_status'  — status value is not accepted by the RPC
 *   'item_not_found'  — order item does not exist
 *   'no_access'       — caller is not authenticated or lacks employee access
 *   'db_error'        — unexpected database error
 *   'not_configured'  — Supabase is not configured
 */
export async function posSetItemStatus(
  orderItemId: string,
  status: string,
): Promise<PosSetItemStatusResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  const { error } = await posRpc.rpc('set_item_status', {
    p_order_item_id: orderItemId,
    p_status: status,
  });

  if (error) {
    const msg = error.message.toUpperCase();
    if (msg.includes('INVALID_STATUS'))      return { ok: false, reason: 'invalid_status' };
    if (msg.includes('ITEM_NOT_FOUND'))      return { ok: false, reason: 'item_not_found' };
    if (msg.includes('NOT_EMPLOYEE'))        return { ok: false, reason: 'no_access' };
    if (msg.includes('NOT_AUTHENTICATED'))   return { ok: false, reason: 'no_access' };
    return { ok: false, reason: 'db_error' };
  }

  return { ok: true };
}

// ─── Inventory types ──────────────────────────────────────────────────────────

/** Row returned when listing menu items for the inventory screen. */
export interface PosInventoryItem {
  id: string;
  name: string;
  stock_count: number | null;
  low_stock_threshold: number;
  barcode: string | null;
}

export type PosStockMode = 'count' | 'receive' | 'waste';

export type PosApplyStockError =
  | 'forbidden'
  | 'item_not_found'
  | 'bad_mode'
  | 'bad_quantity'
  | 'not_configured'
  | 'db_error';

export type PosApplyStockResult =
  | { ok: true; newStock: number; movementId: string }
  | { ok: false; reason: PosApplyStockError };

export type PosLinkBarcodeError =
  | 'forbidden'
  | 'item_not_found'
  | 'bad_barcode'
  | 'not_configured'
  | 'db_error';

export type PosLinkBarcodeResult =
  | { ok: true }
  | { ok: false; reason: PosLinkBarcodeError };

// ─── posGetInventory ──────────────────────────────────────────────────────────

/**
 * Return all active menu items for a business, ordered by name.
 * Used by PosInventoryScreen to list and search items.
 * Each row includes stock_count, low_stock_threshold, and barcode.
 */
export async function posGetInventory(businessId: string): Promise<PosInventoryItem[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await (supabase as unknown as {
    from(t: string): {
      select(cols: string): {
        eq(col: string, val: unknown): {
          eq(col: string, val: unknown): {
            order(col: string, opts?: { ascending: boolean }): Promise<{
              data: PosInventoryItem[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  })
    .from('menu_items')
    .select('id, name, stock_count, low_stock_threshold, barcode')
    .eq('business_id', businessId)
    .eq('is_available', true)
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─── posApplyStockMovement ────────────────────────────────────────────────────

/**
 * Adjust the stock of a menu item via the pos_apply_stock_movement RPC.
 *
 * Modes:
 *   'count'   — set stock_count to exactly p_quantity (e.g. physical count)
 *   'receive' — add p_quantity to current stock (incoming delivery)
 *   'waste'   — subtract p_quantity from current stock (damage / spoilage)
 *
 * Possible failure reasons:
 *   'forbidden'      — caller is not the owner nor has inventory_manage
 *   'item_not_found' — menu item does not belong to this business
 *   'bad_mode'       — mode is not count | receive | waste
 *   'bad_quantity'   — quantity is null, negative, or > 1,000,000
 *   'db_error'       — unexpected server error
 *   'not_configured' — Supabase is not configured
 */
export async function posApplyStockMovement(
  businessId: string,
  menuItemId: string,
  mode: PosStockMode,
  quantity: number,
  note?: string,
): Promise<PosApplyStockResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  const { data, error } = await (posRpc as unknown as {
    rpc(
      fn: 'pos_apply_stock_movement',
      params: {
        p_business_id: string;
        p_menu_item_id: string;
        p_mode: string;
        p_quantity: number;
        p_note: string | null;
      },
    ): Promise<{
      data: Array<{ new_stock: number; movement_id: string }> | null;
      error: { message: string } | null;
    }>;
  }).rpc('pos_apply_stock_movement', {
    p_business_id:  businessId,
    p_menu_item_id: menuItemId,
    p_mode:         mode,
    p_quantity:     quantity,
    p_note:         note ?? null,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('forbidden') || msg.includes('42501')) return { ok: false, reason: 'forbidden' };
    if (msg.includes('item_not_found'))                     return { ok: false, reason: 'item_not_found' };
    if (msg.includes('bad_mode'))                           return { ok: false, reason: 'bad_mode' };
    if (msg.includes('bad_quantity'))                       return { ok: false, reason: 'bad_quantity' };
    return { ok: false, reason: 'db_error' };
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return { ok: false, reason: 'db_error' };
  return { ok: true, newStock: row.new_stock, movementId: row.movement_id };
}

// ─── posLinkBarcode ───────────────────────────────────────────────────────────

/**
 * Link a barcode to a menu item via the pos_link_barcode RPC.
 * After linking, scanning that barcode will resolve to this item.
 *
 * Possible failure reasons:
 *   'forbidden'      — caller is not the owner nor has inventory_manage
 *   'item_not_found' — menu item does not belong to this business
 *   'bad_barcode'    — barcode is null, < 6 chars, > 20 chars, or non-numeric
 *   'db_error'       — unexpected server error
 *   'not_configured' — Supabase is not configured
 */
export async function posLinkBarcode(
  businessId: string,
  menuItemId: string,
  barcode: string,
): Promise<PosLinkBarcodeResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };

  const { error } = await (posRpc as unknown as {
    rpc(
      fn: 'pos_link_barcode',
      params: {
        p_business_id: string;
        p_menu_item_id: string;
        p_barcode: string;
      },
    ): Promise<{ data: boolean | null; error: { message: string } | null }>;
  }).rpc('pos_link_barcode', {
    p_business_id:  businessId,
    p_menu_item_id: menuItemId,
    p_barcode:      barcode,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('forbidden') || msg.includes('42501')) return { ok: false, reason: 'forbidden' };
    if (msg.includes('item_not_found'))                     return { ok: false, reason: 'item_not_found' };
    if (msg.includes('bad_barcode'))                        return { ok: false, reason: 'bad_barcode' };
    return { ok: false, reason: 'db_error' };
  }

  return { ok: true };
}

// ─── posKdsSettings ───────────────────────────────────────────────────────────

/**
 * Fetch the KDS alert settings for a business (sound, vibration, tone per alert
 * type). Used by usePosAlerts to know which alerts are active.
 *
 * Returns safe defaults (all on) if the RPC fails so the hook always fires
 * vibration even when the business hasn't configured alerts yet.
 */
export async function posKdsSettings(businessId: string): Promise<PosAlertsConfig> {
  if (!isSupabaseConfigured) return DEFAULT_ALERTS;

  const { data, error } = await posRpc.rpc('pos_kds_settings', {
    p_business_id: businessId,
  });

  if (error || data == null) return DEFAULT_ALERTS;

  const raw = data as { alerts?: Partial<{
    ready: Partial<PosAlertConfig>;
    service_call: Partial<PosAlertConfig>;
  }> };

  return {
    ready: {
      sound:     raw.alerts?.ready?.sound     ?? DEFAULT_ALERTS.ready.sound,
      vibration: raw.alerts?.ready?.vibration ?? DEFAULT_ALERTS.ready.vibration,
      tone:      raw.alerts?.ready?.tone      ?? DEFAULT_ALERTS.ready.tone,
    },
    service_call: {
      sound:     raw.alerts?.service_call?.sound     ?? DEFAULT_ALERTS.service_call.sound,
      vibration: raw.alerts?.service_call?.vibration ?? DEFAULT_ALERTS.service_call.vibration,
      tone:      raw.alerts?.service_call?.tone      ?? DEFAULT_ALERTS.service_call.tone,
    },
  };
}
