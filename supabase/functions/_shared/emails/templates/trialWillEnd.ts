/**
 * JChat 3.0 — "your free trial ends" e-mail (customer.subscription.trial_will_end, 3 days before the end). Plain text, ES/EN.
 * THIS TEXT IS THE LEGAL NOTICE of the automatic-renewal laws (what will be charged, when, to which card, how to avoid it): do not shorten it.
 * The card's last four digits appear only when they come in the payload.
 */

import { BILLING_URL, cadenceOf, formatDateLong, formatMoney, type Language, PLAN_LABEL, readSubscriptionPayload, supportLine } from "../common.ts";

export function buildTrialWillEndEmail(language: Language, raw: unknown): { subject: string; text: string } | null {
  const p = readSubscriptionPayload(raw);
  if (!p || p.trial_end === null) return null;
  const plan = PLAN_LABEL[p.plan];
  const amount = formatMoney(p.amount_cents, p.currency, language);
  const cadence = cadenceOf(p.interval, language);
  const date = formatDateLong(p.trial_end, language);

  if (language === "en") {
    const card = p.last4 ? `the card ending in ${p.last4}` : "your card";
    return {
      subject: `Your free trial ends on ${date}`,
      text: [
        "Hi,",
        "",
        `On ${date} your ${plan} trial ends. That day you will be charged ${amount} ${cadence} to ${card}. If you don't want to continue, cancel before then at ${BILLING_URL}: you will not be charged anything. If you do nothing, your plan stays active.`,
        "",
        supportLine("en"),
        "",
        "— JChat",
      ].join("\n"),
    };
  }
  const card = p.last4 ? `la tarjeta terminada en ${p.last4}` : "tu tarjeta";
  return {
    subject: `Tu prueba gratis termina el ${date}`,
    text: [
      "Hola,",
      "",
      `El ${date} termina tu prueba de ${plan}. Ese día se cobrarán ${amount} ${cadence} a ${card}. Si no quieres continuar, cancela antes en ${BILLING_URL}: no se te cobrará nada. Si no haces nada, tu plan sigue activo.`,
      "",
      supportLine("es"),
      "",
      "— JChat",
    ].join("\n"),
  };
}
