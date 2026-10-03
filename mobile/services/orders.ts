/**
 * JChat 3.0 — Orders data access (Stage 3)
 * Reads orders. The app NEVER creates them: payment and order creation go through the server
 * (payments Edge Function → Stripe → stripe-webhook → create_paid_order).
 * Tables: orders, order_items (001 + 007_stage3_schema.sql, 184).
 */

import { supabase, isSupabaseConfigured } from './supabase';

export type OrderStatus =
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export type ItemStatus = 'cooking' | 'ready';

export interface OrderItemRow {
  id: string;
  order_id: string;
  menu_item_id: string;
  qty: number;
  price_cents: number;
  options: Record<string, unknown>;
  special_instructions: string | null;
  item_status: ItemStatus;
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

export async function getOrder(orderId: string): Promise<OrderRow | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as OrderRow) ?? null;
}

export async function getOrderItems(orderId: string): Promise<OrderItemRow[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('order_items')
    .select('*')
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

/** Subscribe to realtime status changes for one order. Returns an unsubscribe fn. */
export function subscribeOrder(
  orderId: string,
  onChange: (order: OrderRow) => void,
): () => void {
  if (!isSupabaseConfigured) return () => {};
  const channel = supabase
    .channel(`order:${orderId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
      (payload) => onChange(payload.new as OrderRow),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
