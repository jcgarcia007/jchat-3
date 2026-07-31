"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { IconShield } from "@tabler/icons-react";
import { isSuperAdmin } from "@/lib/roles";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import {
  NAV_MODULES,
  CONFIG_MODULE,
  isNavPageActive,
  type NavPage,
  type NavModule,
} from "./nav-modules";

// Dashboard sidebar (producción, claro). Agrupa las páginas por módulo reutilizando
// NAV_MODULES + CONFIG_MODULE de nav-modules.ts como fuente de verdad.
// Diseño sin cambios de color — solo reorganizado con headers de grupo.

const TABLES_HREF = "/dashboard/tables";

export function Sidebar() {
  const t = useTranslations("dashboardCommon");
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

  function renderPage(page: NavPage) {
    const Icon = page.icon;
    const isActive = isNavPageActive(page.href, pathname);
    const badge = page.badgeKey === "service_pending" ? servicePending : 0;
    const label = t(page.labelKey);
    const isNew = page.href === TABLES_HREF;

    return (
      <Link
        key={page.href}
        href={page.href}
        title={label}
        aria-label={label}
        aria-current={isActive ? "page" : undefined}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 10px",
          borderRadius: "var(--db-radius)",
          textDecoration: "none",
          background: isActive ? "var(--db-bg-elevated)" : "transparent",
          borderLeft: isActive
            ? "2px solid var(--color-brand)"
            : "2px solid transparent",
          color: isActive ? "var(--db-accent)" : "var(--db-text-secondary)",
          fontSize: "13px",
          fontWeight: isActive ? 500 : 400,
          transition: "background 0.15s, color 0.15s",
        }}
      >
        <span style={{ display: "flex", flexShrink: 0 }}><Icon size={17} stroke={1.6} /></span>

        <span style={{ flex: 1, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>

        {isNew && (
          <span
            aria-label="nuevo"
            style={{
              fontSize: "9px",
              fontWeight: 700,
              letterSpacing: "0.03em",
              textTransform: "uppercase",
              background: "var(--db-accent-bg)",
              color: "var(--db-accent)",
              padding: "1px 5px",
              borderRadius: "4px",
              lineHeight: 1.5,
              flexShrink: 0,
            }}
          >
            nuevo
          </span>
        )}

        {badge > 0 && (
          <span
            aria-label={t("pendingBadgeAria", { count: badge })}
            style={{
              minWidth: "18px",
              height: "18px",
              borderRadius: "9px",
              background: "var(--db-danger)",
              color: "#ffffff",
              fontSize: "10px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    );
  }

  function renderGroup(mod: NavModule) {
    return (
      <div key={mod.id} style={{ marginBottom: "4px" }}>
        <div
          style={{
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--db-text-tertiary)",
            padding: "10px 12px 3px",
            lineHeight: 1,
          }}
        >
          {t(mod.labelKey)}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
          {mod.pages.map(renderPage)}
        </div>
      </div>
    );
  }

  return (
    <nav
      aria-label={t("navAriaLabel")}
      style={{
        width: "200px",
        minWidth: "200px",
        height: "100vh",
        position: "sticky",
        top: 0,
        display: "flex",
        flexDirection: "column",
        padding: "12px 8px",
        background: "var(--db-bg-surface)",
        borderRight: "1px solid var(--db-border)",
        overflowY: "auto",
        overflowX: "hidden",
        scrollbarWidth: "none",
      }}
    >
      {[...NAV_MODULES, CONFIG_MODULE].map(renderGroup)}

      {showAdmin && (
        <>
          <div
            style={{
              width: "calc(100% - 20px)",
              height: "1px",
              background: "var(--db-border)",
              margin: "8px 10px",
            }}
          />
          <Link
            href="/super-admin"
            title={t("superAdmin")}
            aria-label={t("superAdmin")}
            aria-current={pathname.startsWith("/super-admin") ? "page" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 10px",
              borderRadius: "var(--db-radius)",
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
              fontSize: "13px",
              fontWeight: pathname.startsWith("/super-admin") ? 500 : 400,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            <span style={{ display: "flex", flexShrink: 0 }}><IconShield size={17} stroke={1.6} /></span>
            <span>{t("superAdmin")}</span>
          </Link>
        </>
      )}
    </nav>
  );
}
