"use client";

/**
 * JChat 3.0 — D6: "Remove an e-mail block" (appeals). When a suspended account is deleted, the database keeps only a keyed fingerprint of its
 * e-mail (up to 2 years) so the person cannot sign up again. The fingerprint cannot be turned back into an address, so the admin types the
 * e-mail; admin_unban_email() removes the fingerprint (platform admins only) and logs 8 characters of it, never the address.
 * The address typed here is sent to that one call and is never logged or kept on the page after it.
 */

import React, { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { untypedDb } from "@/lib/untypedDb";

type Phase = "idle" | "confirm" | "busy";

export default function UnbanEmail() {
  const t = useTranslations("reportsAdmin");
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<{ kind: "ok" | "none" | "error"; text: string } | null>(null);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function remove() {
    setPhase("busy");
    setMessage(null);
    const { data, error } = await untypedDb.rpc("admin_unban_email", { p_email: email.trim() });
    setPhase("idle");
    if (error) {
      // Never echo the e-mail or the raw database text.
      setMessage({ kind: "error", text: t("unbanError") });
      return;
    }
    setMessage(data === true ? { kind: "ok", text: t("unbanDone") } : { kind: "none", text: t("unbanNone") });
    setEmail("");
  }

  return (
    <details style={{ background: "var(--bg-surface)", borderTop: "1px solid var(--border-subtle)", padding: "10px 16px" }}>
      <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", minHeight: 32, display: "flex", alignItems: "center" }}>{t("unbanTitle")}</summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 10, maxWidth: 480 }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>{t("unbanHelp")}</p>
        <label htmlFor={inputId} style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t("unbanLabel")}</label>
        <input
          id={inputId}
          type="email"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          value={email}
          disabled={phase === "busy"}
          onChange={(e) => { setEmail(e.target.value); setPhase("idle"); setMessage(null); }}
          style={{ minHeight: 40, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--bg-base)", color: "var(--text-primary)", fontSize: 14 }}
        />
        {phase === "confirm" ? (
          <div role="alertdialog" aria-label={t("unbanTitle")} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, border: "1px solid var(--color-warning)", borderRadius: 8 }}>
            <span style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>{t("unbanConfirm", { email: email.trim() })}</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" autoFocus onClick={() => setPhase("idle")} style={{ minHeight: 40, padding: "0 14px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer" }}>{t("unbanCancel")}</button>
              <button type="button" onClick={() => void remove()} style={{ minHeight: 40, padding: "0 14px", borderRadius: 6, border: "none", background: "var(--color-brand)", color: "var(--on-brand)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{t("unbanConfirmYes")}</button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={!valid || phase === "busy"}
            onClick={() => setPhase("confirm")}
            style={{ alignSelf: "flex-start", minHeight: 40, padding: "0 14px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-primary)", fontSize: 13, fontWeight: 600, cursor: valid && phase !== "busy" ? "pointer" : "not-allowed", opacity: valid && phase !== "busy" ? 1 : 0.5 }}
          >
            {phase === "busy" ? t("unbanBusy") : t("unbanButton")}
          </button>
        )}
        <div role="status" aria-live="polite" style={{ fontSize: 13, color: message?.kind === "error" ? "var(--color-danger)" : "var(--text-primary)", minHeight: 18 }}>{message?.text ?? ""}</div>
      </div>
    </details>
  );
}
