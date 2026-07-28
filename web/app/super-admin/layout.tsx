/**
 * JChat 3.0 — Super Admin layout (Task 2.17, updated Task 3.13)
 *
 * Minimal shell for the /super-admin/* subtree.
 * Uses global tokens from web/styles/tokens.css directly — NOT the
 * dashboard db-theme vars — because super-admin is a separate area
 * with its own access controls.
 *
 * Access is verified SERVER-SIDE in this layout via the is_platform_admin()
 * RPC with a redirect (hallazgo #14): a non-admin never reaches the subtree,
 * so the RLS stops being the only barrier. <SuperAdminGate> is kept as a
 * second layer (defense in depth) and to keep the panel viewable in demo mode
 * without Supabase. Layers: server gate (this file) → client gate → RLS.
 * (SuperAdminGate: users.role === 'super_admin' or an admin_roles entry.)
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import SuperAdminGate from "@/components/SuperAdminGate";
import {
  createSupabaseServerClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
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
  IconRulerMeasure,
  IconLayoutDashboard,
  IconTicket,
  IconAdjustmentsHorizontal,
} from "@tabler/icons-react";

export const metadata: Metadata = {
  title: "JChat — Super Admin",
  description: "JChat 3.0 super admin panel",
};

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("superAdmin.shell");

  // Server-side gate (hallazgo #14): la RLS deja de ser la ÚNICA barrera.
  // Mismo patrón que dashboard/layout.tsx. Se salta solo sin Supabase
  // (demo local), igual que allí.
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      redirect("/auth/login?next=/super-admin");
    }
    const { data: isAdmin } = await supabase.rpc("is_platform_admin");
    if (!isAdmin) {
      redirect("/dashboard");
    }
  }

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
        aria-label={t("navAriaLabel")}
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
            {t("brandLabel")}
          </span>
        </div>

        {/* Primary nav */}
        <NavLink href="/super-admin" icon={IconLayoutDashboard} label={t("navOverview")} />
        <NavLink href="/super-admin/users" icon={IconUsers} label={t("navUsers")} />
        <NavLink href="/super-admin/businesses" icon={IconBuildingStore} label={t("navBusinesses")} />
        <NavLink href="/super-admin/verification" icon={IconUserCheck} label={t("navVerification")} />
        <NavLink href="/super-admin/radius-requests" icon={IconRulerMeasure} label={t("navRadiusRequests")} />
        <NavLink href="/super-admin/business-radius" icon={IconAdjustmentsHorizontal} label={t("navBusinessRadius")} />
        <NavLink href="/super-admin/revenue" icon={IconChartBar} label={t("navRevenue")} />
        <NavLink href="/super-admin/promo-codes" icon={IconTicket} label={t("navPromoCodes")} />
        <NavLink href="/super-admin/alerts" icon={IconBell} label={t("navAlerts")} />
        <NavLink href="/super-admin/team" icon={IconUsersGroup} label={t("navTeam")} />
        <NavLink href="/super-admin/announcements" icon={IconBroadcast} label={t("navAnnouncements")} />

        {/* Section divider */}
        <div
          style={{
            height: "1px",
            background: "var(--border-subtle)",
            margin: "8px 16px",
          }}
        />

        <NavLink href="/super-admin/locations" icon={IconMapPin} label={t("navPublicLocations")} />
        <NavLink href="/super-admin/disputes" icon={IconReceiptRefund} label={t("navDisputes")} />

        {/* Back to dashboard */}
        <div style={{ marginTop: "auto", padding: "16px 0 0", borderTop: "1px solid var(--border-subtle)" }}>
          <NavLink href="/dashboard" icon={IconArrowLeft} label={t("navBackToDashboard")} />
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
        <SuperAdminGate>{children}</SuperAdminGate>
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
