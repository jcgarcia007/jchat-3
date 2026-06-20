/**
 * JChat 3.0 — Super Admin Businesses (Task 3.13)
 *
 * Search businesses, view status, close/suspend (writes businesses.status),
 * "silent access" note that logs to security_logs.
 *
 * TODO(roles): gate to Super Admin.
 * TODO(server): silent access → log to security_logs via RPC or service-role key.
 *
 * Tokens: var(--bg-*) / var(--text-*) / var(--color-*) / var(--border-*)
 * NO hardcoded hex. Icons: @tabler/icons-react only.
 */

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  IconBuildingStore,
  IconSearch,
  IconLoader2,
  IconAlertCircle,
  IconX,
  IconLock,
  IconEye,
  IconCheck,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type BusinessStatus = "active" | "pending" | "suspended" | "closed" | "rejected" | "verified";

interface BusinessRow {
  id: string;
  name: string;
  slug: string | null;
  status: BusinessStatus;
  plan: string | null;
  owner_id: string | null;
  created_at: string;
  city: string | null;
}

type ActionType = "suspend" | "close" | "silent_access" | null;

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_BUSINESSES: BusinessRow[] = [
  {
    id: "demo-biz-01",
    name: "La Casa Cantina",
    slug: "la-casa-cantina",
    status: "active",
    plan: "pro",
    owner_id: "demo-user-02",
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    city: "Miami",
  },
  {
    id: "demo-biz-02",
    name: "Pixel Arcade",
    slug: "pixel-arcade",
    status: "suspended",
    plan: "starter",
    owner_id: "demo-user-05",
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    city: "Austin",
  },
  {
    id: "demo-biz-03",
    name: "Rooftop Vibes",
    slug: "rooftop-vibes",
    status: "pending",
    plan: null,
    owner_id: "demo-user-06",
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    city: "New York",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<BusinessStatus, string> = {
  active: "var(--color-success)",
  verified: "var(--color-success)",
  pending: "var(--color-warning)",
  suspended: "var(--color-danger)",
  closed: "var(--text-tertiary)",
  rejected: "var(--color-danger)",
};

function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "1d ago";
  return `${d}d ago`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuperAdminBusinessesPage() {
  const [query, setQuery] = useState("");
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const [actionBiz, setActionBiz] = useState<BusinessRow | null>(null);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // ── Search ────────────────────────────────────────────────────────────────

  const doSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setFetchError(null);
    setSuccessMsg(null);

    if (!isSupabaseConfigured) {
      const lower = q.toLowerCase();
      setBusinesses(
        DEMO_BUSINESSES.filter(
          (b) =>
            b.name.toLowerCase().includes(lower) ||
            b.slug?.toLowerCase().includes(lower) ||
            b.city?.toLowerCase().includes(lower)
        )
      );
      setSearched(true);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("businesses")
      .select("id, name, slug, status, plan, owner_id, created_at, city")
      .or(`name.ilike.%${q}%,slug.ilike.%${q}%,city.ilike.%${q}%`)
      .limit(30);

    if (error) {
      setFetchError(error.message);
      setLoading(false);
      return;
    }

    setBusinesses((data ?? []) as BusinessRow[]);
    setSearched(true);
    setLoading(false);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") void doSearch();
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleAction() {
    if (!actionBiz || !actionType) return;
    setSaving(true);
    setSaveError(null);

    if (actionType === "suspend" || actionType === "close") {
      const newStatus: BusinessStatus = actionType === "suspend" ? "suspended" : "closed";

      if (isSupabaseConfigured) {
        const { error } = await supabase
          .from("businesses")
          .update({ status: newStatus })
          .eq("id", actionBiz.id);
        if (error) {
          setSaveError(error.message);
          setSaving(false);
          return;
        }
        // TODO(server): notify business owner of suspension/closure.
      }

      setBusinesses((prev) =>
        prev.map((b) => (b.id === actionBiz.id ? { ...b, status: newStatus } : b))
      );
      setSuccessMsg(`Business "${actionBiz.name}" ${newStatus}.`);
    }

    if (actionType === "silent_access") {
      // Log to security_logs — requires service role key in production.
      // TODO(server): this must be done server-side with service-role key to avoid RLS bypass exposure.
      if (isSupabaseConfigured) {
        await supabase.from("security_logs").insert({
          event_type: "super_admin_silent_access",
          target_id: actionBiz.id,
          target_type: "business",
          note: note || "Silent access by Super Admin.",
          // actor_id: current admin user id — TODO(roles)
        });
      }
      setSuccessMsg(
        `Silent access logged for "${actionBiz.name}". (TODO: open business dashboard view)`
      );
    }

    setSaving(false);
    setActionBiz(null);
    setActionType(null);
    setNote("");
  }

  function openAction(biz: BusinessRow, type: ActionType) {
    setActionBiz(biz);
    setActionType(type);
    setNote("");
    setSaveError(null);
  }

  function closeModal() {
    setActionBiz(null);
    setActionType(null);
    setSaveError(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: "900px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
        <IconBuildingStore size={22} stroke={1.6} style={{ color: "var(--color-brand)" }} />
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Businesses
        </h1>
      </div>

      {/* TODO(roles): gate to Super Admin */}

      {!isSupabaseConfigured && (
        <Banner type="warning" message="Demo mode — actions shown but not persisted." />
      )}
      {successMsg && (
        <Banner type="success" message={successMsg} onDismiss={() => setSuccessMsg(null)} />
      )}

      {/* Search */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flex: 1,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "8px",
            padding: "0 12px",
          }}
        >
          <IconSearch size={15} stroke={1.6} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search by name, slug, or city…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              fontSize: "14px",
              color: "var(--text-primary)",
              padding: "10px 0",
            }}
          />
        </div>
        <button
          onClick={() => void doSearch()}
          disabled={loading || !query.trim()}
          style={{
            padding: "0 18px",
            borderRadius: "8px",
            border: "none",
            background: "var(--color-brand)",
            color: "var(--bg-surface-light)",
            fontSize: "14px",
            fontWeight: 600,
            cursor: loading || !query.trim() ? "not-allowed" : "pointer",
            opacity: !query.trim() ? 0.5 : 1,
          }}
        >
          {loading ? (
            <IconLoader2 size={16} stroke={2} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            "Search"
          )}
        </button>
      </div>

      {fetchError && <Banner type="error" message={fetchError} />}

      {searched && !loading && (
        <>
          {businesses.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "48px",
                color: "var(--text-secondary)",
                fontSize: "14px",
                border: "1px dashed var(--border-subtle)",
                borderRadius: "10px",
              }}
            >
              No businesses found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div
              style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: "12px",
                overflow: "hidden",
              }}
            >
              {businesses.map((b, idx) => (
                <BizRow
                  key={b.id}
                  biz={b}
                  isLast={idx === businesses.length - 1}
                  onSuspend={() => openAction(b, "suspend")}
                  onClose={() => openAction(b, "close")}
                  onSilentAccess={() => openAction(b, "silent_access")}
                />
              ))}
            </div>
          )}
        </>
      )}

      {actionBiz && actionType && (
        <BizActionModal
          biz={actionBiz}
          type={actionType}
          note={note}
          setNote={setNote}
          saving={saving}
          error={saveError}
          onConfirm={() => void handleAction()}
          onClose={closeModal}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── BizRow ───────────────────────────────────────────────────────────────────

function BizRow({
  biz: b,
  isLast,
  onSuspend,
  onClose,
  onSilentAccess,
}: {
  biz: BusinessRow;
  isLast: boolean;
  onSuspend: () => void;
  onClose: () => void;
  onSilentAccess: () => void;
}) {
  const statusColor = STATUS_COLORS[b.status] ?? "var(--text-tertiary)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "14px 16px",
        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
        background: "var(--bg-surface)",
        flexWrap: "wrap",
        rowGap: "8px",
      }}
    >
      {/* Name + slug */}
      <div style={{ flex: "2 1 200px", minWidth: 0 }}>
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
          {b.name}
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px" }}>
          {b.slug ? `/${b.slug}` : b.id.slice(0, 12)}
          {b.city ? ` · ${b.city}` : ""}
        </div>
      </div>

      {/* Status */}
      <div style={{ flex: "0 0 90px" }}>
        <span
          style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: "20px",
            fontSize: "11px",
            fontWeight: 700,
            border: `1px solid ${statusColor}`,
            color: statusColor,
            textTransform: "capitalize",
          }}
        >
          {b.status}
        </span>
      </div>

      {/* Plan */}
      <div style={{ flex: "0 0 80px", fontSize: "12px", color: "var(--text-secondary)" }}>
        {b.plan ?? "—"}
      </div>

      {/* Created */}
      <div style={{ flex: "0 0 70px", fontSize: "12px", color: "var(--text-tertiary)" }}>
        {timeAgo(b.created_at)}
      </div>

      {/* Actions */}
      <div style={{ flex: "0 0 auto", display: "flex", gap: "6px" }}>
        <button
          onClick={onSilentAccess}
          title="Silent access (logged)"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "5px 10px",
            borderRadius: "6px",
            border: "1px solid var(--border-subtle)",
            background: "transparent",
            color: "var(--text-secondary)",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          <IconEye size={12} stroke={2} />
          Access
        </button>
        {b.status !== "suspended" && b.status !== "closed" && (
          <button
            onClick={onSuspend}
            title="Suspend business"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "5px 10px",
              borderRadius: "6px",
              border: "1px solid var(--color-warning)",
              background: "transparent",
              color: "var(--color-warning)",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            <IconLock size={12} stroke={2} />
            Suspend
          </button>
        )}
        {b.status !== "closed" && (
          <button
            onClick={onClose}
            title="Close business"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "5px 10px",
              borderRadius: "6px",
              border: "1px solid var(--color-danger)",
              background: "transparent",
              color: "var(--color-danger)",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            <IconX size={12} stroke={2} />
            Close
          </button>
        )}
      </div>
    </div>
  );
}

// ─── BizActionModal ───────────────────────────────────────────────────────────

function BizActionModal({
  biz,
  type,
  note,
  setNote,
  saving,
  error,
  onConfirm,
  onClose,
}: {
  biz: BusinessRow;
  type: ActionType;
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

  const titles: Record<NonNullable<ActionType>, string> = {
    suspend: "Suspend Business",
    close: "Close Business",
    silent_access: "Silent Access (Logged)",
  };
  const accentColors: Record<NonNullable<ActionType>, string> = {
    suspend: "var(--color-warning)",
    close: "var(--color-danger)",
    silent_access: "var(--color-brand)",
  };
  const accent = accentColors[type!];

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
          <span style={{ fontSize: "16px", fontWeight: 700, color: accent }}>{titles[type!]}</span>
          <button
            onClick={onClose}
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex" }}
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
          Business: <strong style={{ color: "var(--text-primary)" }}>{biz.name}</strong>
        </div>

        {type === "silent_access" && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
              padding: "10px 12px",
              background: "rgba(92,124,250,0.08)",
              border: "1px solid var(--color-brand)",
              borderRadius: "8px",
              marginBottom: "14px",
              fontSize: "12px",
              color: "var(--text-secondary)",
            }}
          >
            <IconAlertTriangle size={14} stroke={1.6} style={{ color: "var(--color-brand)", flexShrink: 0, marginTop: "1px" }} />
            This access will be logged to security_logs. The business owner will NOT be notified.
            {/* TODO(server): log via service-role key, not anon key, to satisfy RLS */}
          </div>
        )}

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
            {type === "silent_access" ? "Access reason" : "Reason (internal)"}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason…"
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
            {!saving && <IconCheck size={13} stroke={2} />}
            {saving ? "Processing…" : "Confirm"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Banner ───────────────────────────────────────────────────────────────────

function Banner({
  type,
  message,
  onDismiss,
}: {
  type: "error" | "success" | "warning";
  message: string;
  onDismiss?: () => void;
}) {
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
