"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  IconChevronDown,
  IconCheck,
  IconBuildingStore,
  IconPlus,
  IconMenu2,
  IconX,
  IconLogout,
} from "@tabler/icons-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import LanguageSwitcher from "@/components/LanguageSwitcher";
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

export function TopBar({ navOpen = false, onToggleNav }: { navOpen?: boolean; onToggleNav?: () => void }) {
  const t = useTranslations("dashboardCommon");
  const time = useClock();

  const [businesses, setBusinesses] = useState<BusinessListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [userMenuOpen]);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Even if the network call fails, leave the dashboard: the middleware/layout gate re-checks the session.
    }
    window.location.assign("/auth/login");
  }

  useEffect(() => {
    let active = true;
    void Promise.all([
      listUserBusinesses({ includeTemporary: true }),
      resolveActiveBusiness(),
    ]).then(
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

  const hasSwitcher = businesses.length >= 1;
  const displayName = activeName || t("selectBusinessFallback");

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
      {/* Left — nav toggle (mobile only) + business switcher */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", minWidth: 0, gap: "4px" }}>
        <button
          type="button"
          className="db-shell-menu-btn"
          onClick={onToggleNav}
          aria-label={navOpen ? t("closeNavAria") : t("openNavAria")}
          aria-expanded={navOpen}
          aria-controls="dashboard-nav"
          style={{
            alignItems: "center",
            justifyContent: "center",
            width: "36px",
            height: "36px",
            flexShrink: 0,
            borderRadius: "var(--db-radius)",
            border: "none",
            background: "transparent",
            color: "var(--db-text-primary)",
            cursor: "pointer",
          }}
        >
          {navOpen ? <IconX size={20} stroke={1.7} /> : <IconMenu2 size={20} stroke={1.7} />}
        </button>
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
              borderRadius: "var(--db-radius)",
              border: "none",
              background: "transparent",
              color: "var(--db-text-primary)",
              fontWeight: 600,
              fontSize: "14px",
              cursor: switching ? "wait" : "pointer",
              whiteSpace: "nowrap",
              minWidth: 0,
              opacity: switching ? 0.6 : 1,
            }}
          >
            <IconBuildingStore size={16} stroke={1.7} color="var(--db-text-secondary)" style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{switching ? t("switchingState") : displayName}</span>
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
            {switching ? t("switchingState") : displayName}
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
                borderRadius: "var(--db-radius-card)",
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
                      borderRadius: "var(--db-radius)",
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

              {/* Fixed "Create new business" item */}
              <div style={{ height: "1px", background: "var(--db-border)", margin: "4px 6px" }} />
              <Link
                href="/dashboard/create"
                onClick={() => setOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "var(--db-radius)",
                  textDecoration: "none",
                  color: "var(--db-text-secondary)",
                  fontSize: "14px",
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--db-bg-overlay)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <IconPlus size={14} stroke={1.8} />
                <span>{t("topbarCreateBusinessItem")}</span>
              </Link>
            </div>
          </>
        )}
      </div>

      {/* Right — language switcher + live clock + avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
        {/* Language switcher */}
        <span style={{ color: "var(--db-text-secondary)" }}>
          <LanguageSwitcher />
        </span>

        {/* Live clock */}
        <span
          className="db-topbar-clock"
          aria-live="polite"
          aria-label={t("currentTimeAria", { time })}
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

        {/* Avatar + user menu */}
        <div style={{ position: "relative", display: "flex" }}>
          <button
            type="button"
            onClick={() => setUserMenuOpen((o) => !o)}
            aria-label={t("userMenuAria")}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              border: "none",
              background: "var(--db-accent-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              fontWeight: 700,
              color: "var(--db-accent)",
              flexShrink: 0,
              cursor: "pointer",
              padding: 0,
            }}
          >
            {activeName ? activeName.charAt(0).toUpperCase() : "?"}
          </button>
          {userMenuOpen && (
            <>
              <div onClick={() => setUserMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 15 }} />
              <div
                role="menu"
                aria-label={t("userMenuAria")}
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  minWidth: "180px",
                  background: "var(--db-bg-elevated)",
                  border: "1px solid var(--db-border)",
                  borderRadius: "var(--db-radius-card)",
                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
                  zIndex: 20,
                  padding: "4px",
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  autoFocus
                  disabled={signingOut}
                  onClick={() => void handleSignOut()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                    minHeight: "40px",
                    padding: "8px 10px",
                    borderRadius: "var(--db-radius)",
                    border: "none",
                    background: "transparent",
                    color: "var(--db-text-primary)",
                    fontSize: "14px",
                    fontWeight: 500,
                    cursor: signingOut ? "wait" : "pointer",
                    textAlign: "left",
                  }}
                >
                  <IconLogout size={16} stroke={1.7} />
                  <span>{t("logout")}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
