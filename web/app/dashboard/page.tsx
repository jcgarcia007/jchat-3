"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { getUsageAndLimits, type UsageAndLimits } from "@/lib/planLimits";
import { formatCents } from "@/lib/currency";
import { SalesCalendar } from "@/components/dashboard/SalesCalendar";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SalesRow {
  total_cents: number;
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

// ── KpiCard ───────────────────────────────────────────────────────────────────

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius-card)",
        padding: "20px 24px",
        flex: 1,
        minWidth: "160px",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: 700,
          color: "var(--db-text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: "10px",
        }}
      >
        {label}
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
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const t = useTranslations("dashboardCommon");
  const locale = useLocale();

  const [usage, setUsage] = useState<UsageAndLimits | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpi, setKpi] = useState<KpiState>({
    salesTodayCents: null,
    activeOrders: null,
    occupiedTables: null,
    totalTables: null,
    error: false,
  });

  // Usage summary — independent of the KPI load
  useEffect(() => {
    let active = true;
    void getUsageAndLimits().then((res) => {
      if (active) setUsage(res);
    });
    return () => { active = false; };
  }, []);

  // 3 KPI queries — one Promise.all; honest loading/error pattern (never 0 on failure)
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
        const now = new Date();
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

        const [salesRes, ordersRes, tabsRes, tablesRes] = await Promise.all([
          // a) Ventas hoy: orders paid today (by paid_at LOCAL day)
          supabase
            .from("orders")
            .select("total_cents")
            .eq("business_id", businessId)
            .not("paid_at", "is", null)
            .gte("paid_at", dayStart.toISOString())
            .lt("paid_at", dayEnd.toISOString()),

          // b) Pedidos activos: orders in-flight
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("business_id", businessId)
            .in("status", ["pending", "confirmed", "preparing"]),

          // c) Mesas ocupadas: distinct tables con orden abierta (sin pagar y sin anular)
          //    Misma definición que el plano de mesas (tables/page.tsx → loadOccupancy).
          //    table_tabs está vacía; orders es la fuente de verdad.
          supabase
            .from("orders")
            .select("table_id")
            .eq("business_id", businessId)
            .is("paid_at", null)
            .is("canceled_at", null)
            .not("table_id", "is", null),

          // c) Total de mesas registradas
          supabase
            .from("tables")
            .select("id", { count: "exact", head: true })
            .eq("business_id", businessId),
        ]);

        if (!active) return;

        // Any load failure → show dashes, never fabricate zeros
        if (salesRes.error || ordersRes.error || tabsRes.error || tablesRes.error) {
          setKpi({ salesTodayCents: null, activeOrders: null, occupiedTables: null, totalTables: null, error: true });
          setKpiLoading(false);
          return;
        }

        const salesTodayCents = (salesRes.data as SalesRow[])
          .reduce((sum, r) => sum + (r.total_cents ?? 0), 0);

        const uniqueOccupied = new Set(
          (tabsRes.data as OccupiedRow[]).map((r) => r.table_id)
        ).size;

        setKpi({
          salesTodayCents,
          activeOrders: ordersRes.count ?? 0,
          occupiedTables: uniqueOccupied,
          totalTables: tablesRes.count ?? 0,
          error: false,
        });
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

  // Format values — loading or error → "—", never 0
  const DASH = "—";
  const noData = kpiLoading || kpi.error;

  const salesDisplay  = noData || kpi.salesTodayCents  === null ? DASH : formatCents(kpi.salesTodayCents, locale);
  const ordersDisplay = noData || kpi.activeOrders     === null ? DASH : String(kpi.activeOrders);
  const tablesDisplay = noData || kpi.occupiedTables   === null ? DASH
    : `${kpi.occupiedTables} / ${kpi.totalTables ?? DASH}`;

  return (
    <div>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "8px" }}>
        {t("navOverview")}
      </h1>

      {usage && (
        <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", marginBottom: "20px" }}>
          {t("usageSummary", {
            bizUsed: usage.businesses.used,
            bizLimit: usage.businesses.limit,
            evUsed:  usage.events.used,
            evLimit: usage.events.limit,
            plan:    usage.plan,
          })}
        </p>
      )}

      {/* KPI row — 3 real data cards */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "28px", flexWrap: "wrap" }}>
        <KpiCard label={t("kpiSalesToday")}      value={salesDisplay}  />
        <KpiCard label={t("kpiActiveOrders")}    value={ordersDisplay} />
        <KpiCard label={t("kpiTablesOccupied")}  value={tablesDisplay} />
      </div>

      <SalesCalendar />
    </div>
  );
}
