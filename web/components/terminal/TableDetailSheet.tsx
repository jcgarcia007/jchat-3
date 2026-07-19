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
import { IconX, IconPlus, IconMinus, IconCheck, IconTrash, IconAdjustments, IconLock } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { TakeOrderScreen } from "./TakeOrderScreen";
import { ModifierSheet, type ModGroup } from "./ModifierSheet";
import { loadModifierGroups } from "@/lib/menuGroups";
import { readFunctionError } from "@/lib/functionError";
import type { OrderLineOptions } from "@/lib/orderOptions";
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

// Translate the RPC's raised exceptions into friendly copy — never the raw
// Postgres error.
function rpcMessage(msg: string): string {
  if (msg.includes("NOT_ASSIGNED")) return "Esta mesa está asignada a otro mesero.";
  if (msg.includes("NOT_EMPLOYEE")) return "No eres empleado de este negocio.";
  // NAME_REQUIRED ya no puede ocurrir: desde 082 el nombre es opcional y lo genera
  // el servidor. NAME_TOO_LONG sigue vivo por si algún día se pasa uno a mano.
  if (msg.includes("NAME_TOO_LONG")) return "El nombre es demasiado largo (máx. 40 caracteres).";
  if (msg.includes("TABLE_NOT_FOUND")) return "Esta mesa ya no existe.";
  if (msg.includes("NOT_AUTHENTICATED")) return "Tu sesión expiró. Vuelve a entrar.";
  return "No se pudo crear la cuenta. Inténtalo de nuevo.";
}

export function TableDetailSheet({
  table,
  businessId,
  onClose,
}: {
  table: SheetTable;
  businessId: string;
  onClose: () => void;
}) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [menuInfo, setMenuInfo] = useState<Map<string, { name: string; price_cents: number }>>(new Map());

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Which open tab we're taking an order for (null = the detail view).
  const [takingOrderFor, setTakingOrderFor] = useState<{ id: string; name: string } | null>(null);
  // Set once the waiter claims this (previously unassigned) table, so the header
  // stops saying "Sin asignar" immediately (the grid also refreshes on close).
  const [justClaimed, setJustClaimed] = useState(false);

  // ── Editing an order line (D-63) ──────────────────────────────────────────
  // One in-flight write at a time PER LINE, so a double tap can't fire twice.
  const [busyItems, setBusyItems] = useState<Set<string>>(new Set());
  const [editError, setEditError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ item: Item; isLast: boolean } | null>(null);
  const [editingMods, setEditingMods] = useState<
    { item: Item; name: string; price_cents: number; groups: ModGroup[]; labels: string[] } | null
  >(null);
  const [loadingMods, setLoadingMods] = useState(false);

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
      let names = new Map<string, { name: string; price_cents: number }>();
      if (miIds.length) {
        const { data: mi } = await supabase
          .from("menu_items")
          .select("id, name, price_cents")
          .in("id", miIds);
        names = new Map(
          ((mi ?? []) as { id: string; name: string; price_cents: number }[]).map((m) => [
            m.id,
            { name: m.name, price_cents: m.price_cents },
          ]),
        );
      }

      setTabs(tabRows);
      setOrders(orderRows);
      setItems(itemRows);
      setMenuInfo(names);
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

  /**
   * Can this ORDER still be edited? (D-63 — the lock is per ORDER, not per dish.)
   * A pending dish inside a ticket the kitchen already started is NOT editable.
   * This mirrors what the server enforces; it decides what we OFFER, it is not the
   * defence — update_waiter_order_item re-checks every one of these.
   */
  function editState(order: Order): { editable: true } | { editable: false; reason: string } {
    if (order.paid_at != null) return { editable: false, reason: "Pedido pagado — ya no se puede modificar." };
    if (["cancelled", "delivered", "refunded"].includes(order.status)) {
      return { editable: false, reason: "Este pedido ya está cerrado." };
    }
    const started = items.some(
      (it) => it.order_id === order.id && (it.item_status === "preparing" || it.item_status === "ready"),
    );
    if (started) return { editable: false, reason: "La cocina ya empezó este pedido." };
    return { editable: true };
  }

  /** Translate the EF's errors. Never show a raw one. */
  function editMessage(msg: string): string {
    if (msg.includes("La cocina ya empezó")) return "La cocina ya empezó este pedido, no se puede modificar.";
    if (msg.includes("ya está pagado")) return "Este pedido ya está pagado.";
    if (msg.includes("No puedes editar")) return "No tienes permiso para modificar este pedido.";
    if (msg.includes("ya está cerrado")) return "Este pedido ya está cerrado.";
    if (msg.includes("Item not available")) return "Ese plato se acaba de agotar.";
    if (msg.includes("not found")) return "Ese plato ya no existe en el pedido.";
    return "No se pudo modificar el pedido. Inténtalo de nuevo.";
  }

  /**
   * The ONE path that edits a line. Amounts are never computed here — the EF
   * re-prices from the DB and rewrites the order totals, so we just reload.
   */
  async function editItem(
    item: Item,
    patch: { qty?: number; options?: OrderLineOptions; remove?: boolean },
  ) {
    if (busyItems.has(item.id)) return;
    setBusyItems((s) => new Set(s).add(item.id));
    setEditError(null);
    try {
      const { error } = await supabase.functions.invoke("payments", {
        body: { action: "update_waiter_order_item", order_item_id: item.id, ...patch },
      });
      if (error) {
        const raw = await readFunctionError(error);
        setEditError(editMessage(raw));
        // The kitchen may have started this ticket while the waiter was looking.
        // Reload so the screen catches up and the controls disappear on their own.
        await load();
        return;
      }
      // Totals (line, order, tab) all come back from the server.
      await load();
    } catch {
      setEditError("No se pudo modificar el pedido. Revisa la conexión.");
    } finally {
      setBusyItems((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
    }
  }

  /** Open the shared modifier sheet for an existing line. Groups load on demand. */
  async function openModifiers(item: Item) {
    const info = menuInfo.get(item.menu_item_id);
    if (!info || loadingMods) return;
    setLoadingMods(true);
    setEditError(null);
    try {
      const groups = (await loadModifierGroups([item.menu_item_id])).get(item.menu_item_id) ?? [];
      if (groups.length === 0) {
        setEditError("Este plato no tiene opciones que cambiar.");
        return;
      }
      // Stored options are verified LABELS; the sheet matches them back to groups.
      const labels = modifierLabels(item.options)
        .split(", ")
        .map((l) => l.trim())
        .filter(Boolean);
      setEditingMods({ item, name: info.name, price_cents: info.price_cents, groups, labels });
    } catch {
      setEditError("No se pudieron cargar las opciones del plato.");
    } finally {
      setLoadingMods(false);
    }
  }
  const nothing = tabs.length === 0 && orders.length === 0;

  async function createTab() {
    if (creating) return;
    setCreating(true);
    setActionError(null);
    setNotice(null);
    // open_tab_on_table (079/082, SECURITY DEFINER) is the sanctioned path: it opens
    // the waiter tab AND, on an unassigned table, CLAIMS it for this waiter — a
    // waiter can do neither directly (table_tabs INSERT is waiter-only; table_waiters
    // is owner-only). The INSERT policy is untouched; we never write it directly.
    //
    // No p_name: a waiter never asks "whose account is this?" just to open one. The
    // server names it "Cuenta N" (082), picking the lowest number free among the
    // table's non-closed tabs, so several groups at one table stay distinguishable.
    const { data, error } = await supabase.rpc("open_tab_on_table", {
      p_table_id: table.id,
    });
    setCreating(false);
    if (error) {
      setActionError(rpcMessage(error.message));
      return;
    }
    const res = data as unknown as { claimed_table?: boolean; tab_name?: string } | null;
    // Tell the waiter WHICH tab was created — with several groups at a table, "done"
    // isn't enough to know where the next dishes will go.
    const opened = res?.tab_name ? `${res.tab_name} abierta.` : "Cuenta abierta.";
    if (res?.claimed_table) {
      setJustClaimed(true);
      // D-61: claiming the table is a responsibility the waiter just took on.
      setNotice(`${opened} Te has asignado esta mesa.`);
    } else {
      setNotice(opened);
    }
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
            {table.unassigned && !justClaimed && (
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
        {notice && (
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--db-success)", background: "var(--db-bg-surface)", border: "1px solid var(--db-border)", borderRadius: 12, padding: "12px 14px" }}>
            {notice}
          </div>
        )}
        {editError && (
          <div style={{ fontSize: 14, color: "var(--db-danger)", background: "var(--db-bg-surface)", border: "1px solid var(--db-border)", borderRadius: 12, padding: "12px 14px" }}>
            {editError}
          </div>
        )}
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
                    tabOrders.map((o) => (
                      <OrderBlock
                        key={o.id}
                        order={o}
                        items={items}
                        names={menuInfo}
                        edit={{
                          state: editState(o),
                          busy: busyItems,
                          onQty: (it, qty) => void editItem(it, { qty }),
                          onRemove: (it, isLast) => setRemoving({ item: it, isLast }),
                          onModifiers: (it) => void openModifiers(it),
                        }}
                      />
                    ))
                  )}

                  {/* Only an OPEN tab can take more orders. */}
                  {tab.status === "open" && (
                    <button
                      type="button"
                      onClick={() => setTakingOrderFor({ id: tab.id, name: tab.name })}
                      style={addOrderBtn}
                    >
                      <IconPlus size={18} /> Añadir pedido
                    </button>
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
                    <OrderBlock order={o} items={items} names={menuInfo} showName />
                  </Card>
                ))}
              </div>
            )}

            {/* Create waiter tab — one tap, no name asked. The server names it. */}
            <div>
              <button
                type="button"
                disabled={creating}
                onClick={() => void createTab()}
                style={{ ...primaryBtn, width: "100%", opacity: creating ? 0.6 : 1 }}
              >
                <IconPlus size={18} /> {creating ? "Abriendo…" : "Nueva cuenta"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Remove confirmation — and the honest warning when it's the last dish. */}
      {removing && (
        <div style={confirmOverlay} role="dialog" aria-label="Confirmar quitar plato">
          <div style={confirmPanel}>
            <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 8 }}>¿Quitar este plato?</div>
            <p style={{ fontSize: 14, color: "var(--db-text-secondary)", margin: "0 0 16px", lineHeight: 1.5 }}>
              {menuInfo.get(removing.item.menu_item_id)?.name ?? "Este plato"} ({removing.item.qty}×).
              {removing.isLast && (
                <>
                  {" "}
                  <strong style={{ color: "var(--db-warning)" }}>
                    Es el último plato: el pedido quedará cancelado.
                  </strong>
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => {
                const it = removing.item;
                setRemoving(null);
                void editItem(it, { remove: true });
              }}
              style={{ ...primaryBtn, width: "100%", background: "var(--db-danger)", color: "var(--db-bg-base)" }}
            >
              Sí, quitar
            </button>
            <button
              type="button"
              onClick={() => setRemoving(null)}
              style={{ ...secondaryBtn, width: "100%", marginTop: 8, justifyContent: "center" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Shared modifier sheet, pre-filled with what the line already has. */}
      {editingMods && (
        <ModifierSheet
          dish={{
            name: editingMods.name,
            price_cents: editingMods.price_cents,
            groups: editingMods.groups,
          }}
          initialLabels={editingMods.labels}
          confirmVerb="Guardar"
          onCancel={() => setEditingMods(null)}
          onConfirm={(options) => {
            const it = editingMods.item;
            setEditingMods(null);
            // Only the selection travels — the server re-prices the line.
            void editItem(it, { options });
          }}
        />
      )}

      {takingOrderFor && (
        <TakeOrderScreen
          businessId={businessId}
          tabId={takingOrderFor.id}
          tabName={takingOrderFor.name}
          tableLabel={table.label}
          seats={table.seats}
          onClose={() => setTakingOrderFor(null)}
          // The order landed — refresh this sheet so it shows up immediately.
          onSent={() => void load()}
        />
      )}
    </div>
  );
}

function OrderBlock({
  order,
  items,
  names,
  showName = false,
  edit,
}: {
  order: Order;
  items: Item[];
  names: Map<string, { name: string; price_cents: number }>;
  showName?: boolean;
  /** Absent → read-only rendering (e.g. the QR orders section). */
  edit?: {
    state: { editable: true } | { editable: false; reason: string };
    busy: Set<string>;
    onQty: (item: Item, qty: number) => void;
    onRemove: (item: Item, isLast: boolean) => void;
    onModifiers: (item: Item) => void;
  };
}) {
  const oItems = items.filter((it) => it.order_id === order.id);
  const paid = order.paid_at != null;
  const editable = edit?.state.editable === true;
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
        const busy = edit?.busy.has(it.id) ?? false;
        return (
          <div key={it.id} style={{ padding: "3px 0", fontSize: 14 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ color: "var(--db-text-secondary)", minWidth: 24 }}>{it.qty}×</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>{names.get(it.menu_item_id)?.name ?? "Plato"}</span>
                  <span style={{ color: "var(--db-text-secondary)" }}>{fmtCents(it.price_cents)}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--db-text-tertiary)" }}>
                  {it.item_status}
                  {mods ? ` · ${mods}` : ""}
                  {note ? ` · ${note}` : ""}
                </div>
              </div>
            </div>

            {/* Controls only on an EDITABLE order. Disabled while this line has a
                write in flight, so a double tap can't fire twice. */}
            {editable && edit && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, marginLeft: 32, flexWrap: "wrap", opacity: busy ? 0.5 : 1 }}>
                <button
                  type="button"
                  disabled={busy || it.qty <= 1}
                  onClick={() => edit.onQty(it, it.qty - 1)}
                  aria-label="Quitar uno"
                  style={{ ...miniIconBtn, opacity: it.qty <= 1 ? 0.4 : 1 }}
                >
                  <IconMinus size={16} />
                </button>
                <span style={{ minWidth: 22, textAlign: "center", fontWeight: 800 }}>{it.qty}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => edit.onQty(it, it.qty + 1)}
                  aria-label="Añadir uno"
                  style={miniIconBtn}
                >
                  <IconPlus size={16} />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => edit.onModifiers(it)}
                  style={miniActionBtn}
                >
                  <IconAdjustments size={15} /> Opciones
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => edit.onRemove(it, oItems.length === 1)}
                  style={{ ...miniActionBtn, color: "var(--db-danger)" }}
                >
                  <IconTrash size={15} /> Quitar
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Not editable → say WHY. Controls that vanish without explanation just look
          broken to someone in a rush. */}
      {edit && !editable && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12, color: "var(--db-text-tertiary)" }}>
          <IconLock size={14} />
          {edit.state.editable === false ? edit.state.reason : ""}
        </div>
      )}
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

const confirmOverlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
};
const confirmPanel: React.CSSProperties = {
  background: "var(--db-bg-surface)", border: "1px solid var(--db-border)",
  borderRadius: 18, padding: "20px", width: "100%", maxWidth: 420,
};

const miniIconBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 44, height: 44, borderRadius: 10, border: "1px solid var(--db-border)",
  background: "var(--db-bg-base)", color: "var(--db-text-primary)", cursor: "pointer",
};

const miniActionBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5, minHeight: 44,
  padding: "8px 12px", borderRadius: 10, border: "1px solid var(--db-border)",
  background: "var(--db-bg-base)", color: "var(--db-text-primary)",
  fontSize: 13, fontWeight: 700, cursor: "pointer",
};

const addOrderBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 44,
  marginTop: 10,
  padding: "10px 16px",
  borderRadius: 12,
  border: "1px solid var(--db-accent)",
  background: "transparent",
  color: "var(--db-accent)",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
};

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
