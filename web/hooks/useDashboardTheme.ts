"use client";

import { useEffect, useState, useCallback } from "react";

// ─── Theme registry ──────────────────────────────────────────────────────────
// id matches the position in the Design System table (1–10).
// key is used both as the data-db-theme attribute value and as the CSS class
// suffix (e.g. key "midnight-blue" → class "theme-midnight-blue").
// name is the human-readable display label.

export interface DashboardThemeEntry {
  id: number;
  key: string;
  name: string;
}

export const DASHBOARD_THEMES: DashboardThemeEntry[] = [
  { id: 1,  key: "midnight-blue",  name: "Midnight Blue"  },
  { id: 2,  key: "clean-white",    name: "Clean White"    },
  { id: 3,  key: "forest-green",   name: "Forest Green"   },
  { id: 4,  key: "royal-purple",   name: "Royal Purple"   },
  { id: 5,  key: "slate-gray",     name: "Slate Gray"     },
  { id: 6,  key: "sunset-orange",  name: "Sunset Orange"  },
  { id: 7,  key: "rose-crimson",   name: "Rose Crimson"   },
  { id: 8,  key: "ocean-teal",     name: "Ocean Teal"     },
  { id: 9,  key: "gold-black",     name: "Gold Black"     },
  { id: 10, key: "arctic-white",   name: "Arctic White"   },
];

export function keyById(id: number): string {
  return DASHBOARD_THEMES.find((t) => t.id === id)?.key ?? DASHBOARD_THEMES[0].key;
}

// ─── Hook ────────────────────────────────────────────────────────────────────
// Accepts the initial theme id (e.g. from businesses.dashboard_theme_id), sets
// `data-db-theme` on the target element, and returns the current key + setter.
//
// Persistence to the DB is intentionally omitted here (Stage 0 scope).
// TODO(Stage 2): persist theme_id to Supabase via
//   supabase.from("businesses").update({ dashboard_theme_id: id }).eq("id", businessId)
// Call that after setThemeId() resolves inside the dashboard settings page.

export function useDashboardTheme(
  initialThemeId: number = 1,
  target: (() => HTMLElement | null) | null = null,
): {
  themeKey: string;
  themeId: number;
  setThemeId: (id: number) => void;
} {
  const [themeId, setThemeId] = useState<number>(initialThemeId);
  const themeKey = keyById(themeId);

  const applyTheme = useCallback(
    (key: string) => {
      const el =
        target !== null
          ? target()
          : typeof document !== "undefined"
          ? document.documentElement
          : null;

      if (!el) return;
      el.setAttribute("data-db-theme", key);
    },
    [target],
  );

  useEffect(() => {
    applyTheme(themeKey);

    // Clean up the attribute when the component using this hook unmounts,
    // so it doesn't leak onto document.documentElement between navigations.
    return () => {
      const el =
        target !== null
          ? target()
          : typeof document !== "undefined"
          ? document.documentElement
          : null;

      el?.removeAttribute("data-db-theme");
    };
  }, [themeKey, applyTheme, target]);

  return { themeKey, themeId, setThemeId };
}
