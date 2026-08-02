"use client";

import { usePathname } from "next/navigation";
import { OverviewTabBar } from "./OverviewTabBar";

// Exact set of paths where the Overview tab bar must appear.
// Match is exact (not prefix-based) so /dashboard/tables, /dashboard/orders,
// etc. never show the bar.
const OVERVIEW_PATHS = new Set([
  "/dashboard",
  "/dashboard/floor",
  "/dashboard/queue",
  "/dashboard/sales",
  "/dashboard/summary",
  "/dashboard/reservations",
  "/dashboard/service",
  "/dashboard/reviews",
  "/dashboard/map",
]);

export function OverviewTabBarGate() {
  const raw = usePathname();
  // Strip trailing slash to normalise (Next omits it by default; guard anyway).
  const pathname = raw.endsWith("/") && raw.length > 1 ? raw.slice(0, -1) : raw;
  if (!OVERVIEW_PATHS.has(pathname)) return null;
  return <OverviewTabBar />;
}
