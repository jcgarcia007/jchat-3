/**
 * JChat 3.0 — internal e-mail to ventas@jchat.cloud for a Custom-plan request (queued by submit_business_plan_request, migration 272).
 * Always Spanish (it is for the sales team). Reply-To is the requester's address (set by the delivery, not here).
 */

import { formatWhen } from "../common.ts";

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
/** One line only: no CR/LF can leak into the subject. */
const oneLine = (s: string): string => s.replace(/[\r\n]+/g, " ").slice(0, 120);

export function buildBusinessPlanRequestEmail(raw: unknown): { subject: string; text: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const business = str(p.business_name);
  const email = str(p.email);
  if (!business || !email) return null;
  const locations = typeof p.locations_count === "number" ? String(p.locations_count) : "—";
  const locale = p.locale === "en" || p.locale === "es" ? (p.locale === "en" ? "inglés" : "español") : "—";
  const requestId = str(p.request_id) ?? "—";
  let received = "—";
  const createdAt = str(p.created_at);
  if (createdAt && !Number.isNaN(Date.parse(createdAt))) {
    const w = formatWhen(createdAt, "America/New_York", "es");
    received = `${w.date}, ${w.time} (hora del Este de EE. UU.)`;
  }
  return {
    subject: `Nueva solicitud de plan Custom — ${oneLine(business)}`,
    text: [
      "Nueva solicitud de plan Custom desde /pricing/business.",
      "",
      `Negocio: ${business}`,
      `Número de locales: ${locations}`,
      `Teléfono: ${str(p.phone) ?? "—"}`,
      `Correo: ${email}`,
      `Idioma del solicitante: ${locale}`,
      "",
      "Mensaje:",
      str(p.message) ?? "(sin mensaje)",
      "",
      `ID de la solicitud: ${requestId}`,
      `Recibida: ${received}`,
      "",
      "Responde a este correo para escribirle al solicitante (Reply-To).",
      "",
      "— JChat",
    ].join("\n"),
  };
}
