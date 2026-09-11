"use client";

/**
 * TabCodeSheet — Tab POS F3
 *
 * Sheet donde el cliente ingresa el código de 6 dígitos de la mesa.
 * Usa hCaptcha invisible (mismo componente que CheckoutStep).
 *
 * Uso imperativo: el padre llama onSuccess(sessionToken, tableLabel, posPaymentMode).
 */

import { useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import InvisibleCaptcha, { type InvisibleCaptchaHandle } from "@/components/InvisibleCaptcha";
import { getDeviceId, getFingerprint } from "@/lib/guestDevice";
import { guestTab } from "@/lib/guestTabSession";

interface TabCodeSheetProps {
  tableQrToken: string;
  palette:      Record<string, string>;
  onSuccess:    (sessionToken: string, expiresAt: string, tableLabel: string, posPaymentMode: "stripe" | "external") => void;
  onClose:      () => void;
}

type Phase = "idle" | "loading" | "error" | "rateLimit" | "blocked" | "tableNotFound" | "captchaFailed";

export default function TabCodeSheet({ tableQrToken, palette, onSuccess, onClose }: TabCodeSheetProps) {
  const t           = useTranslations();
  const captchaRef  = useRef<InvisibleCaptchaHandle>(null);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [phase, setPhase]   = useState<Phase>("idle");
  const [errorMsg, setErrorMsg]   = useState("");
  const [countdown, setCountdown] = useState(0);
  // Un único ref de array en lugar de 6 refs separados (Rules of Hooks compliance)
  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(6).fill(null));
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const code = digits.join("");

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

  function handleDigitChange(idx: number, value: string): void {
    const v = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[idx] = v;
    setDigits(next);
    if (v && idx < 5) inputRefs.current[idx + 1]?.focus();
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>): void {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(""));
      inputRefs.current[5]?.focus();
    }
    e.preventDefault();
  }

  const handleSubmit = useCallback(async () => {
    if (code.length !== 6) return;
    setPhase("loading");
    setErrorMsg("");

    try {
      const cap = await captchaRef.current?.getToken();
      if (!cap || cap.status === "disabled") {
        setPhase("captchaFailed");
        return;
      }
      if (cap.status === "failed") {
        setPhase("captchaFailed");
        return;
      }

      const [deviceId, fingerprint] = await Promise.all([
        Promise.resolve(getDeviceId()),
        getFingerprint(),
      ]);

      const result = await guestTab.createSession({
        table_qr_token: tableQrToken,
        access_code:    code,
        device_id:      deviceId,
        fingerprint,
        captcha_token:  (cap as { status: "ok"; token: string }).token,
      });

      onSuccess(result.session_token, result.expires_at, result.table_label, result.business.pos_payment_mode);

    } catch (err: unknown) {
      const e = err as { code?: string; retry_after_s?: number; message?: string };
      switch (e.code) {
        case "CODE_INVALID":
          setPhase("error");
          setErrorMsg(t("tabCodeInvalid"));
          break;
        case "RATE_LIMITED":
          setPhase("rateLimit");
          startCountdown(e.retry_after_s ?? 300);
          break;
        case "DEVICE_BLOCKED":
          setPhase("blocked");
          break;
        case "TABLE_NOT_FOUND":
          setPhase("tableNotFound");
          break;
        case "CAPTCHA_FAILED":
          setPhase("captchaFailed");
          break;
        default:
          setPhase("error");
          setErrorMsg(e.message ?? "Error inesperado");
      }
    }
  }, [code, tableQrToken, t, onSuccess]);

  const accent = palette.accent ?? "#5C7CFA";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200,
    }} onClick={onClose}>
      <div
        style={{
          background: "var(--menu-bg, #fff)", borderRadius: "16px 16px 0 0",
          padding: "24px 20px 40px", width: "100%", maxWidth: 480,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "var(--menu-text, #111827)" }}>{t("tabCodeTitle")}</h2>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "#6b7280" }}>{t("tabCodeSubtitle")}</p>

        {/* 6 casillas numéricas */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 20 }}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={d}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              style={{
                width: 44, height: 54, textAlign: "center", fontSize: 24, fontWeight: 700,
                border: `2px solid ${d ? accent : "var(--menu-border, #e5e7eb)"}`,
                borderRadius: 8, outline: "none", background: "var(--menu-surface, #f9fafb)",
                color: "var(--menu-text, #111827)",
              }}
            />
          ))}
        </div>

        {/* Mensajes de estado */}
        {phase === "error" && (
          <p style={{ color: "#ef4444", fontSize: 13, textAlign: "center", marginBottom: 12 }}>
            {errorMsg}
          </p>
        )}
        {phase === "rateLimit" && (
          <p style={{ color: "#f59e0b", fontSize: 13, textAlign: "center", marginBottom: 12 }}>
            {t("tabCodeRateLimited", { seconds: countdown })}
          </p>
        )}
        {phase === "blocked" && (
          <p style={{ color: "#ef4444", fontSize: 13, textAlign: "center", marginBottom: 12 }}>
            {t("tabCodeBlocked")}
          </p>
        )}
        {phase === "tableNotFound" && (
          <p style={{ color: "#ef4444", fontSize: 13, textAlign: "center", marginBottom: 12 }}>
            {t("tabCodeTableNotFound")}
          </p>
        )}
        {phase === "captchaFailed" && (
          <p style={{ color: "#f59e0b", fontSize: 13, textAlign: "center", marginBottom: 12 }}>
            {t("tabCodeCaptchaFailed")}
          </p>
        )}

        <button
          onClick={() => void handleSubmit()}
          disabled={code.length !== 6 || phase === "loading" || phase === "rateLimit" || phase === "blocked"}
          style={{
            width: "100%", padding: "14px 0", background: accent, color: "#fff",
            border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700,
            cursor: code.length === 6 ? "pointer" : "not-allowed", opacity: code.length === 6 ? 1 : 0.5,
          }}
        >
          {phase === "loading" ? "…" : t("tabCodeEnter")}
        </button>

        <InvisibleCaptcha ref={captchaRef} />
      </div>
    </div>
  );
}
