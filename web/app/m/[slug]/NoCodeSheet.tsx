"use client";

/**
 * NoCodeSheet — Tab POS F4
 *
 * Bottom sheet que el cliente ve cuando elige "No tengo código" en
 * CheckoutChoiceSheet. Permite enviar el carrito para aprobación del mesero
 * sin necesidad de un código de acceso de 6 dígitos.
 *
 * Usa hCaptcha invisible (mismo patrón que TabCodeSheet).
 * Al confirmar llama a guestTab.addOrderNoCode(…) y notifica al padre
 * con onSuccess() para que muestre el estado de "Pedido pendiente".
 *
 * Props:
 *   tableQrToken — token del QR de la mesa (para resolver la mesa en el servidor)
 *   items        — ítems del carrito (menu_item_id, qty, options, special_instructions)
 *   palette      — tema de colores del menú
 *   onSuccess    — callback cuando el pedido queda en 'awaiting'
 *   onClose      — cerrar el sheet sin enviar
 */

import { useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import InvisibleCaptcha, { type InvisibleCaptchaHandle } from "@/components/InvisibleCaptcha";
import { getDeviceId, getFingerprint } from "@/lib/guestDevice";
import { guestTab } from "@/lib/guestTabSession";

interface CartItem {
  menu_item_id:          string;
  name?:                 string;   // display only — not sent to EF
  qty:                   number;
  options?:              object;
  special_instructions?: string;
}

interface NoCodeSheetProps {
  tableQrToken: string;
  items:        CartItem[];
  palette:      Record<string, string>;
  /** Called when the order is successfully placed in awaiting state. */
  onSuccess:    () => void;
  onClose:      () => void;
}

type Phase = "idle" | "loading" | "success" | "error" | "rateLimit" | "blocked" | "captchaFailed";

export default function NoCodeSheet({
  tableQrToken,
  items,
  palette,
  onSuccess,
  onClose,
}: NoCodeSheetProps) {
  const t          = useTranslations();
  const captchaRef = useRef<InvisibleCaptchaHandle>(null);
  const [phase, setPhase]       = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startCountdown(seconds: number): void {
    setCountdown(seconds);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          setPhase("idle");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  const handleSend = useCallback(async () => {
    if (phase === "loading") return;
    setPhase("loading");
    setErrorMsg("");

    try {
      const cap = await captchaRef.current?.getToken();
      if (!cap || cap.status === "disabled" || cap.status === "failed") {
        setPhase("captchaFailed");
        return;
      }

      const [deviceId, fingerprint] = await Promise.all([
        Promise.resolve(getDeviceId()),
        getFingerprint(),
      ]);

      const idempotencyKey = `${deviceId}-${tableQrToken}-${Date.now()}`;

      const result = await guestTab.addOrderNoCode({
        table_qr_token:  tableQrToken,
        device_id:       deviceId,
        fingerprint,
        captcha_token:   (cap as { status: "ok"; token: string }).token,
        idempotency_key: idempotencyKey,
        items,
      });

      onSuccess();

    } catch (err: unknown) {
      const e = err as { code?: string; retry_after_s?: number; blocked_until?: string; message?: string };
      switch (e.code) {
        case "RATE_LIMITED":
          setPhase("rateLimit");
          startCountdown(e.retry_after_s ?? 600);
          break;
        case "DEVICE_BLOCKED":
          setPhase("blocked");
          break;
        case "CAPTCHA_FAILED":
          setPhase("captchaFailed");
          break;
        case "MODE_NOT_ALLOWED":
          setPhase("error");
          setErrorMsg(t("noCodeModeNotAllowed"));
          break;
        default:
          setPhase("error");
          setErrorMsg(e.message ?? t("noCodeError"));
      }
    }
  }, [phase, tableQrToken, items, t, onSuccess]);

  const accent = palette.accent ?? "#5C7CFA";

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 210,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--menu-bg, #fff)",
          borderRadius: "16px 16px 0 0",
          padding: "24px 20px 44px",
          width: "100%", maxWidth: 480,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>
          {t("noCodeTitle")}
        </h2>
        <p style={{ margin: "0 0 20px", fontSize: 14, opacity: 0.6, lineHeight: 1.5 }}>
          {t("noCodeSubtitle")}
        </p>

        {/* Item summary */}
        <div style={{
          background: "var(--menu-surface, #f9fafb)",
          borderRadius: 10, padding: "12px 14px", marginBottom: 20,
        }}>
          {items.map((item, idx) => (
            <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, paddingBottom: 4 }}>
              <span style={{ opacity: 0.8 }}>{item.name ?? item.menu_item_id}</span>
              <span style={{ fontWeight: 600 }}>×{item.qty}</span>
            </div>
          ))}
        </div>

        {/* Status messages */}
        {phase === "error" && (
          <p style={{ color: "#ef4444", fontSize: 13, textAlign: "center", marginBottom: 12 }}>
            {errorMsg}
          </p>
        )}
        {phase === "rateLimit" && (
          <p style={{ color: "#f59e0b", fontSize: 13, textAlign: "center", marginBottom: 12 }}>
            {t("noCodeRateLimited", { seconds: countdown })}
          </p>
        )}
        {phase === "blocked" && (
          <p style={{ color: "#ef4444", fontSize: 13, textAlign: "center", marginBottom: 12 }}>
            {t("noCodeBlocked")}
          </p>
        )}
        {phase === "captchaFailed" && (
          <p style={{ color: "#f59e0b", fontSize: 13, textAlign: "center", marginBottom: 12 }}>
            {t("noCodeCaptchaFailed")}
          </p>
        )}

        {/* Send button */}
        <button
          onClick={() => void handleSend()}
          disabled={phase === "loading" || phase === "rateLimit" || phase === "blocked"}
          style={{
            width: "100%", padding: "14px 0",
            background: accent, color: "#fff",
            border: "none", borderRadius: 10,
            fontSize: 16, fontWeight: 700,
            cursor: (phase === "loading" || phase === "rateLimit" || phase === "blocked")
              ? "not-allowed" : "pointer",
            opacity: (phase === "loading" || phase === "rateLimit" || phase === "blocked") ? 0.65 : 1,
          }}
        >
          {phase === "loading" ? "…" : t("noCodeSend")}
        </button>

        <InvisibleCaptcha ref={captchaRef} />
      </div>
    </div>
  );
}
