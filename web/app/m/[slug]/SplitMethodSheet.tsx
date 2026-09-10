"use client";

/**
 * SplitMethodSheet — Tab POS F5
 *
 * Permite al cliente elegir cómo pagar:
 *   full   — Todo el pendiente
 *   even   — Partes iguales (stepper; o lista si ya hay plan)
 *   items  — Por artículo (checklist; oculto si paid_unallocated_cents > 0)
 *   amount — Monto libre (input)
 *
 * Propina: 0 / 15 / 18 / 20 % / otra (máx. base).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { TabSummary } from "./TabBalanceFab";

type SplitKind = "full" | "even" | "items" | "amount";

interface SplitMethodSheetProps {
  summary:       TabSummary;
  palette:       Record<string, string>;
  locale:        string;
  onConfirm: (params: {
    split_kind:     SplitKind;
    ways?:          number;
    payment_id?:    string;    // existing even share to claim
    order_item_ids?: string[];
    amount_cents?:  number;
    tip_cents:      number;
  }) => void;
  onClose: () => void;
}

function fmtCents(cents: number, locale: string): string {
  return (cents / 100).toLocaleString(locale, { style: "currency", currency: "USD" });
}

const TIP_OPTIONS = [0, 15, 18, 20] as const;

export default function SplitMethodSheet({
  summary,
  palette,
  locale,
  onConfirm,
  onClose,
}: SplitMethodSheetProps) {
  const t      = useTranslations();
  const accent = palette.accent ?? "#5C7CFA";
  const { balance, items, even_plan } = summary;
  const due = balance.due_cents;

  const [kind, setKind]               = useState<SplitKind>("full");
  const [ways, setWays]               = useState(2);
  const [selectedShare, setSelectedShare] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [amountInput, setAmountInput] = useState("");
  const [tipPct, setTipPct]           = useState<number | "custom">(0);
  const [customTipInput, setCustomTipInput] = useState("");

  const hasUnallocated = balance.paid_unallocated_cents > 0;
  const unpaidItems = (items as TabSummary["items"]).filter(it => !it.paid && !it.reserved);

  // Compute base for tip calculation
  let base = 0;
  if (kind === "full")   base = due;
  else if (kind === "even") {
    if (selectedShare && even_plan) {
      const row = even_plan.find(r => r.payment_id === selectedShare);
      base = row?.amount_cents ?? Math.floor(due / ways);
    } else {
      base = due > 0 ? Math.floor(due / ways) : 0;
    }
  } else if (kind === "items") {
    const unpaidMap = new Map((items as TabSummary["items"]).map(it => [it.order_item_id, it.line_cents]));
    base = Array.from(selectedItems).reduce((s, id) => s + (unpaidMap.get(id) ?? 0), 0);
  } else if (kind === "amount") {
    base = Math.round(parseFloat(amountInput || "0") * 100) || 0;
  }

  const tipCents = tipPct === "custom"
    ? Math.max(0, Math.min(Math.round(parseFloat(customTipInput || "0") * 100), base))
    : Math.round(base * (tipPct as number) / 100);
  const total = base + tipCents;

  function handleConfirm() {
    const params: Parameters<typeof onConfirm>[0] = { split_kind: kind, tip_cents: tipCents };
    if (kind === "even") {
      if (selectedShare) params.payment_id = selectedShare;
      else params.ways = ways;
    } else if (kind === "items") {
      params.order_item_ids = Array.from(selectedItems);
    } else if (kind === "amount") {
      params.amount_cents = base;
    }
    onConfirm(params);
  }

  const canConfirm = (() => {
    if (base < 50) return false;
    if (kind === "items" && selectedItems.size === 0) return false;
    if (kind === "even" && even_plan && !selectedShare) return false;
    if (kind === "amount" && (base < 50 || base > due)) return false;
    return true;
  })();

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 210 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--menu-bg,#fff)", borderRadius: "16px 16px 0 0", padding: "20px 20px 44px", width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{t("split.title")}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--menu-text,#111)" }}>×</button>
        </div>

        {/* Method cards */}
        {(["full", "even", "items", "amount"] as SplitKind[]).map(k => {
          if (k === "items" && hasUnallocated) return null;
          return (
            <button
              key={k}
              onClick={() => setKind(k)}
              style={{
                width: "100%", textAlign: "left", padding: "12px 14px", marginBottom: 8,
                background: kind === k ? `${accent}15` : "var(--menu-surface,#f9fafb)",
                border: `2px solid ${kind === k ? accent : "transparent"}`,
                borderRadius: 10, cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, color: kind === k ? accent : "var(--menu-text,#111)" }}>
                {t(`split.kind.${k}`)}
              </div>
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                {t(`split.kindDesc.${k}`, { amount: fmtCents(due, locale) })}
              </div>
            </button>
          );
        })}

        {hasUnallocated && (
          <p style={{ fontSize: 12, opacity: 0.6, margin: "4px 0 12px", textAlign: "center" }}>
            {t("split.itemsUnavailable")}
          </p>
        )}

        {/* Even: stepper or plan list */}
        {kind === "even" && (
          <div style={{ marginBottom: 16 }}>
            {even_plan && even_plan.length > 0 ? (
              <div>
                <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 8 }}>{t("split.choosePart")}</div>
                {even_plan.map(row => (
                  <button
                    key={row.payment_id}
                    onClick={() => row.claimable && setSelectedShare(row.payment_id)}
                    disabled={!row.claimable}
                    style={{
                      width: "100%", textAlign: "left", padding: "10px 14px", marginBottom: 6,
                      background: selectedShare === row.payment_id ? `${accent}15` : "var(--menu-surface,#f9fafb)",
                      border: `2px solid ${selectedShare === row.payment_id ? accent : "transparent"}`,
                      borderRadius: 10, cursor: row.claimable ? "pointer" : "not-allowed", opacity: row.claimable ? 1 : 0.5,
                      display: "flex", justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{fmtCents(row.amount_cents, locale)}</span>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>
                      {row.status === "succeeded" ? t("split.partPaid") : row.claimable ? t("split.partFree") : t("split.partReserved")}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                <span style={{ fontSize: 14, opacity: 0.7 }}>{t("split.ways")}</span>
                <button onClick={() => setWays(w => Math.max(2, w - 1))} style={{ width: 32, height: 32, borderRadius: 16, border: "1px solid var(--menu-surface,#e5e7eb)", background: "var(--menu-surface,#f3f4f6)", cursor: "pointer", fontSize: 18, fontWeight: 700 }}>−</button>
                <span style={{ fontWeight: 700, fontSize: 18, minWidth: 24, textAlign: "center" }}>{ways}</span>
                <button onClick={() => setWays(w => Math.min(20, w + 1))} style={{ width: 32, height: 32, borderRadius: 16, border: "1px solid var(--menu-surface,#e5e7eb)", background: "var(--menu-surface,#f3f4f6)", cursor: "pointer", fontSize: 18, fontWeight: 700 }}>+</button>
                <span style={{ fontSize: 13, opacity: 0.6 }}>{t("split.perPerson", { amount: fmtCents(Math.floor(due / ways), locale) })}</span>
              </div>
            )}
          </div>
        )}

        {/* Items: checklist */}
        {kind === "items" && (
          <div style={{ marginBottom: 16 }}>
            {unpaidItems.length === 0 ? (
              <p style={{ opacity: 0.5, fontSize: 13, textAlign: "center" }}>{t("split.noItemsAvailable")}</p>
            ) : (
              unpaidItems.map(it => (
                <label
                  key={it.order_item_id}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={selectedItems.has(it.order_item_id)}
                    onChange={e => {
                      const s = new Set(selectedItems);
                      e.target.checked ? s.add(it.order_item_id) : s.delete(it.order_item_id);
                      setSelectedItems(s);
                    }}
                    style={{ width: 18, height: 18 }}
                  />
                  <span style={{ flex: 1, fontSize: 14 }}>{it.qty}× {it.name}</span>
                  <span style={{ fontSize: 14, opacity: 0.7 }}>{fmtCents(it.line_cents, locale)}</span>
                </label>
              ))
            )}
          </div>
        )}

        {/* Amount: input */}
        {kind === "amount" && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
              {t("split.amountHint", { max: fmtCents(due, locale) })}
            </div>
            <input
              type="number"
              min="0.50"
              step="0.01"
              max={(due / 100).toFixed(2)}
              value={amountInput}
              onChange={e => setAmountInput(e.target.value)}
              placeholder="0.00"
              style={{
                width: "100%", padding: "10px 14px", fontSize: 18, fontWeight: 700,
                border: "2px solid var(--menu-surface,#e5e7eb)", borderRadius: 10,
                background: "var(--menu-surface,#f9fafb)", color: "var(--menu-text,#111)",
                boxSizing: "border-box",
              }}
            />
          </div>
        )}

        {/* Tip selector */}
        {base >= 50 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 8 }}>{t("split.tipLabel")}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TIP_OPTIONS.map(pct => (
                <button
                  key={pct}
                  onClick={() => setTipPct(pct)}
                  style={{
                    padding: "8px 14px", borderRadius: 20,
                    border: `2px solid ${tipPct === pct ? accent : "transparent"}`,
                    background: tipPct === pct ? `${accent}15` : "var(--menu-surface,#f3f4f6)",
                    color: tipPct === pct ? accent : "var(--menu-text,#111)",
                    fontWeight: 600, fontSize: 14, cursor: "pointer",
                  }}
                >
                  {pct === 0 ? t("split.tipNone") : `${pct}%`}
                </button>
              ))}
              <button
                onClick={() => setTipPct("custom")}
                style={{
                  padding: "8px 14px", borderRadius: 20,
                  border: `2px solid ${tipPct === "custom" ? accent : "transparent"}`,
                  background: tipPct === "custom" ? `${accent}15` : "var(--menu-surface,#f3f4f6)",
                  color: tipPct === "custom" ? accent : "var(--menu-text,#111)",
                  fontWeight: 600, fontSize: 14, cursor: "pointer",
                }}
              >
                {t("split.tipCustom")}
              </button>
            </div>
            {tipPct === "custom" && (
              <input
                type="number" min="0" step="0.01"
                value={customTipInput}
                onChange={e => setCustomTipInput(e.target.value)}
                placeholder="0.00"
                style={{
                  marginTop: 8, width: "100%", padding: "10px 14px",
                  border: "2px solid var(--menu-surface,#e5e7eb)", borderRadius: 10,
                  background: "var(--menu-surface,#f9fafb)", color: "var(--menu-text,#111)",
                  fontSize: 16, boxSizing: "border-box",
                }}
              />
            )}
          </div>
        )}

        {/* Summary + confirm */}
        {base > 0 && (
          <div style={{ marginBottom: 16, fontSize: 14, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ opacity: 0.7 }}>{t("split.baseAmount")}</span>
              <span>{fmtCents(base, locale)}</span>
            </div>
            {tipCents > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ opacity: 0.7 }}>{t("split.tip")}</span>
                <span>{fmtCents(tipCents, locale)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginTop: 4, paddingTop: 4, borderTop: "1px solid var(--menu-surface,#e5e7eb)" }}>
              <span>{t("split.total")}</span>
              <span>{fmtCents(total, locale)}</span>
            </div>
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={!canConfirm}
          style={{
            width: "100%", padding: "14px 0",
            background: accent, color: "#fff",
            border: "none", borderRadius: 12,
            fontSize: 16, fontWeight: 700,
            cursor: canConfirm ? "pointer" : "not-allowed",
            opacity: canConfirm ? 1 : 0.5,
          }}
        >
          {t("split.confirm", { total: fmtCents(total, locale) })}
        </button>
      </div>
    </div>
  );
}
