/**
 * JChat 3.0 — Orders data access (Stage 3)
 * Reads/creates orders. NOTE: real payment + order creation goes through the
 * server (Stripe Edge Function — Task 3.6). `createOrderRecord` here is the
 * fallback/direct path used in demo mode and by the server callback shape.
 * Tables: orders, order_items (001 + 007_stage3_schema.sql).
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
  created_at: string;
  status_updated_at: string | null;
}

export interface NewOrderInput {
  businessId: string;
  userId: string;
  roomId: string | null;
  orderType: 'table' | 'counter' | 'gift';
  giftRecipientId?: string | null;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  discountCents: number;
  totalCents: number;
  promoCode?: string | null;
  specialInstructions?: string | null;
  tableLabel?: string | null;
  items: {
    menuItemId: string;
    qty: number;
    priceCents: number;
    options?: Record<string, unknown>;
    specialInstructions?: string | null;
  }[];
}

/**
 * Create an order record + items. In production this is called by the payment
 * Edge Function AFTER the PaymentIntent is confirmed (never before payment).
 */
export async function createOrderRecord(input: NewOrderInput): Promise<OrderRow> {
  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      business_id: input.businessId,
      user_id: input.userId,
      room_id: input.roomId,
      status: 'confirmed',
      order_type: input.orderType,
      gift_recipient_id: input.giftRecipientId ?? null,
      subtotal_cents: input.subtotalCents,
      tax_cents: input.taxCents,
      tip_cents: input.tipCents,
      discount_cents: input.discountCents,
      total_cents: input.totalCents,
      promo_code: input.promoCode ?? null,
      special_instructions: input.specialInstructions ?? null,
      table_label: input.tableLabel ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;

  const orderRow = order as unknown as OrderRow;
  if (input.items.length > 0) {
    const { error: itemErr } = await supabase.from('order_items').insert(
      input.items.map((it) => ({
        order_id: orderRow.id,
        menu_item_id: it.menuItemId,
        qty: it.qty,
        price_cents: it.priceCents,
        options: it.options ?? {},
        special_instructions: it.specialInstructions ?? null,
      })),
    );
    if (itemErr) throw itemErr;
  }
  return orderRow;
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
