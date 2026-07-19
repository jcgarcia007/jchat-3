"use client";

/**
 * Terminal — table detail (B6.3a). Full-screen overlay (chosen over the dashboard's
 * narrow side drawer: the terminal is tablet-first, so a full sheet gives bigger
 * touch targets and room for the tabs + orders + items list). Read-only this batch
 * plus ONE write: create a waiter tab. Taking orders / charging come next.
 *
 * Reuses the money/label rules from @/lib/tabSemantics (extracted from the
 * dashboard TableDetailPanel) instead of reimplementing them. Per-order "paid"
 * uses orders.paid_at (078) — a QR order is stamped paid by the webhook; a future
 * waiter order stays unpaid until checkout.
 *
 * All reads are plain SELECTs — RLS (077 + table_tabs 070) already scopes them to
 * the employee's assigned + unassigned tables. Tokens: --db-* (the layout fixes
 * data-db-theme). No loose hex.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconX, IconPlus, IconCheck } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  fmtCents,
  kindLabel,
  tabStatusLabel,
  isTabDebt,
  modifierLabels,
  type TabKind,
  type TabStatus,
} from "@/lib/tabSemantics";

export interface SheetTable {
  id: string;
  label: string;
  floor: string;
  seats: number;
  unassigned: boolean;
}

interface Tab {
  id: string;
  name: string;
  kind: TabKind;
  status: TabStatus;
}
interface Order {
  id: string;
  tab_id: string | null;
  table_id: string | null;
  contact_name: string | null;
  total_cents: number;
  status: string;
  paid_at: string | null;
}
interface Item {
  id: string;
  order_id: string;
  menu_item_id: string;
  qty: number;
  price_cents: number;
  item_status: string;
  options: unknown;
  notes: string | null;
  special_instructions: string | null;
}

const ORDER_COLS = "id, tab_id, table_id, contact_name, total_cents, status, paid_at";

export function TableDetailSheet({ table, onClose }: { table: SheetTable; onClose: () => void }) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [menuNames, setMenuNames] = useState<Map<string, string>>(new Map());

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [newTabName, setNewTabName] = useState("");
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const tabsRes = await supabase
        .from("table_tabs")
        .select("id, name, kind, status")
        .eq("table_id", table.id)
        .order("created_at", { ascending: true });
      if (tabsRes.error) throw tabsRes.error;
      const tabRows = (tabsRes.data ?? []) as Tab[];
      const tabIds = tabRows.map((t) => t.id);

      // Orders reach the table two ways: directly (table_id, customer QR) or
      // through a tab (tab_id). Two SELECTs merged — both RLS-scoped by 077.
      const [directRes, tabRes] = await Promise.all([
        supabase.from("orders").select(ORDER_COLS).eq("table_id", table.id),
        tabIds.length
          ? supabase.from("orders").select(ORDER_COLS).in("tab_id", tabIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (directRes.error) throw directRes.error;
      if (tabRes.error) throw tabRes.error;

      const byId = new Map<string, Order>();
      for (const o of [...((directRes.data ?? []) as Order[]), ...((tabRes.data ?? []) as Order[])]) {
        byId.set(o.id, o);
      }
      const orderRows = [...byId.values()];
      const orderIds = orderRows.map((o) => o.id);

      const itemsRes = orderIds.length
        ? await supabase
            .from("order_items")
            .select("id, order_id, menu_item_id, qty, price_cents, item_status, options, notes, special_instructions")
            .in("order_id", orderIds)
        : { data: [], error: null };
      if (itemsRes.error) throw itemsRes.error;
      const itemRows = (itemsRes.data ?? []) as Item[];

      const miIds = [...new Set(itemRows.map((i) => i.menu_item_id))];
      let names = new Map<string, string>();
      if (miIds.length) {
        const { data: mi } = await supabase.from("menu_items").select("id, name").in("id", miIds);
        names = new Map(((mi ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name]));
      }

      setTabs(tabRows);
      setOrders(orderRows);
      setItems(itemRows);
      setMenuNames(names);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [table.id]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  // Close on Escape (a hardware keyboard on the tablet, or dev).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Totals — consumed / collected / owed, from per-order paid_at (078).
  const consumed = orders.reduce((s, o) => s + (o.total_cents ?? 0), 0);
  const collected = orders.filter((o) => o.paid_at != null).reduce((s, o) => s + (o.total_cents ?? 0), 0);
  const owed = orders.filter((o) => o.paid_at == null).reduce((s, o) => s + (o.total_cents ?? 0), 0);

  const directOrders = useMemo(() => orders.filter((o) => o.tab_id == null), [orders]);
  const nothing = tabs.length === 0 && orders.length === 0;

  async function createTab() {
    const name = newTabName.trim();
    if (!name) return;
    setCreating(true);
    setActionError(null);
    const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
    // business_id is set by the 070 trigger — do NOT send it.
    const payload = { table_id: table.id, name, kind: "waiter", created_by: uid } as never;
    const { error } = await supabase.from("table_tabs").insert(payload);
    setCreating(false);
    if (error) {
      // The 071 INSERT policy requires is_waiter_of_table — fails on a table not
      // assigned to this waiter. Honest, specific message (do NOT try to bypass).
      setActionError(
        (error as { code?: string }).code === "42501"
          ? "Esta mesa no está asignada a ti. Pide a tu encargado que te la asigne para abrir cuentas."
          : "No se pudo crear la cuenta. Inténtalo de nuevo.",
      );
      return;
    }
    setNewTabName("");
    await load();
  }

  return (
    <div style={overlay} role="dialog" aria-label={`Detalle de mesa ${table.label}`}>
      {/* Header */}
      <div style={header}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>{table.label}</div>
          <div style={{ fontSize: 14, color: "var(--db-text-secondary)" }}>
            {table.floor} · {table.seats} {table.seats === 1 ? "silla" : "sillas"}
            {table.unassigned && (
              <span style={{ marginLeft: 8, color: "var(--db-text-tertiary)", fontWeight: 600 }}>· Sin asignar</span>
            )}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar" style={closeBtn}>
          <IconX size={22} />
        </button>
      </div>

      {/* Totals */}
      {!loading && !loadError && (
        <div style={totalsRow}>
          <Metric label="Consumido" value={fmtCents(consumed)} />
          <Metric label="Ya cobrado" value={fmtCents(collected)} />
          <Metric label="Por cobrar" value={fmtCents(owed)} warn={owed > 0} />
        </div>
      )}

      {/* Body */}
      <div style={body}>
        {actionError && (
          <div style={{ fontSize: 14, color: "var(--db-danger)", background: "var(--db-bg-surface)", border: "1px solid var(--db-border)", borderRadius: 12, padding: "12px 14px" }}>
            {actionError}
          </div>
        )}

        {loading ? (
          <Notice>Cargando…</Notice>
        ) : loadError ? (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "var(--db-danger)", fontSize: 15, margin: "0 0 12px" }}>
              No se pudo cargar el detalle de la mesa. Revisa tu conexión e inténtalo de nuevo.
            </p>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} style={secondaryBtn}>
              Reintentar
            </button>
          </div>
        ) : (
          <>
            {nothing && <Notice>Esta mesa no tiene cuentas ni pedidos.</Notice>}

            {/* Tabs (cuentas) */}
            {tabs.map((tab) => {
              const tabOrders = orders.filter((o) => o.tab_id === tab.id);
              const tabTotal = tabOrders.reduce((s, o) => s + (o.total_cents ?? 0), 0);
              return (
                <Card key={tab.id}>
                  <div style={cardHead}>
                    <span style={{ fontSize: 17, fontWeight: 800 }}>{tab.name}</span>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <Badge>{kindLabel(tab.kind)}</Badge>
                      <Badge tone={isTabDebt(tab) ? "warn" : "muted"}>{tabStatusLabel(tab.kind, tab.status)}</Badge>
                      <span style={{ fontWeight: 800, minWidth: 72, textAlign: "right" }}>{fmtCents(tabTotal)}</span>
                    </div>
                  </div>
                  {tabOrders.length === 0 ? (
                    <Empty>Sin pedidos todavía.</Empty>
                  ) : (
                    tabOrders.map((o) => <OrderBlock key={o.id} order={o} items={items} names={menuNames} />)
                  )}
                </Card>
              );
            })}

            {/* Direct orders (customer scanned the QR and paid — no waiter tab) */}
            {directOrders.length > 0 && (
              <div>
                <SectionTitle>Pedidos directos (QR)</SectionTitle>
                {directOrders.map((o) => (
                  <Card key={o.id}>
                    <OrderBlock order={o} items={items} names={menuNames} showName />
                  </Card>
                ))}
              </div>
            )}

            {/* Create waiter tab */}
            <div>
              <SectionTitle>Nueva cuenta</SectionTitle>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  value={newTabName}
                  onChange={(e) => setNewTabName(e.target.value)}
                  maxLength={40}
                  placeholder="Nombre de la cuenta"
                  style={input}
                />
                <button
                  type="button"
                  disabled={creating || !newTabName.trim()}
                  onClick={() => void createTab()}
                  style={{ ...primaryBtn, opacity: creating || !newTabName.trim() ? 0.6 : 1 }}
                >
                  <IconPlus size={18} /> Crear
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OrderBlock({
  order,
  items,
  names,
  showName = false,
}: {
  order: Order;
  items: Item[];
  names: Map<string, string>;
  showName?: boolean;
}) {
  const oItems = items.filter((it) => it.order_id === order.id);
  const paid = order.paid_at != null;
  return (
    <div style={{ padding: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: "var(--db-text-tertiary)" }}>
          {showName && order.contact_name ? order.contact_name + " · " : ""}Pedido · {order.status}
        </span>
        {paid ? (
          <Badge tone="paid"><IconCheck size={12} style={{ marginRight: 2 }} />Pagado</Badge>
        ) : (
          <Badge tone="warn">Por cobrar</Badge>
        )}
      </div>
      {oItems.map((it) => {
        const mods = modifierLabels(it.options);
        const note = it.notes || it.special_instructions;
        return (
          <div key={it.id} style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 14 }}>
            <span style={{ color: "var(--db-text-secondary)", minWidth: 24 }}>{it.qty}×</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>{names.get(it.menu_item_id) ?? "Plato"}</span>
                <span style={{ color: "var(--db-text-secondary)" }}>{fmtCents(it.price_cents)}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--db-text-tertiary)" }}>
                {it.item_status}
                {mods ? ` · ${mods}` : ""}
                {note ? ` · ${note}` : ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Presentational helpers (terminal-sized, tokens only) ─────────────────────
function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--db-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: warn ? "var(--db-warning)" : "var(--db-text-primary)" }}>{value}</div>
    </div>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--db-text-tertiary)", margin: "0 0 8px" }}>{children}</div>;
}
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ border: "1px solid var(--db-border)", borderRadius: 14, background: "var(--db-bg-surface)", padding: "12px 14px", marginBottom: 10 }}>{children}</div>;
}
function Notice({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "36px 20px", textAlign: "center", color: "var(--db-text-secondary)", background: "var(--db-bg-surface)", border: "1px solid var(--db-border)", borderRadius: 14, fontSize: 15 }}>{children}</div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: "var(--db-text-secondary)", padding: "4px 0" }}>{children}</div>;
}
function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" | "paid" }) {
  const color = tone === "warn" ? "var(--db-warning)" : tone === "paid" ? "var(--db-success)" : "var(--db-text-secondary)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: "var(--db-bg-overlay)", color }}>
      {children}
    </span>
  );
}

const cardHead: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 };

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--db-bg-base)",
  zIndex: 60,
  display: "flex",
  flexDirection: "column",
};
const header: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "18px 20px 12px",
  borderBottom: "1px solid var(--db-border)",
};
const totalsRow: React.CSSProperties = {
  display: "flex",
  gap: 28,
  padding: "14px 20px",
  borderBottom: "1px solid var(--db-border)",
  flexWrap: "wrap",
};
const body: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "16px 20px calc(24px + env(safe-area-inset-bottom))",
  display: "flex",
  flexDirection: "column",
  gap: 16,
  maxWidth: 720,
  width: "100%",
  margin: "0 auto",
};
const closeBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 44,
  height: 44,
  borderRadius: 12,
  border: "1px solid var(--db-border)",
  background: "var(--db-bg-surface)",
  color: "var(--db-text-primary)",
  cursor: "pointer",
  flexShrink: 0,
};
const input: React.CSSProperties = {
  flex: 1,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid var(--db-border)",
  background: "var(--db-bg-surface)",
  color: "var(--db-text-primary)",
  fontSize: 15,
  minWidth: 0,
};
const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "12px 20px",
  borderRadius: 12,
  background: "var(--db-accent)",
  color: "var(--db-accent-text)",
  border: "none",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const secondaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "12px 20px",
  borderRadius: 12,
  background: "var(--db-bg-surface)",
  color: "var(--db-text-primary)",
  border: "1px solid var(--db-border)",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};
