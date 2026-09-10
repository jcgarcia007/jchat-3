"use client";

/**
 * StripePaymentFormQr — Tab POS F5
 *
 * Formulario Stripe para pagos QR del cliente.
 * Usa el mismo modelo que guest-pay (cargos de destino, loadStripe sin stripeAccount).
 * Tras confirmar el PI en Stripe.js llama a guestTab.confirmPayment (D-34)
 * y muestra TabPaymentReceipt.
 *
 * Props:
 *   clientSecret   — del PI creado por create_payment
 *   publishableKey — de la EF
 *   posPaymentId   — UUID de pos_payments
 *   sessionToken   — token de sesión del invitado
 *   baseCents      — monto base (sin propina)
 *   tipCents       — propina
 *   palette        — tema
 *   locale
 *   onSuccess(result) — resultado de confirm_payment
 *   onCancel        — cancela y libera la reserva
 */

import { useMemo, useState, useCallback } from "react";
import { loadStripe }                      from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useTranslations } from "next-intl";
import { guestTab }        from "@/lib/guestTabSession";

interface QrPayResult {
  ok:                  boolean;
  tab_closed:          boolean;
  receipt_code:        string | null;
  remaining_due_cents: number;
  base_cents:          number;
  tip_cents:           number;
}

interface StripePaymentFormQrProps {
  clientSecret:   string;
  publishableKey: string;
  posPaymentId:   string;
  sessionToken:   string;
  baseCents:      number;
  tipCents:       number;
  palette:        Record<string, string>;
  locale:         string;
  onSuccess:      (result: QrPayResult) => void;
  onCancel:       () => void;
}

// ─── Inner form (inside <Elements>) ──────────────────────────────────────────

function InnerForm({
  posPaymentId,
  sessionToken,
  baseCents,
  tipCents,
  palette,
  locale,
  onSuccess,
  onCancel,
}: Omit<StripePaymentFormQrProps, "clientSecret" | "publishableKey">) {
  const t        = useTranslations();
  const accent   = palette.accent ?? "#5C7CFA";
  const stripe   = useStripe();
  const elements = useElements();

  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg]         = useState<string | null>(null);

  function fmtCents(cents: number): string {
    return (cents / 100).toLocaleString(locale, { style: "currency", currency: "USD" });
  }

  const handleSubmit = useCallback(async () => {
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    setErrMsg(null);

    // 1. Confirm the payment in Stripe.js (without redirect)
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });

    if (error) {
      setErrMsg(error.message ?? t("stripeForm.error"));
      setSubmitting(false);
      return;
    }

    // 2. Primary confirmation via our EF (D-34)
    try {
      const result = await guestTab.confirmPayment({ session_token: sessionToken, pos_payment_id: posPaymentId });
      onSuccess({ ...result, base_cents: baseCents, tip_cents: tipCents });
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrMsg(e.message ?? t("stripeForm.confirmError"));
    } finally {
      setSubmitting(false);
    }
  }, [stripe, elements, submitting, sessionToken, posPaymentId, baseCents, tipCents, onSuccess, t]);

  return (
    <div>
      <PaymentElement />

      {errMsg && (
        <p style={{ color: "#ef4444", fontSize: 13, textAlign: "center", marginTop: 12 }}>
          {errMsg}
        </p>
      )}

      {/* Total */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontWeight: 700, fontSize: 16,
        margin: "16px 0 12px",
        paddingTop: 12, borderTop: "1px solid var(--menu-surface,#e5e7eb)",
      }}>
        <span>{t("stripeForm.total")}</span>
        <span>{fmtCents(baseCents + tipCents)}</span>
      </div>

      <button
        onClick={() => void handleSubmit()}
        disabled={!stripe || submitting}
        style={{
          width: "100%", padding: "14px 0",
          background: accent, color: "#fff",
          border: "none", borderRadius: 12,
          fontSize: 16, fontWeight: 700,
          cursor: !stripe || submitting ? "not-allowed" : "pointer",
          opacity: !stripe || submitting ? 0.6 : 1,
          marginBottom: 10,
        }}
      >
        {submitting ? t("stripeForm.processing") : t("stripeForm.pay", { amount: fmtCents(baseCents + tipCents) })}
      </button>

      <button
        onClick={() => void guestTab.cancelPayment({ session_token: sessionToken, pos_payment_id: posPaymentId }).finally(onCancel)}
        disabled={submitting}
        style={{
          width: "100%", padding: "11px 0",
          background: "none", color: "var(--menu-text,#111)",
          border: "1px solid var(--menu-surface,#e5e7eb)", borderRadius: 12,
          fontSize: 14, cursor: submitting ? "not-allowed" : "pointer",
        }}
      >
        {t("stripeForm.cancel")}
      </button>
    </div>
  );
}

// ─── Outer wrapper with <Elements> ───────────────────────────────────────────

export default function StripePaymentFormQr(props: StripePaymentFormQrProps) {
  const { clientSecret, publishableKey, onCancel, palette } = props;

  // loadStripe without { stripeAccount } — destination charges model (D1)
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey],
  );

  if (!clientSecret || !stripePromise) {
    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 230,
      }}>
        <div style={{ color: "#fff", fontSize: 15 }}>…</div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 230,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--menu-bg,#fff)", borderRadius: "16px 16px 0 0",
          padding: "24px 20px 44px", width: "100%", maxWidth: 480,
        }}
        onClick={e => e.stopPropagation()}
      >
        <Elements
          stripe={stripePromise}
          options={{ clientSecret, appearance: { theme: "stripe" } }}
        >
          <InnerForm {...props} />
        </Elements>
      </div>
    </div>
  );
}
