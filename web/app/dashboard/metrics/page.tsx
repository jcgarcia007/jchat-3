"use client";

/**
 * JChat 3.0 — KDS Time Metrics v2
 *
 * Read-only page. Data sources:
 *   RPC: pos_kds_metrics_v2(p_business_id, p_from, p_to, p_station, p_taken_by, p_tz)
 *   Direct queries: orders + order_items + menu_items + businesses.kds_settings (Por Orden section)
 *
 * Sections: Filtros · KPIs (5) · Platos por hora · Por estación · Por mesero · Por orden · CSV
 * DO NOT touch payments, KDS order flow, or the mobile POS.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  IconChartBar,
  IconRefresh,
  IconAlertCircle,
  IconClock,
  IconChefHat,
  IconGlass,
  IconDownload,
  IconChevronDown,
  IconChevronRight,
  IconStar,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SlaConfig {
  pending_mins?: number | null;
  preparing_mins?: number | null;
  ready_mins?: number | null;
}

interface PhaseMetrics {
  count: number;
  queue_secs: number | null;
  prep_secs: number | null;
  pickup_secs: number | null;
  sla_pct: number | null;
}

interface StationMetrics {
  station: string;
  count: number;
  queue_secs: number | null;
  prep_secs: number | null;
  pickup_secs: number | null;
  sla_pct: number | null;
}

interface WaiterMetrics {
  taken_by: string | null;
  count: number;
  wait_secs: number | null;
  pickup_secs: number | null;
  sla_pct: number | null;
}

interface HourMetrics {
  hour: number;
  count: number;
}

interface SlowestItem {
  name: string;
  count: number;
  prep_secs: number | null;
  sla_secs: number | null;
  over_pct: number | null;
}

interface MetricsV2Result {
  overall: PhaseMetrics;
  prev: PhaseMetrics;
  by_station: StationMetrics[];
  by_waiter: WaiterMetrics[];
  by_hour: HourMetrics[];
  slowest: SlowestItem[];
}

interface OrderRow {
  id: string;
  table_label: string | null;
  taken_by: string | null;
  created_at: string;
}

interface ItemRow {
  order_id: string;
  menu_item_id: string;
  created_at: string;
  preparing_at: string | null;
  ready_at: string | null;
  done_at: string | null;
}

interface MenuItemRow {
  id: string;
  name: string;
  station: string | null;
  sla: SlaConfig | null;
}

interface WaiterOption {
  userId: string;
  name: string;
}

type RangePreset = "today" | "7d" | "30d" | "custom";
type SlaHeat = "normal" | "warning" | "exceeded" | "none";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSecs(secs: number | null | undefined): string {
  if (secs == null || !isFinite(secs)) return "—";
  const total = Math.round(secs);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function fmtHour(h: number): string {
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function calcRange(
  preset: RangePreset,
  customStart: string,
  customEnd: string,
): { from: Date; to: Date; fromStr: string; toStr: string } {
  const now = new Date();
  let from: Date;
  let to: Date = now;
  if (preset === "today") {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (preset === "7d") {
    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (preset === "30d") {
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else {
    // custom
    from = isValidDate(customStart) ? new Date(`${customStart}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    to = isValidDate(customEnd) ? new Date(`${customEnd}T23:59:59.999`) : now;
  }
  return { from, to, fromStr: formatLocalDate(from), toStr: formatLocalDate(to) };
}

function slaPctColor(pct: number | null): string {
  if (pct == null) return "var(--db-text-tertiary)";
  if (pct >= 90) return "var(--db-success)";
  if (pct >= 75) return "var(--db-warning)";
  return "var(--db-danger)";
}

function slaPctBg(pct: number | null): string {
  if (pct == null) return "transparent";
  if (pct >= 90) return "rgba(29,158,117,0.12)";
  if (pct >= 75) return "rgba(245,158,11,0.12)";
  return "rgba(239,68,68,0.12)";
}

/** Threshold in seconds for a given SLA phase key. */
function slaThreshSecs(
  key: keyof SlaConfig,
  itemSla: SlaConfig | null,
  bizSla: SlaConfig | null,
): number | null {
  const v = itemSla?.[key] ?? bizSla?.[key] ?? null;
  return typeof v === "number" && v > 0 ? v * 60 : null;
}

/** Compute worst SLA heat for a single order item across all completed/in-progress phases. */
function itemHeat(item: ItemRow, menuItem: MenuItemRow | undefined, bizSla: SlaConfig | null): SlaHeat {
  const iSla = menuItem?.sla ?? null;
  let worst = 0; // 0=none,1=normal,2=warning,3=exceeded
  const now = Date.now();

  const phases: Array<{ key: keyof SlaConfig; start: string; end: string | null }> = [
    { key: "pending_mins",   start: item.created_at,   end: item.preparing_at },
    { key: "preparing_mins", start: item.preparing_at ?? "", end: item.ready_at },
    { key: "ready_mins",     start: item.ready_at ?? "", end: item.done_at },
  ];

  for (const phase of phases) {
    if (!phase.start) continue;
    const thresh = slaThreshSecs(phase.key, iSla, bizSla);
    if (!thresh) continue;

    const startMs = new Date(phase.start).getTime();
    const endMs = phase.end ? new Date(phase.end).getTime() : now;
    if (isNaN(startMs)) continue;
    const ratio = (endMs - startMs) / 1000 / thresh;

    const rank = ratio >= 1 ? 3 : ratio >= 0.8 ? 2 : 1;
    if (rank > worst) worst = rank;
    if (worst === 3) break;
  }
  return worst === 3 ? "exceeded" : worst === 2 ? "warning" : worst === 1 ? "normal" : "none";
}

/** Worst heat across all visible items for one order. */
function orderHeat(
  items: ItemRow[],
  menuItems: Record<string, MenuItemRow>,
  bizSla: SlaConfig | null,
): SlaHeat {
  let worst: 0 | 1 | 2 | 3 = 0; // 0=none,1=normal,2=warning,3=exceeded
  for (const it of items) {
    const h = itemHeat(it, menuItems[it.menu_item_id], bizSla);
    const rank = h === "exceeded" ? 3 : h === "warning" ? 2 : h === "normal" ? 1 : 0;
    if (rank > worst) worst = rank as 0 | 1 | 2 | 3;
    if (worst === 3) break;
  }
  return worst === 3 ? "exceeded" : worst === 2 ? "warning" : worst === 1 ? "normal" : "none";
}

function heatColor(heat: SlaHeat): string {
  if (heat === "exceeded") return "var(--db-danger)";
  if (heat === "warning") return "var(--db-warning)";
  if (heat === "normal") return "var(--db-success)";
  return "var(--db-text-tertiary)";
}

function csvEsc(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_WAITER_A = "demo-waiter-a";
const DEMO_WAITER_B = "demo-waiter-b";

const DEMO_METRICS: MetricsV2Result = {
  overall: { count: 184, queue_secs: 87, prep_secs: 462, pickup_secs: 68, sla_pct: 82 },
  prev:    { count: 161, queue_secs: 102, prep_secs: 510, pickup_secs: 74, sla_pct: 76 },
  by_station: [
    { station: "kitchen", count: 128, queue_secs: 98,  prep_secs: 520, pickup_secs: 75, sla_pct: 80 },
    { station: "bar",     count: 56,  queue_secs: 62,  prep_secs: 340, pickup_secs: 52, sla_pct: 88 },
  ],
  by_waiter: [
    { taken_by: DEMO_WAITER_A, count: 102, wait_secs: 630, pickup_secs: 65, sla_pct: 85 },
    { taken_by: DEMO_WAITER_B, count:  82, wait_secs: 740, pickup_secs: 72, sla_pct: 78 },
    { taken_by: null,           count:   0, wait_secs: null, pickup_secs: null, sla_pct: null },
  ],
  by_hour: [
    { hour: 11, count: 14 }, { hour: 12, count: 38 }, { hour: 13, count: 42 },
    { hour: 14, count: 31 }, { hour: 15, count: 18 }, { hour: 19, count: 22 },
    { hour: 20, count: 35 }, { hour: 21, count: 28 }, { hour: 22, count: 11 },
  ],
  slowest: [
    { name: "Wagyu Burger",    count: 14, prep_secs: 940, sla_secs: 480, over_pct: 96 },
    { name: "Seafood Paella",  count:  8, prep_secs: 880, sla_secs: 480, over_pct: 83 },
    { name: "Beef Wellington", count:  5, prep_secs: 820, sla_secs: 480, over_pct: 71 },
    { name: "Truffle Risotto", count: 17, prep_secs: 700, sla_secs: 480, over_pct: 46 },
    { name: "Rack of Lamb",    count:  9, prep_secs: 640, sla_secs: null, over_pct: null },
  ],
};

const DEMO_ORDERS: OrderRow[] = [
  { id: "demo-order-001", table_label: "Mesa 3", taken_by: DEMO_WAITER_A, created_at: "2026-08-19T12:30:00.000Z" },
  { id: "demo-order-002", table_label: "Mesa 7", taken_by: DEMO_WAITER_B, created_at: "2026-08-19T13:05:00.000Z" },
  { id: "demo-order-003", table_label: null,     taken_by: null,           created_at: "2026-08-19T19:45:00.000Z" },
];

const DEMO_ORDER_ITEMS: ItemRow[] = [
  // Order 001 — burger (prep exceeded), fries (ok)
  { order_id: "demo-order-001", menu_item_id: "demo-mi-001", created_at: "2026-08-19T12:30:00.000Z", preparing_at: "2026-08-19T12:32:00.000Z", ready_at: "2026-08-19T12:42:00.000Z", done_at: "2026-08-19T12:43:30.000Z" },
  { order_id: "demo-order-001", menu_item_id: "demo-mi-002", created_at: "2026-08-19T12:30:00.000Z", preparing_at: "2026-08-19T12:31:00.000Z", ready_at: "2026-08-19T12:35:00.000Z", done_at: "2026-08-19T12:36:00.000Z" },
  // Order 002 — risotto (warning), cocktail (ok)
  { order_id: "demo-order-002", menu_item_id: "demo-mi-003", created_at: "2026-08-19T13:05:00.000Z", preparing_at: "2026-08-19T13:07:00.000Z", ready_at: "2026-08-19T13:17:00.000Z", done_at: "2026-08-19T13:19:00.000Z" },
  { order_id: "demo-order-002", menu_item_id: "demo-mi-004", created_at: "2026-08-19T13:05:00.000Z", preparing_at: "2026-08-19T13:06:00.000Z", ready_at: "2026-08-19T13:09:00.000Z", done_at: "2026-08-19T13:10:00.000Z" },
  // Order 003 — in progress
  { order_id: "demo-order-003", menu_item_id: "demo-mi-001", created_at: "2026-08-19T19:45:00.000Z", preparing_at: "2026-08-19T19:47:00.000Z", ready_at: null, done_at: null },
];

const DEMO_MENU_ITEMS: Record<string, MenuItemRow> = {
  "demo-mi-001": { id: "demo-mi-001", name: "Wagyu Burger",    station: "kitchen", sla: { pending_mins: 3, preparing_mins: 8,  ready_mins: 2 } },
  "demo-mi-002": { id: "demo-mi-002", name: "Truffle Fries",   station: "kitchen", sla: { pending_mins: 2, preparing_mins: 5,  ready_mins: 2 } },
  "demo-mi-003": { id: "demo-mi-003", name: "Truffle Risotto", station: "kitchen", sla: { pending_mins: 3, preparing_mins: 9,  ready_mins: 2 } },
  "demo-mi-004": { id: "demo-mi-004", name: "Margarita",       station: "bar",     sla: { pending_mins: 2, preparing_mins: 3,  ready_mins: 1 } },
};

const DEMO_WAITER_NAMES: Record<string, string> = {
  [DEMO_WAITER_A]: "Ana García",
  [DEMO_WAITER_B]: "Luis Pérez",
};

const DEMO_BIZ_SLA: SlaConfig = { pending_mins: 3, preparing_mins: 10, ready_mins: 2 };

// ── Main component ────────────────────────────────────────────────────────────

export default function MetricsPage() {
  const t = useTranslations("dashboardCommon");

  // ── Filter state ──────────────────────────────────────────────────────────
  const [preset, setPreset]           = useState<RangePreset>("7d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd]     = useState("");
  const [station, setStation]         = useState<string>(""); // "" = all
  const [waiterFilter, setWaiterFilter] = useState<string>(""); // "" = all

  // ── Data state ────────────────────────────────────────────────────────────
  const [metrics, setMetrics]             = useState<MetricsV2Result | null>(null);
  const [loadingRpc, setLoadingRpc]       = useState(true);
  const [errorRpc, setErrorRpc]           = useState<string | null>(null);
  const [needsRegister, setNeedsRegister] = useState(false);
  const [businessId, setBusinessId]       = useState<string | null>(null);

  // Waiter options for filter dropdown
  const [waiterOptions, setWaiterOptions] = useState<WaiterOption[]>([]);
  const [waiterNames, setWaiterNames]     = useState<Record<string, string>>({});

  // Per-order section
  const [orders, setOrders]           = useState<OrderRow[]>([]);
  const [orderItems, setOrderItems]   = useState<ItemRow[]>([]);
  const [menuItems, setMenuItems]     = useState<Record<string, MenuItemRow>>({});
  const [bizSla, setBizSla]           = useState<SlaConfig | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [errorOrders, setErrorOrders]     = useState<string | null>(null);

  // Expanded order rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // ── Resolve business + load waiter options once ───────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setWaiterOptions([
        { userId: DEMO_WAITER_A, name: DEMO_WAITER_NAMES[DEMO_WAITER_A] },
        { userId: DEMO_WAITER_B, name: DEMO_WAITER_NAMES[DEMO_WAITER_B] },
      ]);
      setWaiterNames(DEMO_WAITER_NAMES);
      setBusinessId("demo");
      return;
    }

    void (async () => {
      const res = await resolveActiveBusiness();
      if (!res.ok) {
        if (res.reason === "no_business" || res.reason === "unauthenticated") setNeedsRegister(true);
        return;
      }
      const bid = res.business.id;
      setBusinessId(bid);

      // Load accepted employees
      const { data: emps } = await supabase
        .from("employees")
        .select("user_id")
        .eq("business_id", bid)
        .eq("status", "accepted");

      if (!emps?.length) return;
      const ids = emps.map((e: { user_id: string }) => e.user_id);

      const { data: profs } = await supabase
        .from("public_profiles")
        .select("id, username, display_name")
        .in("id", ids);

      const nameMap: Record<string, string> = {};
      const opts: WaiterOption[] = [];
      for (const p of (profs ?? []) as { id: string; username: string | null; display_name: string | null }[]) {
        const name = p.display_name ?? p.username ?? "—";
        nameMap[p.id] = name;
        opts.push({ userId: p.id, name });
      }
      setWaiterNames(nameMap);
      setWaiterOptions(opts);
    })();
  }, []);

  // ── Load RPC metrics ──────────────────────────────────────────────────────
  const loadMetrics = useCallback(
    async (bid: string, rPreset: RangePreset, cStart: string, cEnd: string, stn: string, wf: string) => {
      setLoadingRpc(true);
      setErrorRpc(null);

      if (!isSupabaseConfigured) {
        await new Promise((r) => setTimeout(r, 300));
        setMetrics(DEMO_METRICS);
        setLoadingRpc(false);
        return;
      }

      try {
        const { from, to } = calcRange(rPreset, cStart, cEnd);
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

        const { data, error } = await (supabase as unknown as {
          rpc(
            fn: "pos_kds_metrics_v2",
            params: {
              p_business_id: string; p_from: string; p_to: string;
              p_station: string | null; p_taken_by: string | null; p_tz: string;
            },
          ): Promise<{ data: MetricsV2Result | null; error: { message: string } | null }>;
        }).rpc("pos_kds_metrics_v2", {
          p_business_id: bid,
          p_from: from.toISOString(),
          p_to: to.toISOString(),
          p_station: stn || null,
          p_taken_by: wf || null,
          p_tz: tz,
        });

        if (error) throw error;
        setMetrics(data);
      } catch (e) {
        setErrorRpc(e instanceof Error ? e.message : t("metricsErrorLoad"));
      } finally {
        setLoadingRpc(false);
      }
    },
    [t],
  );

  // ── Load per-order section ────────────────────────────────────────────────
  const loadOrders = useCallback(
    async (bid: string, rPreset: RangePreset, cStart: string, cEnd: string, stn: string, wf: string) => {
      setLoadingOrders(true);
      setErrorOrders(null);
      setExpanded(new Set());

      if (!isSupabaseConfigured) {
        // Filter demo orders by station if active
        let visOrders = DEMO_ORDERS;
        let visItems = DEMO_ORDER_ITEMS;
        if (stn) {
          const miIds = Object.values(DEMO_MENU_ITEMS).filter((m) => m.station === stn).map((m) => m.id);
          visItems = DEMO_ORDER_ITEMS.filter((i) => miIds.includes(i.menu_item_id));
          const orderIdsWithItems = new Set(visItems.map((i) => i.order_id));
          visOrders = DEMO_ORDERS.filter((o) => orderIdsWithItems.has(o.id));
        }
        if (wf) {
          visOrders = visOrders.filter((o) => o.taken_by === wf);
          const orderIdsWithItems = new Set(visOrders.map((o) => o.id));
          visItems = visItems.filter((i) => orderIdsWithItems.has(i.order_id));
        }
        setOrders(visOrders);
        setOrderItems(visItems);
        setMenuItems(DEMO_MENU_ITEMS);
        setBizSla(DEMO_BIZ_SLA);
        setLoadingOrders(false);
        return;
      }

      try {
        const { from, to } = calcRange(rPreset, cStart, cEnd);

        // 1. Load orders
        let q = supabase
          .from("orders")
          .select("id, table_label, taken_by, created_at")
          .eq("business_id", bid)
          .is("canceled_at", null)
          .gte("created_at", from.toISOString())
          .lt("created_at", to.toISOString())
          .order("created_at", { ascending: false })
          .limit(50);
        if (wf) q = q.eq("taken_by", wf);

        const { data: ordersData, error: ordErr } = await q;
        if (ordErr) throw ordErr;
        if (!ordersData?.length) {
          setOrders([]); setOrderItems([]); setMenuItems({}); setBizSla(null);
          setLoadingOrders(false);
          return;
        }

        const orderIds = (ordersData as OrderRow[]).map((o) => o.id);

        // 2. Load order_items in parallel with biz SLA
        const [itmRes, bizRes] = await Promise.all([
          (supabase as unknown as {
            from(t: "order_items"): {
              select(c: string): { in(col: string, vals: string[]): Promise<{ data: ItemRow[] | null; error: { message: string } | null }> };
            };
          })
            .from("order_items")
            .select("order_id, menu_item_id, created_at, preparing_at, ready_at, done_at")
            .in("order_id", orderIds),
          supabase
            .from("businesses")
            .select("kds_settings")
            .eq("id", bid)
            .maybeSingle(),
        ]);

        if (itmRes.error) throw itmRes.error;

        const rawItems = (itmRes.data ?? []) as ItemRow[];

        // 3. Load menu_items
        const miIds = [...new Set(rawItems.map((i) => i.menu_item_id))];
        const miMap: Record<string, MenuItemRow> = {};
        if (miIds.length) {
          const { data: miData } = await supabase
            .from("menu_items")
            .select("id, name, station, sla")
            .in("id", miIds);
          for (const mi of (miData ?? []) as MenuItemRow[]) miMap[mi.id] = mi;
        }

        // Apply station filter to items, then exclude orders with no remaining items
        let filteredItems = rawItems;
        if (stn) {
          filteredItems = rawItems.filter((i) => miMap[i.menu_item_id]?.station === stn);
        }
        const orderIdsWithItems = new Set(filteredItems.map((i) => i.order_id));
        const filteredOrders = (ordersData as OrderRow[]).filter((o) => orderIdsWithItems.has(o.id));

        const kds = bizRes.data as { kds_settings: { sla?: SlaConfig } | null } | null;
        const bSla = kds?.kds_settings?.sla ?? null;

        setOrders(filteredOrders);
        setOrderItems(filteredItems);
        setMenuItems(miMap);
        setBizSla(bSla);
      } catch (e) {
        setErrorOrders(e instanceof Error ? e.message : t("metricsErrorLoad"));
      } finally {
        setLoadingOrders(false);
      }
    },
    [t],
  );

  // ── Re-load on filter / business change ──────────────────────────────────
  useEffect(() => {
    if (!businessId) return;
    void loadMetrics(businessId, preset, customStart, customEnd, station, waiterFilter);
    void loadOrders(businessId, preset, customStart, customEnd, station, waiterFilter);
  }, [businessId, preset, customStart, customEnd, station, waiterFilter, loadMetrics, loadOrders]);

  // ── CSV export ────────────────────────────────────────────────────────────
  function downloadCsv() {
    const { fromStr, toStr } = calcRange(preset, customStart, customEnd);
    const rows: string[] = [
      [
        t("metricsCSVDate"), t("metricsCSVTime"), t("metricsCSVOrder"),
        t("metricsCSVTable"), t("metricsCSVWaiter"), t("metricsCSVProduct"),
        t("metricsCSVStation"), t("metricsCSVQueueSecs"), t("metricsCSVPrepSecs"),
        t("metricsCSVPickupSecs"), t("metricsCSVTotalSecs"), t("metricsCSVWithinSla"),
      ].map(csvEsc).join(","),
    ];

    for (const order of orders) {
      const visItems = orderItems.filter((i) => i.order_id === order.id);
      const waiterName = order.taken_by ? (waiterNames[order.taken_by] ?? "—") : "—";
      const d = new Date(order.created_at);
      const datePart = formatLocalDate(d);
      const timePart = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const ordShort = order.id.slice(0, 8);

      for (const item of visItems) {
        const mi = menuItems[item.menu_item_id];
        const qS = item.preparing_at ? Math.round((new Date(item.preparing_at).getTime() - new Date(item.created_at).getTime()) / 1000) : null;
        const pS = item.ready_at && item.preparing_at ? Math.round((new Date(item.ready_at).getTime() - new Date(item.preparing_at).getTime()) / 1000) : null;
        const pkS = item.done_at && item.ready_at ? Math.round((new Date(item.done_at).getTime() - new Date(item.ready_at).getTime()) / 1000) : null;
        const totS = item.done_at ? Math.round((new Date(item.done_at).getTime() - new Date(item.created_at).getTime()) / 1000) : null;

        const heat = itemHeat(item, mi, bizSla);
        const withinSla = heat === "none" ? "—" : heat === "normal" ? t("metricsCSVYes") : t("metricsCSVNo");

        rows.push([
          csvEsc(datePart),
          csvEsc(timePart),
          csvEsc(ordShort),
          csvEsc(order.table_label ?? "—"),
          csvEsc(waiterName),
          csvEsc(mi?.name ?? "—"),
          csvEsc(mi?.station ?? "—"),
          csvEsc(qS != null ? String(qS) : "—"),
          csvEsc(pS != null ? String(pS) : "—"),
          csvEsc(pkS != null ? String(pkS) : "—"),
          csvEsc(totS != null ? String(totS) : "—"),
          csvEsc(withinSla),
        ].join(","));
      }
    }

    const bom = "﻿";
    const blob = new Blob([bom + rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `metricas_${fromStr}_${toStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const itemsByOrder = useMemo(() => {
    const map: Record<string, ItemRow[]> = {};
    for (const it of orderItems) {
      (map[it.order_id] ??= []).push(it);
    }
    return map;
  }, [orderItems]);

  const maxHourCount = useMemo(() => {
    return Math.max(1, ...((metrics?.by_hour ?? []).map((h) => h.count)));
  }, [metrics]);

  // ── Early exits ───────────────────────────────────────────────────────────
  if (!loadingRpc && needsRegister) {
    return (
      <div style={{ maxWidth: "960px" }}>
        <PageHeader t={t} />
        <NoBusinessCTA message={t("metricsNoBusinessMessage")} />
      </div>
    );
  }

  const overall = metrics?.overall ?? null;
  const prev    = metrics?.prev ?? null;
  const isEmpty = !loadingRpc && !errorRpc && overall != null && overall.count === 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: "1040px" }}>

      {/* Header */}
      <div style={{ marginBottom: "20px" }}>
        <PageHeader t={t} />
      </div>

      {/* ── Filter row ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: "8px",
          flexWrap: "wrap", marginBottom: "20px",
          padding: "12px 14px",
          background: "var(--db-bg-surface)",
          border: "1px solid var(--db-border)",
          borderRadius: "var(--db-radius-card)",
        }}
      >
        {/* Range presets */}
        <div style={{ display: "flex", gap: "3px", background: "var(--db-bg-base)", border: "1px solid var(--db-border)", borderRadius: "var(--db-radius)", padding: "2px", flexShrink: 0 }}>
          {(["today", "7d", "30d", "custom"] as RangePreset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              style={{
                padding: "4px 12px", borderRadius: "calc(var(--db-radius) - 2px)",
                border: "none",
                background: preset === p ? "var(--db-accent)" : "transparent",
                color: preset === p ? "var(--db-accent-text)" : "var(--db-text-secondary)",
                fontSize: "12px", fontWeight: preset === p ? 700 : 400, cursor: "pointer",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {p === "today" ? t("metricsRangeToday") : p === "7d" ? t("metricsRange7d") : p === "30d" ? t("metricsRange30d") : t("metricsRangeCustom")}
            </button>
          ))}
        </div>

        {/* Custom date inputs */}
        {preset === "custom" && (
          <>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              style={dateInputStyle}
              aria-label={t("metricsRangeFrom")}
            />
            <span style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>→</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              style={dateInputStyle}
              aria-label={t("metricsRangeTo")}
            />
          </>
        )}

        {/* Area select */}
        <select value={station} onChange={(e) => setStation(e.target.value)} style={selectStyle} aria-label={t("metricsFilterArea")}>
          <option value="">{t("metricsFilterArea")}: {t("metricsFilterAreaAll")}</option>
          <option value="kitchen">{t("metricsStationKitchen")}</option>
          <option value="bar">{t("metricsStationBar")}</option>
        </select>

        {/* Waiter select */}
        <select value={waiterFilter} onChange={(e) => setWaiterFilter(e.target.value)} style={selectStyle} aria-label={t("metricsFilterWaiter")}>
          <option value="">{t("metricsFilterWaiter")}: {t("metricsFilterWaiterAll")}</option>
          {waiterOptions.map((w) => (
            <option key={w.userId} value={w.userId}>{w.name}</option>
          ))}
        </select>

        {/* Cook select — disabled, Phase 2 */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <select disabled style={{ ...selectStyle, opacity: 0.5, cursor: "not-allowed" }}>
            <option>{t("metricsFilterCook")}</option>
          </select>
          <span style={{
            position: "absolute", top: "-6px", right: "-4px",
            background: "var(--db-warning)", color: "#000",
            fontSize: "9px", fontWeight: 700, padding: "1px 4px",
            borderRadius: "999px", lineHeight: "14px",
          }}>
            {t("metricsFilterCookPhase2")}
          </span>
        </div>

        {/* CSV export — right side */}
        <button
          type="button"
          onClick={downloadCsv}
          disabled={orders.length === 0}
          style={{
            marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "5px",
            padding: "6px 12px", borderRadius: "var(--db-radius)", border: "1px solid var(--db-border)",
            background: "var(--db-bg-surface)", color: "var(--db-text-primary)",
            fontSize: "12px", fontWeight: 600, cursor: orders.length === 0 ? "not-allowed" : "pointer",
            opacity: orders.length === 0 ? 0.5 : 1,
            transition: "opacity 0.15s",
          }}
        >
          <IconDownload size={13} />
          {t("metricsExportCsv")}
        </button>
      </div>

      {/* Error */}
      {errorRpc && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "var(--db-radius)", background: "rgba(239,68,68,0.12)", color: "var(--db-danger)", fontSize: "13px", marginBottom: "16px" }}>
          <IconAlertCircle size={15} /> {errorRpc}
        </div>
      )}

      {/* Loading */}
      {loadingRpc && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "40px", color: "var(--db-text-secondary)", fontSize: "14px" }}>
          <IconRefresh size={18} style={{ animation: "spin 1s linear infinite" }} />
          {t("metricsLoading")}
        </div>
      )}

      {/* Empty */}
      {isEmpty && (
        <div style={{ textAlign: "center", padding: "60px 24px", background: "var(--db-bg-surface)", borderRadius: "var(--db-radius-card)", border: "1px solid var(--db-border)" }}>
          <IconClock size={36} color="var(--db-text-tertiary)" style={{ marginBottom: "12px" }} />
          <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--db-text-primary)", margin: "0 0 6px" }}>{t("metricsEmpty")}</p>
          <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: 0 }}>{t("metricsEmptySub")}</p>
        </div>
      )}

      {/* ── Main content ───────────────────────────────────────────────────── */}
      {!loadingRpc && !isEmpty && metrics && (
        <>
          {/* Section 1 — KPI cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px", marginBottom: "20px" }}>
            <KpiCard
              label={t("metricsKpiSla")}
              sub={t("metricsKpiSlaSub")}
              value={overall?.sla_pct != null ? `${overall.sla_pct}%` : "—"}
              icon={<IconStar size={14} />}
              accent={slaPctColor(overall?.sla_pct ?? null)}
              delta={buildDelta(overall?.sla_pct ?? null, prev?.sla_pct ?? null, "sla")}
            />
            <KpiCard
              label={t("metricsCardQueue")}
              sub={t("metricsCardQueueSub")}
              value={fmtSecs(overall?.queue_secs)}
              accent="var(--db-warning)"
              delta={buildDelta(overall?.queue_secs ?? null, prev?.queue_secs ?? null, "time")}
            />
            <KpiCard
              label={t("metricsCardPrep")}
              sub={t("metricsCardPrepSub")}
              value={fmtSecs(overall?.prep_secs)}
              accent="var(--db-accent)"
              delta={buildDelta(overall?.prep_secs ?? null, prev?.prep_secs ?? null, "time")}
            />
            <KpiCard
              label={t("metricsCardPickup")}
              sub={t("metricsCardPickupSub")}
              value={fmtSecs(overall?.pickup_secs)}
              accent="var(--db-success)"
              delta={buildDelta(overall?.pickup_secs ?? null, prev?.pickup_secs ?? null, "time")}
            />
            <KpiCard
              label={t("metricsCardItems")}
              sub={t("metricsKpiItemsSub")}
              value={String(overall?.count ?? 0)}
              accent="var(--db-text-secondary)"
              large={false}
              delta={null}
            />
          </div>

          {/* Section 2 — Platos por hora */}
          {metrics.by_hour.length > 0 && (
            <SectionCard title={t("metricsByHourTitle")} style={{ marginBottom: "20px" }}>
              <div style={{ padding: "16px 18px", overflowX: "auto" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", minWidth: "320px", height: "80px" }}>
                  {metrics.by_hour.map((h) => {
                    const ratio = h.count / maxHourCount;
                    const isMax = h.count === maxHourCount;
                    return (
                      <div key={h.hour} style={{ flex: "1 1 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                        <div style={{ width: "100%", height: `${Math.round(ratio * 56)}px`, background: isMax ? "var(--db-accent)" : "var(--db-accent-bg)", borderRadius: "3px 3px 0 0", transition: "height 0.2s", minHeight: "4px" }} />
                        <span style={{ fontSize: "10px", color: isMax ? "var(--db-accent)" : "var(--db-text-tertiary)", fontWeight: isMax ? 700 : 400 }}>
                          {fmtHour(h.hour)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </SectionCard>
          )}

          {/* Section 3 — By station */}
          {metrics.by_station.length > 0 && (
            <SectionCard title={t("metricsStationsTitle")} style={{ marginBottom: "20px" }}>
              <TableWrap>
                <thead>
                  <TRow>
                    <TH>{t("metricsColStation")}</TH>
                    <TH>{t("metricsColItems")}</TH>
                    <TH>{t("metricsColQueue")}</TH>
                    <TH>{t("metricsColPrep")}</TH>
                    <TH>{t("metricsColPickup")}</TH>
                    <TH>{t("metricsColSla")}</TH>
                  </TRow>
                </thead>
                <tbody>
                  {metrics.by_station.map((row) => {
                    const isKitchen = row.station === "kitchen";
                    const Icon = isKitchen ? IconChefHat : IconGlass;
                    const label = isKitchen ? t("metricsStationKitchen") : row.station === "bar" ? t("metricsStationBar") : row.station;
                    return (
                      <TRow key={row.station}>
                        <TD>
                          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <Icon size={14} color="var(--db-accent)" />
                            <span style={{ fontWeight: 600 }}>{label}</span>
                          </span>
                        </TD>
                        <TD>{row.count}</TD>
                        <TD>{fmtSecs(row.queue_secs)}</TD>
                        <TD><strong>{fmtSecs(row.prep_secs)}</strong></TD>
                        <TD>{fmtSecs(row.pickup_secs)}</TD>
                        <TD><SlaTag pct={row.sla_pct} /></TD>
                      </TRow>
                    );
                  })}
                </tbody>
              </TableWrap>
            </SectionCard>
          )}

          {/* Section 4 — By waiter */}
          {metrics.by_waiter.length > 0 && (
            <SectionCard title={t("metricsByWaiterTitle")} style={{ marginBottom: "20px" }}>
              <TableWrap>
                <thead>
                  <TRow>
                    <TH>{t("metricsColWaiter")}</TH>
                    <TH>{t("metricsColItems")}</TH>
                    <TH>{t("metricsColWait")}</TH>
                    <TH>{t("metricsColPickup")}</TH>
                    <TH>{t("metricsColSla")}</TH>
                  </TRow>
                </thead>
                <tbody>
                  {metrics.by_waiter.map((row, idx) => {
                    const name = row.taken_by ? (waiterNames[row.taken_by] ?? row.taken_by.slice(0, 8)) : t("metricsColWaiterUnassigned");
                    return (
                      <TRow key={row.taken_by ?? `unassigned-${idx}`}>
                        <TD><span style={{ fontWeight: 600 }}>{name}</span></TD>
                        <TD>{row.count}</TD>
                        <TD>{fmtSecs(row.wait_secs)}</TD>
                        <TD>{fmtSecs(row.pickup_secs)}</TD>
                        <TD><SlaTag pct={row.sla_pct} /></TD>
                      </TRow>
                    );
                  })}
                </tbody>
              </TableWrap>
            </SectionCard>
          )}

          {/* Section 5 — Slowest items */}
          {metrics.slowest.length > 0 && (
            <SectionCard title={t("metricsSlowestTitle")} style={{ marginBottom: "20px" }}>
              <TableWrap>
                <thead>
                  <TRow>
                    <TH style={{ width: "32px" }}>#</TH>
                    <TH>{t("metricsSlowestColItem")}</TH>
                    <TH>{t("metricsSlowestColCount")}</TH>
                    <TH>{t("metricsSlowestColPrep")}</TH>
                    <TH>{t("metricsColMeta")}</TH>
                    <TH>{t("metricsColOverPct")}</TH>
                  </TRow>
                </thead>
                <tbody>
                  {metrics.slowest.map((item, idx) => (
                    <TRow key={item.name}>
                      <TD style={{ color: "var(--db-text-tertiary)", fontWeight: 700 }}>{idx + 1}</TD>
                      <TD style={{ fontWeight: 500 }}>{item.name}</TD>
                      <TD style={{ color: "var(--db-text-secondary)" }}>{item.count}</TD>
                      <TD>
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "999px", background: "rgba(239,68,68,0.10)", color: "var(--db-danger)", fontWeight: 700, fontSize: "12px" }}>
                          {fmtSecs(item.prep_secs)}
                        </span>
                      </TD>
                      <TD style={{ color: "var(--db-text-secondary)" }}>{fmtSecs(item.sla_secs)}</TD>
                      <TD>
                        {item.over_pct != null ? (
                          <span style={{ fontWeight: 700, color: item.over_pct > 0 ? "var(--db-danger)" : "var(--db-success)" }}>
                            {item.over_pct > 0 ? `+${item.over_pct}%` : `${item.over_pct}%`}
                          </span>
                        ) : <span style={{ color: "var(--db-text-tertiary)" }}>—</span>}
                      </TD>
                    </TRow>
                  ))}
                </tbody>
              </TableWrap>
            </SectionCard>
          )}
        </>
      )}

      {/* ── Section 6 — Por orden (direct queries) ─────────────────────────── */}
      <SectionCard title={t("metricsByOrderTitle")} style={{ marginTop: "4px" }}>
        {errorOrders && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", color: "var(--db-danger)", fontSize: "13px" }}>
            <IconAlertCircle size={14} /> {errorOrders}
          </div>
        )}
        {loadingOrders && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "20px", color: "var(--db-text-secondary)", fontSize: "13px" }}>
            <IconRefresh size={16} style={{ animation: "spin 1s linear infinite" }} />
            {t("metricsLoading")}
          </div>
        )}
        {!loadingOrders && !errorOrders && orders.length === 0 && (
          <div style={{ padding: "24px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "13px" }}>
            {t("metricsEmpty")}
          </div>
        )}
        {!loadingOrders && !errorOrders && orders.length > 0 && (
          <TableWrap>
            <thead>
              <TRow>
                <TH style={{ width: "32px" }} />
                <TH>{t("metricsColOrder")}</TH>
                <TH>{t("metricsColTable")}</TH>
                <TH>{t("metricsColWaiter")}</TH>
                <TH>{t("metricsColItems")}</TH>
                <TH>{t("metricsColDuration")}</TH>
                <TH>{t("metricsColSla")}</TH>
              </TRow>
            </thead>
            <tbody>
              {orders.map((order) => {
                const items = itemsByOrder[order.id] ?? [];
                const isOpen = expanded.has(order.id);
                const waiterName = order.taken_by ? (waiterNames[order.taken_by] ?? order.taken_by.slice(0, 8)) : "—";
                const latestDone = items.reduce<string | null>((acc, i) => {
                  if (!i.done_at) return acc;
                  if (!acc) return i.done_at;
                  return i.done_at > acc ? i.done_at : acc;
                }, null);
                const inProgress = items.some((i) => !i.done_at);
                let durationStr = "—";
                if (latestDone) {
                  const dur = Math.round((new Date(latestDone).getTime() - new Date(order.created_at).getTime()) / 1000);
                  durationStr = fmtSecs(dur) + (inProgress ? ` (${t("metricsOrderInProgress")})` : "");
                } else if (inProgress) {
                  const dur = Math.round((Date.now() - new Date(order.created_at).getTime()) / 1000);
                  durationStr = `${fmtSecs(dur)} (${t("metricsOrderInProgress")})`;
                }
                const heat = orderHeat(items, menuItems, bizSla);
                const d = new Date(order.created_at);
                const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

                return [
                  <TRow
                    key={order.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(order.id)) next.delete(order.id);
                      else next.add(order.id);
                      return next;
                    })}
                  >
                    <TD>
                      <span style={{ color: "var(--db-text-tertiary)", display: "flex", alignItems: "center" }}>
                        {isOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                      </span>
                    </TD>
                    <TD>
                      <span style={{ fontFamily: "monospace", fontSize: "12px" }}>{order.id.slice(0, 8)}</span>
                      <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginLeft: "6px" }}>{timeStr}</span>
                    </TD>
                    <TD>{order.table_label ?? "—"}</TD>
                    <TD>{waiterName}</TD>
                    <TD>{items.length}</TD>
                    <TD style={{ color: "var(--db-text-secondary)", fontSize: "12px" }}>{durationStr}</TD>
                    <TD>
                      <span style={{
                        display: "inline-block", width: "10px", height: "10px",
                        borderRadius: "50%", background: heatColor(heat),
                        verticalAlign: "middle",
                      }} />
                    </TD>
                  </TRow>,
                  isOpen && (
                    <tr key={`${order.id}-expanded`}>
                      <td colSpan={7} style={{ padding: "0 0 8px 0", background: "var(--db-bg-base)" }}>
                        <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                          {items.map((item) => {
                            const mi = menuItems[item.menu_item_id];
                            const qMs = item.preparing_at ? new Date(item.preparing_at).getTime() - new Date(item.created_at).getTime() : null;
                            const pMs = item.ready_at && item.preparing_at ? new Date(item.ready_at).getTime() - new Date(item.preparing_at).getTime() : null;
                            const pkMs = item.done_at && item.ready_at ? new Date(item.done_at).getTime() - new Date(item.ready_at).getTime() : null;
                            const totMs = (qMs ?? 0) + (pMs ?? 0) + (pkMs ?? 0);
                            const safeTotal = Math.max(totMs, 1);

                            return (
                              <div key={`${item.order_id}-${item.menu_item_id}`}>
                                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--db-text-primary)", marginBottom: "4px" }}>
                                  {mi?.name ?? "—"}
                                  {mi?.station && (
                                    <span style={{ fontSize: "10px", marginLeft: "6px", padding: "1px 6px", borderRadius: "999px", background: "var(--db-bg-surface)", color: "var(--db-text-tertiary)", border: "1px solid var(--db-border)" }}>
                                      {mi.station === "kitchen" ? t("metricsStationKitchen") : mi.station === "bar" ? t("metricsStationBar") : mi.station}
                                    </span>
                                  )}
                                </div>
                                {/* 3-segment bar */}
                                <div style={{ display: "flex", height: "18px", borderRadius: "4px", overflow: "hidden", width: "100%", background: "var(--db-border)" }}>
                                  {qMs != null && (
                                    <BarSeg ms={qMs} total={safeTotal} color="var(--db-warning)" label={fmtSecs(qMs / 1000)} />
                                  )}
                                  {pMs != null ? (
                                    <BarSeg ms={pMs} total={safeTotal} color="var(--db-accent)" label={fmtSecs(pMs / 1000)} />
                                  ) : item.preparing_at && !item.ready_at ? (
                                    <BarSeg ms={Date.now() - new Date(item.preparing_at).getTime()} total={safeTotal} color="var(--db-accent)" label={t("metricsOrderInProgress")} striped />
                                  ) : null}
                                  {pkMs != null ? (
                                    <BarSeg ms={pkMs} total={safeTotal} color="var(--db-success)" label={fmtSecs(pkMs / 1000)} />
                                  ) : item.ready_at && !item.done_at ? (
                                    <BarSeg ms={Date.now() - new Date(item.ready_at).getTime()} total={safeTotal} color="var(--db-success)" label={t("metricsOrderInProgress")} striped />
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </TableWrap>
        )}
      </SectionCard>
    </div>
  );
}

// ── Delta helper ──────────────────────────────────────────────────────────────

interface DeltaInfo {
  label: string;
  good: boolean;
}

function buildDelta(cur: number | null, prev: number | null, kind: "time" | "sla"): DeltaInfo | null {
  if (cur == null || prev == null || prev === 0) return null;
  if (kind === "sla") {
    const diff = cur - prev;
    if (diff === 0) return null;
    return { label: `${diff > 0 ? "+" : ""}${diff} pts`, good: diff > 0 };
  }
  // time: less is better
  const pct = Math.round(((prev - cur) / prev) * 100);
  if (pct === 0) return null;
  return { label: `${pct > 0 ? "−" : "+"}${Math.abs(pct)}%`, good: pct > 0 };
}

// ── Sub-components ────────────────────────────────────────────────────────────

type TFunc = ReturnType<typeof useTranslations>;

function PageHeader({ t }: { t: TFunc }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "2px" }}>
        <IconChartBar size={22} color="var(--db-accent)" />
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
          {t("metricsPageTitle")}
        </h1>
      </div>
      <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", margin: 0 }}>
        {t("metricsSubtitle")}
      </p>
    </div>
  );
}

function KpiCard({
  label, sub, value, accent, icon, large = true, delta,
}: {
  label: string; sub: string; value: string; accent: string;
  icon?: React.ReactNode; large?: boolean; delta: DeltaInfo | null;
}) {
  return (
    <div style={{
      background: "var(--db-bg-surface)", border: "1px solid var(--db-border)",
      borderRadius: "var(--db-radius-card)", padding: "16px 18px",
      borderTop: `3px solid ${accent}`,
    }}>
      <div style={{ fontSize: large ? "26px" : "20px", fontWeight: 700, color: "var(--db-text-primary)", lineHeight: 1.1, marginBottom: "4px", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: 600, color: "var(--db-text-primary)", marginBottom: "2px" }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: "11px", color: "var(--db-text-tertiary)" }}>{sub}</div>
      {delta && (
        <div style={{ marginTop: "6px", fontSize: "11px", fontWeight: 700, color: delta.good ? "var(--db-success)" : "var(--db-danger)" }}>
          {delta.good ? "▲" : "▼"} {delta.label} {delta.good ? "mejor" : "peor"}
        </div>
      )}
    </div>
  );
}

function SlaTag({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: "var(--db-text-tertiary)" }}>—</span>;
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: "999px", fontSize: "12px", fontWeight: 700,
      background: slaPctBg(pct), color: slaPctColor(pct),
    }}>
      {pct}%
    </span>
  );
}

function SectionCard({ title, children, style: extraStyle }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--db-bg-surface)", border: "1px solid var(--db-border)", borderRadius: "var(--db-radius-card)", overflow: "hidden", ...extraStyle }}>
      <div style={{ padding: "12px 18px 10px", borderBottom: "1px solid var(--db-border)" }}>
        <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>{children}</table>
    </div>
  );
}

function TH({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid var(--db-border)", color: "var(--db-text-tertiary)", fontWeight: 600, fontSize: "11px", letterSpacing: "0.04em", textTransform: "uppercase", ...style }}>
      {children}
    </th>
  );
}

function TRow({ children, onClick, style }: { children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties }) {
  return (
    <tr onClick={onClick} style={{ borderBottom: "1px solid var(--db-border)", ...style }}>
      {children}
    </tr>
  );
}

function TD({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td style={{ padding: "9px 12px", color: "var(--db-text-primary)", ...style }}>{children}</td>
  );
}

function BarSeg({ ms, total, color, label, striped }: { ms: number; total: number; color: string; label: string; striped?: boolean }) {
  const pct = Math.max(2, Math.round((ms / total) * 100));
  return (
    <div
      title={label}
      style={{
        width: `${pct}%`, height: "100%", background: color,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "9px", color: "#fff", fontWeight: 700, overflow: "hidden",
        backgroundImage: striped ? "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.2) 4px, rgba(255,255,255,0.2) 8px)" : undefined,
      }}
    >
      {pct > 12 ? label : ""}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const dateInputStyle: React.CSSProperties = {
  padding: "5px 8px", borderRadius: "var(--db-radius)", border: "1px solid var(--db-border)",
  background: "var(--db-bg-base)", color: "var(--db-text-primary)",
  fontSize: "12px", outline: "none", cursor: "text",
};

const selectStyle: React.CSSProperties = {
  padding: "5px 8px", borderRadius: "var(--db-radius)", border: "1px solid var(--db-border)",
  background: "var(--db-bg-base)", color: "var(--db-text-primary)",
  fontSize: "12px", outline: "none", cursor: "pointer",
};
