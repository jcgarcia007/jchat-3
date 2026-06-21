"use client";

/**
 * JChat 3.0 — Kitchen Display System (KDS)
 * Kanban board (Pending | Preparing) of active orders for the signed-in owner's
 * business. Order cards show number, elapsed time and items; status buttons move
 * them forward (Start Preparing → Mark Ready). Supabase Realtime + 30s fallback.
 * Uses --db-* tokens only. RLS: business owner reads/updates own orders.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  IconChefHat,
  IconClock,
  IconPlayerPlay,
  IconCircleCheck,
  IconRefresh,
  IconAlertCircle,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

interface KdsItem {
  id: string;
  qty: number;
  name: string;
  special_instructions: string | null;
}

interface KdsOrder {
  id: string;
  status: string; // pending|confirmed|preparing
  created_at: string;
  order_type: string | null;
  items: KdsItem[];
}

const PENDING_STATUSES = ["pending", "confirmed"];

function elapsed(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

const DEMO_ORDERS: KdsOrder[] = [
  {
    id: "demo-ord-1", status: "confirmed", order_type: "table", created_at: new Date(Date.now() - 180000).toISOString(),
    items: [
      { id: "a", qty: 2, name: "Classic Burger", special_instructions: "No pickles" },
      { id: "b", qty: 1, name: "Fries", special_instructions: null },
    ],
  },
  {
    id: "demo-ord-2", status: "preparing", order_type: "counter", created_at: new Date(Date.now() - 720000).toISOString(),
    items: [{ id: "c", qty: 1, name: "Caesar Salad", special_instructions: "Dressing on the side" }],
  },
];

export default function KdsPage() {
  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsRegister, setNeedsRegister] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [, forceTick] = useState(0); // re-render so elapsed times tick

  const businessIdRef = useRef<string | null>(null);
  const ordersChannelRef = useRef<RealtimeChannel | null>(null);
  const itemsChannelRef = useRef<RealtimeChannel | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadOrders = useCallback(async (bizId: string) => {
    const { data: ordersData, error: ordErr } = await supabase
      .from("orders")
      .select("id, status, created_at, order_type")
      .eq("business_id", bizId)
      .in("status", [...PENDING_STATUSES, "preparing"])
      .order("created_at", { ascending: true });
    if (ordErr) throw ordErr;

    const base = (ordersData ?? []) as Omit<KdsOrder, "items">[];
    let itemsByOrder: Record<string, KdsItem[]> = {};
    if (base.length > 0) {
      const { data: itemsData, error: itemErr } = await supabase
        .from("order_items")
        .select("id, order_id, qty, special_instructions, menu_items(name)")
        .in("order_id", base.map((o) => o.id));
      if (itemErr) throw itemErr;
      itemsByOrder = (itemsData ?? []).reduce((acc: Record<string, KdsItem[]>, raw) => {
        const r = raw as unknown as {
          id: string; order_id: string; qty: number;
          special_instructions: string | null; menu_items: { name: string } | { name: string }[] | null;
        };
        const mi = Array.isArray(r.menu_items) ? r.menu_items[0] : r.menu_items;
        (acc[r.order_id] ||= []).push({ id: r.id, qty: r.qty, name: mi?.name ?? "Item", special_instructions: r.special_instructions });
        return acc;
      }, {});
    }
    setOrders(base.map((o) => ({ ...o, items: itemsByOrder[o.id] ?? [] })));
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!isSupabaseConfigured) {
        setOrders(DEMO_ORDERS);
        setLoading(false);
        return;
      }
      try {
        const res = await resolveActiveBusiness();
        if (!active) return;
        if (!res.ok) {
          if (res.reason === "no_business" || res.reason === "unauthenticated") setNeedsRegister(true);
          else setError(res.message);
          setLoading(false);
          return;
        }
        const bid = res.business.id;
        businessIdRef.current = bid;
        await loadOrders(bid);

        // Realtime — orders + order_items.
        ordersChannelRef.current = supabase
          .channel(`kds-orders-${bid}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `business_id=eq.${bid}` }, () => {
            void loadOrders(bid).catch(() => {});
          })
          .subscribe();
        itemsChannelRef.current = supabase
          .channel(`kds-items-${bid}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
            void loadOrders(bid).catch(() => {});
          })
          .subscribe();

        // 30s fallback refresh + elapsed-time tick.
        timerRef.current = setInterval(() => {
          forceTick((t) => t + 1);
          if (businessIdRef.current) void loadOrders(businessIdRef.current).catch(() => {});
        }, 30_000);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load orders.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      if (ordersChannelRef.current) void supabase.removeChannel(ordersChannelRef.current);
      if (itemsChannelRef.current) void supabase.removeChannel(itemsChannelRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loadOrders]);

  async function setStatus(order: KdsOrder, status: "preparing" | "ready") {
    setUpdatingId(order.id);
    setError(null);
    if (!isSupabaseConfigured) {
      // Demo: move locally (ready leaves the board).
      setOrders((prev) =>
        status === "ready" ? prev.filter((o) => o.id !== order.id) : prev.map((o) => (o.id === order.id ? { ...o, status } : o)),
      );
      setUpdatingId(null);
      return;
    }
    try {
      const { error: upErr } = await supabase
        .from("orders")
        .update({ status, status_updated_at: new Date().toISOString() })
        .eq("id", order.id);
      if (upErr) throw upErr;
      if (businessIdRef.current) await loadOrders(businessIdRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update order.");
    } finally {
      setUpdatingId(null);
    }
  }

  if (!loading && needsRegister) {
    return (
      <div style={{ maxWidth: "960px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "16px" }}>Kitchen Display</h1>
        <NoBusinessCTA message="Register your business to start receiving and preparing orders." />
      </div>
    );
  }

  const pending = orders.filter((o) => PENDING_STATUSES.includes(o.status));
  const preparing = orders.filter((o) => o.status === "preparing");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
        <IconChefHat size={22} color="var(--db-accent)" />
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>Kitchen Display</h1>
      </div>
      <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", marginBottom: "20px" }}>
        Active orders — updates live, refreshes every 30s.
      </p>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "8px", background: "rgba(239,68,68,0.12)", color: "var(--db-danger)", fontSize: "13px", marginBottom: "16px" }}>
          <IconAlertCircle size={15} />
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "40px", color: "var(--db-text-secondary)", fontSize: "14px" }}>
          <IconRefresh size={18} style={{ animation: "spin 1s linear infinite" }} /> Loading orders…
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "start" }}>
          <KanbanColumn title="Pending" count={pending.length} accent="var(--db-warning)">
            {pending.length === 0 ? (
              <EmptyColumn text="No pending orders." />
            ) : (
              pending.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  updating={updatingId === o.id}
                  action={{ label: "Start Preparing", icon: IconPlayerPlay, onClick: () => void setStatus(o, "preparing") }}
                />
              ))
            )}
          </KanbanColumn>

          <KanbanColumn title="Preparing" count={preparing.length} accent="var(--db-accent)">
            {preparing.length === 0 ? (
              <EmptyColumn text="Nothing in the kitchen." />
            ) : (
              preparing.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  updating={updatingId === o.id}
                  action={{ label: "Mark Ready", icon: IconCircleCheck, onClick: () => void setStatus(o, "ready") }}
                />
              ))
            )}
          </KanbanColumn>
        </div>
      )}
    </div>
  );
}

function KanbanColumn({ title, count, accent, children }: { title: string; count: number; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--db-bg-surface)", border: "1px solid var(--db-border)", borderRadius: "12px", padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: accent }} />
        <h2 style={{ fontSize: "14px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>{title}</h2>
        <span style={{ fontSize: "12px", fontWeight: 700, color: accent, background: "var(--db-bg-elevated)", borderRadius: "999px", padding: "1px 8px" }}>{count}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>{children}</div>
    </div>
  );
}

function EmptyColumn({ text }: { text: string }) {
  return (
    <div style={{ padding: "28px 12px", textAlign: "center", fontSize: "13px", color: "var(--db-text-tertiary)", border: "1px dashed var(--db-border)", borderRadius: "10px" }}>
      {text}
    </div>
  );
}

function OrderCard({
  order,
  updating,
  action,
}: {
  order: KdsOrder;
  updating: boolean;
  action: { label: string; icon: React.ComponentType<{ size?: number }>; onClick: () => void };
}) {
  const ActionIcon = action.icon;
  return (
    <div style={{ background: "var(--db-bg-base)", border: "1px solid var(--db-border)", borderRadius: "10px", padding: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--db-text-primary)" }}>
          #{order.id.slice(0, 6)}
          {order.order_type && (
            <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--db-text-tertiary)", marginLeft: "6px", textTransform: "capitalize" }}>{order.order_type}</span>
          )}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--db-text-tertiary)" }}>
          <IconClock size={13} />
          {elapsed(order.created_at)}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
        {order.items.length === 0 ? (
          <span style={{ fontSize: "13px", color: "var(--db-text-tertiary)" }}>No items.</span>
        ) : (
          order.items.map((it) => (
            <div key={it.id} style={{ fontSize: "13px", color: "var(--db-text-primary)" }}>
              <strong style={{ color: "var(--db-accent)" }}>{it.qty}×</strong> {it.name}
              {it.special_instructions && (
                <div style={{ fontSize: "12px", color: "var(--db-text-tertiary)", marginLeft: "18px" }}>↳ {it.special_instructions}</div>
              )}
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={action.onClick}
        disabled={updating}
        style={{
          width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px",
          padding: "9px 12px", borderRadius: "8px", border: "none",
          background: "var(--db-accent)", color: "var(--db-accent-text)",
          fontSize: "13px", fontWeight: 600, cursor: updating ? "wait" : "pointer", opacity: updating ? 0.7 : 1,
        }}
      >
        <ActionIcon size={15} />
        {updating ? "Updating…" : action.label}
      </button>
    </div>
  );
}
