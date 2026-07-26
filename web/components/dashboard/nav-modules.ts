// Dashboard 4A — single source of truth for the new navigation.
//
// Maps the 21 real dashboard pages into 6 modules + Configuration, EXACTLY as
// decided in docs/design/dashboard-4a/STATUS.md (Bloqueante 1 — RESUELTO).
// Hrefs and icons reuse the SAME /dashboard/* routes the old Sidebar links to.
//
// This file is pure data (no client hooks) so it can be imported by both the
// server layout and the client nav components. It powers the new rail + subnav
// ONLY; the old Sidebar keeps its own NAV_ITEMS list untouched (Fase 0 = cero
// riesgo). Pages are NOT migrated here — that is Fase 1+.

import {
  IconLayoutDashboard,
  IconShoppingCart,
  IconChefHat,
  IconBell,
  IconArmchair,
  IconCalendar,
  IconToolsKitchen2,
  IconPackage,
  IconTag,
  IconChartBar,
  IconChartHistogram,
  IconStar,
  IconAward,
  IconMessages,
  IconMessageCircle,
  IconCreditCard,
  IconGavel,
  IconReceipt,
  IconSettings,
  IconUsers,
  IconShieldLock,
  IconBuildingStore,
} from "@tabler/icons-react";

export type NavIcon = React.ComponentType<{ size?: number; stroke?: number }>;

export interface NavPage {
  /** Key into the 'dashboardCommon' i18n namespace (e.g. "railMesas"). */
  labelKey: string;
  href: string;
  icon: NavIcon;
  /** Live realtime badge; only "service_pending" exists today. */
  badgeKey?: "service_pending";
}

export interface NavModule {
  id: string;
  /** Key into the 'dashboardCommon' i18n namespace (e.g. "railPedidos"). */
  labelKey: string;
  icon: NavIcon;
  pages: NavPage[];
}

// The 6 primary modules (in rail order).
export const NAV_MODULES: NavModule[] = [
  {
    id: "resumen",
    labelKey: "railResumen",
    icon: IconLayoutDashboard,
    pages: [
      { labelKey: "railResumen", href: "/dashboard", icon: IconLayoutDashboard },
    ],
  },
  {
    id: "pedidos",
    labelKey: "railPedidos",
    icon: IconShoppingCart,
    pages: [
      { labelKey: "railMesas", href: "/dashboard/tables", icon: IconArmchair },
      { labelKey: "railPedidos", href: "/dashboard/orders", icon: IconShoppingCart },
      { labelKey: "railCocina", href: "/dashboard/kds", icon: IconChefHat },
      { labelKey: "railServicio", href: "/dashboard/service", icon: IconBell, badgeKey: "service_pending" },
      { labelKey: "railReservas", href: "/dashboard/reservations", icon: IconCalendar },
    ],
  },
  {
    id: "menu",
    labelKey: "railMenu",
    icon: IconToolsKitchen2,
    pages: [
      { labelKey: "railMenu", href: "/dashboard/menu", icon: IconToolsKitchen2 },
      { labelKey: "railInventario", href: "/dashboard/inventory", icon: IconPackage },
      { labelKey: "railOfertas", href: "/dashboard/offers", icon: IconTag },
    ],
  },
  {
    id: "datos",
    labelKey: "railDatos",
    icon: IconChartBar,
    pages: [
      { labelKey: "railAnalitica", href: "/dashboard/analytics", icon: IconChartHistogram },
      { labelKey: "railReportes", href: "/dashboard/reports", icon: IconChartBar },
      { labelKey: "railResenas", href: "/dashboard/reviews", icon: IconStar },
      { labelKey: "railLealtad", href: "/dashboard/loyalty", icon: IconAward },
    ],
  },
  {
    id: "chat",
    labelKey: "railChat",
    icon: IconMessages,
    pages: [
      { labelKey: "railChat", href: "/dashboard/chat", icon: IconMessageCircle },
      { labelKey: "railSalas", href: "/dashboard/chat-rooms", icon: IconMessages },
    ],
  },
  {
    id: "pagos",
    labelKey: "railPagos",
    icon: IconCreditCard,
    pages: [
      { labelKey: "railPagos", href: "/dashboard/payments", icon: IconCreditCard },
      { labelKey: "railDisputas", href: "/dashboard/disputes", icon: IconGavel },
      { labelKey: "railFacturacion", href: "/dashboard/billing", icon: IconReceipt },
    ],
  },
];

// Configuration lives apart, pinned to the bottom of the rail (engranaje).
export const CONFIG_MODULE: NavModule = {
  id: "configuracion",
  labelKey: "railConfiguracion",
  icon: IconSettings,
  pages: [
    { labelKey: "railNegocios", href: "/dashboard/configuration/businesses", icon: IconBuildingStore },
    { labelKey: "railConfiguracion", href: "/dashboard/configuration", icon: IconSettings },
    { labelKey: "railEmpleados", href: "/dashboard/employees", icon: IconUsers },
    { labelKey: "railRoles", href: "/dashboard/roles", icon: IconShieldLock },
  ],
};

/** True when `href` is the active route for the given pathname. */
export function isNavPageActive(href: string, pathname: string): boolean {
  // Overview owns exactly /dashboard; every other page also matches its subtree.
  return href === "/dashboard"
    ? pathname === "/dashboard"
    : pathname === href || pathname.startsWith(href + "/");
}

/**
 * The single active page href within a module's pages, resolved by LONGEST
 * prefix match. This matters for nested routes: /dashboard/configuration/businesses
 * matches BOTH "Configuración" (/dashboard/configuration) and "Negocios" via
 * isNavPageActive, but only the longer, more specific href should highlight.
 * Returns null when no page matches.
 */
export function resolveActivePageHref(pages: NavPage[], pathname: string): string | null {
  let best: string | null = null;
  for (const p of pages) {
    if (isNavPageActive(p.href, pathname)) {
      if (best === null || p.href.length > best.length) best = p.href;
    }
  }
  return best;
}

/**
 * Which module (of the 6 + Config) contains the current pathname, or null when
 * the route belongs to no module (e.g. /dashboard/create, /dashboard/events).
 * Config is checked last so it never shadows a primary module.
 */
export function findActiveModule(pathname: string): NavModule | null {
  const all = [...NAV_MODULES, CONFIG_MODULE];
  for (const mod of all) {
    if (mod.pages.some((p) => isNavPageActive(p.href, pathname))) return mod;
  }
  return null;
}
