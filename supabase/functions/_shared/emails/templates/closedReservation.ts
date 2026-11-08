/**
 * JChat 3.0 — email to a customer whose future reservation was cancelled because the venue closed (D4, mockup E).
 * Moved here unchanged from ownerCloseEmails.ts (the old module re-exports it). No owner data: only the venue name, the date/time (in the venue's
 * time zone) and the support contact.
 */

import { formatWhen, type Language, SUPPORT_CONTACT } from "../common.ts";

export function buildClosedReservationEmail(args: {
  language: Language;
  businessName: string;
  reservedAt: string;
  timezone?: string | null;
}): { subject: string; text: string } {
  const { date, time } = formatWhen(args.reservedAt, args.timezone, args.language);
  if (args.language === "en") {
    return {
      subject: "Reservation cancelled",
      text: [
        `${args.businessName} has closed and your reservation for ${date} at ${time} was cancelled. We're sorry for the inconvenience.`,
        "",
        `If you paid anything in advance, write to ${SUPPORT_CONTACT} with your reservation number.`,
        "",
        "— JChat",
      ].join("\n"),
    };
  }
  return {
    subject: "Reserva cancelada",
    text: [
      `${args.businessName} cerró y tu reserva del ${date} a las ${time} se canceló. Lamentamos las molestias.`,
      "",
      `Si pagaste algo por adelantado, escríbenos a ${SUPPORT_CONTACT} con el número de la reserva.`,
      "",
      "— JChat",
    ].join("\n"),
  };
}
