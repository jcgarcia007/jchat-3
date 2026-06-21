/**
 * JChat 3.0 — Kitchen Display System (KDS) — Task 3.9
 *
 * Full-screen, tablet-optimised board showing active orders in three columns:
 *   New (status=confirmed) | In Progress (status=preparing) | Ready (status=ready)
 *
 * Features:
 *  - Realtime: subscribes to `orders` AND `order_items` channels on mount,
 *    unsubscribes on unmount (architecture rule).
 *  - 30-second auto-refresh as a fallback (setInterval cleared on unmount).
 *  - Alert sound (Web Audio API beep) on new-order INSERT.
 *    TODO: replace data-URI beep with a real WAV/MP3 asset in /public/sounds/.
 *  - Mark individual item ready → order_items.item_status = 'ready'.
 *  - Mark order ready (all items done OR tap button) → orders.status = 'ready'.
 *    TODO(server): push notification to customer when order becomes ready.
 *  - Mark order delivered → orders.status = 'delivered'.
 *    TODO(server): push rating-prompt notification to customer on delivered.
 *  - Room filter dropdown (rooms belonging to the business).
 *  - Guard: isSupabaseConfigured → demo orders when no backend configured.
 *
 * Design tokens: var(--db-*) only — NO hardcoded hex.
 * Icons: @tabler/icons-react only.
 */

"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  IconChefHat,
  IconCheck,
  IconPackage,
  IconTruck,
  IconClock,
  IconRefresh,
  IconVolume,
  IconVolumeOff,
  IconAlertCircle,
  IconDoor,
  IconGift,
  IconBuildingStore,
  IconFilter,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderStatus = "confirmed" | "preparing" | "ready" | "delivered";
type ItemStatus = "cooking" | "ready";
type OrderType = "table" | "counter" | "gift" | string;

interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  qty: number;
  options: Record<string, string> | null;
  special_instructions: string | null;
  item_status: ItemStatus;
  /** Joined from menu_items (best-effort) */
  name?: string;
}

interface Order {
  id: string;
  business_id: string;
  room_id: string | null;
  status: OrderStatus;
  order_type: OrderType;
  gift_recipient_id: string | null;
  total_cents: number;
  eta_minutes: number | null;
  created_at: string;
  items: OrderItem[];
}

interface Room {
  id: string;
  name: string;
}

// ── Demo data ─────────────────────────────────────────────────────────────────

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const DEMO_ITEMS_MAP: Record<string, OrderItem[]> = {
  "demo-ord-1": [
    { id: "di-1a", order_id: "demo-ord-1", menu_item_id: "mi-1", qty: 2, options: { size: "Large" }, special_instructions: "No pickles", item_status: "cooking", name: "Classic Burger" },
    { id: "di-1b", order_id: "demo-ord-1", menu_item_id: "mi-2", qty: 1, options: null, special_instructions: null, item_status: "cooking", name: "Fries" },
  ],
  "demo-ord-2": [
    { id: "di-2a", order_id: "demo-ord-2", menu_item_id: "mi-3", qty: 1, options: { dressing: "Caesar" }, special_instructions: "Dressing on the side", item_status: "ready", name: "Caesar Salad" },
    { id: "di-2b", order_id: "demo-ord-2", menu_item_id: "mi-4", qty: 2, options: null, special_instructions: null, item_status: "cooking", name: "Sparkling Water" },
  ],
  "demo-ord-3": [
    { id: "di-3a", order_id: "demo-ord-3", menu_item_id: "mi-5", qty: 1, options: { crust: "Thin" }, special_instructions: null, item_status: "ready", name: "Margherita Pizza" },
  ],
  "demo-ord-4": [
    { id: "di-4a", order_id: "demo-ord-4", menu_item_id: "mi-6", qty: 3, options: null, special_instructions: "Extra syrup", item_status: "cooking", name: "Pancakes" },
    { id: "di-4b", order_id: "demo-ord-4", menu_item_id: "mi-7", qty: 2, options: { temp: "Iced" }, special_instructions: null, item_status: "cooking", name: "Latte" },
  ],
};

const DEMO_ORDERS: Order[] = [
  { id: "demo-ord-1", business_id: "demo-biz", room_id: "demo-room-1", status: "confirmed",  order_type: "table",   gift_recipient_id: null, total_cents: 2800, eta_minutes: 15, created_at: ago(3),  items: DEMO_ITEMS_MAP["demo-ord-1"] },
  { id: "demo-ord-2", business_id: "demo-biz", room_id: "demo-room-2", status: "preparing",  order_type: "counter", gift_recipient_id: null, total_cents: 1550, eta_minutes: 8,  created_at: ago(12), items: DEMO_ITEMS_MAP["demo-ord-2"] },
  { id: "demo-ord-3", business_id: "demo-biz", room_id: "demo-room-1", status: "ready",      order_type: "gift",    gift_recipient_id: "u-99", total_cents: 1900, eta_minutes: null, created_at: ago(20), items: DEMO_ITEMS_MAP["demo-ord-3"] },
  { id: "demo-ord-4", business_id: "demo-biz", room_id: null,           status: "confirmed",  order_type: "table",   gift_recipient_id: null, total_cents: 3200, eta_minutes: 20, created_at: ago(1),  items: DEMO_ITEMS_MAP["demo-ord-4"] },
];

const DEMO_ROOMS: Room[] = [
  { id: "all", name: "All Rooms" },
  { id: "demo-room-1", name: "Main Hall" },
  { id: "demo-room-2", name: "Bar Area" },
];

// ── Audio alert ───────────────────────────────────────────────────────────────
// Short 440 Hz beep via Web Audio API.
// TODO: replace with a real sound file at /public/sounds/new-order.mp3
//   and swap: new Audio('/sounds/new-order.mp3').play()
function playNewOrderBeep(): void {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.45);
    osc.onended = () => void ctx.close();
  } catch {
    // Audio context may be blocked before user interaction — silently ignore
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Short 8-char display ID from UUID */
function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** Elapsed time label: "2m ago", "1h 5m ago" */
function elapsed(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime();
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return "Just now";
}

/** Format options bag into readable string */
function formatOptions(options: Record<string, string> | null): string {
  if (!options) return "";
  return Object.entries(options)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

/** True when every item in the order has item_status='ready' */
function allItemsReady(order: Order): boolean {
  return order.items.length > 0 && order.items.every((it) => it.item_status === "ready");
}

// ── Column config ─────────────────────────────────────────────────────────────

interface Column {
  key: OrderStatus;
  label: string;
  accent: string; // CSS var
  bg: string;
}

const COLUMNS: Column[] = [
  { key: "confirmed", label: "New",         accent: "var(--db-warning)", bg: "rgba(217,119,6,0.08)" },
  { key: "preparing", label: "In Progress", accent: "var(--db-accent)",  bg: "var(--db-accent-bg)"   },
  { key: "ready",     label: "Ready",       accent: "var(--db-success)", bg: "rgba(29,158,117,0.08)" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function OrderTypeIcon({ type }: { type: OrderType }) {
  if (type === "gift") return <IconGift size={14} />;
  if (type === "counter") return <IconBuildingStore size={14} />;
  return <IconDoor size={14} />;
}

interface OrderCardProps {
  order: Order;
  onItemReady: (orderId: string, itemId: string) => void;
  onMarkReady: (orderId: string) => void;
  onMarkDelivered: (orderId: string) => void;
  isBusy: boolean;
}

function OrderCard({ order, onItemReady, onMarkReady, onMarkDelivered, isBusy }: OrderCardProps) {
  const [elapsedLabel, setElapsedLabel] = useState(() => elapsed(order.created_at));

  // Update elapsed timer every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedLabel(elapsed(order.created_at));
    }, 30_000);
    return () => clearInterval(interval);
  }, [order.created_at]);

  const canMarkReady = order.status === "preparing" || (order.status === "confirmed" && allItemsReady(order));
  const canMarkDelivered = order.status === "ready";

  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "12px",
        padding: "16px",
        marginBottom: "14px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
      }}
    >
      {/* Card header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontWeight: 700, fontSize: "15px", color: "var(--db-text-primary)", fontFamily: "monospace" }}>
            #{shortId(order.id)}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "12px", color: "var(--db-text-secondary)", textTransform: "capitalize" }}>
            <OrderTypeIcon type={order.order_type} />
            {order.order_type === "gift" ? "Gift" : order.order_type}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--db-text-secondary)" }}>
          <IconClock size={13} />
          {elapsedLabel}
        </div>
      </div>

      {/* ETA chip */}
      {order.eta_minutes != null && (
        <div style={{ fontSize: "11px", color: "var(--db-warning)", fontWeight: 600, marginBottom: "10px" }}>
          ETA {order.eta_minutes} min
        </div>
      )}

      {/* Items */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
        {order.items.map((item) => {
          const isReady = item.item_status === "ready";
          return (
            <div
              key={item.id}
              onClick={() => !isReady && !isBusy && onItemReady(order.id, item.id)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                padding: "8px 10px",
                borderRadius: "8px",
                background: isReady ? "rgba(29,158,117,0.10)" : "var(--db-bg-base)",
                border: `1px solid ${isReady ? "var(--db-success)" : "var(--db-border)"}`,
                cursor: isReady ? "default" : "pointer",
                transition: "opacity 0.15s",
                opacity: isBusy ? 0.6 : 1,
              }}
              role={isReady ? undefined : "button"}
              aria-label={isReady ? undefined : `Mark ${item.name ?? "item"} ready`}
            >
              {/* Status dot */}
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isReady ? "var(--db-success)" : "var(--db-border)",
                  marginTop: "1px",
                }}
              >
                {isReady && <IconCheck size={13} color="white" />}
              </div>

              {/* Item info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--db-text-primary)", display: "flex", gap: "6px", alignItems: "baseline" }}>
                  <span style={{ color: "var(--db-accent)", fontWeight: 700 }}>×{item.qty}</span>
                  {item.name ?? `Item ${item.menu_item_id.slice(0, 6)}`}
                </div>
                {item.options && (
                  <div style={{ fontSize: "11px", color: "var(--db-text-secondary)", marginTop: "2px" }}>
                    {formatOptions(item.options)}
                  </div>
                )}
                {item.special_instructions && (
                  <div style={{ fontSize: "11px", color: "var(--db-warning)", marginTop: "2px", fontStyle: "italic" }}>
                    ⚠ {item.special_instructions}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "8px" }}>
        {canMarkReady && (
          <button
            onClick={() => !isBusy && onMarkReady(order.id)}
            disabled={isBusy}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "8px",
              borderRadius: "8px",
              border: "none",
              background: "var(--db-success)",
              color: "white",
              fontWeight: 600,
              fontSize: "13px",
              cursor: isBusy ? "not-allowed" : "pointer",
              opacity: isBusy ? 0.6 : 1,
            }}
          >
            <IconPackage size={15} />
            Mark Ready
          </button>
        )}
        {canMarkDelivered && (
          <button
            onClick={() => !isBusy && onMarkDelivered(order.id)}
            disabled={isBusy}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "8px",
              borderRadius: "8px",
              border: "none",
              background: "var(--db-accent)",
              color: "white",
              fontWeight: 600,
              fontSize: "13px",
              cursor: isBusy ? "not-allowed" : "pointer",
              opacity: isBusy ? 0.6 : 1,
            }}
          >
            <IconTruck size={15} />
            Delivered
          </button>
        )}
      </div>
    </div>
  );
}

// ── Column panel ──────────────────────────────────────────────────────────────

interface ColumnPanelProps {
  col: Column;
  orders: Order[];
  onItemReady: (orderId: string, itemId: string) => void;
  onMarkReady: (orderId: string) => void;
  onMarkDelivered: (orderId: string) => void;
  busyOrderId: string | null;
}

function ColumnPanel({ col, orders, onItemReady, onMarkReady, onMarkDelivered, busyOrderId }: ColumnPanelProps) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      {/* Column header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderRadius: "12px 12px 0 0",
          background: col.bg,
          border: `1px solid ${col.accent}`,
          borderBottom: "none",
          marginBottom: 0,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: "15px", color: col.accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {col.label}
        </span>
        <span
          style={{
            background: col.accent,
            color: "white",
            borderRadius: "20px",
            padding: "2px 10px",
            fontSize: "13px",
            fontWeight: 700,
            minWidth: 28,
            textAlign: "center",
          }}
        >
          {orders.length}
        </span>
      </div>

      {/* Orders scroll area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "14px",
          background: "var(--db-bg-base)",
          border: `1px solid ${col.accent}`,
          borderTop: "none",
          borderRadius: "0 0 12px 12px",
          minHeight: 0,
        }}
      >
        {orders.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "48px 0",
              color: "var(--db-text-secondary)",
              fontSize: "13px",
            }}
          >
            No orders
          </div>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onItemReady={onItemReady}
              onMarkReady={onMarkReady}
              onMarkDelivered={onMarkDelivered}
              isBusy={busyOrderId === order.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function KDSPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [rooms, setRooms] = useState<Room[]>([{ id: "all", name: "All Rooms" }]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("all");
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const ordersChannelRef = useRef<RealtimeChannel | null>(null);
  const itemsChannelRef = useRef<RealtimeChannel | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // Resolve the signed-in owner's business (most recent).
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [needsRegister, setNeedsRegister] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    void resolveActiveBusiness().then((res) => {
      if (!active) return;
      if (res.ok) setBusinessId(res.business.id);
      else if (res.reason === "no_business" || res.reason === "unauthenticated") setNeedsRegister(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // ── Load rooms ──────────────────────────────────────────────────────────────

  const loadRooms = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setRooms(DEMO_ROOMS);
      return;
    }
    if (!businessId) return;
    const { data, error: err } = await supabase
      .from("rooms")
      .select("id, name")
      .eq("business_id", businessId)
      .order("name");
    if (err) return; // Non-fatal — keep the default "All Rooms" entry
    setRooms([{ id: "all", name: "All Rooms" }, ...(data ?? [])]);
  }, [businessId]);

  // ── Load orders ─────────────────────────────────────────────────────────────

  const loadOrders = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setOrders(DEMO_ORDERS);
      setLastRefreshed(new Date());
      return;
    }

    if (!businessId) {
      setOrders([]);
      return;
    }

    setIsRefreshing(true);
    setError(null);

    try {
      // Fetch active orders (exclude delivered — they leave the board)
      let query = supabase
        .from("orders")
        .select("id, business_id, room_id, status, order_type, gift_recipient_id, total_cents, eta_minutes, created_at")
        .eq("business_id", businessId)
        .in("status", ["confirmed", "preparing", "ready"])
        .order("created_at", { ascending: true });

      if (selectedRoomId !== "all") {
        query = query.eq("room_id", selectedRoomId);
      }

      const { data: ordersData, error: ordErr } = await query;
      if (ordErr) throw ordErr;

      const rawOrders = (ordersData ?? []) as Omit<Order, "items">[];

      if (rawOrders.length === 0) {
        setOrders([]);
        setLastRefreshed(new Date());
        return;
      }

      // Fetch all items for these orders in a single query
      const orderIds = rawOrders.map((o) => o.id);
      const { data: itemsData, error: itemErr } = await supabase
        .from("order_items")
        .select("id, order_id, menu_item_id, qty, options, special_instructions, item_status, menu_items(name)")
        .in("order_id", orderIds);

      if (itemErr) throw itemErr;

      // Group items by order_id
      // Supabase returns the joined `menu_items` as an array for one-to-many selects.
      type RawOrderItem = {
        id: string;
        order_id: string;
        menu_item_id: string;
        qty: number;
        options: Record<string, string> | null;
        special_instructions: string | null;
        item_status: ItemStatus;
        menu_items?: { name: string }[] | { name: string } | null;
      };
      const itemsByOrder: Record<string, OrderItem[]> = {};
      for (const raw of itemsData ?? []) {
        const it = (raw as unknown) as RawOrderItem;
        // Handle both array (one-to-many join) and object (PostgREST inner join) shapes
        const menuItem = Array.isArray(it.menu_items)
          ? (it.menu_items[0] ?? null)
          : (it.menu_items ?? null);
        const item: OrderItem = {
          id: it.id,
          order_id: it.order_id,
          menu_item_id: it.menu_item_id,
          qty: it.qty,
          options: it.options,
          special_instructions: it.special_instructions,
          item_status: it.item_status,
          name: menuItem?.name,
        };
        if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
        itemsByOrder[it.order_id].push(item);
      }

      const combined: Order[] = rawOrders.map((o) => ({
        ...o,
        items: itemsByOrder[o.id] ?? [],
      }));

      setOrders(combined);
      setLastRefreshed(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to load orders: ${msg}`);
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedRoomId, businessId]);

  // ── Realtime subscriptions ──────────────────────────────────────────────────

  const setupRealtime = useCallback(() => {
    if (!isSupabaseConfigured || !businessId) return;

    // Tear down any existing channels before re-subscribing
    if (ordersChannelRef.current) {
      void supabase.removeChannel(ordersChannelRef.current);
      ordersChannelRef.current = null;
    }
    if (itemsChannelRef.current) {
      void supabase.removeChannel(itemsChannelRef.current);
      itemsChannelRef.current = null;
    }

    // Subscribe to orders table
    ordersChannelRef.current = supabase
      .channel(`kds-orders-${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          // Play beep on new order insert
          if (payload.eventType === "INSERT" && soundEnabledRef.current) {
            playNewOrderBeep();
          }
          // Refresh the full list on any change
          void loadOrders();
        }
      )
      .subscribe();

    // Subscribe to order_items table (item status changes)
    itemsChannelRef.current = supabase
      .channel(`kds-order-items-${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "order_items",
        },
        () => {
          // Patch local state by refreshing — keeps logic simple and consistent
          void loadOrders();
        }
      )
      .subscribe();
  }, [loadOrders, businessId]);

  // ── 30-second auto-refresh fallback ────────────────────────────────────────

  const startRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(() => {
      void loadOrders();
    }, 30_000);
  }, [loadOrders]);

  // ── Effects ─────────────────────────────────────────────────────────────────

  // Initial load
  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  // Wire up realtime + 30s fallback after first load
  useEffect(() => {
    setupRealtime();
    startRefreshTimer();

    return () => {
      // Unsubscribe on unmount — required per architecture rules
      if (ordersChannelRef.current) {
        void supabase.removeChannel(ordersChannelRef.current);
        ordersChannelRef.current = null;
      }
      if (itemsChannelRef.current) {
        void supabase.removeChannel(itemsChannelRef.current);
        itemsChannelRef.current = null;
      }
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoomId, businessId]);

  // ── Order actions ───────────────────────────────────────────────────────────

  const handleItemReady = useCallback(
    async (orderId: string, itemId: string) => {
      if (!isSupabaseConfigured) {
        // Demo mode: flip item status locally
        setOrders((prev) =>
          prev.map((o) =>
            o.id !== orderId
              ? o
              : {
                  ...o,
                  items: o.items.map((it) =>
                    it.id === itemId ? { ...it, item_status: "ready" as ItemStatus } : it
                  ),
                }
          )
        );
        return;
      }

      setBusyOrderId(orderId);
      try {
        const { error: err } = await supabase
          .from("order_items")
          .update({ item_status: "ready" })
          .eq("id", itemId);
        if (err) throw err;
        // Realtime will trigger a refresh; optimistic update locally too
        setOrders((prev) =>
          prev.map((o) =>
            o.id !== orderId
              ? o
              : {
                  ...o,
                  items: o.items.map((it) =>
                    it.id === itemId ? { ...it, item_status: "ready" as ItemStatus } : it
                  ),
                }
          )
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Item update failed: ${msg}`);
      } finally {
        setBusyOrderId(null);
      }
    },
    []
  );

  const handleMarkReady = useCallback(
    async (orderId: string) => {
      if (!isSupabaseConfigured) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: "ready" as OrderStatus } : o))
        );
        return;
      }

      setBusyOrderId(orderId);
      try {
        // Mark all items ready first
        const { error: itemErr } = await supabase
          .from("order_items")
          .update({ item_status: "ready" })
          .eq("order_id", orderId);
        if (itemErr) throw itemErr;

        // Then update order status
        const { error: ordErr } = await supabase
          .from("orders")
          .update({ status: "ready" })
          .eq("id", orderId);
        if (ordErr) throw ordErr;

        // TODO(server): push notification to customer — "Your order is ready!"
        // Example: await supabase.functions.invoke('notify-customer', {
        //   body: { order_id: orderId, event: 'order_ready' }
        // })

        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: "ready" as OrderStatus,
                  items: o.items.map((it) => ({ ...it, item_status: "ready" as ItemStatus })),
                }
              : o
          )
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to mark order ready: ${msg}`);
      } finally {
        setBusyOrderId(null);
      }
    },
    []
  );

  const handleMarkDelivered = useCallback(
    async (orderId: string) => {
      if (!isSupabaseConfigured) {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
        return;
      }

      setBusyOrderId(orderId);
      try {
        const { error: err } = await supabase
          .from("orders")
          .update({ status: "delivered" })
          .eq("id", orderId);
        if (err) throw err;

        // TODO(server): push rating-prompt notification to customer on delivered
        // Example: await supabase.functions.invoke('notify-customer', {
        //   body: { order_id: orderId, event: 'order_delivered' }
        // })

        // Remove from board — delivered orders leave the KDS view
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to mark order delivered: ${msg}`);
      } finally {
        setBusyOrderId(null);
      }
    },
    []
  );

  // ── Derived state ───────────────────────────────────────────────────────────

  const filteredOrders =
    selectedRoomId === "all"
      ? orders
      : orders.filter((o) => o.room_id === selectedRoomId);

  const columnOrders = (status: OrderStatus) =>
    filteredOrders.filter((o) => o.status === status);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (needsRegister) {
    return (
      <div style={{ maxWidth: "960px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "16px" }}>
          Kitchen Display
        </h1>
        <NoBusinessCTA message="Register your business to start receiving and preparing orders." />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 64px)", // subtract TopBar height
        gap: 0,
        overflow: "hidden",
      }}
    >
      {/* ── Toolbar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px 0 16px",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {/* Title */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginRight: "auto" }}>
          <IconChefHat size={22} color="var(--db-accent)" />
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
            Kitchen Display
          </h1>
          {!isSupabaseConfigured && (
            <span
              style={{
                fontSize: "11px",
                background: "var(--db-accent-bg)",
                color: "var(--db-accent)",
                borderRadius: "20px",
                padding: "2px 8px",
                fontWeight: 600,
              }}
            >
              DEMO
            </span>
          )}
        </div>

        {/* Room filter */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <IconFilter size={15} color="var(--db-text-secondary)" />
          <select
            value={selectedRoomId}
            onChange={(e) => setSelectedRoomId(e.target.value)}
            style={{
              background: "var(--db-bg-surface)",
              border: "1px solid var(--db-border)",
              borderRadius: "8px",
              color: "var(--db-text-primary)",
              padding: "6px 10px",
              fontSize: "13px",
              cursor: "pointer",
              outline: "none",
            }}
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        {/* Sound toggle */}
        <button
          onClick={() => setSoundEnabled((s) => !s)}
          title={soundEnabled ? "Mute alert sound" : "Enable alert sound"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            padding: "6px 12px",
            borderRadius: "8px",
            border: "1px solid var(--db-border)",
            background: soundEnabled ? "var(--db-accent-bg)" : "var(--db-bg-surface)",
            color: soundEnabled ? "var(--db-accent)" : "var(--db-text-secondary)",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          {soundEnabled ? <IconVolume size={15} /> : <IconVolumeOff size={15} />}
          {soundEnabled ? "Sound On" : "Sound Off"}
        </button>

        {/* Manual refresh */}
        <button
          onClick={() => void loadOrders()}
          disabled={isRefreshing}
          title="Refresh now"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            padding: "6px 12px",
            borderRadius: "8px",
            border: "1px solid var(--db-border)",
            background: "var(--db-bg-surface)",
            color: "var(--db-text-secondary)",
            cursor: isRefreshing ? "not-allowed" : "pointer",
            fontSize: "13px",
            opacity: isRefreshing ? 0.6 : 1,
          }}
        >
          <IconRefresh size={15} style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>

        {/* Last refreshed */}
        <span style={{ fontSize: "11px", color: "var(--db-text-secondary)" }}>
          Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 14px",
            borderRadius: "8px",
            background: "rgba(239,68,68,0.10)",
            border: "1px solid var(--db-danger)",
            color: "var(--db-danger)",
            fontSize: "13px",
            marginBottom: "12px",
            flexShrink: 0,
          }}
        >
          <IconAlertCircle size={16} />
          {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--db-danger)", cursor: "pointer", fontSize: "18px", lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

      {/* ── Three-column board ── */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "16px",
          minHeight: 0,
        }}
      >
        {COLUMNS.map((col) => (
          <ColumnPanel
            key={col.key}
            col={col}
            orders={columnOrders(col.key)}
            onItemReady={handleItemReady}
            onMarkReady={handleMarkReady}
            onMarkDelivered={handleMarkDelivered}
            busyOrderId={busyOrderId}
          />
        ))}
      </div>

      {/* Spin keyframe injected inline */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
