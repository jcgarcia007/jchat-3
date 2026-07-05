"use client";

import { createContext, useContext } from "react";
import { DEFAULT_PALETTE, type MenuPalette } from "./palettes";

/**
 * Runtime palette for the active menu render. MenuPageClient resolves the
 * palette (the template's original board palette, OR a business-chosen custom
 * palette from the 40-palette catalog) and provides it here. Templates and
 * their module-scoped subcomponents read it with `useMenuPalette()` instead of
 * hardcoding `MENU_PALETTES["<slug>"]`, so a custom palette repaints the whole
 * template. Typography is never touched by this — only colors.
 */
export const MenuPaletteContext = createContext<MenuPalette>(DEFAULT_PALETTE);

export function useMenuPalette(): MenuPalette {
  return useContext(MenuPaletteContext);
}
