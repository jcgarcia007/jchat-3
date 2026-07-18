"use client";

import { usePathname } from "next/navigation";
import { ModuleRail } from "./ModuleRail";
import { ModuleSubnav } from "./ModuleSubnav";
import { findActiveModule } from "./nav-modules";
import { NAV4A } from "./nav4a-tokens";

// Dashboard 4A — client shell for the new navigation (Fase 0).
//
// Three columns: 100px navy rail · 230px white subnav · content. The server
// layout picks old-vs-new by env var; THIS component owns the pathname-dependent
// decisions. No TopBar — the 4A design removes it. Auth/plan gate stays in the
// server layout and is untouched.
//
// The subnav is now GLOBAL (business selector + plan card always show); the
// active module (may be null for /dashboard/create, /dashboard/events) only
// drives its eyebrow + section list.

export function NewDashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeModule = findActiveModule(pathname);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        minHeight: "100vh",
        background: NAV4A.subnavBg,
        color: NAV4A.titleNavy,
      }}
    >
      {/* 100px navy module rail */}
      <ModuleRail />

      {/* 230px contextual subnav (global selector + plan; contextual list) */}
      <ModuleSubnav module={activeModule} />

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
