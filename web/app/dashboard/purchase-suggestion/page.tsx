/**
 * JChat 3.0 — Purchase Suggestion (Dashboard) · Fase B2
 *
 * Read-only purchase list driven by the `purchase_suggestion` RPC (migration 133).
 * Shows items whose stock_count ≤ low_stock_threshold and have a par_level set,
 * with the quantity needed to reach par and the estimated cost.
 *
 * No date range — this is CURRENT state, not a historical period.
 * Modeled after: web/app/dashboard/inventory-report/page.tsx (A3)
 * ZERO writes. Mobile: none. Public menu: none.
 */

"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { formatCents } from "@/lib/currency";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SuggestionRow {
  menu_item_id: string;
  item_name: string;
  stock_count: number;
  low_stock_threshold: number;
  par_level: number;
  suggested_qty: number;
  unit_cost_cents: number | null;
  suggested_cost_cents: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** True when the RPC refused the caller (owner / inventory_manage gate). */
function isForbidden(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42501" || (err.message ?? "").toLowerCase().includes("forbidden");
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PurchaseSuggestionPage() {
  const t      = useTranslations("dashboardCommon");
  const locale = useLocale();

  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [forbidden, setForbidden]   = useState(false);
  const [noBusiness, setNoBusiness] = useState(false);
  const [rows, setRows]             = useState<SuggestionRow[]>([]);

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

        const { data, error: rpcErr } = await supabase.rpc("purchase_suggestion", {
          p_business_id: res.business.id,
        });
        if (!active) return;

        if (rpcErr) {
          if (isForbidden(rpcErr)) setForbidden(true);
          else setError(true);
          setRows([]);
          return;
        }

        setRows((data ?? []) as SuggestionRow[]);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, []);

  // ── Derived values ───────────────────────────────────────────────────────────

  const totalCents = rows.reduce<number>((acc, r) => {
    return r.suggested_cost_cents != null ? acc + r.suggested_cost_cents : acc;
  }, 0);

  // Whether any row has a cost estimate
  const hasAnyCost = rows.some((r) => r.suggested_cost_cents != null);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (noBusiness) {
    return <div><NoBusinessCTA /></div>;
  }

  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--db-text-tertiary)",
    textAlign: "left",
    borderBottom: "1px solid var(--db-border)",
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: "13px",
    color: "var(--db-text-primary)",
    borderBottom: "1px solid var(--db-border)",
    verticalAlign: "middle",
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
          {t("purchaseTitle")}
        </h1>
        <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "4px 0 0" }}>
          {t("purchaseSubtitle")}
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "13px" }}>
          {t("purchaseLoading")}
        </div>
      )}

      {/* Forbidden */}
      {!loading && forbidden && (
        <div style={{ padding: "48px 24px", textAlign: "center" }}>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--db-text-primary)", margin: 0 }}>
            {t("purchaseForbidden")}
          </p>
          <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "6px 0 0" }}>
            {t("purchaseForbiddenHint")}
          </p>
        </div>
      )}

      {/* Generic error */}
      {!loading && !forbidden && error && (
        <div style={{ padding: "24px", textAlign: "center", color: "var(--db-danger)", fontSize: "13px" }}>
          {t("purchaseError")}
        </div>
      )}

      {/* Empty state */}
      {!loading && !forbidden && !error && rows.length === 0 && (
        <div
          style={{
            padding: "48px 24px",
            textAlign: "center",
            borderRadius: "var(--db-radius-card)",
            border: "1px solid var(--db-border)",
            background: "var(--db-bg-elevated)",
          }}
        >
          <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--db-text-primary)", margin: 0 }}>
            {t("purchaseEmpty")}
          </p>
          <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "6px 0 0", maxWidth: "400px", marginLeft: "auto", marginRight: "auto" }}>
            {t("purchaseEmptyHint")}
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !forbidden && !error && rows.length > 0 && (
        <>
          {/* Total estimate */}
          {hasAnyCost && (
            <div
              style={{
                marginBottom: "20px",
                padding: "14px 20px",
                borderRadius: "var(--db-radius-card)",
                border: "1px solid var(--db-border)",
                background: "var(--db-bg-elevated)",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <span style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>
                {t("purchaseTotalLabel")}
              </span>
              <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--db-text-primary)", fontVariantNumeric: "tabular-nums" }}>
                {formatCents(totalCents, locale)}
              </span>
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr>
                  <th style={thStyle}>{t("purchaseColProduct")}</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>{t("purchaseColStock")}</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>{t("purchaseColPar")}</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>{t("purchaseColSuggested")}</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>{t("purchaseColEstCost")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.menu_item_id}>
                    <td style={tdStyle}>{row.item_name}</td>
                    <td style={{ ...tdStyle, textAlign: "right", color: "var(--db-danger)", fontWeight: 600 }}>
                      {row.stock_count}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{row.par_level}</td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontWeight: 700,
                        color: "var(--db-accent)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      +{row.suggested_qty}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {row.suggested_cost_cents != null
                        ? formatCents(row.suggested_cost_cents, locale)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
