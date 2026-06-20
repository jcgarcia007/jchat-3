"use client";

import { useEffect, useState } from "react";
import { IconSearch } from "@tabler/icons-react";

// ─── Stub business data ───────────────────────────────────────────────────────
// TODO(Task 2.1): load business name from Supabase via businesses.name
const STUB_BUSINESS_NAME = "My Business";
// TODO(Task 3.15): load real subscription plan from lib/subscriptions.ts
const STUB_PLAN = "Pro";

function useClock(): string {
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    function format(): string {
      return new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    setTime(format());
    const id = setInterval(() => setTime(format()), 1000);
    return () => clearInterval(id);
  }, []);

  return time;
}

export function TopBar() {
  const time = useClock();

  return (
    <header
      style={{
        height: "48px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: "16px",
        paddingRight: "16px",
        gap: "12px",
        background: "var(--db-bg-surface)",
        borderBottom: "1px solid var(--db-border)",
        position: "sticky",
        top: 0,
        zIndex: 10,
        flexShrink: 0,
      }}
    >
      {/* Left — business name + plan badge */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span
          style={{
            fontWeight: 600,
            fontSize: "14px",
            color: "var(--db-text-primary)",
            whiteSpace: "nowrap",
          }}
        >
          {STUB_BUSINESS_NAME}
        </span>

        <span
          style={{
            fontSize: "10px",
            fontWeight: 600,
            padding: "2px 7px",
            borderRadius: "20px",
            background: "var(--db-accent-bg)",
            color: "var(--db-accent)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {STUB_PLAN}
        </span>
      </div>

      {/* Right — Cmd+K trigger + live clock + avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {/* Cmd+K search trigger */}
        {/* TODO(Task 2.16): wire real Cmd+K command palette */}
        <button
          type="button"
          aria-label="Open command palette (⌘K)"
          onClick={() => {
            // TODO(Task 2.16): open command palette
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            height: "28px",
            padding: "0 10px",
            borderRadius: "8px",
            border: "1px solid var(--db-border)",
            background: "var(--db-bg-elevated)",
            color: "var(--db-text-secondary)",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          <IconSearch size={13} stroke={1.6} />
          <span>Search</span>
          <kbd
            style={{
              fontSize: "10px",
              padding: "1px 4px",
              borderRadius: "4px",
              background: "var(--db-bg-overlay)",
              color: "var(--db-text-tertiary)",
              fontFamily: "inherit",
              marginLeft: "2px",
            }}
          >
            ⌘K
          </kbd>
        </button>

        {/* Live clock */}
        <span
          aria-live="polite"
          aria-label={`Current time: ${time}`}
          style={{
            fontSize: "12px",
            color: "var(--db-text-tertiary)",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
            minWidth: "44px",
          }}
        >
          {time}
        </span>

        {/* Avatar stub */}
        {/* TODO(Task 1.7): replace with real user avatar from profiles.avatar_url */}
        <div
          aria-label="User avatar"
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            background: "var(--db-accent-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            fontWeight: 700,
            color: "var(--db-accent)",
            flexShrink: 0,
            cursor: "pointer",
          }}
        >
          {STUB_BUSINESS_NAME.charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
