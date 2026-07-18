"use client";

/**
 * Dashboard 4A — Overview sales calendar.
 *
 * A month grid of REAL sales for the active business: each day shows the summed
 * total_cents of that day's orders whose status counts as a sale. Days with no
 * sales show a dash — never a fabricated 0. Month summary = month total + order
 * count. No average-ticket / occupancy / peak-hour metrics: those have no real
 * data source and stay deferred (see docs/design/dashboard-4a/STATUS.md).
 *
 * Tokens: --db-* only (this is dashboard page content, not nav chrome).
 */

import { useEffect, useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useActiveBusinessName } from "./useActiveBusinessName";

// A sale counts from "confirmed" onward (customer has paid). Explicitly EXCLUDES
// 'pending' (not yet paid) and 'cancelled' / 'refunded'. Order flow states seen
// in the codebase: pending → confirmed → preparing → ready → delivered (+cancelled).
export const SALE_STATUSES = ["confirmed", "preparing", "ready", "delivered"] as const;

// No currency column exists on orders or businesses yet — format as USD.
// TODO: switch to a real per-business currency once the column exists.
const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
function formatCents(cents: number): string {
  return money.format(cents / 100);
}

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

interface DayTotals {
  cents: number;
  count: number;
}

interface OrderRow {
  total_cents: number;
  created_at: string;
}

export function SalesCalendar() {
  const { id: activeId } = useActiveBusinessName();

  // View month state (local time). Start on the current local month.
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-11

  const [totals, setTotals] = useState<Record<number, DayTotals>>({});
  const [loading, setLoading] = useState(true);

  // Today, in LOCAL time, for highlighting + the future-navigation guard.
  const today = useMemo(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
  }, []);

  const canGoNext =
    viewYear < today.y || (viewYear === today.y && viewMonth < today.m);

  useEffect(() => {
    let active = true;

    if (!activeId || !isSupabaseConfigured) {
      setTotals({});
      setLoading(false);
      return;
    }

    setLoading(true);

    // Month window in LOCAL time, converted to ISO (UTC) for the query. This
    // captures every order whose instant falls within the local month, and we
    // group by each order's LOCAL calendar day below — so days never drift
    // across the UTC boundary in the early hours.
    const monthStart = new Date(viewYear, viewMonth, 1);
    const nextMonthStart = new Date(viewYear, viewMonth + 1, 1);

    void (async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("total_cents, created_at, status")
        .eq("business_id", activeId)
        .gte("created_at", monthStart.toISOString())
        .lt("created_at", nextMonthStart.toISOString())
        .in("status", SALE_STATUSES as unknown as string[]);

      if (!active) return;

      if (error) {
        setTotals({});
        setLoading(false);
        return;
      }

      const acc: Record<number, DayTotals> = {};
      for (const row of (data ?? []) as OrderRow[]) {
        // Group by the order's LOCAL day-of-month.
        const day = new Date(row.created_at).getDate();
        const entry = acc[day] ?? { cents: 0, count: 0 };
        entry.cents += row.total_cents ?? 0;
        entry.count += 1;
        acc[day] = entry;
      }
      setTotals(acc);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [activeId, viewYear, viewMonth]);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Monday-based leading blanks: JS getDay() is 0=Sun..6=Sat.
  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;

  const monthCents = Object.values(totals).reduce((s, d) => s + d.cents, 0);
  const monthCount = Object.values(totals).reduce((s, d) => s + d.count, 0);
  const hasSales = monthCount > 0;

  function goPrev() {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }
  function goNext() {
    if (!canGoNext) return;
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }

  // No active business → guide the user to the switcher above.
  if (!activeId) {
    return (
      <div
        style={{
          padding: "40px 24px",
          textAlign: "center",
          color: "var(--db-text-secondary)",
          background: "var(--db-bg-surface)",
          border: "1px solid var(--db-border)",
          borderRadius: "14px",
        }}
      >
        Selecciona un negocio para ver sus ventas.
      </div>
    );
  }

  return (
    <div>
      {/* Header — month nav + summary */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={goPrev}
            aria-label="Mes anterior"
            style={navBtn}
          >
            <IconChevronLeft size={18} />
          </button>
          <span
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--db-text-primary)",
              textTransform: "capitalize",
              minWidth: "160px",
              textAlign: "center",
            }}
          >
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={goNext}
            aria-label="Mes siguiente"
            disabled={!canGoNext}
            style={{ ...navBtn, opacity: canGoNext ? 1 : 0.4, cursor: canGoNext ? "pointer" : "default" }}
          >
            <IconChevronRight size={18} />
          </button>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--db-text-primary)" }}>
            {loading ? "—" : formatCents(monthCents)}
          </div>
          <div style={{ fontSize: "12px", color: "var(--db-text-secondary)" }}>
            {loading ? "Cargando…" : `${monthCount} ${monthCount === 1 ? "pedido" : "pedidos"} este mes`}
          </div>
        </div>
      </div>

      {/* Weekday header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px", marginBottom: "6px" }}>
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            style={{
              textAlign: "center",
              fontSize: "11px",
              fontWeight: 700,
              color: "var(--db-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px" }}>
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const entry = totals[day];
          const isToday =
            viewYear === today.y && viewMonth === today.m && day === today.d;
          const hasDay = !loading && !!entry && entry.cents > 0;

          return (
            <div
              key={day}
              style={{
                minHeight: "72px",
                borderRadius: "10px",
                border: isToday
                  ? "2px solid var(--db-accent)"
                  : "1px solid var(--db-border)",
                background: hasDay ? "var(--db-accent-bg)" : "var(--db-bg-surface)",
                padding: "6px 8px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: isToday ? 800 : 600,
                  color: isToday ? "var(--db-accent)" : "var(--db-text-secondary)",
                }}
              >
                {day}
              </span>
              {hasDay ? (
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--db-text-primary)" }}>
                  {formatCents(entry.cents)}
                </span>
              ) : (
                <span aria-hidden style={{ fontSize: "13px", color: "var(--db-text-tertiary)" }}>
                  —
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state (honest) */}
      {!loading && !hasSales && (
        <p style={{ marginTop: "16px", fontSize: "14px", color: "var(--db-text-secondary)", textAlign: "center" }}>
          Aún no hay ventas registradas este mes.
        </p>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "32px",
  height: "32px",
  borderRadius: "8px",
  border: "1px solid var(--db-border)",
  background: "var(--db-bg-surface)",
  color: "var(--db-text-primary)",
  cursor: "pointer",
};
