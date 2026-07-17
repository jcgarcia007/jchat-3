"use client";

import { usePathname } from "next/navigation";
import { ModuleRail } from "./ModuleRail";
import { ModuleSubnav } from "./ModuleSubnav";
import { findActiveModule } from "./nav-modules";

// Dashboard 4A — client shell for the new navigation (Fase 0).
//
// The server layout picks old-vs-new by env var; THIS component owns the
// pathname-dependent decisions (which module is active, whether the subnav
// shows). No TopBar — the 4A design removes it. Auth/plan gate stays in the
// server layout and is untouched.
//
// Subnav rule (STATUS.md): render the 230px subnav ONLY when the active module
// has 2+ pages. Resumen (1 page) and no-module routes (create, events) go
// full-width with no subnav.

export function NewDashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeModule = findActiveModule(pathname);
  const showSubnav = !!activeModule && activeModule.pages.length >= 2;

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
      {/* 100px module rail */}
      <ModuleRail />

      {/* 230px contextual subnav — only for modules with 2+ pages */}
      {showSubnav && activeModule && <ModuleSubnav module={activeModule} />}

      {/* Main content column (no TopBar in 4A) */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          overflowY: "auto",
          padding: "24px",
        }}
      >
        {children}
      </main>
    </div>
  );
}
