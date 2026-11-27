import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { reservationPushContent } from "./reservationPush.ts";

// 2026-11-20 20:00 in Santo Domingo (UTC-4) = 2026-11-21T00:00:00Z
const P = { business_id: "b1", reservation_id: "r1", business_name: "Bar Luna", reserved_at: "2026-11-21T00:00:00Z", timezone: "America/Santo_Domingo", party_size: 4 };
const norm = (s: string) => s.replace(/[  ]/g, " ");

Deno.test("confirmed: venue, date and time in the venue's zone (es and en)", () => {
  const es = norm(reservationPushContent("reservation_confirmed", P, false).body);
  const en = norm(reservationPushContent("reservation_confirmed", P, true).body);
  assertEquals(es.startsWith("Tu reserva en Bar Luna está confirmada · "), true);
  assertEquals(es, "Tu reserva en Bar Luna está confirmada · 20 de noviembre de 2026 20:00");
  assertEquals(en.startsWith("Your reservation at Bar Luna is confirmed · "), true);
  assertEquals(en, "Your reservation at Bar Luna is confirmed · November 20, 2026 8:00 PM");
});

Deno.test("confirmed: the time is the venue's, not UTC", () => {
  // same instant, a New York venue: 7:00 PM (EST)
  const en = norm(reservationPushContent("reservation_confirmed", { ...P, timezone: "America/New_York" }, true).body);
  assertEquals(en.includes("7:00 PM"), true);
  assertEquals(en.includes("12:00 AM"), false);
});

Deno.test("rejected: es and en, no date", () => {
  assertEquals(reservationPushContent("reservation_rejected", P, false).body, "Bar Luna no pudo aceptar tu reserva");
  assertEquals(reservationPushContent("reservation_rejected", P, true).body, "Bar Luna couldn't accept your reservation");
});

Deno.test("requested: guests and when (singular and plural)", () => {
  const es = norm(reservationPushContent("reservation_requested", P, false).body);
  assertEquals(es.startsWith("Nueva solicitud: 4 personas · "), true);
  assertEquals(norm(reservationPushContent("reservation_requested", { ...P, party_size: 1 }, true).body).startsWith("New request: 1 guest · "), true);
  assertEquals(reservationPushContent("reservation_requested", { business_id: "b1" }, false).body, "Un cliente pidió una reserva");
});

Deno.test("reminder 24 h: 'Mañana a las {hora}' / 'Tomorrow at {time}'", () => {
  const es = norm(reservationPushContent("reservation_reminder", { ...P, hours_before: 24 }, false).body);
  const en = norm(reservationPushContent("reservation_reminder", { ...P, hours_before: 24 }, true).body);
  assertEquals(es.startsWith("Mañana a las ") && es.endsWith(": tu reserva en Bar Luna"), true);
  assertEquals(en, "Tomorrow at 8:00 PM: your reservation at Bar Luna");
});

Deno.test("reminder 2 h: 'En 2 horas' with the party size", () => {
  assertEquals(reservationPushContent("reservation_reminder", { ...P, hours_before: 2 }, false).body, "En 2 horas: tu reserva en Bar Luna (4 personas)");
  assertEquals(reservationPushContent("reservation_reminder", { ...P, hours_before: 2, party_size: 1 }, true).body, "In 2 hours: your reservation at Bar Luna (1 guest)");
});

Deno.test("missing venue name and missing time still read well", () => {
  const p = { business_id: "b1", reservation_id: "r1", hours_before: 24 };
  assertEquals(reservationPushContent("reservation_reminder", p, false).body, "Mañana: tu reserva en el local");
  assertEquals(reservationPushContent("reservation_rejected", p, true).body, "the venue couldn't accept your reservation");
});

Deno.test("the push carries only the type, the business id and the reservation id", () => {
  const c = reservationPushContent("reservation_confirmed", { ...P, secret: "x", reason: "no_availability" }, false);
  assertEquals(c.data, { type: "reservation_confirmed", payload: { business_id: "b1", reservation_id: "r1" } });
});

Deno.test("cancelled by the customer (migration 277): who, and when in the venue's zone; es and en; fallback without a name", () => {
  const p = { ...P, customer_name: "Carla" };
  const es = norm(reservationPushContent("reservation_cancelled_by_customer", p, false).body);
  const en = norm(reservationPushContent("reservation_cancelled_by_customer", p, true).body);
  assertEquals(es.startsWith("Carla canceló su reserva · "), true);
  assertEquals(en.startsWith("Carla cancelled their reservation · ") && en.includes("8:00 PM"), true);
  assertEquals(reservationPushContent("reservation_cancelled_by_customer", { business_id: "b1" }, false).body, "Un cliente canceló su reserva");
  assertEquals(reservationPushContent("reservation_cancelled_by_customer", { business_id: "b1" }, true).body, "A guest cancelled their reservation");
  // the push still carries only the type and the two ids (the customer's name travels in the body, not in data)
  assertEquals(reservationPushContent("reservation_cancelled_by_customer", p, true).data, { type: "reservation_cancelled_by_customer", payload: { business_id: "b1", reservation_id: "r1" } });
});

Deno.test("H-028 / H-032: Spanish 24 h and date in Spanish order, English 12 h and date in English order, no mixing", () => {
  // 2026-11-24T01:00Z = 23 Nov 20:00 in New York
  const p = { ...P, reserved_at: "2026-11-24T01:00:00Z", timezone: "America/New_York" };
  assertEquals(norm(reservationPushContent("reservation_confirmed", p, false).body), "Tu reserva en Bar Luna está confirmada · 23 de noviembre de 2026 20:00");
  assertEquals(norm(reservationPushContent("reservation_confirmed", p, true).body), "Your reservation at Bar Luna is confirmed · November 23, 2026 8:00 PM");
  assertEquals(reservationPushContent("reservation_reminder", { ...p, hours_before: 24 }, false).body, "Mañana a las 20:00: tu reserva en Bar Luna");
  // morning hours: 24 h zero-padded in Spanish, AM in English
  const am = { ...p, reserved_at: "2026-11-24T14:05:00Z" }; // 09:05 New York
  assertEquals(norm(reservationPushContent("reservation_requested", am, false).body), "Nueva solicitud: 4 personas · 24 de noviembre de 2026 09:05");
  assertEquals(norm(reservationPushContent("reservation_requested", am, true).body), "New request: 4 guests · November 24, 2026 9:05 AM");
});
