/**
 * JChat 3.0 — delete-account for a venue OWNER (D4). Import-free orchestration, so a Deno test can drive it with fakes.
 *
 * Decisions (Juan, 2026-11-06): the owner's venues are CLOSED, not deleted (orders, payments and receipts stay 7 years without personal data);
 * open orders / open tables BLOCK; any Stripe Connect balance (available or pending) > 0 BLOCKS, no threshold; the Stripe subscription is cancelled at
 * once without proration or refund; Connect is disconnected; employees and customers with a future reservation are notified.
 *
 * Order (nothing irreversible happens before step 3, and nothing is closed unless the subscription is gone):
 *   preflight  1. open orders / tabs            → 409 owner_open_orders
 *              2. Connect balance per venue     → 409 stripe_balance_pending (amounts) · 502 stripe_balance_check_failed
 *   close      3. cancel the Stripe subscription → 502 subscription_cancel_failed (NOTHING closed)
 *              4. owner_close_business per venue → 409 owner_open_orders (race) · 500 owner_close_failed (state in the answer)
 *              5. disconnect Connect per venue   (best effort: a failure is logged, the venue is already closed in our database)
 * Steps 4 and 5 are swapped from the first spec on purpose: a race on open orders must never leave an OPEN venue with its Stripe account deleted.
 * Retrying after any failure is safe: cancelled subscriptions / deleted accounts / closed venues are recognised and skipped.
 * Never logged or returned: Stripe ids of customers, tokens, keys.
 */

export interface OwnedBusiness {
  id: string;
  name: string;
  city: string | null;
  stripe_account_id: string | null;
}

export interface OpenItem {
  business_id: string;
  business_name: string;
  kind: "orders" | "tabs";
  n: number;
}

export interface MoneyLine {
  currency: string;
  amount: number; // minor units (cents)
}

export interface BalancePerBusiness {
  business_id: string;
  business_name: string;
  currency: string;
  amount: number;
}

export interface CloseResult {
  already?: boolean;
  email_ids?: string[];
}

export interface OwnerDeps {
  /** Venues the user still owns (status of the venue does not matter: an admin-closed venue still has its owner until now). */
  listOwned(userId: string): Promise<OwnedBusiness[]>;
  /** RPC owner_open_orders. */
  openOrders(userId: string): Promise<OpenItem[]>;
  /** users.stripe_subscription_id, or null. */
  subscriptionId(userId: string): Promise<string | null>;
  /** RPC owner_close_business. Throws an Error whose message is the SQL exception text (e.g. "owner_open_orders"). */
  closeBusiness(businessId: string, userId: string): Promise<CloseResult>;
  /** security_logs insert. Must not throw. */
  log(action: string, targetId: string | null, detail: string | null): Promise<void>;
  stripe: {
    /** Connect balance of an account. */
    balance(accountId: string): Promise<{ available: MoneyLine[]; pending: MoneyLine[] }>;
    /** Cancel now, no proration, no refund. */
    cancelSubscription(subscriptionId: string): Promise<void>;
    /** Delete / disconnect the connected account. */
    disconnectAccount(accountId: string): Promise<void>;
  };
}

export type Preflight =
  | { kind: "not_owner" }
  | { kind: "ok"; businesses: { id: string; name: string; city: string | null }[] }
  | { kind: "blocked"; status: number; code: "owner_open_orders"; open: OpenItem[] }
  | { kind: "blocked"; status: number; code: "stripe_balance_pending"; balances: BalancePerBusiness[] }
  | { kind: "blocked"; status: number; code: "stripe_balance_check_failed" };

function errorCode(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "";
}

/** The connected account is already gone (a previous try deleted it): that is zero balance / already disconnected, not an error. */
export function isStripeGone(e: unknown): boolean {
  const msg = String((e as { message?: unknown } | null)?.message ?? "");
  return errorCode(e) === "resource_missing" || errorCode(e) === "account_invalid" ||
    /(does not exist|no such|not connected|has been deleted|was deleted)/i.test(msg);
}

function isSubscriptionGone(e: unknown): boolean {
  const msg = String((e as { message?: unknown } | null)?.message ?? "");
  return errorCode(e) === "resource_missing" || /(already (been )?cancel|no such subscription)/i.test(msg);
}

/** Steps 1 and 2. Changes nothing. */
export async function ownerPreflight(deps: OwnerDeps, userId: string): Promise<Preflight> {
  const owned = await deps.listOwned(userId);
  if (owned.length === 0) return { kind: "not_owner" };

  const open = await deps.openOrders(userId);
  if (open.length > 0) return { kind: "blocked", status: 409, code: "owner_open_orders", open };

  const balances: BalancePerBusiness[] = [];
  for (const b of owned) {
    if (!b.stripe_account_id) continue;
    let bal: { available: MoneyLine[]; pending: MoneyLine[] };
    try {
      bal = await deps.stripe.balance(b.stripe_account_id);
    } catch (e) {
      if (isStripeGone(e)) continue;
      await deps.log("owner_delete_balance_check_failed", b.id, errorCode(e) || "stripe_error");
      return { kind: "blocked", status: 502, code: "stripe_balance_check_failed" };
    }
    const byCurrency = new Map<string, number>();
    for (const l of [...bal.available, ...bal.pending]) {
      byCurrency.set(l.currency, (byCurrency.get(l.currency) ?? 0) + l.amount);
    }
    for (const [currency, amount] of byCurrency) {
      if (amount > 0) balances.push({ business_id: b.id, business_name: b.name, currency, amount });
    }
  }
  if (balances.length > 0) return { kind: "blocked", status: 409, code: "stripe_balance_pending", balances };

  return { kind: "ok", businesses: owned.map((b) => ({ id: b.id, name: b.name, city: b.city })) };
}

export interface OwnerCloseState {
  subscriptionCancelled: boolean;
  closed: number;
  total: number;
}

export type OwnerClose =
  | { ok: true; state: OwnerCloseState; emailIds: string[] }
  | { ok: false; status: number; code: "subscription_cancel_failed" | "owner_close_failed" | "owner_open_orders"; state: OwnerCloseState };

/** Steps 3, 4 and 5. Call it only after a preflight "ok". */
export async function closeOwnerBusinesses(deps: OwnerDeps, userId: string): Promise<OwnerClose> {
  const owned = await deps.listOwned(userId);
  const state: OwnerCloseState = { subscriptionCancelled: false, closed: 0, total: owned.length };

  // 3. subscription
  const subId = await deps.subscriptionId(userId);
  if (subId) {
    try {
      await deps.stripe.cancelSubscription(subId);
      state.subscriptionCancelled = true;
    } catch (e) {
      if (isSubscriptionGone(e)) {
        state.subscriptionCancelled = true;
      } else {
        await deps.log("owner_delete_subscription_cancel_failed", null, errorCode(e) || "stripe_error");
        return { ok: false, status: 502, code: "subscription_cancel_failed", state };
      }
    }
  }

  // 4. close every venue (DB)
  const emailIds: string[] = [];
  for (const b of owned) {
    try {
      const res = await deps.closeBusiness(b.id, userId);
      state.closed += 1;
      emailIds.push(...(res.email_ids ?? []));
    } catch (e) {
      const msg = String((e as { message?: unknown } | null)?.message ?? "");
      const raced = msg.includes("owner_open_orders");
      await deps.log("owner_close_partial", b.id, `${raced ? "open_orders" : "db_error"};subscription:${state.subscriptionCancelled ? "cancelled" : "none"};closed:${state.closed}/${state.total}`);
      return { ok: false, status: raced ? 409 : 500, code: raced ? "owner_open_orders" : "owner_close_failed", state };
    }
  }

  // 5. disconnect Connect (the venue is already closed: a failure here is logged and does not block)
  for (const b of owned) {
    if (!b.stripe_account_id) continue;
    try {
      await deps.stripe.disconnectAccount(b.stripe_account_id);
      await deps.log("stripe_connect_disconnected", b.id, null);
    } catch (e) {
      await deps.log(isStripeGone(e) ? "stripe_connect_disconnected" : "stripe_connect_disconnect_failed", b.id, isStripeGone(e) ? "already_gone" : (errorCode(e) || "stripe_error"));
    }
  }

  return { ok: true, state, emailIds };
}
