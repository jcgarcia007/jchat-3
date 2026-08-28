/**
 * JChat 3.0 — Dashboard: Today's Receipts (Fase 4B)
 *
 * Owner view of today's succeeded payments for the active business.
 * Shows: time · table · employee (paid_by) · base · tip · digital link.
 *
 * Digital receipt link: https://jchat.cloud/r/<receipt_code>
 * No thermal reprint from web — native POS only (spec explicit).
 *
 * Tokens: var(--db-*) only — NO hardcoded hex.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  IconReceipt2,
  IconLoader2,
  IconAlertCircle,
  IconExternalLink,
  IconRefresh,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { formatCents } from "@/lib/currency";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReceiptRow {
  id: string;
  receipt_code: string | null;
  table_label: string | null;
  amount_cents: number;
  tip_cents: number;
  status: string;
  paid_by: string | null;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function receiptUrl(code: string): string {
  return `https://jchat.cloud/r/${code}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReceiptsPage() {
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [rows, setRows]             = useState<ReceiptRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // Resolve active business on mount.
  useEffect(() => {
    resolveActiveBusiness()
      .then((res) => setBusinessId(res.ok ? res.business.id : null))
      .catch(() => setBusinessId(null));
  }, []);

  const load = useCallback(async () => {
    if (!businessId || !isSupabaseConfigured) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Cast through unknown: pos_receipts_today not in generated DB types yet.
    const rpc = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;

    const { data, error: rpcErr } = await rpc("pos_receipts_today", {
      p_business_id: businessId,
    });

    setLoading(false);
    if (rpcErr) {
      setError("No se pudieron cargar los recibos.");
      return;
    }
    setRows(((data ?? []) as unknown) as ReceiptRow[]);
  }, [businessId]);

  useEffect(() => {
    if (businessId !== null) load();
  }, [businessId, load]);

  // ── Computed ───────────────────────────────────────────────────────────────

  const totalBase = rows.reduce((s, r) => s + r.amount_cents, 0);
  const totalTip  = rows.reduce((s, r) => s + r.tip_cents, 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.pageHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <IconReceipt2 size={22} style={{ color: "var(--db-accent)" }} />
          <h1 style={S.pageTitle}>Recibos de hoy</h1>
        </div>
        <button
          style={S.refreshBtn}
          onClick={load}
          disabled={loading}
          aria-label="Refrescar"
        >
          <IconRefresh
            size={16}
            style={{ animation: loading ? "spin 1s linear infinite" : "none" }}
          />
          Refrescar
        </button>
      </div>

      {/* Totals summary */}
      {rows.length > 0 && (
        <div style={S.summaryRow}>
          <div style={S.summaryCard}>
            <span style={S.summaryLabel}>Cobros</span>
            <span style={S.summaryValue}>{rows.length}</span>
          </div>
          <div style={S.summaryCard}>
            <span style={S.summaryLabel}>Base</span>
            <span style={S.summaryValue}>{formatCents(totalBase)}</span>
          </div>
          <div style={S.summaryCard}>
            <span style={S.summaryLabel}>Propinas</span>
            <span style={S.summaryValue}>{formatCents(totalTip)}</span>
          </div>
          <div style={S.summaryCard}>
            <span style={S.summaryLabel}>Total</span>
            <span style={{ ...S.summaryValue, color: "var(--db-accent)" }}>
              {formatCents(totalBase + totalTip)}
            </span>
          </div>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div style={S.centered}>
          <IconLoader2 size={28} style={{ color: "var(--db-accent)", animation: "spin 1s linear infinite" }} />
          <span style={S.hint}>Cargando recibos…</span>
        </div>
      ) : error ? (
        <div style={S.centered}>
          <IconAlertCircle size={28} style={{ color: "var(--db-danger, #ef4444)" }} />
          <span style={S.hint}>{error}</span>
        </div>
      ) : rows.length === 0 ? (
        <div style={S.centered}>
          <IconReceipt2 size={40} style={{ color: "var(--db-text-muted, #9ca3af)" }} />
          <span style={S.emptyTitle}>Sin recibos hoy</span>
          <span style={S.hint}>Los cobros completados aparecerán aquí.</span>
        </div>
      ) : (
        <div style={S.tableWrapper}>
          <table style={S.table}>
            <thead>
              <tr>
                {["Hora", "Mesa", "Empleado", "Base", "Propina", "Recibo"].map((h) => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} style={S.tr}>
                  <td style={S.td}>{formatTime(row.created_at)}</td>
                  <td style={S.td}>{row.table_label ?? "—"}</td>
                  <td style={{ ...S.td, fontFamily: "monospace", fontSize: "12px", color: "var(--db-text-secondary)" }}>
                    {row.paid_by ? row.paid_by.slice(0, 8) + "…" : "—"}
                  </td>
                  <td style={S.tdNum}>{formatCents(row.amount_cents)}</td>
                  <td style={{ ...S.tdNum, color: "var(--db-text-secondary)" }}>
                    {row.tip_cents > 0 ? `+${formatCents(row.tip_cents)}` : "—"}
                  </td>
                  <td style={S.tdCenter}>
                    {row.receipt_code ? (
                      <a
                        href={receiptUrl(row.receipt_code)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={S.receiptLink}
                        title={row.receipt_code}
                      >
                        <IconExternalLink size={14} />
                        Ver
                      </a>
                    ) : (
                      <span style={{ color: "var(--db-text-muted, #9ca3af)", fontSize: "12px" }}>
                        Sin código
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Inline styles (var(--db-*) tokens only — NO hex) ────────────────────────

const S: Record<string, React.CSSProperties> = {
  page: {
    padding: "24px",
    maxWidth: "960px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  pageHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pageTitle: {
    margin: 0,
    fontSize: "20px",
    fontWeight: 600,
    color: "var(--db-text-primary)",
  },
  refreshBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "7px 14px",
    borderRadius: "var(--db-radius, 8px)",
    border: "1px solid var(--db-border)",
    background: "var(--db-bg-elevated)",
    color: "var(--db-text-secondary)",
    fontSize: "13px",
    cursor: "pointer",
  },
  summaryRow: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  },
  summaryCard: {
    flex: "1 1 120px" as unknown as number,
    borderRadius: "var(--db-radius, 8px)",
    border: "1px solid var(--db-border)",
    background: "var(--db-bg-elevated)",
    padding: "14px 18px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  summaryLabel: {
    fontSize: "12px",
    color: "var(--db-text-secondary)",
    fontWeight: 500,
  },
  summaryValue: {
    fontSize: "18px",
    fontWeight: 700,
    color: "var(--db-text-primary)",
  },
  centered: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 24px",
    gap: "10px",
    borderRadius: "var(--db-radius, 8px)",
    border: "1px solid var(--db-border)",
    background: "var(--db-bg-elevated)",
  },
  emptyTitle: {
    fontSize: "16px",
    fontWeight: 600,
    color: "var(--db-text-primary)",
  },
  hint: {
    fontSize: "14px",
    color: "var(--db-text-secondary)",
  },
  tableWrapper: {
    overflowX: "auto",
    borderRadius: "var(--db-radius, 8px)",
    border: "1px solid var(--db-border)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    background: "var(--db-bg-elevated)",
  },
  th: {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--db-text-secondary)",
    borderBottom: "1px solid var(--db-border)",
    whiteSpace: "nowrap",
  },
  tr: {
    borderBottom: "1px solid var(--db-border)",
  },
  td: {
    padding: "11px 14px",
    fontSize: "14px",
    color: "var(--db-text-primary)",
  },
  tdNum: {
    padding: "11px 14px",
    fontSize: "14px",
    color: "var(--db-text-primary)",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  tdCenter: {
    padding: "11px 14px",
    textAlign: "center",
  },
  receiptLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "13px",
    color: "var(--db-accent)",
    textDecoration: "none",
    fontWeight: 500,
  },
};
