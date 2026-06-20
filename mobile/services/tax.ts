/**
 * JChat 3.0 — Localized sales tax (Stage 3 cleanup)
 * Resolves a tax rate for a business: prefer the authoritative
 * `businesses.tax_rate`; otherwise derive from the business location
 * (US state in the address); otherwise a sane default.
 */

import { supabase, isSupabaseConfigured } from './supabase';

export const DEFAULT_TAX_RATE = 0.08;

/** Approximate combined state sales-tax rates (localization fallback). */
const STATE_TAX_RATES: Record<string, number> = {
  AL: 0.04, AK: 0.0, AZ: 0.056, AR: 0.065, CA: 0.0725, CO: 0.029, CT: 0.0635,
  DE: 0.0, FL: 0.06, GA: 0.04, HI: 0.04, ID: 0.06, IL: 0.0625, IN: 0.07,
  IA: 0.06, KS: 0.065, KY: 0.06, LA: 0.0445, ME: 0.055, MD: 0.06, MA: 0.0625,
  MI: 0.06, MN: 0.06875, MS: 0.07, MO: 0.04225, MT: 0.0, NE: 0.055, NV: 0.0685,
  NH: 0.0, NJ: 0.06625, NM: 0.05125, NY: 0.04, NC: 0.0475, ND: 0.05, OH: 0.0575,
  OK: 0.045, OR: 0.0, PA: 0.06, RI: 0.07, SC: 0.06, SD: 0.045, TN: 0.07,
  TX: 0.0625, UT: 0.0485, VT: 0.06, VA: 0.053, WA: 0.065, WV: 0.06, WI: 0.05,
  WY: 0.04, DC: 0.06,
};

/** Best-effort: detect a US state code in a free-text address → rate. */
export function taxRateFromAddress(address?: string | null): number {
  if (!address) return DEFAULT_TAX_RATE;
  const upper = address.toUpperCase();
  // Match a standalone 2-letter state token (e.g. ", FL 33139").
  const m = upper.match(/\b([A-Z]{2})\b(?:\s+\d{5})?/g);
  if (m) {
    for (let i = m.length - 1; i >= 0; i--) {
      const code = m[i].trim().slice(0, 2);
      if (code in STATE_TAX_RATES) return STATE_TAX_RATES[code];
    }
  }
  return DEFAULT_TAX_RATE;
}

/**
 * Resolve the tax rate for a business: explicit `tax_rate` → address-derived →
 * default. Safe in demo mode (returns the default).
 */
export async function getTaxRateForBusiness(businessId: string | null): Promise<number> {
  if (!isSupabaseConfigured || !businessId) return DEFAULT_TAX_RATE;
  try {
    const { data } = await supabase
      .from('businesses')
      .select('tax_rate, address')
      .eq('id', businessId)
      .maybeSingle();
    if (data?.tax_rate != null) return Number(data.tax_rate);
    return taxRateFromAddress(data?.address as string | undefined);
  } catch {
    return DEFAULT_TAX_RATE;
  }
}
