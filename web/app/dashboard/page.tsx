"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { getUsageAndLimits, type UsageAndLimits } from "@/lib/planLimits";
import { formatCents } from "@/lib/currency";
import { SalesCalendar } from "@/components/dashboard/SalesCalendar";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SalesRow {
  total_cents: number;
  tip_cents: number | null;
  paid_at: string;
}

interface OrderRow {
  id: string;
  table_label: string | null;
  status: string;
  total_cents: number;
  created_at: string;
}

interface TableRow {
  id: string;
  label: string;
}

interface OccupiedRow {
  table_id: string;
}

interface KpiState {
  salesTodayCents: number | null;
  activeOrders: number | null;
  occupiedTables: number | null;
  totalTables: number | null;
  error: boolean;
}

type PanelKey = "sales" | "orders" | "tables";

// ── Style helpers ─────────────────────────────────────────────────────────────

const STAT_LABEL: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  color: "var(--db-text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const STAT_ROW: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "5px 0",
  fontSize: "13px",
  borderBottom: "1px solid var(--db-border)",
  color: "var(--db-text-primary)",
};

const DETAIL_LINK: React.CSSProperties = {
  display: "inline-block",
  marginTop: "12px",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--db-accent)",
  textDecoration: "none",
};

// ── KpiCard ───────────────────────────────────────────────────────────────────
//
// Clickable card (button + aria-expanded) that toggles a drill-down panel
// below it. Only one panel is open at a time — the parent controls openPanel.

function KpiCard({
  label,
  value,
  panelKey,
  openPanel,
  onToggle,
  children,
}: {
  label: string;
  value: string;
  panelKey: PanelKey;
  openPanel: PanelKey | null;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const isOpen = openPanel === panelKey;
  const ChevronIcon = isOpen ? IconChevronUp : IconChevronDown;

  return (
    <div style={{ flex: 1, minWidth: "160px" }}>
      {/* Card header — button for a11y + keyboard */}
      <button
        aria-expanded={isOpen}
        onClick={onToggle}
        style={{
          width: "100%",
          background: "var(--db-bg-surface)",
          border: `1px solid ${isOpen ? "var(--db-accent)" : "var(--db-border)"}`,
          borderBottom: isOpen ? "none" : `1px solid ${isOpen ? "var(--db-accent)" : "var(--db-border)"}`,
          borderRadius: isOpen
            ? "var(--db-radius-card) var(--db-radius-card) 0 0"
            : "var(--db-radius-card)",
          padding: "20px 24px",
          cursor: "pointer",
          textAlign: "left",
          display: "flex",
          flexDirection: "column",
          transition: "border-color 0.15s",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "10px",
          }}
        >
          <span style={STAT_LABEL}>{label}</span>
          <ChevronIcon size={13} color="var(--db-text-tertiary)" />
        </div>
        <div
          style={{
            fontSize: "28px",
            fontWeight: 800,
            color: "var(--db-text-primary)",
            letterSpacing: "-0.03em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </div>
      </button>

      {/* Drill-down panel */}
      {isOpen && (
        <div
          style={{
            background: "var(--db-bg-surface)",
            border: "1px solid var(--db-accent)",
            borderTop: "none",
            borderRadius: "0 0 var(--db-radius-card) var(--db-radius-card)",
            padding: "14px 24px 16px",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const t      = useTranslations("dashboardCommon");
  const locale = useLocale();

  const [usage, setUsage] = useState<UsageAndLimits | null>(null);

  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpi, setKpi] = useState<KpiState>({
    salesTodayCents: null,
    activeOrders:    null,
    occupiedTables:  null,
    totalTables:     null,
    error:           false,
  });

  // Rich detail rows — populated on success alongside KPI headlines
  const [salesRows,   setSalesRows]   = useState<SalesRow[]>([]);
  const [orderRows,   setOrderRows]   = useState<OrderRow[]>([]);
  const [tableRows,   setTableRows]   = useState<TableRow[]>([]);
  const [occupiedIds, setOccupiedIds] = useState<Set<string>>(new Set());

  // Only one drill-down panel open at a time
  const [openPanel, setOpenPanel] = useState<PanelKey | null>(null);

  function togglePanel(key: PanelKey) {
    setOpenPanel((prev) => (prev === key ? null : key));
  }

  // Usage summary — independent of the KPI load
  useEffect(() => {
    let active = true;
    void getUsageAndLimits().then((res) => {
      if (active) setUsage(res);
    });
    return () => { active = false; };
  }, []);

  // 4 KPI queries — one Promise.all; honest loading/error pattern (never 0 on failure)
  useEffect(() => {
    let active = true;

    if (!isSupabaseConfigured) {
      setKpiLoading(false);
      return;
    }

    void (async () => {
      try {
        const res = await resolveActiveBusiness();
        if (!active) return;

        if (!res.ok) {
          // No active business → show dashes, not an error
          setKpiLoading(false);
          return;
        }

        const businessId = res.business.id;

        // Day window in LOCAL time, same pattern as SalesCalendar
        const now      = new Date();
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

        const [salesRes, ordersRes, tabsRes, tablesRes] = await Promise.all([
          // a) Ventas hoy — campos ampliados para el drill-down de ventas
          supabase
            .from("orders")
            .select("total_cents, tip_cents, paid_at")
            .eq("business_id", businessId)
            .not("paid_at", "is", null)
            .gte("paid_at", dayStart.toISOString())
            .lt("paid_at",  dayEnd.toISOString()),

          // b) Pedidos activos — filas reales para el drill-down (máx 8)
          supabase
            .from("orders")
            .select("id, table_label, status, total_cents, created_at")
            .eq("business_id", businessId)
            .in("status", ["pending", "confirmed", "preparing"])
            .order("created_at", { ascending: false })
            .limit(8),

          // c) Mesas ocupadas: distinct tables con orden abierta (sin pagar y sin anular)
          //    Misma definición que el plano de mesas (tables/page.tsx → loadOccupancy).
          supabase
            .from("orders")
            .select("table_id")
            .eq("business_id", businessId)
            .is("paid_at", null)
            .is("canceled_at", null)
            .not("table_id", "is", null),

          // d) Todas las mesas con label — para cruzar con las ocupadas
          supabase
            .from("tables")
            .select("id, label")
            .eq("business_id", businessId),
        ]);

        if (!active) return;

        // Any load failure → show dashes, never fabricate zeros
        if (salesRes.error || ordersRes.error || tabsRes.error || tablesRes.error) {
          setKpi({ salesTodayCents: null, activeOrders: null, occupiedTables: null, totalTables: null, error: true });
          setKpiLoading(false);
          return;
        }

        const salesData  = (salesRes.data  as SalesRow[]);
        const ordersData = (ordersRes.data as OrderRow[]);
        const tabsData   = (tabsRes.data   as OccupiedRow[]);
        const tablesData = (tablesRes.data as TableRow[]);

        const salesTodayCents = salesData.reduce((sum, r) => sum + (r.total_cents ?? 0), 0);
        const uniqueOccupied  = new Set(tabsData.map((r) => r.table_id)).size;

        setKpi({
          salesTodayCents,
          activeOrders:   ordersData.length,
          occupiedTables: uniqueOccupied,
          totalTables:    tablesData.length,
          error:          false,
        });

        // Store detail rows for the drill-down panels
        setSalesRows(salesData);
        setOrderRows(ordersData);
        setTableRows(tablesData);
        setOccupiedIds(new Set(tabsData.map((r) => r.table_id)));
      } catch {
        if (active) {
          setKpi({ salesTodayCents: null, activeOrders: null, occupiedTables: null, totalTables: null, error: true });
        }
      } finally {
        if (active) setKpiLoading(false);
      }
    })();

    return () => { active = false; };
  }, []);

  // ── Sales drill-down — computed client-side from already-fetched rows ─────────

  const salesDrill = useMemo(() => {
    if (salesRows.length === 0) return null;

    const paidCount = salesRows.length;
    const tipsTotal = salesRows.reduce((s, r) => s + (r.tip_cents ?? 0), 0);
    const rawTotal  = salesRows.reduce((s, r) => s + (r.total_cents ?? 0), 0);
    const avgTicket = Math.round(rawTotal / paidCount);

    // Group by local hour, sorted chronologically
    const byHour: Record<number, { totalCents: number; count: number }> = {};
    for (const r of salesRows) {
      const h = new Date(r.paid_at).getHours();
      if (!byHour[h]) byHour[h] = { totalCents: 0, count: 0 };
      byHour[h].totalCents += r.total_cents;
      byHour[h].count++;
    }
    const hourEntries = Object.entries(byHour)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([h, v]) => ({ hour: Number(h), ...v }));

    return { paidCount, tipsTotal, avgTicket, hourEntries };
  }, [salesRows]);

  // ── Tables drill-down — labels of currently occupied tables ──────────────────

  const occupiedLabels = useMemo(
    () =>
      tableRows
        .filter((t) => occupiedIds.has(t.id))
        .map((t) => t.label)
        .sort(),
    [tableRows, occupiedIds]
  );

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function formatHour(h: number): string {
    if (h === 0)  return "12 AM";
    if (h < 12)   return `${h} AM`;
    if (h === 12) return "12 PM";
    return `${h - 12} PM`;
  }

  function capitalizeFirst(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  // ── Display values — loading or error → "—", never fabricated zeros ───────────

  const DASH    = "—";
  const noData  = kpiLoading || kpi.error;

  const salesDisplay  = noData || kpi.salesTodayCents === null ? DASH : formatCents(kpi.salesTodayCents, locale);
  const ordersDisplay = noData || kpi.activeOrders    === null ? DASH : String(kpi.activeOrders);
  const tablesDisplay = noData || kpi.occupiedTables  === null ? DASH
    : `${kpi.occupiedTables} / ${kpi.totalTables ?? DASH}`;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "8px" }}>
        {t("navOverview")}
      </h1>

      {usage && (
        <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", marginBottom: "20px" }}>
          {t("usageSummary", {
            bizUsed:  usage.businesses.used,
            bizLimit: usage.businesses.limit,
            evUsed:   usage.events.used,
            evLimit:  usage.events.limit,
            plan:     usage.plan,
          })}
        </p>
      )}

      {/* KPI row — 3 cards with drill-down panels; align-start so open panels don't stretch siblings */}
      <div
        style={{
          display:     "flex",
          gap:         "12px",
          marginBottom: "28px",
          flexWrap:    "wrap",
          alignItems:  "flex-start",
        }}
      >

        {/* ── 1) Sales Today ─────────────────────────────────────────────────── */}
        <KpiCard
          label={t("kpiSalesToday")}
          value={salesDisplay}
          panelKey="sales"
          openPanel={openPanel}
          onToggle={() => togglePanel("sales")}
        >
          {salesRows.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "4px 0 8px" }}>
              {t("overviewDrillNoSalesToday")}
            </p>
          ) : (
            <>
              {/* Summary stats */}
              <div style={{ marginBottom: "10px" }}>
                <div style={STAT_ROW}>
                  <span style={STAT_LABEL}>{t("overviewDrillPaidOrders")}</span>
                  <span style={{ fontWeight: 700 }}>{salesDrill!.paidCount}</span>
                </div>
                <div style={STAT_ROW}>
                  <span style={STAT_LABEL}>{t("overviewDrillAvgTicket")}</span>
                  <span style={{ fontWeight: 700 }}>{formatCents(salesDrill!.avgTicket, locale)}</span>
                </div>
                <div style={{ ...STAT_ROW, borderBottom: "none", paddingBottom: 0 }}>
                  <span style={STAT_LABEL}>{t("overviewDrillTips")}</span>
                  <span style={{ fontWeight: 700 }}>{formatCents(salesDrill!.tipsTotal, locale)}</span>
                </div>
              </div>

              {/* By-hour breakdown */}
              {salesDrill!.hourEntries.length > 0 && (
                <div>
                  <div style={{ ...STAT_LABEL, marginBottom: "5px" }}>
                    {t("overviewDrillByHour")}
                  </div>
                  {salesDrill!.hourEntries.map(({ hour, totalCents, count }) => (
                    <div
                      key={hour}
                      style={{
                        display:        "flex",
                        justifyContent: "space-between",
                        padding:        "3px 0",
                        fontSize:       "12px",
                        color:          "var(--db-text-secondary)",
                        borderBottom:   "1px solid var(--db-border)",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{formatHour(hour)}</span>
                      <span>
                        {formatCents(totalCents, locale)} · {count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          <Link href="/dashboard/sales" style={DETAIL_LINK}>
            {t("overviewDrillViewDetail")}
          </Link>
        </KpiCard>

        {/* ── 2) Active Orders ───────────────────────────────────────────────── */}
        <KpiCard
          label={t("kpiActiveOrders")}
          value={ordersDisplay}
          panelKey="orders"
          openPanel={openPanel}
          onToggle={() => togglePanel("orders")}
        >
          {orderRows.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "4px 0 8px" }}>
              {t("overviewDrillNoActiveOrders")}
            </p>
          ) : (
            <div style={{ marginBottom: "8px" }}>
              {orderRows.map((o) => (
                <div
                  key={o.id}
                  style={{
                    display:        "flex",
                    justifyContent: "space-between",
                    alignItems:     "center",
                    padding:        "5px 0",
                    fontSize:       "12px",
                    borderBottom:   "1px solid var(--db-border)",
                    color:          "var(--db-text-primary)",
                  }}
                >
                  <span style={{ fontWeight: 700, minWidth: "36px" }}>
                    {o.table_label ?? "—"}
                  </span>
                  <span style={{ flex: 1, color: "var(--db-text-secondary)", margin: "0 8px" }}>
                    {capitalizeFirst(o.status)}
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    {formatCents(o.total_cents, locale)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Link href="/dashboard/queue" style={DETAIL_LINK}>
            {t("overviewDrillViewDetail")}
          </Link>
        </KpiCard>

        {/* ── 3) Tables Occupied ─────────────────────────────────────────────── */}
        <KpiCard
          label={t("kpiTablesOccupied")}
          value={tablesDisplay}
          panelKey="tables"
          openPanel={openPanel}
          onToggle={() => togglePanel("tables")}
        >
          {occupiedLabels.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "4px 0 8px" }}>
              {t("overviewDrillNoTablesOccupied")}
            </p>
          ) : (
            <div
              style={{
                display:  "flex",
                flexWrap: "wrap",
                gap:      "6px",
                marginBottom: "8px",
              }}
            >
              {occupiedLabels.map((lbl) => (
                <span
                  key={lbl}
                  style={{
                    padding:      "3px 10px",
                    borderRadius: "999px",
                    fontSize:     "12px",
                    fontWeight:   700,
                    background:   "var(--db-accent-bg)",
                    color:        "var(--db-accent)",
                    whiteSpace:   "nowrap",
                  }}
                >
                  {lbl}
                </span>
              ))}
            </div>
          )}
          <Link href="/dashboard/tables" style={DETAIL_LINK}>
            {t("overviewDrillViewDetail")}
          </Link>
        </KpiCard>
      </div>

      <SalesCalendar />
    </div>
  );
}
