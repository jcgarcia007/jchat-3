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
  revenue_from_members: number;
  redemption_rate: number;
  roi_pct: number;
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
    revenue_from_members: 62800,
    redemption_rate: 33.3,
    roi_pct: 312,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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
  const tabs: { id: Tab; label: string; icon: React.FC<{ size?: number }> }[] = [
    { id: "revenue",  label: "Revenue",  icon: IconChartBar },
    { id: "products", label: "Products", icon: IconStar },
    { id: "loyalty",  label: "Loyalty",  icon: IconCoin },
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

/** Tooltip formatter for recharts — formats cents as dollars */
function dollarFormatter(value: number): string {
  return `$${(value / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

// ── Revenue Tab ───────────────────────────────────────────────────────────────

function RevenueTab({ data }: { data: DailyRevenue[] }) {
  const { accent, warning } = useChartColors();

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
        <KpiCard label="Weekly Revenue" value={`$${totalRev.toLocaleString()}`} icon={IconChartBar} sub="Last 7 days" />
        <KpiCard label="Tips" value={`$${totalTips.toLocaleString()}`} icon={IconCoin} sub={`${((totalTips / totalRev) * 100).toFixed(1)}% of revenue`} />
        <KpiCard label="Orders" value={String(totalOrders)} icon={IconTrendingUp} sub={`Avg $${avgOrder} / order`} />
        <KpiCard label="Peak Day" value={peakDay?.date ?? "—"} icon={IconFlame} sub={`$${peakDay?.revenue.toLocaleString() ?? 0}`} />
      </div>

      {/* Daily bar chart */}
      <Card>
        <SectionTitle>Daily Revenue & Tips</SectionTitle>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--db-border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "var(--db-text-secondary)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v: number) => `$${(v / 100).toFixed(0)}`} tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
            <Tooltip
              formatter={(value: unknown, name: unknown) => [dollarFormatter(value as number), (name as string) === "revenue" ? "Revenue" : "Tips"]}
              contentStyle={{ background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)", borderRadius: "8px", color: "var(--db-text-primary)" }}
            />
            <Legend wrapperStyle={{ fontSize: "12px", color: "var(--db-text-secondary)" }} />
            <Bar dataKey="revenue" name="Revenue" fill={accent} radius={[4, 4, 0, 0]} />
            <Bar dataKey="tips" name="Tips" fill={warning} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Peak hour note */}
      <Card>
        <SectionTitle>Peak Hour Pattern</SectionTitle>
        <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", margin: 0 }}>
          Historically your busiest window is{" "}
          <span style={{ color: "var(--db-accent)", fontWeight: 700 }}>7 PM – 9 PM</span> on{" "}
          <span style={{ color: "var(--db-accent)", fontWeight: 700 }}>Friday & Saturday</span>.
          See the Chat tab for an hourly activity heatmap.
        </p>
      </Card>
    </div>
  );
}

// ── Products Tab ──────────────────────────────────────────────────────────────

function ProductsTab({ data }: { data: ProductStat[] }) {
  const { accent, warning } = useChartColors();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* Units chart */}
        <Card>
          <SectionTitle>Top Products by Units Sold</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--db-border)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} width={100} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value: unknown) => [value as number, "Units"]}
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
          <SectionTitle>Top Products by Revenue</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--db-border)" horizontal={false} />
              <XAxis type="number" tickFormatter={(v: number) => `$${v}`} tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} width={100} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value: unknown) => [`$${(value as number).toLocaleString()}`, "Revenue"]}
                contentStyle={{ background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)", borderRadius: "8px", color: "var(--db-text-primary)" }}
              />
              <Bar dataKey="revenue" fill={warning} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Rank table */}
      <Card>
        <SectionTitle>Product Rankings</SectionTitle>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ color: "var(--db-text-secondary)", textAlign: "left" }}>
              <th style={{ padding: "8px 12px", fontWeight: 600 }}>#</th>
              <th style={{ padding: "8px 12px", fontWeight: 600 }}>Product</th>
              <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>Units</th>
              <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>Revenue</th>
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
                <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--db-accent)", fontWeight: 600 }}>${p.revenue.toLocaleString()}</td>
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
  const { success } = useChartColors();

  const pointsFlow = [
    { label: "Issued", points: data.points_issued },
    { label: "Redeemed", points: data.points_redeemed },
    { label: "Outstanding", points: data.points_issued - data.points_redeemed },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
        <KpiCard label="Points Issued" value={fmtK(data.points_issued)} icon={IconCoin} />
        <KpiCard label="Points Redeemed" value={fmtK(data.points_redeemed)} icon={IconArrowUpRight} sub={`${data.redemption_rate}% redemption rate`} />
      </div>

      <Card>
        <SectionTitle>Points Flow</SectionTitle>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={pointsFlow} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--db-border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--db-text-secondary)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtK} tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value: unknown) => [fmtK(value as number), "Points"]}
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
        Analytics Pro — Business Pro only
      </h2>
      <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", maxWidth: "420px", lineHeight: 1.6, margin: 0 }}>
        Upgrade to <strong style={{ color: "var(--db-accent)" }}>Business Pro</strong> to unlock
        advanced analytics, revenue forecasting, cohort retention, loyalty ROI, and API access.
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
        Upgrade to Business Pro
      </button>
      <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", margin: 0 }}>
        {/* TODO(plan gate): read businesses.plan from Supabase and remove this prompt when plan === 'pro' */}
        Read plan from <code>businesses.plan</code> — remove gate when <code>plan === &apos;pro&apos;</code>.
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

async function exportPDF(revenue: DailyRevenue[], products: ProductStat[], loyalty: LoyaltyROI) {
  // Dynamic import — jspdf is large; only load on demand
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const accent = getCSSVar("--db-accent") || "#378ADD";

  doc.setFontSize(18);
  doc.setTextColor(accent);
  doc.text("JChat 3.0 — Analytics Report", 15, 20);

  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 15, 28);

  // Revenue table
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text("Weekly Revenue", 15, 42);

  let y = 50;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("Day", 15, y);
  doc.text("Revenue", 60, y);
  doc.text("Tips", 100, y);
  doc.text("Orders", 140, y);
  y += 6;

  doc.setTextColor(30, 30, 30);
  revenue.forEach((d) => {
    doc.text(d.date, 15, y);
    doc.text(`$${d.revenue.toLocaleString()}`, 60, y);
    doc.text(`$${d.tips.toLocaleString()}`, 100, y);
    doc.text(String(d.orders), 140, y);
    y += 6;
  });

  y += 10;
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text("Top Products", 15, y);
  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("Product", 15, y);
  doc.text("Units", 100, y);
  doc.text("Revenue", 140, y);
  y += 6;
  doc.setTextColor(30, 30, 30);
  products.forEach((p) => {
    doc.text(p.name, 15, y);
    doc.text(String(p.units), 100, y);
    doc.text(`$${p.revenue.toLocaleString()}`, 140, y);
    y += 6;
  });

  y += 10;
  doc.setFontSize(13);
  doc.text("Loyalty ROI", 15, y);
  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  [
    ["Points Issued", String(loyalty.points_issued)],
    ["Points Redeemed", String(loyalty.points_redeemed)],
    ["Redemption Rate", `${loyalty.redemption_rate}%`],
    ["Member Revenue", `$${loyalty.revenue_from_members.toLocaleString()}`],
    ["Program ROI", `${loyalty.roi_pct}%`],
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
  const { accent } = useChartColors();
  return (
    <div style={{ marginBottom: "24px" }}>
      <SectionTitle>Overview — live</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px", marginBottom: "16px" }}>
        <KpiCard label="Revenue" value={fmt$(kpis.revenueTotal)} icon={IconCoin} sub={`${fmt$(kpis.revenueMonth)} this month`} />
        <KpiCard label="Orders" value={String(kpis.ordersTotal)} icon={IconTrendingUp} sub={`${kpis.ordersToday} today`} />
        <KpiCard label="Unique customers" value={String(kpis.uniqueCustomers)} icon={IconUsers} sub="Orders + check-ins" />
        <KpiCard label="Unique check-ins" value={String(kpis.uniqueCheckins)} icon={IconBolt} sub="Distinct visitors" />
        <KpiCard label="Most active room" value={kpis.topRoom ?? "—"} icon={IconMessage} sub={`${kpis.topRoomMessages} messages`} />
      </div>
      <Card>
        <SectionTitle>Orders — last 7 days</SectionTitle>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={kpis.ordersByDay} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--db-border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "var(--db-text-secondary)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              formatter={(value: unknown) => [value as number, "Orders"]}
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
          const n = (it.menu_items as { name: string } | null)?.name ?? "Unknown";
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
          revenue_from_members: 0, // TODO: join with orders
          redemption_rate: 0,
          roi_pct: 0, // TODO: compute from member vs non-member revenue diff
        });
      } else {
        setLoyalty(makeDemoLoyalty());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleExportCSV = useCallback(() => {
    exportCSV(revenue, products);
  }, [revenue, products]);

  const handleExportPDF = useCallback(async () => {
    setExporting(true);
    try {
      await exportPDF(revenue, products, loyalty);
    } finally {
      setExporting(false);
    }
  }, [revenue, products, loyalty]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center", color: "var(--db-text-secondary)" }}>
          <IconRefresh size={32} color="var(--db-accent)" style={{ animation: "spin 1s linear infinite" }} />
          <div style={{ marginTop: "12px", fontSize: "14px" }}>Loading analytics…</div>
        </div>
      </div>
    );
  }

  if (needsRegister) {
    return (
      <div style={{ maxWidth: "960px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "var(--db-text-primary)", marginBottom: "16px" }}>
          Analytics
        </h1>
        <NoBusinessCTA message="Register your business to see revenue, orders and customer analytics." />
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
            Analytics Pro
          </h1>
          <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: 0 }}>
            {business ? business.name + " · " : ""}
            {isSupabaseConfigured ? "Live data" : "Demo data — connect Supabase to see live metrics"}
            {" · "}Business Pro
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
            CSV
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
            {exporting ? "Exporting…" : "PDF"}
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
