"use client";

/**
 * Real web checkout (plan C — C1). Reuses the `payments` Edge Function exactly
 * like mobile does (create_payment_intent), then renders Stripe's Payment
 * Element in the browser. The EF recalculates ALL amounts server-side from the
 * DB — the client only forwards ids/qty/modifier labels/tip. This component
 * NEVER sends totals the server should trust, and does NOT touch the EF/webhook.
 *
 * Session is required to pay (the EF verifies the JWT). Without a session we show
 * a login step — anonymous login is not active yet (TODO(C3)).
 *
 * Table context is C2 — here table_label is only the manual pickup input (or empty).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
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

// Same shape used across web EF callers (pricing/billing): pull the server's
// { error } out of a FunctionsHttpError context without consuming the body twice.
type FnCtx = { status?: unknown; json?: unknown; clone?: unknown; text?: unknown };
async function readFunctionError(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : "Algo salió mal";
  const ctx = (error as { context?: unknown })?.context as FnCtx | undefined;
  if (!ctx || typeof ctx !== "object") return fallback;
  const source: FnCtx = typeof ctx.clone === "function" ? (ctx.clone as () => FnCtx)() : ctx;
  if (typeof source.json === "function") {
    try {
      const body = await (source.json as () => Promise<unknown>)();
      const msg = (body as { error?: unknown })?.error;
      if (typeof msg === "string" && msg.length > 0) return msg;
    } catch {
      /* fall through */
    }
  }
  if (typeof source.text === "function") {
    try {
      const raw = await (source.text as () => Promise<string>)();
      if (raw) {
        try {
          const body = JSON.parse(raw);
          const msg = (body as { error?: unknown })?.error;
          if (typeof msg === "string" && msg.length > 0) return msg;
        } catch {
          if (raw.length < 300) return raw;
        }
      }
    } catch {
      /* nothing else */
    }
  }
  return fallback;
}

/** The name to serve the order under, from the user's profile. null when none usable. */
async function resolveProfileName(userId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("public_profiles")
      .select("display_name, username")
      .eq("id", userId)
      .maybeSingle();
    const row = data as { display_name: string | null; username: string | null } | null;
    const name = (row?.display_name ?? row?.username ?? "").trim();
    return name.length > 0 ? name.slice(0, 60) : null;
  } catch {
    return null;
  }
}

type Phase = "checking" | "login" | "name" | "creating" | "pay" | "success" | "error";
type PaidStatus = "succeeded" | "processing";

interface IntentResult {
  clientSecret: string;
  publishableKey: string;
  serverTotalCents: number;
}

export function CheckoutStep({
  business,
  cartItems,
  pickupType,
  tableLabel,
  tableQrToken = null,
  onBack,
  onDone,
}: {
  business: { id: string; name: string };
  cartItems: CheckoutCartItem[];
  pickupType: "counter" | "table";
  tableLabel: string;
  tableQrToken?: string | null;
  onBack: () => void;
  onDone: () => void;
}) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("checking");
  const [paidStatus, setPaidStatus] = useState<PaidStatus>("succeeded");
  const [error, setError] = useState<string>("");
  const [intent, setIntent] = useState<IntentResult | null>(null);
  // Name the order is served under (C3'): profile name, or guest input.
  const [contactName, setContactName] = useState<string>("");
  const [nameInput, setNameInput] = useState<string>("");
  const startedRef = useRef(false);

  const clientSubtotal = useMemo(
    () => cartItems.reduce((s, ci) => s + ci.lineTotalCents, 0),
    [cartItems],
  );

  const createIntent = useCallback(async (name: string) => {
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
      contact_name: name.trim() ? name.trim().slice(0, 60) : null, // C3': served-under name
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
        options: {
          size: ci.selectedSize?.label ?? null,
          extras: ci.selectedExtras.map((e) => e.label),
          modifiers: ci.groupSelections.map((g) => ({
            g: g.groupId,
            c: g.choices.map((ch) => ch.label),
          })),
        },
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
    const res = data as { clientSecret?: string; publishableKey?: string; serverTotalCents?: number };
    if (!res?.clientSecret || !res?.publishableKey) {
      setError("El servidor no devolvió los datos de pago.");
      setPhase("error");
      return;
    }
    setIntent({
      clientSecret: res.clientSecret,
      publishableKey: res.publishableKey,
      serverTotalCents: res.serverTotalCents ?? clientSubtotal,
    });
    setPhase("pay");
  }, [business.id, cartItems, clientSubtotal, pickupType, tableLabel, tableQrToken]);

  // On mount: require a session, then create the PaymentIntent.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      if (!isSupabaseConfigured) {
        setError("El pago no está configurado.");
        setPhase("error");
        return;
      }
      // getUser (not getSession) — verifies the token with the server.
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setPhase("login");
        return;
      }
      // TODO(C4): when anonymous login is enabled, call supabase.auth.signInAnonymously()
      // here instead of routing to /auth/login, so a walk-in guest can pay without an account.
      // C3': if the profile already has a usable name, use it and skip the input;
      // otherwise ask the guest "¿A nombre de quién?" before creating the intent.
      const profileName = await resolveProfileName(data.user.id);
      if (profileName) {
        setContactName(profileName);
        await createIntent(profileName);
      } else {
        setPhase("name");
      }
    })();
  }, [createIntent]);

  const stripePromise = useMemo<Promise<Stripe | null> | null>(
    () => (intent?.publishableKey ? loadStripe(intent.publishableKey) : null),
    [intent?.publishableKey],
  );

  return (
    <Sheet>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button type="button" onClick={onBack} style={linkBtn}>← Volver</button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{business.name}</div>
        <span style={{ width: 60 }} />
      </div>

      {phase === "checking" && <Muted>Comprobando tu sesión…</Muted>}

      {phase === "login" && (
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Inicia sesión para completar tu pedido</div>
          <Muted>Necesitas una sesión para pagar de forma segura.</Muted>
          <Link
            href={`/auth/login?next=${encodeURIComponent(pathname)}`}
            style={{ ...primaryBtn, textDecoration: "none", justifyContent: "center" }}
          >
            Iniciar sesión
          </Link>
        </div>
      )}

      {phase === "name" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>¿A nombre de quién?</div>
          <Muted>Para que el mesero sepa a quién entregar el pedido.</Muted>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            maxLength={60}
            placeholder="Tu nombre"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && nameInput.trim()) {
                const n = nameInput.trim();
                setContactName(n);
                void createIntent(n);
              }
            }}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #d1d5db",
              fontSize: 15,
              color: "#111827",
            }}
          />
          <button
            type="button"
            disabled={!nameInput.trim()}
            onClick={() => {
              const n = nameInput.trim();
              setContactName(n);
              void createIntent(n);
            }}
            style={{ ...primaryBtn, opacity: nameInput.trim() ? 1 : 0.5 }}
          >
            Continuar al pago
          </button>
        </div>
      )}

      {phase === "creating" && <Muted>Preparando el pago…</Muted>}

      {phase === "pay" && intent && stripePromise && (
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
      )}

      {phase === "success" && paidStatus === "succeeded" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 40 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>¡Pago recibido!</div>
            <Muted>El negocio ya tiene tu pedido y empezará a prepararlo.</Muted>
          </div>

          <Receipt
            businessName={business.name}
            name={contactName}
            items={cartItems}
            totalCents={intent?.serverTotalCents ?? clientSubtotal}
            tableLabel={pickupType === "table" ? tableLabel.trim() : ""}
          />

          <Muted>Recibo informativo — muéstraselo al mesero si lo necesitas.</Muted>
          <button type="button" onClick={onDone} style={primaryBtn}>Volver al menú</button>
        </div>
      )}

      {phase === "success" && paidStatus === "processing" && (
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 40 }}>⏳</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Tu pago se está procesando</div>
          {intent && <div style={{ fontSize: 15 }}>Importe: {fmt(intent.serverTotalCents)}.</div>}
          <Muted>
            Aún no está confirmado. En cuanto el pago se confirme, el negocio recibirá tu pedido y
            empezará a prepararlo. Si diste un email, te llegará el comprobante.
          </Muted>
          <button type="button" onClick={onDone} style={primaryBtn}>Volver al menú</button>
        </div>
      )}

      {phase === "error" && (
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#b91c1c" }}>No se pudo iniciar el pago</div>
          <Muted>{error || "Inténtalo de nuevo."}</Muted>
          <button type="button" onClick={() => void createIntent(contactName)} style={primaryBtn}>Reintentar</button>
          <button type="button" onClick={onBack} style={linkBtn}>Volver al pedido</button>
        </div>
      )}
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

/** Informative receipt shown after a successful payment. Items + name from the
 *  client; the TOTAL is the server-calculated amount. No fabricated order number. */
function Receipt({
  businessName,
  name,
  items,
  totalCents,
  tableLabel,
}: {
  businessName: string;
  name: string;
  items: CheckoutCartItem[];
  totalCents: number;
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
      <div style={{ borderTop: "1px dashed #d1d5db", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((ci, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14 }}>
            <span style={{ color: "#374151" }}>{ci.quantity}× {ci.name}</span>
            <span style={{ color: "#111827" }}>{fmt(ci.lineTotalCents)}</span>
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10, display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 16, color: "#111827" }}>
        <span>Total</span>
        <span>{fmt(totalCents)}</span>
      </div>
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
