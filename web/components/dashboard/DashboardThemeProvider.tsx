"use client";

/**
 * JChat 3.0 — Dashboard theme + palette context.
 *
 * Wraps the dashboard shell in a <div data-db-theme={key} data-db-palette={paletteKey}>
 * so every child inherits the --db-* variables defined in dashboard.css.
 * Theme controls backgrounds/structure/typography; palette overrides only the
 * 3 accent tokens (--db-accent, --db-accent-bg, --db-accent-text).
 * null palette = no data-db-palette attribute = native theme accent.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import { keyById, paletteKeyById } from "@/hooks/useDashboardTheme";

interface DashboardThemeContextValue {
  themeId: number;
  themeKey: string;
  setThemeId: (id: number) => void;
  paletteId: number | null;
  paletteKey: string | null;
  setPaletteId: (id: number | null) => void;
}

const DashboardThemeContext = createContext<DashboardThemeContextValue | null>(
  null,
);

export function DashboardThemeProvider({
  initialThemeId = 1,
  initialPaletteId = null,
  children,
}: {
  initialThemeId?: number;
  initialPaletteId?: number | null;
  children: ReactNode;
}) {
  const [themeId, setThemeId] = useState<number>(initialThemeId);
  const [paletteId, setPaletteId] = useState<number | null>(initialPaletteId);

  const themeKey = keyById(themeId);
  const paletteKey = paletteKeyById(paletteId);

  return (
    <DashboardThemeContext.Provider
      value={{ themeId, themeKey, setThemeId, paletteId, paletteKey, setPaletteId }}
    >
      <div
        data-db-theme={themeKey}
        data-db-palette={paletteKey ?? undefined}
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: "100vh",
          fontFamily: "var(--db-font)",
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
