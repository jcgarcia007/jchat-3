"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconLayoutDashboard,
  IconShoppingCart,
  IconToolsKitchen2,
  IconPackage,
  IconMessages,
  IconUsers,
  IconCalendar,
  IconAward,
  IconBellRinging,
  IconCreditCard,
  IconChartBar,
  IconTag,
  IconSettings,
} from "@tabler/icons-react";

// ─── Badge stubs ─────────────────────────────────────────────────────────────
// TODO(Task 3.x): replace with real-time counts from Supabase Realtime
const PENDING_ORDERS = 3;
const UNREAD_ALERTS = 2;

// ─── Nav items ───────────────────────────────────────────────────────────────
interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; stroke?: number }>;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Overview",       href: "/dashboard",               icon: IconLayoutDashboard },
  { label: "Orders",         href: "/dashboard/orders",        icon: IconShoppingCart,   badge: PENDING_ORDERS },
  { label: "Menu",           href: "/dashboard/menu",          icon: IconToolsKitchen2 },
  { label: "Inventory",      href: "/dashboard/inventory",     icon: IconPackage },
  { label: "Chat rooms",     href: "/dashboard/chat-rooms",    icon: IconMessages },
  { label: "Employees",      href: "/dashboard/employees",     icon: IconUsers },
  { label: "Reservations",   href: "/dashboard/reservations",  icon: IconCalendar },
  { label: "Loyalty",        href: "/dashboard/loyalty",       icon: IconAward },
  { label: "Alerts",         href: "/dashboard/alerts",        icon: IconBellRinging,    badge: UNREAD_ALERTS },
  { label: "Payments",       href: "/dashboard/payments",      icon: IconCreditCard },
  { label: "Reports",        href: "/dashboard/reports",       icon: IconChartBar },
  { label: "Offers",         href: "/dashboard/offers",        icon: IconTag },
  { label: "Configuration",  href: "/dashboard/configuration", icon: IconSettings },
];

export function Sidebar() {
  const pathname = usePathname();

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
      {NAV_ITEMS.map(({ label, href, icon: Icon, badge }) => {
        // Exact match for Overview, prefix match for all others
        const isActive =
          href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname === href || pathname.startsWith(href + "/");

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
              // Active state per spec: elevated bg + brand left border + accent icon
              background: isActive ? "var(--db-bg-elevated)" : "transparent",
              borderLeft: isActive
                ? "2px solid var(--color-brand)"
                : "2px solid transparent",
              color: isActive ? "var(--db-accent)" : "var(--db-text-secondary)",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            <Icon size={20} stroke={1.6} />

            {/* Badge */}
            {badge !== undefined && badge > 0 && (
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
    </nav>
  );
}
