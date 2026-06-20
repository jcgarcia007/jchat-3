/**
 * JChat 3.0 — Super Admin layout (Task 2.17, updated Task 3.13)
 *
 * Minimal shell for the /super-admin/* subtree.
 * Uses global tokens from web/styles/tokens.css directly — NOT the
 * dashboard db-theme vars — because super-admin is a separate area
 * with its own access controls.
 *
 * TODO(roles): gate this entire layout to Super Admin / designated admin roles
 *   once the roles system exists (admin_roles / users.role).
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  IconShield,
  IconMapPin,
  IconArrowLeft,
  IconReceiptRefund,
  IconUsers,
  IconBuildingStore,
  IconUserCheck,
  IconChartBar,
  IconBell,
  IconUsersGroup,
  IconBroadcast,
  IconLayoutDashboard,
} from "@tabler/icons-react";

export const metadata: Metadata = {
  title: "JChat — Super Admin",
  description: "JChat 3.0 super admin panel",
};

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Force dark theme for the entire super-admin subtree
    <div
      data-theme="dark"
      style={{
        display: "flex",
        flexDirection: "row",
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--text-primary)",
      }}
    >
      {/* Sidebar rail */}
      <nav
        aria-label="Super admin navigation"
        style={{
          width: "210px",
          minWidth: "210px",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--border-subtle)",
          padding: "16px 0",
          gap: "2px",
        }}
      >
        {/* Brand header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "0 16px 16px",
            borderBottom: "1px solid var(--border-subtle)",
            marginBottom: "8px",
          }}
        >
          <IconShield
            size={20}
            stroke={1.6}
            style={{ color: "var(--color-brand)" }}
          />
          <span
            style={{
              fontSize: "13px",
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "0.02em",
              textTransform: "uppercase",
            }}
          >
            Super Admin
          </span>
        </div>

        {/* Primary nav */}
        <NavLink href="/super-admin" icon={IconLayoutDashboard} label="Overview" />
        <NavLink href="/super-admin/users" icon={IconUsers} label="Users" />
        <NavLink href="/super-admin/businesses" icon={IconBuildingStore} label="Businesses" />
        <NavLink href="/super-admin/verification" icon={IconUserCheck} label="Verification" />
        <NavLink href="/super-admin/revenue" icon={IconChartBar} label="Revenue" />
        <NavLink href="/super-admin/alerts" icon={IconBell} label="Alerts" />
        <NavLink href="/super-admin/team" icon={IconUsersGroup} label="Team" />
        <NavLink href="/super-admin/announcements" icon={IconBroadcast} label="Announcements" />

        {/* Section divider */}
        <div
          style={{
            height: "1px",
            background: "var(--border-subtle)",
            margin: "8px 16px",
          }}
        />

        <NavLink href="/super-admin/locations" icon={IconMapPin} label="Public Locations" />
        <NavLink href="/super-admin/disputes" icon={IconReceiptRefund} label="Disputes" />

        {/* Back to dashboard */}
        <div style={{ marginTop: "auto", padding: "16px 0 0", borderTop: "1px solid var(--border-subtle)" }}>
          <NavLink href="/dashboard" icon={IconArrowLeft} label="Back to Dashboard" />
        </div>
      </nav>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          overflowY: "auto",
          padding: "24px",
        }}
      >
        {children}
      </main>
    </div>
  );
}

// ─── NavLink helper ─────────────────────────────────────────────────────────

function NavLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; stroke?: number }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 16px",
        fontSize: "13px",
        fontWeight: 500,
        color: "var(--text-secondary)",
        textDecoration: "none",
        borderRadius: "6px",
        margin: "0 8px",
        transition: "background 0.12s, color 0.12s",
      }}
      // Note: active styles would require "use client" + usePathname;
      // keeping this layout as a server component for performance.
    >
      <Icon size={16} stroke={1.6} />
      {label}
    </Link>
  );
}
