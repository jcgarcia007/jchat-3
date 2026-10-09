"use client";

/**
 * ReportDialog — the web twin of the app's ReportReasonSheet (migration 212).
 * One dialog for every report: pick a reason (child safety first, with the emergency note), optional detail (required
 * for "Other"), send through the report_content RPC. The server validates, deduplicates and takes the snapshot.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabase";
import {
  REPORT_DETAILS_MAX,
  REPORT_REASONS_DISPLAY,
  URGENT_REPORT_REASON,
  reportErrorKey,
  reportNeedsDetails,
  type ReportContentType,
  type ReportReason,
} from "@/lib/reportReasons";

interface ReportDialogProps {
  open: boolean;
  /** Who/what is being reported, for the title. */
  targetName: string;
  contentType: ReportContentType;
  /** The user id for contentType 'user'; otherwise the id of the message / post / comment. */
  contentId: string;
  onClose: () => void;
}

type Phase = "form" | "sending" | "sent";

export function ReportDialog({ open, targetName, contentType, contentId, onClose }: ReportDialogProps) {
  const t = useTranslations("report");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setReason(null); setDetails(""); setPhase("form"); setError(null); }
  }, [open]);

  const needsDetails = reason !== null && reportNeedsDetails(reason);
  const canSend = reason !== null && phase === "form" && (!needsDetails || details.trim().length > 0);

  const send = useCallback(async () => {
    if (!reason || phase !== "form") return;
    if (needsDetails && !details.trim()) { setError(t("errors.detailsRequired")); return; }
    setPhase("sending");
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("report_content", {
      p_content_type: contentType,
      p_content_id: contentId,
      p_reason: reason,
      p_details: details.trim() ? details.trim() : undefined,
    });
    if (rpcError || !data) {
      setError(t(`errors.${reportErrorKey(rpcError)}`));
      setPhase("form");
      return;
    }
    setPhase("sent");
  }, [reason, phase, needsDetails, details, contentType, contentId, t]);

  if (!open) return null;

  return (
    <div style={overlay} onClick={onClose} role="presentation">
      <div role="dialog" aria-modal="true" aria-label={t("title", { name: targetName })} style={panel} onClick={(e) => e.stopPropagation()}>
        {phase === "sent" ? (
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
            <div style={{ fontSize: 34 }} aria-hidden="true">✓</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{t("successTitle")}</div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>{t("successMessage")}</div>
            <button type="button" onClick={onClose} style={primaryBtn}>{t("close")}</button>
          </div>
        ) : (
          <>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{t("title", { name: targetName })}</h2>
            <p style={{ margin: "4px 0 10px", fontSize: 13, color: "var(--text-secondary)" }}>{t("subtitle")}</p>
            <div role="radiogroup" aria-label={t("subtitle")} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {REPORT_REASONS_DISPLAY.map((code) => {
                const selected = reason === code;
                const urgent = code === URGENT_REPORT_REASON;
                return (
                  <button
                    key={code}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => { setReason(code); setError(null); }}
                    style={{
                      ...optionBtn,
                      borderColor: selected ? "var(--color-brand)" : urgent ? "var(--color-danger)" : "var(--border-subtle)",
                      background: selected ? "var(--color-brand-light)" : "transparent",
                      color: urgent ? "var(--color-danger)" : "var(--text-primary)",
                      fontWeight: urgent ? 800 : 500,
                    }}
                  >
                    <span>{t(`reasons.${code}`)}</span>
                    {urgent && <span style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--text-secondary)" }}>{t("childSafetyHint")}</span>}
                  </button>
                );
              })}
            </div>
            {reason !== null && (
              <label style={{ display: "block", marginTop: 10 }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{needsDetails ? t("detailsRequired") : t("detailsOptional")}</span>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value.slice(0, REPORT_DETAILS_MAX))}
                  placeholder={t("detailsPlaceholder")}
                  rows={3}
                  style={textarea}
                />
                <span style={{ display: "block", textAlign: "right", fontSize: 11, color: "var(--text-tertiary)" }}>{details.length}/{REPORT_DETAILS_MAX}</span>
              </label>
            )}
            {error && <div role="alert" style={{ marginTop: 8, fontSize: 13, color: "var(--color-danger)" }}>{error}</div>}
            <button type="button" onClick={() => void send()} disabled={!canSend} style={{ ...primaryBtn, marginTop: 12, opacity: canSend ? 1 : 0.45 }}>
              {phase === "sending" ? t("sending") : t("send")}
            </button>
            <button type="button" onClick={onClose} style={{ ...linkBtn, marginTop: 4 }}>{t("cancel")}</button>
          </>
        )}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end",
  justifyContent: "center", zIndex: 300,
};
const panel: React.CSSProperties = {
  width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", padding: "20px 18px 24px",
  borderRadius: "16px 16px 0 0", background: "var(--bg-surface)", color: "var(--text-primary)",
};
const optionBtn: React.CSSProperties = {
  textAlign: "left", minHeight: 48, padding: "10px 14px", borderRadius: 12, border: "1px solid var(--border-subtle)",
  fontSize: 15, cursor: "pointer",
};
const textarea: React.CSSProperties = {
  width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid var(--border-subtle)",
  background: "var(--bg-base)", color: "var(--text-primary)", fontSize: 15, resize: "vertical",
};
const primaryBtn: React.CSSProperties = {
  width: "100%", minHeight: 46, borderRadius: 12, border: "none", background: "var(--color-brand)",
  color: "var(--bg-surface-light)", fontSize: 15, fontWeight: 700, cursor: "pointer",
};
const linkBtn: React.CSSProperties = {
  width: "100%", minHeight: 44, background: "transparent", border: "none", color: "var(--text-secondary)",
  fontSize: 15, fontWeight: 600, cursor: "pointer",
};
