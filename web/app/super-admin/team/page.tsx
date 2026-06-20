/**
 * JChat 3.0 — Super Admin Team (Task 3.13)
 *
 * Admin team management: list admin_roles, add admin by email/@username,
 * assign role + permissions.
 *
 * TODO(roles): gate to Super Admin only.
 * TODO(server): invitation email on add.
 *
 * Tokens: var(--bg-*) / var(--text-*) / var(--color-*) / var(--border-*)
 * NO hardcoded hex. Icons: @tabler/icons-react only.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  IconUsersGroup,
  IconLoader2,
  IconAlertCircle,
  IconX,
  IconPlus,
  IconCheck,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type AdminRole =
  | "super_admin"
  | "ops_admin"
  | "compliance_admin"
  | "finance_admin"
  | "security_admin"
  | "communications_admin";

const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  ops_admin: "Operations Admin",
  compliance_admin: "Compliance Admin",
  finance_admin: "Finance Admin",
  security_admin: "Security Admin",
  communications_admin: "Communications Admin",
};

const ALL_ROLES = Object.keys(ROLE_LABELS) as AdminRole[];

interface AdminMember {
  id: string;
  user_id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  role: AdminRole;
  permissions: string[];
  granted_at: string;
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_TEAM: AdminMember[] = [
  {
    id: "admin-role-01",
    user_id: "user-super-01",
    email: "jcgarcia007@icloud.com",
    username: "jcgarcia",
    display_name: "JC Garcia",
    role: "super_admin",
    permissions: ["*"],
    granted_at: new Date(Date.now() - 90 * 86400000).toISOString(),
  },
  {
    id: "admin-role-02",
    user_id: "user-ops-01",
    email: "ops@jchat.app",
    username: "ops_lead",
    display_name: "Ops Lead",
    role: "ops_admin",
    permissions: ["users.read", "businesses.read", "disputes.read"],
    granted_at: new Date(Date.now() - 30 * 86400000).toISOString(),
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

export default function SuperAdminTeamPage() {
  const [team, setTeam] = useState<AdminMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add form state
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<AdminRole>("ops_admin");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Remove confirm
  const [removeTarget, setRemoveTarget] = useState<AdminMember | null>(null);
  const [removeSaving, setRemoveSaving] = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchTeam = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setTeam(DEMO_TEAM);
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(null);

    const { data, error } = await supabase
      .from("admin_roles")
      .select(
        "id, user_id, role, permissions, granted_at, users(email, username, display_name)"
      )
      .order("granted_at", { ascending: true });

    if (error) {
      setFetchError(error.message);
      setLoading(false);
      return;
    }

    type RawRow = {
      id: string;
      user_id: string;
      role: string;
      permissions: string[];
      granted_at: string;
      users: { email: string | null; username: string | null; display_name: string | null } | { email: string | null; username: string | null; display_name: string | null }[] | null;
    };

    const mapped: AdminMember[] = ((data ?? []) as unknown as RawRow[]).map((row) => {
      const u = Array.isArray(row.users) ? row.users[0] : row.users;
      return {
        id: row.id,
        user_id: row.user_id,
        email: u?.email ?? null,
        username: u?.username ?? null,
        display_name: u?.display_name ?? null,
        role: row.role as AdminRole,
        permissions: row.permissions ?? [],
        granted_at: row.granted_at,
      };
    });

    setTeam(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchTeam();
  }, [fetchTeam]);

  // ── Add admin ─────────────────────────────────────────────────────────────

  async function handleAdd() {
    if (!addEmail.trim()) return;
    setAddSaving(true);
    setAddError(null);

    if (isSupabaseConfigured) {
      // Look up user by email or username
      const searchVal = addEmail.startsWith("@") ? addEmail.slice(1) : addEmail;
      const field = addEmail.startsWith("@") ? "username" : "email";

      const { data: found, error: lookupErr } = await supabase
        .from("users")
        .select("id")
        .eq(field, searchVal)
        .single();

      if (lookupErr || !found) {
        setAddError("User not found. Check the email or @username.");
        setAddSaving(false);
        return;
      }

      const { error: insertErr } = await supabase.from("admin_roles").insert({
        user_id: found.id,
        role: addRole,
        permissions: [],
        // TODO(server): send invitation/notification email to the new admin.
      });

      if (insertErr) {
        setAddError(insertErr.message);
        setAddSaving(false);
        return;
      }
    } else {
      // Demo mode: add locally
      const newMember: AdminMember = {
        id: `demo-admin-${Date.now()}`,
        user_id: `demo-user-${Date.now()}`,
        email: addEmail.startsWith("@") ? null : addEmail,
        username: addEmail.startsWith("@") ? addEmail.slice(1) : null,
        display_name: null,
        role: addRole,
        permissions: [],
        granted_at: new Date().toISOString(),
      };
      setTeam((prev) => [...prev, newMember]);
    }

    setSuccessMsg(`Admin role granted to ${addEmail}.`);
    setShowAddModal(false);
    setAddEmail("");
    setAddSaving(false);

    if (isSupabaseConfigured) void fetchTeam();
  }

  // ── Remove admin ──────────────────────────────────────────────────────────

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoveSaving(true);

    if (isSupabaseConfigured) {
      await supabase.from("admin_roles").delete().eq("id", removeTarget.id);
    }

    setTeam((prev) => prev.filter((m) => m.id !== removeTarget.id));
    setSuccessMsg(`Admin access revoked for ${removeTarget.display_name ?? removeTarget.email ?? removeTarget.username ?? removeTarget.user_id.slice(0, 12)}.`);
    setRemoveTarget(null);
    setRemoveSaving(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: "900px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <IconUsersGroup size={22} stroke={1.6} style={{ color: "var(--color-brand)" }} />
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            Admin Team
          </h1>
        </div>
        <button
          onClick={() => { setShowAddModal(true); setAddError(null); setAddEmail(""); }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 14px",
            borderRadius: "8px",
            border: "none",
            background: "var(--color-brand)",
            color: "var(--bg-surface-light)",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <IconPlus size={14} stroke={2} />
          Add Admin
        </button>
      </div>

      {/* TODO(roles): gate to Super Admin only */}

      {!isSupabaseConfigured && (
        <Banner type="warning" message="Demo mode — actions shown but not persisted." />
      )}
      {successMsg && (
        <Banner type="success" message={successMsg} onDismiss={() => setSuccessMsg(null)} />
      )}
      {fetchError && <Banner type="error" message={fetchError} />}

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
          <IconLoader2 size={28} stroke={1.6} style={{ color: "var(--color-brand)", animation: "spin 1s linear infinite" }} />
        </div>
      )}

      {!loading && (
        <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "12px", overflow: "hidden" }}>
          {team.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px", color: "var(--text-secondary)", fontSize: "14px" }}>
              No admin team members yet.
            </div>
          ) : (
            team.map((member, idx) => (
              <TeamRow
                key={member.id}
                member={member}
                isLast={idx === team.length - 1}
                onRemove={() => setRemoveTarget(member)}
              />
            ))
          )}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <AddAdminModal
          email={addEmail}
          setEmail={setAddEmail}
          role={addRole}
          setRole={setAddRole}
          saving={addSaving}
          error={addError}
          onConfirm={() => void handleAdd()}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Remove confirm */}
      {removeTarget && (
        <ConfirmModal
          title="Revoke Admin Access"
          description={`Remove admin role from "${removeTarget.display_name ?? removeTarget.email ?? removeTarget.username ?? removeTarget.user_id.slice(0, 12)}"?`}
          confirmLabel="Revoke Access"
          confirmColor="var(--color-danger)"
          saving={removeSaving}
          onConfirm={() => void handleRemove()}
          onClose={() => setRemoveTarget(null)}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── TeamRow ──────────────────────────────────────────────────────────────────

function TeamRow({
  member: m,
  isLast,
  onRemove,
}: {
  member: AdminMember;
  isLast: boolean;
  onRemove: () => void;
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

      <div style={{ flex: "2 1 180px", minWidth: 0 }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {m.display_name ?? (m.username ? `@${m.username}` : m.email ?? m.user_id.slice(0, 12))}
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px" }}>
          {m.email ?? (m.username ? `@${m.username}` : "")}
        </div>
      </div>

      <div style={{ flex: "0 0 auto" }}>
        <span
          style={{
            display: "inline-block",
            padding: "3px 9px",
            borderRadius: "20px",
            fontSize: "11px",
            fontWeight: 700,
            border: "1px solid var(--color-brand)",
            color: "var(--color-brand)",
            textTransform: "capitalize",
            whiteSpace: "nowrap",
          }}
        >
          {ROLE_LABELS[m.role] ?? m.role}
        </span>
      </div>

      <div style={{ flex: "0 0 70px", fontSize: "12px", color: "var(--text-tertiary)" }}>
        {timeAgo(m.granted_at)}
      </div>

      {m.role !== "super_admin" && (
        <button
          onClick={onRemove}
          title="Revoke admin access"
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
          <IconTrash size={12} stroke={2} />
          Revoke
        </button>
      )}
    </div>
  );
}

// ─── AddAdminModal ────────────────────────────────────────────────────────────

function AddAdminModal({
  email,
  setEmail,
  role,
  setRole,
  saving,
  error,
  onConfirm,
  onClose,
}: {
  email: string;
  setEmail: (s: string) => void;
  role: AdminRole;
  setRole: (r: AdminRole) => void;
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

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40 }} />
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
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
          <IconPlus size={18} stroke={1.6} style={{ color: "var(--color-brand)" }} />
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", margin: 0, flex: 1 }}>
            Add Admin
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex" }}>
            <IconX size={16} stroke={1.6} />
          </button>
        </div>

        <div style={{ marginBottom: "14px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
            Email or @username
          </label>
          <input
            type="text"
            placeholder="user@example.com or @username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            style={{
              width: "100%",
              padding: "9px 12px",
              background: "var(--bg-base)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "6px",
              color: "var(--text-primary)",
              fontSize: "14px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AdminRole)}
            style={{
              width: "100%",
              padding: "9px 12px",
              background: "var(--bg-base)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "6px",
              color: "var(--text-primary)",
              fontSize: "14px",
              outline: "none",
              boxSizing: "border-box",
            }}
          >
            {ALL_ROLES.filter((r) => r !== "super_admin").map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          {/* TODO(server): send invitation email to new admin on confirm */}
        </div>

        {error && <Banner type="error" message={error} />}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", fontSize: "13px", cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={saving || !email.trim()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: saving || !email.trim() ? "var(--text-tertiary)" : "var(--color-brand)",
              color: "var(--bg-surface-light)",
              fontSize: "13px",
              fontWeight: 700,
              cursor: saving || !email.trim() ? "not-allowed" : "pointer",
            }}
          >
            {saving ? <IconLoader2 size={13} stroke={2} style={{ animation: "spin 1s linear infinite" }} /> : <IconCheck size={13} stroke={2} />}
            {saving ? "Adding…" : "Add Admin"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

function ConfirmModal({
  title,
  description,
  confirmLabel,
  confirmColor,
  saving,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmColor: string;
  saving: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40 }} />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 50,
          width: "min(400px, calc(100vw - 32px))",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "14px",
          padding: "24px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" }}>{title}</h2>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "0 0 20px" }}>{description}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", fontSize: "13px", cursor: "pointer" }}>
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
              background: saving ? "var(--text-tertiary)" : confirmColor,
              color: "var(--bg-surface-light)",
              fontSize: "13px",
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? <IconLoader2 size={13} stroke={2} style={{ animation: "spin 1s linear infinite" }} /> : null}
            {saving ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Banner ───────────────────────────────────────────────────────────────────

function Banner({ type, message, onDismiss }: { type: "error" | "success" | "warning"; message: string; onDismiss?: () => void }) {
  const colors = { error: "var(--color-danger)", success: "var(--color-success)", warning: "var(--color-warning)" };
  const bgs = { error: "rgba(239,68,68,0.08)", success: "rgba(29,158,117,0.08)", warning: "rgba(245,158,11,0.08)" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "8px", background: bgs[type], border: `1px solid ${colors[type]}`, color: colors[type], fontSize: "13px", marginBottom: "14px" }}>
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
