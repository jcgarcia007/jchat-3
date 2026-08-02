// TODO(F6-empleados): Same ownership gate as sales/page.tsx (see TODO(F5-empleados) there).
// Dashboard layout.tsx today only admits business owners, so RLS is sufficient.

"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconUser } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { formatCents } from "@/lib/currency";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

// ── Types ─────────────────────────────────────────────────────────────────────

type ComparisonPreset = "week_vs_prev" | "month_vs_prev" | "custom";
type RangePreset = "today" | "week" | "month" | "custom";

interface EmployeeRow {
  id: string;
  user_id: string;
  users: { display_name: string | null; username: string | null; avatar_url: string | null } | null;
}

interface OrderRow {
  id: string;
  taken_by: string | null;
  tip_cents: number | null;
  subtotal_cents: number | null;
  total_cents: number;
  status: string;
}

// Simplified seller stats — no products, no orders detail, no tables (F6 is summary only)
interface SellerSummary {
  userId: string | null;
  employeeId: string | null;
  displayName: string;
  totalCents: number;
  tipCents: number;
  subtotalCents: number;
  orderCount: number;
  cancelCount: number;
}

interface PeriodStats {
  totalCents: number;
  tipCents: number;
  subtotalCents: number;
  orderCount: number;
  cancelCount: number;
  sellers: SellerSummary[];
}

interface DateRange { start: Date; end: Date }

// ── Range helpers ─────────────────────────────────────────────────────────────

function localDayStart(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function getRange(preset: RangePreset, customStart: string, customEnd: string): DateRange {
  const now = new Date();
  if (preset === "today") return { start: localDayStart(), end: now };
  if (preset === "week") {
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1; // Monday = 0
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    return { start: monday, end: now };
  }
  if (preset === "month") return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
  const s = customStart ? new Date(`${customStart}T00:00:00`) : localDayStart();
  const e = customEnd   ? new Date(`${customEnd}T23:59:59`)   : now;
  return { start: s, end: e };
}

// Returns ranges for A (current) and B (base/previous) given the comparison preset.
// For custom mode, each period uses its own RangePreset + manual inputs.
function getComparisonRanges(
  compPreset: ComparisonPreset,
  aPreset: RangePreset, aCustomStart: string, aCustomEnd: string,
  bPreset: RangePreset, bCustomStart: string, bCustomEnd: string,
): { a: DateRange; b: DateRange } {
  const now = new Date();

  if (compPreset === "week_vs_prev") {
    // A = Monday of current week 00:00 → now
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const aMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    const a: DateRange = { start: aMonday, end: now };
    // B = Monday of previous week → Sunday of previous week 23:59:59
    // Sunday of prev week = aMonday - 1 day (at end of day)
    const bSunday = new Date(aMonday.getFullYear(), aMonday.getMonth(), aMonday.getDate() - 1, 23, 59, 59, 999);
    const bMonday = new Date(bSunday.getFullYear(), bSunday.getMonth(), bSunday.getDate() - 6);
    return { a, b: { start: bMonday, end: bSunday } };
  }

  if (compPreset === "month_vs_prev") {
    // A = 1st of this month → now
    const a: DateRange = { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
    // B = 1st of last month → last day of last month 23:59:59
    // new Date(year, month, 0) = last day of previous month
    const bEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const bStart = new Date(bEnd.getFullYear(), bEnd.getMonth(), 1);
    return { a, b: { start: bStart, end: bEnd } };
  }

  // custom: independent presets for each period
  return {
    a: getRange(aPreset, aCustomStart, aCustomEnd),
    b: getRange(bPreset, bCustomStart, bCustomEnd),
  };
}

// ── Diff helper ───────────────────────────────────────────────────────────────

interface DiffResult { absVal: number; pct: number | null }

// Guard: when base period B is 0 and A > 0, pct would be Infinity.
// We return null → shown as "nuevo"/"new" to indicate the metric first appeared in A.
function diffVal(a: number, b: number): DiffResult {
  return { absVal: a - b, pct: b === 0 ? null : ((a - b) / b) * 100 };
}

function diffColor(absVal: number): string {
  if (absVal > 0) return "var(--db-success)";
  if (absVal < 0) return "var(--db-danger)";
  return "var(--db-text-secondary)";
}

function fmtSignedCents(absVal: number, locale: string): string {
  const abs = formatCents(Math.abs(absVal), locale);
  if (absVal > 0) return `+${abs}`;
  if (absVal < 0) return `−${abs}`;
  return abs;
}

function fmtSignedCount(absVal: number): string {
  if (absVal > 0) return `+${absVal}`;
  if (absVal < 0) return `−${Math.abs(absVal)}`;
  return "0";
}

function fmtSignedPct(pct: number | null, t: ReturnType<typeof useTranslations>): string {
  if (pct === null) return t("summaryDiffNew");
  if (Math.abs(pct) < 0.05) return "0%";
  const sign = pct > 0 ? "+" : "−";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

function fmtPct(num: number, den: number): string {
  if (den <= 0) return "—";
  return `${((num / den) * 100).toFixed(1)}%`;
}

function fmtShortDate(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(d);
}

// ── Aggregation ───────────────────────────────────────────────────────────────

function initSeller(userId: string | null, displayName: string, empId: string | null): SellerSummary {
  return { userId, employeeId: empId, displayName, totalCents: 0, tipCents: 0, subtotalCents: 0, orderCount: 0, cancelCount: 0 };
}

function aggregatePeriod(
  orders: OrderRow[],
  employees: EmployeeRow[],
  unassignedLabel: string,
  empFallback: string,
): PeriodStats {
  const byUserId = new Map<string, SellerSummary>();
  for (const emp of employees) {
    const p = emp.users;
    const name = p?.display_name ?? (p?.username ? `@${p.username}` : empFallback);
    byUserId.set(emp.user_id, initSeller(emp.user_id, name, emp.id));
  }
  const unassigned = initSeller(null, unassignedLabel, null);

  let bizTotal = 0, bizTip = 0, bizSub = 0, bizOrders = 0, bizCancel = 0;

  for (const order of orders) {
    const seller = (order.taken_by && byUserId.has(order.taken_by))
      ? byUserId.get(order.taken_by)!
      : unassigned;

    // Cancelled orders are excluded from sales totals; counted separately.
    // total_cents = cash received; subtotal_cents = tip % denominator.
    if (order.status === "cancelled") {
      seller.cancelCount++;
      bizCancel++;
    } else {
      seller.orderCount++;
      seller.totalCents    += order.total_cents ?? 0;
      seller.tipCents      += order.tip_cents ?? 0;
      seller.subtotalCents += order.subtotal_cents ?? 0;
      bizTotal   += order.total_cents ?? 0;
      bizTip     += order.tip_cents ?? 0;
      bizSub     += order.subtotal_cents ?? 0;
      bizOrders++;
    }
  }

  // Only include sellers with at least one order (paid or cancelled)
  const sellerList = [...byUserId.values()]
    .filter(s => s.orderCount > 0 || s.cancelCount > 0)
    .sort((a, b) => b.totalCents - a.totalCents);
  if (unassigned.orderCount > 0 || unassigned.cancelCount > 0) sellerList.push(unassigned);

  return { totalCents: bizTotal, tipCents: bizTip, subtotalCents: bizSub, orderCount: bizOrders, cancelCount: bizCancel, sellers: sellerList };
}

// ── LetterAvatar ──────────────────────────────────────────────────────────────

function LetterAvatar({ name, size = 28 }: { name: string; size?: number }) {
  const letter = name.trim()[0]?.toUpperCase() ?? "?";
  return (
    <div aria-hidden="true" style={{
      width: size, height: size, borderRadius: "50%",
      background: "color-mix(in srgb, var(--db-accent) 20%, transparent)",
      color: "var(--db-accent)", display: "flex", alignItems: "center",
      justifyContent: "center", fontSize: size * 0.4, fontWeight: 700, flexShrink: 0,
    }}>
      {letter}
    </div>
  );
}

// ── DiffChip (cents) ──────────────────────────────────────────────────────────

function DiffChip({ absVal, pct, locale, t }: {
  absVal: number; pct: number | null; locale: string; t: ReturnType<typeof useTranslations>;
}) {
  const color = diffColor(absVal);
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: "1px" }}>
      <span style={{ fontSize: "12px", fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {fmtSignedCents(absVal, locale)}
      </span>
      <span style={{ fontSize: "10px", color }}>
        {fmtSignedPct(pct, t)}
      </span>
    </span>
  );
}

// ── ComparisonPresetBar ───────────────────────────────────────────────────────

function ComparisonPresetBar({ preset, onPreset, t }: {
  preset: ComparisonPreset;
  onPreset: (p: ComparisonPreset) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const opts: { key: ComparisonPreset; label: string }[] = [
    { key: "week_vs_prev",  label: t("summaryCompareWeekVsPrev")  },
    { key: "month_vs_prev", label: t("summaryCompareMonthVsPrev") },
    { key: "custom",        label: t("summaryCompareCustom")      },
  ];
  const base: React.CSSProperties = {
    padding: "5px 14px", borderRadius: "999px", fontSize: "12px",
    border: "1px solid var(--db-border)", cursor: "pointer", transition: "all 0.15s",
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
      {opts.map(({ key, label }) => {
        const active = preset === key;
        return (
          <button key={key} onClick={() => onPreset(key)} style={{
            ...base, fontWeight: active ? 700 : 500,
            background: active ? "color-mix(in srgb, var(--db-accent) 12%, transparent)" : "var(--db-bg-elevated)",
            borderColor: active ? "var(--db-accent)" : "var(--db-border)",
            color: active ? "var(--db-accent)" : "var(--db-text-secondary)",
          }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── SinglePeriodPicker ────────────────────────────────────────────────────────

function SinglePeriodPicker({ label, preset, customStart, customEnd, onPreset, onCustomStart, onCustomEnd, t }: {
  label: string; preset: RangePreset; customStart: string; customEnd: string;
  onPreset: (p: RangePreset) => void; onCustomStart: (v: string) => void; onCustomEnd: (v: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const presets: { key: RangePreset; label: string }[] = [
    { key: "today",  label: t("salesRangeToday")  },
    { key: "week",   label: t("salesRangeWeek")   },
    { key: "month",  label: t("salesRangeMonth")  },
    { key: "custom", label: t("salesRangeCustom") },
  ];
  const btnBase: React.CSSProperties = {
    padding: "3px 9px", borderRadius: "999px", fontSize: "11px",
    border: "1px solid var(--db-border)", cursor: "pointer", transition: "all 0.15s",
  };
  const inputStyle: React.CSSProperties = {
    padding: "3px 7px", borderRadius: "6px", border: "1px solid var(--db-border)",
    background: "var(--db-bg-elevated)", color: "var(--db-text-primary)", fontSize: "11px",
  };
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: "8px", padding: "12px 14px",
      background: "var(--db-bg-surface)", border: "1px solid var(--db-border)",
      borderRadius: "var(--db-radius-card)", flex: "1 1 240px",
    }}>
      <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--db-accent)" }}>
        {label}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {presets.map(({ key, label: lbl }) => {
          const active = preset === key;
          return (
            <button key={key} onClick={() => onPreset(key)} style={{
              ...btnBase, fontWeight: active ? 700 : 400,
              background: active ? "color-mix(in srgb, var(--db-accent) 12%, transparent)" : "var(--db-bg-elevated)",
              borderColor: active ? "var(--db-accent)" : "var(--db-border)",
              color: active ? "var(--db-accent)" : "var(--db-text-secondary)",
            }}>
              {lbl}
            </button>
          );
        })}
      </div>
      {preset === "custom" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
          <label style={{ fontSize: "11px", color: "var(--db-text-secondary)" }}>{t("salesRangeFrom")}</label>
          <input type="date" value={customStart} onChange={(e) => onCustomStart(e.target.value)} style={inputStyle} />
          <label style={{ fontSize: "11px", color: "var(--db-text-secondary)" }}>{t("salesRangeTo")}</label>
          <input type="date" value={customEnd} onChange={(e) => onCustomEnd(e.target.value)} style={inputStyle} />
        </div>
      )}
    </div>
  );
}

// ── TableHeader ───────────────────────────────────────────────────────────────

function TableHeader({ rangeA, rangeB, locale, t }: {
  rangeA: DateRange; rangeB: DateRange; locale: string; t: ReturnType<typeof useTranslations>;
}) {
  const labelA = `${t("summaryPeriodA")} · ${fmtShortDate(rangeA.start, locale)} – ${fmtShortDate(rangeA.end, locale)}`;
  const labelB = `${t("summaryPeriodB")} · ${fmtShortDate(rangeB.start, locale)} – ${fmtShortDate(rangeB.end, locale)}`;
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
      gap: "8px", padding: "8px 16px",
      background: "var(--db-bg-elevated)",
      borderRadius: "var(--db-radius-card) var(--db-radius-card) 0 0",
      borderBottom: "2px solid var(--db-border)",
    }}>
      <span style={{ fontSize: "10px", color: "var(--db-text-tertiary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>&nbsp;</span>
      <span style={{ fontSize: "10px", color: "var(--db-accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>{labelA}</span>
      <span style={{ fontSize: "10px", color: "var(--db-text-secondary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>{labelB}</span>
      <span style={{ fontSize: "10px", color: "var(--db-text-tertiary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>Δ</span>
    </div>
  );
}

// ── MetricRow (cents — additive, shows full diff) ─────────────────────────────

function MetricRow({ label, a, b, locale, t }: {
  label: string; a: number; b: number; locale: string; t: ReturnType<typeof useTranslations>;
}) {
  const d = diffVal(a, b);
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
      gap: "8px", alignItems: "center", padding: "10px 16px",
      borderBottom: "1px solid var(--db-border)", fontSize: "13px",
    }}>
      <span style={{ color: "var(--db-text-secondary)" }}>{label}</span>
      <span style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--db-text-primary)" }}>
        {formatCents(a, locale)}
      </span>
      <span style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--db-text-secondary)" }}>
        {formatCents(b, locale)}
      </span>
      <div style={{ textAlign: "right" }}>
        <DiffChip absVal={d.absVal} pct={d.pct} locale={locale} t={t} />
      </div>
    </div>
  );
}

// ── MetricRowCount (integer count — additive) ──────────────────────────────────

function MetricRowCount({ label, a, b, t }: {
  label: string; a: number; b: number; t: ReturnType<typeof useTranslations>;
}) {
  const d = diffVal(a, b);
  const color = diffColor(d.absVal);
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
      gap: "8px", alignItems: "center", padding: "10px 16px",
      borderBottom: "1px solid var(--db-border)", fontSize: "13px",
    }}>
      <span style={{ color: "var(--db-text-secondary)" }}>{label}</span>
      <span style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--db-text-primary)" }}>{a}</span>
      <span style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--db-text-secondary)" }}>{b}</span>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: "12px", fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{fmtSignedCount(d.absVal)}</div>
        <div style={{ fontSize: "10px", color }}>{fmtSignedPct(d.pct, t)}</div>
      </div>
    </div>
  );
}

// ── MetricRowStr (derived/rate metrics — show values only, no diff) ────────────

function MetricRowStr({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
      gap: "8px", alignItems: "center", padding: "10px 16px",
      borderBottom: "1px solid var(--db-border)", fontSize: "13px",
    }}>
      <span style={{ color: "var(--db-text-secondary)" }}>{label}</span>
      <span style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--db-text-primary)" }}>{a}</span>
      <span style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--db-text-secondary)" }}>{b}</span>
      <span style={{ textAlign: "right", fontSize: "11px", color: "var(--db-text-tertiary)" }}>—</span>
    </div>
  );
}

// ── SellerCompRow ─────────────────────────────────────────────────────────────

function SellerCompRow({ selA, selB, locale, isUnassigned, t }: {
  selA: SellerSummary | null; selB: SellerSummary | null;
  locale: string; isUnassigned: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const aTotal = selA?.totalCents ?? 0;
  const bTotal = selB?.totalCents ?? 0;
  const aTip   = selA?.tipCents   ?? 0;
  const bTip   = selB?.tipCents   ?? 0;
  const aOrds  = selA?.orderCount ?? 0;
  const bOrds  = selB?.orderCount ?? 0;
  const name   = selA?.displayName ?? selB?.displayName ?? t("salesUnassigned");
  const salesD = diffVal(aTotal, bTotal);
  const tipD   = diffVal(aTip, bTip);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px",
      borderBottom: "1px solid var(--db-border)", background: "var(--db-bg-surface)",
      flexWrap: "wrap", opacity: isUnassigned ? 0.7 : 1,
    }}>
      {isUnassigned
        ? <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--db-bg-elevated)", border: "1px dashed var(--db-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <IconUser size={13} color="var(--db-text-tertiary)" />
          </div>
        : <LetterAvatar name={name} />
      }

      <span style={{ flex: "1 1 100px", fontSize: "13px", fontWeight: 600, color: "var(--db-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {name}
      </span>

      {/* Period A */}
      <div style={{ textAlign: "right", flex: "0 0 auto" }}>
        <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--db-accent)", marginBottom: "2px" }}>{t("summaryPeriodA")}</div>
        <div style={{ fontSize: "13px", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--db-text-primary)" }}>{formatCents(aTotal, locale)}</div>
        <div style={{ fontSize: "11px", color: "var(--db-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{t("summaryOrderCount", { count: aOrds })}</div>
      </div>

      {/* Period B */}
      <div style={{ textAlign: "right", flex: "0 0 auto" }}>
        <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--db-text-secondary)", marginBottom: "2px" }}>{t("summaryPeriodB")}</div>
        <div style={{ fontSize: "13px", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--db-text-secondary)" }}>{formatCents(bTotal, locale)}</div>
        <div style={{ fontSize: "11px", color: "var(--db-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{t("summaryOrderCount", { count: bOrds })}</div>
      </div>

      {/* Diff */}
      <div style={{ textAlign: "right", flex: "0 0 auto", minWidth: "72px" }}>
        <DiffChip absVal={salesD.absVal} pct={salesD.pct} locale={locale} t={t} />
        {(aTip > 0 || bTip > 0) && (
          <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "1px" }}>
            <span style={{ fontSize: "9px", color: "var(--db-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{t("salesColTips")}</span>
            <DiffChip absVal={tipD.absVal} pct={tipD.pct} locale={locale} t={t} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── SectionTitle ──────────────────────────────────────────────────────────────

function SectionTitle({ title }: { title: string }) {
  return (
    <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--db-text-tertiary)", marginBottom: "8px", marginTop: "24px" }}>
      {title}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SummaryPage() {
  const t = useTranslations("dashboardCommon");
  const locale = useLocale();

  // Comparison preset (default: este mes vs mes pasado)
  const [compPreset, setCompPreset] = useState<ComparisonPreset>("month_vs_prev");
  // Custom mode: independent pickers for A and B
  const [aPreset, setAPreset]           = useState<RangePreset>("month");
  const [aCustomStart, setACustomStart] = useState("");
  const [aCustomEnd, setACustomEnd]     = useState("");
  const [bPreset, setBPreset]           = useState<RangePreset>("month");
  const [bCustomStart, setBCustomStart] = useState("");
  const [bCustomEnd, setBCustomEnd]     = useState("");

  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [noBusiness, setNoBusiness] = useState(false);
  const [periodA, setPeriodA]       = useState<PeriodStats | null>(null);
  const [periodB, setPeriodB]       = useState<PeriodStats | null>(null);
  const [rangeA, setRangeA]         = useState<DateRange | null>(null);
  const [rangeB, setRangeB]         = useState<DateRange | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    let active = true;

    void (async () => {
      try {
        setLoading(true);
        setError(false);

        const bizRes = await resolveActiveBusiness();
        if (!active) return;
        if (!bizRes.ok) { setNoBusiness(true); setLoading(false); return; }
        const bid = bizRes.business.id;

        const ranges = getComparisonRanges(compPreset, aPreset, aCustomStart, aCustomEnd, bPreset, bCustomStart, bCustomEnd);
        const { a: rA, b: rB } = ranges;

        const [empRes, ordARes, ordBRes] = await Promise.all([
          supabase
            .from("employees")
            .select("id, user_id, users(display_name, username, avatar_url)")
            .eq("business_id", bid)
            .eq("status", "accepted"),

          // Period A: SOLO pagados (paid_at not null), same filter as F5b
          supabase
            .from("orders")
            .select("id, taken_by, tip_cents, subtotal_cents, total_cents, status")
            .eq("business_id", bid)
            .not("paid_at", "is", null)
            .gte("paid_at", rA.start.toISOString())
            .lte("paid_at", rA.end.toISOString()),

          // Period B: same filter, different date range
          supabase
            .from("orders")
            .select("id, taken_by, tip_cents, subtotal_cents, total_cents, status")
            .eq("business_id", bid)
            .not("paid_at", "is", null)
            .gte("paid_at", rB.start.toISOString())
            .lte("paid_at", rB.end.toISOString()),
        ]);

        if (!active) return;
        if (empRes.error || ordARes.error || ordBRes.error) {
          setError(true); setLoading(false); return;
        }

        const employees = (empRes.data ?? []) as EmployeeRow[];
        const empFallback = t("employeeName");
        const unassignedLabel = t("salesUnassigned");

        if (active) {
          setPeriodA(aggregatePeriod((ordARes.data ?? []) as OrderRow[], employees, unassignedLabel, empFallback));
          setPeriodB(aggregatePeriod((ordBRes.data ?? []) as OrderRow[], employees, unassignedLabel, empFallback));
          setRangeA(rA);
          setRangeB(rB);
          setError(false);
          setLoading(false);
        }
      } catch {
        if (active) { setError(true); setLoading(false); }
      }
    })();

    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compPreset, aPreset, aCustomStart, aCustomEnd, bPreset, bCustomStart, bCustomEnd]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const aAvgTicket = periodA && periodA.orderCount > 0
    ? Math.round(periodA.totalCents / periodA.orderCount) : 0;
  const bAvgTicket = periodB && periodB.orderCount > 0
    ? Math.round(periodB.totalCents / periodB.orderCount) : 0;

  // Build union of sellers across both periods for the comparison table.
  // A seller present in A but not B (or vice versa) gets 0 for the missing period — not omitted.
  const sellerRows = (() => {
    if (!periodA || !periodB) return [];
    const allKeys = new Set<string>([
      ...periodA.sellers.map(s => s.userId ?? "__unassigned__"),
      ...periodB.sellers.map(s => s.userId ?? "__unassigned__"),
    ]);
    const mapA = new Map(periodA.sellers.map(s => [s.userId ?? "__unassigned__", s]));
    const mapB = new Map(periodB.sellers.map(s => [s.userId ?? "__unassigned__", s]));

    return [...allKeys]
      .sort((ka, kb) => {
        if (ka === "__unassigned__") return 1;
        if (kb === "__unassigned__") return -1;
        // Sort by period A sales descending
        return (mapA.get(kb)?.totalCents ?? 0) - (mapA.get(ka)?.totalCents ?? 0);
      })
      .map(key => ({
        selA: mapA.get(key) ?? null,
        selB: mapB.get(key) ?? null,
        isUnassigned: key === "__unassigned__",
      }));
  })();

  const isEmpty = periodA !== null && periodB !== null && periodA.orderCount === 0 && periodB.orderCount === 0;

  // ── Render ───────────────────────────────────────────────────────────────────

  if (noBusiness) {
    return <div><NoBusinessCTA /></div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: "0 0 20px" }}>
        {t("summaryTitle")}
      </h1>

      {/* Comparison preset chips */}
      <ComparisonPresetBar preset={compPreset} onPreset={(p) => { setCompPreset(p); }} t={t} />

      {/* Custom mode: two independent period pickers */}
      {compPreset === "custom" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
          <SinglePeriodPicker
            label={t("summaryPeriodA")}
            preset={aPreset} customStart={aCustomStart} customEnd={aCustomEnd}
            onPreset={setAPreset} onCustomStart={setACustomStart} onCustomEnd={setACustomEnd}
            t={t}
          />
          <SinglePeriodPicker
            label={t("summaryPeriodB")}
            preset={bPreset} customStart={bCustomStart} customEnd={bCustomEnd}
            onPreset={setBPreset} onCustomStart={setBCustomStart} onCustomEnd={setBCustomEnd}
            t={t}
          />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: "48px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "13px" }}>
          {t("summaryLoadingData")}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={{ padding: "24px", textAlign: "center", color: "var(--db-danger)", fontSize: "13px" }}>
          {t("summaryLoadError")}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && isEmpty && (
        <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "13px" }}>
          {t("summaryEmpty")}
        </div>
      )}

      {/* Data */}
      {!loading && !error && !isEmpty && periodA && periodB && rangeA && rangeB && (
        <div>
          {/* ── Negocio ─────────────────────────────────────────────────────── */}
          <SectionTitle title={t("summarySectionBusiness")} />

          <div style={{ border: "1px solid var(--db-border)", borderRadius: "var(--db-radius-card)", overflow: "hidden", marginBottom: "8px" }}>
            <TableHeader rangeA={rangeA} rangeB={rangeB} locale={locale} t={t} />
            <MetricRow label={t("salesColSales")}    a={periodA.totalCents}    b={periodB.totalCents}    locale={locale} t={t} />
            <MetricRow label={t("salesColTips")}     a={periodA.tipCents}      b={periodB.tipCents}      locale={locale} t={t} />
            <MetricRowCount label={t("salesColOrders")}   a={periodA.orderCount}    b={periodB.orderCount}    t={t} />
            <MetricRow
              label={t("salesColAvgTicket")}
              a={aAvgTicket} b={bAvgTicket}
              locale={locale} t={t}
            />
            <MetricRowStr
              label={t("salesColTipPct")}
              a={fmtPct(periodA.tipCents, periodA.subtotalCents)}
              b={fmtPct(periodB.tipCents, periodB.subtotalCents)}
            />
            <MetricRowCount label={t("salesDetailCancellations", { count: periodA.cancelCount })} a={periodA.cancelCount} b={periodB.cancelCount} t={t} />
          </div>

          {/* ── Por vendedor ─────────────────────────────────────────────────── */}
          {sellerRows.length > 0 && (
            <>
              <SectionTitle title={t("summarySectionSellers")} />
              <div style={{ border: "1px solid var(--db-border)", borderRadius: "var(--db-radius-card)", overflow: "hidden" }}>
                {sellerRows.map((row, idx) => (
                  <SellerCompRow
                    key={row.selA?.userId ?? row.selB?.userId ?? `__unassigned__${idx}`}
                    selA={row.selA}
                    selB={row.selB}
                    locale={locale}
                    isUnassigned={row.isUnassigned}
                    t={t}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
