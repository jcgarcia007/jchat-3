"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconShield } from "@tabler/icons-react";
import { isSuperAdmin } from "@/lib/roles";
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

  useEffect(() => {
    let active = true;
    isSuperAdmin().then((ok) => {
      if (active) setShowAdmin(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  const activeModule = findActiveModule(pathname);
  const adminActive = pathname.startsWith("/super-admin");

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
      </div>
    </nav>
  );
}
