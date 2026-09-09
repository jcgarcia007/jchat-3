"use client";

/**
 * TabOrderConfirmation — Tab POS F3
 * Pantalla de confirmación tras agregar una orden a la cuenta de la mesa.
 */

import { useTranslations } from "next-intl";

interface TabOrderConfirmationProps {
  tableLabel:     string;
  subtotalCents:  number;
  items:          Array<{ name: string; qty: number }>;
  locale:         string;
  palette:        Record<string, string>;
  /** "added" = normal F3 flow; "awaiting" = sin código, espera aprobación del mesero (F4) */
  variant?:       "added" | "awaiting";
  onViewStatus:   () => void;
  onKeepOrdering: () => void;
}

function fmtCents(cents: number, locale: string): string {
  return (cents / 100).toLocaleString(locale, { style: "currency", currency: "USD" });
}

export default function TabOrderConfirmation({
  tableLabel, subtotalCents, items, locale, palette, variant = "added", onViewStatus, onKeepOrdering,
}: TabOrderConfirmationProps) {
  const t        = useTranslations();
  const accent   = palette.accent ?? "#5C7CFA";
  const isAwaiting = variant === "awaiting";

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200,
      }}
    >
      <div
        style={{
          background: "var(--menu-bg, #fff)", borderRadius: "16px 16px 0 0",
          padding: "24px 20px 40px", width: "100%", maxWidth: 480,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 36 }}>{isAwaiting ? "⏳" : "✅"}</div>
          <h2 style={{ margin: "8px 0 4px", fontSize: 18, fontWeight: 700 }}>
            {isAwaiting ? t("tabOrderAwaitingTitle") : t("tabOrderAddedTitle")}
          </h2>
          <p style={{ margin: 0, fontSize: 14, opacity: 0.6 }}>
            {isAwaiting
              ? t("tabOrderAwaitingSubtitle", { label: tableLabel })
              : t("tabOrderAddedSubtitle", { label: tableLabel })}
          </p>
        </div>

        {/* Lista de ítems (sin precios de línea) */}
        <div style={{ marginBottom: 16, maxHeight: 180, overflowY: "auto" }}>
          {items.map((row, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 14 }}>
              <span>{row.name}</span>
              <span style={{ opacity: 0.5 }}>×{row.qty}</span>
            </div>
          ))}
        </div>

        {/* Total del servidor */}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginBottom: 20, fontSize: 15 }}>
          <span>Total</span>
          <span>{fmtCents(subtotalCents, locale)}</span>
        </div>

        <button
          onClick={onViewStatus}
          style={{
            width: "100%", padding: "13px 0", marginBottom: 10,
            background: "var(--menu-surface, #f3f4f6)", color: "var(--menu-text, #111)",
            border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer",
          }}
        >
          {t("tabOrderViewStatus")}
        </button>

        <button
          onClick={onKeepOrdering}
          style={{
            width: "100%", padding: "13px 0",
            background: accent, color: "#fff",
            border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer",
          }}
        >
          {t("tabOrderKeepOrdering")}
        </button>
      </div>
    </div>
  );
}
