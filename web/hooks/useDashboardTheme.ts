"use client";

import { useEffect, useState, useCallback } from "react";

// ─── Theme registry ──────────────────────────────────────────────────────────
// id matches the position in the Design System table (1–10).
// key is used both as the data-db-theme attribute value and as the CSS class
// suffix (e.g. key "minimal" → class "theme-minimal").
// name is the human-readable display label.

export interface DashboardThemeEntry {
  id: number;
  key: string;
  name: string;
}

export const DASHBOARD_THEMES: DashboardThemeEntry[] = [
  { id: 1,  key: "minimal",       name: "Minimal"       },
  { id: 2,  key: "clean",         name: "Clean"         },
  { id: 3,  key: "glass",         name: "Glass"         },
  { id: 4,  key: "soft",          name: "Soft"          },
  { id: 5,  key: "neo-brutalist", name: "Neo-Brutalist" },
  { id: 6,  key: "dark-pro",      name: "Dark Pro"      },
  { id: 7,  key: "fintech",       name: "Fintech"       },
  { id: 8,  key: "editorial",     name: "Editorial"     },
  { id: 9,  key: "compact",       name: "Compact"       },
  { id: 10, key: "playful",       name: "Playful"       },
];

export function keyById(id: number): string {
  return DASHBOARD_THEMES.find((t) => t.id === id)?.key ?? DASHBOARD_THEMES[0].key;
}

// ─── Palette registry ─────────────────────────────────────────────────────────
// A palette overrides ONLY the accent tokens (--db-accent, --db-accent-bg,
// --db-accent-text) without touching backgrounds, structure, or light/dark mode.
// null palette = native accent from the active theme.

export interface DashboardPaletteEntry {
  id: number;
  key: string;
  name: string;
  accent: string;
}

export const DASHBOARD_PALETTES: DashboardPaletteEntry[] = [
  { id: 1,  key: "indigo",   name: "Índigo",    accent: "#6366F1" },
  { id: 2,  key: "emerald",  name: "Esmeralda", accent: "#10B981" },
  { id: 3,  key: "amber",    name: "Ámbar",     accent: "#F59E0B" },
  { id: 4,  key: "rose",     name: "Rosa",      accent: "#F43F5E" },
  { id: 5,  key: "teal",     name: "Teal",      accent: "#14B8A6" },
  { id: 6,  key: "violet",   name: "Violeta",   accent: "#8B5CF6" },
  { id: 7,  key: "red",      name: "Rojo",      accent: "#EF4444" },
  { id: 8,  key: "graphite", name: "Grafito",   accent: "#64748B" },
  { id: 9,  key: "sky",      name: "Cielo",     accent: "#0EA5E9" },
  { id: 10, key: "lime",     name: "Lima",      accent: "#84CC16" },
];

export function paletteKeyById(id: number | null): string | null {
  if (id === null) return null;
  return DASHBOARD_PALETTES.find((p) => p.id === id)?.key ?? null;
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
