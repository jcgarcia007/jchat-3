"use client";

/**
 * JChat 3.0 — Dashboard theme context.
 *
 * Wraps the dashboard shell in a <div data-db-theme={key}> so every child
 * inherits the --db-* variables defined by [data-db-theme="<key>"] in
 * web/styles/themes/dashboard.css. The theme id is seeded server-side from
 * businesses.dashboard_theme_id (see layout.tsx) and can be updated live via
 * setThemeId — used by the Configuration page's theme picker.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import { keyById } from "@/hooks/useDashboardTheme";

interface DashboardThemeContextValue {
  themeId: number;
  themeKey: string;
  setThemeId: (id: number) => void;
}

const DashboardThemeContext = createContext<DashboardThemeContextValue | null>(
  null,
);

export function DashboardThemeProvider({
  initialThemeId = 1,
  children,
}: {
  initialThemeId?: number;
  children: ReactNode;
}) {
  const [themeId, setThemeId] = useState<number>(initialThemeId);
  const themeKey = keyById(themeId);

  return (
    <DashboardThemeContext.Provider value={{ themeId, themeKey, setThemeId }}>
      <div
        data-db-theme={themeKey}
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: "100vh",
        }}
      >
        {children}
      </div>
    </DashboardThemeContext.Provider>
  );
}

export function useDashboardThemeContext(): DashboardThemeContextValue {
  const ctx = useContext(DashboardThemeContext);
  if (ctx === null) {
    throw new Error(
      "useDashboardThemeContext must be used within a DashboardThemeProvider",
    );
  }
  return ctx;
}
