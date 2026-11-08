import { assert, assertEquals, assertFalse, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { BILLING_URL, SUPPORT_CONTACT } from "./common.ts";
import { buildClosedReservationEmail, EMAIL_KINDS, isEmailKind, renderEmail } from "./render.ts";

const TRIAL_END = "2026-12-08T15:00:00Z"; // December 8, 2026 in New York
const PERIOD_END = "2027-06-08T15:00:00Z";

const base = (over: Record<string, unknown> = {}) => ({
  plan: "pro",
  interval: "month",
  amount_cents: 9900,
  currency: "usd",
  trial_end: TRIAL_END,
  period_end: TRIAL_END,
  subscription_id: "sub_SECRET_123",
  ...over,
});

// ── subscription_started ──────────────────────────────────────────────────────

Deno.test("subscription_started (ES, with trial): the exact legal sentence, one per interval", () => {
  const cases: [string, number, string, string][] = [
    ["month", 9900, "$99.00", "cada mes"],
    ["6month", 53400, "$534.00", "cada 6 meses"],
    ["year", 94800, "$948.00", "cada año"],
  ];
  for (const [interval, cents, amount, cadence] of cases) {
    const mail = renderEmail("subscription_started", "es", base({ interval, amount_cents: cents }))!;
    assertEquals(mail.subject, "Tu plan Pro está activo");
    assertStringIncludes(mail.text, "Tu plan Pro está activo.");
    assertStringIncludes(mail.text, `Hoy no pagas nada. El 8 de diciembre de 2026 se cobrarán ${amount} ${cadence} a tu tarjeta, y después en cada periodo hasta que canceles.`);
    assertStringIncludes(mail.text, `Puedes cancelar o cambiar de plan cuando quieras en ${BILLING_URL}. Si cancelas antes del 8 de diciembre de 2026, no se te cobra nada.`);
    assertStringIncludes(mail.text, `Escríbenos a ${SUPPORT_CONTACT}`);
    assert(mail.text.startsWith("Hola,\n"));
    assert(mail.text.endsWith("— JChat"));
  }
});

Deno.test("subscription_started (EN, with trial): the exact legal sentence, one per interval", () => {
  const cases: [string, number, string, string][] = [
    ["month", 4900, "$49.00", "every month"],
    ["6month", 26400, "$264.00", "every 6 months"],
    ["year", 46800, "$468.00", "every year"],
  ];
  for (const [interval, cents, amount, cadence] of cases) {
    const mail = renderEmail("subscription_started", "en", base({ plan: "business", interval, amount_cents: cents }))!;
    assertEquals(mail.subject, "Your Business plan is active");
    assertStringIncludes(mail.text, `Today you pay nothing. On December 8, 2026 you will be charged ${amount} ${cadence} to your card, and then every period until you cancel.`);
    assertStringIncludes(mail.text, `If you cancel before December 8, 2026, you will not be charged anything.`);
    assertStringIncludes(mail.text, `Write to ${SUPPORT_CONTACT}`);
    assert(mail.text.startsWith("Hi,\n"));
  }
});

Deno.test("subscription_started without a trial: 'charged' + renewal date, and NO 'cancel before … pay nothing' line", () => {
  const es = renderEmail("subscription_started", "es", base({ plan: "business", interval: "year", amount_cents: 46800, trial_end: null, period_end: PERIOD_END }))!;
  assertStringIncludes(es.text, "Se cobraron $468.00. Tu plan se renueva el 8 de junio de 2027 y después cada año.");
  assertFalse(es.text.includes("Hoy no pagas nada"));
  assertFalse(es.text.includes("no se te cobra nada"));
  assertStringIncludes(es.text, `Puedes cancelar o cambiar de plan cuando quieras en ${BILLING_URL}.`);
  const en = renderEmail("subscription_started", "en", base({ interval: "6month", amount_cents: 53400, trial_end: null, period_end: PERIOD_END }))!;
  assertStringIncludes(en.text, "You were charged $534.00. Your plan renews on June 8, 2027 and then every 6 months.");
  assertFalse(en.text.includes("Today you pay nothing"));
  assertFalse(en.text.includes("will not be charged anything"));
});

// ── trial_will_end (the legal notice: the full text must stay) ───────────────────

Deno.test("trial_will_end (ES): the full legal text, with and without the card's last four", () => {
  const withCard = renderEmail("trial_will_end", "es", base({ interval: "6month", amount_cents: 53400, last4: "4242" }))!;
  assertEquals(withCard.subject, "Tu prueba gratis termina el 8 de diciembre de 2026");
  assertStringIncludes(
    withCard.text,
    `El 8 de diciembre de 2026 termina tu prueba de Pro. Ese día se cobrarán $534.00 cada 6 meses a la tarjeta terminada en 4242. Si no quieres continuar, cancela antes en ${BILLING_URL}: no se te cobrará nada. Si no haces nada, tu plan sigue activo.`,
  );
  assertStringIncludes(withCard.text, `Escríbenos a ${SUPPORT_CONTACT}`);
  assert(withCard.text.endsWith("— JChat"));
  const noCard = renderEmail("trial_will_end", "es", base())!;
  assertStringIncludes(noCard.text, "Ese día se cobrarán $99.00 cada mes a tu tarjeta. Si no quieres continuar");
  assertFalse(noCard.text.includes("terminada en"));
});

Deno.test("trial_will_end (EN): the full legal text, with and without the card's last four", () => {
  const withCard = renderEmail("trial_will_end", "en", base({ plan: "business", interval: "year", amount_cents: 46800, last4: "0005" }))!;
  assertEquals(withCard.subject, "Your free trial ends on December 8, 2026");
  assertStringIncludes(
    withCard.text,
    `On December 8, 2026 your Business trial ends. That day you will be charged $468.00 every year to the card ending in 0005. If you don't want to continue, cancel before then at ${BILLING_URL}: you will not be charged anything. If you do nothing, your plan stays active.`,
  );
  const noCard = renderEmail("trial_will_end", "en", base())!;
  assertStringIncludes(noCard.text, "you will be charged $99.00 every month to your card. If you don't want to continue");
  assertFalse(noCard.text.includes("card ending in"));
});

Deno.test("trial_will_end needs a trial end; a malformed last4 is ignored", () => {
  assertEquals(renderEmail("trial_will_end", "es", base({ trial_end: null })), null);
  const mail = renderEmail("trial_will_end", "es", base({ last4: "42; DROP" }))!;
  assertFalse(mail.text.includes("terminada en"));
});

Deno.test("subscription e-mails never print the subscription or customer id", () => {
  const payload = base({ subscription_id: "sub_SECRET_123", stripe_customer_id: "cus_SECRET_456", last4: "4242" });
  for (const kind of ["subscription_started", "trial_will_end"]) {
    for (const lang of ["es", "en"] as const) {
      const mail = renderEmail(kind, lang, payload)!;
      assertFalse(mail.text.includes("sub_SECRET_123") || mail.subject.includes("sub_SECRET_123"));
      assertFalse(mail.text.includes("cus_SECRET_456"));
      assertFalse(mail.text.includes("sub_"));
      assertFalse(mail.text.includes("cus_"));
    }
  }
});

Deno.test("subscription payload validation: bad plan, interval, amount, currency or dates → null", () => {
  for (const bad of [
    base({ plan: "regular" }),
    base({ plan: undefined }),
    base({ interval: "weekly" }),
    base({ amount_cents: "9900" }),
    base({ amount_cents: 99.5 }),
    base({ amount_cents: -1 }),
    base({ currency: "dollars" }),
    base({ period_end: "not a date" }),
    base({ trial_end: "not a date" }),
    null,
    "text",
  ]) {
    assertEquals(renderEmail("subscription_started", "es", bad), null);
    assertEquals(renderEmail("trial_will_end", "en", bad), null);
  }
});

// ── business_plan_request (always Spanish, for ventas@) ────────────────────────────

const request = (over: Record<string, unknown> = {}) => ({
  business_name: "Grupo Demo",
  locations_count: 12,
  phone: "555-0100",
  email: "dueno@example.com",
  message: "Hola\nQueremos 12 locales",
  locale: "en",
  request_id: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-11-08T15:30:00Z",
  ...over,
});

Deno.test("business_plan_request: Spanish for sales in either language, with every field", () => {
  for (const lang of ["es", "en"] as const) {
    const mail = renderEmail("business_plan_request", lang, request())!;
    assertEquals(mail.subject, "Nueva solicitud de plan Custom — Grupo Demo");
    for (const piece of [
      "Negocio: Grupo Demo",
      "Número de locales: 12",
      "Teléfono: 555-0100",
      "Correo: dueno@example.com",
      "Idioma del solicitante: inglés",
      "Hola\nQueremos 12 locales",
      "ID de la solicitud: 11111111-1111-4111-8111-111111111111",
      "Recibida: 8 de noviembre de 2026, 10:30",
      "Reply-To",
    ]) assertStringIncludes(mail.text, piece);
  }
});

Deno.test("business_plan_request: optional fields fall back, the subject is one line, required fields are enforced", () => {
  const sparse = renderEmail("business_plan_request", "es", request({ phone: null, message: null, locale: null, created_at: undefined }))!;
  assertStringIncludes(sparse.text, "Teléfono: —");
  assertStringIncludes(sparse.text, "(sin mensaje)");
  assertStringIncludes(sparse.text, "Idioma del solicitante: —");
  assertStringIncludes(sparse.text, "Recibida: —");
  const injected = renderEmail("business_plan_request", "es", request({ business_name: "Bar\r\nBcc: x@evil.test" }))!;
  assertFalse(/[\r\n]/.test(injected.subject));
  assertEquals(renderEmail("business_plan_request", "es", request({ business_name: "  " })), null);
  assertEquals(renderEmail("business_plan_request", "es", request({ email: undefined })), null);
  assertEquals(renderEmail("business_plan_request", "es", null), null);
});

// ── dispatch ──────────────────────────────────────────────────────────────────────

Deno.test("renderEmail dispatches by kind; the four kinds are exactly the ones the table admits", () => {
  assertEquals([...EMAIL_KINDS], ["reservation_cancelled_business_closed", "subscription_started", "trial_will_end", "business_plan_request"]);
  for (const kind of EMAIL_KINDS) assert(isEmailKind(kind));
  assertFalse(isEmailKind("something_else"));
  assertFalse(isEmailKind(undefined));
  const subjects = new Set([
    renderEmail("subscription_started", "es", base())!.subject,
    renderEmail("trial_will_end", "es", base())!.subject,
    renderEmail("business_plan_request", "es", request())!.subject,
    renderEmail("reservation_cancelled_business_closed", "es", { business_name: "Bar", reserved_at: "2026-12-01T20:00:00Z" })!.subject,
  ]);
  assertEquals(subjects.size, 4);
});

Deno.test("renderEmail: unknown kind → null; reservation payload without name or date → null", () => {
  assertEquals(renderEmail("unknown_kind", "es", {}), null);
  assertEquals(renderEmail("", "es", {}), null);
  assertEquals(renderEmail("reservation_cancelled_business_closed", "es", { business_name: "Bar" }), null);
  assertEquals(renderEmail("reservation_cancelled_business_closed", "es", { reserved_at: "2026-12-01T20:00:00Z" }), null);
  assertEquals(renderEmail("reservation_cancelled_business_closed", "es", null), null);
});

Deno.test("the reservation e-mail is byte-for-byte what it was before E2", () => {
  const payload = { business_name: "Bar XZX", reserved_at: "2026-11-20T23:30:00Z", timezone: "America/New_York" };
  for (const language of ["es", "en"] as const) {
    assertEquals(
      renderEmail("reservation_cancelled_business_closed", language, payload),
      buildClosedReservationEmail({ language, businessName: "Bar XZX", reservedAt: "2026-11-20T23:30:00Z", timezone: "America/New_York" }),
    );
  }
  const es = buildClosedReservationEmail({ language: "es", businessName: "Bar XZX", reservedAt: "2026-11-20T23:30:00Z", timezone: "America/New_York" });
  assertEquals(es.subject, "Reserva cancelada");
  assertStringIncludes(es.text, "Bar XZX cerró y tu reserva del 20 de noviembre de 2026 a las 6:30");
});
