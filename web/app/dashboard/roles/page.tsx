/**
 * JChat 3.0 — Dashboard Custom Roles Page (Task 2.9 extension + migration 022)
 *
 * Lets business owners define named roles with 22 granular permission toggles.
 * Each role can start from one of 6 built-in templates, then be customised.
 * Billing / payouts is intentionally locked — owner-only, non-delegatable.
 *
 * Design: var(--db-*) tokens exclusively. "use client" for hooks + state.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  IconAlertCircle,
  IconEdit,
  IconLock,
  IconPlus,
  IconShieldLock,
  IconTrash,
} from "@tabler/icons-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

// ─── Permission system ─────────────────────────────────────────────────────────

type PermissionKey =
  | "orders_view"
  | "orders_process"
  | "orders_mark_delivered"
  | "orders_assigned_only"
  | "kds_view"
  | "kds_mark_ready"
  | "menu_edit"
  | "inventory_manage"
  | "offers_manage"
  | "availability_toggle"
  | "chat_moderate"
  | "chat_ban"
  | "chat_pin"
  | "rooms_passwords"
  | "rooms_manage"
  | "service_receive"
  | "alerts_view"
  | "reservations_manage"
  | "reports_view"
  | "analytics_view"
  | "exports_manage"
  | "loyalty_manage";

const ALL_PERMISSIONS: PermissionKey[] = [
  "orders_view", "orders_process", "orders_mark_delivered", "orders_assigned_only",
  "kds_view", "kds_mark_ready",
  "menu_edit", "inventory_manage", "offers_manage", "availability_toggle",
  "chat_moderate", "chat_ban", "chat_pin", "rooms_passwords", "rooms_manage",
  "service_receive", "alerts_view", "reservations_manage",
  "reports_view", "analytics_view", "exports_manage", "loyalty_manage",
];

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  orders_view:           "View orders",
  orders_process:        "Process orders",
  orders_mark_delivered: "Mark as delivered",
  orders_assigned_only:  "See only assigned orders",
  kds_view:              "View KDS",
  kds_mark_ready:        "Mark items ready on KDS",
  menu_edit:             "Edit menu items",
  inventory_manage:      "Manage inventory",
  offers_manage:         "Create / edit offers",
  availability_toggle:   "Toggle item availability",
  chat_moderate:         "Moderate chat",
  chat_ban:              "Ban users from chat",
  chat_pin:              "Pin messages",
  rooms_passwords:       "Manage room passwords",
  rooms_manage:          "Create / edit rooms",
  service_receive:       "Receive service alerts",
  alerts_view:           "View alerts",
  reservations_manage:   "Manage reservations",
  reports_view:          "View reports",
  analytics_view:        "View analytics",
  exports_manage:        "Export data",
  loyalty_manage:        "Manage loyalty",
};

interface PermGroup {
  label: string;
  keys: PermissionKey[];
}

const PERM_GROUPS: PermGroup[] = [
  { label: "Orders / POS",       keys: ["orders_view", "orders_process", "orders_mark_delivered", "orders_assigned_only", "kds_view", "kds_mark_ready"] },
  { label: "Menu / Inventory",   keys: ["menu_edit", "inventory_manage", "offers_manage", "availability_toggle"] },
  { label: "Chat / Moderation",  keys: ["chat_moderate", "chat_ban", "chat_pin", "rooms_passwords", "rooms_manage"] },
  { label: "Service / Alerts",   keys: ["service_receive", "alerts_view", "reservations_manage"] },
  { label: "Reports / Data",     keys: ["reports_view", "analytics_view", "exports_manage", "loyalty_manage"] },
];

// ─── Templates ────────────────────────────────────────────────────────────────

type TemplateName = "Manager" | "Cashier" | "Waiter" | "Kitchen" | "Chat Moderator" | "Analyst";

const TEMPLATE_NAMES: TemplateName[] = ["Manager", "Cashier", "Waiter", "Kitchen", "Chat Moderator", "Analyst"];

function fullPerms(partial: Partial<Record<PermissionKey, boolean>>): Record<PermissionKey, boolean> {
  return ALL_PERMISSIONS.reduce(
    (acc, k) => ({ ...acc, [k]: partial[k] ?? false }),
    {} as Record<PermissionKey, boolean>
  );
}

const BASE_TEMPLATES: Record<TemplateName, Record<PermissionKey, boolean>> = {
  Manager: fullPerms({
    orders_view: true, orders_process: true, orders_mark_delivered: true,
    kds_view: true, kds_mark_ready: true, menu_edit: true, inventory_manage: true,
    offers_manage: true, availability_toggle: true, chat_moderate: true, chat_ban: true,
    chat_pin: true, rooms_passwords: true, rooms_manage: true, service_receive: true,
    alerts_view: true, reservations_manage: true, reports_view: true, analytics_view: true,
  }),
  Cashier:         fullPerms({ orders_view: true, orders_process: true, reports_view: true }),
  Waiter:          fullPerms({ orders_mark_delivered: true, orders_assigned_only: true, service_receive: true }),
  Kitchen:         fullPerms({ kds_view: true, kds_mark_ready: true }),
  "Chat Moderator": fullPerms({ chat_moderate: true, chat_ban: true, chat_pin: true }),
  Analyst:         fullPerms({ analytics_view: true, reports_view: true }),
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomRole {
  id: string;
  business_id: string;
  name: string;
  permissions: Partial<Record<PermissionKey, boolean>>;
  base_template: string | null;
  created_at: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AlertBanner({
  type,
  message,
}: {
  type: "error" | "success" | "warning" | "info";
  message: string;
}) {
  const map: Record<string, { bg: string; color: string }> = {
    error:   { bg: "rgba(239,68,68,0.12)",    color: "var(--db-danger)" },
    success: { bg: "rgba(29,158,117,0.12)",   color: "var(--db-success)" },
    warning: { bg: "rgba(245,158,11,0.12)",   color: "var(--db-warning)" },
    info:    { bg: "rgba(92,124,250,0.10)",   color: "var(--db-accent)" },
  };
  const s = map[type] ?? map.info;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", borderRadius: "8px", background: s.bg, color: s.color, fontSize: "14px", marginBottom: "16px" }}>
      <IconAlertCircle size={16} />
      {message}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        width: 36, height: 20, borderRadius: 10, border: "none",
        background: on ? "var(--db-accent)" : "var(--db-border)",
        position: "relative", cursor: "pointer", padding: 0,
        transition: "background 0.15s", flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 2, left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: "50%",
        background: "white", transition: "left 0.15s",
        boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

function PermGroupSection({
  group,
  permissions,
  onChange,
}: {
  group: PermGroup;
  permissions: Record<PermissionKey, boolean>;
  onChange: (key: PermissionKey, value: boolean) => void;
}) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--db-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
        {group.label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {group.keys.map((key) => (
          <label key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", cursor: "pointer" }}>
            <span style={{ fontSize: "13px", color: "var(--db-text-primary)" }}>
              {PERMISSION_LABELS[key]}
            </span>
            <Toggle on={!!permissions[key]} onChange={(v) => onChange(key, v)} />
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Role editor ──────────────────────────────────────────────────────────────

function RoleEditor({
  role,
  businessId,
  onSave,
  onCancel,
}: {
  role: CustomRole | null;
  businessId: string;
  onSave: (saved: CustomRole) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean>>(
    role ? fullPerms(role.permissions) : fullPerms({})
  );
  const [template, setTemplate] = useState<TemplateName | null>(
    (role?.base_template as TemplateName | null) ?? null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyTemplate = (t: TemplateName) => {
    setTemplate(t);
    setPermissions(BASE_TEMPLATES[t]);
  };

  const togglePermission = (key: PermissionKey, value: boolean) => {
    setPermissions((prev) => ({ ...prev, [key]: value }));
  };

  const activeCount = Object.values(permissions).filter(Boolean).length;

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError("Role name is required."); return; }
    setSaving(true);
    setError(null);
    try {
      if (role) {
        // Update
        const { data, error: upErr } = await supabase
          .from("custom_roles")
          .update({ name: trimmed, permissions, base_template: template })
          .eq("id", role.id)
          .select()
          .single();
        if (upErr) throw upErr;
        onSave(data as CustomRole);
      } else {
        // Insert
        const { data, error: insErr } = await supabase
          .from("custom_roles")
          .insert({ business_id: businessId, name: trimmed, permissions, base_template: template })
          .select()
          .single();
        if (insErr) throw insErr;
        onSave(data as CustomRole);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "12px",
        padding: "24px",
        marginTop: "16px",
      }}
    >
      <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "20px" }}>
        {role ? "Edit role" : "Create role"}
      </h3>

      {error && <AlertBanner type="error" message={error} />}

      {/* Name */}
      <div style={{ marginBottom: "20px" }}>
        <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--db-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
          Role name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Senior Cashier"
          maxLength={60}
          style={{ width: "100%", maxWidth: "360px", boxSizing: "border-box", padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--db-border)", background: "var(--db-bg-elevated)", color: "var(--db-text-primary)", fontSize: "14px", outline: "none" }}
        />
      </div>

      {/* Template chips */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--db-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
          Start from template
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {TEMPLATE_NAMES.map((t) => {
            const active = template === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => applyTemplate(t)}
                style={{
                  padding: "6px 14px", borderRadius: "999px", border: "1px solid",
                  borderColor: active ? "var(--db-accent)" : "var(--db-border)",
                  background: active ? "var(--db-accent-bg)" : "transparent",
                  color: active ? "var(--db-accent)" : "var(--db-text-secondary)",
                  fontSize: "12px", fontWeight: 600, cursor: "pointer",
                  transition: "all 0.1s",
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginTop: "6px" }}>
          Templates pre-fill the toggles below. You can then fine-tune any permission.
        </p>
      </div>

      {/* Permission groups */}
      <div style={{ borderTop: "1px solid var(--db-border)", paddingTop: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--db-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Permissions
          </span>
          <span style={{ fontSize: "12px", color: activeCount > 0 ? "var(--db-accent)" : "var(--db-text-tertiary)" }}>
            {activeCount} / {ALL_PERMISSIONS.length} active
          </span>
        </div>

        {PERM_GROUPS.map((group) => (
          <PermGroupSection
            key={group.label}
            group={group}
            permissions={permissions}
            onChange={togglePermission}
          />
        ))}

        {/* Administration — locked section */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--db-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
            Administration
          </div>
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: "12px", padding: "10px 12px", borderRadius: "8px",
              background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)",
              opacity: 0.65,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <IconLock size={14} color="var(--db-text-tertiary)" />
              <span style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>
                Billing / payouts
              </span>
            </div>
            <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)", fontWeight: 600 }}>
              Owner only
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", paddingTop: "8px", borderTop: "1px solid var(--db-border)" }}>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: "9px 18px", borderRadius: "8px", border: "1px solid var(--db-border)", background: "transparent", color: "var(--db-text-secondary)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          style={{ padding: "9px 18px", borderRadius: "8px", border: "none", background: "var(--db-accent)", color: "var(--db-accent-text)", fontSize: "13px", fontWeight: 600, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Saving…" : role ? "Update role" : "Create role"}
        </button>
      </div>
    </div>
  );
}

// ─── Role list item ────────────────────────────────────────────────────────────

function RoleListItem({
  role,
  onEdit,
  onDelete,
}: {
  role: CustomRole;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const activeCount = ALL_PERMISSIONS.filter((k) => role.permissions[k]).length;

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px",
        background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)",
        borderRadius: "10px",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--db-text-primary)", marginBottom: "2px" }}>
          {role.name}
        </div>
        <div style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>
          {activeCount} permission{activeCount !== 1 ? "s" : ""} active
          {role.base_template && (
            <span style={{ marginLeft: "6px", opacity: 0.7 }}>· based on {role.base_template}</span>
          )}
        </div>
      </div>

      {/* Custom badge */}
      <div
        style={{
          padding: "3px 9px", borderRadius: "999px",
          background: "rgba(124,58,237,0.12)", color: "var(--color-brand-purple)",
          fontSize: "11px", fontWeight: 700, flexShrink: 0,
        }}
      >
        Custom
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
        <button
          type="button"
          onClick={onEdit}
          title="Edit role"
          style={{ background: "none", border: "none", color: "var(--db-accent)", cursor: "pointer", padding: "6px", borderRadius: "6px", display: "flex", alignItems: "center" }}
        >
          <IconEdit size={15} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Delete role"
          style={{ background: "none", border: "none", color: "var(--db-danger)", cursor: "pointer", padding: "6px", borderRadius: "6px", display: "flex", alignItems: "center" }}
        >
          <IconTrash size={15} />
        </button>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [loadingBiz, setLoadingBiz] = useState(true);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Resolve business ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoadingBiz(false); return; }
    void (async () => {
      try {
        const res = await resolveActiveBusiness();
        if (res.ok) setBusinessId(res.business.id);
      } catch {
        // keep null
      } finally {
        setLoadingBiz(false);
      }
    })();
  }, []);

  // ── Load roles ──────────────────────────────────────────────────────────────

  const loadRoles = useCallback(async (bizId: string) => {
    setLoadingRoles(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("custom_roles")
        .select("*")
        .eq("business_id", bizId)
        .order("created_at", { ascending: true });
      if (err) throw err;
      setRoles((data ?? []) as CustomRole[]);
    } catch (e: unknown) {
      setError(`Failed to load roles: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingRoles(false);
    }
  }, []);

  useEffect(() => {
    if (businessId) void loadRoles(businessId);
  }, [businessId, loadRoles]);

  // ── Delete role ─────────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (role: CustomRole) => {
      if (!confirm(`Delete the "${role.name}" role? Employees with this role will revert to their plain-text role label.`)) return;
      setError(null);
      setSuccessMsg(null);
      try {
        const { error: delErr } = await supabase
          .from("custom_roles")
          .delete()
          .eq("id", role.id);
        if (delErr) throw delErr;
        setRoles((prev) => prev.filter((r) => r.id !== role.id));
        setSuccessMsg(`Role "${role.name}" deleted.`);
        if (editingRole?.id === role.id) { setShowEditor(false); setEditingRole(null); }
      } catch (e: unknown) {
        setError(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [editingRole]
  );

  // ── Editor handlers ─────────────────────────────────────────────────────────

  const openCreate = () => { setEditingRole(null); setShowEditor(true); setError(null); setSuccessMsg(null); };
  const openEdit = (role: CustomRole) => { setEditingRole(role); setShowEditor(true); setError(null); setSuccessMsg(null); };
  const closeEditor = () => { setShowEditor(false); setEditingRole(null); };

  const handleSaved = (saved: CustomRole) => {
    setRoles((prev) => {
      const idx = prev.findIndex((r) => r.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    setSuccessMsg(editingRole ? `Role "${saved.name}" updated.` : `Role "${saved.name}" created.`);
    closeEditor();
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Header */}
      <div style={{ marginBottom: "24px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "4px" }}>
            Custom Roles
          </h1>
          <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
            Define roles with granular permissions, then assign them to employees.
          </p>
        </div>
        {businessId && !showEditor && (
          <button
            type="button"
            onClick={openCreate}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 16px", borderRadius: "9px", border: "none", background: "var(--db-accent)", color: "var(--db-accent-text)", fontSize: "13px", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
          >
            <IconPlus size={15} />
            New role
          </button>
        )}
      </div>

      {/* Alerts */}
      {error && <AlertBanner type="error" message={error} />}
      {successMsg && <AlertBanner type="success" message={successMsg} />}

      {/* Demo mode */}
      {!isSupabaseConfigured && (
        <AlertBanner type="warning" message="Demo mode: Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable live data." />
      )}

      {/* No business */}
      {!loadingBiz && isSupabaseConfigured && !businessId && (
        <NoBusinessCTA message="Register your business to manage custom roles." />
      )}

      {(businessId || !isSupabaseConfigured) && (
        <>
          {/* Role list */}
          <div
            style={{
              background: "var(--db-bg-surface)",
              border: "1px solid var(--db-border)",
              borderRadius: "12px",
              padding: "24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
              <IconShieldLock size={18} color="var(--db-accent)" />
              <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--db-text-primary)" }}>
                Roles
              </h2>
            </div>

            {/* Owner row — always shown, locked */}
            <div
              style={{
                display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px",
                background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)",
                borderRadius: "10px", marginBottom: "10px",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--db-text-primary)", marginBottom: "2px" }}>
                  Owner
                </div>
                <div style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>
                  Full access — all permissions including billing and payouts
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--db-text-tertiary)", fontSize: "12px" }}>
                <IconLock size={13} />
                Fixed
              </div>
            </div>

            {loadingRoles ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--db-text-tertiary)", fontSize: "14px" }}>
                Loading roles…
              </div>
            ) : roles.length === 0 && !showEditor ? (
              <div style={{ padding: "32px 20px", textAlign: "center" }}>
                <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", marginBottom: "14px" }}>
                  No custom roles yet. Create one to assign granular permissions to your staff.
                </p>
                <button
                  type="button"
                  onClick={openCreate}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 16px", borderRadius: "9px", border: "none", background: "var(--db-accent)", color: "var(--db-accent-text)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                >
                  <IconPlus size={14} />
                  Create first role
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {roles.map((role) => (
                  <RoleListItem
                    key={role.id}
                    role={role}
                    onEdit={() => openEdit(role)}
                    onDelete={() => void handleDelete(role)}
                  />
                ))}
                {!showEditor && (
                  <button
                    type="button"
                    onClick={openCreate}
                    style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", borderRadius: "10px", border: "1px dashed var(--db-border)", background: "transparent", color: "var(--db-text-secondary)", fontSize: "13px", cursor: "pointer", marginTop: "4px" }}
                  >
                    <IconPlus size={14} />
                    Add another role
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Editor */}
          {showEditor && businessId && (
            <RoleEditor
              key={editingRole?.id ?? "new"}
              role={editingRole}
              businessId={businessId}
              onSave={handleSaved}
              onCancel={closeEditor}
            />
          )}

          {/* Link to employees */}
          <p style={{ marginTop: "20px", fontSize: "13px", color: "var(--db-text-tertiary)" }}>
            Assign custom roles when adding or editing employees in the{" "}
            <Link href="/dashboard/employees" style={{ color: "var(--db-accent)", textDecoration: "none" }}>
              Employees page
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
