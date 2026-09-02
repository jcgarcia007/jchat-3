/**
 * JChat 3.0 — Dashboard Employees Page (Task 2.9)
 *
 * Lets business owners:
 *   - View the full staff roster (pending + accepted + declined).
 *   - See plan-limit usage (N / 10 for the default plan; Pro = unlimited).
 *   - Remove an employee (hard-delete; revokes access immediately).
 *
 * Data: queries the `employees` table via @/lib/supabase — no import from the
 * mobile service (as per spec constraints). Types are co-located.
 *
 * Design: var(--db-*) tokens exclusively. "use client" for hooks + state.
 *
 * Spec notes (Dev Plan Task 2.9):
 *   - Invite flow (addEmployee): mobile-only for now (AddEmployeeSheet).
 *     Dashboard shows roster + remove; push-notification stub noted.
 *   - Staff section on business profile is visible only to linked employees
 *     (status='accepted') — enforced at the mobile profile layer (Task 1.7).
 *   - Role determines chat actions available (Task 2.10).
 *   - Physical-presence check for Chat Moderator: Stage 4 (geofence).
 *     // TODO(Stage 4): geofence enforcement for Chat Moderator
 *   - Plan limit: max 10 active+pending; Pro = unlimited.
 *     // TODO: read real plan from billing; default cap is 10.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  IconAlertCircle,
  IconBriefcase,
  IconCheck,
  IconClock,
  IconDeviceFloppy,
  IconPencil,
  IconReceipt2,
  IconTrash,
  IconUserOff,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { resolveActiveBusiness } from "@/lib/business";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";
import type { TFn } from "@/lib/tabSemantics";

// ─── Co-located types ─────────────────────────────────────────────────────────

type EmployeeStatus = "pending" | "accepted" | "declined";
type EmployeeRole =
  | "Manager"
  | "Cashier"
  | "Waiter"
  | "Kitchen"
  | "Chat Moderator"
  | "Analyst";

interface EmployeeRow {
  id: string;
  business_id: string;
  user_id: string;
  role: EmployeeRole;
  custom_role_id?: string | null;
  status: EmployeeStatus;
  last_active_at: string | null;
  created_at: string;
  receipt_display_name: string | null;
}

interface EmployeeWithProfile extends EmployeeRow {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  // receipt_display_name inherited from EmployeeRow
}

interface CustomRole {
  id: string;
  name: string;
}

// ─── Plan limit constant ──────────────────────────────────────────────────────

/** Default cap for non-Pro plans. Pro = unlimited (null). */
const DEFAULT_PLAN_CAP = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusColor(status: EmployeeStatus): string {
  switch (status) {
    case "accepted":
      return "var(--db-success)";
    case "pending":
      return "var(--db-warning)";
    case "declined":
      return "var(--db-danger)";
  }
}

function statusLabel(status: EmployeeStatus, t: TFn): string {
  switch (status) {
    case "accepted":
      return t("employeesStatusActive");
    case "pending":
      return t("orderStatusPending");
    case "declined":
      return t("employeesStatusDeclined");
  }
}

/**
 * The 6 built-in role names are fixed system chrome — always safe to translate.
 * Any other string (an owner-typed custom role name) falls through untouched.
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

/**
 * employees.role is TEXT and holds EITHER one of the 6 fixed role names OR a
 * custom role's free-text name (when custom_role_id is set) — in that case the
 * text is the owner's own data and must never be translated.
 */
function roleLabel(emp: { role: string; custom_role_id?: string | null }, t: TFn): string {
  if (emp.custom_role_id) return emp.role;
  return fixedRoleLabel(emp.role, t);
}

function StatusIcon({ status }: { status: EmployeeStatus }) {
  const color = statusColor(status);
  const size = 13;
  switch (status) {
    case "accepted":
      return <IconCheck size={size} color={color} />;
    case "pending":
      return <IconClock size={size} color={color} />;
    case "declined":
      return <IconX size={size} color={color} />;
  }
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
    error: { bg: "rgba(239,68,68,0.12)", color: "var(--db-danger)" },
    success: { bg: "rgba(29,158,117,0.12)", color: "var(--db-success)" },
    warning: { bg: "rgba(245,158,11,0.12)", color: "var(--db-warning)" },
    info: { bg: "rgba(92,124,250,0.10)", color: "var(--db-accent)" },
  };
  const style = map[type] ?? map.info;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "12px 16px",
        borderRadius: "var(--db-radius)",
        background: style.bg,
        color: style.color,
        fontSize: "14px",
        marginBottom: "16px",
      }}
    >
      <IconAlertCircle size={16} />
      {message}
    </div>
  );
}

function PlanUsageBar({
  used,
  cap,
  t,
}: {
  used: number;
  cap: number;
  t: TFn;
}) {
  const pct = Math.min(100, Math.round((used / cap) * 100));
  const atLimit = used >= cap;
  return (
    <div style={{ marginBottom: "20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "6px",
        }}
      >
        <span style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>
          {t("employeesStaffUsageLabel")}
        </span>
        <span
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: atLimit ? "var(--db-danger)" : "var(--db-text-primary)",
          }}
        >
          {used} / {cap}
          {/* TODO: read real plan; Pro = unlimited */}
        </span>
      </div>
      <div
        style={{
          height: "6px",
          borderRadius: "999px",
          background: "var(--db-border)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: "999px",
            background: atLimit ? "var(--db-danger)" : "var(--db-accent)",
            transition: "width 0.3s ease",
          }}
        />
      </div>
      {atLimit && (
        <p
          style={{
            fontSize: "12px",
            color: "var(--db-danger)",
            marginTop: "6px",
          }}
        >
          {t("employeesLimitReachedMsg")}
          {/* TODO: link to billing/upgrade page */}
        </p>
      )}
    </div>
  );
}

function EmployeeRow({
  employee,
  isRemoving,
  onRemove,
  onUpdateReceiptName,
  t,
}: {
  employee: EmployeeWithProfile;
  isRemoving: boolean;
  onRemove: (emp: EmployeeWithProfile) => void;
  onUpdateReceiptName: (empId: string, name: string | null) => Promise<void>;
  t: TFn;
}) {
  const initials = (employee.display_name ?? employee.username)
    .slice(0, 2)
    .toUpperCase();

  const [editingName, setEditingName] = React.useState(false);
  const [editValue, setEditValue] = React.useState(employee.receipt_display_name ?? "");
  const [savingName, setSavingName] = React.useState(false);

  const handleSaveName = async () => {
    setSavingName(true);
    try {
      await onUpdateReceiptName(employee.id, editValue.trim() || null);
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  };

  const handleCancelEdit = () => {
    setEditValue(employee.receipt_display_name ?? "");
    setEditingName(false);
  };

  return (
    <div
      style={{
        background: "var(--db-bg-elevated)",
        border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius-card)",
        opacity: isRemoving ? 0.5 : 1,
        transition: "opacity 0.2s",
        overflow: "hidden",
      }}
    >
      {/* Main row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          padding: "14px 18px",
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "var(--db-accent-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          {employee.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={employee.avatar_url}
              alt={employee.username}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span
              style={{
                fontSize: "14px",
                fontWeight: 700,
                color: "var(--db-accent)",
              }}
            >
              {initials}
            </span>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--db-text-primary)",
              marginBottom: "2px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {employee.display_name ?? employee.username}
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--db-text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            @{employee.username}
          </div>
        </div>

        {/* Role badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
          <div
            style={{
              padding: "3px 10px",
              borderRadius: "999px",
              background: "var(--db-accent-bg)",
              color: "var(--db-accent)",
              fontSize: "12px",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {roleLabel(employee, t)}
          </div>
          {employee.custom_role_id && (
            <div
              style={{
                padding: "2px 6px",
                borderRadius: "999px",
                background: "rgba(124,58,237,0.12)",
                color: "var(--color-brand-purple)",
                fontSize: "10px",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {t("customRoleBadge")}
            </div>
          )}
        </div>

        {/* Status */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            color: statusColor(employee.status),
            fontSize: "12px",
            fontWeight: 600,
            whiteSpace: "nowrap",
            flexShrink: 0,
            minWidth: 64,
          }}
        >
          <StatusIcon status={employee.status} />
          {statusLabel(employee.status, t)}
        </div>

        {/* Last active */}
        <div
          style={{
            fontSize: "12px",
            color: "var(--db-text-tertiary)",
            whiteSpace: "nowrap",
            flexShrink: 0,
            minWidth: 90,
            textAlign: "right",
          }}
        >
          {employee.last_active_at
            ? formatDate(employee.last_active_at)
            : t("employeesNeverActive")}
        </div>

        {/* Remove */}
        <button
          onClick={() => onRemove(employee)}
          disabled={isRemoving}
          aria-label={t("employeesRemoveAria", { username: employee.username })}
          title={t("employeesRemoveTitle")}
          style={{
            background: "none",
            border: "none",
            color: isRemoving ? "var(--db-text-tertiary)" : "var(--db-danger)",
            cursor: isRemoving ? "not-allowed" : "pointer",
            padding: "6px",
            display: "flex",
            alignItems: "center",
            borderRadius: "var(--db-radius)",
            flexShrink: 0,
          }}
        >
          <IconTrash size={16} />
        </button>
      </div>

      {/* Receipt name row — always visible, inline-editable */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 18px 10px",
          borderTop: "1px solid var(--db-border)",
          background: "var(--db-bg-surface)",
        }}
      >
        <IconReceipt2 size={13} color="var(--db-text-tertiary)" style={{ flexShrink: 0 }} />
        {editingName ? (
          <>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSaveName();
                if (e.key === "Escape") handleCancelEdit();
              }}
              placeholder={t("employeesReceiptNamePlaceholder")}
              autoFocus
              style={{
                flex: 1,
                fontSize: "12px",
                padding: "3px 8px",
                borderRadius: "var(--db-radius)",
                border: "1px solid var(--db-accent)",
                background: "var(--db-bg-elevated)",
                color: "var(--db-text-primary)",
                outline: "none",
                minWidth: 0,
              }}
            />
            <button
              onClick={() => void handleSaveName()}
              disabled={savingName}
              title={t("employeesSaveReceiptName")}
              style={{
                background: "var(--db-accent)",
                border: "none",
                color: "var(--db-accent-text)",
                cursor: savingName ? "wait" : "pointer",
                padding: "3px 6px",
                display: "flex",
                alignItems: "center",
                borderRadius: "var(--db-radius)",
                flexShrink: 0,
                opacity: savingName ? 0.7 : 1,
              }}
            >
              <IconDeviceFloppy size={14} />
            </button>
            <button
              onClick={handleCancelEdit}
              disabled={savingName}
              title={t("cancel")}
              style={{
                background: "none",
                border: "none",
                color: "var(--db-text-secondary)",
                cursor: "pointer",
                padding: "3px 4px",
                display: "flex",
                alignItems: "center",
                borderRadius: "var(--db-radius)",
                flexShrink: 0,
              }}
            >
              <IconX size={14} />
            </button>
          </>
        ) : (
          <>
            <span
              style={{
                flex: 1,
                fontSize: "12px",
                color: employee.receipt_display_name
                  ? "var(--db-text-secondary)"
                  : "var(--db-text-tertiary)",
                fontStyle: employee.receipt_display_name ? "normal" : "italic",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {employee.receipt_display_name
                ? `${t("employeesReceiptNameLabel")}: ${employee.receipt_display_name}`
                : t("employeesReceiptNameEmpty")}
            </span>
            <button
              onClick={() => {
                setEditValue(employee.receipt_display_name ?? "");
                setEditingName(true);
              }}
              title={t("employeesEditReceiptName")}
              style={{
                background: "none",
                border: "none",
                color: "var(--db-text-tertiary)",
                cursor: "pointer",
                padding: "2px 4px",
                display: "flex",
                alignItems: "center",
                borderRadius: "var(--db-radius)",
                flexShrink: 0,
              }}
            >
              <IconPencil size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
  const t = useTranslations("dashboardCommon");
  const tCommon = useTranslations("common");
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [loadingBiz, setLoadingBiz] = useState(true);

  const [employees, setEmployees] = useState<EmployeeWithProfile[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add-employee form
  const [showAdd, setShowAdd] = useState(false);
  const [addUsername, setAddUsername] = useState("");
  const [addRole, setAddRole] = useState<string>("Cashier");
  const [addCustomRoleId, setAddCustomRoleId] = useState<string | null>(null);
  const [addReceiptName, setAddReceiptName] = useState("");
  const [adding, setAdding] = useState(false);

  // Custom roles for this business
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);

  // ── Resolve business id ────────────────────────────────────────────────────

  const resolveBusinessId = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoadingBiz(false);
      return;
    }
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoadingBiz(false);
        return;
      }
      const res = await resolveActiveBusiness();
      if (!res.ok) {
        setLoadingBiz(false);
        return;
      }
      setBusinessId(res.business.id);
    } catch {
      // business not found — keep null
    } finally {
      setLoadingBiz(false);
    }
  }, []);

  // ── Load custom roles ──────────────────────────────────────────────────────

  const loadCustomRoles = useCallback(async (bizId: string) => {
    try {
      const { data } = await supabase
        .from("custom_roles")
        .select("id, name")
        .eq("business_id", bizId)
        .order("created_at", { ascending: true });
      setCustomRoles((data ?? []) as CustomRole[]);
    } catch {
      // non-critical — custom roles are optional
    }
  }, []);

  // ── Load employees ─────────────────────────────────────────────────────────

  const loadEmployees = useCallback(async (bizId: string) => {
    setLoadingEmployees(true);
    setError(null);
    try {
      // 1 — fetch employee rows
      const { data: rows, error: rowsErr } = await supabase
        .from("employees")
        .select("*")
        .eq("business_id", bizId)
        .order("created_at", { ascending: false });

      if (rowsErr) throw rowsErr;
      if (!rows || rows.length === 0) {
        setEmployees([]);
        return;
      }

      const empRows = rows as EmployeeRow[];

      // 2 — fetch user profiles
      const userIds = [...new Set(empRows.map((e) => e.user_id))];
      const { data: usersData, error: usersErr } = await supabase
        .from("public_profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", userIds);

      if (usersErr) throw usersErr;

      type UserProfile = {
        id: string;
        username: string;
        display_name: string | null;
        avatar_url: string | null;
      };
      const userMap = new Map<string, UserProfile>(
        ((usersData ?? []) as UserProfile[]).map((u) => [u.id, u])
      );

      const enriched: EmployeeWithProfile[] = empRows.map((emp) => {
        const profile = userMap.get(emp.user_id) ?? {
          id: emp.user_id,
          username: t("employeesUnknownUser"),
          display_name: null,
          avatar_url: null,
        };
        return {
          ...emp,
          username: profile.username,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
        };
      });

      setEmployees(enriched);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(t("employeesLoadError", { msg }));
    } finally {
      setLoadingEmployees(false);
    }
  }, [t]);

  // ── Remove employee ────────────────────────────────────────────────────────

  const handleRemove = useCallback(
    async (emp: EmployeeWithProfile) => {
      const name = emp.display_name ?? emp.username;
      if (!confirm(t("employeesRemoveConfirm", { name, role: roleLabel(emp, t) })))
        return;

      setRemovingId(emp.id);
      setError(null);
      setSuccessMsg(null);

      try {
        const { error: delErr } = await supabase
          .from("employees")
          .delete()
          .eq("id", emp.id);

        if (delErr) throw delErr;

        setEmployees((prev) => prev.filter((e) => e.id !== emp.id));
        setSuccessMsg(t("employeesRemovedSuccess", { name }));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(t("employeesRemoveError", { msg }));
      } finally {
        setRemovingId(null);
      }
    },
    [t]
  );

  // ── Add employee (look up user by username → insert) ─────────────────────────

  const handleAdd = useCallback(async () => {
    if (!businessId) return;
    const uname = addUsername.trim().replace(/^@/, "");
    if (!uname) {
      setError(t("employeesUsernameRequired"));
      return;
    }
    setAdding(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const { data: u, error: uErr } = await supabase
        .from("public_profiles")
        .select("id, username")
        .ilike("username", uname)
        .maybeSingle();
      if (uErr) throw uErr;
      if (!u) {
        setError(t("employeesUserNotFound", { username: uname }));
        return;
      }
      const insertPayload: Database["public"]["Tables"]["employees"]["Insert"] = {
        business_id: businessId,
        user_id: (u as { id: string }).id,
        role: addRole,
        status: "accepted",
      };
      if (addCustomRoleId) insertPayload.custom_role_id = addCustomRoleId;
      if (addReceiptName.trim()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (insertPayload as any).receipt_display_name = addReceiptName.trim();
      }
      const { error: insErr } = await supabase.from("employees").insert(insertPayload);
      if (insErr) throw insErr;
      // addRole is either one of the 6 fixed names or a custom role's free-text
      // name (addCustomRoleId set) — same fallback rule as roleLabel().
      const roleText = addCustomRoleId ? addRole : fixedRoleLabel(addRole, t);
      setSuccessMsg(t("employeesAddedSuccess", { username: (u as { username: string }).username, role: roleText }));
      setAddUsername("");
      setAddCustomRoleId(null);
      setAddRole("Cashier");
      setAddReceiptName("");
      setShowAdd(false);
      await loadEmployees(businessId);
    } catch (e: unknown) {
      setError(t("employeesAddError", { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setAdding(false);
    }
  }, [businessId, addUsername, addRole, addCustomRoleId, loadEmployees, t]);

  // ── Update receipt_display_name inline ───────────────────────────────────────

  const handleUpdateReceiptName = useCallback(
    async (empId: string, name: string | null) => {
      setError(null);
      try {
        const { error: updErr } = await supabase
          .from("employees")
          .update({ receipt_display_name: name } as never)
          .eq("id", empId);
        if (updErr) throw updErr;
        setEmployees((prev) =>
          prev.map((e) => (e.id === empId ? { ...e, receipt_display_name: name } : e))
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(t("employeesUpdateError", { msg }));
      }
    },
    [t]
  );

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    void resolveBusinessId();
  }, [resolveBusinessId]);

  useEffect(() => {
    if (businessId) {
      void loadEmployees(businessId);
      void loadCustomRoles(businessId);
    }
  }, [businessId, loadEmployees, loadCustomRoles]);

  // ── Derived counts ─────────────────────────────────────────────────────────

  const activeCount = employees.filter(
    (e) => e.status === "accepted" || e.status === "pending"
  ).length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Page header */}
      <div style={{ marginBottom: "24px" }}>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "var(--db-text-primary)",
            marginBottom: "4px",
          }}
        >
          {t("railEmpleados")}
        </h1>
        <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
          {t("employeesSubtitle")}
          {/* Staff section on business profile is visible only to linked employees
              (status='accepted') — enforced in mobile profile layer (Task 1.7). */}
        </p>
      </div>

      {/* Alerts */}
      {error && <AlertBanner type="error" message={error} />}
      {successMsg && <AlertBanner type="success" message={successMsg} />}

      {/* Demo mode warning */}
      {!isSupabaseConfigured && (
        <AlertBanner
          type="warning"
          message={t("demoModeSupabaseMessage")}
        />
      )}

      {/* No business */}
      {!loadingBiz && isSupabaseConfigured && !businessId && (
        <NoBusinessCTA message={t("employeesNoBusinessMessage")} />
      )}

      {/* Content card */}
      {(businessId || !isSupabaseConfigured) && (
        <div
          style={{
            background: "var(--db-bg-surface)",
            border: "1px solid var(--db-border)",
            borderRadius: "var(--db-radius-card)",
            padding: "24px",
          }}
        >
          {/* Section header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              marginBottom: "6px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <IconUsers size={18} color="var(--db-accent)" />
              <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--db-text-primary)" }}>
                {t("employeesRosterTitle")}
              </h2>
            </div>
            {businessId && (
              <button
                type="button"
                onClick={() => setShowAdd((v) => !v)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  padding: "8px 14px", borderRadius: "var(--db-radius)", border: "none",
                  background: showAdd ? "var(--db-bg-elevated)" : "var(--db-accent)",
                  color: showAdd ? "var(--db-text-secondary)" : "var(--db-accent-text)",
                  fontSize: "13px", fontWeight: 600, cursor: "pointer",
                }}
              >
                {showAdd ? tCommon("cancel") : t("employeesAddButton")}
              </button>
            )}
          </div>

          {/* Add employee form */}
          {showAdd && businessId && (
            <div
              style={{
                display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap",
                background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)",
                borderRadius: "var(--db-radius-card)", padding: "14px", margin: "10px 0 16px",
              }}
            >
              <div style={{ flex: 1, minWidth: "180px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--db-text-secondary)", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {t("employeesUsernameLabel")}
                </label>
                <input
                  type="text"
                  value={addUsername}
                  onChange={(e) => setAddUsername(e.target.value)}
                  placeholder={t("employeesUsernamePlaceholder")}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: "var(--db-radius)", border: "1px solid var(--db-border)", background: "var(--db-bg-surface)", color: "var(--db-text-primary)", fontSize: "14px", outline: "none" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--db-text-secondary)", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {t("employeesRoleLabel")}
                </label>
                <select
                  value={addCustomRoleId ? `custom:${addCustomRoleId}` : addRole}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.startsWith("custom:")) {
                      const id = val.slice(7);
                      const cr = customRoles.find((r) => r.id === id);
                      if (cr) { setAddCustomRoleId(id); setAddRole(cr.name); }
                    } else {
                      setAddCustomRoleId(null);
                      setAddRole(val);
                    }
                  }}
                  style={{ padding: "8px 12px", borderRadius: "var(--db-radius)", border: "1px solid var(--db-border)", background: "var(--db-bg-surface)", color: "var(--db-text-primary)", fontSize: "14px", outline: "none", cursor: "pointer" }}
                >
                  <optgroup label={t("employeesStandardGroup")}>
                    {(["Manager", "Cashier", "Waiter", "Kitchen", "Chat Moderator", "Analyst"] as EmployeeRole[]).map((r) => (
                      <option key={r} value={r}>{fixedRoleLabel(r, t)}</option>
                    ))}
                  </optgroup>
                  {customRoles.length > 0 && (
                    <optgroup label={t("customRoleBadge")}>
                      {customRoles.map((cr) => (
                        <option key={cr.id} value={`custom:${cr.id}`}>{cr.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: "180px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--db-text-secondary)", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {t("employeesReceiptNameLabel")}
                  <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: "4px", color: "var(--db-text-tertiary)", fontSize: "10px" }}>
                    ({t("employeesReceiptNameOptional")})
                  </span>
                </label>
                <input
                  type="text"
                  value={addReceiptName}
                  onChange={(e) => setAddReceiptName(e.target.value)}
                  placeholder={t("employeesReceiptNamePlaceholder")}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: "var(--db-radius)", border: "1px solid var(--db-border)", background: "var(--db-bg-surface)", color: "var(--db-text-primary)", fontSize: "14px", outline: "none" }}
                />
              </div>
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={adding}
                style={{ padding: "9px 16px", borderRadius: "var(--db-radius)", border: "none", background: "var(--db-accent)", color: "var(--db-accent-text)", fontSize: "14px", fontWeight: 600, cursor: adding ? "wait" : "pointer", opacity: adding ? 0.7 : 1 }}
              >
                {adding ? t("employeesAddingState") : t("employeesAddSubmitButton")}
              </button>
            </div>
          )}
          <p
            style={{
              fontSize: "13px",
              color: "var(--db-text-secondary)",
              marginBottom: "20px",
            }}
          >
            {t("employeesPendingCountNote")}
            {/* Role determines which chat actions are available (Task 2.10). */}
            {/* TODO(Stage 4): physical-presence check for Chat Moderator via geofence */}
          </p>

          {/* Plan usage bar */}
          {!isSupabaseConfigured ? (
            <PlanUsageBar used={0} cap={DEFAULT_PLAN_CAP} t={t} />
          ) : (
            <PlanUsageBar used={activeCount} cap={DEFAULT_PLAN_CAP} t={t} />
          )}

          {/* Employee list */}
          {loadingEmployees ? (
            <div
              style={{
                padding: "32px",
                textAlign: "center",
                color: "var(--db-text-tertiary)",
                fontSize: "14px",
              }}
            >
              {t("employeesLoadingList")}
            </div>
          ) : employees.length === 0 ? (
            <EmptyState t={t} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {employees.map((emp) => (
                <EmployeeRow
                  key={emp.id}
                  employee={emp}
                  isRemoving={removingId === emp.id}
                  onRemove={handleRemove}
                  onUpdateReceiptName={handleUpdateReceiptName}
                  t={t}
                />
              ))}
            </div>
          )}

          {/* Roles legend */}
          <RolesLegend t={t} />
        </div>
      )}
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ t }: { t: TFn }) {
  return (
    <div
      style={{
        padding: "40px 20px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--db-accent-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 14px",
        }}
      >
        <IconUserOff size={26} color="var(--db-accent)" />
      </div>
      <p
        style={{
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--db-text-primary)",
          marginBottom: "6px",
        }}
      >
        {t("employeesEmptyTitle")}
      </p>
      <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", maxWidth: 340, margin: "0 auto" }}>
        {t("employeesEmptyBody")}
      </p>
    </div>
  );
}

// ─── Roles legend ──────────────────────────────────────────────────────────────

/** The 6 fixed system roles, with a description key per role — always chrome. */
const ROLE_DESCRIPTION_KEYS: { role: string; descKey: string }[] = [
  { role: "Manager", descKey: "employeesRoleDescManager" },
  { role: "Cashier", descKey: "employeesRoleDescCashier" },
  { role: "Waiter", descKey: "employeesRoleDescWaiter" },
  { role: "Kitchen", descKey: "employeesRoleDescKitchen" },
  { role: "Chat Moderator", descKey: "employeesRoleDescChatModerator" },
  { role: "Analyst", descKey: "employeesRoleDescAnalyst" },
];

function RolesLegend({ t }: { t: TFn }) {
  return (
    <div
      style={{
        marginTop: "28px",
        paddingTop: "20px",
        borderTop: "1px solid var(--db-border)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "12px",
        }}
      >
        <IconBriefcase size={15} color="var(--db-text-secondary)" />
        <span
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--db-text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {t("employeesRoleReferenceLabel")}
          {/* Role → chat permissions enforced in Task 2.10 (UserActionSheet) */}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: "8px",
        }}
      >
        {ROLE_DESCRIPTION_KEYS.map(({ role, descKey }) => (
          <div
            key={role}
            style={{
              background: "var(--db-bg-elevated)",
              borderRadius: "var(--db-radius)",
              padding: "10px 14px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "var(--db-accent)",
                marginBottom: "2px",
              }}
            >
              {fixedRoleLabel(role, t)}
            </div>
            <div style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>
              {t(descKey)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
