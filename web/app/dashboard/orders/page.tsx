"use client";

/**
 * JChat 3.0 — Orders dashboard
 * Real orders for the signed-in owner's active business (RLS: business owner read),
 * with customer name, status filters, an expandable detail view, and Supabase
 * Realtime updates. Uses --db-* tokens only.
 */

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  IconReceipt,
  IconChevronDown,
  IconChevronUp,
  IconAlertCircle,
  IconClock,
  IconUser,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

interface OrderItem {
  id: string;
  qty: number;
  price_cents: number;
  special_instructions: string | null;
  name: string;
}

interface Order {
  id: string;
  status: string;
  order_type: string | null;
  total_cents: number;
  created_at: string;
  eta_minutes: number | null;
  customer: string;
  items: OrderItem[];
}

type Filter = "all" | "pending" | "in_progress" | "completed" | "cancelled";

const FILTERS: { key: Filter; label: string; statuses: string[] | null }[] = [
  { key: "all", label: "All", statuses: null },
  { key: "pending", label: "Pending", statuses: ["confirmed", "pending"] },
  { key: "in_progress", label: "In Progress", statuses: ["preparing", "ready"] },
  { key: "completed", label: "Completed", statuses: ["delivered"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
];

// Badge colors per spec: pending=amber, preparing=blue, ready=green, delivered=gray, cancelled=red.
const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: "Pending", bg: "rgba(245,158,11,0.14)", color: "var(--db-warning)" },
  confirmed: { label: "Pending", bg: "rgba(245,158,11,0.14)", color: "var(--db-warning)" },
  preparing: { label: "Preparing", bg: "var(--db-accent-bg)", color: "var(--db-accent)" },
  ready: { label: "Ready", bg: "rgba(34,197,94,0.14)", color: "var(--db-success)" },
  delivered: { label: "Delivered", bg: "rgba(148,163,184,0.16)", color: "var(--db-text-secondary)" },
  cancelled: { label: "Cancelled", bg: "rgba(239,68,68,0.14)", color: "var(--db-danger)" },
};

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const DEMO_ORDERS: Order[] = [
  {
    id: "demo-1001", status: "confirmed", order_type: "table", total_cents: 2800, eta_minutes: 15, customer: "Alex Rivera", created_at: new Date(Date.now() - 120000).toISOString(),
    items: [
      { id: "i1", qty: 2, price_cents: 1000, special_instructions: "No pickles", name: "Classic Burger" },
      { id: "i2", qty: 1, price_cents: 800, special_instructions: null, name: "Fries" },
    ],
  },
  {
    id: "demo-1000", status: "preparing", order_type: "counter", total_cents: 1550, eta_minutes: 8, customer: "Sam Lee", created_at: new Date(Date.now() - 900000).toISOString(),
    items: [{ id: "i3", qty: 1, price_cents: 1550, special_instructions: null, name: "Caesar Salad" }],
  },
  {
    id: "demo-0999", status: "delivered", order_type: "table", total_cents: 1900, eta_minutes: null, customer: "Jordan Kim", created_at: new Date(Date.now() - 7200000).toISOString(),
    items: [{ id: "i4", qty: 1, price_cents: 1900, special_instructions: null, name: "Margherita Pizza" }],
  },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsRegister, setNeedsRegister] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const businessIdRef = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  async function loadOrders(bizId: string) {
    const { data: ordersData, error: ordErr } = await supabase
      .from("orders")
      .select("id, status, order_type, total_cents, created_at, eta_minutes, user_id")
      .eq("business_id", bizId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (ordErr) throw ordErr;

    const base = (ordersData ?? []) as (Omit<Order, "items" | "customer"> & { user_id: string | null })[];

    // Customer names
    const userIds = Array.from(new Set(base.map((o) => o.user_id).filter(Boolean))) as string[];
    const nameById: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from("users").select("id, display_name, username").in("id", userIds);
      (users ?? []).forEach((u) => {
        nameById[u.id as string] = (u.display_name as string) || (u.username ? `@${u.username}` : "Customer");
      });
    }

    // Items
    let itemsByOrder: Record<string, OrderItem[]> = {};
    if (base.length > 0) {
      const { data: itemsData, error: itemErr } = await supabase
        .from("order_items")
        .select("id, order_id, qty, price_cents, special_instructions, menu_items(name)")
        .in("order_id", base.map((o) => o.id));
      if (itemErr) throw itemErr;
      itemsByOrder = (itemsData ?? []).reduce((acc: Record<string, OrderItem[]>, raw) => {
        const r = raw as unknown as {
          id: string; order_id: string; qty: number; price_cents: number;
          special_instructions: string | null; menu_items: { name: string } | { name: string }[] | null;
        };
        const mi = Array.isArray(r.menu_items) ? r.menu_items[0] : r.menu_items;
        (acc[r.order_id] ||= []).push({
          id: r.id, qty: r.qty, price_cents: r.price_cents,
          special_instructions: r.special_instructions, name: mi?.name ?? "Item",
        });
        return acc;
      }, {});
    }

    setOrders(
      base.map((o) => ({
        id: o.id,
        status: o.status,
        order_type: o.order_type,
        total_cents: o.total_cents,
        created_at: o.created_at,
        eta_minutes: o.eta_minutes,
        customer: o.user_id ? nameById[o.user_id] ?? "Customer" : "Guest",
        items: itemsByOrder[o.id] ?? [],
      })),
    );
  }

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
        businessIdRef.current = res.business.id;
        await loadOrders(res.business.id);

        // Realtime — refresh on any order change for this business.
        channelRef.current = supabase
          .channel(`orders-${res.business.id}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "orders", filter: `business_id=eq.${res.business.id}` },
            () => {
              if (businessIdRef.current) void loadOrders(businessIdRef.current).catch(() => {});
            },
          )
          .subscribe();
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load orders.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  if (!loading && needsRegister) {
    return (
      <div style={{ maxWidth: "960px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "16px" }}>Orders</h1>
        <NoBusinessCTA message="Register your business to start taking orders." />
      </div>
    );
  }

  const activeFilter = FILTERS.find((f) => f.key === filter)!;
  const visible = activeFilter.statuses ? orders.filter((o) => activeFilter.statuses!.includes(o.status)) : orders;

  function countFor(f: Filter): number {
    const def = FILTERS.find((x) => x.key === f)!;
    return def.statuses ? orders.filter((o) => def.statuses!.includes(o.status)).length : orders.length;
  }

  return (
    <div style={{ maxWidth: "960px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
        <IconReceipt size={22} color="var(--db-accent)" />
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>Orders</h1>
      </div>
      <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", marginBottom: "20px" }}>
        Incoming, in-progress, and completed orders — updates live.
      </p>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        {FILTERS.map((f) => {
          const isActive = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "8px 14px", borderRadius: "999px", border: "1px solid var(--db-border)",
                background: isActive ? "var(--db-accent)" : "var(--db-bg-surface)",
                color: isActive ? "var(--db-accent-text)" : "var(--db-text-secondary)",
                fontSize: "13px", fontWeight: 600, cursor: "pointer",
              }}
            >
              {f.label}
              <span style={{ opacity: 0.8, fontSize: "12px" }}>{countFor(f.key)}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "8px", background: "rgba(239,68,68,0.12)", color: "var(--db-danger)", fontSize: "13px", marginBottom: "16px" }}>
          <IconAlertCircle size={15} />
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "40px", color: "var(--db-text-secondary)", fontSize: "14px" }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ padding: "48px 24px", textAlign: "center", background: "var(--db-bg-surface)", border: "1px solid var(--db-border)", borderRadius: "12px" }}>
          <IconReceipt size={28} color="var(--db-text-tertiary)" />
          <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", margin: "10px 0 0" }}>
            No {filter === "all" ? "" : activeFilter.label.toLowerCase() + " "}orders yet.
          </p>
        </div>
      ) : (
        <div style={{ background: "var(--db-bg-surface)", border: "1px solid var(--db-border)", borderRadius: "12px", overflow: "hidden" }}>
          {/* header */}
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 120px 70px 100px 90px 80px", gap: "12px", padding: "12px 20px", fontSize: "11px", fontWeight: 700, color: "var(--db-text-tertiary)", letterSpacing: "0.05em", textTransform: "uppercase", borderBottom: "1px solid var(--db-border)" }}>
            <span>Order</span>
            <span>Customer</span>
            <span>Status</span>
            <span style={{ textAlign: "right" }}>Items</span>
            <span style={{ textAlign: "right" }}>Total</span>
            <span style={{ textAlign: "right" }}>Time</span>
            <span style={{ textAlign: "right" }}>Detail</span>
          </div>

          {visible.map((o) => {
            const meta = STATUS_META[o.status] ?? { label: o.status, bg: "var(--db-bg-elevated)", color: "var(--db-text-secondary)" };
            const open = expanded === o.id;
            return (
              <div key={o.id} style={{ borderBottom: "1px solid var(--db-border)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 120px 70px 100px 90px 80px", gap: "12px", padding: "14px 20px", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--db-text-primary)" }}>#{o.id.slice(0, 6)}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                    <IconUser size={14} color="var(--db-text-tertiary)" />
                    <span style={{ fontSize: "13px", color: "var(--db-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.customer}</span>
                  </span>
                  <span>
                    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 600, background: meta.bg, color: meta.color }}>{meta.label}</span>
                  </span>
                  <span style={{ textAlign: "right", fontSize: "14px", color: "var(--db-text-primary)" }}>{o.items.length}</span>
                  <span style={{ textAlign: "right", fontSize: "14px", fontWeight: 700, color: "var(--db-text-primary)" }}>{money(o.total_cents)}</span>
                  <span style={{ textAlign: "right", fontSize: "13px", color: "var(--db-text-tertiary)" }}>{relativeTime(o.created_at)}</span>
                  <span style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : o.id)}
                      style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--db-border)", background: "var(--db-bg-elevated)", color: "var(--db-text-secondary)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                    >
                      View {open ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}
                    </button>
                  </span>
                </div>

                {open && (
                  <div style={{ padding: "0 20px 16px 20px", background: "var(--db-bg-base)" }}>
                    {o.items.length === 0 ? (
                      <p style={{ fontSize: "13px", color: "var(--db-text-tertiary)", margin: "12px 0 0" }}>No items recorded.</p>
                    ) : (
                      o.items.map((it) => (
                        <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "8px 0", borderBottom: "1px solid var(--db-border)" }}>
                          <span style={{ fontSize: "13px", color: "var(--db-text-primary)" }}>
                            <strong>{it.qty}×</strong> {it.name}
                            {it.special_instructions && (
                              <span style={{ fontSize: "12px", color: "var(--db-text-tertiary)", marginLeft: "8px" }}>— {it.special_instructions}</span>
                            )}
                          </span>
                          <span style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>{money(it.price_cents * it.qty)}</span>
                        </div>
                      ))
                    )}
                    {o.eta_minutes != null && (
                      <p style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--db-text-tertiary)", margin: "10px 0 0" }}>
                        <IconClock size={13} /> ETA {o.eta_minutes} min · placed {relativeTime(o.created_at)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
