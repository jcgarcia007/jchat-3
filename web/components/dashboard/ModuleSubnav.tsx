"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconSelector, IconLogout } from "@tabler/icons-react";
import { supabase } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { isNavPageActive, CONFIG_MODULE, type NavModule } from "./nav-modules";
import { useServicePending } from "./useServicePending";
import { NAV4A, planLabel, renewLine, initialsOf } from "./nav4a-tokens";

// Dashboard 4A — hi-fi contextual subnav (230px, white).
//
// GLOBAL chrome: the business selector (top) and the plan card (bottom) always
// render — even for Resumen and no-module routes. Only the section LIST is
// conditional (hidden when the active module has <2 pages, e.g. Resumen).
// Logout lives here, at the end of the Configuración list. Colors come from the
// scoped nav4a-tokens.

interface PlanInfo {
  plan: string | null;
  renewsAt: string | null;
}

function BusinessSelector({ name }: { name: string }) {
  const initials = name ? initialsOf(name) : "";
  // Navigating to Overview (/dashboard) is the existing business-switch surface.
  return (
    <Link
      href="/dashboard"
      aria-label={name ? `Cambiar negocio, actual: ${name}` : "Cambiar negocio"}
      title={name || "Cambiar negocio"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px",
        borderRadius: "14px",
        border: `0.5px solid ${NAV4A.subnavBorder}`,
        textDecoration: "none",
        marginBottom: "20px",
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
          {name || "Selecciona negocio"}
        </span>
        <span style={{ display: "block", fontSize: "11px", color: NAV4A.eyebrow }}>
          Cambiar negocio
        </span>
      </span>
      <IconSelector size={16} stroke={1.7} color={NAV4A.eyebrow} />
    </Link>
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
  const [bizName, setBizName] = useState<string>("");
  const [plan, setPlan] = useState<PlanInfo | null>(null);

  useEffect(() => {
    let active = true;
    void resolveActiveBusiness().then((res) => {
      if (active && res.ok) setBizName(res.business.name);
    });
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
      {/* Business selector — global */}
      <BusinessSelector name={bizName} />

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
          const isActive = isNavPageActive(href, pathname);
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
