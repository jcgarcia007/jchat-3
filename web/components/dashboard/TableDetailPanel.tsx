"use client";

/**
 * JChat 3.0 — Table detail drawer (Mesas/Taps B2).
 *
 * Right-side drawer over /dashboard/tables. Shows a table's TABS, each tab's
 * orders + items (with per-item status, modifiers, notes), per-tab and table
 * totals, and lets the actor (assigned waiter / owner / admin) create waiter
 * tabs, mark tabs paid/closed, and attach/detach recent unassigned orders via
 * the attach_order_to_tab RPC.
 *
 * Also lets the owner assign / remove waiters for this table inline, writing
 * to table_waiters (same as WaiterAssignment). business_id is set by trigger
 * 070 — do NOT send it; cast payload as never.
 *
 * Reads are owner-scoped by RLS (the dashboard actor is the business owner or a
 * platform admin — a mesero can't reach the web dashboard). Honest states:
 * loading / empty / load-error (distinct, with Reintentar). Tokens: --db-* only.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  IconX,
  IconChevronRight,
  IconChevronDown,
  IconPlus,
  IconCheck,
  IconLock,
  IconUnlink,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  fmtCents as fmt,
  kindLabel,
  tabStatusLabel,
  isTabDebt,
  isTabCollected,
  modifierLabels,
  type TabKind,
  type TabStatus,
  type TFn,
} from "@/lib/tabSemantics";

export interface PanelTable {
  id: string;
  label: string;
  floor: string;
  seats: number;
}

interface Tab {
  id: string;
  name: string;
  kind: TabKind;
  status: TabStatus;
}

interface OrderLite {
  id: string;
  tab_id: string | null;
  total_cents: number;
  status: string;
  created_at: string;
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

interface WaiterEntry {
  employeeId: string;
  name: string;
}

function rpcErrorMessage(msg: string, t: TFn): string {
  if (msg.includes("NOT_ALLOWED")) return t("tablesNoPermission");
  if (msg.includes("CROSS_BUSINESS")) return t("tablesDetailCrossBusiness");
  if (msg.includes("TAB_NOT_FOUND")) return t("tablesDetailTabNotFound");
  if (msg.includes("ORDER_NOT_FOUND")) return t("tablesDetailOrderNotFound");
  if (msg.includes("ORDER_NOT_ATTACHED")) return t("tablesDetailOrderNotAttached");
  return t("tablesDetailUpdateOrderError");
}

/** order.status / item.item_status share the same pending|preparing|ready|… enum. */
function orderStatusLabel(status: string, t: TFn): string {
  switch (status) {
    case "pending": return t("orderStatusPending");
    case "preparing": return t("orderStatusPreparing");
    case "ready": return t("orderStatusReady");
    case "delivered": return t("orderStatusDelivered");
    case "cancelled": return t("orderStatusCancelled");
    default: return status;
  }
}

export function TableDetailPanel({
  table,
  businessId,
  onClose,
  onWaitersChanged,
}: {
  table: PanelTable;
  businessId: string;
  onClose: () => void;
  onWaitersChanged?: () => void;
}) {
  const t = useTranslations("dashboardCommon");
  const tCommon = useTranslations("common");
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [orders, setOrders] = useState<OrderLite[]>([]); // attached orders
  const [items, setItems] = useState<Item[]>([]);
  const [menuNames, setMenuNames] = useState<Map<string, string>>(new Map());
  const [unassigned, setUnassigned] = useState<OrderLite[]>([]);

  // Waiter assignment state
  const [allWaiters, setAllWaiters] = useState<WaiterEntry[]>([]);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [waiterSel, setWaiterSel] = useState("");
  const [busyWaiter, setBusyWaiter] = useState<Set<string>>(new Set());
  const [waiterError, setWaiterError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyTab, setBusyTab] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  const [newTabName, setNewTabName] = useState("");
  const [creating, setCreating] = useState(false);

  const [attachSel, setAttachSel] = useState<Record<string, string>>({}); // orderId -> tabId

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

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [attachedRes, unassignedRes, waitersRes, allEmpsRes] = await Promise.all([
        tabIds.length
          ? supabase.from("orders").select("id, tab_id, total_cents, status, created_at").in("tab_id", tabIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("orders")
          .select("id, tab_id, total_cents, status, created_at")
          .eq("business_id", businessId)
          .is("tab_id", null)
          .not("status", "in", "(delivered,cancelled)")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(25),
        supabase.from("table_waiters").select("employee_id").eq("table_id", table.id),
        supabase
          .from("employees")
          .select("id, user_id")
          .eq("business_id", businessId)
          .eq("status", "accepted"),
      ]);
      if (attachedRes.error) throw attachedRes.error;
      if (unassignedRes.error) throw unassignedRes.error;

      const attached = (attachedRes.data ?? []) as OrderLite[];
      const attachedIds = attached.map((o) => o.id);

      const itemsRes = attachedIds.length
        ? await supabase
            .from("order_items")
            .select("id, order_id, menu_item_id, qty, price_cents, item_status, options, notes, special_instructions")
            .in("order_id", attachedIds)
        : { data: [], error: null };
      if (itemsRes.error) throw itemsRes.error;
      const itemRows = (itemsRes.data ?? []) as Item[];

      const miIds = [...new Set(itemRows.map((i) => i.menu_item_id))];
      let names = new Map<string, string>();
      if (miIds.length) {
        const { data: mi } = await supabase.from("menu_items").select("id, name").in("id", miIds);
        names = new Map(((mi ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name]));
      }

      // Build waiter data: all accepted employees + who's assigned to this table.
      // allEmpsRes soft-fails — if it errors we just show an empty waiter list.
      const allEmps = (allEmpsRes.data ?? []) as { id: string; user_id: string }[];
      const assignedSet = new Set(
        ((waitersRes.data ?? []) as { employee_id: string }[]).map((w) => w.employee_id),
      );

      let allWaitersBuilt: WaiterEntry[] = [];
      if (allEmps.length) {
        const userIds = [...new Set(allEmps.map((e) => e.user_id))];
        const { data: profs } = await supabase
          .from("public_profiles")
          .select("id, username, display_name")
          .in("id", userIds);
        const pmap = new Map(
          ((profs ?? []) as { id: string; username: string | null; display_name: string | null }[]).map((p) => [
            p.id,
            p.display_name ?? p.username ?? "—",
          ]),
        );
        allWaitersBuilt = allEmps.map((e) => ({
          employeeId: e.id,
          name: pmap.get(e.user_id) ?? "—",
        }));
      }

      setTabs(tabRows);
      setOrders(attached);
      setItems(itemRows);
      setMenuNames(names);
      setUnassigned((unassignedRes.data ?? []) as OrderLite[]);
      setAllWaiters(allWaitersBuilt);
      setAssignedIds(assignedSet);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [table.id, businessId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tabTotal = (tabId: string) =>
    orders.filter((o) => o.tab_id === tabId).reduce((s, o) => s + (o.total_cents ?? 0), 0);
  // Consumed (paid or not) — every tab.
  const tableTotal = tabs.reduce((s, t) => s + tabTotal(t.id), 0);
  // Owed = only OPEN WAITER tabs (postpay). Prepaid customer tabs are NOT debt.
  const unpaidTotal = tabs.filter(isTabDebt).reduce((s, t) => s + tabTotal(t.id), 0);
  // Already collected = prepaid customer tabs + waiter tabs marked paid.
  const collectedTotal = tabs.filter(isTabCollected).reduce((s, t) => s + tabTotal(t.id), 0);

  // Derive assigned / available waiter lists from state
  const assignedWaiters = allWaiters.filter((w) => assignedIds.has(w.employeeId));
  const availableWaiters = allWaiters.filter((w) => !assignedIds.has(w.employeeId));
  const waiterNames = assignedWaiters.map((w) => w.name);

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function setTabStatus(tab: Tab, status: "paid" | "closed") {
    if (busyTab.has(tab.id)) return;
    if (status === "closed" && !window.confirm(t("tablesDetailCloseTabConfirm", { name: tab.name }))) return;
    setBusyTab((s) => new Set(s).add(tab.id));
    setActionError(null);

    const patch =
      status === "paid"
        ? { status: "paid" as const, paid_at: new Date().toISOString() }
        : { status: "closed" as const, closed_at: new Date().toISOString(), closed_by: (await supabase.auth.getUser()).data.user?.id ?? null };

    const { error } = await supabase.from("table_tabs").update(patch).eq("id", tab.id);
    setBusyTab((s) => {
      const n = new Set(s);
      n.delete(tab.id);
      return n;
    });
    if (error) {
      setActionError(
        (error as { code?: string }).code === "42501"
          ? t("tablesNoPermission")
          : t("tablesDetailUpdateTabError"),
      );
      return;
    }
    await load();
  }

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
      setActionError(
        (error as { code?: string }).code === "42501"
          ? t("tablesDetailNotAssigned")
          : t("tablesDetailCreateTabError"),
      );
      return;
    }
    setNewTabName("");
    await load();
  }

  async function attach(orderId: string, tabId: string | null) {
    setActionError(null);
    const { error } = await supabase.rpc("attach_order_to_tab", { p_order_id: orderId, p_tab_id: tabId as string });
    if (error) {
      setActionError(rpcErrorMessage(error.message, t));
      return;
    }
    await load();
  }

  async function assignWaiter(employeeId: string) {
    setWaiterError(null);
    setBusyWaiter((s) => new Set(s).add(employeeId));
    // business_id is set by trigger 070 — do NOT send it.
    const payload = { table_id: table.id, employee_id: employeeId } as never;
    const { error } = await supabase.from("table_waiters").insert(payload);
    setBusyWaiter((s) => {
      const n = new Set(s);
      n.delete(employeeId);
      return n;
    });
    if (error) {
      const code = (error as { code?: string }).code ?? "";
      setWaiterError(
        code === "23505"
          ? t("tablesWaiterAlreadyAssigned")
          : code === "42501"
          ? t("tablesNoPermissionAssign")
          : t("tablesAssignUpdateError"),
      );
      return;
    }
    setWaiterSel("");
    await load();
    onWaitersChanged?.();
  }

  async function removeWaiter(employeeId: string) {
    setWaiterError(null);
    setBusyWaiter((s) => new Set(s).add(employeeId));
    const { error } = await supabase
      .from("table_waiters")
      .delete()
      .eq("table_id", table.id)
      .eq("employee_id", employeeId);
    setBusyWaiter((s) => {
      const n = new Set(s);
      n.delete(employeeId);
      return n;
    });
    if (error) {
      setWaiterError(
        (error as { code?: string }).code === "42501"
          ? t("tablesNoPermissionAssign")
          : t("tablesAssignUpdateError"),
      );
      return;
    }
    await load();
    onWaitersChanged?.();
  }

  return (
    <aside
      role="dialog"
      aria-label={t("tablesDetailAria", { label: table.label })}
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        height: "100vh",
        width: "min(440px, 92vw)",
        background: "var(--db-bg-base)",
        borderLeft: "1px solid var(--db-border)",
        boxShadow: "-8px 0 24px rgba(0,0,0,0.18)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div style={{ padding: "18px", borderBottom: "1px solid var(--db-border)", position: "sticky", top: 0, background: "var(--db-bg-base)", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--db-text-primary)" }}>{table.label}</div>
            <div style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>
              {table.floor} · {t("tablesSeatsCountPlural", { count: table.seats })}
            </div>
            <div style={{ fontSize: "12px", color: "var(--db-text-tertiary)", marginTop: "2px" }}>
              {waiterNames.length === 0 ? t("tablesDetailNoWaiterAssigned") : t("tablesDetailWaitersList", { names: waiterNames.join(", ") })}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t("tablesDetailCloseAria")} style={iconBtn}>
            <IconX size={18} />
          </button>
        </div>
        {!loading && !loadError && (
          <div style={{ display: "flex", gap: "16px", marginTop: "12px", flexWrap: "wrap" }}>
            <Metric label={t("tablesMetricTotal")} value={fmt(tableTotal)} />
            <Metric label={t("tablesMetricCollected")} value={fmt(collectedTotal)} />
            <Metric label={t("tabStatusWaiterOpen")} value={fmt(unpaidTotal)} warn={unpaidTotal > 0} />
          </div>
        )}
      </div>

      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {actionError && <div style={{ fontSize: "13px", color: "var(--db-danger)" }}>{actionError}</div>}

        {loading ? (
          <div style={{ color: "var(--db-text-secondary)", fontSize: "14px" }}>{tCommon("loading")}</div>
        ) : loadError ? (
          <div>
            <p style={{ color: "var(--db-danger)", fontSize: "14px", margin: "0 0 10px" }}>
              {t("tablesDetailLoadError")}
            </p>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} style={secondaryBtn}>
              {t("retry")}
            </button>
          </div>
        ) : (
          <>
            {/* Waiters */}
            <Section title={t("tablesDetailWaitersSection")}>
              {/* Assigned chips */}
              {assignedWaiters.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {assignedWaiters.map((w) => (
                    <span
                      key={w.employeeId}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "3px 8px 3px 10px",
                        borderRadius: "999px",
                        background: "color-mix(in srgb, var(--db-accent) 12%, transparent)",
                        color: "var(--db-accent)",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      {w.name}
                      <button
                        type="button"
                        disabled={busyWaiter.has(w.employeeId)}
                        onClick={() => void removeWaiter(w.employeeId)}
                        aria-label={t("tablesDetailRemoveWaiterAria", { name: w.name })}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--db-accent)",
                          padding: 0,
                          opacity: busyWaiter.has(w.employeeId) ? 0.4 : 1,
                          flexShrink: 0,
                        }}
                      >
                        <IconX size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* No waiter assigned */}
              {assignedWaiters.length === 0 && (
                <Empty>{t("tablesDetailNoWaiterAssigned")}</Empty>
              )}

              {/* Assign row */}
              {allWaiters.length === 0 ? (
                <div style={{ fontSize: "12px", color: "var(--db-text-secondary)", marginTop: "4px" }}>
                  {t("tablesNoEmployeesYet")}{" "}
                  <a href="/dashboard/employees" style={{ color: "var(--db-accent)", fontWeight: 600 }}>
                    {t("tablesAddEmployeesLink")}
                  </a>
                </div>
              ) : availableWaiters.length === 0 ? (
                <div style={{ fontSize: "12px", color: "var(--db-text-secondary)", marginTop: "4px" }}>
                  {t("tablesDetailAllWaitersAssigned")}
                </div>
              ) : (
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: assignedWaiters.length > 0 ? "4px" : 0 }}>
                  <select
                    value={waiterSel}
                    onChange={(e) => setWaiterSel(e.target.value)}
                    style={{ ...inputStyle, flex: 1, fontSize: "13px", padding: "7px 10px" }}
                  >
                    <option value="">{t("tablesDetailChooseWaiterOption")}</option>
                    {availableWaiters.map((w) => (
                      <option key={w.employeeId} value={w.employeeId}>{w.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!waiterSel || busyWaiter.size > 0}
                    onClick={() => { if (waiterSel) void assignWaiter(waiterSel); }}
                    style={{ ...secondaryBtn, opacity: !waiterSel || busyWaiter.size > 0 ? 0.5 : 1 }}
                  >
                    {t("tablesDetailAssignButton")}
                  </button>
                </div>
              )}

              {waiterError && (
                <div style={{ fontSize: "12px", color: "var(--db-danger)", marginTop: "2px" }}>
                  {waiterError}
                </div>
              )}
            </Section>

            {/* Tabs */}
            <Section title={t("tablesDetailTabsSection")}>
              {tabs.length === 0 ? (
                <Empty>{t("tablesDetailNoTabs")}</Empty>
              ) : (
                tabs.map((tab) => {
                  const isOpen = expanded.has(tab.id);
                  const tabOrders = orders.filter((o) => o.tab_id === tab.id);
                  const busy = busyTab.has(tab.id);
                  return (
                    <div key={tab.id} style={cardStyle}>
                      <button type="button" onClick={() => toggleExpand(tab.id)} style={tabHeaderBtn}>
                        {isOpen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                        <span style={{ flex: 1, textAlign: "left", fontWeight: 700, color: "var(--db-text-primary)" }}>{tab.name}</span>
                        <Badge>{kindLabel(tab.kind, t)}</Badge>
                        <Badge tone={isTabDebt(tab) ? "warn" : "muted"}>{tabStatusLabel(tab.kind, tab.status, t)}</Badge>
                        <span style={{ fontWeight: 700, color: "var(--db-text-primary)", minWidth: "64px", textAlign: "right" }}>
                          {fmt(tabTotal(tab.id))}
                        </span>
                      </button>

                      {isOpen && (
                        <div style={{ padding: "8px 12px 12px", borderTop: "1px solid var(--db-border)" }}>
                          {tabOrders.length === 0 ? (
                            <Empty>{t("tablesDetailNoOrdersInTab")}</Empty>
                          ) : (
                            tabOrders.map((o) => {
                              const oItems = items.filter((it) => it.order_id === o.id);
                              return (
                                <div key={o.id} style={{ marginBottom: "10px" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                                    <span style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>
                                      {t("tablesDetailOrderStatusLine", { status: orderStatusLabel(o.status, t) })}
                                    </span>
                                    <button type="button" onClick={() => void attach(o.id, null)} style={miniBtn} title={t("tablesDetailDetachTitle")}>
                                      <IconUnlink size={13} /> {t("tablesDetailDetachButton")}
                                    </button>
                                  </div>
                                  {oItems.map((it) => (
                                    <ItemRow key={it.id} item={it} name={menuNames.get(it.menu_item_id) ?? t("tablesDetailDishFallback")} t={t} />
                                  ))}
                                </div>
                              );
                            })
                          )}

                          {(tab.status === "open") && (
                            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                              {/* Customer tabs are prepaid → no "Marcar pagado". "Cerrar" for both. */}
                              {tab.kind === "waiter" && (
                                <button type="button" disabled={busy} onClick={() => void setTabStatus(tab, "paid")} style={{ ...secondaryBtn, opacity: busy ? 0.6 : 1 }}>
                                  <IconCheck size={15} /> {t("tablesDetailMarkPaid")}
                                </button>
                              )}
                              <button type="button" disabled={busy} onClick={() => void setTabStatus(tab, "closed")} style={{ ...secondaryBtn, opacity: busy ? 0.6 : 1 }}>
                                <IconLock size={15} /> {t("tablesDetailCloseTabButton")}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </Section>

            {/* Create waiter tab */}
            <Section title={t("tablesDetailCreateTabSection")}>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  value={newTabName}
                  onChange={(e) => setNewTabName(e.target.value)}
                  maxLength={40}
                  placeholder={t("tablesDetailTabNamePlaceholder")}
                  style={inputStyle}
                />
                <button type="button" disabled={creating || !newTabName.trim()} onClick={() => void createTab()} style={{ ...primaryBtn, opacity: creating || !newTabName.trim() ? 0.6 : 1 }}>
                  <IconPlus size={15} /> {t("tablesDetailCreateButton")}
                </button>
              </div>
            </Section>

            {/* Unassigned orders */}
            <Section title={t("tablesDetailUnassignedSection")}>
              {unassigned.length === 0 ? (
                <Empty>{t("tablesDetailNoUnassigned")}</Empty>
              ) : (
                unassigned.map((o) => (
                  <div key={o.id} style={{ ...cardStyle, padding: "10px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: "var(--db-text-primary)", fontSize: "14px" }}>{fmt(o.total_cents)}</div>
                      <div style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>{orderStatusLabel(o.status, t)}</div>
                    </div>
                    <select
                      value={attachSel[o.id] ?? ""}
                      onChange={(e) => setAttachSel((s) => ({ ...s, [o.id]: e.target.value }))}
                      style={{ ...inputStyle, maxWidth: "140px" }}
                      disabled={tabs.length === 0}
                    >
                      <option value="">{tabs.length === 0 ? t("tablesDetailNoTabsOption") : t("tablesDetailChooseTabOption")}</option>
                      {tabs.map((tabOpt) => (
                        <option key={tabOpt.id} value={tabOpt.id}>{tabOpt.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!attachSel[o.id]}
                      onClick={() => void attach(o.id, attachSel[o.id])}
                      style={{ ...secondaryBtn, opacity: attachSel[o.id] ? 1 : 0.5 }}
                    >
                      {t("tablesDetailAttachButton")}
                    </button>
                  </div>
                ))
              )}
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}

// ── Small presentational helpers (tokens only) ───────────────────────────────

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: "11px", color: "var(--db-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: "17px", fontWeight: 800, color: warn ? "var(--db-warning)" : "var(--db-text-primary)" }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--db-text-tertiary)" }}>{title}</div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>{children}</div>;
}

function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "warn" | "muted" }) {
  const color = tone === "warn" ? "var(--db-warning)" : "var(--db-text-secondary)";
  return (
    <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 7px", borderRadius: "999px", background: "var(--db-bg-overlay)", color }}>
      {children}
    </span>
  );
}

function ItemRow({ item, name, t }: { item: Item; name: string; t: TFn }) {
  const mods = modifierLabels(item.options);
  const note = item.notes || item.special_instructions;
  return (
    <div style={{ display: "flex", gap: "8px", padding: "4px 0", fontSize: "13px" }}>
      <span style={{ color: "var(--db-text-secondary)", minWidth: "22px" }}>{item.qty}×</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
          <span style={{ color: "var(--db-text-primary)" }}>{name}</span>
          <span style={{ color: "var(--db-text-secondary)" }}>{fmt(item.price_cents)}</span>
        </div>
        <div style={{ fontSize: "11px", color: "var(--db-text-tertiary)" }}>
          {orderStatusLabel(item.item_status, t)}
          {mods ? ` · ${mods}` : ""}
          {note ? ` · ${note}` : ""}
        </div>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "32px",
  height: "32px",
  borderRadius: "8px",
  border: "1px solid var(--db-border)",
  background: "var(--db-bg-surface)",
  color: "var(--db-text-primary)",
  cursor: "pointer",
  flexShrink: 0,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--db-border)",
  borderRadius: "12px",
  background: "var(--db-bg-surface)",
  marginBottom: "8px",
};

const tabHeaderBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  width: "100%",
  padding: "10px 12px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "var(--db-text-primary)",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "9px 14px",
  borderRadius: "8px",
  background: "var(--db-accent)",
  color: "var(--db-accent-text)",
  border: "none",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "8px 12px",
  borderRadius: "8px",
  background: "transparent",
  color: "var(--db-text-primary)",
  border: "1px solid var(--db-border)",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const miniBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  padding: "3px 8px",
  borderRadius: "6px",
  background: "transparent",
  color: "var(--db-text-secondary)",
  border: "1px solid var(--db-border)",
  fontSize: "11px",
  fontWeight: 600,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "9px 11px",
  borderRadius: "8px",
  border: "1px solid var(--db-border)",
  background: "var(--db-bg-surface)",
  color: "var(--db-text-primary)",
  fontSize: "14px",
  minWidth: 0,
};
