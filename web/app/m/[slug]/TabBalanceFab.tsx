"use client";

/**
 * TabBalanceFab — Tab POS F5
 *
 * Botón flotante "Cuenta · $pendiente" visible para clientes con sesión de
 * invitado válida. Hace polling a `summary` cada 6 s mientras el menú está
 * abierto. En modo `external` solo muestra el saldo (sin botón Pagar).
 *
 * Props:
 *   sessionToken   — token de sesión del invitado
 *   palette        — tema de colores del menú
 *   locale         — para formatear moneda
 *   onOpenSheet    — abre el TabBalanceSheet
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { guestTab } from "@/lib/guestTabSession";

export type TabSummary = Awaited<ReturnType<typeof guestTab.summary>>;

interface TabBalanceFabProps {
  sessionToken: string;
  palette:      Record<string, string>;
  locale:       string;
  onOpenSheet:  (summary: TabSummary) => void;
  onSessionExpired?: () => void;
}

function fmtCents(cents: number, locale: string): string {
  return (cents / 100).toLocaleString(locale, { style: "currency", currency: "USD" });
}

export default function TabBalanceFab({
  sessionToken,
  palette,
  locale,
  onOpenSheet,
  onSessionExpired,
}: TabBalanceFabProps) {
  const t = useTranslations();
  const [summary, setSummary] = useState<TabSummary | null>(null);
  const [closed, setClosed]   = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const accent = palette.accent ?? "#5C7CFA";

  const fetchSummary = useCallback(async () => {
    try {
      const s = await guestTab.summary(sessionToken);
      setSummary(s);
      if (s.balance.due_cents === 0 && s.balance.items_unpaid_cents === 0) {
        setClosed(true);
        // Auto-hide after 3 s when closed
        setTimeout(() => setClosed(false), 3000);
      }
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "SESSION_INVALID") {
        onSessionExpired?.();
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }
  }, [sessionToken, onSessionExpired]);

  useEffect(() => {
    void fetchSummary();
    timerRef.current = setInterval(() => void fetchSummary(), 6000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchSummary]);

  if (!summary) return null;

  const due = summary.balance.due_cents;
  const canPay = summary.can_pay;

  if (closed) {
    return (
      <div style={{
        position: "fixed", bottom: 88, left: "50%", transform: "translateX(-50%)",
        background: "#16a34a", color: "#fff",
        padding: "10px 20px", borderRadius: 24,
        fontSize: 14, fontWeight: 700, zIndex: 150,
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
      }}>
        {t("tabBalance.closed")} ✓
      </div>
    );
  }

  return (
    <button
      onClick={() => void (async () => {
        const fresh = await guestTab.summary(sessionToken).catch(() => summary);
        onOpenSheet(fresh);
      })()}
      style={{
        position:     "fixed",
        bottom:       84,
        left:         "50%",
        transform:    "translateX(-50%)",
        background:   accent,
        color:        "#fff",
        border:       "none",
        borderRadius: 28,
        padding:      "12px 22px",
        fontSize:     15,
        fontWeight:   700,
        cursor:       "pointer",
        zIndex:       150,
        boxShadow:    "0 4px 16px rgba(0,0,0,0.22)",
        display:      "flex",
        alignItems:   "center",
        gap:          8,
        whiteSpace:   "nowrap",
      }}
    >
      <span>🧾</span>
      <span>
        {t("tabBalance.fab", { amount: fmtCents(due, locale) })}
        {!canPay ? ` · ${t("tabBalance.externalMode")}` : ""}
      </span>
    </button>
  );
}
