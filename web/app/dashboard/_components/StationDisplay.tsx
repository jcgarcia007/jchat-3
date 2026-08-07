"use client";

/**
 * JChat 3.0 — Station Display (shared KDS + Bar component)
 * 3-column kanban by per-item status: Pending | Preparing | Ready to pick up.
 * station="kitchen" → menu_items where station='kitchen'.
 * station="bar"     → menu_items where station='bar'.
 *
 * Queries:
 *   1. open orders for this business.
 *   2. order_items (with menu_items!inner join) for those orders, not done.
 *      Client-side filter by station after fetch.
 *
 * Mutations: set_item_status(p_order_item_id, p_status) RPC — server-side only.
 *
 * Realtime: orders + order_items channels, 600ms debounce.
 * Fallback:  30s setInterval refresh.
 * Elapsed:   1s setInterval tick (mm:ss since entering current state).
 * Uses --db-* tokens; Tabler Icons only.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  IconPlayerPlay,
  IconCircleCheck,
  IconRefresh,
  IconAlertCircle,
  IconClock,
  IconChefHat,
  IconGlass,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

// ── Types ─────────────────────────────────────────────────────────────────────

type ItemStatus = "pending" | "preparing" | "ready";

interface StationItem {
  id: string;
  order_id: string;
  table_label: string | null;
  item_name: string;
  qty: number;
  modifier_labels: string[];
  special_instructions: string | null;
  item_status: ItemStatus;
  created_at: string;
  preparing_at: string | null;
  ready_at: string | null;
}

interface RawOrderRow {
  id: string;
  table_label: string | null;
}

interface RawItemRow {
  id: string;
  order_id: string;
  qty: number;
  item_status: string;
  created_at: string;
  preparing_at: string | null;
  ready_at: string | null;
  special_instructions: string | null;
  options: unknown;
  menu_items:
    | { name: string; station: string }
    | { name: string; station: string }[]
    | null;
}

// Supabase RPC cast — set_item_status is not in generated types
type SupabaseWithRpc = {
  rpc(
    fn: "set_item_status",
    params: { p_order_item_id: string; p_status: string },
  ): Promise<{ error: { message: string } | null }>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function flattenModifiers(options: unknown): string[] {
  if (!options || typeof options !== "object") return [];
  const o = options as {
    modifiers?: { group_label?: string; choice_labels?: string[] }[];
  };
  if (!Array.isArray(o.modifiers)) return [];
  return o.modifiers.flatMap((m) =>
    Array.isArray(m.choice_labels) ? m.choice_labels : [],
  );
}

/** mm:ss (or h:mm:ss) since the iso timestamp, updated every second by parent. */
function elapsedMmSs(iso: string | null): string {
  if (!iso) return "—";
  const totalSecs = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 1000),
  );
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** The timestamp that marks entry into the item's current state. */
function stateEntryTs(item: StationItem): string | null {
  switch (item.item_status) {
    case "pending":   return item.created_at;
    case "preparing": return item.preparing_at;
    case "ready":     return item.ready_at;
    default:          return null;
  }
}

const STATUS_ORDER: Record<ItemStatus, number> = {
  pending: 0,
  preparing: 1,
  ready: 2,
};

// ── Demo data (when Supabase is not configured) ────────────────────────────────

const ALL_DEMO: StationItem[] = [
  {
    id: "d1", order_id: "o1", table_label: "4", item_name: "Classic Burger", qty: 2,
    modifier_labels: ["No pickles", "Extra sauce"], special_instructions: "Nut allergy",
    item_status: "pending", created_at: new Date(Date.now() - 300_000).toISOString(),
    preparing_at: null, ready_at: null,
  },
  {
    id: "d2", order_id: "o1", table_label: "4", item_name: "Fries", qty: 2,
    modifier_labels: [], special_instructions: null,
    item_status: "pending", created_at: new Date(Date.now() - 300_000).toISOString(),
    preparing_at: null, ready_at: null,
  },
  {
    id: "d3", order_id: "o2", table_label: "7", item_name: "Caesar Salad", qty: 1,
    modifier_labels: ["Dressing on side"], special_instructions: null,
    item_status: "preparing", created_at: new Date(Date.now() - 600_000).toISOString(),
    preparing_at: new Date(Date.now() - 420_000).toISOString(), ready_at: null,
  },
  {
    id: "d4", order_id: "o3", table_label: "2", item_name: "Margarita", qty: 2,
    modifier_labels: ["No salt"], special_instructions: null,
    item_status: "preparing", created_at: new Date(Date.now() - 480_000).toISOString(),
    preparing_at: new Date(Date.now() - 360_000).toISOString(), ready_at: null,
  },
  {
    id: "d5", order_id: "o2", table_label: "7", item_name: "Pizza Margherita", qty: 1,
    modifier_labels: [], special_instructions: null,
    item_status: "ready", created_at: new Date(Date.now() - 900_000).toISOString(),
    preparing_at: new Date(Date.now() - 750_000).toISOString(),
    ready_at: new Date(Date.now() - 120_000).toISOString(),
  },
];

// ── Main component ────────────────────────────────────────────────────────────

export function StationDisplay({ station }: { station: "kitchen" | "bar" }) {
  const t = useTranslations("dashboardCommon");
  const [items, setItems]               = useState<StationItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [needsRegister, setNeedsRegister] = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [updatingId, setUpdatingId]     = useState<string | null>(null);
  const [, setTick]                     = useState(0); // drives mm:ss re-render

  const bizIdRef    = useRef<string | null>(null);
  const ordersChRef = useRef<RealtimeChannel | null>(null);
  const itemsChRef  = useRef<RealtimeChannel | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadItems = useCallback(
    async (bid: string) => {
      // Step 1 — open orders
      const { data: ordersData, error: ordErr } = await supabase
        .from("orders")
        .select("id, table_label")
        .eq("business_id", bid)
        .is("paid_at", null)
        .is("canceled_at", null);
      if (ordErr) throw ordErr;

      const orderMap = new Map<string, string | null>(
        ((ordersData ?? []) as RawOrderRow[]).map((o) => [o.id, o.table_label]),
      );
      const orderIds = [...orderMap.keys()];
      if (orderIds.length === 0) {
        setItems([]);
        return;
      }

      // Step 2 — order_items (not done) with menu_items join
      const { data: itemsData, error: itmErr } = await supabase
        .from("order_items")
        .select(
          "id, order_id, qty, item_status, created_at, preparing_at, ready_at, special_instructions, options, menu_items!inner(name, station)",
        )
        .in("order_id", orderIds)
        .neq("item_status", "done");
      if (itmErr) throw itmErr;

      // Client-side station filter + shape
      const shaped: StationItem[] = [];
      for (const raw of (itemsData ?? []) as unknown as RawItemRow[]) {
        const mi = Array.isArray(raw.menu_items) ? raw.menu_items[0] : raw.menu_items;
        if (!mi || mi.station !== station) continue;
        const status: ItemStatus =
          raw.item_status === "pending" || raw.item_status === "preparing" || raw.item_status === "ready"
            ? raw.item_status
            : "pending";
        shaped.push({
          id: raw.id,
          order_id: raw.order_id,
          table_label: orderMap.get(raw.order_id) ?? null,
          item_name: mi.name,
          qty: raw.qty,
          modifier_labels: flattenModifiers(raw.options),
          special_instructions: raw.special_instructions,
          item_status: status,
          created_at: raw.created_at,
          preparing_at: raw.preparing_at,
          ready_at: raw.ready_at,
        });
      }

      // Sort: by status bucket, then by state-entry timestamp ascending
      shaped.sort((a, b) => {
        const bd = (STATUS_ORDER[a.item_status] ?? 0) - (STATUS_ORDER[b.item_status] ?? 0);
        if (bd !== 0) return bd;
        const tA = stateEntryTs(a) ?? a.created_at;
        const tB = stateEntryTs(b) ?? b.created_at;
        return tA < tB ? -1 : tA > tB ? 1 : 0;
      });

      setItems(shaped);
    },
    [station],
  );

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!isSupabaseConfigured) {
        // Demo mode: kitchen gets all demo items; bar gets the "drink" ones
        setItems(
          station === "bar"
            ? ALL_DEMO.filter((i) => i.id === "d4")
            : ALL_DEMO.filter((i) => i.id !== "d4"),
        );
        setLoading(false);
        return;
      }

      try {
        const res = await resolveActiveBusiness();
        if (!active) return;
        if (!res.ok) {
          if (res.reason === "no_business" || res.reason === "unauthenticated")
            setNeedsRegister(true);
          else setError(res.message);
          setLoading(false);
          return;
        }
        const bid = res.business.id;
        bizIdRef.current = bid;
        await loadItems(bid);
        if (!active) return;

        const scheduleRefresh = () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            if (bizIdRef.current) void loadItems(bizIdRef.current).catch(() => {});
          }, 600);
        };

        // Realtime — orders (table_label changes, new orders, closures)
        ordersChRef.current = supabase
          .channel(`station-orders-${bid}-${station}`)
          .on("postgres_changes", {
            event: "INSERT", schema: "public", table: "orders",
            filter: `business_id=eq.${bid}`,
          }, scheduleRefresh)
          .on("postgres_changes", {
            event: "UPDATE", schema: "public", table: "orders",
            filter: `business_id=eq.${bid}`,
          }, scheduleRefresh)
          .subscribe();

        // Realtime — order_items (item_status changes, new items)
        itemsChRef.current = supabase
          .channel(`station-items-${bid}-${station}`)
          .on("postgres_changes", {
            event: "*", schema: "public", table: "order_items",
          }, scheduleRefresh)
          .subscribe();

        // 30s fallback full refresh
        fallbackRef.current = setInterval(() => {
          if (bizIdRef.current) void loadItems(bizIdRef.current).catch(() => {});
        }, 30_000);

        // 1s tick so elapsed mm:ss re-renders each second
        tickRef.current = setInterval(() => setTick((n) => n + 1), 1_000);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : t("ordersLoadError"));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      if (ordersChRef.current) void supabase.removeChannel(ordersChRef.current);
      if (itemsChRef.current)  void supabase.removeChannel(itemsChRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (fallbackRef.current) clearInterval(fallbackRef.current);
      if (tickRef.current)     clearInterval(tickRef.current);
    };
  }, [loadItems, station, t]);

  async function advanceItem(itemId: string, nextStatus: "preparing" | "ready") {
    setUpdatingId(itemId);
    setError(null);
    if (!isSupabaseConfigured) {
      // Demo: mutate locally
      setItems((prev) =>
        prev.map((i) =>
          i.id !== itemId ? i : {
            ...i,
            item_status: nextStatus,
            preparing_at: nextStatus === "preparing" ? new Date().toISOString() : i.preparing_at,
            ready_at:     nextStatus === "ready"     ? new Date().toISOString() : i.ready_at,
          },
        ),
      );
      setUpdatingId(null);
      return;
    }
    try {
      const { error: rpcErr } = await (supabase as unknown as SupabaseWithRpc).rpc(
        "set_item_status",
        { p_order_item_id: itemId, p_status: nextStatus },
      );
      if (rpcErr) throw rpcErr;
      if (bizIdRef.current) await loadItems(bizIdRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("kdsUpdateOrderError"));
    } finally {
      setUpdatingId(null);
    }
  }

  // ── Early exits ──────────────────────────────────────────────────────────────

  if (!loading && needsRegister) {
    const title = station === "kitchen" ? t("kdsPageTitle") : t("kdsBarPageTitle");
    return (
      <div style={{ maxWidth: "960px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "16px" }}>
          {title}
        </h1>
        <NoBusinessCTA message={t("kdsNoBusinessMessage")} />
      </div>
    );
  }

  // ── Partition ─────────────────────────────────────────────────────────────────

  const pending   = items.filter((i) => i.item_status === "pending");
  const preparing = items.filter((i) => i.item_status === "preparing");
  const ready     = items.filter((i) => i.item_status === "ready");

  const StationIcon = station === "kitchen" ? IconChefHat : IconGlass;
  const pageTitle   = station === "kitchen" ? t("kdsPageTitle")    : t("kdsBarPageTitle");
  const pageSubtitle = station === "kitchen" ? t("kdsSubtitle")    : t("kdsBarSubtitle");

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
        <StationIcon size={22} color="var(--db-accent)" />
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
          {pageTitle}
        </h1>
      </div>
      <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", marginBottom: "20px" }}>
        {pageSubtitle}
      </p>

      {/* Error banner */}
      {error && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "10px 14px", borderRadius: "var(--db-radius)",
            background: "rgba(239,68,68,0.12)", color: "var(--db-danger)",
            fontSize: "13px", marginBottom: "16px",
          }}
        >
          <IconAlertCircle size={15} />
          {error}
        </div>
      )}

      {/* Board */}
      {loading ? (
        <div
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "40px", color: "var(--db-text-secondary)", fontSize: "14px",
          }}
        >
          <IconRefresh size={18} style={{ animation: "spin 1s linear infinite" }} />
          {t("kdsLoadingOrders")}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", alignItems: "start" }}>
          {/* Col 1 — Pending */}
          <StationColumn title={t("kdsStationPending")} count={pending.length} accent="var(--db-warning)">
            {pending.length === 0
              ? <EmptyCol text={t("kdsEmptyPending")} />
              : pending.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  updating={updatingId === item.id}
                  actionLabel={t("kdsItemStart")}
                  actionIcon={IconPlayerPlay}
                  onAction={() => void advanceItem(item.id, "preparing")}
                />
              ))
            }
          </StationColumn>

          {/* Col 2 — Preparing */}
          <StationColumn title={t("kdsStationPreparing")} count={preparing.length} accent="var(--db-accent)">
            {preparing.length === 0
              ? <EmptyCol text={t("kdsEmptyPreparing")} />
              : preparing.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  updating={updatingId === item.id}
                  actionLabel={t("kdsItemMarkReady")}
                  actionIcon={IconCircleCheck}
                  onAction={() => void advanceItem(item.id, "ready")}
                />
              ))
            }
          </StationColumn>

          {/* Col 3 — Ready to pick up */}
          <StationColumn title={t("kdsStationReady")} count={ready.length} accent="var(--db-success)">
            {ready.length === 0
              ? <EmptyCol text={t("kdsEmptyReady")} />
              : ready.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  updating={false}
                  actionLabel={null}
                  actionIcon={null}
                  onAction={null}
                />
              ))
            }
          </StationColumn>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StationColumn({
  title, count, accent, children,
}: {
  title: string; count: number; accent: string; children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius-card)",
        padding: "16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: accent, flexShrink: 0 }} />
        <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0, flex: 1 }}>
          {title}
        </h2>
        <span
          style={{
            fontSize: "12px", fontWeight: 700, color: accent,
            background: "var(--db-bg-elevated)", borderRadius: "999px", padding: "1px 8px",
          }}
        >
          {count}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>{children}</div>
    </div>
  );
}

function EmptyCol({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "24px 12px", textAlign: "center", fontSize: "13px",
        color: "var(--db-text-tertiary)",
        border: "1px dashed var(--db-border)", borderRadius: "var(--db-radius-card)",
      }}
    >
      {text}
    </div>
  );
}

function ItemCard({
  item,
  updating,
  actionLabel,
  actionIcon: ActionIcon,
  onAction,
}: {
  item: StationItem;
  updating: boolean;
  actionLabel: string | null;
  actionIcon: React.ComponentType<{ size?: number }> | null;
  onAction: (() => void) | null;
}) {
  const t = useTranslations("dashboardCommon");
  const ts = stateEntryTs(item);

  return (
    <div
      style={{
        background: "var(--db-bg-base)",
        border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius-card)",
        padding: "12px",
      }}
    >
      {/* Table label + elapsed */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--db-text-primary)" }}>
          {item.table_label ?? "—"}
        </span>
        <span
          style={{
            display: "inline-flex", alignItems: "center", gap: "3px",
            fontSize: "11px", color: "var(--db-text-tertiary)",
          }}
        >
          <IconClock size={11} />
          {elapsedMmSs(ts)}
        </span>
      </div>

      {/* qty × name */}
      <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--db-text-primary)", marginBottom: "4px" }}>
        <span style={{ color: "var(--db-accent)", marginRight: "4px" }}>{item.qty}×</span>
        {item.item_name}
      </div>

      {/* Modifier labels */}
      {item.modifier_labels.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "4px" }}>
          {item.modifier_labels.map((label, i) => (
            <span key={i} style={{ fontSize: "12px", color: "var(--db-text-secondary)", paddingLeft: "14px" }}>
              • {label}
            </span>
          ))}
        </div>
      )}

      {/* Special instructions */}
      {item.special_instructions && (
        <div
          style={{
            fontSize: "12px", color: "var(--db-text-tertiary)",
            fontStyle: "italic", marginBottom: "4px",
          }}
        >
          ↳ {item.special_instructions}
        </div>
      )}

      {/* Action button (Pending → Start, Preparing → Mark Ready; Ready has none) */}
      {ActionIcon && actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          disabled={updating}
          style={{
            marginTop: "8px", width: "100%",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px",
            padding: "8px 12px", borderRadius: "var(--db-radius)", border: "none",
            background: "var(--db-accent)", color: "var(--db-accent-text)",
            fontSize: "13px", fontWeight: 600,
            cursor: updating ? "wait" : "pointer", opacity: updating ? 0.7 : 1,
          }}
        >
          <ActionIcon size={14} />
          {updating ? t("kdsUpdating") : actionLabel}
        </button>
      )}
    </div>
  );
}
