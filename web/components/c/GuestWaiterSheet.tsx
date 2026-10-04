"use client";

/**
 * GuestWaiterSheet — "Call the waiter" WITHOUT an account (golden rule, migration 198).
 *
 * Needs the table QR (the table is known from /t or the saved table context), the browser location
 * and hCaptcha, like guest-tab. The server decides everything (location inside the venue, device
 * blocks, ONE open call per table, abuse alert to the owner); this sheet only forwards and translates:
 *   outside_venue      → "To do this you need to be at {business}" + Allow location / Retry
 *   call_already_open  → "We already told the staff. Wait for them to attend you."
 *   blocked_24h        → "You can't call the service right now."
 */

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { IconBell, IconLoader2, IconX } from "@tabler/icons-react";
import { supabase } from "@/lib/supabase";
import InvisibleCaptcha, { type InvisibleCaptchaHandle } from "@/components/InvisibleCaptcha";
import { getDeviceId } from "@/lib/guestDevice";
import { readFunctionErrorCode, requestPosition, venueErrorKey } from "@/lib/venueLocation";

type State = "idle" | "locating" | "sending" | "success" | "error";

interface Props {
  tableToken: string;
  tableLabel: string;
  businessName: string;
  onClose: () => void;
}

export function GuestWaiterSheet({ tableToken, tableLabel, businessName, onClose }: Props) {
  const t = useTranslations("waiterSheet");
  const tv = useTranslations("venue");
  const captchaRef = useRef<InvisibleCaptchaHandle>(null);
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<State>("idle");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [needsLocation, setNeedsLocation] = useState(false);

  async function handleSend() {
    if (state === "locating" || state === "sending") return;
    setErrorKey(null);
    setNeedsLocation(false);

    // 1) Location: without it the server cannot place the person in the venue.
    setState("locating");
    const position = await requestPosition({ useCache: false });
    if (!position.ok) {
      setState("error");
      setErrorKey("outsideVenue");
      setNeedsLocation(true);
      return;
    }

    // 2) hCaptcha (same as guest-tab); a failed challenge aborts, a disabled one (no sitekey) goes on.
    setState("sending");
    const captcha = (await captchaRef.current?.getToken()) ?? { status: "disabled" as const };
    if (captcha.status === "failed") {
      setState("error");
      setErrorKey("sendError");
      return;
    }

    const { data, error } = await supabase.functions.invoke("guest-tab", {
      body: {
        action: "request_service",
        table_qr_token: tableToken,
        device_id: getDeviceId(),
        captcha_token: captcha.status === "ok" ? captcha.token : undefined,
        lat: position.pos.lat,
        lng: position.pos.lng,
        notes: notes.trim() || undefined,
      },
    });

    if (!error && (data as { ok?: boolean } | null)?.ok) {
      setState("success");
      setTimeout(onClose, 2200);
      return;
    }

    const code = await readFunctionErrorCode(error);
    const key = venueErrorKey(code);
    setState("error");
    setErrorKey(key ?? "sendError");
    setNeedsLocation(key === "outsideVenue");
  }

  const message = errorKey === "sendError" ? t("sendError") : errorKey ? tv(errorKey, { business: businessName }) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
      style={{ position: "fixed", inset: 0, background: "rgb(var(--ink-rgb) / 0.55)", display: "flex", flexDirection: "column", justifyContent: "flex-end", zIndex: 50 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--bg-surface)", borderRadius: "20px 20px 0 0", padding: "20px 20px 32px", display: "flex", flexDirection: "column", gap: 14, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconBell size={20} style={{ color: "var(--color-brand)" }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{t("title")}</span>
          </div>
          <button
            onClick={onClose}
            aria-label={t("close")}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, border: "none", background: "var(--bg-elevated)", color: "var(--text-secondary)", cursor: "pointer" }}
          >
            <IconX size={16} />
          </button>
        </div>

        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{tableLabel}</div>

        {state === "success" && (
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgb(var(--color-success-rgb) / 0.12)", color: "var(--color-success)", fontSize: 14, fontWeight: 600 }}>
            ✓ {t("notified")}
          </div>
        )}

        {state === "error" && message && (
          <div role="alert" style={{ padding: "10px 14px", borderRadius: 10, background: "rgb(var(--color-danger-rgb) / 0.1)", border: "1px solid var(--color-danger)", color: "var(--color-danger)", fontSize: 13 }}>
            {message}
          </div>
        )}

        {state !== "success" && errorKey !== "blocked24h" && (
          <>
            <textarea
              placeholder={t("notePlaceholder")}
              aria-label={t("noteLabel")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={200}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-subtle)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: 14, outline: "none", fontFamily: "inherit", resize: "none" }}
            />
            <button
              onClick={() => void handleSend()}
              disabled={state === "locating" || state === "sending" || errorKey === "callAlreadyOpen"}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 16px", borderRadius: 12, border: "none", background: "var(--color-brand)", color: "var(--on-brand)", fontSize: 15, fontWeight: 600, cursor: "pointer", opacity: state === "locating" || state === "sending" || errorKey === "callAlreadyOpen" ? 0.6 : 1 }}
            >
              {(state === "locating" || state === "sending") && <IconLoader2 size={18} className="spin" />}
              {state === "locating" ? tv("locating") : state === "sending" ? t("sending") : needsLocation ? tv("allowLocation") : t("title")}
            </button>
          </>
        )}

        <InvisibleCaptcha ref={captchaRef} />
      </div>
    </div>
  );
}
