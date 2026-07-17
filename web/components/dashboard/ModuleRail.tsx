"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconShield, IconBuildingStore, IconUser, IconLogout } from "@tabler/icons-react";
import { isSuperAdmin } from "@/lib/roles";
import { resolveActiveBusiness } from "@/lib/business";
import { supabase } from "@/lib/supabase";
import {
  NAV_MODULES,
  CONFIG_MODULE,
  findActiveModule,
  type NavModule,
} from "./nav-modules";
import { useServicePending } from "./useServicePending";

// Dashboard 4A — the 100px module rail.
//
// Vertical chips (icon + label) for the 6 modules; Configuración pinned to the
// bottom (margin-top:auto) with its engranaje icon, separated from the 6. The
// active module is derived from the pathname. Super-admin link preserved from
// the old Sidebar. Styling uses --db-* tokens only; the active chip is raised
// with --db-accent (per-module color chips are a later styling phase).

/** A module has a live badge if any of its pages carries service_pending. */
function moduleHasServiceBadge(mod: NavModule): boolean {
  return mod.pages.some((p) => p.badgeKey === "service_pending");
}

function RailChip({
  mod,
  active,
  badge,
}: {
  mod: NavModule;
  active: boolean;
  badge: number;
}) {
  const Icon = mod.icon;
  // A module links to its first page (Resumen → /dashboard, etc.).
  const href = mod.pages[0]?.href ?? "/dashboard";
  const showBadge = moduleHasServiceBadge(mod) && badge > 0;

  return (
    <Link
      href={href}
      title={mod.label}
      aria-label={mod.label}
      aria-current={active ? "page" : undefined}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "4px",
        width: "76px",
        paddingTop: "10px",
        paddingBottom: "10px",
        borderRadius: "12px",
        textDecoration: "none",
        background: active ? "var(--db-bg-elevated)" : "transparent",
        borderLeft: active
          ? "2px solid var(--color-brand)"
          : "2px solid transparent",
        color: active ? "var(--db-accent)" : "var(--db-text-secondary)",
        transition: "background 0.15s, color 0.15s",
      }}
    >
      <Icon size={22} stroke={1.6} />
      <span
        style={{
          fontSize: "11px",
          fontWeight: active ? 600 : 500,
          lineHeight: 1,
          textAlign: "center",
        }}
      >
        {mod.label}
      </span>

      {showBadge && (
        <span
          aria-label={`${badge} pending`}
          style={{
            position: "absolute",
            top: "6px",
            right: "16px",
            minWidth: "16px",
            height: "16px",
            borderRadius: "8px",
            background: "var(--db-danger)",
            color: "var(--db-accent-text)",
            fontSize: "9px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 4px",
            lineHeight: 1,
          }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

export function ModuleRail() {
  const pathname = usePathname();
  const [showAdmin, setShowAdmin] = useState(false);
  const servicePending = useServicePending();

  // Active business name — powers the business selector button (replaces the
  // TopBar's switcher). Resolved the same way the old TopBar did.
  const [activeBizName, setActiveBizName] = useState<string>("");

  // User menu (logout) popover. Positioned with fixed coords read from the
  // button's rect on open, so the rail's overflow can't clip it.
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const userBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    isSuperAdmin().then((ok) => {
      if (active) setShowAdmin(ok);
    });
    void resolveActiveBusiness().then((res) => {
      if (active && res.ok) setActiveBizName(res.business.name);
    });
    return () => {
      active = false;
    };
  }, []);

  function toggleUserMenu() {
    if (userMenuOpen) {
      setUserMenuOpen(false);
      return;
    }
    const rect = userBtnRef.current?.getBoundingClientRect();
    if (rect) setMenuPos({ top: rect.top, left: rect.right + 8 });
    setUserMenuOpen(true);
  }

  async function handleLogout() {
    // No pre-existing logout helper in the codebase — sign out via the same
    // browser client the app already uses, then hard-navigate to /auth/login
    // (where the dashboard auth gate already sends unauthenticated users) so
    // server components re-evaluate the cleared session.
    try {
      await supabase.auth.signOut();
    } catch {
      // Non-fatal: fall through to the redirect regardless.
    }
    window.location.href = "/auth/login";
  }

  const activeModule = findActiveModule(pathname);
  const adminActive = pathname.startsWith("/super-admin");
  const bizInitial = activeBizName ? activeBizName.charAt(0).toUpperCase() : "";

  return (
    <nav
      aria-label="Dashboard navigation"
      style={{
        width: "100px",
        minWidth: "100px",
        height: "100vh",
        position: "sticky",
        top: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "12px",
        paddingBottom: "12px",
        gap: "4px",
        background: "var(--db-bg-surface)",
        borderRight: "1px solid var(--db-border)",
        overflowY: "auto",
        overflowX: "hidden",
        scrollbarWidth: "none",
      }}
    >
      {NAV_MODULES.map((mod) => (
        <RailChip
          key={mod.id}
          mod={mod}
          active={activeModule?.id === mod.id}
          badge={servicePending}
        />
      ))}

      {/* Configuración — pinned to the bottom, separated from the 6 modules. */}
      <div style={{ marginTop: "auto", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
        <div
          style={{
            width: "48px",
            height: "1px",
            background: "var(--db-border)",
            margin: "4px 0",
          }}
        />
        <RailChip
          mod={CONFIG_MODULE}
          active={activeModule?.id === CONFIG_MODULE.id}
          badge={0}
        />

        {showAdmin && (
          <Link
            href="/super-admin"
            title="Super Admin"
            aria-label="Super Admin"
            aria-current={adminActive ? "page" : undefined}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              width: "76px",
              paddingTop: "10px",
              paddingBottom: "10px",
              borderRadius: "12px",
              textDecoration: "none",
              background: adminActive ? "var(--db-bg-elevated)" : "transparent",
              borderLeft: adminActive
                ? "2px solid var(--color-brand)"
                : "2px solid transparent",
              color: adminActive ? "var(--db-accent)" : "var(--db-text-secondary)",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            <IconShield size={22} stroke={1.6} />
            <span style={{ fontSize: "11px", fontWeight: adminActive ? 600 : 500, lineHeight: 1 }}>
              Admin
            </span>
          </Link>
        )}

        {/* Account controls — replace the removed TopBar's business switcher + user menu. */}
        <div
          style={{
            width: "48px",
            height: "1px",
            background: "var(--db-border)",
            margin: "4px 0",
          }}
        />

        {/* Business selector → Overview (/dashboard), the existing selection screen. */}
        <Link
          href="/dashboard"
          title={activeBizName ? `Cambiar negocio (actual: ${activeBizName})` : "Cambiar negocio"}
          aria-label={activeBizName ? `Cambiar negocio, actual: ${activeBizName}` : "Cambiar negocio"}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
            width: "76px",
            paddingTop: "10px",
            paddingBottom: "10px",
            borderRadius: "12px",
            textDecoration: "none",
            background: "transparent",
            borderLeft: "2px solid transparent",
            color: "var(--db-text-secondary)",
            transition: "background 0.15s, color 0.15s",
          }}
        >
          <IconBuildingStore size={22} stroke={1.6} />
          <span
            style={{
              fontSize: "11px",
              fontWeight: 500,
              lineHeight: 1,
              maxWidth: "72px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {activeBizName || "Negocio"}
          </span>
        </Link>

        {/* User menu (logout). Popover opens to the right of the rail. */}
        <button
          ref={userBtnRef}
          type="button"
          onClick={toggleUserMenu}
          title="Cuenta"
          aria-label="Menú de usuario"
          aria-haspopup="menu"
          aria-expanded={userMenuOpen}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
            width: "76px",
            paddingTop: "10px",
            paddingBottom: "10px",
            borderRadius: "12px",
            border: "none",
            background: userMenuOpen ? "var(--db-bg-elevated)" : "transparent",
            color: userMenuOpen ? "var(--db-accent)" : "var(--db-text-secondary)",
            cursor: "pointer",
            transition: "background 0.15s, color 0.15s",
          }}
        >
          <span
            aria-hidden
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              background: "var(--db-accent-bg)",
              color: "var(--db-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            {bizInitial || <IconUser size={17} stroke={1.7} />}
          </span>
          <span style={{ fontSize: "11px", fontWeight: userMenuOpen ? 600 : 500, lineHeight: 1 }}>
            Cuenta
          </span>
        </button>
      </div>

      {userMenuOpen && menuPos && (
        <>
          {/* Click-away overlay (same pattern as the old TopBar dropdown). */}
          <div
            onClick={() => setUserMenuOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />
          <div
            role="menu"
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              minWidth: "180px",
              background: "var(--db-bg-elevated)",
              border: "1px solid var(--db-border)",
              borderRadius: "10px",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
              zIndex: 41,
              padding: "4px",
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setUserMenuOpen(false);
                void handleLogout();
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--db-bg-overlay)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                padding: "8px 10px",
                borderRadius: "8px",
                border: "none",
                background: "transparent",
                color: "var(--db-text-primary)",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <IconLogout size={17} stroke={1.7} />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </>
      )}
    </nav>
  );
}
