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
  label: string;
  href: string;
  icon: NavIcon;
  /** Live realtime badge; only "service_pending" exists today. */
  badgeKey?: "service_pending";
}

export interface NavModule {
  id: string;
  label: string;
  icon: NavIcon;
  pages: NavPage[];
}

// The 6 primary modules (in rail order).
export const NAV_MODULES: NavModule[] = [
  {
    id: "resumen",
    label: "Resumen",
    icon: IconLayoutDashboard,
    pages: [
      { label: "Resumen", href: "/dashboard", icon: IconLayoutDashboard },
    ],
  },
  {
    id: "pedidos",
    label: "Pedidos",
    icon: IconShoppingCart,
    pages: [
      { label: "Mesas", href: "/dashboard/tables", icon: IconArmchair },
      { label: "Pedidos", href: "/dashboard/orders", icon: IconShoppingCart },
      { label: "Cocina", href: "/dashboard/kds", icon: IconChefHat },
      { label: "Servicio", href: "/dashboard/service", icon: IconBell, badgeKey: "service_pending" },
      { label: "Reservas", href: "/dashboard/reservations", icon: IconCalendar },
    ],
  },
  {
    id: "menu",
    label: "Menú",
    icon: IconToolsKitchen2,
    pages: [
      { label: "Menú", href: "/dashboard/menu", icon: IconToolsKitchen2 },
      { label: "Inventario", href: "/dashboard/inventory", icon: IconPackage },
      { label: "Ofertas", href: "/dashboard/offers", icon: IconTag },
    ],
  },
  {
    id: "datos",
    label: "Datos",
    icon: IconChartBar,
    pages: [
      { label: "Analítica", href: "/dashboard/analytics", icon: IconChartHistogram },
      { label: "Reportes", href: "/dashboard/reports", icon: IconChartBar },
      { label: "Reseñas", href: "/dashboard/reviews", icon: IconStar },
      { label: "Lealtad", href: "/dashboard/loyalty", icon: IconAward },
    ],
  },
  {
    id: "chat",
    label: "Chat",
    icon: IconMessages,
    pages: [
      { label: "Chat", href: "/dashboard/chat", icon: IconMessageCircle },
      { label: "Salas", href: "/dashboard/chat-rooms", icon: IconMessages },
    ],
  },
  {
    id: "pagos",
    label: "Pagos",
    icon: IconCreditCard,
    pages: [
      { label: "Pagos", href: "/dashboard/payments", icon: IconCreditCard },
      { label: "Disputas", href: "/dashboard/disputes", icon: IconGavel },
      { label: "Facturación", href: "/dashboard/billing", icon: IconReceipt },
    ],
  },
];

// Configuration lives apart, pinned to the bottom of the rail (engranaje).
export const CONFIG_MODULE: NavModule = {
  id: "configuracion",
  label: "Configuración",
  icon: IconSettings,
  pages: [
    { label: "Negocios", href: "/dashboard/configuration/businesses", icon: IconBuildingStore },
    { label: "Configuración", href: "/dashboard/configuration", icon: IconSettings },
    { label: "Empleados", href: "/dashboard/employees", icon: IconUsers },
    { label: "Roles", href: "/dashboard/roles", icon: IconShieldLock },
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
