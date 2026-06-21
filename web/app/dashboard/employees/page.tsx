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
import {
  IconAlertCircle,
  IconBriefcase,
  IconCheck,
  IconClock,
  IconTrash,
  IconUserOff,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

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
  status: EmployeeStatus;
  last_active_at: string | null;
  created_at: string;
}

interface EmployeeWithProfile extends EmployeeRow {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
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

function statusLabel(status: EmployeeStatus): string {
  switch (status) {
    case "accepted":
      return "Active";
    case "pending":
      return "Pending";
    case "declined":
      return "Declined";
  }
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
        borderRadius: "8px",
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
}: {
  used: number;
  cap: number;
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
          Staff usage
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
          You have reached the employee limit on your current plan. Upgrade to Pro
          for unlimited staff.
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
}: {
  employee: EmployeeWithProfile;
  isRemoving: boolean;
  onRemove: (emp: EmployeeWithProfile) => void;
}) {
  const initials = (employee.display_name ?? employee.username)
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "14px 18px",
        background: "var(--db-bg-elevated)",
        border: "1px solid var(--db-border)",
        borderRadius: "10px",
        opacity: isRemoving ? 0.5 : 1,
        transition: "opacity 0.2s",
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
      <div
        style={{
          padding: "3px 10px",
          borderRadius: "999px",
          background: "var(--db-accent-bg)",
          color: "var(--db-accent)",
          fontSize: "12px",
          fontWeight: 600,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {employee.role}
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
        {statusLabel(employee.status)}
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
          : "Never active"}
      </div>

      {/* Remove */}
      <button
        onClick={() => onRemove(employee)}
        disabled={isRemoving}
        aria-label={`Remove ${employee.username}`}
        title="Remove employee"
        style={{
          background: "none",
          border: "none",
          color: isRemoving ? "var(--db-text-tertiary)" : "var(--db-danger)",
          cursor: isRemoving ? "not-allowed" : "pointer",
          padding: "6px",
          display: "flex",
          alignItems: "center",
          borderRadius: "6px",
          flexShrink: 0,
        }}
      >
        <IconTrash size={16} />
      </button>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
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
  const [addRole, setAddRole] = useState<EmployeeRole>("Cashier");
  const [adding, setAdding] = useState(false);

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
        .from("users")
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
          username: "Unknown",
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
      setError(`Failed to load employees: ${msg}`);
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  // ── Remove employee ────────────────────────────────────────────────────────

  const handleRemove = useCallback(
    async (emp: EmployeeWithProfile) => {
      if (
        !confirm(
          `Remove ${emp.display_name ?? emp.username} (${emp.role}) from your staff? This cannot be undone.`
        )
      )
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
        setSuccessMsg(
          `${emp.display_name ?? emp.username} has been removed from the staff.`
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Remove failed: ${msg}`);
      } finally {
        setRemovingId(null);
      }
    },
    []
  );

  // ── Add employee (look up user by username → insert) ─────────────────────────

  const handleAdd = useCallback(async () => {
    if (!businessId) return;
    const uname = addUsername.trim().replace(/^@/, "");
    if (!uname) {
      setError("Enter the employee's username.");
      return;
    }
    setAdding(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const { data: u, error: uErr } = await supabase
        .from("users")
        .select("id, username")
        .ilike("username", uname)
        .maybeSingle();
      if (uErr) throw uErr;
      if (!u) {
        setError(`No user found with username @${uname}.`);
        return;
      }
      const { error: insErr } = await supabase.from("employees").insert({
        business_id: businessId,
        user_id: (u as { id: string }).id,
        role: addRole,
        status: "accepted",
      });
      if (insErr) throw insErr;
      setSuccessMsg(`Added @${(u as { username: string }).username} as ${addRole}.`);
      setAddUsername("");
      setShowAdd(false);
      await loadEmployees(businessId);
    } catch (e: unknown) {
      setError(`Add failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAdding(false);
    }
  }, [businessId, addUsername, addRole, loadEmployees]);

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    void resolveBusinessId();
  }, [resolveBusinessId]);

  useEffect(() => {
    if (businessId) void loadEmployees(businessId);
  }, [businessId, loadEmployees]);

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
          Employees
        </h1>
        <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
          Manage your staff roster, roles, and access. Invites are sent from
          within the business chat room on the mobile app.
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
          message="Demo mode: Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable live data."
        />
      )}

      {/* No business */}
      {!loadingBiz && isSupabaseConfigured && !businessId && (
        <NoBusinessCTA message="Register your business to manage employees." />
      )}

      {/* Content card */}
      {(businessId || !isSupabaseConfigured) && (
        <div
          style={{
            background: "var(--db-bg-surface)",
            border: "1px solid var(--db-border)",
            borderRadius: "12px",
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
                Staff Roster
              </h2>
            </div>
            {businessId && (
              <button
                type="button"
                onClick={() => setShowAdd((v) => !v)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  padding: "8px 14px", borderRadius: "9px", border: "none",
                  background: showAdd ? "var(--db-bg-elevated)" : "var(--db-accent)",
                  color: showAdd ? "var(--db-text-secondary)" : "var(--db-accent-text)",
                  fontSize: "13px", fontWeight: 600, cursor: "pointer",
                }}
              >
                {showAdd ? "Cancel" : "+ Add employee"}
              </button>
            )}
          </div>

          {/* Add employee form */}
          {showAdd && businessId && (
            <div
              style={{
                display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap",
                background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)",
                borderRadius: "10px", padding: "14px", margin: "10px 0 16px",
              }}
            >
              <div style={{ flex: 1, minWidth: "180px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--db-text-secondary)", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Username
                </label>
                <input
                  type="text"
                  value={addUsername}
                  onChange={(e) => setAddUsername(e.target.value)}
                  placeholder="@username"
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--db-border)", background: "var(--db-bg-surface)", color: "var(--db-text-primary)", fontSize: "14px", outline: "none" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--db-text-secondary)", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Role
                </label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as EmployeeRole)}
                  style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--db-border)", background: "var(--db-bg-surface)", color: "var(--db-text-primary)", fontSize: "14px", outline: "none", cursor: "pointer" }}
                >
                  {(["Manager", "Cashier", "Waiter", "Kitchen", "Chat Moderator", "Analyst"] as EmployeeRole[]).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={adding}
                style={{ padding: "9px 16px", borderRadius: "8px", border: "none", background: "var(--db-accent)", color: "var(--db-accent-text)", fontSize: "14px", fontWeight: 600, cursor: adding ? "wait" : "pointer", opacity: adding ? 0.7 : 1 }}
              >
                {adding ? "Adding…" : "Add"}
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
            Pending invites count toward your plan limit. Declined employees do
            not count.
            {/* Role determines which chat actions are available (Task 2.10). */}
            {/* TODO(Stage 4): physical-presence check for Chat Moderator via geofence */}
          </p>

          {/* Plan usage bar */}
          {!isSupabaseConfigured ? (
            <PlanUsageBar used={0} cap={DEFAULT_PLAN_CAP} />
          ) : (
            <PlanUsageBar used={activeCount} cap={DEFAULT_PLAN_CAP} />
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
              Loading employees…
            </div>
          ) : employees.length === 0 ? (
            <EmptyState />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {employees.map((emp) => (
                <EmployeeRow
                  key={emp.id}
                  employee={emp}
                  isRemoving={removingId === emp.id}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          )}

          {/* Roles legend */}
          <RolesLegend />
        </div>
      )}
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
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
        No employees yet
      </p>
      <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", maxWidth: 340, margin: "0 auto" }}>
        To add a team member, long-press their message or avatar in the business
        chat room on the JChat mobile app and select "Add as employee".
      </p>
    </div>
  );
}

// ─── Roles legend ──────────────────────────────────────────────────────────────

const ROLE_DESCRIPTIONS: { role: string; desc: string }[] = [
  { role: "Manager", desc: "Full access: settings, offers, reports, staff." },
  { role: "Cashier", desc: "Processes orders and payments." },
  { role: "Waiter", desc: "Takes orders and manages table service." },
  { role: "Kitchen", desc: "Views and updates KDS order queue." },
  { role: "Chat Moderator", desc: "Manages chat room content and users." },
  { role: "Analyst", desc: "Read-only access to analytics and reports." },
];

function RolesLegend() {
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
          Role Reference
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
        {ROLE_DESCRIPTIONS.map(({ role, desc }) => (
          <div
            key={role}
            style={{
              background: "var(--db-bg-elevated)",
              borderRadius: "8px",
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
              {role}
            </div>
            <div style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>
              {desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
