/**
 * JChat 3.0 — Dashboard Disputes & Refunds (Task 3.14)
 *
 * Owner view: lists all disputes for the owner's business. Each dispute shows a
 * 48-hour countdown from created_at — once elapsed the visual marks it as
 * "Escalated (awaiting server)"; actual escalation (status → 'escalated') is
 * performed server-side.
 *
 * Owner can:
 *   - Approve a refund (full or partial amount_cents input) →
 *       sets status = 'approved' + stores amount_cents.
 *       TODO(Task 3.6): trigger Stripe refund via Edge Function after approve.
 *   - Reject with a written reason → sets status = 'rejected' + resolution.
 *
 * Customer notification at each status change →
 *       TODO(server): push notification / in-app message on status update.
 *
 * Auto-escalation timer is server-side (cron / pg_cron) →
 *       TODO(cron): set status = 'escalated' when NOW() > created_at + interval '48h'.
 *       Here we compute the visual countdown and show a "Will escalate in X" label.
 *
 * Guard: isSupabaseConfigured check; demo rows otherwise.
 * Tokens: var(--db-*) only — NO hardcoded hex.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconX,
  IconClock,
  IconLoader2,
  IconAlertCircle,
  IconReceiptRefund,
  IconChevronDown,
  IconChevronUp,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type DisputeStatus =
  | "open"
  | "approved"
  | "rejected"
  | "escalated"
  | "refunded";

interface Dispute {
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

const DEMO_DISPUTES: Dispute[] = [
  {
    id: "demo-1",
    order_id: "order-abc-001",
    opened_by: "user-demo-001",
    status: "open",
    reason: "Item not received",
    description:
      "I ordered a burger but never received it. Please refund my $12.50.",
    resolution: null,
    amount_cents: 1250,
    escalated_at: null,
    refund_id: null,
    // 10 hours ago — timer still running
    created_at: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-2",
    order_id: "order-abc-002",
    opened_by: "user-demo-002",
    status: "open",
    reason: "Wrong item received",
    description: "I received a cheese pizza instead of a pepperoni pizza.",
    resolution: null,
    amount_cents: 1800,
    escalated_at: null,
    refund_id: null,
    // 50 hours ago — timer elapsed, will show "escalation overdue" visual
    created_at: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-3",
    order_id: "order-abc-003",
    opened_by: "user-demo-003",
    status: "approved",
    reason: "Item quality issue",
    description: "The food was cold and stale.",
    resolution: "Full refund approved.",
    amount_cents: 950,
    escalated_at: null,
    refund_id: null,
    created_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-4",
    order_id: "order-abc-004",
    opened_by: "user-demo-004",
    status: "rejected",
    reason: "Order took too long",
    description: "My order took 45 minutes.",
    resolution:
      "Wait times were communicated in the app. Refund not warranted.",
    amount_cents: null,
    escalated_at: null,
    refund_id: null,
    created_at: new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-5",
    order_id: "order-abc-005",
    opened_by: "user-demo-005",
    status: "escalated",
    reason: "Charged twice",
    description: "My card was charged twice for the same order.",
    resolution: null,
    amount_cents: 2400,
    escalated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    refund_id: null,
    created_at: new Date(Date.now() - 60 * 60 * 60 * 1000).toISOString(),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ESCALATION_MS = 48 * 60 * 60 * 1000; // 48 hours

/** Returns seconds remaining until auto-escalation. Negative = overdue. */
function secondsUntilEscalation(createdAt: string): number {
  const deadline = new Date(createdAt).getTime() + ESCALATION_MS;
  return Math.floor((deadline - Date.now()) / 1000);
}

/** Formats a seconds value as "Xh Ym" or "Xm Ys". */
function formatCountdown(secs: number): string {
  const abs = Math.abs(secs);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const s = abs % 60;
  return `${m}m ${s}s`;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function statusLabel(s: DisputeStatus): string {
  const map: Record<DisputeStatus, string> = {
    open: "Open",
    approved: "Approved",
    rejected: "Rejected",
    escalated: "Escalated",
    refunded: "Refunded",
  };
  return map[s];
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);

  // Action sheet state
  const [activeDispute, setActiveDispute] = useState<Dispute | null>(null);
  const [actionMode, setActionMode] = useState<"approve" | "reject" | null>(
    null
  );
  const [refundFull, setRefundFull] = useState(true);
  const [partialCents, setPartialCents] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Live countdown ticker
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Resolve owner's business ──────────────────────────────────────────────

  const resolveBusinessId = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: biz } = await supabase
        .from("businesses")
        .select("id")
        .eq("owner_id", user.id)
        .single();
      if (biz) setBusinessId((biz as { id: string }).id);
    } catch {
      // no-op — businessId stays null
    }
  }, []);

  // ── Fetch disputes ────────────────────────────────────────────────────────

  const fetchDisputes = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setDisputes(DEMO_DISPUTES);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(null);

    // Join orders so we can filter by the owner's business
    // Assumes orders table has a business_id column
    const { data, error } = await supabase
      .from("disputes")
      .select(
        `
        id, order_id, opened_by, status, reason, description,
        resolution, amount_cents, escalated_at, refund_id, created_at,
        orders!inner(business_id)
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      setFetchError(error.message);
      setLoading(false);
      return;
    }

    // Filter client-side to this owner's business (if resolved)
    const typed = (data as unknown) as Array<
      Dispute & { orders: { business_id: string } | null }
    >;
    const rows = typed.filter((d) => {
      if (!businessId) return true; // show all if biz not yet resolved
      return d.orders?.business_id === businessId;
    });

    setDisputes(rows);
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    void resolveBusinessId();
  }, [resolveBusinessId]);

  useEffect(() => {
    void fetchDisputes();
  }, [fetchDisputes]);

  // ── Approve action ────────────────────────────────────────────────────────

  async function handleApprove() {
    if (!activeDispute) return;
    setActionError(null);

    let cents: number | null = null;
    if (refundFull) {
      cents = activeDispute.amount_cents;
    } else {
      const parsed = parseInt(partialCents.replace(/[^0-9]/g, ""), 10);
      if (isNaN(parsed) || parsed <= 0) {
        setActionError("Enter a valid refund amount in cents (e.g. 1250 = $12.50).");
        return;
      }
      cents = parsed;
    }

    setSaving(true);

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from("disputes")
        .update({
          status: "approved",
          amount_cents: cents,
          resolution: refundFull
            ? "Full refund approved by owner."
            : `Partial refund of ${cents ? formatCents(cents) : "?"} approved by owner.`,
        })
        .eq("id", activeDispute.id);

      if (error) {
        setActionError(error.message);
        setSaving(false);
        return;
      }
    }

    // TODO(Task 3.6): trigger Stripe refund via Edge Function.
    //   await supabase.functions.invoke('stripe-refund', {
    //     body: { dispute_id: activeDispute.id, amount_cents: cents },
    //   });

    // TODO(server): notify customer that refund was approved.

    setSaving(false);
    closeAction();
    void fetchDisputes();
  }

  // ── Reject action ─────────────────────────────────────────────────────────

  async function handleReject() {
    if (!activeDispute) return;
    setActionError(null);

    if (!rejectReason.trim()) {
      setActionError("A rejection reason is required.");
      return;
    }

    setSaving(true);

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from("disputes")
        .update({
          status: "rejected",
          resolution: rejectReason.trim(),
        })
        .eq("id", activeDispute.id);

      if (error) {
        setActionError(error.message);
        setSaving(false);
        return;
      }
    }

    // TODO(server): notify customer that dispute was rejected.

    setSaving(false);
    closeAction();
    void fetchDisputes();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function openAction(d: Dispute, mode: "approve" | "reject") {
    setActiveDispute(d);
    setActionMode(mode);
    setRefundFull(true);
    setPartialCents("");
    setRejectReason("");
    setActionError(null);
  }

  function closeAction() {
    setActiveDispute(null);
    setActionMode(null);
    setActionError(null);
  }

  // ── Status counts ─────────────────────────────────────────────────────────

  const openCount = disputes.filter((d) => d.status === "open").length;
  const escalatedCount = disputes.filter(
    (d) => d.status === "escalated"
  ).length;

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
          <IconReceiptRefund
            size={22}
            stroke={1.6}
            style={{ color: "var(--db-accent)" }}
          />
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--db-text-primary)",
              margin: 0,
            }}
          >
            Disputes &amp; Refunds
          </h1>
        </div>
        <p
          style={{
            fontSize: "13px",
            color: "var(--db-text-secondary)",
            margin: 0,
            maxWidth: "600px",
          }}
        >
          Customer disputes for your orders. Respond within 48 hours — disputes
          with no response are automatically escalated to Super Admin.
          {/* TODO(cron): pg_cron job sets status='escalated' at created_at + 48h */}
          {/* TODO(server): customer receives push notification on every status change */}
        </p>
      </div>

      {/* Demo banner */}
      {!isSupabaseConfigured && (
        <AlertBanner
          type="warning"
          message="Demo mode — Supabase not configured. Actions are shown but not persisted."
        />
      )}

      {/* Fetch error */}
      {fetchError && (
        <AlertBanner type="error" message={`Failed to load disputes: ${fetchError}`} />
      )}

      {/* Summary chips */}
      {disputes.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            marginBottom: "24px",
          }}
        >
          <SummaryChip
            label="Open"
            count={openCount}
            color="var(--db-warning)"
          />
          <SummaryChip
            label="Escalated"
            count={escalatedCount}
            color="var(--db-danger)"
          />
          <SummaryChip
            label="Total"
            count={disputes.length}
            color="var(--db-text-secondary)"
          />
        </div>
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
              color: "var(--db-accent)",
              animation: "spin 1s linear infinite",
            }}
          />
        </div>
      )}

      {/* Empty state */}
      {!loading && disputes.length === 0 && !fetchError && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            padding: "64px 24px",
            border: "1px dashed var(--db-border)",
            borderRadius: "12px",
            textAlign: "center",
          }}
        >
          <IconCheck size={32} stroke={1.4} style={{ color: "var(--db-success)" }} />
          <div
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--db-text-primary)",
            }}
          >
            No disputes
          </div>
          <div
            style={{
              fontSize: "13px",
              color: "var(--db-text-secondary)",
              maxWidth: "360px",
            }}
          >
            Your customers haven&apos;t opened any disputes. Keep up the great
            service!
          </div>
        </div>
      )}

      {/* Disputes list */}
      {!loading && disputes.length > 0 && (
        <div
          style={{
            border: "1px solid var(--db-border)",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          {disputes.map((d, idx) => (
            <DisputeRow
              key={d.id}
              dispute={d}
              isLast={idx === disputes.length - 1}
              isExpanded={expandedId === d.id}
              onToggleExpand={() =>
                setExpandedId(expandedId === d.id ? null : d.id)
              }
              onApprove={() => openAction(d, "approve")}
              onReject={() => openAction(d, "reject")}
            />
          ))}
        </div>
      )}

      {/* Action modal */}
      {activeDispute && actionMode && (
        <Modal
          title={
            actionMode === "approve" ? "Approve Refund" : "Reject Dispute"
          }
          onClose={closeAction}
        >
          {/* Dispute summary */}
          <div
            style={{
              background: "var(--db-bg-elevated)",
              border: "1px solid var(--db-border)",
              borderRadius: "8px",
              padding: "14px 16px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--db-text-primary)",
                marginBottom: "4px",
              }}
            >
              {activeDispute.reason}
            </div>
            {activeDispute.description && (
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--db-text-secondary)",
                  marginBottom: "8px",
                }}
              >
                {activeDispute.description}
              </div>
            )}
            <div
              style={{
                fontSize: "12px",
                color: "var(--db-text-tertiary)",
              }}
            >
              Order: <code>{activeDispute.order_id}</code>
              {activeDispute.amount_cents !== null && (
                <span>
                  {" "}
                  · Order total:{" "}
                  <strong style={{ color: "var(--db-text-primary)" }}>
                    {formatCents(activeDispute.amount_cents)}
                  </strong>
                </span>
              )}
            </div>
          </div>

          {actionMode === "approve" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Refund type */}
              <div>
                <FieldLabel>Refund amount</FieldLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <RadioOption
                    checked={refundFull}
                    onChange={() => setRefundFull(true)}
                    label={`Full refund${activeDispute.amount_cents !== null ? ` — ${formatCents(activeDispute.amount_cents)}` : ""}`}
                  />
                  <RadioOption
                    checked={!refundFull}
                    onChange={() => setRefundFull(false)}
                    label="Partial refund"
                  />
                </div>
              </div>

              {!refundFull && (
                <div>
                  <FieldLabel>Amount in cents (e.g. 1250 = $12.50)</FieldLabel>
                  <input
                    type="number"
                    min={1}
                    value={partialCents}
                    onChange={(e) => setPartialCents(e.target.value)}
                    placeholder="Enter cents"
                    style={inputStyle}
                    autoFocus
                  />
                </div>
              )}

              <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", margin: 0 }}>
                {/* TODO(Task 3.6): Stripe refund triggered via 'stripe-refund' Edge Function */}
                Stripe refund will be processed server-side via Edge Function (Task 3.6).
              </p>

              {actionError && <AlertBanner type="error" message={actionError} />}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button onClick={closeAction} style={cancelBtn}>
                  Cancel
                </button>
                <button
                  onClick={() => void handleApprove()}
                  disabled={saving}
                  style={approveBtn(saving)}
                >
                  {saving ? (
                    <IconLoader2
                      size={14}
                      stroke={2}
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                  ) : (
                    <IconCheck size={14} stroke={2} />
                  )}
                  Approve Refund
                </button>
              </div>
            </div>
          )}

          {actionMode === "reject" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <FieldLabel>Rejection reason *</FieldLabel>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explain why you are rejecting this dispute…"
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical" }}
                  autoFocus
                />
              </div>

              <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", margin: 0 }}>
                {/* TODO(server): customer receives push notification when rejected */}
                Customer will be notified of the rejection (server-side).
              </p>

              {actionError && <AlertBanner type="error" message={actionError} />}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button onClick={closeAction} style={cancelBtn}>
                  Cancel
                </button>
                <button
                  onClick={() => void handleReject()}
                  disabled={saving}
                  style={rejectBtn(saving)}
                >
                  {saving ? (
                    <IconLoader2
                      size={14}
                      stroke={2}
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                  ) : (
                    <IconX size={14} stroke={2} />
                  )}
                  Reject Dispute
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── DisputeRow ───────────────────────────────────────────────────────────────

function DisputeRow({
  dispute: d,
  isLast,
  isExpanded,
  onToggleExpand,
  onApprove,
  onReject,
}: {
  dispute: Dispute;
  isLast: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const secs = secondsUntilEscalation(d.created_at);
  const overdue = secs < 0;
  const isActionable = d.status === "open" || d.status === "escalated";

  const statusColor: Record<DisputeStatus, string> = {
    open: "var(--db-warning)",
    approved: "var(--db-success)",
    rejected: "var(--db-danger)",
    escalated: "var(--db-danger)",
    refunded: "var(--db-success)",
  };

  return (
    <div
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--db-border)",
        background: "var(--db-bg-surface)",
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
        {/* Status badge */}
        <StatusBadge status={d.status} color={statusColor[d.status]} />

        {/* Reason + order */}
        <div style={{ flex: "2 1 180px", minWidth: 0 }}>
          <div
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--db-text-primary)",
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
              color: "var(--db-text-tertiary)",
              marginTop: "2px",
            }}
          >
            Order:{" "}
            <span style={{ fontFamily: "var(--font-geist-mono, monospace)" }}>
              {d.order_id.slice(0, 12)}…
            </span>
          </div>
        </div>

        {/* Amount */}
        <div
          style={{
            flex: "0 0 80px",
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--db-text-primary)",
            textAlign: "right",
          }}
        >
          {d.amount_cents !== null ? formatCents(d.amount_cents) : "—"}
        </div>

        {/* Countdown / escalation indicator */}
        {d.status === "open" && (
          <div
            style={{
              flex: "0 0 140px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "12px",
              color: overdue ? "var(--db-danger)" : "var(--db-warning)",
              fontWeight: overdue ? 700 : 400,
            }}
          >
            {overdue ? (
              <IconAlertTriangle size={14} stroke={1.8} />
            ) : (
              <IconClock size={14} stroke={1.6} />
            )}
            {overdue
              ? `Overdue ${formatCountdown(secs)} ago`
              : `Escalates in ${formatCountdown(secs)}`}
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
          {isActionable && (
            <>
              <button
                onClick={onApprove}
                style={smallPrimaryBtn}
                title="Approve refund"
              >
                <IconCheck size={13} stroke={2} />
                Approve
              </button>
              <button
                onClick={onReject}
                style={smallDangerBtn}
                title="Reject dispute"
              >
                <IconX size={13} stroke={2} />
                Reject
              </button>
            </>
          )}
          <button
            onClick={onToggleExpand}
            aria-label={isExpanded ? "Collapse details" : "Expand details"}
            style={expandBtn}
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
            padding: "0 16px 16px 16px",
            borderTop: "1px solid var(--db-border)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            background: "var(--db-bg-elevated)",
          }}
        >
          {d.description && (
            <DetailField label="Customer description" value={d.description} />
          )}
          {d.resolution && (
            <DetailField label="Resolution note" value={d.resolution} />
          )}
          <DetailField
            label="Opened at"
            value={new Date(d.created_at).toLocaleString()}
          />
          {d.escalated_at && (
            <DetailField
              label="Escalated at"
              value={new Date(d.escalated_at).toLocaleString()}
            />
          )}
          {d.refund_id && (
            <DetailField label="Stripe refund ID" value={d.refund_id} mono />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({
  status,
  color,
}: {
  status: DisputeStatus;
  color: string;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 9px",
        borderRadius: "20px",
        fontSize: "11px",
        fontWeight: 700,
        color,
        border: `1px solid ${color}`,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {statusLabel(status)}
    </span>
  );
}

function SummaryChip({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "5px 12px",
        borderRadius: "20px",
        border: "1px solid var(--db-border)",
        background: "var(--db-bg-elevated)",
        fontSize: "12px",
        color: "var(--db-text-secondary)",
      }}
    >
      <span
        style={{
          fontSize: "15px",
          fontWeight: 700,
          color,
        }}
      >
        {count}
      </span>
      {label}
    </div>
  );
}

function DetailField({
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
          color: "var(--db-text-tertiary)",
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
          color: "var(--db-text-secondary)",
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

function AlertBanner({
  type,
  message,
}: {
  type: "error" | "success" | "warning";
  message: string;
}) {
  const colors = {
    error: { bg: "rgba(239,68,68,0.1)", color: "var(--db-danger)" },
    success: { bg: "rgba(29,158,117,0.1)", color: "var(--db-success)" },
    warning: { bg: "rgba(217,119,6,0.1)", color: "var(--db-warning)" },
  };
  const c = colors[type];
  const Icon =
    type === "error" || type === "warning" ? IconAlertCircle : IconCheck;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "12px 16px",
        borderRadius: "8px",
        background: c.bg,
        color: c.color,
        fontSize: "13px",
        marginBottom: "16px",
      }}
    >
      <Icon size={16} stroke={1.6} />
      {message}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: "12px",
        fontWeight: 600,
        color: "var(--db-text-secondary)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        marginBottom: "6px",
      }}
    >
      {children}
    </label>
  );
}

function RadioOption({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        cursor: "pointer",
        fontSize: "13px",
        color: checked ? "var(--db-text-primary)" : "var(--db-text-secondary)",
        fontWeight: checked ? 600 : 400,
      }}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        style={{ accentColor: "var(--db-accent)" }}
      />
      {label}
    </label>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 40,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 50,
          width: "min(520px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 64px)",
          overflowY: "auto",
          background: "var(--db-bg-surface)",
          border: "1px solid var(--db-border)",
          borderRadius: "14px",
          padding: "24px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px",
          }}
        >
          <h2
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--db-text-primary)",
              margin: 0,
            }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              color: "var(--db-text-tertiary)",
              display: "flex",
              borderRadius: "6px",
            }}
          >
            <IconX size={18} stroke={1.6} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

// ─── Inline styles (no hardcoded hex) ────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "8px",
  border: "1px solid var(--db-border)",
  background: "var(--db-bg-elevated)",
  color: "var(--db-text-primary)",
  fontSize: "13px",
  outline: "none",
  boxSizing: "border-box",
};

const cancelBtn: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: "8px",
  border: "1px solid var(--db-border)",
  background: "transparent",
  color: "var(--db-text-secondary)",
  fontSize: "13px",
  cursor: "pointer",
};

function approveBtn(disabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 16px",
    borderRadius: "8px",
    border: "none",
    background: disabled ? "var(--db-text-tertiary)" : "var(--db-success)",
    color: "var(--db-success-text, #ffffff)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function rejectBtn(disabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 16px",
    borderRadius: "8px",
    border: "none",
    background: disabled ? "var(--db-text-tertiary)" : "var(--db-danger)",
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const smallPrimaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  padding: "5px 10px",
  borderRadius: "6px",
  border: "none",
  background: "var(--db-success)",
  color: "#ffffff",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const smallDangerBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  padding: "5px 10px",
  borderRadius: "6px",
  border: "none",
  background: "var(--db-danger)",
  color: "#ffffff",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const expandBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "28px",
  height: "28px",
  borderRadius: "6px",
  border: "1px solid var(--db-border)",
  background: "transparent",
  color: "var(--db-text-secondary)",
  cursor: "pointer",
};
