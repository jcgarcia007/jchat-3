"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  IconLayoutDashboard,
  IconShoppingCart,
  IconToolsKitchen2,
  IconPackage,
  IconMessages,
  IconUsers,
  IconShieldLock,
  IconBell,
  IconCalendar,
  IconAward,
  IconCreditCard,
  IconChartBar,
  IconTag,
  IconSettings,
  IconShield,
} from "@tabler/icons-react";
import { isSuperAdmin } from "@/lib/roles";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; stroke?: number }>;
  badgeKey?: "service_pending";
}

const NAV_ITEMS: NavItem[] = [
  { label: "Overview",       href: "/dashboard",               icon: IconLayoutDashboard },
  { label: "Orders",         href: "/dashboard/orders",        icon: IconShoppingCart },
  { label: "Menu",           href: "/dashboard/menu",          icon: IconToolsKitchen2 },
  { label: "Inventory",      href: "/dashboard/inventory",     icon: IconPackage },
  { label: "Chat rooms",     href: "/dashboard/chat-rooms",    icon: IconMessages },
  { label: "Employees",      href: "/dashboard/employees",     icon: IconUsers },
  { label: "Roles",          href: "/dashboard/roles",         icon: IconShieldLock },
  { label: "Reservations",   href: "/dashboard/reservations",  icon: IconCalendar },
  { label: "Loyalty",        href: "/dashboard/loyalty",       icon: IconAward },
  { label: "Servicio",       href: "/dashboard/service",       icon: IconBell, badgeKey: "service_pending" },
  { label: "Payments",       href: "/dashboard/payments",      icon: IconCreditCard },
  { label: "Reports",        href: "/dashboard/reports",       icon: IconChartBar },
  { label: "Offers",         href: "/dashboard/offers",        icon: IconTag },
  { label: "Configuration",  href: "/dashboard/configuration", icon: IconSettings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [showAdmin, setShowAdmin] = useState(false);
  const [servicePending, setServicePending] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    let active = true;
    isSuperAdmin().then((ok) => {
      if (active) setShowAdmin(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    async function countPending(businessId: string) {
      const { count, error } = await supabase
        .from("service_calls")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("status", "pending");
      if (!active) return;
      if (!error) setServicePending(count ?? 0);
    }

    void (async () => {
      try {
        const res = await resolveActiveBusiness();
        if (!active || !res.ok) return;
        const businessId = res.business.id;
        await countPending(businessId);
        channelRef.current = supabase
          .channel(`sidebar-service-${businessId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "service_calls", filter: `business_id=eq.${businessId}` },
            () => {
              void countPending(businessId).catch(() => {});
            },
          )
          .subscribe();
      } catch {
        // Silent: badge is non-critical chrome.
      }
    })();

    return () => {
      active = false;
      if (channelRef.current) void supabase.removeChannel(channelRef.current);
    };
  }, []);

  return (
    <nav
      aria-label="Dashboard navigation"
      style={{
        width: "48px",
        minWidth: "48px",
        height: "100vh",
        position: "sticky",
        top: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "12px",
        paddingBottom: "12px",
        gap: "2px",
        background: "var(--db-bg-surface)",
        borderRight: "1px solid var(--db-border)",
        overflowY: "auto",
        overflowX: "hidden",
        scrollbarWidth: "none",
      }}
    >
      {NAV_ITEMS.map(({ label, href, icon: Icon, badgeKey }) => {
        const isActive =
          href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname === href || pathname.startsWith(href + "/");

        const badge = badgeKey === "service_pending" ? servicePending : 0;

        return (
          <Link
            key={href}
            href={href}
            title={label}
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              textDecoration: "none",
              background: isActive ? "var(--db-bg-elevated)" : "transparent",
              borderLeft: isActive
                ? "2px solid var(--color-brand)"
                : "2px solid transparent",
              color: isActive ? "var(--db-accent)" : "var(--db-text-secondary)",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            <Icon size={20} stroke={1.6} />

            {badge > 0 && (
              <span
                aria-label={`${badge} pending`}
                style={{
                  position: "absolute",
                  top: "4px",
                  right: "4px",
                  minWidth: "14px",
                  height: "14px",
                  borderRadius: "7px",
                  background: "var(--db-danger)",
                  color: "var(--db-accent-text)",
                  fontSize: "9px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 3px",
                  lineHeight: 1,
                }}
              >
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </Link>
        );
      })}

      {showAdmin && (
        <>
          <div
            style={{
              width: "24px",
              height: "1px",
              background: "var(--db-border)",
              margin: "8px 0",
            }}
          />
          <Link
            href="/super-admin"
            title="Super Admin"
            aria-label="Super Admin"
            aria-current={pathname.startsWith("/super-admin") ? "page" : undefined}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              textDecoration: "none",
              background: pathname.startsWith("/super-admin")
                ? "var(--db-bg-elevated)"
                : "transparent",
              borderLeft: pathname.startsWith("/super-admin")
                ? "2px solid var(--color-brand)"
                : "2px solid transparent",
              color: pathname.startsWith("/super-admin")
                ? "var(--db-accent)"
                : "var(--db-text-secondary)",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            <IconShield size={20} stroke={1.6} />
          </Link>
        </>
      )}
    </nav>
  );
}
