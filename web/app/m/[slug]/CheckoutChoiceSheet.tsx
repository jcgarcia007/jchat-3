"use client";

/**
 * CheckoutChoiceSheet — Tab POS F3
 *
 * Sheet de elección entre "Pagar ahora" (Stripe) y "Agregar a la cuenta de la mesa".
 * Solo se muestra cuando hay tableCtx (QR de mesa) y pos_payment_mode conocido.
 *
 * No modifica CheckoutStep. Solo envuelve/condiciona la transición de step.
 */

import { useTranslations } from "next-intl";

interface CheckoutChoiceSheetProps {
  posPaymentMode:  "stripe" | "external";
  hasTableCtx:     boolean;   // true = llegó por QR (tiene token de mesa)
  hasGuestSession: boolean;   // true = ya tiene sesión de invitado activa
  palette:         Record<string, string>;
  onPayNow:        () => void;              // → setStep("pay")
  onAddToTab:      () => void;              // → mostrar TabCodeSheet o add_order directo
  onNoCode?:       () => void;             // F4 → abrir NoCodeSheet (sin código de mesa)
  onClose:         () => void;
}

export default function CheckoutChoiceSheet({
  posPaymentMode,
  hasTableCtx,
  hasGuestSession,
  palette,
  onPayNow,
  onAddToTab,
  onNoCode,
  onClose,
}: CheckoutChoiceSheetProps) {
  const t      = useTranslations();
  const accent = palette.accent ?? "#5C7CFA";

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--menu-bg, #fff)", borderRadius: "16px 16px 0 0",
          padding: "24px 20px 40px", width: "100%", maxWidth: 480,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700 }}>
          {t("checkoutChoiceTitle")}
        </h2>

        {posPaymentMode === "stripe" && (
          <>
            {/* Pagar ahora — flujo Stripe existente */}
            <button
              onClick={onPayNow}
              style={{
                width: "100%", padding: "14px 0", marginBottom: 12,
                background: accent, color: "#fff",
                border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: "pointer",
              }}
            >
              {t("checkoutChoicePayNow")}
            </button>

            {/* Agregar a la cuenta — solo si llegó por QR */}
            {hasTableCtx ? (
              <button
                onClick={onAddToTab}
                style={{
                  width: "100%", padding: "14px 0",
                  background: "transparent", color: accent,
                  border: `2px solid ${accent}`, borderRadius: 10,
                  fontSize: 16, fontWeight: 700, cursor: "pointer",
                }}
              >
                {t("checkoutChoiceAddToTab")}
              </button>
            ) : (
              <p style={{ textAlign: "center", fontSize: 13, opacity: 0.5, marginTop: 8 }}>
                {t("checkoutChoiceScanQrToOrder")}
              </p>
            )}
          </>
        )}

        {posPaymentMode === "external" && (
          <>
            {/* Modo external: sin Stripe */}
            {hasTableCtx ? (
              <>
                {hasGuestSession ? (
                  /* Ya tiene sesión — enviar directo */
                  <button
                    onClick={onAddToTab}
                    style={{
                      width: "100%", padding: "14px 0",
                      background: accent, color: "#fff",
                      border: "none", borderRadius: 10,
                      fontSize: 16, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    {t("checkoutChoiceSendToTab")}
                  </button>
                ) : (
                  /* Sin sesión — ¿tiene el código? */
                  <div>
                    <p style={{ textAlign: "center", fontSize: 15, marginBottom: 16 }}>
                      {t("checkoutChoiceHaveCode")}
                    </p>
                    <div style={{ display: "flex", gap: 12 }}>
                      <button
                        onClick={onAddToTab}
                        style={{
                          flex: 1, padding: "13px 0",
                          background: accent, color: "#fff",
                          border: "none", borderRadius: 10,
                          fontSize: 15, fontWeight: 700, cursor: "pointer",
                        }}
                      >
                        {t("checkoutChoiceYes")}
                      </button>
                      <button
                        onClick={onNoCode}
                        disabled={!onNoCode}
                        style={{
                          flex: 1, padding: "13px 0",
                          background: "var(--menu-surface, #f3f4f6)", color: "var(--menu-text, #111)",
                          border: "none", borderRadius: 10,
                          fontSize: 15, fontWeight: 600,
                          cursor: onNoCode ? "pointer" : "not-allowed",
                          opacity: onNoCode ? 1 : 0.5,
                        }}
                      >
                        {t("checkoutChoiceNo")}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Sin tableCtx (entrada manual) */
              <p style={{ textAlign: "center", fontSize: 14, opacity: 0.6 }}>
                {t("checkoutChoiceScanQrToOrder")}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
