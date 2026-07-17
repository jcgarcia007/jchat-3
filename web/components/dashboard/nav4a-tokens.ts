// Dashboard 4A — hi-fi navigation color tokens (SCOPED to the new nav only).
//
// The 4A handoff uses literal JChat Design System hex values (navy rail, brand
// gradient, per-module chip colors) that do NOT exist as --db-* tokens. To keep
// them out of the shared --db-* set AND out of the old components, they live
// here as constants, imported ONLY by the new nav (ModuleRail / ModuleSubnav /
// NewDashboardShell). Nothing else may import this file.

export const NAV4A = {
  navy: "#0D1B3E",
  brandGradient: "linear-gradient(135deg, #378ADD 0%, #534AB7 100%)",
  // Subnav (white column)
  subnavBg: "#ffffff",
  subnavBorder: "#E0E2E7",
  subnavItemActiveBg: "#E6F1FB",
  subnavItemActiveText: "#0C447C",
  subnavItemText: "#374151",
  eyebrow: "#9CA3AF",
  titleNavy: "#0D1B3E",
  // Plan card
  planEyebrow: "#63B3ED",
  planText: "rgba(255,255,255,0.8)",
  // Rail labels
  railLabelActive: "#ffffff",
  railLabelInactive: "rgba(255,255,255,0.6)",
  // Shared
  danger: "#E24B4A",
} as const;

/** Per-module chip colors. Inactive = tint bg + icon color; active = solid bg + white icon + ring. */
export interface ModuleChipColor {
  icon: string; // inactive icon color
  tint: string; // inactive chip background
  solid: string; // active chip background (solid hue)
  ring: string; // active box-shadow ring color (hue @30%)
}

export const MODULE_COLORS: Record<string, ModuleChipColor> = {
  resumen: { icon: "#63B3ED", tint: "rgba(55,138,221,0.18)", solid: "#378ADD", ring: "rgba(55,138,221,0.3)" },
  pedidos: { icon: "#EF9F27", tint: "rgba(239,159,39,0.18)", solid: "#EF9F27", ring: "rgba(239,159,39,0.3)" },
  menu:    { icon: "#9d94f0", tint: "rgba(85,74,183,0.22)",  solid: "#554AB7", ring: "rgba(85,74,183,0.3)" },
  datos:   { icon: "#34d17f", tint: "rgba(34,197,94,0.2)",   solid: "#22C55E", ring: "rgba(34,197,94,0.3)" },
  chat:    { icon: "#c084fc", tint: "rgba(168,85,247,0.2)",  solid: "#A855F7", ring: "rgba(168,85,247,0.3)" },
  pagos:   { icon: "#63B3ED", tint: "rgba(99,179,237,0.2)",  solid: "#63B3ED", ring: "rgba(99,179,237,0.3)" },
  // Configuración is not one of the 6 colored modules — a neutral gear chip.
  configuracion: { icon: "rgba(255,255,255,0.6)", tint: "rgba(255,255,255,0.08)", solid: "rgba(255,255,255,0.16)", ring: "rgba(255,255,255,0.18)" },
};

/** Fallback for modules with no explicit color (defensive). */
export const NEUTRAL_CHIP: ModuleChipColor = MODULE_COLORS.configuracion;

/** Up to two uppercase initials from a name (e.g. "Café Luna" → "CL"). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/** Plan eyebrow text, or null when the plan should not show a card (e.g. admin/regular). */
export function planLabel(plan: string | null | undefined): string | null {
  if (plan === "pro") return "PLAN PRO";
  if (plan === "business") return "PLAN BUSINESS";
  return null;
}

/** "Renueva el 12 jul 2026", or null when there is no renewal date. */
export function renewLine(renewsAt: string | null | undefined): string | null {
  if (!renewsAt) return null;
  const d = new Date(renewsAt);
  if (Number.isNaN(d.getTime())) return null;
  const formatted = d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `Renueva el ${formatted}`;
}
