/**
 * JChat 3.0 — Super Admin Verification Queue (Task 3.13)
 *
 * Shows business_verifications with identity_status = 'pending'.
 * Approve → businesses.status = 'verified', business_verifications.identity_status = 'approved'
 * Reject  → businesses.status = 'rejected', business_verifications.identity_status = 'rejected'
 *
 * TODO(roles): gate to Super Admin / Compliance Admin.
 * TODO(server): notify business owner on approve/reject.
 *
 * Tokens: var(--bg-*) / var(--text-*) / var(--color-*) / var(--border-*)
 * NO hardcoded hex. Icons: @tabler/icons-react only.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  IconUserCheck,
  IconLoader2,
  IconAlertCircle,
  IconX,
  IconCheck,
  IconBan,
  IconChevronDown,
  IconChevronUp,
  IconClock,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VerificationItem {
  id: string;
  business_id: string;
  business_name: string | null;
  business_slug: string | null;
  identity_status: string;
  submitted_at: string | null;
  owner_id: string | null;
  documents: string[] | null; // array of document URLs / refs
  notes: string | null;
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_VERIFICATIONS: VerificationItem[] = [
  {
    id: "demo-ver-01",
    business_id: "demo-biz-10",
    business_name: "The Velvet Lounge",
    business_slug: "velvet-lounge",
    identity_status: "pending",
    submitted_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    owner_id: "demo-user-20",
    documents: ["id_front.jpg", "business_license.pdf"],
    notes: "Owner is requesting expedited review.",
  },
  {
    id: "demo-ver-02",
    business_id: "demo-biz-11",
    business_name: "Neon Sushi",
    business_slug: "neon-sushi",
    identity_status: "pending",
    submitted_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    owner_id: "demo-user-21",
    documents: ["id_front.jpg", "id_back.jpg"],
    notes: null,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "1d ago";
  return `${d}d ago`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuperAdminVerificationPage() {
  const [items, setItems] = useState<VerificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Review modal
  const [reviewItem, setReviewItem] = useState<VerificationItem | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"approve" | "reject" | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchQueue = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setItems(DEMO_VERIFICATIONS);
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(null);

    const { data, error } = await supabase
      .from("business_verifications")
      .select(
        "id, business_id, identity_status, submitted_at, owner_id, documents, notes, businesses(name, slug)"
      )
      .eq("identity_status", "pending")
      .order("submitted_at", { ascending: true });

    if (error) {
      setFetchError(error.message);
      setLoading(false);
      return;
    }

    type RawRow = {
      id: string;
      business_id: string;
      identity_status: string;
      submitted_at: string | null;
      owner_id: string | null;
      documents: string[] | null;
      notes: string | null;
      businesses: { name: string | null; slug: string | null } | { name: string | null; slug: string | null }[] | null;
    };

    const mapped: VerificationItem[] = ((data ?? []) as unknown as RawRow[]).map((row) => {
      const biz = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;
      return {
        id: row.id,
        business_id: row.business_id,
        business_name: biz?.name ?? null,
        business_slug: biz?.slug ?? null,
        identity_status: row.identity_status,
        submitted_at: row.submitted_at,
        owner_id: row.owner_id,
        documents: row.documents,
        notes: row.notes,
      };
    });

    setItems(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  // ── Review action ─────────────────────────────────────────────────────────

  async function handleReview() {
    if (!reviewItem || !reviewDecision) return;
    setSaving(true);
    setSaveError(null);

    const newStatus = reviewDecision === "approve" ? "approved" : "rejected";
    const bizStatus = reviewDecision === "approve" ? "verified" : "rejected";

    if (isSupabaseConfigured) {
      // Update verification record
      const { error: verErr } = await supabase
        .from("business_verifications")
        .update({ identity_status: newStatus })
        .eq("id", reviewItem.id);
      if (verErr) {
        setSaveError(verErr.message);
        setSaving(false);
        return;
      }

      // Update business status via the admin RPC (status is not client-writable;
      // the RPC gates the change on is_platform_admin()).
      const { error: bizErr } = await supabase.rpc("admin_set_business_status", {
        p_business_id: reviewItem.business_id,
        p_status: bizStatus,
      });
      if (bizErr) {
        setSaveError(bizErr.message);
        setSaving(false);
        return;
      }

      // TODO(server): notify business owner of approval/rejection via push + email.
    }

    setItems((prev) => prev.filter((v) => v.id !== reviewItem.id));
    setSuccessMsg(
      `"${reviewItem.business_name ?? reviewItem.business_id}" ${
        reviewDecision === "approve" ? "approved and verified" : "rejected"
      }.`
    );
    setSaving(false);
    setReviewItem(null);
    setReviewDecision(null);
    setReviewNote("");
  }

  function openReview(item: VerificationItem, decision: "approve" | "reject") {
    setReviewItem(item);
    setReviewDecision(decision);
    setReviewNote("");
    setSaveError(null);
  }

  function closeModal() {
    setReviewItem(null);
    setReviewDecision(null);
    setSaveError(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: "900px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
        <IconUserCheck size={22} stroke={1.6} style={{ color: "var(--color-brand)" }} />
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Verification Queue
        </h1>
      </div>

      {/* TODO(roles): gate to Super Admin / Compliance Admin */}

      {!isSupabaseConfigured && (
        <Banner type="warning" message="Demo mode — actions shown but not persisted." />
      )}
      {successMsg && (
        <Banner type="success" message={successMsg} onDismiss={() => setSuccessMsg(null)} />
      )}
      {fetchError && <Banner type="error" message={`Failed to load queue: ${fetchError}`} />}

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
          <IconLoader2 size={28} stroke={1.6} style={{ color: "var(--color-brand)", animation: "spin 1s linear infinite" }} />
        </div>
      )}

      {!loading && items.length === 0 && !fetchError && (
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
          <IconCheck size={32} stroke={1.4} style={{ color: "var(--color-success)" }} />
          <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
            Queue is clear
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-secondary)", maxWidth: "360px" }}>
            No pending business verifications.
          </div>
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
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
                background: "var(--color-warning)",
                color: "var(--bg-base)",
                fontSize: "12px",
                fontWeight: 700,
                padding: "0 6px",
              }}
            >
              {items.length}
            </span>
            <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              pending {items.length === 1 ? "verification" : "verifications"}
            </span>
          </div>

          <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "12px", overflow: "hidden" }}>
            {items.map((item, idx) => (
              <VerificationRow
                key={item.id}
                item={item}
                isLast={idx === items.length - 1}
                isExpanded={expandedId === item.id}
                onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                onApprove={() => openReview(item, "approve")}
                onReject={() => openReview(item, "reject")}
              />
            ))}
          </div>
        </>
      )}

      {reviewItem && reviewDecision && (
        <ReviewModal
          item={reviewItem}
          decision={reviewDecision}
          note={reviewNote}
          setNote={setReviewNote}
          saving={saving}
          error={saveError}
          onConfirm={() => void handleReview()}
          onClose={closeModal}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── VerificationRow ──────────────────────────────────────────────────────────

function VerificationRow({
  item,
  isLast,
  isExpanded,
  onToggle,
  onApprove,
  onReject,
}: {
  item: VerificationItem;
  isLast: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid var(--border-subtle)", background: "var(--bg-surface)" }}>
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
        <span
          style={{
            display: "inline-block",
            padding: "3px 9px",
            borderRadius: "20px",
            fontSize: "11px",
            fontWeight: 700,
            color: "var(--color-warning)",
            border: "1px solid var(--color-warning)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Pending
        </span>

        {/* Business info */}
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
            {item.business_name ?? item.business_id.slice(0, 12)}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px" }}>
            {item.business_slug ? `/${item.business_slug}` : ""}
          </div>
        </div>

        {/* Submitted time */}
        {item.submitted_at && (
          <div
            style={{
              flex: "0 0 auto",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "12px",
              color: "var(--text-tertiary)",
            }}
          >
            <IconClock size={12} stroke={1.6} />
            {timeAgo(item.submitted_at)}
          </div>
        )}

        {/* Docs count */}
        {item.documents && item.documents.length > 0 && (
          <div style={{ flex: "0 0 auto", fontSize: "12px", color: "var(--text-secondary)" }}>
            {item.documents.length} doc{item.documents.length !== 1 ? "s" : ""}
          </div>
        )}

        {/* Actions */}
        <div style={{ flex: "0 0 auto", display: "flex", gap: "6px", alignItems: "center" }}>
          <button
            onClick={onApprove}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "6px 12px",
              borderRadius: "6px",
              border: "none",
              background: "var(--color-success)",
              color: "var(--bg-surface-light)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <IconCheck size={13} stroke={2} />
            Approve
          </button>
          <button
            onClick={onReject}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "6px 12px",
              borderRadius: "6px",
              border: "none",
              background: "var(--color-danger)",
              color: "var(--bg-surface-light)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <IconBan size={13} stroke={2} />
            Reject
          </button>
          <button
            onClick={onToggle}
            aria-label={isExpanded ? "Collapse" : "Expand"}
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
            {isExpanded ? <IconChevronUp size={15} stroke={1.6} /> : <IconChevronDown size={15} stroke={1.6} />}
          </button>
        </div>
      </div>

      {/* Expanded */}
      {isExpanded && (
        <div
          style={{
            padding: "12px 16px 16px",
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--bg-elevated, var(--bg-surface))",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          {item.notes && (
            <DetailField label="Notes from owner" value={item.notes} />
          )}
          {item.documents && item.documents.length > 0 && (
            <DetailField
              label="Documents"
              value={item.documents.join(", ")}
            />
          )}
          {item.owner_id && (
            <DetailField label="Owner ID" value={item.owner_id} mono />
          )}
          <DetailField label="Business ID" value={item.business_id} mono />
        </div>
      )}
    </div>
  );
}

// ─── ReviewModal ──────────────────────────────────────────────────────────────

function ReviewModal({
  item,
  decision,
  note,
  setNote,
  saving,
  error,
  onConfirm,
  onClose,
}: {
  item: VerificationItem;
  decision: "approve" | "reject";
  note: string;
  setNote: (s: string) => void;
  saving: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  const isApprove = decision === "approve";
  const accent = isApprove ? "var(--color-success)" : "var(--color-danger)";

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40 }}
      />
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
          borderRadius: "14px",
          padding: "24px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          {isApprove ? (
            <IconCheck size={18} stroke={1.6} style={{ color: accent }} />
          ) : (
            <IconBan size={18} stroke={1.6} style={{ color: accent }} />
          )}
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", margin: 0, flex: 1 }}>
            {isApprove ? "Approve Verification" : "Reject Verification"}
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex" }}
          >
            <IconX size={16} stroke={1.6} />
          </button>
        </div>

        <div
          style={{
            fontSize: "13px",
            color: "var(--text-secondary)",
            marginBottom: "14px",
            padding: "10px 12px",
            background: "var(--bg-elevated, var(--bg-overlay))",
            borderRadius: "8px",
          }}
        >
          <strong style={{ color: "var(--text-primary)" }}>
            {item.business_name ?? item.business_id.slice(0, 12)}
          </strong>
          <br />
          <span style={{ fontSize: "12px" }}>
            businesses.status → <code>{isApprove ? "verified" : "rejected"}</code>
            <br />
            business_verifications.identity_status → <code>{isApprove ? "approved" : "rejected"}</code>
          </span>
          {/* TODO(server): notify business owner on approve/reject */}
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              fontSize: "12px",
              fontWeight: 700,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "6px",
            }}
          >
            {isApprove ? "Approval note (optional)" : "Rejection reason"}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isApprove ? "Looks good, all documents verified." : "Documents unclear or mismatched."}
            rows={3}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "var(--bg-base)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "6px",
              color: "var(--text-primary)",
              fontSize: "14px",
              outline: "none",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        </div>

        {error && <Banner type="error" message={error} />}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
              background: "transparent",
              color: "var(--text-secondary)",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: saving ? "var(--text-tertiary)" : accent,
              color: "var(--bg-surface-light)",
              fontSize: "13px",
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving && <IconLoader2 size={13} stroke={2} style={{ animation: "spin 1s linear infinite" }} />}
            {!saving && (isApprove ? <IconCheck size={13} stroke={2} /> : <IconBan size={13} stroke={2} />)}
            {saving ? "Processing…" : isApprove ? "Confirm Approve" : "Confirm Reject"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div
        style={{
          fontSize: "11px",
          fontWeight: 700,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "3px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "13px",
          color: "var(--text-secondary)",
          fontFamily: mono ? "var(--font-geist-mono, monospace)" : "inherit",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Banner({ type, message, onDismiss }: { type: "error" | "success" | "warning"; message: string; onDismiss?: () => void }) {
  const colors = { error: "var(--color-danger)", success: "var(--color-success)", warning: "var(--color-warning)" };
  const bgs = { error: "rgba(239,68,68,0.08)", success: "rgba(29,158,117,0.08)", warning: "rgba(245,158,11,0.08)" };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 14px",
        borderRadius: "8px",
        background: bgs[type],
        border: `1px solid ${colors[type]}`,
        color: colors[type],
        fontSize: "13px",
        marginBottom: "14px",
      }}
    >
      <IconAlertCircle size={15} stroke={1.6} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: colors[type], display: "flex" }}>
          <IconX size={14} stroke={2} />
        </button>
      )}
    </div>
  );
}
