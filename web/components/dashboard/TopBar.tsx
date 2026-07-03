"use client";

import { useEffect, useState } from "react";
import {
  IconSearch,
  IconChevronDown,
  IconCheck,
  IconBuildingStore,
} from "@tabler/icons-react";
import {
  listUserBusinesses,
  resolveActiveBusiness,
  setActiveBusiness,
  type BusinessListItem,
} from "@/lib/business";

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

  const [businesses, setBusinesses] = useState<BusinessListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([listUserBusinesses(), resolveActiveBusiness()]).then(
      ([list, res]) => {
        if (!active) return;
        setBusinesses(list);
        if (res.ok) {
          setActiveId(res.business.id);
          setActiveName(res.business.name);
        } else {
          setActiveId(null);
          setActiveName("");
        }
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function handleSelect(id: string) {
    if (id === activeId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    const okDone = await setActiveBusiness(id);
    if (okDone) {
      // Reload so every dashboard surface re-resolves the active business.
      window.location.reload();
    } else {
      setSwitching(false);
      setOpen(false);
    }
  }

  const hasSwitcher = businesses.length > 1;
  const displayName = activeName || "Select business";

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
      {/* Left — business switcher */}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        {hasSwitcher ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={open}
            disabled={switching}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              height: "32px",
              padding: "0 10px",
              borderRadius: "8px",
              border: "none",
              background: "transparent",
              color: "var(--db-text-primary)",
              fontWeight: 600,
              fontSize: "14px",
              cursor: switching ? "wait" : "pointer",
              whiteSpace: "nowrap",
              opacity: switching ? 0.6 : 1,
            }}
          >
            <IconBuildingStore size={16} stroke={1.7} color="var(--db-text-secondary)" />
            <span>{switching ? "Switching…" : displayName}</span>
            <IconChevronDown size={14} stroke={1.7} color="var(--db-text-tertiary)" />
          </button>
        ) : (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "0 10px",
              fontWeight: 600,
              fontSize: "14px",
              color: "var(--db-text-primary)",
              whiteSpace: "nowrap",
              opacity: switching ? 0.6 : 1,
            }}
          >
            <IconBuildingStore size={16} stroke={1.7} color="var(--db-text-secondary)" />
            {switching ? "Switching…" : displayName}
          </span>
        )}

        {open && hasSwitcher && (
          <>
            {/* Click-away overlay */}
            <div
              onClick={() => setOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 15 }}
            />
            {/* Dropdown menu */}
            <div
              role="listbox"
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                minWidth: "220px",
                background: "var(--db-bg-elevated)",
                border: "1px solid var(--db-border)",
                borderRadius: "10px",
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
                zIndex: 20,
                padding: "4px",
              }}
            >
              {businesses.map((b) => {
                const isActive = b.id === activeId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => void handleSelect(b.id)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--db-bg-overlay)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      border: "none",
                      background: "transparent",
                      color: isActive ? "var(--db-accent)" : "var(--db-text-primary)",
                      fontSize: "14px",
                      fontWeight: isActive ? 600 : 500,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {b.name}
                    </span>
                    {isActive && <IconCheck size={15} stroke={2} />}
                  </button>
                );
              })}
            </div>
          </>
        )}
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
          {activeName ? activeName.charAt(0).toUpperCase() : "?"}
        </div>
      </div>
    </header>
  );
}
