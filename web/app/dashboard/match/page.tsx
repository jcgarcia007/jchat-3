/**
 * JChat 3.0 — Dashboard · Match (owner only)
 *
 * - Match reports for the owner's venue: reports.content_type = 'match' AND business_id = venue
 *   (RLS reports_read_owner, migration 192). Shows reason, date, status and the reported person's
 *   visible name (public_profiles — never email).
 * - "Remove from Match" → rpc match_kick(p_business_id, p_user_id = reports.reported_user_id, p_reason), with confirmation.
 * - Pending reports can be marked resolved / dismissed → rpc match_resolve_report(p_report_id, 'resolved' | 'dismissed').
 *   Filter Pending (default) / All. match_kick already resolves that person's pending reports, so kick reloads the list.
 * - List of removed people (match_kicks) with "Undo removal" → rpc match_unkick.
 *
 * Owner gate: if the signed-in user is not businesses.owner_id of the active business → /dashboard.
 * Reports/kicks/RPCs are not in the generated types yet → untypedDb (lib/untypedDb.ts).
 * Tokens: var(--db-*) / var(--color-*). No hex. Icons: @tabler/icons-react.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconHeart, IconLoader2, IconAlertCircle, IconBan, IconCheck, IconX } from "@tabler/icons-react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness, isBusinessOwner } from "@/lib/business";
import { untypedDb } from "@/lib/untypedDb";

interface MatchReport {
  id: string;
  reported_user_id: string | null;
  reason: string | null;
  status: string | null;
  created_at: string;
}

interface KickRow {
  user_id: string;
  reason: string | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  username: string | null;
}

interface ConfirmTarget {
  userId: string;
  name: string;
}

const REPORT_STATUSES = ["pending", "reviewing", "dismissed", "resolved"];
/** Statuses that still need the owner's attention (migration 194 resolves both on kick). */
const OPEN_STATUSES = ["pending", "reviewing"];

export default function DashboardMatchPage() {
  const t = useTranslations("dashboardCommon");
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [reports, setReports] = useState<MatchReport[]>([]);
  const [kicks, setKicks] = useState<KickRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null);
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const displayName = useCallback(
    (userId: string | null): string => {
      if (!userId) return t("matchUnknownUser");
      return names[userId] ?? t("matchUnknownUser");
    },
    [names, t],
  );

  const loadData = useCallback(
    async (bizId: string) => {
      setError(null);
      const [{ data: reportRows, error: reportErr }, { data: kickRows, error: kickErr }] = await Promise.all([
        untypedDb
          .from("reports")
          .select("id, reported_user_id, reason, status, created_at")
          .eq("content_type", "match")
          .eq("business_id", bizId)
          .order("created_at", { ascending: false })
          .limit(100),
        untypedDb
          .from("match_kicks")
          .select("user_id, reason, created_at")
          .eq("business_id", bizId)
          .order("created_at", { ascending: false }),
      ]);
      if (reportErr || kickErr) {
        setError(t("matchLoadError"));
        return;
      }
      const reportList = (reportRows ?? []) as MatchReport[];
      const kickList = (kickRows ?? []) as KickRow[];
      setReports(reportList);
      setKicks(kickList);

      // Visible names only (public_profiles has no email). Best effort: unknown user on failure.
      const ids = [
        ...new Set([
          ...reportList.map((r) => r.reported_user_id),
          ...kickList.map((k) => k.user_id),
        ].filter((id): id is string => !!id)),
      ];
      if (ids.length > 0) {
        const { data: profiles } = await untypedDb
          .from("public_profiles")
          .select("id, display_name, username")
          .in("id", ids);
        const map: Record<string, string> = {};
        for (const p of (profiles ?? []) as ProfileRow[]) {
          const name = p.display_name?.trim() || (p.username ? `@${p.username}` : "");
          if (name) map[p.id] = name;
        }
        setNames(map);
      }
    },
    [t],
  );

  // Owner gate + initial load.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!isSupabaseConfigured) {
          router.replace("/dashboard");
          return;
        }
        const res = await resolveActiveBusiness();
        if (!active) return;
        if (!res.ok || !(await isBusinessOwner(res.business.id))) {
          router.replace("/dashboard");
          return;
        }
        if (!active) return;
        setBusinessId(res.business.id);
        await loadData(res.business.id);
      } catch {
        if (active) setError(t("matchLoadError"));
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router, loadData, t]);

  async function kick() {
    if (!businessId || !confirm) return;
    setBusy(true);
    setError(null);
    const { error: rpcErr } = await untypedDb.rpc("match_kick", {
      p_business_id: businessId,
      p_user_id: confirm.userId,
      p_reason: reason.trim() || null,
    });
    if (rpcErr) {
      setError(t("matchActionError"));
    } else {
      setToast(t("matchKickedToast"));
      setConfirm(null);
      setReason("");
      await loadData(businessId);
    }
    setBusy(false);
  }

  async function resolveReport(reportId: string, status: "resolved" | "dismissed") {
    if (!businessId) return;
    setBusy(true);
    setError(null);
    const { error: rpcErr } = await untypedDb.rpc("match_resolve_report", {
      p_report_id: reportId,
      p_status: status,
    });
    if (rpcErr) {
      setError(t("matchActionError"));
    } else {
      setToast(status === "resolved" ? t("matchResolvedToast") : t("matchDismissedToast"));
      await loadData(businessId);
    }
    setBusy(false);
  }

  async function unkick(userId: string) {
    if (!businessId) return;
    setBusy(true);
    setError(null);
    const { error: rpcErr } = await untypedDb.rpc("match_unkick", {
      p_business_id: businessId,
      p_user_id: userId,
    });
    if (rpcErr) {
      setError(t("matchActionError"));
    } else {
      setToast(t("matchUnkickedToast"));
      await loadData(businessId);
    }
    setBusy(false);
  }

  const kickedIds = new Set(kicks.map((k) => k.user_id));
  const isOpen = (r: MatchReport) => !!r.status && OPEN_STATUSES.includes(r.status);
  const visibleReports = filter === "pending" ? reports.filter(isOpen) : reports;

  const card: React.CSSProperties = {
    background: "var(--db-surface)",
    border: "1px solid var(--db-border)",
    borderRadius: "12px",
    padding: "14px 16px",
  };
  const smallButton: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 12px",
    borderRadius: "8px",
    border: "1px solid var(--db-border)",
    background: "transparent",
    color: "var(--db-text-secondary)",
    fontSize: "12px",
    fontWeight: 600,
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.6 : 1,
  };

  if (checking) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
        <IconLoader2 size={24} style={{ color: "var(--db-accent)", animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", maxWidth: "780px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
        <IconHeart size={22} style={{ color: "var(--db-accent)" }} />
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
          {t("matchTitle")}
        </h1>
      </div>
      <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "0 0 20px" }}>
        {t("matchSubtitle")}
      </p>

      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 12px",
            marginBottom: "14px",
            borderRadius: "10px",
            border: "1px solid var(--color-danger)",
            background: "rgb(var(--color-danger-rgb) / 0.12)",
            color: "var(--db-text-primary)",
            fontSize: "13px",
          }}
        >
          <IconAlertCircle size={16} style={{ color: "var(--color-danger)", flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}
      {toast && (
        <div
          role="status"
          onClick={() => setToast(null)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 12px",
            marginBottom: "14px",
            borderRadius: "10px",
            border: "1px solid var(--color-success)",
            background: "color-mix(in srgb, var(--color-success) 12%, transparent)",
            color: "var(--db-text-primary)",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          <IconCheck size={16} style={{ color: "var(--color-success)", flexShrink: 0 }} />
          <span>{toast}</span>
        </div>
      )}

      {/* Reports */}
      <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--db-text-primary)", margin: "0 0 10px" }}>
        {t("matchReportsTitle")}
      </h2>
      <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
        {(["pending", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            style={{
              padding: "4px 12px",
              borderRadius: "999px",
              border: "1px solid var(--db-border)",
              background: filter === f ? "var(--db-accent)" : "transparent",
              color: filter === f ? "var(--on-brand)" : "var(--db-text-secondary)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {f === "pending" ? t("matchFilterPending") : t("matchFilterAll")}
          </button>
        ))}
      </div>
      {visibleReports.length === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--db-text-tertiary)", margin: "0 0 24px" }}>
          {t("matchReportsEmpty")}
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {visibleReports.map((r) => {
            const alreadyKicked = r.reported_user_id ? kickedIds.has(r.reported_user_id) : false;
            const statusKey = r.status && REPORT_STATUSES.includes(r.status) ? `matchReportStatus_${r.status}` : null;
            return (
              <li key={r.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--db-text-primary)" }}>
                    {t("matchReportedLabel")} {displayName(r.reported_user_id)}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)" }}>
                    {new Date(r.created_at).toLocaleString()}
                    {r.status ? ` · ${statusKey ? t(statusKey) : r.status}` : ""}
                  </span>
                </div>
                <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "0 0 10px" }}>
                  {r.reason ?? t("matchNoReason")}
                </p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  {r.reported_user_id && (
                    alreadyKicked ? (
                      <span style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>{t("matchAlreadyKicked")}</span>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() => {
                          setReason("");
                          setConfirm({ userId: r.reported_user_id as string, name: displayName(r.reported_user_id) });
                        }}
                        style={{ ...smallButton, borderColor: "var(--color-danger)", color: "var(--color-danger)" }}
                      >
                        <IconBan size={14} />
                        {t("matchKickButton")}
                      </button>
                    )
                  )}
                  {isOpen(r) && (
                    <>
                      <button disabled={busy} onClick={() => void resolveReport(r.id, "resolved")} style={smallButton}>
                        <IconCheck size={14} />
                        {t("matchResolveButton")}
                      </button>
                      <button disabled={busy} onClick={() => void resolveReport(r.id, "dismissed")} style={smallButton}>
                        <IconX size={14} />
                        {t("matchDismissButton")}
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Removed people */}
      <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--db-text-primary)", margin: "0 0 10px" }}>
        {t("matchKickedTitle")}
      </h2>
      {kicks.length === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--db-text-tertiary)", margin: 0 }}>{t("matchKickedEmpty")}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
          {kicks.map((k) => (
            <li key={k.user_id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--db-text-primary)" }}>
                  {displayName(k.user_id)}
                </div>
                <div style={{ fontSize: "11px", color: "var(--db-text-tertiary)" }}>
                  {t("matchKickedOn", { date: new Date(k.created_at).toLocaleDateString() })}
                  {k.reason ? ` · ${k.reason}` : ""}
                </div>
              </div>
              <button disabled={busy} onClick={() => void unkick(k.user_id)} style={smallButton}>
                {t("matchUnkickButton")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Kick confirmation */}
      {confirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="match-kick-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            background: "var(--bg-overlay)",
          }}
        >
          <div style={{ ...card, maxWidth: "420px", width: "100%", padding: "20px" }}>
            <h3 id="match-kick-title" style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: "0 0 8px" }}>
              {t("matchKickConfirmTitle", { name: confirm.name })}
            </h3>
            <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "0 0 12px" }}>
              {t("matchKickConfirmBody")}
            </p>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--db-text-secondary)", marginBottom: "6px" }}>
              {t("matchKickReasonLabel")}
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("matchKickReasonPlaceholder")}
              maxLength={200}
              style={{
                width: "100%",
                padding: "8px 10px",
                marginBottom: "14px",
                borderRadius: "8px",
                border: "1px solid var(--db-border)",
                background: "var(--db-bg-base)",
                color: "var(--db-text-primary)",
                fontSize: "13px",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button disabled={busy} onClick={() => setConfirm(null)} style={smallButton}>
                {t("matchKickCancel")}
              </button>
              <button
                disabled={busy}
                onClick={() => void kick()}
                style={{
                  ...smallButton,
                  border: "none",
                  background: "var(--color-danger)",
                  color: "var(--on-brand)",
                }}
              >
                {busy ? <IconLoader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <IconBan size={14} />}
                {t("matchKickConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
