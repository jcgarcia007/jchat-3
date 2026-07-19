"use client";

/**
 * Waiter terminal — tables grid (B6.2). Tablet-first, big touch targets.
 *
 * The RLS (migration 077) already returns only the employee's assigned tables +
 * the unassigned ones, so this does a plain SELECT — the visibility rule is NOT
 * re-implemented here. Business resolution is EMPLOYEE-based (not the owner
 * helper): a waiter can work in several businesses, so we list businesses where
 * the user is an accepted employee.
 *
 * Tokens: --db-* (the layout fixes data-db-theme). No loose hex.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { TableDetailSheet, type SheetTable } from "@/components/terminal/TableDetailSheet";

interface Biz {
  id: string;
  name: string;
}
interface TableRow {
  id: string;
  label: string;
  floor: string;
  seats: number;
  sort: number;
}
interface TabRow {
  id: string;
  table_id: string;
  kind: "customer" | "waiter";
  status: string;
}
interface OrderRow {
  table_id: string | null;
  tab_id: string | null;
  status: string;
}

type TableState = "free" | "busy" | "toCollect";

const STATE_META: Record<TableState, { label: string; color: string }> = {
  free: { label: "Libre", color: "var(--db-success)" },
  busy: { label: "Ocupada", color: "var(--db-warning)" },
  toCollect: { label: "Pendiente de cobro", color: "var(--db-danger)" },
};

const ACTIVE_ORDER_EXCLUDE = "(delivered,cancelled)";

export default function TerminalTablesPage() {
  // Businesses where the user is an accepted employee.
  const [businesses, setBusinesses] = useState<Biz[]>([]);
  const [activeBiz, setActiveBiz] = useState<string | null>(null);
  const [bizLoaded, setBizLoaded] = useState(false);

  const [tables, setTables] = useState<TableRow[]>([]);
  const [tabs, setTabs] = useState<TabRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [detail, setDetail] = useState<SheetTable | null>(null);

  // 1) Resolve the employee's businesses (accepted only), embedding the name.
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!isSupabaseConfigured) {
        setBizLoaded(true);
        return;
      }
      const { data } = await supabase
        .from("employees")
        .select("business_id, businesses(id, name)")
        .eq("status", "accepted");
      if (!active) return;
      const rows = (data ?? []) as { business_id: string; businesses: { id: string; name: string } | null }[];
      const list: Biz[] = rows
        .map((r) => (r.businesses ? { id: r.businesses.id, name: r.businesses.name } : null))
        .filter((b): b is Biz => b !== null);
      // de-dup by id
      const uniq = Array.from(new Map(list.map((b) => [b.id, b])).values());
      setBusinesses(uniq);
      setActiveBiz(uniq[0]?.id ?? null);
      setBizLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  // 2) Load tables + tabs + active orders + my assignments for the active business.
  const load = useCallback(async () => {
    if (!activeBiz || !isSupabaseConfigured) {
      setTables([]);
      setLoading(false);
      setLoadError(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const [tRes, tabsRes, ordersRes, waitersRes] = await Promise.all([
        supabase
          .from("tables")
          .select("id, label, floor, seats, sort")
          .eq("business_id", activeBiz)
          .order("floor", { ascending: true })
          .order("sort", { ascending: true }),
        supabase
          .from("table_tabs")
          .select("id, table_id, kind, status")
          .eq("business_id", activeBiz)
          .eq("status", "open"),
        supabase
          .from("orders")
          .select("table_id, tab_id, status")
          .eq("business_id", activeBiz)
          .not("status", "in", ACTIVE_ORDER_EXCLUDE),
        supabase.from("table_waiters").select("table_id").eq("business_id", activeBiz),
      ]);
      if (tRes.error) throw tRes.error;
      // tabs/orders/waiters are RLS-gated chrome; tolerate partial failures without
      // faking "no tables".
      setTables((tRes.data ?? []) as TableRow[]);
      setTabs((tabsRes.data ?? []) as TabRow[]);
      setOrders((ordersRes.data ?? []) as OrderRow[]);
      setAssignedIds(new Set(((waitersRes.data ?? []) as { table_id: string }[]).map((w) => w.table_id)));
      setLoading(false);
    } catch {
      setLoadError(true);
      setLoading(false);
    }
  }, [activeBiz]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  // Map tab_id → table_id (from readable tabs) so tab-linked orders count too.
  const tabToTable = useMemo(() => new Map(tabs.map((t) => [t.id, t.table_id])), [tabs]);

  const stateOf = useCallback(
    (tableId: string): TableState => {
      const tableTabs = tabs.filter((t) => t.table_id === tableId);
      const hasWaiterOpen = tableTabs.some((t) => t.kind === "waiter" && t.status === "open");
      if (hasWaiterOpen) return "toCollect";
      const hasOpenTab = tableTabs.length > 0;
      const hasActiveOrder = orders.some(
        (o) => o.table_id === tableId || (o.tab_id != null && tabToTable.get(o.tab_id) === tableId),
      );
      return hasOpenTab || hasActiveOrder ? "busy" : "free";
    },
    [tabs, orders, tabToTable],
  );

  const floors = useMemo(() => {
    const seen: string[] = [];
    for (const t of tables) if (!seen.includes(t.floor)) seen.push(t.floor);
    return seen;
  }, [tables]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (!bizLoaded || loading) {
    return <Screen><Notice>Cargando…</Notice></Screen>;
  }
  if (businesses.length === 0) {
    return (
      <Screen>
        <Notice>No estás asignado como empleado activo de ningún negocio.</Notice>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Business selector — only when the employee works in several. */}
      {businesses.length > 1 && (
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 12 }}>
          {businesses.map((b) => {
            const on = b.id === activeBiz;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setActiveBiz(b.id)}
                style={{
                  flex: "0 0 auto",
                  padding: "12px 18px",
                  borderRadius: 12,
                  fontSize: 15,
                  fontWeight: 700,
                  border: on ? "1px solid var(--db-accent)" : "1px solid var(--db-border)",
                  background: on ? "var(--db-accent)" : "var(--db-bg-surface)",
                  color: on ? "var(--db-accent-text)" : "var(--db-text-primary)",
                  cursor: "pointer",
                }}
              >
                {b.name}
              </button>
            );
          })}
        </div>
      )}

      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "4px 0 16px" }}>Mesas</h1>

      {loadError ? (
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <p style={{ color: "var(--db-danger)", fontSize: 15, margin: "0 0 12px" }}>
            No se pudieron cargar las mesas. Revisa tu conexión e inténtalo de nuevo.
          </p>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} style={retryBtn}>
            Reintentar
          </button>
        </div>
      ) : tables.length === 0 ? (
        <Notice>No tienes mesas asignadas ni hay mesas libres de asignación.</Notice>
      ) : (
        floors.map((floor) => (
          <div key={floor} style={{ marginBottom: 28 }}>
            {floors.length > 1 && (
              <h2 style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--db-text-tertiary)", margin: "0 0 12px" }}>
                {floor}
              </h2>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 14,
              }}
            >
              {tables.filter((t) => t.floor === floor).map((t) => {
                const unassigned = !assignedIds.has(t.id);
                return (
                  <TableCard
                    key={t.id}
                    table={t}
                    state={stateOf(t.id)}
                    unassigned={unassigned}
                    selected={detail?.id === t.id}
                    onSelect={() =>
                      setDetail({ id: t.id, label: t.label, floor: t.floor, seats: t.seats, unassigned })
                    }
                  />
                );
              })}
            </div>
          </div>
        ))
      )}

      {detail && (
        <TableDetailSheet
          table={detail}
          onClose={() => {
            setDetail(null);
            // A tab may have been created — refresh the grid so the status color
            // reflects it.
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </Screen>
  );
}

function TableCard({
  table,
  state,
  unassigned,
  selected,
  onSelect,
}: {
  table: TableRow;
  state: TableState;
  unassigned: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = STATE_META[state];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        minHeight: 132,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "16px 14px",
        borderRadius: 16,
        background: "var(--db-bg-surface)",
        border: selected ? "2px solid var(--db-accent)" : "1px solid var(--db-border)",
        borderLeft: `6px solid ${meta.color}`,
        color: "var(--db-text-primary)",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 900 }}>{table.label}</span>
        <span
          aria-hidden
          style={{ width: 12, height: 12, borderRadius: "50%", background: meta.color, flexShrink: 0 }}
        />
      </div>
      <span style={{ fontSize: 13, color: "var(--db-text-secondary)" }}>
        {table.seats} {table.seats === 1 ? "silla" : "sillas"}
      </span>
      <span style={{ marginTop: "auto", fontSize: 13, fontWeight: 700, color: meta.color }}>
        {meta.label}
      </span>
      {unassigned && (
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--db-text-tertiary)" }}>
          Sin asignar
        </span>
      )}
    </button>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "20px 18px calc(20px + env(safe-area-inset-bottom))", maxWidth: 1100, margin: "0 auto" }}>{children}</div>;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "40px 24px",
        textAlign: "center",
        color: "var(--db-text-secondary)",
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: 14,
        fontSize: 15,
      }}
    >
      {children}
    </div>
  );
}

const retryBtn: React.CSSProperties = {
  padding: "12px 20px",
  borderRadius: 10,
  border: "1px solid var(--db-border)",
  background: "var(--db-bg-surface)",
  color: "var(--db-text-primary)",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};
