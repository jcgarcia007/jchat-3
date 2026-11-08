/**
 * JChat 3.0 — one renderer for every kind of queued e-mail (public.outbound_emails.kind). Pure: no I/O.
 * renderEmail returns null for an unknown kind and for a payload that lacks what the text needs; the delivery turns that into a skipped row.
 */

import type { Language } from "./common.ts";
import { buildClosedReservationEmail } from "./templates/closedReservation.ts";
import { buildSubscriptionStartedEmail } from "./templates/subscriptionStarted.ts";
import { buildTrialWillEndEmail } from "./templates/trialWillEnd.ts";
import { buildBusinessPlanRequestEmail } from "./templates/businessPlanRequest.ts";

export const EMAIL_KINDS = ["reservation_cancelled_business_closed", "subscription_started", "trial_will_end", "business_plan_request"] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export const isEmailKind = (kind: unknown): kind is EmailKind => typeof kind === "string" && (EMAIL_KINDS as readonly string[]).includes(kind);

export { buildClosedReservationEmail };

export function renderEmail(kind: string, language: Language, payload: unknown): { subject: string; text: string } | null {
  switch (kind) {
    case "reservation_cancelled_business_closed": {
      const p = payload && typeof payload === "object" ? (payload as { business_name?: unknown; reserved_at?: unknown; timezone?: unknown }) : null;
      if (!p || typeof p.business_name !== "string" || !p.business_name || typeof p.reserved_at !== "string" || !p.reserved_at) return null;
      return buildClosedReservationEmail({
        language,
        businessName: p.business_name,
        reservedAt: p.reserved_at,
        timezone: typeof p.timezone === "string" ? p.timezone : null,
      });
    }
    case "subscription_started":
      return buildSubscriptionStartedEmail(language, payload);
    case "trial_will_end":
      return buildTrialWillEndEmail(language, payload);
    case "business_plan_request":
      return buildBusinessPlanRequestEmail(payload);
    default:
      return null;
  }
}
