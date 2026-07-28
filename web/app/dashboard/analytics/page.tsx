/**
 * JChat 3.0 — Analytics Pro Dashboard (Task 3.12)
 *
 * Tabs: Revenue · Products · Loyalty (points)
 *
 * Features:
 *  - Overview — live: real KPIs + orders/day for the active business
 *  - Revenue: daily BarChart, peak day/hour cards, tips total
 *  - Products: top products ranking (units + revenue bar charts)
 *  - Loyalty: points issued/redeemed + points flow from loyalty_points
 *  - Export: CSV via Blob + PDF via jsPDF
 *  - Plan gate: Business Pro check; upgrade prompt if not Pro
 *  - Guard: isSupabaseConfigured; demo data fallback when not configured
 *
 * Design: var(--db-*) tokens only. No hardcoded hex.
 * Icons: @tabler/icons-react only.
 * Charts: recharts v3, accent via getComputedStyle(document.documentElement) --db-accent
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  IconArrowUpRight,
  IconBolt,
  IconChartBar,
  IconCoin,
  IconCrown,
  IconFileSpreadsheet,
  IconFileTypePdf as IconFilePdf,
  IconFlame,
  IconMessage,
  IconRefresh,
  IconStar,
  IconTrendingUp,
  IconUsers,
} from "@tabler/icons-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { isBusinessPro } from "@/lib/roles";
import { resolveActiveBusiness, type ActiveBusiness } from "@/lib/business";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";
import { formatCents, formatDollars } from "@/lib/currency";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "revenue" | "products" | "loyalty";

interface DailyRevenue {
  date: string;   // "Mon", "Tue" …
  revenue: number;
  tips: number;
  orders: number;
}

interface ProductStat {
  name: string;
  units: number;
  revenue: number;
}

interface LoyaltyROI {
  points_issued: number;
  points_redeemed: number;
  redemption_rate: number;
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function makeDemoRevenue(): DailyRevenue[] {
  const base = [4200, 3800, 5100, 4700, 7800, 9200, 6100];
  return DAYS.map((date, i) => ({
    date,
    revenue: base[i],
    tips: Math.round(base[i] * 0.14),
    orders: Math.round(base[i] / 22),
  }));
}

function makeDemoProducts(): ProductStat[] {
  return [
    { name: "Classic Burger", units: 284, revenue: 4260 },
    { name: "Craft IPA", units: 412, revenue: 3296 },
    { name: "Loaded Fries", units: 318, revenue: 2226 },
    { name: "Caesar Salad", units: 195, revenue: 2145 },
    { name: "Margarita", units: 167, revenue: 2170 },
    { name: "Fish Tacos (2)", units: 143, revenue: 2002 },
    { name: "Brownie Sundae", units: 129, revenue: 1290 },
  ];
}

function makeDemoLoyalty(): LoyaltyROI {
  return {
    points_issued: 184200,
    points_redeemed: 61400,
    redemption_rate: 33.3,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Locale pinned to "en-US" (not the runtime/next-intl default) to preserve
// today's exact output for every viewer regardless of browser locale — this
// KPI band always showed 0 decimals in en-US formatting before this refactor.
function fmt$(cents: number): string {
  return formatCents(cents, "en-US", { maximumFractionDigits: 0 });
}

// "Dollars" helper for the fields in this file that are ALREADY whole-dollar
// amounts, not cents (see DailyRevenue/ProductStat — both store `.../100`
// results, never raw cents). formatCents would divide these by 100 again and
// show a value 100x too small — do not use it here.
function fmtDollars0(dollars: number): string {
  return formatDollars(dollars, undefined, { maximumFractionDigits: 0 });
}

function fmtK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** Read CSS variable from root at runtime — needed for chart colors */
function getCSSVar(name: string): string {
  if (typeof window === "undefined") return "#378ADD";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#378ADD";
}

function useChartColors() {
  const [accent, setAccent] = useState("#378ADD");
  const [success, setSuccess] = useState("#22c55e");
  const [warning, setWarning] = useState("#f59e0b");
  const [danger, setDanger] = useState("#ef4444");

  useEffect(() => {
    setAccent(getCSSVar("--db-accent"));
    setSuccess(getCSSVar("--db-success"));
    setWarning(getCSSVar("--db-warning"));
    setDanger(getCSSVar("--db-danger"));
  }, []);

  return { accent, success, warning, danger };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "12px",
        padding: "20px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "15px",
        fontWeight: 700,
        color: "var(--db-text-primary)",
        margin: "0 0 16px 0",
        letterSpacing: "-0.01em",
      }}
    >
      {children}
    </h2>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.FC<{ size?: number; color?: string }>;
}) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "12px",
          color: "var(--db-text-secondary)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        <Icon size={14} color="var(--db-accent)" />
        {label}
      </div>
      <div
        style={{
          fontSize: "26px",
          fontWeight: 800,
          color: "var(--db-text-primary)",
          letterSpacing: "-0.03em",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: "12px", color: "var(--db-text-secondary)" }}>{sub}</div>
      )}
    </Card>
  );
}

function TabBar({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  const t = useTranslations("dashboardCommon");
  const tabs: { id: Tab; label: string; icon: React.FC<{ size?: number }> }[] = [
    { id: "revenue",  label: t("analyticsRevenueSeriesLabel"), icon: IconChartBar },
    { id: "products", label: t("analyticsProductsTabLabel"),   icon: IconStar },
    { id: "loyalty",  label: t("navLoyalty"),                  icon: IconCoin },
  ];

  return (
    <div
      style={{
        display: "flex",
        gap: "4px",
        borderBottom: "1px solid var(--db-border)",
        marginBottom: "24px",
        overflowX: "auto",
        flexShrink: 0,
      }}
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 14px",
              border: "none",
              background: "transparent",
              color: isActive ? "var(--db-accent)" : "var(--db-text-secondary)",
              fontSize: "13px",
              fontWeight: isActive ? 700 : 500,
              cursor: "pointer",
              borderBottom: isActive ? "2px solid var(--db-accent)" : "2px solid transparent",
              marginBottom: "-1px",
              whiteSpace: "nowrap",
              transition: "color 0.15s",
            }}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** Tooltip formatter for recharts — formats cents as dollars. `chartData` below
 *  stores revenue/tips as dollars×100 ("cents", for axis-formatting consistency
 *  with this cents-based formatter), so this genuinely is a cents input. */
function dollarFormatter(value: number): string {
  return fmt$(value);
}

// ── Revenue Tab ───────────────────────────────────────────────────────────────

function RevenueTab({ data }: { data: DailyRevenue[] }) {
  const t = useTranslations("dashboardCommon");
  const { accent, warning } = useChartColors();
  const dayLabels: Record<string, string> = {
    Mon: t("analyticsDayMon"), Tue: t("analyticsDayTue"), Wed: t("analyticsDayWed"),
    Thu: t("analyticsDayThu"), Fri: t("analyticsDayFri"), Sat: t("analyticsDaySat"), Sun: t("analyticsDaySun"),
  };

  const totalRev = data.reduce((s, d) => s + d.revenue, 0);
  const totalTips = data.reduce((s, d) => s + d.tips, 0);
  const peakDay = data.reduce((best, d) => (d.revenue > best.revenue ? d : best), data[0]);
  const totalOrders = data.reduce((s, d) => s + d.orders, 0);
  const avgOrder = totalOrders > 0 ? Math.round((totalRev / totalOrders) * 100) / 100 : 0;

  const chartData = data.map((d) => ({
    ...d,
    // keep as cents for consistency; formatted by axis
    revenue: d.revenue * 100,
    tips: d.tips * 100,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
        <KpiCard label={t("analyticsWeeklyRevenueLabel")} value={fmtDollars0(totalRev)} icon={IconChartBar} sub={t("analyticsLast7DaysSub")} />
        <KpiCard label={t("analyticsTipsSeriesLabel")} value={fmtDollars0(totalTips)} icon={IconCoin} sub={t("analyticsTipsPercentSub", { pct: ((totalTips / totalRev) * 100).toFixed(1) })} />
        <KpiCard label={t("analyticsOrdersLabel")} value={String(totalOrders)} icon={IconTrendingUp} sub={t("analyticsAvgPerOrderSub", { amount: formatDollars(avgOrder, undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) })} />
        <KpiCard label={t("analyticsPeakDayLabel")} value={peakDay?.date ?? "—"} icon={IconFlame} sub={fmtDollars0(peakDay?.revenue ?? 0)} />
      </div>

      {/* Daily bar chart */}
      <Card>
        <SectionTitle>{t("analyticsDailyRevenueTipsTitle")}</SectionTitle>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--db-border)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(v: string) => dayLabels[v] ?? v} tick={{ fill: "var(--db-text-secondary)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmt$} tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
            <Tooltip
              labelFormatter={(v) => dayLabels[v as string] ?? (v as React.ReactNode)}
              formatter={(value: unknown, name: unknown) => [dollarFormatter(value as number), (name as string) === "revenue" ? t("analyticsRevenueSeriesLabel") : t("analyticsTipsSeriesLabel")]}
              contentStyle={{ background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)", borderRadius: "8px", color: "var(--db-text-primary)" }}
            />
            <Legend wrapperStyle={{ fontSize: "12px", color: "var(--db-text-secondary)" }} />
            <Bar dataKey="revenue" name={t("analyticsRevenueSeriesLabel")} fill={accent} radius={[4, 4, 0, 0]} />
            <Bar dataKey="tips" name={t("analyticsTipsSeriesLabel")} fill={warning} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

// ── Products Tab ──────────────────────────────────────────────────────────────

function ProductsTab({ data }: { data: ProductStat[] }) {
  const t = useTranslations("dashboardCommon");
  const { accent, warning } = useChartColors();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* Units chart */}
        <Card>
          <SectionTitle>{t("analyticsTopProductsUnitsTitle")}</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--db-border)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} width={100} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value: unknown) => [value as number, t("analyticsUnitsLabel")]}
                contentStyle={{ background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)", borderRadius: "8px", color: "var(--db-text-primary)" }}
              />
              <Bar dataKey="units" fill={accent} radius={[0, 4, 4, 0]}>
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fillOpacity={1 - index * 0.08} fill={accent} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Revenue chart */}
        <Card>
          <SectionTitle>{t("analyticsTopProductsRevenueTitle")}</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--db-border)" horizontal={false} />
              <XAxis type="number" tickFormatter={fmtDollars0} tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} width={100} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value: unknown) => [fmtDollars0(value as number), t("analyticsRevenueSeriesLabel")]}
                contentStyle={{ background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)", borderRadius: "8px", color: "var(--db-text-primary)" }}
              />
              <Bar dataKey="revenue" fill={warning} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Rank table */}
      <Card>
        <SectionTitle>{t("analyticsProductRankingsTitle")}</SectionTitle>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ color: "var(--db-text-secondary)", textAlign: "left" }}>
              <th style={{ padding: "8px 12px", fontWeight: 600 }}>#</th>
              <th style={{ padding: "8px 12px", fontWeight: 600 }}>{t("analyticsProductColumnLabel")}</th>
              <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>{t("analyticsUnitsLabel")}</th>
              <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>{t("analyticsRevenueSeriesLabel")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p, i) => (
              <tr
                key={p.name}
                style={{ borderTop: "1px solid var(--db-border)", color: "var(--db-text-primary)" }}
              >
                <td style={{ padding: "10px 12px", color: "var(--db-text-secondary)" }}>{i + 1}</td>
                <td style={{ padding: "10px 12px", fontWeight: 600 }}>{p.name}</td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>{p.units.toLocaleString()}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--db-accent)", fontWeight: 600 }}>{fmtDollars0(p.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ── Loyalty Tab (points only) ─────────────────────────────────────────────────

function LoyaltyTab({ data }: { data: LoyaltyROI }) {
  const t = useTranslations("dashboardCommon");
  const { success } = useChartColors();

  const pointsFlow = [
    { label: t("analyticsIssuedShort"), points: data.points_issued },
    { label: t("analyticsRedeemedShort"), points: data.points_redeemed },
    { label: t("analyticsOutstandingShort"), points: data.points_issued - data.points_redeemed },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
        <KpiCard label={t("analyticsPointsIssuedLabel")} value={fmtK(data.points_issued)} icon={IconCoin} />
        <KpiCard label={t("analyticsPointsRedeemedLabel")} value={fmtK(data.points_redeemed)} icon={IconArrowUpRight} sub={t("analyticsRedemptionRateSub", { rate: data.redemption_rate })} />
      </div>

      <Card>
        <SectionTitle>{t("analyticsPointsFlowTitle")}</SectionTitle>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={pointsFlow} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--db-border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--db-text-secondary)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtK} tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value: unknown) => [fmtK(value as number), t("analyticsPointsUnitLabel")]}
              contentStyle={{ background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)", borderRadius: "8px", color: "var(--db-text-primary)" }}
            />
            <Bar dataKey="points" fill={success} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

// ── Plan Gate ─────────────────────────────────────────────────────────────────

function UpgradePrompt() {
  const t = useTranslations("dashboardCommon");
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: "16px",
        textAlign: "center",
      }}
    >
      <IconCrown size={48} color="var(--db-accent)" />
      <h2 style={{ fontSize: "22px", fontWeight: 800, color: "var(--db-text-primary)", margin: 0 }}>
        {t("analyticsUpgradeTitle")}
      </h2>
      <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", maxWidth: "420px", lineHeight: 1.6, margin: 0 }}>
        {t.rich("analyticsUpgradeMessage", {
          strong: (chunks) => <strong style={{ color: "var(--db-accent)" }}>{chunks}</strong>,
        })}
      </p>
      {/* TODO(plan gate): wire onClick to stripe-connect Edge Function upgrade flow */}
      <button
        style={{
          padding: "12px 28px",
          borderRadius: "10px",
          border: "none",
          background: "var(--db-accent)",
          color: "var(--db-accent-text, #fff)",
          fontSize: "15px",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {t("analyticsUpgradeButton")}
      </button>
      <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", margin: 0 }}>
        {/* TODO(plan gate): read businesses.plan from Supabase and remove this prompt when plan === 'pro' */}
        {t.rich("analyticsGateDevNote", {
          code: (chunks) => <code>{chunks}</code>,
        })}
      </p>
    </div>
  );
}

// ── Export Helpers ────────────────────────────────────────────────────────────

function exportCSV(revenue: DailyRevenue[], products: ProductStat[]) {
  const rows: string[] = [
    "Section,Field,Value",
    ...revenue.map((d) => `Revenue,${d.date} revenue,$${d.revenue}`),
    ...revenue.map((d) => `Revenue,${d.date} tips,$${d.tips}`),
    ...revenue.map((d) => `Revenue,${d.date} orders,${d.orders}`),
    "",
    "Products,Name,Units,Revenue",
    ...products.map((p) => `Products,${p.name},${p.units},$${p.revenue}`),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "jchat-analytics.csv";
  a.click();
  URL.revokeObjectURL(url);
}

interface PdfLabels {
  reportTitle: string;
  generatedLabel: (date: string) => string;
  weeklyRevenueLabel: string;
  dayColumnLabel: string;
  revenueLabel: string;
  tipsLabel: string;
  ordersLabel: string;
  topProductsLabel: string;
  productLabel: string;
  unitsLabel: string;
  loyaltyPointsLabel: string;
  pointsIssuedLabel: string;
  pointsRedeemedLabel: string;
  redemptionRateLabel: string;
  dayLabels: Record<string, string>;
}

async function exportPDF(revenue: DailyRevenue[], products: ProductStat[], loyalty: LoyaltyROI, labels: PdfLabels, locale: string) {
  // Dynamic import — jspdf is large; only load on demand
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const accent = getCSSVar("--db-accent") || "#378ADD";

  doc.setFontSize(18);
  doc.setTextColor(accent);
  doc.text(labels.reportTitle, 15, 20);

  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(labels.generatedLabel(new Date().toLocaleDateString(locale)), 15, 28);

  // Revenue table
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text(labels.weeklyRevenueLabel, 15, 42);

  let y = 50;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(labels.dayColumnLabel, 15, y);
  doc.text(labels.revenueLabel, 60, y);
  doc.text(labels.tipsLabel, 100, y);
  doc.text(labels.ordersLabel, 140, y);
  y += 6;

  doc.setTextColor(30, 30, 30);
  revenue.forEach((d) => {
    doc.text(labels.dayLabels[d.date] ?? d.date, 15, y);
    doc.text(fmtDollars0(d.revenue), 60, y);
    doc.text(fmtDollars0(d.tips), 100, y);
    doc.text(String(d.orders), 140, y);
    y += 6;
  });

  y += 10;
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text(labels.topProductsLabel, 15, y);
  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(labels.productLabel, 15, y);
  doc.text(labels.unitsLabel, 100, y);
  doc.text(labels.revenueLabel, 140, y);
  y += 6;
  doc.setTextColor(30, 30, 30);
  products.forEach((p) => {
    doc.text(p.name, 15, y);
    doc.text(String(p.units), 100, y);
    doc.text(fmtDollars0(p.revenue), 140, y);
    y += 6;
  });

  y += 10;
  doc.setFontSize(13);
  doc.text(labels.loyaltyPointsLabel, 15, y);
  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  [
    [labels.pointsIssuedLabel, String(loyalty.points_issued)],
    [labels.pointsRedeemedLabel, String(loyalty.points_redeemed)],
    [labels.redemptionRateLabel, `${loyalty.redemption_rate}%`],
  ].forEach(([label, value]) => {
    doc.text(label, 15, y);
    doc.text(value, 100, y);
    y += 6;
  });

  doc.save("jchat-analytics.pdf");
}

// ── Real KPI band (live, scoped to the active business) ─────────────────────────

interface RealKpis {
  revenueTotal: number; // cents
  revenueMonth: number; // cents
  ordersTotal: number;
  ordersToday: number;
  uniqueCustomers: number;
  uniqueCheckins: number;
  topRoom: string | null;
  topRoomMessages: number;
  ordersByDay: { date: string; orders: number }[]; // last 7 days
}

function RealKpiBand({ kpis }: { kpis: RealKpis }) {
  const t = useTranslations("dashboardCommon");
  const { accent } = useChartColors();
  const dayLabels: Record<string, string> = {
    Mon: t("analyticsDayMon"), Tue: t("analyticsDayTue"), Wed: t("analyticsDayWed"),
    Thu: t("analyticsDayThu"), Fri: t("analyticsDayFri"), Sat: t("analyticsDaySat"), Sun: t("analyticsDaySun"),
  };
  return (
    <div style={{ marginBottom: "24px" }}>
      <SectionTitle>{t("analyticsOverviewLiveTitle")}</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px", marginBottom: "16px" }}>
        <KpiCard label={t("analyticsRevenueSeriesLabel")} value={fmt$(kpis.revenueTotal)} icon={IconCoin} sub={t("analyticsThisMonthSub", { amount: fmt$(kpis.revenueMonth) })} />
        <KpiCard label={t("analyticsOrdersLabel")} value={String(kpis.ordersTotal)} icon={IconTrendingUp} sub={t("analyticsTodaySub", { count: kpis.ordersToday })} />
        <KpiCard label={t("analyticsUniqueCustomersLabel")} value={String(kpis.uniqueCustomers)} icon={IconUsers} sub={t("analyticsOrdersCheckinsSub")} />
        <KpiCard label={t("analyticsUniqueCheckinsLabel")} value={String(kpis.uniqueCheckins)} icon={IconBolt} sub={t("analyticsDistinctVisitorsSub")} />
        <KpiCard label={t("analyticsMostActiveRoomLabel")} value={kpis.topRoom ?? "—"} icon={IconMessage} sub={t("analyticsMessagesCountSub", { count: kpis.topRoomMessages })} />
      </div>
      <Card>
        <SectionTitle>{t("analyticsOrdersLast7DaysTitle")}</SectionTitle>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={kpis.ordersByDay} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--db-border)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(v: string) => dayLabels[v] ?? v} tick={{ fill: "var(--db-text-secondary)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              labelFormatter={(v) => dayLabels[v as string] ?? (v as React.ReactNode)}
              formatter={(value: unknown) => [value as number, t("analyticsOrdersLabel")]}
              contentStyle={{ background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)", borderRadius: "8px", color: "var(--db-text-primary)" }}
            />
            <Bar dataKey="orders" fill={accent} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const t = useTranslations("dashboardCommon");
  const locale = useLocale();
  const [business, setBusiness] = useState<ActiveBusiness | null>(null);
  const [needsRegister, setNeedsRegister] = useState(false);
  const [realKpis, setRealKpis] = useState<RealKpis | null>(null);

  // Live KPI band — scoped to the signed-in owner's business.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    void (async () => {
      const res = await resolveActiveBusiness();
      if (!active) return;
      if (!res.ok) {
        if (res.reason === "no_business" || res.reason === "unauthenticated") setNeedsRegister(true);
        return;
      }
      setBusiness(res.business);
      const bid = res.business.id;

      const { data: orders } = await supabase
        .from("orders")
        .select("status, total_cents, user_id, created_at")
        .eq("business_id", bid);
      const o = (orders ?? []) as { status: string; total_cents: number; user_id: string | null; created_at: string }[];

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const paid = o.filter((x) => x.status !== "cancelled");
      const revenueTotal = paid.reduce((s, x) => s + (x.total_cents ?? 0), 0);
      const revenueMonth = paid
        .filter((x) => new Date(x.created_at).getTime() >= monthStart)
        .reduce((s, x) => s + (x.total_cents ?? 0), 0);
      const ordersToday = o.filter((x) => new Date(x.created_at).getTime() >= dayStart).length;

      const userIds = new Set<string>();
      o.forEach((x) => x.user_id && userIds.add(x.user_id));
      const { data: cis } = await supabase.from("check_ins").select("user_id").eq("business_id", bid);
      const checkinIds = new Set<string>();
      (cis ?? []).forEach((c) => {
        const uid = c.user_id as string | null;
        if (uid) {
          userIds.add(uid);
          checkinIds.add(uid);
        }
      });

      // Orders per day for the last 7 days (oldest → newest).
      const ordersByDay: { date: string; orders: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const start = d.getTime();
        const end = start + 86400000;
        ordersByDay.push({
          date: DAYS[d.getDay()],
          orders: o.filter((x) => {
            const t = new Date(x.created_at).getTime();
            return t >= start && t < end;
          }).length,
        });
      }

      const { data: rms } = await supabase.from("rooms").select("id, name").eq("business_id", bid);
      let topRoom: string | null = null;
      let topRoomMessages = 0;
      for (const r of (rms ?? []) as { id: string; name: string }[]) {
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("room_id", r.id);
        if ((count ?? 0) > topRoomMessages || topRoom === null) {
          topRoomMessages = count ?? 0;
          topRoom = r.name;
        }
      }

      if (!active) return;
      setRealKpis({
        revenueTotal,
        revenueMonth,
        ordersTotal: o.length,
        ordersToday,
        uniqueCustomers: userIds.size,
        uniqueCheckins: checkinIds.size,
        topRoom,
        topRoomMessages,
        ordersByDay,
      });
    })();
    return () => {
      active = false;
    };
  }, []);

  const [activeTab, setActiveTab] = useState<Tab>("revenue");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Plan gate: Analytics Pro is gated to the Business Pro plan (demo → allowed).
  const [isPro, setIsPro] = useState(true);
  useEffect(() => {
    let cancelled = false;
    isBusinessPro().then((pro) => {
      if (!cancelled) setIsPro(pro);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Data state
  const [revenue, setRevenue] = useState<DailyRevenue[]>([]);
  const [products, setProducts] = useState<ProductStat[]>([]);
  const [loyalty, setLoyalty] = useState<LoyaltyROI>(makeDemoLoyalty());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (!isSupabaseConfigured) {
        // Demo fallback — all charts render without backend
        setRevenue(makeDemoRevenue());
        setProducts(makeDemoProducts());
        setLoyalty(makeDemoLoyalty());
        return;
      }

      // ── Live data: revenue from orders table ──────────────────────────────
      const { data: orders } = await supabase
        .from("orders")
        .select("total_cents, tip_cents, created_at, status")
        .eq("status", "delivered")
        .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());

      if (orders && orders.length > 0) {
        const byDay: Record<string, { revenue: number; tips: number; orders: number }> = {};
        orders.forEach((o) => {
          const day = DAYS[new Date(o.created_at as string).getDay()];
          if (!byDay[day]) byDay[day] = { revenue: 0, tips: 0, orders: 0 };
          byDay[day].revenue += Math.round((o.total_cents as number) / 100);
          byDay[day].tips += Math.round((o.tip_cents as number || 0) / 100);
          byDay[day].orders += 1;
        });
        setRevenue(DAYS.map((d) => ({ date: d, ...(byDay[d] ?? { revenue: 0, tips: 0, orders: 0 }) })));
      } else {
        setRevenue(makeDemoRevenue());
      }

      // ── Products from order_items ─────────────────────────────────────────
      const { data: items } = await supabase
        .from("order_items")
        .select("qty, price_cents, menu_items(name)");

      if (items && items.length > 0) {
        const byName: Record<string, { units: number; revenue: number }> = {};
        items.forEach((it) => {
          const n = (it.menu_items as { name: string } | null)?.name ?? t("analyticsUnknownProductLabel");
          if (!byName[n]) byName[n] = { units: 0, revenue: 0 };
          byName[n].units += it.qty ?? 1;
          byName[n].revenue += Math.round((it.price_cents ?? 0) * (it.qty ?? 1) / 100);
        });
        const sorted = Object.entries(byName)
          .map(([name, s]) => ({ name, ...s }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 7);
        setProducts(sorted);
      } else {
        setProducts(makeDemoProducts());
      }

      // ── Loyalty points ────────────────────────────────────────────────────
      const { data: pts } = await supabase
        .from("loyalty_points")
        .select("points");

      if (pts && pts.length > 0) {
        // TODO: no existe columna type en loyalty_points; revisar si se necesita
        // distinguir earn/redeem como feature futura con su propia migración.
        const issued = pts.reduce((s, p) => s + (p.points ?? 0), 0);
        setLoyalty({
          points_issued: issued,
          points_redeemed: 0,
          redemption_rate: 0,
        });
      } else {
        setLoyalty(makeDemoLoyalty());
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleExportCSV = useCallback(() => {
    exportCSV(revenue, products);
  }, [revenue, products]);

  const handleExportPDF = useCallback(async () => {
    setExporting(true);
    try {
      await exportPDF(revenue, products, loyalty, {
        reportTitle: t("analyticsPdfReportTitle"),
        generatedLabel: (date) => t("analyticsPdfGeneratedLabel", { date }),
        weeklyRevenueLabel: t("analyticsWeeklyRevenueLabel"),
        dayColumnLabel: t("analyticsPdfDayColumnLabel"),
        revenueLabel: t("analyticsRevenueSeriesLabel"),
        tipsLabel: t("analyticsTipsSeriesLabel"),
        ordersLabel: t("analyticsOrdersLabel"),
        topProductsLabel: t("analyticsPdfTopProductsTitle"),
        productLabel: t("analyticsProductColumnLabel"),
        unitsLabel: t("analyticsUnitsLabel"),
        loyaltyPointsLabel: t("analyticsPdfLoyaltyPointsTitle"),
        pointsIssuedLabel: t("analyticsPointsIssuedLabel"),
        pointsRedeemedLabel: t("analyticsPointsRedeemedLabel"),
        redemptionRateLabel: t("analyticsRedemptionRateLabel"),
        dayLabels: {
          Mon: t("analyticsDayMon"), Tue: t("analyticsDayTue"), Wed: t("analyticsDayWed"),
          Thu: t("analyticsDayThu"), Fri: t("analyticsDayFri"), Sat: t("analyticsDaySat"), Sun: t("analyticsDaySun"),
        },
      }, locale);
    } finally {
      setExporting(false);
    }
  }, [revenue, products, loyalty, t, locale]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center", color: "var(--db-text-secondary)" }}>
          <IconRefresh size={32} color="var(--db-accent)" style={{ animation: "spin 1s linear infinite" }} />
          <div style={{ marginTop: "12px", fontSize: "14px" }}>{t("analyticsLoadingState")}</div>
        </div>
      </div>
    );
  }

  if (needsRegister) {
    return (
      <div style={{ maxWidth: "960px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "var(--db-text-primary)", marginBottom: "16px" }}>
          {t("navAnalytics")}
        </h1>
        <NoBusinessCTA message={t("analyticsNoBusinessMessage")} />
      </div>
    );
  }

  // TODO(plan gate): read businesses.plan from Supabase and gate here
  if (!isPro) {
    return <UpgradePrompt />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "24px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 800,
              color: "var(--db-text-primary)",
              margin: "0 0 4px 0",
              letterSpacing: "-0.02em",
            }}
          >
            {t("analyticsPageTitle")}
          </h1>
          <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: 0 }}>
            {business ? business.name + " · " : ""}
            {isSupabaseConfigured ? t("analyticsLiveDataLabel") : t("analyticsDemoDataLabel")}
            {" · "}{t("analyticsBusinessProBadge")}
          </p>
        </div>

        {/* Export buttons */}
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleExportCSV}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              borderRadius: "8px",
              border: "1px solid var(--db-border)",
              background: "var(--db-bg-surface)",
              color: "var(--db-text-primary)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <IconFileSpreadsheet size={15} />
            {t("analyticsExportCsvButton")}
          </button>
          <button
            onClick={() => void handleExportPDF()}
            disabled={exporting}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              borderRadius: "8px",
              border: "none",
              background: "var(--db-accent)",
              color: "var(--db-accent-text, #fff)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: exporting ? "wait" : "pointer",
              opacity: exporting ? 0.7 : 1,
            }}
          >
            <IconFilePdf size={15} />
            {exporting ? t("analyticsExportingState") : t("analyticsExportPdfButton")}
          </button>
        </div>
      </div>

      {/* Live KPI band — real data for the active business */}
      {isSupabaseConfigured && realKpis && <RealKpiBand kpis={realKpis} />}

      {/* Tabs */}
      <TabBar active={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      {activeTab === "revenue"  && <RevenueTab  data={revenue} />}
      {activeTab === "products" && <ProductsTab data={products} />}
      {activeTab === "loyalty"  && <LoyaltyTab  data={loyalty} />}
    </div>
  );
}
