"use client";

/**
 * Real web checkout (plan C). Reuses the `payments` Edge Function for logged-in
 * customers (create_payment_intent) and the public `guest-pay` EF for walk-ins
 * with NO account (G2, D-64), then renders Stripe's Payment Element. The EF
 * recalculates ALL amounts server-side from the DB — the client only forwards
 * ids/qty/modifier labels. This component NEVER sends totals the server trusts.
 *
 * NO LOGIN WALL: a guest never sees a sign-in screen. With a session → the
 * logged-in path; without one → name + optional receipt email + hCaptcha → the
 * public guest-pay EF. Anonymous Supabase sessions are NOT used (per-IP limit vs a
 * bar's shared WiFi, D-39).
 *
 * Table context is C2 — here table_label is only the manual pickup input (or empty).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { buildOrderOptions } from "@/lib/orderOptions";
import { readFunctionError } from "@/lib/functionError";
import InvisibleCaptcha, { type InvisibleCaptchaHandle } from "@/components/InvisibleCaptcha";
import type { MenuItemOption, ModifierChoice } from "./page";

interface GroupSel {
  groupId: string;
  groupLabel: string;
  choices: ModifierChoice[];
}

export interface CheckoutCartItem {
  itemId: string;
  name: string;
  quantity: number;
  basePriceCents: number;
  lineTotalCents: number;
  selectedSize: MenuItemOption | null;
  selectedExtras: MenuItemOption[];
  groupSelections: GroupSel[];
  notes?: string;
}

const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
const fmt = (cents: number) => money.format(cents / 100);

// No name/email prompt phases — the name comes from the pickup screen (presetName).
type Phase = "checking" | "creating" | "pay" | "success" | "error";
type PaidStatus = "succeeded" | "processing";

interface ServerBreakdown {
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  discountCents: number;
}

interface IntentResult {
  clientSecret: string;
  publishableKey: string;
  serverTotalCents: number;
  breakdown: ServerBreakdown | null; // server-computed; the receipt uses ONLY this
}

export function CheckoutStep({
  business,
  cartItems,
  pickupType,
  tableLabel,
  tableQrToken = null,
  presetName = "",
  onBack,
  onDone,
}: {
  business: { id: string; name: string };
  cartItems: CheckoutCartItem[];
  pickupType: "counter" | "table";
  tableLabel: string;
  tableQrToken?: string | null;
  presetName?: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("checking");
  const [paidStatus, setPaidStatus] = useState<PaidStatus>("succeeded");
  const [error, setError] = useState<string>("");
  const [intent, setIntent] = useState<IntentResult | null>(null);
  // Name the order is served under — from the pickup screen (presetName). May be
  // empty (optional). Used only for the on-screen receipt.
  const contactName = presetName.trim().slice(0, 60);
  const captchaRef = useRef<InvisibleCaptchaHandle>(null);
  const startedRef = useRef(false);

  const clientSubtotal = useMemo(
    () => cartItems.reduce((s, ci) => s + ci.lineTotalCents, 0),
    [cartItems],
  );

  const createIntent = useCallback(async () => {
    setError("");
    setPhase("creating");
    // Fresh idempotency key per attempt (server namespaces it with the JWT).
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;

    // Same payload shape the mobile app sends (mobile/services/stripe.ts). Amounts
    // are client ESTIMATES the server ignores — it re-prices from the DB. Only
    // ids/qty/modifier labels/tip are trusted inputs.
    const order = {
      business_id: business.id,
      user_id: "", // filled below with the verified uid (server ignores for auth)
      room_id: null,
      order_type: pickupType === "table" ? "table" : "counter",
      table_label: tableLabel.trim() || null, // informative; real link is via table_qr_token
      table_qr_token: tableQrToken, // C2: opaque token, resolved to a table_id server-side
      contact_name: contactName || null, // optional served-under name (from pickup)
      gift_recipient_id: null,
      subtotal_cents: clientSubtotal, // ignored by server
      tax_cents: 0, // ignored
      tip_cents: 0, // C1: no tip UI yet
      discount_cents: 0, // ignored
      total_cents: clientSubtotal, // ignored
      promo_code: null,
      special_instructions: null,
      items: cartItems.map((ci) => ({
        menu_item_id: ci.itemId,
        name: ci.name,
        qty: ci.quantity,
        price_cents: ci.basePriceCents, // ignored; server re-prices
        // Shared builder (@/lib/orderOptions) — the waiter terminal uses the same
        // one, so the two surfaces cannot drift into different shapes.
        options: buildOrderOptions(ci),
        special_instructions: ci.notes ?? null,
      })),
    };

    const { data: authData } = await supabase.auth.getUser();
    order.user_id = authData.user?.id ?? "";

    const { data, error: fnErr } = await supabase.functions.invoke("payments", {
      body: { action: "create_payment_intent", idempotency_key: idempotencyKey, order },
    });

    if (fnErr) {
      setError(await readFunctionError(fnErr));
      setPhase("error");
      return;
    }
    const res = data as {
      clientSecret?: string;
      publishableKey?: string;
      serverTotalCents?: number;
      serverBreakdown?: ServerBreakdown;
    };
    if (!res?.clientSecret || !res?.publishableKey) {
      setError("El servidor no devolvió los datos de pago.");
      setPhase("error");
      return;
    }
    setIntent({
      clientSecret: res.clientSecret,
      publishableKey: res.publishableKey,
      serverTotalCents: res.serverTotalCents ?? clientSubtotal,
      breakdown: res.serverBreakdown ?? null,
    });
    setPhase("pay");
  }, [business.id, cartItems, clientSubtotal, contactName, pickupType, tableLabel, tableQrToken]);

  // Guest path (no session, D-64): invisible hCaptcha + the PUBLIC guest-pay EF.
  // Name is OPTIONAL (guest-pay v2). Prices from the server; nothing trusted.
  // Single-use captcha: fresh token per attempt; on failure → error phase, and
  // "Reintentar" fetches a brand-new token.
  const createGuestIntent = useCallback(async () => {
    setError("");
    setPhase("creating");

    const cap = await captchaRef.current?.getToken();
    if (cap && cap.status === "failed") {
      setError("No pudimos verificar que eres una persona. Inténtalo de nuevo.");
      setPhase("error");
      return; // widget already reset → retry gets a new token
    }
    const captchaToken = cap && cap.status === "ok" ? cap.token : undefined;

    const order = {
      business_id: business.id,
      order_type: pickupType === "table" ? "table" : "counter",
      table_label: tableLabel.trim() || null,
      table_qr_token: tableQrToken,
      items: cartItems.map((ci) => ({
        menu_item_id: ci.itemId,
        qty: ci.quantity,
        options: buildOrderOptions(ci),
        special_instructions: ci.notes ?? null,
      })),
    };

    const { data, error: fnErr } = await supabase.functions.invoke("guest-pay", {
      body: {
        action: "create_guest_payment",
        captcha_token: captchaToken,
        contact_name: contactName || undefined, // optional (guest-pay v2)
        order,
      },
    });

    if (fnErr) {
      const raw = await readFunctionError(fnErr);
      const msg = /verific|captcha|persona/i.test(raw)
        ? "No pudimos verificar que eres una persona. Inténtalo de nuevo."
        : raw;
      setError(msg);
      setPhase("error");
      return;
    }

    const res = data as {
      clientSecret?: string; publishableKey?: string;
      serverTotalCents?: number; serverBreakdown?: ServerBreakdown;
    };
    if (!res?.clientSecret || !res?.publishableKey) {
      setError("El servidor no devolvió los datos de pago. Inténtalo de nuevo.");
      setPhase("error");
      return;
    }
    setIntent({
      clientSecret: res.clientSecret,
      publishableKey: res.publishableKey,
      serverTotalCents: res.serverTotalCents ?? clientSubtotal,
      breakdown: res.serverBreakdown ?? null,
    });
    setPhase("pay");
  }, [business.id, cartItems, clientSubtotal, contactName, pickupType, tableLabel, tableQrToken]);

  // Entry point: route to the right EF by session. Also the "Reintentar" target.
  const startPayment = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError("El pago no está configurado.");
      setPhase("error");
      return;
    }
    // getUser (not getSession) — verifies the token with the server.
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await createIntent();
    } else {
      await createGuestIntent();
    }
  }, [createIntent, createGuestIntent]);

  // On mount: start the payment once (no login wall, no prompts).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void startPayment();
  }, [startPayment]);

  const stripePromise = useMemo<Promise<Stripe | null> | null>(
    () => (intent?.publishableKey ? loadStripe(intent.publishableKey) : null),
    [intent?.publishableKey],
  );

  return (
    <Sheet>
      {/* Print rules: on window.print() show ONLY the receipt, clean on white. */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button type="button" onClick={onBack} style={linkBtn}>← Volver</button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{business.name}</div>
        <span style={{ width: 60 }} />
      </div>

      {(phase === "checking" || phase === "creating") && <Muted>Preparando el pago…</Muted>}

      {phase === "pay" && intent && stripePromise && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Estimated total — the definitive amount is the one on the receipt,
              computed server-side. Marked as estimated so nothing here is trusted. */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 14, color: "#374151" }}>Total estimado</span>
            <span style={{ fontSize: 18, fontWeight: 800 }}>{fmt(intent.serverTotalCents)}</span>
          </div>
          <Muted>El importe definitivo aparecerá en tu recibo tras el pago.</Muted>
          <Elements
            stripe={stripePromise}
            options={{ clientSecret: intent.clientSecret, appearance: { theme: "stripe" } }}
          >
            <PaymentForm
              total={intent.serverTotalCents}
              returnUrl={`${originOf()}${pathname}`}
              onPaid={(status) => {
                setPaidStatus(status);
                setPhase("success");
              }}
            />
          </Elements>
        </div>
      )}

      {phase === "success" && paidStatus === "succeeded" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="no-print" style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 40 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>¡Pago recibido!</div>
            <Muted>El negocio ya tiene tu pedido y empezará a prepararlo.</Muted>
          </div>

          {/* Receipt is the only thing that survives a print (co-print-area). */}
          <div className="co-print-area">
            <Receipt
              businessName={business.name}
              name={contactName}
              items={cartItems}
              totalCents={intent?.serverTotalCents ?? clientSubtotal}
              breakdown={intent?.breakdown ?? null}
              tableLabel={pickupType === "table" ? tableLabel.trim() : ""}
            />
          </div>

          <div className="no-print" style={{ fontSize: 13, color: "#b45309", fontWeight: 600, textAlign: "center" }}>
            Guarda o imprime este recibo: no podrás volver a consultarlo.
          </div>

          <button type="button" onClick={() => window.print()} className="no-print" style={primaryBtn}>
            Imprimir recibo
          </button>
          <button type="button" onClick={onDone} className="no-print" style={linkBtn}>Volver al menú</button>
        </div>
      )}

      {phase === "success" && paidStatus === "processing" && (
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 40 }}>⏳</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Tu pago se está procesando</div>
          {intent && <div style={{ fontSize: 15 }}>Importe: {fmt(intent.serverTotalCents)}.</div>}
          <Muted>
            Aún no está confirmado. En cuanto el pago se confirme, el negocio recibirá tu pedido y
            empezará a prepararlo.
          </Muted>
          <button type="button" onClick={onDone} style={primaryBtn}>Volver al menú</button>
        </div>
      )}

      {phase === "error" && (
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#b91c1c" }}>No se pudo iniciar el pago</div>
          <Muted>{error || "Inténtalo de nuevo."}</Muted>
          <button type="button" onClick={() => void startPayment()} style={primaryBtn}>Reintentar</button>
          <button type="button" onClick={onBack} style={linkBtn}>Volver al pedido</button>
        </div>
      )}
      {/* Invisible hCaptcha — always mounted so the guest path can fetch a token
          the moment the payment starts. Renders nothing visible (null when no
          sitekey is configured). */}
      <InvisibleCaptcha ref={captchaRef} />
    </Sheet>
  );
}

function PaymentForm({
  total,
  returnUrl,
  onPaid,
}: {
  total: number;
  returnUrl: string;
  onPaid: (status: PaidStatus) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [payError, setPayError] = useState<string>("");

  async function pay() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setPayError("");
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required",
    });
    if (error) {
      setPayError(error.message ?? "El pago no se pudo completar.");
      setSubmitting(false);
      return;
    }
    if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) {
      onPaid(paymentIntent.status);
      return;
    }
    // Redirect-based methods (some wallets) navigate away and return via return_url.
    setSubmitting(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PaymentElement />
      {payError && <div style={{ fontSize: 13, color: "#b91c1c" }}>{payError}</div>}
      <button
        type="button"
        onClick={() => void pay()}
        disabled={!stripe || submitting}
        style={{ ...primaryBtn, opacity: !stripe || submitting ? 0.6 : 1 }}
      >
        {submitting ? "Procesando…" : `Pagar ${fmt(total)}`}
      </button>
    </div>
  );
}

function originOf(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}

/** Informative receipt after a successful payment. ALL amounts come from the
 *  server (serverTotalCents + serverBreakdown). Item lines show only quantity +
 *  name — no client-side per-line prices, so nothing can contradict the total.
 *  No fabricated order number. */
function Receipt({
  businessName,
  name,
  items,
  totalCents,
  breakdown,
  tableLabel,
}: {
  businessName: string;
  name: string;
  items: CheckoutCartItem[];
  totalCents: number;
  breakdown: ServerBreakdown | null;
  tableLabel: string;
}) {
  const when = new Date().toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, background: "#fafafa", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>{businessName}</div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>{when}</div>
      </div>
      {(name || tableLabel) && (
        <div style={{ fontSize: 13, color: "#374151" }}>
          {name && <div>A nombre de <strong>{name}</strong></div>}
          {tableLabel && <div>Mesa {tableLabel}</div>}
        </div>
      )}
      {/* Items: quantity + name only. No per-line amount (the server doesn't
          return a per-line breakdown, so showing client prices could disagree
          with the server total). */}
      <div style={{ borderTop: "1px dashed #d1d5db", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((ci, i) => (
          <div key={i} style={{ fontSize: 14, color: "#374151" }}>
            {ci.quantity}× {ci.name}
          </div>
        ))}
      </div>
      {/* Amounts — all server-computed. */}
      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        {breakdown && (
          <>
            <ReceiptRow label="Subtotal" cents={breakdown.subtotalCents} />
            {breakdown.taxCents > 0 && <ReceiptRow label="Impuestos" cents={breakdown.taxCents} />}
            {breakdown.tipCents > 0 && <ReceiptRow label="Propina" cents={breakdown.tipCents} />}
            {breakdown.discountCents > 0 && <ReceiptRow label="Descuento" cents={-breakdown.discountCents} />}
          </>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 16, color: "#111827", marginTop: 4 }}>
          <span>Total</span>
          <span>{fmt(totalCents)}</span>
        </div>
      </div>
    </div>
  );
}

function ReceiptRow({ label, cents }: { label: string; cents: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6b7280" }}>
      <span>{label}</span>
      <span>{fmt(cents)}</span>
    </div>
  );
}

function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.45)" }}>
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#ffffff",
          color: "#111827",
          borderRadius: "20px 20px 0 0",
          padding: "22px 20px calc(22px + env(safe-area-inset-bottom))",
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 14, color: "#6b7280", textAlign: "center" }}>{children}</div>;
}

const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "13px 18px",
  borderRadius: 12,
  background: "#111827",
  color: "#ffffff",
  border: "none",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};

const linkBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#6b7280",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
};


// Print rules: hide the whole page and the sheet chrome, show ONLY the receipt,
// clean on white. `.co-print-area` wraps the receipt; `.no-print` hides controls.
const PRINT_CSS = `
@media print {
  /* A parent (the menu <main>) carries a transform, which would make the
     fixed receipt its containing block and push it off the page. Clearing
     transforms in print is harmless and re-anchors the receipt to the page. */
  * { transform: none !important; }
  body * { visibility: hidden !important; }
  .co-print-area, .co-print-area * { visibility: visible !important; }
  .co-print-area {
    position: fixed !important; inset: 0 !important; margin: 0 !important;
    padding: 16px !important; background: #ffffff !important; box-shadow: none !important;
    max-height: none !important; overflow: visible !important;
  }
  .no-print { display: none !important; }
}
`;
