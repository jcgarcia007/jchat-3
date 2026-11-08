"use client";

/**
 * JChat 3.0 — Custom-plan request form (modal) of /pricing/business. Replaces the temporary mailto of phase C.
 *
 * A native <dialog> (focus trap, Esc, backdrop and screen-reader semantics for free). Fields: business name, number of venues, phone (optional),
 * e-mail (prefilled from the session) and message (optional). It runs the invisible hCaptcha, then POSTs to /api/business-plan-request, which
 * rate-limits (3 per hour) and stores the request through the RPC of migration 269. Success: "Thanks, we will write to you in 1 business day at {email}".
 *
 * NO e-mail is sent in this spec. TODO spec 4: the RPC will queue outbound_emails kind='business_plan_request' → SALES_EMAIL (ventas@jchat.cloud);
 * until then Juan reads the requests with the read-only query documented in supabase/migrations/269_business_plan_requests.sql.
 */

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconAlertCircle, IconCheck, IconLoader2, IconX } from "@tabler/icons-react";
import InvisibleCaptcha, { type InvisibleCaptchaHandle } from "@/components/InvisibleCaptcha";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

type Status = "idle" | "sending" | "done";

const FIELD: React.CSSProperties = {
  width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 8, fontSize: 15, boxSizing: "border-box",
  border: "1px solid rgb(var(--ink-rgb) / .25)", background: "rgb(var(--white-rgb))", color: "var(--land-text)", fontFamily: "inherit",
};
const LABEL: React.CSSProperties = { display: "grid", gap: 6, fontSize: 14, fontWeight: 600, color: "var(--land-text)" };

export default function CustomPlanForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("pricingBusiness");
  const locale = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const captchaRef = useRef<InvisibleCaptchaHandle>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [locations, setLocations] = useState("1");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sentTo, setSentTo] = useState("");

  // Open / close the native dialog from the `open` prop; the email is prefilled from the session when there is one.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      if (isSupabaseConfigured) {
        void supabase.auth
          .getUser()
          .then(({ data }) => {
            const known = data.user?.email;
            if (known) setEmail((current) => current || known);
          })
          .catch(() => {
            // Offline or blocked: the visitor just types the address.
          });
      }
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function close() {
    // After a successful send the next opening starts from an empty form.
    if (status === "done") {
      setStatus("idle");
      setName("");
      setLocations("1");
      setPhone("");
      setMessage("");
    }
    setError(null);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setError(null);
    setStatus("sending");

    // hCaptcha (same as guest-tab): a failed challenge aborts, a disabled one (no sitekey) goes on.
    const captcha = (await captchaRef.current?.getToken()) ?? { status: "disabled" as const };
    if (captcha.status === "failed") {
      setStatus("idle");
      setError(t("form.errorCaptcha"));
      return;
    }

    try {
      const res = await fetch("/api/business-plan-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          business_name: name,
          locations_count: Number(locations),
          phone,
          email,
          message,
          locale,
          captcha_token: captcha.status === "ok" ? captcha.token : undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; code?: string } | null;
      if (res.ok && body?.ok === true) {
        setSentTo(email.trim());
        setStatus("done");
        return;
      }
      setStatus("idle");
      if (body?.code === "RATE_LIMIT") setError(t("form.errorRateLimit"));
      else if (body?.code === "INVALID") setError(t("form.errorInvalid"));
      else if (body?.code === "CAPTCHA") setError(t("form.errorCaptcha"));
      else setError(t("form.errorGeneric"));
    } catch {
      setStatus("idle");
      setError(t("form.errorGeneric"));
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={close}
      onClick={(e) => {
        // A click on the backdrop (the <dialog> element itself, outside its padded box) closes it.
        if (e.target === dialogRef.current) close();
      }}
      aria-labelledby="pb-form-title"
      className="pb-dialog"
    >
      <style>{`
        .pb-dialog { border: none; padding: 0; margin: auto; inset: 0; background: transparent; max-width: calc(100vw - 24px); width: 520px; color: var(--land-text); }
        .pb-dialog::backdrop { background: rgb(var(--ink-rgb) / .5); }
        .pb-dialog input:focus-visible, .pb-dialog textarea:focus-visible, .pb-dialog button:focus-visible { outline: 3px solid var(--land-text); outline-offset: 2px; }
      `}</style>
      <div style={{ background: "rgb(var(--white-rgb))", borderRadius: 18, padding: 24, boxShadow: "var(--land-shadow)", maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <h2 id="pb-form-title" style={{ fontFamily: "var(--font-grotesk), system-ui, sans-serif", fontSize: 24, fontWeight: 700, letterSpacing: "-.03em", margin: 0 }}>
            {t("form.title")}
          </h2>
          <button type="button" onClick={close} aria-label={t("form.close")} style={{ minWidth: 44, minHeight: 44, border: "none", background: "transparent", cursor: "pointer", color: "var(--land-text)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <IconX size={20} aria-hidden />
          </button>
        </div>

        {status === "done" ? (
          <div>
            <p role="status" style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 15, lineHeight: 1.55, margin: "0 0 20px" }}>
              <IconCheck size={20} aria-hidden style={{ color: "var(--pb-teal)", flexShrink: 0, marginTop: 2 }} />
              <span>{t("form.success", { email: sentTo })}</span>
            </p>
            <button type="button" onClick={close} style={{ minHeight: 48, width: "100%", borderRadius: 10, border: "none", background: "var(--land-text)", color: "var(--on-brand)", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              {t("form.close")}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--land-sub)", margin: 0 }}>{t("form.intro")}</p>

            <label style={LABEL}>
              {t("form.nameLabel")}
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="organization" style={FIELD} />
            </label>

            <label style={LABEL}>
              {t("form.locationsLabel")}
              <input type="number" inputMode="numeric" min={1} max={999} step={1} value={locations} onChange={(e) => setLocations(e.target.value)} required style={FIELD} />
            </label>

            <label style={LABEL}>
              <span>{t("form.phoneLabel")} <span style={{ fontWeight: 400, color: "var(--land-sub)" }}>{t("form.optional")}</span></span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} autoComplete="tel" style={FIELD} />
            </label>

            <label style={LABEL}>
              {t("form.emailLabel")}
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} autoComplete="email" style={FIELD} />
            </label>

            <label style={LABEL}>
              <span>{t("form.messageLabel")} <span style={{ fontWeight: 400, color: "var(--land-sub)" }}>{t("form.optional")}</span></span>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={4} style={{ ...FIELD, minHeight: 96, padding: 12, resize: "vertical" }} />
            </label>

            <InvisibleCaptcha ref={captchaRef} />

            {error && (
              <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", borderRadius: 8, background: "color-mix(in srgb, var(--color-danger) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)", fontSize: 14 }}>
                <IconAlertCircle size={16} aria-hidden style={{ color: "var(--color-danger)", flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="submit"
                disabled={status === "sending"}
                style={{ flex: "1 1 200px", minHeight: 48, borderRadius: 10, border: "none", background: "var(--land-peach)", color: "var(--on-brand)", fontSize: 15, fontWeight: 700, cursor: status === "sending" ? "wait" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {status === "sending" ? (
                  <>
                    <IconLoader2 size={16} aria-hidden style={{ animation: "pb-spin 1s linear infinite" }} />
                    {t("form.sending")}
                  </>
                ) : (
                  t("form.submit")
                )}
              </button>
              <button type="button" onClick={close} style={{ flex: "0 1 120px", minHeight: 48, borderRadius: 10, border: "2px solid var(--land-text)", background: "transparent", color: "var(--land-text)", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                {t("form.cancel")}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
