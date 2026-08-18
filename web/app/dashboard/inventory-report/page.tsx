/**
 * JChat 3.0 — Inventory report (Dashboard) · Fase A3
 *
 * Read-only waste / variance report, one row per stock-tracked product:
 *   Product · Sold · Received · Waste · Shortage · Stock
 *
 * Everything comes from the `inventory_report` RPC (migration 129), which is
 * SECURITY DEFINER and raises 'forbidden' (42501) for anyone who is neither the
 * owner nor an employee with `inventory_manage`. This page performs NO writes.
 *
 * Ordering is the RPC's (most waste, then worst shortage, then name) and is
 * deliberately NOT re-sorted client-side.
 */

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { IconAlertTriangle, IconTrash } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

// ── Types ─────────────────────────────────────────────────────────────────────

type RangePreset = "30d" | "7d" | "month" | "custom";

interface ReportRow {
  menu_item_id: string;
  item_name: string;
  sold: number;
  received: number;
  waste: number;
  /** Net physical-count adjustment. NEGATIVE = missing stock (shrinkage). */
  count_adj: number;
  voided: number;
  stock_now: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function localDayStart(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/**
 * Resolves the preset to [start, end). `end` is EXCLUSIVE because the RPC
 * filters with `created_at < p_to` — so "up to today" means the start of
 * tomorrow, otherwise today's movements would be silently dropped.
 */
function getRange(preset: RangePreset, customStart: string, customEnd: string): { start: Date; end: Date } {
  const today = localDayStart();
  const tomorrow = addDays(today, 1);

  if (preset === "7d")   return { start: addDays(today, -6),  end: tomorrow };
  if (preset === "month") return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: tomorrow };
  if (preset === "custom") {
    const start = customStart ? new Date(`${customStart}T00:00:00`) : addDays(today, -29);
    // The user picks an inclusive end date; shift a day forward for the RPC.
    const end = customEnd ? addDays(new Date(`${customEnd}T00:00:00`), 1) : tomorrow;
    return { start, end };
  }
  return { start: addDays(today, -29), end: tomorrow }; // "30d" (default)
}

/** True when the RPC refused the caller (owner / inventory_manage gate). */
function isForbidden(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42501" || (err.message ?? "").toLowerCase().includes("forbidden");
}

// ── Range picker ──────────────────────────────────────────────────────────────

function DateRangePicker({
  preset,
  customStart,
  customEnd,
  onPreset,
  onCustomStart,
  onCustomEnd,
  t,
}: {
  preset: RangePreset;
  customStart: string;
  customEnd: string;
  onPreset: (p: RangePreset) => void;
  onCustomStart: (v: string) => void;
  onCustomEnd: (v: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const presets: { key: RangePreset; label: string }[] = [
    { key: "30d",    label: t("invReportRange30d") },
    { key: "7d",     label: t("invReportRange7d") },
    { key: "month",  label: t("invReportRangeMonth") },
    { key: "custom", label: t("invReportRangeCustom") },
  ];

  const btnBase: React.CSSProperties = {
    padding: "5px 12px",
    borderRadius: "999px",
    fontSize: "12px",
    border: "1px solid var(--db-border)",
    cursor: "pointer",
    transition: "all 0.15s",
  };

  const inputStyle: React.CSSProperties = {
    padding: "4px 8px",
    borderRadius: "6px",
    border: "1px solid var(--db-border)",
    background: "var(--db-bg-elevated)",
    color: "var(--db-text-primary)",
    fontSize: "12px",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "20px" }}>
      {presets.map(({ key, label }) => {
        const active = preset === key;
        return (
          <button
            key={key}
            onClick={() => onPreset(key)}
            style={{
              ...btnBase,
              fontWeight: active ? 700 : 500,
              background: active
                ? "color-mix(in srgb, var(--db-accent) 12%, transparent)"
                : "var(--db-bg-elevated)",
              borderColor: active ? "var(--db-accent)" : "var(--db-border)",
              color: active ? "var(--db-accent)" : "var(--db-text-secondary)",
            }}
          >
            {label}
          </button>
        );
      })}
      {preset === "custom" && (
        <>
          <label style={{ fontSize: "12px", color: "var(--db-text-secondary)" }}>{t("salesRangeFrom")}</label>
          <input type="date" value={customStart} onChange={(e) => onCustomStart(e.target.value)} style={inputStyle} />
          <label style={{ fontSize: "12px", color: "var(--db-text-secondary)" }}>{t("salesRangeTo")}</label>
          <input type="date" value={customEnd} onChange={(e) => onCustomEnd(e.target.value)} style={inputStyle} />
        </>
      )}
    </div>
  );
}

// ── Summary tile ──────────────────────────────────────────────────────────────

function SummaryTile({
  icon,
  label,
  value,
  hint,
  accent,
  unitsLabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
  /** Token used for the figure; the tile chrome stays neutral. */
  accent: string;
  unitsLabel: string;
}) {
  return (
    <div
      style={{
        flex: "1 1 220px",
        padding: "16px",
        borderRadius: "var(--db-radius-card)",
        border: "1px solid var(--db-border)",
        background: "var(--db-bg-elevated)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
        {icon}
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--db-text-tertiary)",
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ fontSize: "26px", fontWeight: 700, color: accent, lineHeight: 1.1 }}>
        {value}
        <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--db-text-tertiary)", marginLeft: "6px" }}>
          {unitsLabel}
        </span>
      </div>
      <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", margin: "6px 0 0" }}>{hint}</p>
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

const GRID_COLUMNS = "minmax(140px, 2fr) repeat(5, minmax(64px, 1fr))";

function TableHeader({ t }: { t: ReturnType<typeof useTranslations> }) {
  const cols = [
    t("invReportColProduct"),
    t("invReportColSold"),
    t("invReportColReceived"),
    t("invReportColWaste"),
    t("invReportColShortage"),
    t("invReportColStock"),
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: GRID_COLUMNS,
        gap: "12px",
        padding: "8px 16px",
        fontSize: "11px",
        fontWeight: 700,
        color: "var(--db-text-tertiary)",
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        borderBottom: "1px solid var(--db-border)",
      }}
    >
      {cols.map((c, i) => (
        <span key={c} style={{ textAlign: i === 0 ? "left" : "right" }}>
          {c}
        </span>
      ))}
    </div>
  );
}

function ReportRowView({ row }: { row: ReportRow }) {
  // Shortage is the count adjustment: negative = stock went missing.
  const isShort = row.count_adj < 0;
  const cellStyle: React.CSSProperties = {
    textAlign: "right",
    fontSize: "13px",
    color: "var(--db-text-primary)",
    fontVariantNumeric: "tabular-nums",
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: GRID_COLUMNS,
        gap: "12px",
        padding: "10px 16px",
        alignItems: "center",
        borderBottom: "1px solid var(--db-border)",
      }}
    >
      <span
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "var(--db-text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={row.item_name}
      >
        {row.item_name}
      </span>
      <span style={cellStyle}>{row.sold}</span>
      <span style={cellStyle}>{row.received}</span>
      <span style={{ ...cellStyle, color: row.waste > 0 ? "var(--db-warning)" : "var(--db-text-primary)" }}>
        {row.waste}
      </span>
      <span
        style={{
          ...cellStyle,
          color: isShort ? "var(--db-danger)" : "var(--db-text-primary)",
          fontWeight: isShort ? 700 : 400,
        }}
      >
        {row.count_adj}
      </span>
      <span style={cellStyle}>{row.stock_now}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InventoryReportPage() {
  const t = useTranslations("dashboardCommon");

  const [preset, setPreset]           = useState<RangePreset>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd]     = useState("");

  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(false);
  const [forbidden, setForbidden]     = useState(false);
  const [noBusiness, setNoBusiness]   = useState(false);
  const [rows, setRows]               = useState<ReportRow[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    let active = true;

    void (async () => {
      try {
        setLoading(true);
        setError(false);
        setForbidden(false);

        const res = await resolveActiveBusiness();
        if (!active) return;
        if (!res.ok) { setNoBusiness(true); setLoading(false); return; }

        const { start, end } = getRange(preset, customStart, customEnd);
        const { data, error: rpcErr } = await supabase.rpc("inventory_report", {
          p_business_id: res.business.id,
          p_from: start.toISOString(),
          p_to: end.toISOString(),
        });
        if (!active) return;

        if (rpcErr) {
          // The gate is a distinct, explainable state — not a generic failure.
          if (isForbidden(rpcErr)) setForbidden(true);
          else setError(true);
          setRows([]);
          return;
        }
        setRows((data ?? []) as ReportRow[]);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [preset, customStart, customEnd]);

  // Business-wide totals for the period.
  const totalWaste = rows.reduce((sum, r) => sum + r.waste, 0);
  // Only negative adjustments count as shortage; positive counts are surplus
  // and would otherwise mask real losses.
  const totalShortage = rows.reduce((sum, r) => sum + Math.min(r.count_adj, 0), 0);
  // The RPC returns a row per TRACKED product even when nothing moved, so an
  // all-zero result is "no activity", not "no products". Both deserve the
  // friendly notice; only the first hides the table.
  const hasMovement = rows.some(
    (r) => r.sold !== 0 || r.received !== 0 || r.waste !== 0 || r.count_adj !== 0 || r.voided !== 0
  );

  if (noBusiness) {
    return <div><NoBusinessCTA /></div>;
  }

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
          {t("invReportTitle")}
        </h1>
        <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "4px 0 0" }}>
          {t("invReportSubtitle")}
        </p>
      </div>

      <DateRangePicker
        preset={preset}
        customStart={customStart}
        customEnd={customEnd}
        onPreset={setPreset}
        onCustomStart={setCustomStart}
        onCustomEnd={setCustomEnd}
        t={t}
      />

      {loading && (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "13px" }}>
          {t("invReportLoading")}
        </div>
      )}

      {!loading && forbidden && (
        <div style={{ padding: "48px 24px", textAlign: "center" }}>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--db-text-primary)", margin: 0 }}>
            {t("invReportForbidden")}
          </p>
          <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "6px 0 0" }}>
            {t("invReportForbiddenHint")}
          </p>
        </div>
      )}

      {!loading && !forbidden && error && (
        <div style={{ padding: "24px", textAlign: "center", color: "var(--db-danger)", fontSize: "13px" }}>
          {t("invReportError")}
        </div>
      )}

      {!loading && !forbidden && !error && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
            <SummaryTile
              icon={<IconTrash size={15} color="var(--db-warning)" />}
              label={t("invReportTotalWaste")}
              value={totalWaste}
              hint={t("invReportTotalWasteHint")}
              accent={totalWaste > 0 ? "var(--db-warning)" : "var(--db-text-primary)"}
              unitsLabel={t("invReportUnits")}
            />
            <SummaryTile
              icon={<IconAlertTriangle size={15} color="var(--db-danger)" />}
              label={t("invReportTotalShortage")}
              value={totalShortage}
              hint={t("invReportTotalShortageHint")}
              accent={totalShortage < 0 ? "var(--db-danger)" : "var(--db-text-primary)"}
              unitsLabel={t("invReportUnits")}
            />
          </div>

          {!hasMovement && (
            <div style={{ padding: rows.length === 0 ? "48px 24px" : "24px", textAlign: "center" }}>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--db-text-primary)", margin: 0 }}>
                {t("invReportEmpty")}
              </p>
              <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "6px 0 0", maxWidth: "420px", marginInline: "auto" }}>
                {t("invReportEmptyHint")}
              </p>
            </div>
          )}

          {rows.length > 0 && (
            <div
              style={{
                border: "1px solid var(--db-border)",
                borderRadius: "var(--db-radius-card)",
                overflowX: "auto",
              }}
            >
              <div style={{ minWidth: "560px" }}>
                <TableHeader t={t} />
                {rows.map((row) => (
                  <ReportRowView key={row.menu_item_id} row={row} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
