"use client";

/**
 * TabBalanceSheet — Tab POS F5
 *
 * Bottom sheet con el detalle de la cuenta: ítems (pagado / reservado / mío),
 * totales, historial de pagos y botón Pagar (solo mode=stripe).
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { TabSummary } from "./TabBalanceFab";
import { guestTab } from "@/lib/guestTabSession";

interface TabBalanceSheetProps {
  summary:        TabSummary;
  sessionToken:   string;
  guestSessionId?: string;
  palette:        Record<string, string>;
  locale:         string;
  onPay:          () => void;
  onClose:        () => void;
}

function fmtCents(cents: number, locale: string): string {
  return (cents / 100).toLocaleString(locale, { style: "currency", currency: "USD" });
}

export default function TabBalanceSheet({
  summary,
  sessionToken,
  guestSessionId,
  palette,
  locale,
  onPay,
  onClose,
}: TabBalanceSheetProps) {
  const t      = useTranslations();
  const accent = palette.accent ?? "#5C7CFA";

  // Robustez: re-consultar el resumen al montar para asegurarnos de que
  // nunca mostramos datos anteriores al último pago, independientemente de
  // quién abrió la hoja o cómo llegó el summary prop.
  const [liveSummary, setLiveSummary] = useState<TabSummary>(summary);

  useEffect(() => {
    if (!sessionToken) return;
    void (async () => {
      try {
        const fresh = await guestTab.summary(sessionToken);
        setLiveSummary(fresh);
      } catch {
        // Sin red — mantener el summary prop que ya tenemos.
      }
    })();
  // Ejecutar solo al montar (sessionToken no cambia mientras la hoja está abierta).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { balance, items, payments, can_pay } = liveSummary;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--menu-bg, #fff)", borderRadius: "16px 16px 0 0",
          padding: "20px 20px 44px", width: "100%", maxWidth: 480,
          maxHeight: "80vh", overflowY: "auto",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{t("tabBalance.title")}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--menu-text,#111)" }}>×</button>
        </div>

        {/* Items */}
        <div style={{ marginBottom: 12 }}>
          {(items as TabSummary["items"]).map(it => {
            const isMine = it.guest_session_id === guestSessionId;
            return (
              <div key={it.order_item_id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "6px 0", fontSize: 14,
                opacity: it.paid ? 0.5 : 1,
                borderBottom: "1px solid var(--menu-surface,#f3f4f6)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span>{it.qty}× {it.name}</span>
                  {it.paid && (
                    <span style={{ fontSize: 11, background: "#16a34a22", color: "#16a34a", borderRadius: 6, padding: "1px 6px" }}>
                      {t("tabBalance.paid")}
                    </span>
                  )}
                  {!it.paid && it.reserved && (
                    <span style={{ fontSize: 11, background: "#f59e0b22", color: "#92400e", borderRadius: 6, padding: "1px 6px" }}>
                      {t("tabBalance.reserved")}
                    </span>
                  )}
                  {!it.paid && !it.reserved && isMine && (
                    <span style={{ fontSize: 11, background: `${accent}22`, color: accent, borderRadius: 6, padding: "1px 6px" }}>
                      {t("tabBalance.mine")}
                    </span>
                  )}
                </div>
                <span style={{ fontWeight: 500 }}>{fmtCents(it.line_cents, locale)}</span>
              </div>
            );
          })}
        </div>

        {/* Totals */}
        <div style={{
          background: "var(--menu-surface,#f9fafb)", borderRadius: 10,
          padding: "12px 14px", marginBottom: 16, fontSize: 14,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ opacity: 0.7 }}>{t("tabBalance.subtotal")}</span>
            <span>{fmtCents(balance.items_unpaid_cents + balance.paid_unallocated_cents, locale)}</span>
          </div>
          {balance.paid_unallocated_cents > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#16a34a" }}>
              <span>{t("tabBalance.paidByGuests")}</span>
              <span>−{fmtCents(balance.paid_unallocated_cents, locale)}</span>
            </div>
          )}
          {balance.guest_processing_cents > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, opacity: 0.6 }}>
              <span>{t("tabBalance.processing")}</span>
              <span>{fmtCents(balance.guest_processing_cents, locale)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--menu-surface,#e5e7eb)" }}>
            <span>{t("tabBalance.due")}</span>
            <span>{fmtCents(balance.due_cents, locale)}</span>
          </div>
        </div>

        {/* Payment history */}
        {(payments as TabSummary["payments"]).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.5, marginBottom: 6 }}>
              {t("tabBalance.paymentsReceived")}
            </div>
            {(payments as TabSummary["payments"]).map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
                <span style={{ opacity: 0.7 }}>
                  {p.source === "guest" ? t("tabBalance.paymentGuest") : t("tabBalance.paymentWaiter")}
                </span>
                <span>{fmtCents(p.amount_cents + (p.tip_cents ?? 0), locale)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Pay button */}
        {can_pay && balance.due_cents > 0 && (
          <button
            onClick={onPay}
            style={{
              width: "100%", padding: "14px 0",
              background: accent, color: "#fff",
              border: "none", borderRadius: 12,
              fontSize: 16, fontWeight: 700, cursor: "pointer",
            }}
          >
            {t("tabBalance.payButton", { amount: fmtCents(balance.due_cents, locale) })}
          </button>
        )}

        {!can_pay && (
          <p style={{ textAlign: "center", opacity: 0.5, fontSize: 13, marginTop: 8 }}>
            {t("tabBalance.externalInfo")}
          </p>
        )}
      </div>
    </div>
  );
}
