"use client";

import { IconTrendingUp, IconCurrencyDollar, IconUsers } from "@tabler/icons-react";

interface ThemePreviewProps {
  /** data-db-theme key, e.g. "midnight-blue" */
  themeKey: string;
  /** Optional display label shown below the preview card */
  label?: string;
}

/**
 * ThemePreview — Task 0.3
 *
 * A self-contained miniature preview that renders a KPI card and a small bar
 * chart inside a scoped `data-db-theme` container.
 *
 * All colours reference `var(--db-*)` tokens exclusively — no hardcoded hex.
 */
export function ThemePreview({ themeKey, label }: ThemePreviewProps) {
  // Simulated bar-chart heights (purely decorative)
  const bars = [40, 65, 50, 80, 60, 90, 70];

  return (
    <div
      data-db-theme={themeKey}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: "6px",
        padding: "12px",
        borderRadius: "10px",
        background: "var(--db-bg-base)",
        border: "1px solid var(--db-border)",
        width: "180px",
        fontFamily: "inherit",
      }}
    >
      {/* ── KPI card ──────────────────────────────────────────────── */}
      <div
        style={{
          background: "var(--db-bg-surface)",
          borderRadius: "8px",
          padding: "10px",
          border: "1px solid var(--db-border)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "6px",
          }}
        >
          <span
            style={{
              fontSize: "10px",
              color: "var(--db-text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Revenue
          </span>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "2px",
              fontSize: "9px",
              color: "var(--db-success)",
            }}
          >
            <IconTrendingUp size={10} />
            +12%
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            marginBottom: "8px",
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "20px",
              height: "20px",
              borderRadius: "6px",
              background: "var(--db-accent-bg)",
              color: "var(--db-accent)",
            }}
          >
            <IconCurrencyDollar size={12} />
          </span>
          <span
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--db-text-primary)",
              lineHeight: 1,
            }}
          >
            $4,280
          </span>
        </div>

        {/* Secondary metric row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "9px",
            color: "var(--db-text-tertiary)",
          }}
        >
          <IconUsers size={9} />
          <span>128 visitors today</span>
        </div>
      </div>

      {/* ── Mini bar chart ────────────────────────────────────────── */}
      <div
        style={{
          background: "var(--db-bg-surface)",
          borderRadius: "8px",
          padding: "8px",
          border: "1px solid var(--db-border)",
        }}
      >
        <span
          style={{
            fontSize: "9px",
            color: "var(--db-text-secondary)",
            display: "block",
            marginBottom: "6px",
          }}
        >
          Weekly Sales
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "4px",
            height: "40px",
          }}
        >
          {bars.map((h, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${h}%`,
                borderRadius: "3px 3px 0 0",
                background:
                  i === bars.length - 1
                    ? "var(--db-accent)"
                    : "var(--db-accent-bg)",
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Theme label ───────────────────────────────────────────── */}
      {label !== undefined && (
        <span
          style={{
            fontSize: "9px",
            textAlign: "center",
            color: "var(--db-text-secondary)",
            marginTop: "2px",
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
