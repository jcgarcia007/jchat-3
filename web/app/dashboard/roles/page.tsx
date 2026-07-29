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
import { useTranslations } from "next-intl";
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
import type { TFn } from "@/lib/tabSemantics";

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

/** Permission KEYS (used in logic/DB) never change — only their visible label does. */
function getPermissionLabels(t: TFn): Record<PermissionKey, string> {
  return {
    orders_view:           t("permLabelOrdersView"),
    orders_process:        t("permLabelOrdersProcess"),
    orders_mark_delivered: t("permLabelOrdersMarkDelivered"),
    orders_assigned_only:  t("permLabelOrdersAssignedOnly"),
    kds_view:              t("permLabelKdsView"),
    kds_mark_ready:        t("permLabelKdsMarkReady"),
    menu_edit:             t("permLabelMenuEdit"),
    inventory_manage:      t("permLabelInventoryManage"),
    offers_manage:         t("permLabelOffersManage"),
    availability_toggle:   t("permLabelAvailabilityToggle"),
    chat_moderate:         t("permLabelChatModerate"),
    chat_ban:              t("permLabelChatBan"),
    chat_pin:              t("permLabelChatPin"),
    rooms_passwords:       t("permLabelRoomsPasswords"),
    rooms_manage:          t("permLabelRoomsManage"),
    service_receive:       t("permLabelServiceReceive"),
    alerts_view:           t("permLabelAlertsView"),
    reservations_manage:   t("permLabelReservationsManage"),
    reports_view:          t("permLabelReportsView"),
    analytics_view:        t("permLabelAnalyticsView"),
    exports_manage:        t("permLabelExportsManage"),
    loyalty_manage:        t("permLabelLoyaltyManage"),
  };
}

interface PermGroup {
  label: string;
  keys: PermissionKey[];
}

function getPermGroups(t: TFn): PermGroup[] {
  return [
    { label: t("permGroupOrdersPos"),      keys: ["orders_view", "orders_process", "orders_mark_delivered", "orders_assigned_only", "kds_view", "kds_mark_ready"] },
    { label: t("permGroupMenuInventory"),  keys: ["menu_edit", "inventory_manage", "offers_manage", "availability_toggle"] },
    { label: t("permGroupChatModeration"), keys: ["chat_moderate", "chat_ban", "chat_pin", "rooms_passwords", "rooms_manage"] },
    { label: t("permGroupServiceAlerts"),  keys: ["service_receive", "alerts_view", "reservations_manage"] },
    { label: t("permGroupReportsData"),    keys: ["reports_view", "analytics_view", "exports_manage", "loyalty_manage"] },
  ];
}

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

/**
 * Same 6-name fixed enum as employees/page.tsx's role — copied here (not
 * imported, to keep this chunk scoped to roles/page.tsx). Any other string
 * (a custom role's own name, or unexpected data) falls through untouched.
 */
function fixedRoleLabel(role: string, t: TFn): string {
  switch (role) {
    case "Manager": return t("roleManager");
    case "Cashier": return t("roleCashier");
    case "Waiter": return t("tabKindWaiter");
    case "Kitchen": return t("roleKitchen");
    case "Chat Moderator": return t("roleChatModerator");
    case "Analyst": return t("roleAnalyst");
    default: return role;
  }
}

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
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", borderRadius: "var(--db-radius)", background: s.bg, color: s.color, fontSize: "14px", marginBottom: "16px" }}>
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
        boxShadow: "var(--db-shadow)",
      }} />
    </button>
  );
}

function PermGroupSection({
  group,
  permissions,
  onChange,
  t,
}: {
  group: PermGroup;
  permissions: Record<PermissionKey, boolean>;
  onChange: (key: PermissionKey, value: boolean) => void;
  t: TFn;
}) {
  const labels = getPermissionLabels(t);
  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--db-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
        {group.label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {group.keys.map((key) => (
          <label key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", cursor: "pointer" }}>
            <span style={{ fontSize: "13px", color: "var(--db-text-primary)" }}>
              {labels[key]}
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
  t,
  tCommon,
}: {
  role: CustomRole | null;
  businessId: string;
  onSave: (saved: CustomRole) => void;
  onCancel: () => void;
  t: TFn;
  tCommon: TFn;
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

  const applyTemplate = (tpl: TemplateName) => {
    setTemplate(tpl);
    setPermissions(BASE_TEMPLATES[tpl]);
  };

  const togglePermission = (key: PermissionKey, value: boolean) => {
    setPermissions((prev) => ({ ...prev, [key]: value }));
  };

  const activeCount = Object.values(permissions).filter(Boolean).length;

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError(t("rolesNameRequired")); return; }
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
        borderRadius: "var(--db-radius-card)",
        padding: "24px",
        marginTop: "16px",
      }}
    >
      <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "20px" }}>
        {role ? t("rolesEditTitle") : t("rolesCreateTitle")}
      </h3>

      {error && <AlertBanner type="error" message={error} />}

      {/* Name */}
      <div style={{ marginBottom: "20px" }}>
        <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--db-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
          {t("rolesNameLabel")}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("rolesNamePlaceholder")}
          maxLength={60}
          style={{ width: "100%", maxWidth: "360px", boxSizing: "border-box", padding: "9px 12px", borderRadius: "var(--db-radius)", border: "1px solid var(--db-border)", background: "var(--db-bg-elevated)", color: "var(--db-text-primary)", fontSize: "14px", outline: "none" }}
        />
      </div>

      {/* Template chips */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--db-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
          {t("rolesTemplateLabel")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {TEMPLATE_NAMES.map((tpl) => {
            const active = template === tpl;
            return (
              <button
                key={tpl}
                type="button"
                onClick={() => applyTemplate(tpl)}
                style={{
                  padding: "6px 14px", borderRadius: "999px", border: "1px solid",
                  borderColor: active ? "var(--db-accent)" : "var(--db-border)",
                  background: active ? "var(--db-accent-bg)" : "transparent",
                  color: active ? "var(--db-accent)" : "var(--db-text-secondary)",
                  fontSize: "12px", fontWeight: 600, cursor: "pointer",
                  transition: "all 0.1s",
                }}
              >
                {fixedRoleLabel(tpl, t)}
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginTop: "6px" }}>
          {t("rolesTemplateHelper")}
        </p>
      </div>

      {/* Permission groups */}
      <div style={{ borderTop: "1px solid var(--db-border)", paddingTop: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--db-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {t("rolesPermissionsLabel")}
          </span>
          <span style={{ fontSize: "12px", color: activeCount > 0 ? "var(--db-accent)" : "var(--db-text-tertiary)" }}>
            {t("rolesActiveCount", { active: activeCount, total: ALL_PERMISSIONS.length })}
          </span>
        </div>

        {getPermGroups(t).map((group) => (
          <PermGroupSection
            key={group.label}
            group={group}
            permissions={permissions}
            onChange={togglePermission}
            t={t}
          />
        ))}

        {/* Administration — locked section */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--db-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
            {t("rolesAdministrationLabel")}
          </div>
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: "12px", padding: "10px 12px", borderRadius: "var(--db-radius)",
              background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)",
              opacity: 0.65,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <IconLock size={14} color="var(--db-text-tertiary)" />
              <span style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>
                {t("rolesBillingPayouts")}
              </span>
            </div>
            <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)", fontWeight: 600 }}>
              {t("rolesOwnerOnlyBadge")}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", paddingTop: "8px", borderTop: "1px solid var(--db-border)" }}>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: "9px 18px", borderRadius: "var(--db-radius)", border: "1px solid var(--db-border)", background: "transparent", color: "var(--db-text-secondary)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
        >
          {tCommon("cancel")}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          style={{ padding: "9px 18px", borderRadius: "var(--db-radius)", border: "none", background: "var(--db-accent)", color: "var(--db-accent-text)", fontSize: "13px", fontWeight: 600, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? t("tablesSavingState") : role ? t("rolesUpdateButton") : t("rolesCreateTitle")}
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
  t,
}: {
  role: CustomRole;
  onEdit: () => void;
  onDelete: () => void;
  t: TFn;
}) {
  const activeCount = ALL_PERMISSIONS.filter((k) => role.permissions[k]).length;

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px",
        background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius-card)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--db-text-primary)", marginBottom: "2px" }}>
          {role.name}
        </div>
        <div style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>
          {t("rolesPermissionCountPlural", { count: activeCount })}
          {role.base_template && (
            <span style={{ marginLeft: "6px", opacity: 0.7 }}>{t("rolesBasedOnTemplate", { template: fixedRoleLabel(role.base_template, t) })}</span>
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
        {t("customRoleBadge")}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
        <button
          type="button"
          onClick={onEdit}
          title={t("rolesEditTitle")}
          style={{ background: "none", border: "none", color: "var(--db-accent)", cursor: "pointer", padding: "6px", borderRadius: "var(--db-radius)", display: "flex", alignItems: "center" }}
        >
          <IconEdit size={15} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title={t("rolesDeleteTitle")}
          style={{ background: "none", border: "none", color: "var(--db-danger)", cursor: "pointer", padding: "6px", borderRadius: "var(--db-radius)", display: "flex", alignItems: "center" }}
        >
          <IconTrash size={15} />
        </button>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const t = useTranslations("dashboardCommon");
  const tCommon = useTranslations("common");
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
      setError(t("rolesLoadError", { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setLoadingRoles(false);
    }
  }, [t]);

  useEffect(() => {
    if (businessId) void loadRoles(businessId);
  }, [businessId, loadRoles]);

  // ── Delete role ─────────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (role: CustomRole) => {
      if (!confirm(t("rolesDeleteConfirm", { name: role.name }))) return;
      setError(null);
      setSuccessMsg(null);
      try {
        const { error: delErr } = await supabase
          .from("custom_roles")
          .delete()
          .eq("id", role.id);
        if (delErr) throw delErr;
        setRoles((prev) => prev.filter((r) => r.id !== role.id));
        setSuccessMsg(t("rolesDeletedSuccess", { name: role.name }));
        if (editingRole?.id === role.id) { setShowEditor(false); setEditingRole(null); }
      } catch (e: unknown) {
        setError(t("rolesDeleteError", { msg: e instanceof Error ? e.message : String(e) }));
      }
    },
    [editingRole, t]
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
    setSuccessMsg(editingRole ? t("rolesUpdatedSuccess", { name: saved.name }) : t("rolesCreatedSuccess", { name: saved.name }));
    closeEditor();
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Header */}
      <div style={{ marginBottom: "24px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "4px" }}>
            {t("rolesPageTitle")}
          </h1>
          <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
            {t("rolesPageSubtitle")}
          </p>
        </div>
        {businessId && !showEditor && (
          <button
            type="button"
            onClick={openCreate}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 16px", borderRadius: "var(--db-radius)", border: "none", background: "var(--db-accent)", color: "var(--db-accent-text)", fontSize: "13px", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
          >
            <IconPlus size={15} />
            {t("rolesNewRoleButton")}
          </button>
        )}
      </div>

      {/* Alerts */}
      {error && <AlertBanner type="error" message={error} />}
      {successMsg && <AlertBanner type="success" message={successMsg} />}

      {/* Demo mode */}
      {!isSupabaseConfigured && (
        <AlertBanner type="warning" message={t("demoModeSupabaseMessage")} />
      )}

      {/* No business */}
      {!loadingBiz && isSupabaseConfigured && !businessId && (
        <NoBusinessCTA message={t("rolesNoBusinessMessage")} />
      )}

      {(businessId || !isSupabaseConfigured) && (
        <>
          {/* Role list */}
          <div
            style={{
              background: "var(--db-bg-surface)",
              border: "1px solid var(--db-border)",
              borderRadius: "var(--db-radius-card)",
              padding: "24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
              <IconShieldLock size={18} color="var(--db-accent)" />
              <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--db-text-primary)" }}>
                {t("railRoles")}
              </h2>
            </div>

            {/* Owner row — always shown, locked. Not a custom_roles row (that array
                only ever holds owner-created entries) — this is fixed system chrome. */}
            <div
              style={{
                display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px",
                background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)",
                borderRadius: "var(--db-radius-card)", marginBottom: "10px",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--db-text-primary)", marginBottom: "2px" }}>
                  {t("roleOwner")}
                </div>
                <div style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>
                  {t("rolesOwnerDesc")}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--db-text-tertiary)", fontSize: "12px" }}>
                <IconLock size={13} />
                {t("rolesFixedBadge")}
              </div>
            </div>

            {loadingRoles ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--db-text-tertiary)", fontSize: "14px" }}>
                {t("rolesLoadingList")}
              </div>
            ) : roles.length === 0 && !showEditor ? (
              <div style={{ padding: "32px 20px", textAlign: "center" }}>
                <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", marginBottom: "14px" }}>
                  {t("rolesEmptyBody")}
                </p>
                <button
                  type="button"
                  onClick={openCreate}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 16px", borderRadius: "var(--db-radius)", border: "none", background: "var(--db-accent)", color: "var(--db-accent-text)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                >
                  <IconPlus size={14} />
                  {t("rolesCreateFirstButton")}
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
                    t={t}
                  />
                ))}
                {!showEditor && (
                  <button
                    type="button"
                    onClick={openCreate}
                    style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", borderRadius: "var(--db-radius)", border: "1px dashed var(--db-border)", background: "transparent", color: "var(--db-text-secondary)", fontSize: "13px", cursor: "pointer", marginTop: "4px" }}
                  >
                    <IconPlus size={14} />
                    {t("rolesAddAnotherButton")}
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
              t={t}
              tCommon={tCommon}
            />
          )}

          {/* Link to employees */}
          <p style={{ marginTop: "20px", fontSize: "13px", color: "var(--db-text-tertiary)" }}>
            {t.rich("rolesLinkText", {
              link: (chunks) => (
                <Link href="/dashboard/employees" style={{ color: "var(--db-accent)", textDecoration: "none" }}>
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </>
      )}
    </div>
  );
}
