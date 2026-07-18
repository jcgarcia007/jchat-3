"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconMapPin, IconShield } from "@tabler/icons-react";
import { isSuperAdmin } from "@/lib/roles";
import {
  NAV_MODULES,
  CONFIG_MODULE,
  findActiveModule,
  type NavModule,
} from "./nav-modules";
import { useServicePending } from "./useServicePending";
import { useActiveBusinessName } from "./useActiveBusinessName";
import { NAV4A, MODULE_COLORS, NEUTRAL_CHIP, initialsOf } from "./nav4a-tokens";

// Dashboard 4A — hi-fi module rail (100px, navy).
//
// Matches the handoff: navy #0D1B3E column, brand-gradient logo on top, 6
// per-module color chips, neutral gear for Config, user avatar pinned bottom
// (VISUAL ONLY — logout now lives inside the Configuración subnav). The business
// selector also moved OUT of the rail into the subnav. Per-module colors come
// from the scoped nav4a-tokens (no --db-* touched, no hex in old components).

/** A module has the pending badge if any page carries service_pending (Pedidos). */
function moduleHasServiceBadge(mod: NavModule): boolean {
  return mod.pages.some((p) => p.badgeKey === "service_pending");
}

function RailChip({
  mod,
  active,
  showBadge,
}: {
  mod: NavModule;
  active: boolean;
  showBadge: boolean;
}) {
  const Icon = mod.icon;
  const href = mod.pages[0]?.href ?? "/dashboard";
  const c = MODULE_COLORS[mod.id] ?? NEUTRAL_CHIP;

  return (
    <Link
      href={href}
      title={mod.label}
      aria-label={mod.label}
      aria-current={active ? "page" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "5px",
        textDecoration: "none",
      }}
    >
      <span
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "46px",
          height: "46px",
          borderRadius: "14px",
          background: active ? c.solid : c.tint,
          color: active ? "#ffffff" : c.icon,
          boxShadow: active ? `0 0 0 3px ${c.ring}` : "none",
          transition: "background 0.15s, box-shadow 0.15s, color 0.15s",
        }}
      >
        <Icon size={20} stroke={1.75} />

        {showBadge && (
          <span
            aria-label="Pendientes"
            style={{
              position: "absolute",
              top: "-2px",
              right: "18px",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: NAV4A.danger,
            }}
          />
        )}
      </span>

      <span
        style={{
          fontSize: "10px",
          fontWeight: 700,
          lineHeight: 1,
          color: active ? NAV4A.railLabelActive : NAV4A.railLabelInactive,
        }}
      >
        {mod.label}
      </span>
    </Link>
  );
}

export function ModuleRail() {
  const pathname = usePathname();
  const [showAdmin, setShowAdmin] = useState(false);
  const { name: bizName } = useActiveBusinessName();
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
  const avatarInitials = bizName ? initialsOf(bizName) : "";

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
        padding: "20px 8px",
        gap: "8px",
        background: NAV4A.navy,
        overflowY: "auto",
        overflowX: "hidden",
        scrollbarWidth: "none",
      }}
    >
      {/* Logo */}
      <div
        aria-hidden
        style={{
          width: "38px",
          height: "38px",
          borderRadius: "11px",
          background: NAV4A.brandGradient,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "14px",
          flexShrink: 0,
        }}
      >
        <IconMapPin size={20} stroke={1.9} color="#ffffff" />
      </div>

      {/* 6 module chips */}
      {NAV_MODULES.map((mod) => (
        <RailChip
          key={mod.id}
          mod={mod}
          active={activeModule?.id === mod.id}
          showBadge={moduleHasServiceBadge(mod) && servicePending > 0}
        />
      ))}

      {/* Configuración — neutral gear chip, then super-admin, then avatar pinned bottom. */}
      <div
        style={{
          marginTop: "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <RailChip
          mod={CONFIG_MODULE}
          active={activeModule?.id === CONFIG_MODULE.id}
          showBadge={false}
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
              gap: "5px",
              textDecoration: "none",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "46px",
                height: "46px",
                borderRadius: "14px",
                background: adminActive ? NEUTRAL_CHIP.solid : NEUTRAL_CHIP.tint,
                color: adminActive ? "#ffffff" : NEUTRAL_CHIP.icon,
                boxShadow: adminActive ? `0 0 0 3px ${NEUTRAL_CHIP.ring}` : "none",
              }}
            >
              <IconShield size={20} stroke={1.75} />
            </span>
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                lineHeight: 1,
                color: adminActive ? NAV4A.railLabelActive : NAV4A.railLabelInactive,
              }}
            >
              Admin
            </span>
          </Link>
        )}

        {/* User avatar — visual only. Logout lives in the Configuración subnav. */}
        <div
          aria-label={bizName ? `Cuenta: ${bizName}` : "Cuenta"}
          title={bizName || "Cuenta"}
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            background: NAV4A.brandGradient,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            fontWeight: 900,
            color: "#ffffff",
            flexShrink: 0,
          }}
        >
          {avatarInitials}
        </div>
      </div>
    </nav>
  );
}
