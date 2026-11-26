/**
 * JChat 3.0 — M3 (migration 274): the push texts for the reservation notices (so a Deno test can drive them).
 *
 * reservation_confirmed → "Tu reserva en {local} está confirmada · {fecha} {hora}" / "Your reservation at {venue} is confirmed · {date} {time}"
 * reservation_rejected  → "{local} no pudo aceptar tu reserva" / "{venue} couldn't accept your reservation"
 * reservation_requested → (to the owner / staff) "Nueva solicitud: {n} personas · {fecha} {hora}" / "New request: {n} guests · {date} {time}"
 * reservation_cancelled_by_customer → (to the owner / staff) "{nombre} canceló su reserva · {fecha} {hora}" / "{name} cancelled their reservation · {date} {time}" (migration 277)
 * reservation_reminder  → 24 h: "Mañana a las {hora}: tu reserva en {local}" · 2 h: "En 2 horas: tu reserva en {local} ({n} personas)"
 * Dates and times are written in the VENUE's time zone (payload.timezone, America/New_York when it is missing) and the person's language.
 * All four are transactional: send-push only silences the social and work types, so these always go out. The push carries {business_id, reservation_id}.
 */

import { formatWhen } from "./ownerCloseEmails.ts";

export type ReservationPushType =
  | "reservation_confirmed"
  | "reservation_rejected"
  | "reservation_requested"
  | "reservation_reminder"
  | "reservation_cancelled_by_customer";

export interface ReservationPushContent {
  title: string;
  body: string;
  data: { type: ReservationPushType; payload: { business_id: unknown; reservation_id: unknown } };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function guests(count: number, english: boolean): string {
  if (english) return count === 1 ? "1 guest" : `${count} guests`;
  return count === 1 ? "1 persona" : `${count} personas`;
}

export function reservationPushContent(type: ReservationPushType, payload: Record<string, unknown>, english: boolean): ReservationPushContent {
  const venue = text(payload.business_name) ?? (english ? "the venue" : "el local");
  const reservedAt = text(payload.reserved_at);
  const when = reservedAt ? formatWhen(reservedAt, text(payload.timezone), english ? "en" : "es") : null;
  const n = Number(payload.party_size);
  const party = Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
  const data = { type, payload: { business_id: payload.business_id, reservation_id: payload.reservation_id } };

  if (type === "reservation_confirmed") {
    const tail = when ? ` · ${when.date} ${when.time}` : "";
    return {
      title: english ? "Reservation confirmed" : "Reserva confirmada",
      body: english ? `Your reservation at ${venue} is confirmed${tail}` : `Tu reserva en ${venue} está confirmada${tail}`,
      data,
    };
  }
  if (type === "reservation_rejected") {
    return {
      title: english ? "Reservation not accepted" : "Reserva no aceptada",
      body: english ? `${venue} couldn't accept your reservation` : `${venue} no pudo aceptar tu reserva`,
      data,
    };
  }
  if (type === "reservation_requested") {
    const parts = [party ? guests(party, english) : null, when ? `${when.date} ${when.time}` : null].filter((p): p is string => p !== null);
    return {
      title: english ? "New reservation request" : "Nueva solicitud de reserva",
      body: parts.length > 0
        ? `${english ? "New request" : "Nueva solicitud"}: ${parts.join(" · ")}`
        : (english ? "A guest requested a reservation" : "Un cliente pidió una reserva"),
      data,
    };
  }
  if (type === "reservation_cancelled_by_customer") {
    const who = text(payload.customer_name) ?? (english ? "A guest" : "Un cliente");
    const tail = when ? ` · ${when.date} ${when.time}` : "";
    return {
      title: english ? "Reservation cancelled" : "Reserva cancelada",
      body: english ? `${who} cancelled their reservation${tail}` : `${who} canceló su reserva${tail}`,
      data,
    };
  }
  // reservation_reminder
  const hours = Number(payload.hours_before) === 2 ? 2 : 24;
  if (hours === 2) {
    const tail = party ? ` (${guests(party, english)})` : "";
    return {
      title: english ? "Reservation reminder" : "Recordatorio de reserva",
      body: english ? `In 2 hours: your reservation at ${venue}${tail}` : `En 2 horas: tu reserva en ${venue}${tail}`,
      data,
    };
  }
  return {
    title: english ? "Reservation reminder" : "Recordatorio de reserva",
    body: when
      ? (english ? `Tomorrow at ${when.time}: your reservation at ${venue}` : `Mañana a las ${when.time}: tu reserva en ${venue}`)
      : (english ? `Tomorrow: your reservation at ${venue}` : `Mañana: tu reserva en ${venue}`),
    data,
  };
}
