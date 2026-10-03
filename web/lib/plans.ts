/**
 * JChat 3.0 — Shared catalogue of the BUSINESS plans we OFFER (business/pro/custom).
 *
 * Single source of truth for /pricing and the dashboard billing page. Regular ($0) and
 * Verified ($1.99) are USER tiers (personal accounts / profile badge) — they still exist
 * in the backend Edge Function catalogue, but they are NOT offered here.
 *
 * DATA ONLY — no JSX, no color tokens. /pricing uses GLOBAL tokens (--color-*, --bg-*,
 * --text-*) while billing uses DASHBOARD tokens (--db-*), which do NOT exist outside the
 * dashboard. So each page maps its OWN color/icon per plan id. Putting a --db-* token in
 * this file would break /pricing.
 */

export type CheckoutPlanId = "business" | "pro";
export type OfferedPlanId = CheckoutPlanId | "custom";

export interface OfferedPlan {
  id: OfferedPlanId;
  label: string;
  /** Translated price with its period ("$49 / month") or the contact label. */
  priceLabel: string;
  description: string;
  features: string[];
  /** "checkout" → Stripe Checkout via the EF. "contact" → email us (no price/checkout). */
  cta: "checkout" | "contact";
}

export const SALES_EMAIL = "ventas@jchat.cloud"; // TODO(confirm): correo real de ventas

/** Static data of each offered plan. All visible text lives in the `plans` i18n namespace. */
const OFFERED_PLAN_DEFS: ReadonlyArray<{ id: OfferedPlanId; featureCount: number; cta: OfferedPlan["cta"] }> = [
  { id: "business", featureCount: 6, cta: "checkout" },
  { id: "pro", featureCount: 6, cta: "checkout" },
  { id: "custom", featureCount: 4, cta: "contact" },
];

/** A next-intl translator scoped to the `plans` namespace (`useTranslations("plans")`). */
export type PlansTranslator = (key: string) => string;

/**
 * The offered business plans with their text in the current language. Used by /pricing and by
 * the dashboard billing page, so the copy exists once. Keys: plans.<id>.label | price |
 * description | f1..fN.
 */
export function getOfferedPlans(t: PlansTranslator): OfferedPlan[] {
  return OFFERED_PLAN_DEFS.map((def) => ({
    id: def.id,
    label: t(`${def.id}.label`),
    priceLabel: t(`${def.id}.price`),
    description: t(`${def.id}.description`),
    features: Array.from({ length: def.featureCount }, (_, i) => t(`${def.id}.f${i + 1}`)),
    cta: def.cta,
  }));
}

// ── Planes sociales (usuarios personales) ─────────────────────────────────────
// Checkout social es fase 2. Esta constante es solo para display en /pricing.
// NO confundir con OFFERED_PLANS (planes de negocio). Los tipos no se superponen.

export type SocialPlanId = "free" | "verified" | "pro_social";

export interface SocialPlan {
  id: SocialPlanId;
  /** Precio display — no pasa por Stripe en esta fase. */
  priceLabel: string;
  /** "register" → lleva a /auth/register. "soon" → deshabilitado. */
  cta: "register" | "soon";
}

export const SOCIAL_PLANS: SocialPlan[] = [
  { id: "free",       priceLabel: "$0",          cta: "register" },
  { id: "verified",   priceLabel: "$0.99 / mes",  cta: "soon" },
  { id: "pro_social", priceLabel: "$4.99 / mes",  cta: "soon" },
];
