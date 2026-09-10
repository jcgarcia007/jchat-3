"use client";

/**
 * TabPaymentReceipt — Tab POS F5
 *
 * Muestra el comprobante tras confirmar un pago QR:
 * importe base + propina, tarjeta ••••last4, receipt_code,
 * y "Pendiente de la mesa: $X" o "¡Cuenta cerrada!"
 */

import { useTranslations } from "next-intl";

interface TabPaymentReceiptProps {
  baseCents:       number;
  tipCents:        number;
  cardBrand?:      string | null;
  cardLast4?:      string | null;
  receiptCode?:    string | null;
  remainingDue:    number;
  tabClosed:       boolean;
  locale:          string;
  palette:         Record<string, string>;
  onClose:         () => void;
  onKeepOrdering:  () => void;
}

function fmtCents(cents: number, locale: string): string {
  return (cents / 100).toLocaleString(locale, { style: "currency", currency: "USD" });
}

export default function TabPaymentReceipt({
  baseCents,
  tipCents,
  cardBrand,
  cardLast4,
  receiptCode,
  remainingDue,
  tabClosed,
  locale,
  palette,
  onClose,
  onKeepOrdering,
}: TabPaymentReceiptProps) {
  const t      = useTranslations();
  const accent = palette.accent ?? "#5C7CFA";
  const total  = baseCents + tipCents;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 220,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--menu-bg,#fff)", borderRadius: "16px 16px 0 0",
          padding: "28px 20px 48px", width: "100%", maxWidth: 480,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Icon + title */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48 }}>✅</div>
          <h2 style={{ margin: "8px 0 4px", fontSize: 20, fontWeight: 800 }}>
            {t("tabReceipt.title")}
          </h2>
          <p style={{ margin: 0, fontSize: 14, opacity: 0.6 }}>
            {t("tabReceipt.subtitle")}
          </p>
        </div>

        {/* Amounts */}
        <div style={{
          background: "var(--menu-surface,#f9fafb)", borderRadius: 12,
          padding: "16px 18px", marginBottom: 16, fontSize: 14,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ opacity: 0.7 }}>{t("tabReceipt.amount")}</span>
            <span>{fmtCents(baseCents, locale)}</span>
          </div>
          {tipCents > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ opacity: 0.7 }}>{t("tabReceipt.tip")}</span>
              <span>{fmtCents(tipCents, locale)}</span>
            </div>
          )}
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontWeight: 800, fontSize: 18,
            paddingTop: 8, borderTop: "1px solid var(--menu-surface,#e5e7eb)",
          }}>
            <span>{t("tabReceipt.total")}</span>
            <span>{fmtCents(total, locale)}</span>
          </div>
        </div>

        {/* Card info */}
        {cardLast4 && (
          <div style={{ textAlign: "center", fontSize: 13, opacity: 0.7, marginBottom: 10 }}>
            {cardBrand ? `${cardBrand.charAt(0).toUpperCase()}${cardBrand.slice(1)} ` : ""}
            •••• {cardLast4}
          </div>
        )}

        {/* Receipt code */}
        {receiptCode && (
          <div style={{
            textAlign: "center", fontSize: 12, opacity: 0.5,
            fontFamily: "monospace", marginBottom: 16, letterSpacing: "0.05em",
          }}>
            {receiptCode.slice(0, 8).toUpperCase()}
          </div>
        )}

        {/* Remaining / closed */}
        <div style={{
          textAlign: "center", padding: "12px 16px", borderRadius: 10,
          background: tabClosed ? "#16a34a15" : "var(--menu-surface,#f3f4f6)",
          marginBottom: 20,
        }}>
          {tabClosed ? (
            <span style={{ color: "#16a34a", fontWeight: 700, fontSize: 15 }}>
              🎉 {t("tabReceipt.closed")}
            </span>
          ) : (
            <span style={{ opacity: 0.8, fontSize: 14 }}>
              {t("tabReceipt.remaining", { amount: fmtCents(remainingDue, locale) })}
            </span>
          )}
        </div>

        {/* Actions */}
        <button
          onClick={onKeepOrdering}
          style={{
            width: "100%", padding: "13px 0",
            background: accent, color: "#fff",
            border: "none", borderRadius: 12,
            fontSize: 15, fontWeight: 700, cursor: "pointer",
            marginBottom: 10,
          }}
        >
          {t("tabReceipt.keepOrdering")}
        </button>
        <button
          onClick={onClose}
          style={{
            width: "100%", padding: "11px 0",
            background: "none", color: "var(--menu-text,#111)",
            border: "1px solid var(--menu-surface,#e5e7eb)", borderRadius: 12,
            fontSize: 14, cursor: "pointer",
          }}
        >
          {t("tabReceipt.close")}
        </button>
      </div>
    </div>
  );
}
