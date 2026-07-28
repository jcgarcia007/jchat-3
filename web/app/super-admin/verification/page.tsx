/**
 * JChat 3.0 — Super Admin: Business Verification (Task 2.17 / consolidated 2026-07-12)
 *
 * Manual approval console. Approving a business sets businesses.status='verified' — the
 * flag that ENABLES ITS PAYMENTS — via the is_platform_admin()-gated RPC
 * admin_set_business_status(). Approve stamps verified_by/verified_at; revoke returns it
 * to 'pending_verification' (cutting payments) and clears provenance.
 *
 * LEGACY rows (status='verified' with verified_by NULL) were set by the old /api/verify
 * bug and never passed a real approval — surfaced explicitly so they can be re-reviewed.
 *
 * Access: the /super-admin subtree is gated by <SuperAdminGate> (layout) + RLS + the
 * RPC's is_platform_admin() check (defense in depth).
 *
 * Tokens: var(--bg-*) / var(--text-*) / var(--color-*) / var(--border-*). NO hardcoded
 * hex. Icons: @tabler/icons-react only. Secrets (sms_code, daily_code) are never shown.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  IconUserCheck,
  IconLoader2,
  IconAlertCircle,
  IconCheck,
  IconBan,
  IconX,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Row {
  id: string;
  name: string | null;
  slug: string | null;
  status: string;
  is_verified: boolean | null;
  verified_by: string | null;
  verified_at: string | null;
  has_stripe: boolean;
  identity_status: string | null;
  selfie_submitted: boolean;
  sms_verified: boolean | null;
}

const isLegacy = (r: Row) => r.status === "verified" && !r.verified_by;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuperAdminVerificationPage() {
  const t = useTranslations("superAdmin");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<Row | null>(null);

  const fetchAll = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(null);

    const [bizRes, verRes] = await Promise.all([
      supabase
        .from("businesses")
        .select("id, name, slug, status, is_verified, verified_by, verified_at, stripe_account_id")
        .order("name", { ascending: true }),
      // business_verifications is admin-readable (is_platform_admin SELECT policy).
      // NEVER select sms_code / daily_code — those are verification secrets.
      supabase
        .from("business_verifications")
        .select("business_id, identity_status, selfie_url, sms_verified"),
    ]);

    if (bizRes.error) {
      setFetchError(bizRes.error.message);
      setLoading(false);
      return;
    }

    const verByBiz = new Map<string, { identity_status: string | null; selfie_url: string | null; sms_verified: boolean | null }>();
    for (const v of verRes.data ?? []) {
      verByBiz.set(v.business_id, {
        identity_status: v.identity_status,
        selfie_url: v.selfie_url,
        sms_verified: v.sms_verified,
      });
    }

    const mapped: Row[] = (bizRes.data ?? []).map((b) => {
      const v = verByBiz.get(b.id);
      return {
        id: b.id,
        name: b.name,
        slug: b.slug,
        status: b.status,
        is_verified: b.is_verified,
        verified_by: b.verified_by,
        verified_at: b.verified_at,
        has_stripe: !!b.stripe_account_id,
        identity_status: v?.identity_status ?? null,
        selfie_submitted: !!v?.selfie_url,
        sms_verified: v?.sms_verified ?? null,
      };
    });

    setRows(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // Approve → status='verified' (stamps verified_by/at). Revoke → 'pending_verification'.
  const runAction = useCallback(
    async (business: Row, approve: boolean) => {
      setBusyId(business.id);
      setActionError(null);
      const { error } = await supabase.rpc("admin_set_business_status", {
        p_business_id: business.id,
        p_status: approve ? "verified" : "pending_verification",
      });
      setBusyId(null);
      if (error) {
        setActionError(`${business.name ?? business.id}: ${error.message}`);
        return;
      }
      await fetchAll();
    },
    [fetchAll]
  );

  const legacyCount = rows.filter(isLegacy).length;

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <IconUserCheck size={22} stroke={1.6} style={{ color: "var(--color-brand)" }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          {t("verification.title")}
        </h1>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 18px" }}>
        {t.rich("verification.subtitle", {
          status: t("businesses.statusLabelVerified"),
          code: (chunks) => <code>{chunks}</code>,
        })}
      </p>

      {!isSupabaseConfigured && (
        <Banner type="warning" message={t("verification.demoBanner")} />
      )}
      {legacyCount > 0 && (
        <Banner
          type="warning"
          message={t("verification.legacyBanner", { count: legacyCount })}
        />
      )}
      {fetchError && <Banner type="error" message={t("verification.fetchErrorPrefix", { error: fetchError })} />}
      {actionError && (
        <Banner type="error" message={actionError} onDismiss={() => setActionError(null)} />
      )}

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <IconLoader2 size={28} stroke={1.6} style={{ color: "var(--color-brand)", animation: "spin 1s linear infinite" }} />
        </div>
      )}

      {!loading && rows.length === 0 && !fetchError && (
        <div
          style={{
            padding: "48px 24px",
            border: "1px dashed var(--border-subtle)",
            borderRadius: 12,
            textAlign: "center",
            color: "var(--text-secondary)",
            fontSize: 14,
          }}
        >
          {t("verification.noBusinessesToReview")}
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden" }}>
          {rows.map((r, i) => (
            <BusinessRow
              key={r.id}
              row={r}
              isLast={i === rows.length - 1}
              busy={busyId === r.id}
              onApprove={() => void runAction(r, true)}
              onRevoke={() => setConfirmRevoke(r)}
            />
          ))}
        </div>
      )}

      {confirmRevoke && (
        <ConfirmRevoke
          row={confirmRevoke}
          busy={busyId === confirmRevoke.id}
          onCancel={() => setConfirmRevoke(null)}
          onConfirm={async () => {
            const target = confirmRevoke;
            setConfirmRevoke(null);
            await runAction(target, false);
          }}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function BusinessRow({
  row,
  isLast,
  busy,
  onApprove,
  onRevoke,
}: {
  row: Row;
  isLast: boolean;
  busy: boolean;
  onApprove: () => void;
  onRevoke: () => void;
}) {
  const t = useTranslations("superAdmin");
  const verified = row.status === "verified";
  const legacy = isLegacy(row);

  // Display-only — row.status/identity_status stay raw everywhere they're
  // compared (verified/legacy above, ok= below) or persisted (runAction's
  // p_status). Fallback to the raw value if it's ever something unmapped —
  // this page fetches `status` straight from businesses.status without
  // restricting to a known set, so an unexpected value should still render
  // instead of throwing.
  const statusLabels: Record<string, string> = {
    active: t("businesses.statusLabelActive"),
    verified: t("businesses.statusLabelVerified"),
    pending: t("businesses.statusLabelPending"),
    suspended: t("businesses.statusLabelSuspended"),
    closed: t("businesses.statusLabelClosed"),
    rejected: t("businesses.statusLabelRejected"),
    pending_verification: t("verification.statusLabelPendingVerification"),
  };
  const identityStatusLabels: Record<string, string> = {
    approved: t("verification.identityStatusApproved"),
    pending: t("businesses.statusLabelPending"),
    rejected: t("businesses.statusLabelRejected"),
  };

  return (
    <div
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
        background: "var(--bg-surface)",
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        rowGap: 10,
      }}
    >
      {/* Name + slug */}
      <div style={{ flex: "2 1 200px", minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.name ?? row.id.slice(0, 12)}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
          {row.slug ? `/${row.slug}` : row.id.slice(0, 8)}
        </div>
      </div>

      {/* Status + legacy + provenance */}
      <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <StatusPill status={row.status} label={statusLabels[row.status] ?? row.status} />
          {legacy && (
            <span
              title={t("verification.legacyTooltip", { status: statusLabels.verified })}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 7px",
                borderRadius: 20,
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--color-warning)",
                border: "1px solid var(--color-warning)",
              }}
            >
              <IconAlertTriangle size={11} stroke={2} />
              {t("verification.legacyBadge")}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {verified && row.verified_by
            ? `${t("verification.approvedByLabel", { id: row.verified_by.slice(0, 8) })}${row.verified_at ? ` · ${new Date(row.verified_at).toLocaleDateString()}` : ""}`
            : verified
              ? t("verification.noApproverOnRecord")
              : t("verification.notVerified")}
          {row.has_stripe ? ` · ${t("verification.stripeConnectedLabel")}` : ""}
        </div>
      </div>

      {/* Owner steps */}
      <div style={{ flex: "1 1 160px", display: "flex", gap: 8, flexWrap: "wrap" }}>
        <StepChip
          label={t("verification.stepIdentityLabel")}
          ok={row.identity_status === "approved"}
          note={row.identity_status ? (identityStatusLabels[row.identity_status] ?? row.identity_status) : "—"}
        />
        <StepChip label={t("verification.stepSelfieLabel")} ok={row.selfie_submitted} />
        <StepChip label={t("verification.stepSmsLabel")} ok={!!row.sms_verified} />
      </div>

      {/* Actions */}
      <div style={{ flex: "0 0 auto", display: "flex", gap: 6 }}>
        {!verified ? (
          <button onClick={onApprove} disabled={busy} style={actionBtn("var(--color-success)", busy)}>
            {busy ? <IconLoader2 size={13} stroke={2} style={{ animation: "spin 1s linear infinite" }} /> : <IconCheck size={13} stroke={2} />}
            {t("verification.approveButton")}
          </button>
        ) : (
          <button onClick={onRevoke} disabled={busy} style={actionBtn("var(--color-danger)", busy)}>
            {busy ? <IconLoader2 size={13} stroke={2} style={{ animation: "spin 1s linear infinite" }} /> : <IconBan size={13} stroke={2} />}
            {t("verification.revokeButton")}
          </button>
        )}
        {legacy && (
          <button onClick={onApprove} disabled={busy} title={t("verification.reapproveTooltip")} style={actionBtn("var(--color-brand)", busy)}>
            <IconCheck size={13} stroke={2} />
            {t("verification.reapproveButton")}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Confirm revoke ─────────────────────────────────────────────────────────

function ConfirmRevoke({
  row,
  busy,
  onCancel,
  onConfirm,
}: {
  row: Row;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("superAdmin");
  const tCommon = useTranslations("common");

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onCancel]);

  return (
    <>
      <div onClick={onCancel} aria-hidden style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40 }} />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 50,
          width: "min(440px, calc(100vw - 32px))",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 14,
          padding: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <IconBan size={18} stroke={1.6} style={{ color: "var(--color-danger)" }} />
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0, flex: 1 }}>
            {t("verification.revokeModalTitle")}
          </h2>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex" }}>
            <IconX size={16} stroke={1.6} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 18px" }}>
          {t.rich("verification.revokeWarning", {
            name: row.name ?? row.id.slice(0, 12),
            status: t("verification.statusLabelPendingVerification"),
            strongName: (chunks) => <strong style={{ color: "var(--text-primary)" }}>{chunks}</strong>,
            strongEmphasis: (chunks) => <strong>{chunks}</strong>,
            code: (chunks) => <code>{chunks}</code>,
          })}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer" }}>
            {tCommon("cancel")}
          </button>
          <button onClick={onConfirm} disabled={busy} style={actionBtn("var(--color-danger)", busy)}>
            {busy && <IconLoader2 size={13} stroke={2} style={{ animation: "spin 1s linear infinite" }} />}
            {busy ? t("verification.revokingButton") : t("verification.confirmRevokeButton")}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────

function actionBtn(bg: string, busy: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "6px 12px",
    borderRadius: 6,
    border: "none",
    background: busy ? "var(--text-tertiary)" : bg,
    color: "var(--bg-surface-light)",
    fontSize: 12,
    fontWeight: 600,
    cursor: busy ? "not-allowed" : "pointer",
  };
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const verified = status === "verified";
  const color = verified ? "var(--color-success)" : "var(--text-secondary)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 9px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        color,
        border: `1px solid ${color}`,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function StepChip({ label, ok, note }: { label: string; ok: boolean; note?: string }) {
  const color = ok ? "var(--color-success)" : "var(--text-tertiary)";
  return (
    <span title={note ? `${label}: ${note}` : label} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color, fontWeight: 600 }}>
      {ok ? <IconCheck size={12} stroke={2.2} /> : <IconX size={12} stroke={2.2} />}
      {label}
    </span>
  );
}

function Banner({ type, message, onDismiss }: { type: "error" | "success" | "warning"; message: string; onDismiss?: () => void }) {
  const color = type === "error" ? "var(--color-danger)" : type === "success" ? "var(--color-success)" : "var(--color-warning)";
  const bg = type === "error" ? "rgba(239,68,68,0.08)" : type === "success" ? "rgba(29,158,117,0.08)" : "rgba(245,158,11,0.08)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "10px 14px",
        borderRadius: 8,
        background: bg,
        border: `1px solid ${color}`,
        color,
        fontSize: 13,
        marginBottom: 14,
      }}
    >
      <IconAlertCircle size={15} stroke={1.6} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color, display: "flex" }}>
          <IconX size={14} stroke={2} />
        </button>
      )}
    </div>
  );
}
