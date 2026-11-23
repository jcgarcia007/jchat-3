"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { OverviewTabBarGate } from "./OverviewTabBarGate";
import "./dashboard-shell.css";

// Responsive shell: sidebar fixed on desktop, overlay drawer under 768px (closes on outside tap, Escape or navigation).
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        minHeight: "100vh",
        background: "var(--db-bg-base)",
        color: "var(--db-text-primary)",
      }}
    >
      <div className="db-shell-nav" id="dashboard-nav" data-open={navOpen}>
        <Sidebar />
      </div>
      <div className="db-shell-backdrop" data-open={navOpen} onClick={closeNav} aria-hidden />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <TopBar navOpen={navOpen} onToggleNav={() => setNavOpen((o) => !o)} />
        <main className="db-shell-main" style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
          <OverviewTabBarGate />
          {children}
        </main>
      </div>
    </div>
  );
}
