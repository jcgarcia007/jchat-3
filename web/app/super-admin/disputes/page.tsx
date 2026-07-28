/**
 * JChat 3.0 — Super Admin Disputes Queue (Task 3.14)
 *
 * Shows ESCALATED disputes only (status = 'escalated'). These are disputes
 * that received no owner response within 48 hours, or were manually escalated.
 *
 * Super Admin can:
 *   - View full dispute history (opened reason, description, order reference).
 *   - Force Refund is DISABLED for now (see EscalatedRow's button): it used
 *     to write status='refunded' + a placeholder refund_id straight to
 *     `disputes` without ever calling Stripe, which would have permanently
 *     blocked the real refund (D-53's refund_id !== null guard). Re-enable
 *     once Task 3.6 wires the real 'stripe-refund' Edge Function call.
 *
 * TODO(roles): gate this entire page to Super Admin role once roles system exists.
 *
 * Tokens: var(--bg-*) / var(--text-*) / var(--color-*) / var(--border-*)
 *   — global tokens, NOT --db-* (super-admin has its own layout, not db-themed).
 * NO hardcoded hex colors.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { formatRelativeTime } from "@/lib/relativeTime";
import {
  IconShieldExclamation,
  IconAlertCircle,
  IconLoader2,
  IconCheck,
  IconX,
  IconReceiptRefund,
  IconChevronDown,
  IconChevronUp,
  IconClock,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { formatCents } from "@/lib/currency";

// ─── Types ────────────────────────────────────────────────────────────────────

type DisputeStatus =
  | "open"
  | "approved"
  | "rejected"
  | "escalated"
  | "refunded";

interface EscalatedDispute {
  id: string;
  order_id: string;
  opened_by: string;
  status: DisputeStatus;
  reason: string;
  description: string | null;
  resolution: string | null;
  amount_cents: number | null;
  escalated_at: string | null;
  refund_id: string | null;
  created_at: string;
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_ESCALATED: EscalatedDispute[] = [
  {
    id: "demo-esc-1",
    order_id: "order-xyz-001",
    opened_by: "user-demo-010",
    status: "escalated",
    reason: "Charged twice",
    description:
      "My card was charged twice for the same order. Order total was $24. I was charged $48.",
    resolution: null,
    amount_cents: 2400,
    escalated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    refund_id: null,
    created_at: new Date(Date.now() - 55 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-esc-2",
    order_id: "order-xyz-002",
    opened_by: "user-demo-011",
    status: "escalated",
    reason: "Food made me ill",
    description:
      "I had food poisoning after consuming food from this establishment.",
    resolution: null,
    amount_cents: 3200,
    escalated_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    refund_id: null,
    created_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-esc-3",
    order_id: "order-xyz-003",
    opened_by: "user-demo-012",
    status: "escalated",
    reason: "Item never received",
    description: "I paid for my order but it was never prepared or delivered.",
    resolution: null,
    amount_cents: 1550,
    escalated_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    refund_id: null,
    created_at: new Date(Date.now() - 68 * 60 * 60 * 1000).toISOString(),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Page component ───────────────────────────────────────────────────────────

export default function SuperAdminDisputesPage() {
  // TODO(roles): gate this page to Super Admin role only.
  const td = useTranslations("superAdmin.disputes");

  const [disputes, setDisputes] = useState<EscalatedDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Force-refund modal state
  const [activeDispute, setActiveDispute] = useState<EscalatedDispute | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Expanded detail
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Fetch escalated disputes ──────────────────────────────────────────────

  const fetchDisputes = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setDisputes(DEMO_ESCALATED);
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(null);

    const { data, error } = await supabase
      .from("disputes")
      .select(
        "id, order_id, opened_by, status, reason, description, resolution, amount_cents, escalated_at, refund_id, created_at"
      )
      .eq("status", "escalated")
      .order("escalated_at", { ascending: true }); // oldest escalation first

    if (error) {
      setFetchError(error.message);
      setLoading(false);
      return;
    }

    setDisputes((data as EscalatedDispute[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchDisputes();
  }, [fetchDisputes]);

  // ── Force refund ──────────────────────────────────────────────────────────

  // Inert on purpose: the trigger button below is disabled, so this can't
  // fire from the UI. It used to write status='refunded' + a placeholder
  // refund_id to `disputes` and claim success without ever calling Stripe —
  // see the header comment. No DB write, no success claim, until Task 3.6
  // wires the real 'stripe-refund' Edge Function call in here.
  async function handleForceRefund() {
    if (!activeDispute) return;
    setSaving(false);
    setActiveDispute(null);
  }

  // ── Dismiss modal ─────────────────────────────────────────────────────────

  function closeModal() {
    setActiveDispute(null);
    setSaveError(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: "900px" }}>
      {/* Page header */}
      <div style={{ marginBottom: "28px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "6px",
          }}
        >
          <IconShieldExclamation
            size={22}
            stroke={1.6}
            style={{ color: "var(--color-danger)" }}
          />
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            {td("title")}
          </h1>
        </div>
        <p
          style={{
            fontSize: "13px",
            color: "var(--text-secondary)",
            margin: 0,
            maxWidth: "600px",
          }}
        >
          {td("subtitle")}
          {/* TODO(roles): this page must be gated to Super Admin role only */}
          {/* TODO(Task 3.6): Stripe force-refund routed through stripe-refund Edge Function */}
        </p>
      </div>

      {/* Demo banner */}
      {!isSupabaseConfigured && (
        <Banner
          type="warning"
          message={td("demoBanner")}
        />
      )}

      {/* Success banner */}
      {successMsg && (
        <Banner
          type="success"
          message={successMsg}
          onDismiss={() => setSuccessMsg(null)}
        />
      )}

      {/* Fetch error */}
      {fetchError && (
        <Banner
          type="error"
          message={td("fetchErrorPrefix", { error: fetchError })}
        />
      )}

      {/* Loading */}
      {loading && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "60px",
          }}
        >
          <IconLoader2
            size={28}
            stroke={1.6}
            style={{
              color: "var(--color-brand)",
              animation: "spin 1s linear infinite",
            }}
          />
        </div>
      )}

      {/* Empty state — no escalated disputes */}
      {!loading && disputes.length === 0 && !fetchError && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            padding: "64px 24px",
            border: "1px dashed var(--border-subtle)",
            borderRadius: "12px",
            textAlign: "center",
          }}
        >
          <IconCheck
            size={32}
            stroke={1.4}
            style={{ color: "var(--color-success)" }}
          />
          <div
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            {td("emptyTitle")}
          </div>
          <div
            style={{
              fontSize: "13px",
              color: "var(--text-secondary)",
              maxWidth: "360px",
            }}
          >
            {td("emptyMessage")}
          </div>
        </div>
      )}

      {/* Escalated disputes list */}
      {!loading && disputes.length > 0 && (
        <>
          {/* Count header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "14px",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "24px",
                height: "24px",
                borderRadius: "20px",
                background: "var(--color-danger)",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: 700,
                padding: "0 6px",
              }}
            >
              {disputes.length}
            </span>
            <span
              style={{ fontSize: "13px", color: "var(--text-secondary)" }}
            >
              {td("countLabel", { count: disputes.length })}
            </span>
          </div>

          <div
            style={{
              border: "1px solid var(--border-subtle)",
              borderRadius: "12px",
              overflow: "hidden",
            }}
          >
            {disputes.map((d, idx) => (
              <EscalatedRow
                key={d.id}
                dispute={d}
                isLast={idx === disputes.length - 1}
                isExpanded={expandedId === d.id}
                onToggleExpand={() =>
                  setExpandedId(expandedId === d.id ? null : d.id)
                }
                onForceRefund={() => {
                  setActiveDispute(d);
                  setSaveError(null);
                }}
              />
            ))}
          </div>
        </>
      )}

      {/* Force refund confirmation modal */}
      {activeDispute && (
        <ForceRefundModal
          dispute={activeDispute}
          saving={saving}
          error={saveError}
          onConfirm={() => void handleForceRefund()}
          onClose={closeModal}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── EscalatedRow ─────────────────────────────────────────────────────────────

function EscalatedRow({
  dispute: d,
  isLast,
  isExpanded,
  onToggleExpand,
  onForceRefund,
}: {
  dispute: EscalatedDispute;
  isLast: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onForceRefund: () => void;
}) {
  const t = useTranslations("superAdmin.relativeTime");
  const td = useTranslations("superAdmin.disputes");
  return (
    <div
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
        background: "var(--bg-surface)",
      }}
    >
      {/* Main row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "14px 16px",
          flexWrap: "wrap",
          rowGap: "8px",
        }}
      >
        {/* Escalated badge */}
        <span
          style={{
            display: "inline-block",
            padding: "3px 9px",
            borderRadius: "20px",
            fontSize: "11px",
            fontWeight: 700,
            color: "var(--color-danger)",
            border: "1px solid var(--color-danger)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {td("statusBadge")}
        </span>

        {/* Reason + order */}
        <div style={{ flex: "2 1 180px", minWidth: 0 }}>
          <div
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {d.reason}
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--text-tertiary)",
              marginTop: "2px",
            }}
          >
            {td("orderLabel")}{" "}
            <span
              style={{ fontFamily: "var(--font-geist-mono, monospace)" }}
            >
              {d.order_id.slice(0, 14)}…
            </span>
          </div>
        </div>

        {/* Amount */}
        <div
          style={{
            flex: "0 0 80px",
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--text-primary)",
            textAlign: "right",
          }}
        >
          {d.amount_cents !== null ? formatCents(d.amount_cents) : "—"}
        </div>

        {/* Escalation time */}
        {d.escalated_at && (
          <div
            style={{
              flex: "0 0 auto",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "12px",
              color: "var(--text-tertiary)",
            }}
          >
            <IconClock size={13} stroke={1.6} />
            {td("statusBadge")} {formatRelativeTime(d.escalated_at, t, { granularity: "time" })}
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            gap: "8px",
            alignItems: "center",
          }}
        >
          <button
            onClick={onForceRefund}
            disabled
            title={td("forceRefundTooltip")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "6px 12px",
              borderRadius: "6px",
              border: "none",
              background: "var(--bg-elevated, var(--bg-surface))",
              color: "var(--text-tertiary)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "default",
              whiteSpace: "nowrap",
            }}
          >
            <IconReceiptRefund size={13} stroke={2} />
            {td("forceRefundButton")}
          </button>

          <button
            onClick={onToggleExpand}
            aria-label={isExpanded ? td("collapseDetailsAriaLabel") : td("expandDetailsAriaLabel")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "28px",
              height: "28px",
              borderRadius: "6px",
              border: "1px solid var(--border-subtle)",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {isExpanded ? (
              <IconChevronUp size={16} stroke={1.6} />
            ) : (
              <IconChevronDown size={16} stroke={1.6} />
            )}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div
          style={{
            padding: "0 16px 16px",
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--bg-elevated, var(--bg-surface))",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {d.description && (
            <SADetailField
              label={td("customerDescriptionLabel")}
              value={d.description}
            />
          )}
          <SADetailField
            label={td("openedAtLabel")}
            value={new Date(d.created_at).toLocaleString()}
          />
          {d.escalated_at && (
            <SADetailField
              label={td("escalatedAtLabel")}
              value={new Date(d.escalated_at).toLocaleString()}
            />
          )}
          <SADetailField
            label={td("customerIdLabel")}
            value={d.opened_by}
            mono
          />
        </div>
      )}
    </div>
  );
}

// ─── ForceRefundModal ─────────────────────────────────────────────────────────

function ForceRefundModal({
  dispute,
  saving,
  error,
  onConfirm,
  onClose,
}: {
  dispute: EscalatedDispute;
  saving: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const td = useTranslations("superAdmin.disputes");
  const tCommon = useTranslations("common");
  const tb = useTranslations("superAdmin.businesses");

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.60)",
          zIndex: 40,
        }}
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={td("forceRefundModalAriaLabel")}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 50,
          width: "min(480px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 64px)",
          overflowY: "auto",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "14px",
          padding: "28px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          <IconShieldExclamation
            size={20}
            stroke={1.6}
            style={{ color: "var(--color-danger)", flexShrink: 0 }}
          />
          <h2
            style={{
              fontSize: "17px",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            {td("forceRefundModalTitle")}
          </h2>
          <button
            onClick={onClose}
            aria-label={td("closeAriaLabel")}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-tertiary)",
              display: "flex",
              padding: "4px",
              borderRadius: "6px",
            }}
          >
            <IconX size={18} stroke={1.6} />
          </button>
        </div>

        {/* Warning */}
        <div
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid var(--color-danger)",
            borderRadius: "8px",
            padding: "12px 14px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "var(--color-danger)",
              fontSize: "13px",
              fontWeight: 600,
              marginBottom: "6px",
            }}
          >
            <IconAlertCircle size={15} stroke={1.8} />
            {td("overridesWarning")}
          </div>
          <p
            style={{
              fontSize: "12px",
              color: "var(--text-secondary)",
              margin: 0,
            }}
          >
            {td("fullRefundNotice")}
            {/* TODO(server): push notification to customer + owner on force refund */}
          </p>
        </div>

        {/* Dispute summary */}
        <div
          style={{
            background: "var(--bg-elevated, var(--bg-surface))",
            border: "1px solid var(--border-subtle)",
            borderRadius: "8px",
            padding: "14px 16px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: "6px",
            }}
          >
            {dispute.reason}
          </div>
          {dispute.description && (
            <div
              style={{
                fontSize: "13px",
                color: "var(--text-secondary)",
                marginBottom: "8px",
              }}
            >
              {dispute.description}
            </div>
          )}
          <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
            {td("orderLabel")}{" "}
            <code
              style={{ fontFamily: "var(--font-geist-mono, monospace)" }}
            >
              {dispute.order_id}
            </code>
            {dispute.amount_cents !== null && (
              <span>
                {" "}
                · {td("amountLabel")}{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  {formatCents(dispute.amount_cents)}
                </strong>
              </span>
            )}
          </div>
        </div>

        {/* Stripe stub note */}
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-tertiary)",
            marginBottom: "20px",
          }}
        >
          {/* TODO(Task 3.6): actual Stripe refund via 'stripe-refund' Edge Function */}
          {td.rich("stripeRefundNotice", { code: (chunks) => <code>{chunks}</code> })}
        </p>

        {/* Error */}
        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 14px",
              borderRadius: "8px",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid var(--color-danger)",
              color: "var(--color-danger)",
              fontSize: "13px",
              marginBottom: "16px",
            }}
          >
            <IconAlertCircle size={15} stroke={1.6} />
            {error}
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "9px 18px",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
              background: "transparent",
              color: "var(--text-secondary)",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            {tCommon("cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "9px 18px",
              borderRadius: "8px",
              border: "none",
              background: saving ? "var(--text-tertiary)" : "var(--color-danger)",
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? (
              <IconLoader2
                size={14}
                stroke={2}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : (
              <IconReceiptRefund size={14} stroke={2} />
            )}
            {saving ? tb("processingButton") : td("confirmForceRefundButton")}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SADetailField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ paddingTop: "12px" }}>
      <div
        style={{
          fontSize: "11px",
          fontWeight: 700,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "4px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "13px",
          color: "var(--text-secondary)",
          fontFamily: mono
            ? "var(--font-geist-mono, monospace)"
            : "inherit",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Banner({
  type,
  message,
  onDismiss,
}: {
  type: "error" | "success" | "warning";
  message: string;
  onDismiss?: () => void;
}) {
  const td = useTranslations("superAdmin.disputes");
  const colorMap = {
    error: "var(--color-danger)",
    success: "var(--color-success)",
    warning: "var(--color-warning)",
  };
  const bgMap = {
    error: "rgba(239,68,68,0.09)",
    success: "rgba(29,158,117,0.09)",
    warning: "rgba(217,119,6,0.09)",
  };
  const color = colorMap[type];
  const bg = bgMap[type];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "12px 16px",
        borderRadius: "8px",
        background: bg,
        border: `1px solid ${color}`,
        color,
        fontSize: "13px",
        marginBottom: "16px",
      }}
    >
      <IconAlertCircle size={16} stroke={1.6} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label={td("dismissAriaLabel")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color,
            display: "flex",
            padding: "2px",
          }}
        >
          <IconX size={14} stroke={2} />
        </button>
      )}
    </div>
  );
}
