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
  /** "$49 / mes", "$99 / mes", "Contáctanos". */
  priceLabel: string;
  description: string;
  features: string[];
  /** "checkout" → Stripe Checkout via the EF. "contact" → email us (no price/checkout). */
  cta: "checkout" | "contact";
}

export const SALES_EMAIL = "ventas@jchat.cloud"; // TODO(confirm): correo real de ventas

export const OFFERED_PLANS: OfferedPlan[] = [
  {
    id: "business",
    label: "Business",
    priceLabel: "$49 / mes",
    description: "POS completo, programa de lealtad y gestión de personal.",
    features: [
      "POS + KDS completo",
      "Programa de lealtad",
      "Gestión de empleados",
      "Reservas",
      "Control de inventario",
      "Hasta 1 negocio y 1 evento",
    ],
    cta: "checkout",
  },
  {
    id: "pro",
    label: "Pro",
    priceLabel: "$99 / mes",
    description: "Analíticas avanzadas, menú ilimitado y soporte prioritario.",
    features: [
      "Todo lo de Business",
      "Analíticas avanzadas y ROI",
      "Ítems de menú ilimitados",
      "Payouts con Stripe Connect",
      "Soporte prioritario",
      "Hasta 10 negocios y 10 eventos",
    ],
    cta: "checkout",
  },
  {
    id: "custom",
    label: "Custom",
    priceLabel: "Contáctanos",
    description: "Para cadenas o necesidades más allá de Pro. Un plan a tu medida.",
    features: [
      "Más de 10 negocios / eventos",
      "Onboarding dedicado",
      "Soporte prioritario",
      "Facturación personalizada",
    ],
    cta: "contact",
  },
];
