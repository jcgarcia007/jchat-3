/**
 * JChat 3.0 — Super Admin Users (Task 3.13)
 *
 * Search users by @username / email / display name.
 * View profile summary, assign trial, ban (flag only — real enforcement via
 * backend middleware / RLS policy update).
 *
 * TODO(roles): gate to Super Admin / Ops Admin.
 * TODO(server): trial assignment → write to subscriptions + notify user.
 * TODO(server): ban → write users.is_banned = true + revoke sessions.
 *
 * Tokens: var(--bg-*) / var(--text-*) / var(--color-*) / var(--border-*)
 * NO hardcoded hex. Icons: @tabler/icons-react only.
 */

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  IconUsers,
  IconSearch,
  IconLoader2,
  IconAlertCircle,
  IconX,
  IconCheck,
  IconBan,
  IconPlayerPlay,
  IconAlertTriangle,
  IconUser,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  username: string | null;
  display_name: string | null;
  role: string | null;
  is_banned: boolean | null;
  created_at: string;
  subscription_plan: string | null;
  subscription_status: string | null;
}

type ActionType = "trial" | "ban" | null;

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_USERS: UserRow[] = [
  {
    id: "demo-user-01",
    username: "marisolr",
    display_name: "Marisol Reyes",
    role: "user",
    is_banned: false,
    created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    subscription_plan: "starter",
    subscription_status: "active",
  },
  {
    id: "demo-user-02",
    username: "carlos_v",
    display_name: "Carlos Vega",
    role: "business_owner",
    is_banned: false,
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    subscription_plan: "pro",
    subscription_status: "active",
  },
  {
    id: "demo-user-03",
    username: "spammer99",
    display_name: null,
    role: "user",
    is_banned: true,
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    subscription_plan: null,
    subscription_status: null,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "1 day ago";
  return `${d} days ago`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuperAdminUsersPage() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Action modal
  const [actionUser, setActionUser] = useState<UserRow | null>(null);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [actionNote, setActionNote] = useState("");
  const [trialDays, setTrialDays] = useState(14);
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
      const lower = q.toLowerCase().replace(/^@/, "");
      const filtered = DEMO_USERS.filter(
        (u) =>
          u.username?.toLowerCase().includes(lower) ||
          u.display_name?.toLowerCase().includes(lower)
      );
      setUsers(filtered);
      setSearched(true);
      setLoading(false);
      return;
    }

    const searchTerm = q.startsWith("@") ? q.slice(1) : q;

    const { data, error } = await supabase
      .from("users")
      .select(
        "id, username, display_name, role, created_at"
      )
      .or(
        `username.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%`
      )
      .limit(30);

    if (error) {
      setFetchError(error.message);
      setLoading(false);
      return;
    }

    // TODO(server): subscription enrichment removed — subscriptions are per business_id,
    // not user_id. Implement via a businesses→subscriptions join once the flow is defined.
    const enriched: UserRow[] = (data ?? []).map((u) => ({
      ...u,
      subscription_plan: null,
      subscription_status: null,
    }));

    setUsers(enriched);
    setSearched(true);
    setLoading(false);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") void doSearch();
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleAction() {
    if (!actionUser || !actionType) return;
    setSaving(true);
    setSaveError(null);

    if (actionType === "ban") {
      // Ban not yet wired — is_banned column does not exist in public.users, requires migration.
      // Button is disabled in the UI; this branch is a safety net.
      setSaveError("Ban is not yet implemented. is_banned does not exist in public.users — requires migration.");
      setSaving(false);
      return;
    }

    if (actionType === "trial") {
      // Trial grants not yet wired — subscriptions are keyed by business_id, not user_id.
      // Button is disabled in the UI; this branch is a safety net.
      setSaveError("Trial grants are not yet implemented. Subscriptions are per business_id — needs an Edge Function.");
      setSaving(false);
      return;
    }

    setSaving(false);
    setActionUser(null);
    setActionType(null);
    setActionNote("");
  }

  function openAction(user: UserRow, type: ActionType) {
    setActionUser(user);
    setActionType(type);
    setActionNote("");
    setTrialDays(14);
    setSaveError(null);
  }

  function closeModal() {
    setActionUser(null);
    setActionType(null);
    setSaveError(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: "900px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
        <IconUsers size={22} stroke={1.6} style={{ color: "var(--color-brand)" }} />
        <h1
          style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}
        >
          Users
        </h1>
      </div>

      {/* TODO(roles): gate to Super Admin / Ops Admin */}

      {/* Demo banner */}
      {!isSupabaseConfigured && (
        <Banner type="warning" message="Demo mode — actions shown but not persisted." />
      )}

      {/* Success */}
      {successMsg && (
        <Banner type="success" message={successMsg} onDismiss={() => setSuccessMsg(null)} />
      )}

      {/* Search bar */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "24px",
        }}
      >
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
            placeholder="Search by @username or name…"
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

      {/* Error */}
      {fetchError && <Banner type="error" message={fetchError} />}

      {/* Results */}
      {searched && !loading && (
        <>
          {users.length === 0 ? (
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
              No users found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div
              style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: "12px",
                overflow: "hidden",
              }}
            >
              {users.map((u, idx) => (
                <UserRow
                  key={u.id}
                  user={u}
                  isLast={idx === users.length - 1}
                  onBan={() => openAction(u, "ban")}
                  onTrial={() => openAction(u, "trial")}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Action modal */}
      {actionUser && actionType && (
        <ActionModal
          user={actionUser}
          type={actionType}
          trialDays={trialDays}
          setTrialDays={setTrialDays}
          note={actionNote}
          setNote={setActionNote}
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

// ─── UserRow ──────────────────────────────────────────────────────────────────

function UserRow({
  user: u,
  isLast,
  onBan,
  onTrial,
}: {
  user: UserRow;
  isLast: boolean;
  onBan: () => void;
  onTrial: () => void;
}) {
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
      {/* Avatar placeholder */}
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          background: "var(--bg-elevated, var(--bg-overlay))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <IconUser size={16} stroke={1.6} style={{ color: "var(--text-tertiary)" }} />
      </div>

      {/* Identity */}
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
          {u.display_name ?? u.username ?? "—"}
          {u.is_banned && (
            <span
              style={{
                marginLeft: "8px",
                fontSize: "10px",
                fontWeight: 700,
                color: "var(--color-danger)",
                border: "1px solid var(--color-danger)",
                borderRadius: "4px",
                padding: "1px 5px",
                textTransform: "uppercase",
              }}
            >
              Banned
            </span>
          )}
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px" }}>
          {u.username ? `@${u.username}` : ""}
        </div>
      </div>

      {/* Plan */}
      <div style={{ flex: "0 0 90px", fontSize: "12px", color: "var(--text-secondary)" }}>
        {u.subscription_plan ? (
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: "20px",
              fontSize: "11px",
              fontWeight: 700,
              border: "1px solid var(--border-subtle)",
              textTransform: "capitalize",
            }}
          >
            {u.subscription_plan}
          </span>
        ) : (
          <span style={{ color: "var(--text-tertiary)" }}>—</span>
        )}
      </div>

      {/* Role */}
      <div style={{ flex: "0 0 100px", fontSize: "12px", color: "var(--text-secondary)" }}>
        {u.role ?? "user"}
      </div>

      {/* Joined */}
      <div style={{ flex: "0 0 80px", fontSize: "12px", color: "var(--text-tertiary)" }}>
        {timeAgo(u.created_at)}
      </div>

      {/* Actions */}
      <div style={{ flex: "0 0 auto", display: "flex", gap: "6px" }}>
        {!u.is_banned && (
          <>
            <button
              disabled
              title="Coming soon — trial grants not yet wired (subscriptions are per business)"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "5px 10px",
                borderRadius: "6px",
                border: "1px solid var(--border-subtle)",
                background: "transparent",
                color: "var(--color-success)",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "not-allowed",
                opacity: 0.4,
              }}
            >
              <IconPlayerPlay size={12} stroke={2} />
              Trial
            </button>
            <button
              disabled
              title="Coming soon — is_banned column no existe en users, requiere migración"
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
                fontWeight: 600,
                cursor: "not-allowed",
                opacity: 0.4,
              }}
            >
              <IconBan size={12} stroke={2} />
              Ban
            </button>
          </>
        )}
        {u.is_banned && (
          <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Banned</span>
        )}
      </div>
    </div>
  );
}

// ─── ActionModal ──────────────────────────────────────────────────────────────

function ActionModal({
  user,
  type,
  trialDays,
  setTrialDays,
  note,
  setNote,
  saving,
  error,
  onConfirm,
  onClose,
}: {
  user: UserRow;
  type: ActionType;
  trialDays: number;
  setTrialDays: (n: number) => void;
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

  const isBan = type === "ban";
  const accentColor = isBan ? "var(--color-danger)" : "var(--color-success)";

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
          {isBan ? (
            <IconBan size={18} stroke={1.6} style={{ color: accentColor }} />
          ) : (
            <IconPlayerPlay size={18} stroke={1.6} style={{ color: accentColor }} />
          )}
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", margin: 0, flex: 1 }}>
            {isBan ? "Ban User" : "Grant Trial"}
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
            marginBottom: "16px",
            padding: "12px 14px",
            background: "var(--bg-elevated, var(--bg-overlay))",
            borderRadius: "8px",
          }}
        >
          User: <strong style={{ color: "var(--text-primary)" }}>
            {user.display_name ?? user.username ?? user.id.slice(0, 12)}
          </strong>
        </div>

        {!isBan && (
          <div style={{ marginBottom: "14px" }}>
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
              Trial duration (days)
            </label>
            <input
              type="number"
              min={1}
              max={90}
              value={trialDays}
              onChange={(e) => setTrialDays(Number(e.target.value))}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "var(--bg-base)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "6px",
                color: "var(--text-primary)",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
              TODO(server): actual Stripe trial via Edge Function. Currently writes
              subscriptions.status = &apos;trialing&apos;.
            </p>
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
            Internal note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isBan ? "Reason for ban…" : "Reason for granting trial…"}
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
              background: saving ? "var(--text-tertiary)" : accentColor,
              color: "var(--bg-surface-light)",
              fontSize: "13px",
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving && (
              <IconLoader2 size={13} stroke={2} style={{ animation: "spin 1s linear infinite" }} />
            )}
            {!saving && (isBan ? <IconBan size={13} stroke={2} /> : <IconCheck size={13} stroke={2} />)}
            {saving ? "Processing…" : isBan ? "Confirm Ban" : `Grant ${trialDays}-day Trial`}
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
  const colors = {
    error: "var(--color-danger)",
    success: "var(--color-success)",
    warning: "var(--color-warning)",
  };
  const bgs = {
    error: "rgba(239,68,68,0.08)",
    success: "rgba(29,158,117,0.08)",
    warning: "rgba(245,158,11,0.08)",
  };
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
        <button
          onClick={onDismiss}
          style={{ background: "none", border: "none", cursor: "pointer", color: colors[type], display: "flex" }}
        >
          <IconX size={14} stroke={2} />
        </button>
      )}
    </div>
  );
}
