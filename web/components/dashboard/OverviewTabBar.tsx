"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { isNavPageActive } from "./nav-modules";

interface TabDef {
  labelKey: string;
  href: string;
  enabled: boolean;
}

const TABS: TabDef[] = [
  { labelKey: "navOverview",    href: "/dashboard",               enabled: true  },
  { labelKey: "railMesas",      href: "/dashboard/floor",         enabled: true  },
  { labelKey: "tabQueue",       href: "/dashboard/queue",         enabled: true  },
  { labelKey: "tabSales",        href: "/dashboard/sales",         enabled: true  },
  { labelKey: "tabSummary",     href: "/dashboard/summary",       enabled: true  },
  { labelKey: "railReservas",   href: "/dashboard/reservations",  enabled: true  },
  { labelKey: "railServicio",   href: "/dashboard/service",       enabled: true  },
  { labelKey: "railResenas",    href: "/dashboard/reviews",       enabled: true  },
  { labelKey: "tabMap",         href: "/dashboard/map",           enabled: false },
];

export function OverviewTabBar() {
  const t = useTranslations("dashboardCommon");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("navOverview")}
      style={{
        display: "flex",
        borderBottom: "1px solid var(--db-border)",
        marginBottom: "24px",
        overflowX: "auto",
        flexShrink: 0,
        scrollbarWidth: "none",
      }}
    >
      {TABS.map(({ labelKey, href, enabled }) => {
        const label = t(labelKey);

        if (!enabled) {
          return (
            <span
              key={href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "10px 14px",
                color: "var(--db-text-secondary)",
                fontSize: "13px",
                fontWeight: 500,
                opacity: 0.5,
                cursor: "default",
                borderBottom: "2px solid transparent",
                marginBottom: "-1px",
                whiteSpace: "nowrap",
                userSelect: "none",
              }}
            >
              {label}
              <span
                style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  background: "var(--db-bg-overlay)",
                  color: "var(--db-text-tertiary)",
                  padding: "1px 5px",
                  borderRadius: "4px",
                  lineHeight: 1.5,
                  flexShrink: 0,
                }}
              >
                {t("tabSoonBadge")}
              </span>
            </span>
          );
        }

        const isActive = isNavPageActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "10px 14px",
              textDecoration: "none",
              color: isActive ? "var(--db-text-primary)" : "var(--db-text-secondary)",
              fontSize: "13px",
              fontWeight: isActive ? 600 : 500,
              borderBottom: isActive ? "2px solid var(--db-accent)" : "2px solid transparent",
              marginBottom: "-1px",
              whiteSpace: "nowrap",
              transition: "color 0.15s",
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
