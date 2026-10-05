/**
 * JChat 3.0 — Orders data access (Stage 3)
 * Reads orders. The app NEVER creates them: payment and order creation go through the server
 * (payments Edge Function → Stripe → stripe-webhook → create_paid_order).
 * Tables: orders, order_items (001 + 007_stage3_schema.sql, 184).
 */

import { supabase, isSupabaseConfigured } from './supabase';

/** orders.status (CHECK constraint, migration 184). */
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled'
  | 'disputed';

/** orders.approval_status: only orders that need the business's approval carry one. */
export type ApprovalStatus = 'awaiting' | 'approved' | 'rejected';

/** order_items.item_status (CHECK constraint). */
export type ItemStatus = 'pending' | 'preparing' | 'ready';

/** An embedded `businesses(name)` / `menu_items(name)` relation, as PostgREST returns it. */
type EmbeddedName = { name: string | null } | { name: string | null }[] | null | undefined;

function embeddedName(value: EmbeddedName): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name ?? null;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  menu_item_id: string;
  qty: number;
  price_cents: number;
  options: Record<string, unknown>;
  special_instructions: string | null;
  item_status: ItemStatus;
  /** Joined menu item (the name is NOT stored on the order item). */
  menu_items?: EmbeddedName;
}

/** The item's display name from the joined menu item, or null if it can't be resolved. */
export function orderItemName(item: OrderItemRow): string | null {
  return embeddedName(item.menu_items);
}

export interface OrderRow {
  id: string;
  business_id: string;
  user_id: string;
  room_id: string | null;
  status: OrderStatus;
  order_type: 'table' | 'counter' | 'gift';
  gift_recipient_id: string | null;
  subtotal_cents: number;
  tax_cents: number;
  tip_cents: number;
  discount_cents: number;
  total_cents: number;
  promo_code: string | null;
  eta_minutes: number | null;
  special_instructions: string | null;
  table_label: string | null;
  stripe_pi_id: string | null;
  approval_status?: ApprovalStatus | null;
  rejected_reason?: string | null;
  /** Joined business. */
  businesses?: EmbeddedName;
  /** Human-readable number (migration 184). */
  order_number: number | null;
  created_at: string;
  status_updated_at: string | null;
}

/** What PaymentSuccess needs once the webhook has created the paid order. */
export interface PaidOrderSummary {
  id: string;
  order_number: number | null;
  order_type: 'table' | 'counter' | 'gift';
  business_id: string;
  room_id: string | null;
  business_name: string | null;
}

/**
 * Find the order the webhook created for a PaymentIntent (orders.stripe_pi_id). It appears a
 * moment AFTER payment, so callers poll. The app never creates orders: the server does,
 * atomically (create_paid_order).
 */
export async function getOrderByPaymentIntent(paymentIntentId: string): Promise<PaidOrderSummary | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, order_type, business_id, room_id, businesses(name)')
    .eq('stripe_pi_id', paymentIntentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as {
    id: string; order_number: number | null; order_type: PaidOrderSummary['order_type'];
    business_id: string; room_id: string | null;
    businesses: { name: string | null } | { name: string | null }[] | null;
  };
  const business = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;
  return {
    id: row.id,
    order_number: row.order_number,
    order_type: row.order_type,
    business_id: row.business_id,
    room_id: row.room_id,
    business_name: business?.name ?? null,
  };
}

/** The business name of an order row (needs the joined `businesses(name)`). */
export function orderBusinessName(order: Pick<OrderRow, 'businesses'>): string | null {
  return embeddedName(order.businesses);
}

export async function getOrder(orderId: string): Promise<OrderRow | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('orders')
    .select('*, businesses(name)')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as OrderRow) ?? null;
}

export async function getOrderItems(orderId: string): Promise<OrderItemRow[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('order_items')
    .select('*, menu_items(name)')
    .eq('order_id', orderId);
  if (error) throw error;
  return (data ?? []) as unknown as OrderItemRow[];
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ status, status_updated_at: new Date().toISOString() })
    .eq('id', orderId);
  if (error) throw error;
}

/** One row of "My orders". */
export interface MyOrderRow {
  id: string;
  order_number: number | null;
  status: OrderStatus;
  approval_status: ApprovalStatus | null;
  total_cents: number;
  created_at: string;
  order_type: 'table' | 'counter' | 'gift';
  room_id: string | null;
  businesses?: EmbeddedName;
}

/** The signed-in user's own orders, newest first (RLS: user_id = auth.uid()). */
export async function listMyOrders(userId: string): Promise<MyOrderRow[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, status, approval_status, total_cents, created_at, order_type, room_id, businesses(name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as MyOrderRow[];
}

export function myOrderBusinessName(order: Pick<MyOrderRow, 'businesses'>): string | null {
  return embeddedName(order.businesses);
}

/**
 * Subscribe to realtime status changes for one order. Returns an unsubscribe fn.
 * `onSubscribed` fires once the channel is live: the caller refetches then, so an update
 * that landed between the first read and the subscription is not lost.
 */
export function subscribeOrder(
  orderId: string,
  onChange: (order: OrderRow) => void,
  onSubscribed?: () => void,
): () => void {
  if (!isSupabaseConfigured) return () => {};
  const channel = supabase
    .channel(`order:${orderId}:${Date.now()}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
      (payload) => onChange(payload.new as OrderRow),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onSubscribed?.();
    });
  return () => {
    void supabase.removeChannel(channel);
  };
}


// ── Order notices (migration 200) ─────────────────────────────────────────────

export type OrderNoticeKind = 'on_my_way' | 'arrived' | 'question';

/** Stable error codes of order_notify_staff that have a translated message. */
export type OrderNoticeError = 'notice_cooldown' | 'notice_limit' | 'order_closed' | 'not_your_order' | 'other';

/**
 * "Avisar al local" about an ALREADY PAID order (any order type, no location needed). Only the order's
 * owner can send it; the server enforces the cooldown/limits. Never throws: returns the error code.
 */
export async function notifyOrderStaff(
  orderId: string,
  kind: OrderNoticeKind,
  note?: string,
): Promise<{ ok: true } | { ok: false; error: OrderNoticeError }> {
  const { error } = await supabase.rpc('order_notify_staff' as never, {
    p_order_id: orderId,
    p_kind: kind,
    p_note: note?.trim() || null,
  } as never);
  if (!error) return { ok: true };
  const message = String((error as { message?: unknown }).message ?? '');
  const known = (['notice_cooldown', 'notice_limit', 'order_closed', 'not_your_order'] as const).find((c) => message.includes(c));
  return { ok: false, error: known ?? 'other' };
}


// ── Orders in progress (migration 201) ────────────────────────────────────────

export interface ActiveOrder {
  id: string;
  order_number: number;
  business_id: string;
  business_name: string | null;
  status: string;
  order_type: 'table' | 'counter' | 'gift';
  table_label: string | null;
  status_updated_at: string | null;
  created_at: string;
}

/** My orders not yet delivered (last 12 h; "ready" hides after 3 h). Server-filtered by auth.uid(). */
export async function myActiveOrders(): Promise<ActiveOrder[]> {
  const { data, error } = await supabase.rpc('my_active_orders' as never);
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as ActiveOrder[];
}
