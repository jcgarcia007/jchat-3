/**
 * JChat 3.0 — "your plan is active" e-mail, sent when a subscription starts (checkout.session.completed). Plain text, ES/EN.
 * Order: greeting · plan active · what is charged and when · how to cancel/change (with the "cancel before {date}, pay nothing" line only
 * when there is a free trial) · support · signature. Never prints a customer id or a subscription id.
 */

import { BILLING_URL, cadenceOf, formatDateLong, formatMoney, type Language, PLAN_LABEL, readSubscriptionPayload, supportLine } from "../common.ts";

export function buildSubscriptionStartedEmail(language: Language, raw: unknown): { subject: string; text: string } | null {
  const p = readSubscriptionPayload(raw);
  if (!p) return null;
  const plan = PLAN_LABEL[p.plan];
  const amount = formatMoney(p.amount_cents, p.currency, language);
  const cadence = cadenceOf(p.interval, language);
  const hasTrial = p.trial_end !== null;
  // With a trial the first charge is on the trial's last day; without one the amount was already charged and the plan renews at period end.
  const firstChargeDate = formatDateLong(hasTrial ? (p.trial_end as string) : p.period_end, language);

  if (language === "en") {
    return {
      subject: `Your ${plan} plan is active`,
      text: [
        "Hi,",
        "",
        `Your ${plan} plan is active.`,
        "",
        hasTrial
          ? `Today you pay nothing. On ${firstChargeDate} you will be charged ${amount} ${cadence} to your card, and then every period until you cancel.`
          : `You were charged ${amount}. Your plan renews on ${firstChargeDate} and then ${cadence}.`,
        "",
        `You can cancel or change plan whenever you want at ${BILLING_URL}.${hasTrial ? ` If you cancel before ${firstChargeDate}, you will not be charged anything.` : ""}`,
        "",
        supportLine("en"),
        "",
        "— JChat",
      ].join("\n"),
    };
  }
  return {
    subject: `Tu plan ${plan} está activo`,
    text: [
      "Hola,",
      "",
      `Tu plan ${plan} está activo.`,
      "",
      hasTrial
        ? `Hoy no pagas nada. El ${firstChargeDate} se cobrarán ${amount} ${cadence} a tu tarjeta, y después en cada periodo hasta que canceles.`
        : `Se cobraron ${amount}. Tu plan se renueva el ${firstChargeDate} y después ${cadence}.`,
      "",
      `Puedes cancelar o cambiar de plan cuando quieras en ${BILLING_URL}.${hasTrial ? ` Si cancelas antes del ${firstChargeDate}, no se te cobra nada.` : ""}`,
      "",
      supportLine("es"),
      "",
      "— JChat",
    ].join("\n"),
  };
}
