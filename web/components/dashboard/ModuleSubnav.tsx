"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavPageActive, type NavModule } from "./nav-modules";
import { useServicePending } from "./useServicePending";

// Dashboard 4A — the 230px contextual subnav.
//
// Lists the pages of the active module. RULE (STATUS.md): only shown when the
// module has 2+ pages — the shell (NewDashboardShell) gates this, and we also
// return null defensively so a 0-1 page module never renders a subnav.
// Preserves the live service_pending badge on the Servicio page.

export function ModuleSubnav({ module }: { module: NavModule }) {
  const pathname = usePathname();
  const servicePending = useServicePending();

  // Defensive: Resumen (and any future 0-1 page module) never gets a subnav.
  if (module.pages.length < 2) return null;

  return (
    <nav
      aria-label={`${module.label} navigation`}
      style={{
        width: "230px",
        minWidth: "230px",
        height: "100vh",
        position: "sticky",
        top: 0,
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        paddingTop: "16px",
        paddingLeft: "10px",
        paddingRight: "10px",
        background: "var(--db-bg-surface)",
        borderRight: "1px solid var(--db-border)",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          padding: "0 10px 10px",
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--db-text-tertiary)",
        }}
      >
        {module.label}
      </div>

      {module.pages.map(({ label, href, icon: Icon, badgeKey }) => {
        const isActive = isNavPageActive(href, pathname);
        const badge = badgeKey === "service_pending" ? servicePending : 0;

        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              height: "38px",
              padding: "0 10px",
              borderRadius: "8px",
              textDecoration: "none",
              background: isActive ? "var(--db-bg-elevated)" : "transparent",
              color: isActive ? "var(--db-accent)" : "var(--db-text-secondary)",
              fontSize: "14px",
              fontWeight: isActive ? 600 : 500,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            <Icon size={18} stroke={1.6} />
            <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {label}
            </span>

            {badge > 0 && (
              <span
                aria-label={`${badge} pending`}
                style={{
                  minWidth: "18px",
                  height: "18px",
                  borderRadius: "9px",
                  background: "var(--db-danger)",
                  color: "var(--db-accent-text)",
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
    </nav>
  );
}
