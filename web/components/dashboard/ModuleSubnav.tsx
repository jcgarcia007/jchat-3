"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconSelector, IconLogout, IconCheck, IconPlus } from "@tabler/icons-react";
import { supabase } from "@/lib/supabase";
import {
  listUserBusinesses,
  listUserEvents,
  setActiveBusiness,
} from "@/lib/business";
import {
  resolveActivePageHref,
  CONFIG_MODULE,
  type NavModule,
} from "./nav-modules";
import { useServicePending } from "./useServicePending";
import { useActiveBusinessName, notifyActiveBusinessChanged } from "./useActiveBusinessName";
import { NAV4A, planLabel, renewLine, initialsOf } from "./nav4a-tokens";

// Dashboard 4A — hi-fi contextual subnav (230px, white).
//
// GLOBAL chrome: the business switcher (top) and the plan card (bottom) always
// render — even for Resumen and no-module routes. Only the section LIST is
// conditional (hidden when the active module has <2 pages, e.g. Resumen).
// Logout lives here, at the end of the Configuración list. Colors come from the
// scoped nav4a-tokens.

const CREATE_ROUTE = "/dashboard/configuration/businesses";

interface PlanInfo {
  plan: string | null;
  renewsAt: string | null;
}

interface SwitcherItem {
  id: string;
  name: string;
  kind: "business" | "event";
}

// ─── Business switcher (dropdown) ────────────────────────────────────────────
// Was a <Link> to Overview; now a button that opens a menu listing the owner's
// businesses + events. Selecting one calls setActiveBusiness (existing, with its
// ownership guard), broadcasts the change, and router.refresh()es the current
// page — no navigation. Menu is fixed-positioned off the button rect so the
// subnav's overflow can't clip it; closes on select, click-away, and Escape.

function BusinessSwitcher() {
  const router = useRouter();
  const { id: activeId, name: activeName } = useActiveBusinessName();
  const btnRef = useRef<HTMLButtonElement>(null);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [items, setItems] = useState<SwitcherItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const [biz, events] = await Promise.all([listUserBusinesses(), listUserEvents()]);
      const merged: SwitcherItem[] = [
        ...biz.map((b) => ({ id: b.id, name: b.name, kind: "business" as const })),
        ...events.map((e) => ({ id: e.id, name: e.name, kind: "event" as const })),
      ];
      setItems(merged);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function openMenu() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    setOpen(true);
    void loadItems();
  }

  function toggle() {
    if (open) setOpen(false);
    else openMenu();
  }

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function activate(id: string) {
    if (id === activeId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    const ok = await setActiveBusiness(id);
    setBusy(false);
    setOpen(false);
    if (ok) {
      notifyActiveBusinessChanged(); // sync sibling client chrome (rail avatar, this button)
      router.refresh(); // re-fetch server components on the current route
    }
  }

  const initials = activeName ? initialsOf(activeName) : "";

  return (
    <div style={{ marginBottom: "20px" }}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={activeName ? `Cambiar negocio, actual: ${activeName}` : "Cambiar negocio"}
        title={activeName || "Cambiar negocio"}
        disabled={busy}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          width: "100%",
          padding: "10px",
          borderRadius: "14px",
          border: `0.5px solid ${NAV4A.subnavBorder}`,
          background: open ? NAV4A.itemHoverBg : "transparent",
          cursor: busy ? "wait" : "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "10px",
            background: NAV4A.brandGradient,
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            fontWeight: 900,
            flexShrink: 0,
          }}
        >
          {initials}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 600,
              color: NAV4A.titleNavy,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {activeName || "Selecciona negocio"}
          </span>
          <span style={{ display: "block", fontSize: "11px", color: NAV4A.eyebrow }}>
            Cambiar negocio
          </span>
        </span>
        <IconSelector size={16} stroke={1.7} color={NAV4A.eyebrow} />
      </button>

      {open && pos && (
        <>
          {/* Click-away overlay */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />
          <div
            role="menu"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              minWidth: "220px",
              maxHeight: "60vh",
              overflowY: "auto",
              background: NAV4A.subnavBg,
              border: `0.5px solid ${NAV4A.subnavBorder}`,
              borderRadius: "14px",
              boxShadow: NAV4A.menuShadow,
              zIndex: 41,
              padding: "6px",
            }}
          >
            {loading && (
              <div style={{ padding: "10px 12px", fontSize: "13px", color: NAV4A.eyebrow }}>
                Cargando…
              </div>
            )}

            {!loading &&
              items.map((item) => {
                const isActive = item.id === activeId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={() => void activate(item.id)}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = NAV4A.itemHoverBg;
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = "transparent";
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "10px",
                      border: "none",
                      background: isActive ? NAV4A.subnavItemActiveBg : "transparent",
                      color: isActive ? NAV4A.subnavItemActiveText : NAV4A.titleNavy,
                      fontSize: "14px",
                      fontWeight: isActive ? 600 : 500,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "8px",
                        background: NAV4A.brandGradient,
                        color: "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "11px",
                        fontWeight: 900,
                        flexShrink: 0,
                      }}
                    >
                      {initialsOf(item.name)}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.name}
                    </span>
                    {item.kind === "event" && (
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: "10px",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "6px",
                          background: NAV4A.eventTagBg,
                          color: NAV4A.eventTagText,
                        }}
                      >
                        Evento
                      </span>
                    )}
                    {isActive && <IconCheck size={16} stroke={2} />}
                  </button>
                );
              })}

            {!loading && items.length === 0 && (
              <div style={{ padding: "8px 10px", fontSize: "13px", color: NAV4A.eyebrow }}>
                No tienes negocios todavía.
              </div>
            )}

            {/* Create — always available, points to the Configuración › Negocios tab */}
            <Link
              href={CREATE_ROUTE}
              role="menuitem"
              onClick={() => setOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 10px",
                marginTop: "4px",
                borderTop: `0.5px solid ${NAV4A.subnavBorder}`,
                borderRadius: "0 0 8px 8px",
                textDecoration: "none",
                color: NAV4A.subnavItemActiveText,
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              <IconPlus size={16} stroke={2} />
              <span>Crear negocio</span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function PlanCard({ info }: { info: PlanInfo | null }) {
  const label = planLabel(info?.plan);
  if (!label) return null; // No card for admin/regular — never fabricate a plan.
  const line = renewLine(info?.renewsAt);

  return (
    <div
      style={{
        marginTop: "auto",
        padding: "14px",
        borderRadius: "14px",
        background: NAV4A.navy,
      }}
    >
      <div style={{ fontSize: "12px", fontWeight: 900, color: NAV4A.planEyebrow }}>
        {label}
      </div>
      {line && (
        <div style={{ marginTop: "4px", fontSize: "13px", color: NAV4A.planText }}>
          {line}
        </div>
      )}
    </div>
  );
}

export function ModuleSubnav({ module }: { module: NavModule | null }) {
  const pathname = usePathname();
  const servicePending = useServicePending();
  const [plan, setPlan] = useState<PlanInfo | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!active || !user) return;
        const { data } = await supabase
          .from("users")
          .select("plan, plan_renews_at")
          .eq("id", user.id)
          .maybeSingle();
        if (!active) return;
        const row = data as { plan: string | null; plan_renews_at: string | null } | null;
        setPlan({ plan: row?.plan ?? null, renewsAt: row?.plan_renews_at ?? null });
      } catch {
        // Non-critical chrome: leave the plan card hidden on failure.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    // Moved here from the rail. No pre-existing helper — sign out via the shared
    // browser client, then hard-navigate to /auth/login (where the dashboard
    // gate already sends unauthenticated users).
    try {
      await supabase.auth.signOut();
    } catch {
      // Non-fatal: redirect regardless.
    }
    window.location.href = "/auth/login";
  }

  const showList = !!module && module.pages.length >= 2;
  const isConfig = module?.id === CONFIG_MODULE.id;
  // Longest-prefix match so nested routes (e.g. /dashboard/configuration/businesses)
  // highlight only the most specific page, not its parent.
  const activeHref = module ? resolveActivePageHref(module.pages, pathname) : null;

  return (
    <nav
      aria-label={module ? `${module.label} navigation` : "Dashboard subnavigation"}
      style={{
        width: "230px",
        minWidth: "230px",
        height: "100vh",
        position: "sticky",
        top: 0,
        display: "flex",
        flexDirection: "column",
        padding: "22px 18px",
        background: NAV4A.subnavBg,
        borderRight: `0.5px solid ${NAV4A.subnavBorder}`,
        overflowY: "auto",
      }}
    >
      {/* Business switcher — global */}
      <BusinessSwitcher />

      {/* Eyebrow — active module name */}
      {module && (
        <div
          style={{
            padding: "0 6px 10px",
            fontSize: "11px",
            fontWeight: 900,
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: NAV4A.eyebrow,
          }}
        >
          {module.label}
        </div>
      )}

      {/* Section list — hidden for <2-page modules (Resumen) */}
      {showList &&
        module!.pages.map(({ label, href, icon: Icon, badgeKey }) => {
          const isActive = href === activeHref;
          const badge = badgeKey === "service_pending" ? servicePending : 0;
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 14px",
                borderRadius: "10px",
                marginBottom: "2px",
                textDecoration: "none",
                background: isActive ? NAV4A.subnavItemActiveBg : "transparent",
                color: isActive ? NAV4A.subnavItemActiveText : NAV4A.subnavItemText,
                fontSize: "14px",
                fontWeight: isActive ? 600 : 500,
              }}
            >
              <Icon size={18} stroke={1.6} />
              <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {label}
              </span>
              {badge > 0 && (
                <span
                  aria-label={`${badge} pendientes`}
                  style={{
                    minWidth: "18px",
                    height: "18px",
                    borderRadius: "9px",
                    background: NAV4A.danger,
                    color: "#ffffff",
                    fontSize: "10px",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 5px",
                    lineHeight: 1,
                  }}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}

      {/* Logout — only inside Configuración, styled as a soft-destructive item */}
      {isConfig && (
        <button
          type="button"
          onClick={() => void handleLogout()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            width: "100%",
            padding: "10px 14px",
            borderRadius: "10px",
            marginTop: "2px",
            border: "none",
            background: "transparent",
            color: NAV4A.danger,
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <IconLogout size={18} stroke={1.7} />
          <span>Cerrar sesión</span>
        </button>
      )}

      {/* Plan card — global, real data */}
      <PlanCard info={plan} />
    </nav>
  );
}
