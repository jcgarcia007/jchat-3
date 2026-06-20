/**
 * JChat 3.0 — Super Admin Alerts (Task 3.13)
 *
 * Security alerts (security_logs where resolved=false),
 * payment failures (subscriptions where status='past_due'),
 * reports queue (reports table).
 *
 * TODO(roles): gate to Super Admin / Security Admin.
 *
 * Tokens: var(--bg-*) / var(--text-*) / var(--color-*) / var(--border-*)
 * NO hardcoded hex. Icons: @tabler/icons-react only.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  IconBell,
  IconShieldExclamation,
  IconAlertTriangle,
  IconFlag,
  IconLoader2,
  IconAlertCircle,
  IconX,
  IconCheck,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SecurityLog {
  id: string;
  event_type: string;
  target_id: string | null;
  target_type: string | null;
  note: string | null;
  resolved: boolean;
  created_at: string;
}

interface FailedPayment {
  id: string;
  plan: string;
  status: string;
  business_id: string | null;
  current_period_end: string | null;
}

interface ReportItem {
  id: string;
  reporter_id: string | null;
  target_id: string | null;
  target_type: string | null;
  reason: string | null;
  status: string | null;
  created_at: string;
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_SECURITY_LOGS: SecurityLog[] = [
  {
    id: "log-01",
    event_type: "super_admin_silent_access",
    target_id: "biz-demo-01",
    target_type: "business",
    note: "Routine compliance check.",
    resolved: false,
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: "log-02",
    event_type: "login_anomaly",
    target_id: "user-demo-03",
    target_type: "user",
    note: "Login from new device in unusual location.",
    resolved: false,
    created_at: new Date(Date.now() - 6 * 3600000).toISOString(),
  },
  {
    id: "log-03",
    event_type: "rate_limit_breach",
    target_id: null,
    target_type: null,
    note: "IP 203.0.113.1 hit rate limit 50x in 60s.",
    resolved: false,
    created_at: new Date(Date.now() - 24 * 3600000).toISOString(),
  },
];

const DEMO_FAILED_PAYMENTS: FailedPayment[] = [
  {
    id: "fp-01",
    plan: "pro",
    status: "past_due",
    business_id: "biz-fail-01",
    current_period_end: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
];

const DEMO_REPORTS: ReportItem[] = [
  {
    id: "report-01",
    reporter_id: "user-10",
    target_id: "user-20",
    target_type: "user",
    reason: "Harassment in chat room",
    status: "pending",
    created_at: new Date(Date.now() - 4 * 3600000).toISOString(),
  },
  {
    id: "report-02",
    reporter_id: "user-11",
    target_id: "biz-05",
    target_type: "business",
    reason: "Spam messages / fake offers",
    status: "pending",
    created_at: new Date(Date.now() - 8 * 3600000).toISOString(),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuperAdminAlertsPage() {
  const [securityLogs, setSecurityLogs] = useState<SecurityLog[]>([]);
  const [failedPayments, setFailedPayments] = useState<FailedPayment[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setSecurityLogs(DEMO_SECURITY_LOGS);
      setFailedPayments(DEMO_FAILED_PAYMENTS);
      setReports(DEMO_REPORTS);
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(null);

    try {
      const [{ data: logs }, { data: subs }, { data: rpts }] = await Promise.all([
        supabase
          .from("security_logs")
          .select("id, event_type, target_id, target_type, note, resolved, created_at")
          .eq("resolved", false)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("subscriptions")
          .select("id, plan, status, business_id, current_period_end")
          .eq("status", "past_due")
          .limit(20),
        supabase
          .from("reports")
          .select("id, reporter_id, target_id, target_type, reason, status, created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

      setSecurityLogs((logs ?? []) as SecurityLog[]);
      setFailedPayments((subs ?? []) as FailedPayment[]);
      setReports((rpts ?? []) as ReportItem[]);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ── Resolve security log ──────────────────────────────────────────────────

  async function resolveLog(id: string) {
    if (isSupabaseConfigured) {
      await supabase.from("security_logs").update({ resolved: true }).eq("id", id);
    }
    setSecurityLogs((prev) => prev.filter((l) => l.id !== id));
    setSuccessMsg(`Alert ${id.slice(0, 8)}… marked as resolved.`);
  }

  // ── Dismiss report ────────────────────────────────────────────────────────

  async function dismissReport(id: string) {
    if (isSupabaseConfigured) {
      await supabase.from("reports").update({ status: "dismissed" }).eq("id", id);
    }
    setReports((prev) => prev.filter((r) => r.id !== id));
    setSuccessMsg(`Report ${id.slice(0, 8)}… dismissed.`);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const totalAlerts = securityLogs.length + failedPayments.length + reports.length;

  return (
    <div style={{ maxWidth: "900px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
        <IconBell size={22} stroke={1.6} style={{ color: "var(--color-brand)" }} />
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Alerts
        </h1>
        {totalAlerts > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "22px",
              height: "22px",
              borderRadius: "20px",
              background: "var(--color-danger)",
              color: "var(--bg-surface-light)",
              fontSize: "12px",
              fontWeight: 700,
              padding: "0 5px",
            }}
          >
            {totalAlerts}
          </span>
        )}
      </div>

      {/* TODO(roles): gate to Super Admin / Security Admin */}

      {!isSupabaseConfigured && (
        <Banner type="warning" message="Demo mode — showing sample alerts." />
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
        <>
          {totalAlerts === 0 && (
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
                No open alerts
              </div>
            </div>
          )}

          {/* Security Logs */}
          {securityLogs.length > 0 && (
            <Section
              title="Security Alerts"
              count={securityLogs.length}
              icon={IconShieldExclamation}
              iconColor="var(--color-danger)"
            >
              {securityLogs.map((log, idx) => (
                <div
                  key={log.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    padding: "14px 16px",
                    borderBottom: idx === securityLogs.length - 1 ? "none" : "1px solid var(--border-subtle)",
                    background: "var(--bg-surface)",
                    flexWrap: "wrap",
                    rowGap: "8px",
                  }}
                >
                  <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "3px" }}>
                      {log.event_type.replace(/_/g, " ")}
                    </div>
                    {log.note && (
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "3px" }}>
                        {log.note}
                      </div>
                    )}
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                      {timeAgo(log.created_at)}
                      {log.target_type && ` · ${log.target_type}: ${log.target_id?.slice(0, 10) ?? "—"}`}
                    </div>
                  </div>
                  <button
                    onClick={() => void resolveLog(log.id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "5px 10px",
                      borderRadius: "6px",
                      border: "1px solid var(--color-success)",
                      background: "transparent",
                      color: "var(--color-success)",
                      fontSize: "12px",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <IconCheck size={12} stroke={2} />
                    Resolve
                  </button>
                </div>
              ))}
            </Section>
          )}

          {/* Failed payments */}
          {failedPayments.length > 0 && (
            <Section
              title="Payment Failures"
              count={failedPayments.length}
              icon={IconAlertTriangle}
              iconColor="var(--color-warning)"
            >
              {failedPayments.map((fp, idx) => (
                <div
                  key={fp.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 16px",
                    borderBottom: idx === failedPayments.length - 1 ? "none" : "1px solid var(--border-subtle)",
                    background: "var(--bg-surface)",
                    flexWrap: "wrap",
                    rowGap: "6px",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: "20px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--color-danger)",
                      border: "1px solid var(--color-danger)",
                      textTransform: "uppercase",
                    }}
                  >
                    Past Due
                  </span>
                  <span style={{ flex: 1, fontSize: "13px", color: "var(--text-secondary)" }}>
                    Plan: <strong style={{ color: "var(--text-primary)", textTransform: "capitalize" }}>{fp.plan}</strong>
                  </span>
                  {fp.business_id && (
                    <span style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-geist-mono, monospace)" }}>
                      {fp.business_id.slice(0, 12)}…
                    </span>
                  )}
                  {fp.current_period_end && (
                    <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                      Due {timeAgo(fp.current_period_end)}
                    </span>
                  )}
                </div>
              ))}
            </Section>
          )}

          {/* Reports queue */}
          {reports.length > 0 && (
            <Section
              title="Reports Queue"
              count={reports.length}
              icon={IconFlag}
              iconColor="var(--color-brand-purple)"
            >
              {reports.map((r, idx) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    padding: "14px 16px",
                    borderBottom: idx === reports.length - 1 ? "none" : "1px solid var(--border-subtle)",
                    background: "var(--bg-surface)",
                    flexWrap: "wrap",
                    rowGap: "8px",
                  }}
                >
                  <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "3px" }}>
                      {r.reason ?? "No reason provided"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                      {timeAgo(r.created_at)}
                      {r.target_type && ` · ${r.target_type}: ${r.target_id?.slice(0, 10) ?? "—"}`}
                    </div>
                  </div>
                  <button
                    onClick={() => void dismissReport(r.id)}
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
                      flexShrink: 0,
                    }}
                  >
                    <IconX size={12} stroke={2} />
                    Dismiss
                  </button>
                </div>
              ))}
            </Section>
          )}
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({
  title,
  count,
  icon: Icon,
  iconColor,
  children,
}: {
  title: string;
  count: number;
  icon: React.ComponentType<{ size?: number; stroke?: number; style?: React.CSSProperties }>;
  iconColor: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <Icon size={15} stroke={1.6} style={{ color: iconColor }} />
        <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "20px",
            height: "20px",
            borderRadius: "20px",
            background: iconColor,
            color: "var(--bg-surface-light)",
            fontSize: "11px",
            fontWeight: 700,
            padding: "0 4px",
          }}
        >
          {count}
        </span>
      </div>
      <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "10px", overflow: "hidden" }}>
        {children}
      </div>
    </div>
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
