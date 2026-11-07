import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { closeOwnerBusinesses, ownerPreflight, type OwnerDeps, type OwnedBusiness, type OpenItem, type MoneyLine } from "./ownerClose.ts";
import { buildClosedReservationEmail, deliverClosedReservationEmails, formatWhen, type EmailDeps, type EmailRow } from "./ownerCloseEmails.ts";

const UID = "3ddf4a2e-1111-4222-8333-444455556666";
const B1: OwnedBusiness = { id: "b1", name: "Bar XZX", city: "Miami", stripe_account_id: "acct_1" };
const B2: OwnedBusiness = { id: "b2", name: "Café Sol", city: "Tampa", stripe_account_id: null };

interface Opts {
  owned?: OwnedBusiness[];
  open?: OpenItem[];
  balances?: Record<string, { available: MoneyLine[]; pending: MoneyLine[] } | Error>;
  subscription?: string | null;
  cancelError?: unknown;
  closeErrors?: Record<string, string>;
  disconnectError?: unknown;
}

function fake(o: Opts = {}) {
  const calls: string[] = [];
  const logs: { action: string; target: string | null; detail: string | null }[] = [];
  const deps: OwnerDeps = {
    listOwned: () => { calls.push("listOwned"); return Promise.resolve(o.owned ?? [B1]); },
    openOrders: () => { calls.push("openOrders"); return Promise.resolve(o.open ?? []); },
    subscriptionId: () => Promise.resolve(o.subscription ?? null),
    closeBusiness: (id) => {
      calls.push(`close:${id}`);
      if (o.closeErrors?.[id]) return Promise.reject(new Error(o.closeErrors[id]));
      return Promise.resolve({ email_ids: id === "b1" ? ["e1", "e2"] : [] });
    },
    log: (action, target, detail) => { logs.push({ action, target, detail }); return Promise.resolve(); },
    stripe: {
      balance: (acct) => {
        calls.push(`balance:${acct}`);
        const v = o.balances?.[acct] ?? { available: [], pending: [] };
        return v instanceof Error ? Promise.reject(v) : Promise.resolve(v);
      },
      cancelSubscription: (id) => {
        calls.push(`cancelSub:${id}`);
        return o.cancelError ? Promise.reject(o.cancelError) : Promise.resolve();
      },
      disconnectAccount: (acct) => {
        calls.push(`disconnect:${acct}`);
        return o.disconnectError ? Promise.reject(o.disconnectError) : Promise.resolve();
      },
    },
  };
  return { deps, calls, logs };
}

Deno.test("preflight: not an owner -> not_owner, no Stripe call", async () => {
  const f = fake({ owned: [] });
  assertEquals(await ownerPreflight(f.deps, UID), { kind: "not_owner" });
  assertEquals(f.calls, ["listOwned"]);
});

Deno.test("preflight: open orders/tabs -> 409 owner_open_orders with the list, Stripe not asked", async () => {
  const open: OpenItem[] = [{ business_id: "b1", business_name: "Bar XZX", kind: "orders", n: 3 }, { business_id: "b1", business_name: "Bar XZX", kind: "tabs", n: 1 }];
  const f = fake({ open });
  const r = await ownerPreflight(f.deps, UID);
  assertEquals(r, { kind: "blocked", status: 409, code: "owner_open_orders", open });
  assertEquals(f.calls.some((c) => c.startsWith("balance")), false);
});

Deno.test("preflight: balance available+pending > 0 -> 409 stripe_balance_pending with amounts per venue", async () => {
  const f = fake({ owned: [B1, { ...B2, stripe_account_id: "acct_2" }], balances: {
    acct_1: { available: [{ currency: "usd", amount: 3000 }], pending: [{ currency: "usd", amount: 1250 }] },
    acct_2: { available: [], pending: [] },
  } });
  const r = await ownerPreflight(f.deps, UID);
  assertEquals(r, { kind: "blocked", status: 409, code: "stripe_balance_pending", balances: [{ business_id: "b1", business_name: "Bar XZX", currency: "usd", amount: 4250 }] });
});

Deno.test("preflight: only PENDING money also blocks; zero and negative net do not", async () => {
  const pendingOnly = fake({ balances: { acct_1: { available: [], pending: [{ currency: "usd", amount: 1 }] } } });
  assertEquals((await ownerPreflight(pendingOnly.deps, UID)).kind, "blocked");
  const zero = fake({ balances: { acct_1: { available: [{ currency: "usd", amount: 500 }], pending: [{ currency: "usd", amount: -500 }] } } });
  assertEquals((await ownerPreflight(zero.deps, UID)).kind, "ok");
});

Deno.test("preflight: Stripe error -> stripe_balance_check_failed (logged, nothing else); account already deleted -> zero", async () => {
  const bad = fake({ balances: { acct_1: Object.assign(new Error("boom"), { code: "api_connection_error" }) } });
  assertEquals(await ownerPreflight(bad.deps, UID), { kind: "blocked", status: 502, code: "stripe_balance_check_failed" });
  assertEquals(bad.logs[0].action, "owner_delete_balance_check_failed");
  assertEquals(bad.logs[0].detail, "api_connection_error");
  const gone = fake({ balances: { acct_1: Object.assign(new Error("No such account"), { code: "account_invalid" }) } });
  assertEquals((await ownerPreflight(gone.deps, UID)).kind, "ok");
});

Deno.test("preflight ok: lists the venues; venues without Stripe are not queried", async () => {
  const f = fake({ owned: [B1, B2] });
  const r = await ownerPreflight(f.deps, UID);
  assertEquals(r, { kind: "ok", businesses: [{ id: "b1", name: "Bar XZX", city: "Miami" }, { id: "b2", name: "Café Sol", city: "Tampa" }] });
  assertEquals(f.calls.filter((c) => c.startsWith("balance")), ["balance:acct_1"]);
});

Deno.test("close: order is subscription -> close each venue -> disconnect Connect", async () => {
  const f = fake({ owned: [B1, B2], subscription: "sub_1" });
  const r = await closeOwnerBusinesses(f.deps, UID);
  assert(r.ok);
  assertEquals(f.calls.filter((c) => !c.startsWith("listOwned")), ["cancelSub:sub_1", "close:b1", "close:b2", "disconnect:acct_1"]);
  if (r.ok) {
    assertEquals(r.state, { subscriptionCancelled: true, closed: 2, total: 2 });
    assertEquals(r.emailIds, ["e1", "e2"]);
  }
  assertEquals(f.logs.map((l) => l.action), ["stripe_connect_disconnected"]);
});

Deno.test("close: subscription cancel FAILS -> subscription_cancel_failed and NOTHING is closed or disconnected", async () => {
  const f = fake({ owned: [B1, B2], subscription: "sub_1", cancelError: Object.assign(new Error("x"), { code: "rate_limit" }) });
  const r = await closeOwnerBusinesses(f.deps, UID);
  assertEquals(r.ok, false);
  if (!r.ok) {
    assertEquals([r.status, r.code], [502, "subscription_cancel_failed"]);
    assertEquals(r.state, { subscriptionCancelled: false, closed: 0, total: 2 });
  }
  assertEquals(f.calls.some((c) => c.startsWith("close:") || c.startsWith("disconnect:")), false);
  assertEquals(f.logs[0].action, "owner_delete_subscription_cancel_failed");
});

Deno.test("close: already-cancelled subscription (retry) counts as cancelled; no subscription -> skipped", async () => {
  const gone = fake({ subscription: "sub_1", cancelError: Object.assign(new Error("No such subscription"), { code: "resource_missing" }) });
  const r = await closeOwnerBusinesses(gone.deps, UID);
  assert(r.ok);
  const none = fake({ subscription: null });
  await closeOwnerBusinesses(none.deps, UID);
  assertEquals(none.calls.some((c) => c.startsWith("cancelSub")), false);
});

Deno.test("close: a venue fails to close -> owner_close_failed with the state, logged, no disconnect", async () => {
  const f = fake({ owned: [B1, B2], subscription: "sub_1", closeErrors: { b2: "some db error" } });
  const r = await closeOwnerBusinesses(f.deps, UID);
  assertEquals(r.ok, false);
  if (!r.ok) {
    assertEquals([r.status, r.code], [500, "owner_close_failed"]);
    assertEquals(r.state, { subscriptionCancelled: true, closed: 1, total: 2 });
  }
  assertEquals(f.calls.some((c) => c.startsWith("disconnect:")), false);
  assertEquals(f.logs[0].action, "owner_close_partial");
  assertEquals(f.logs[0].detail, "db_error;subscription:cancelled;closed:1/2");
});

Deno.test("close: an order opened in the meantime (race) -> 409 owner_open_orders, Stripe account NOT deleted", async () => {
  const f = fake({ closeErrors: { b1: "owner_open_orders" } });
  const r = await closeOwnerBusinesses(f.deps, UID);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals([r.status, r.code], [409, "owner_open_orders"]);
  assertEquals(f.calls.some((c) => c.startsWith("disconnect:")), false);
});

Deno.test("close: disconnect fails -> logged, the close still succeeds (the venue is already closed)", async () => {
  const f = fake({ disconnectError: Object.assign(new Error("cannot delete"), { code: "account_not_deletable" }) });
  const r = await closeOwnerBusinesses(f.deps, UID);
  assert(r.ok);
  assertEquals(f.logs[0], { action: "stripe_connect_disconnect_failed", target: "b1", detail: "account_not_deletable" });
});

// ── e-mails ──
const ROW = (id: string, over: Partial<EmailRow> = {}): EmailRow => ({ id, user_id: "u1", attempts: 0, payload: { business_name: "Bar XZX", reserved_at: "2026-11-20T23:30:00Z", timezone: "America/New_York" }, ...over });

function emailDeps(rows: EmailRow[], o: { key?: string | undefined; status?: number; recipient?: { email: string; language: "es" | "en" } | null } = {}) {
  const marks: Record<string, string> = {};
  const sent: { to: string; subject: string; text: string; auth: string }[] = [];
  const deps: EmailDeps = {
    loadRows: () => Promise.resolve(rows),
    recipient: () => Promise.resolve(o.recipient === undefined ? { email: "c@example.invalid", language: "es" } : o.recipient),
    markRow: (id, status) => { marks[id] = status; return Promise.resolve(); },
    resendKey: "key" in o ? o.key : "re_test",
    fetchFn: (_url, init) => {
      const b = JSON.parse(String(init!.body));
      sent.push({ to: b.to[0], subject: b.subject, text: b.text, auth: (init!.headers as Record<string, string>).Authorization });
      return Promise.resolve(new Response("{}", { status: o.status ?? 200 }));
    },
  };
  return { deps, marks, sent };
}

Deno.test("email: es and en texts follow the mockup, date/time in the venue time zone, no owner data", () => {
  const es = buildClosedReservationEmail({ language: "es", businessName: "Bar XZX", reservedAt: "2026-11-20T23:30:00Z", timezone: "America/New_York" });
  const en = buildClosedReservationEmail({ language: "en", businessName: "Bar XZX", reservedAt: "2026-11-20T23:30:00Z", timezone: "America/New_York" });
  assertEquals(es.subject, "Reserva cancelada");
  assert(es.text.includes("Bar XZX cerró y tu reserva del"));
  assert(es.text.includes("Lamentamos las molestias."));
  assertEquals(en.subject, "Reservation cancelled");
  assert(en.text.includes("Bar XZX has closed and your reservation for"));
  assert(en.text.includes("We're sorry for the inconvenience."));
  assertEquals(formatWhen("2026-11-20T23:30:00Z", "America/New_York", "en").time.replace(/\s/g, " "), "6:30 PM");
});

Deno.test("email: sent via Resend with the key, row marked sent", async () => {
  const e = emailDeps([ROW("e1")]);
  const rep = await deliverClosedReservationEmails(e.deps, ["e1"]);
  assertEquals(rep, { sent: 1, failed: 0, skipped: 0, pending: 0 });
  assertEquals(e.sent[0].to, "c@example.invalid");
  assertEquals(e.sent[0].auth, "Bearer re_test");
  assertEquals(e.marks, { e1: "sent" });
});

Deno.test("email: Resend error -> failed; no e-mail address -> skipped; no key -> stays pending (nothing marked)", async () => {
  const bad = emailDeps([ROW("e1")], { status: 500 });
  assertEquals((await deliverClosedReservationEmails(bad.deps, ["e1"])).failed, 1);
  assertEquals(bad.marks, { e1: "failed" });
  const noMail = emailDeps([ROW("e1")], { recipient: null });
  assertEquals((await deliverClosedReservationEmails(noMail.deps, ["e1"])).skipped, 1);
  const noKey = emailDeps([ROW("e1")], { key: undefined });
  assertEquals(await deliverClosedReservationEmails(noKey.deps, ["e1"]), { sent: 0, failed: 0, skipped: 0, pending: 1 });
  assertEquals(noKey.marks, {});
  assertEquals(noKey.sent.length, 0);
});

Deno.test("email: nothing to send -> no work; a thrown fetch never throws out", async () => {
  const e = emailDeps([]);
  assertEquals(await deliverClosedReservationEmails(e.deps, []), { sent: 0, failed: 0, skipped: 0, pending: 0 });
  const boom = emailDeps([ROW("e1")]);
  boom.deps.fetchFn = () => Promise.reject(new Error("offline"));
  assertEquals((await deliverClosedReservationEmails(boom.deps, ["e1"])).failed, 1);
});
