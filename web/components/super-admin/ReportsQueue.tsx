"use client";

/**
 * ReportsQueue — the moderation queue of /super-admin/alerts (migrations 212 / 213).
 *
 * Order: urgent > high > normal, then newest first. Tabs: All · Urgent · Match. Each report shows the reason, the detail,
 * the content type, the reported person, the venue and the SNAPSHOT the server took when the report was made. For
 * child_safety / sexual_content reports no image or media of the snapshot is loaded by itself: every element is hidden
 * behind "Show". Actions go through the admin_* RPCs (they check is_platform_admin() and leave a security_logs record).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { formatRelativeTime } from "@/lib/relativeTime";

interface Report {
  id: string;
  reporter_id: string | null;
  reported_user_id: string | null;
  content_type: string | null;
  content_id: string | null;
  reason: string | null;
  details: string | null;
  snapshot: Record<string, unknown> | null;
  priority: string;
  status: string;
  resolution: string | null;
  admin_note: string | null;
  business_id: string | null;
  created_at: string;
}

type Tab = "all" | "urgent" | "match";
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
const HIDEABLE = ["post", "comment", "message", "dm_message"];
const SENSITIVE_REASONS = ["child_safety", "sexual_content"];
const RESOLUTIONS = ["no_action", "content_removed", "user_suspended", "escalated_ncmec"] as const;
const KNOWN_REASONS = ["spam", "harassment", "hate", "threat_violence", "sexual_content", "child_safety", "impersonation", "copyright", "other"];
/** Snapshot keys that point to media; everything else is shown as text. */
const MEDIA_KEYS = ["media_urls", "media_url", "voice_url", "avatar_url"];

function mediaItems(snapshot: Record<string, unknown> | null): { key: string; value: string }[] {
  if (!snapshot) return [];
  const out: { key: string; value: string }[] = [];
  for (const key of MEDIA_KEYS) {
    const v = snapshot[key];
    if (typeof v === "string" && v) out.push({ key, value: v });
    else if (Array.isArray(v)) for (const item of v) if (typeof item === "string" && item) out.push({ key, value: item });
  }
  return out;
}

export default function ReportsQueue({ onPendingCount }: { onPendingCount?: (n: number) => void }) {
  const t = useTranslations("reportsAdmin");
  const tr = useTranslations("report");
  const trel = useTranslations("superAdmin.relativeTime");
  const [reports, setReports] = useState<Report[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [businessNames, setBusinessNames] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>("all");
  const [showResolved, setShowResolved] = useState(false);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  // Reports whose reported content no longer exists (purged): the saved copy is all that is left.
  const [expired, setExpired] = useState<Set<string>>(new Set());
  // Report waiting for the explicit "I already sent it to NCMEC" confirmation.
  const [ncmecAsk, setNcmecAsk] = useState<Report | null>(null);
  // Set once the existence RPC (migration 219) turns out not to be there: then only a failed "hide" marks a report as expired.
  const existsCheckUnavailable = useRef(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const base = supabase
      .from("reports")
      .select("id, reporter_id, reported_user_id, content_type, content_id, reason, details, snapshot, priority, status, resolution, admin_note, business_id, created_at")
      .order("created_at", { ascending: false })
      .limit(150);
    const { data, error: loadError } = await (showResolved ? base : base.eq("status", "pending"));
    if (loadError) { setError(loadError.message); setLoading(false); return; }
    setError(null);
    const rows = (data ?? []) as unknown as Report[];
    setReports(rows);
    if (!showResolved) onPendingCount?.(rows.length);

    // Does the reported content still exist? An admin cannot read messages / posts / DMs with a normal query (RLS depends on being
    // a member of the room or a participant), so a security-definer RPC answers (migration 219). If it is not applied yet nothing is
    // marked here, and the first "hide" that comes back not_found marks the report instead.
    const checkable = rows.filter((r) => r.status === "pending" && r.content_id && HIDEABLE.includes(r.content_type ?? ""));
    if (checkable.length > 0 && !existsCheckUnavailable.current) {
      const answers = await Promise.all(
        checkable.map(async (r) => {
          const { data: exists, error: existsError } = await supabase.rpc("admin_report_content_exists", {
            p_content_type: r.content_type as string,
            p_content_id: r.content_id as string,
          });
          return { id: r.id, exists, failed: !!existsError };
        }),
      );
      if (answers.some((a) => a.failed)) existsCheckUnavailable.current = true;
      setExpired((prev) => {
        const next = new Set(prev);
        for (const a of answers) {
          if (a.failed) continue;
          if (a.exists === false) next.add(a.id);
          else next.delete(a.id);
        }
        return next;
      });
    }

    const userIds = [...new Set(rows.map((r) => r.reported_user_id).filter((id): id is string => !!id))];
    if (userIds.length > 0) {
      const { data: profs } = await supabase.from("public_profiles").select("id, display_name, username").in("id", userIds);
      setNames(Object.fromEntries((profs ?? []).map((p) => [p.id as string, (p.display_name as string | null) || `@${p.username as string}`])));
    }
    const bizIds = [...new Set(rows.map((r) => r.business_id).filter((id): id is string => !!id))];
    if (bizIds.length > 0) {
      const { data: biz } = await supabase.from("businesses").select("id, name").in("id", bizIds);
      setBusinessNames(Object.fromEntries((biz ?? []).map((b) => [b.id as string, b.name as string])));
    }
    setLoading(false);
  }, [showResolved, onPendingCount]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const list = reports.filter((r) =>
      tab === "urgent" ? r.priority === "urgent" : tab === "match" ? r.content_type === "match" : true,
    );
    return [...list].sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 2;
      const pb = PRIORITY_RANK[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [reports, tab]);

  const urgentCount = reports.filter((r) => r.priority === "urgent" && r.status === "pending").length;

  async function run(r: Report, action: () => PromiseLike<{ error: { message: string } | null }>, doneKey: string) {
    setBusyId(r.id);
    const { error: rpcError } = await action();
    setBusyId(null);
    if (rpcError) { setToast(`${t("actionFailed")}: ${rpcError.message}`); return; }
    setToast(t(doneKey));
    await load();
  }

  const hide = async (r: Report) => {
    setBusyId(r.id);
    const { error: rpcError } = await supabase.rpc("admin_hide_content", { p_content_type: r.content_type as string, p_content_id: r.content_id as string, p_report_id: r.id });
    setBusyId(null);
    if (rpcError) {
      // not_found: the content was purged. Say so (and keep the saved copy) instead of a bare failure.
      if (rpcError.code === "P0002" || rpcError.message.includes("not_found")) {
        setExpired((prev) => new Set(prev).add(r.id));
        setToast(t("contentExpired"));
        return;
      }
      setToast(`${t("actionFailed")}: ${rpcError.message}`);
      return;
    }
    setToast(t("hidden"));
    await load();
  };

  const suspend = (r: Report, days: number | null) => {
    if (!r.reported_user_id) return;
    const label = days === null ? t("suspendPermanent") : t("suspendDays", { days });
    if (!window.confirm(`${label}: ${names[r.reported_user_id] ?? r.reported_user_id}?`)) return;
    void run(r, () => supabase.rpc("admin_suspend_user", { p_user_id: r.reported_user_id as string, p_days: days ?? undefined, p_reason: r.reason ?? undefined, p_report_id: r.id }), "suspended");
  };

  const resolve = (r: Report, value: string) =>
    run(r, () => supabase.rpc("admin_resolve_report", { p_report_id: r.id, p_resolution: value, p_note: note[r.id]?.trim() || undefined }), value === "dismissed" ? "dismissed" : "resolved");

  // "Escalated to NCMEC" is only recorded after an explicit confirmation (it goes to the audit log); the rest resolve at once.
  const requestResolve = (r: Report, value: string) => {
    if (value === "escalated_ncmec") { setNcmecAsk(r); return; }
    void resolve(r, value);
  };
  const confirmNcmec = () => {
    const r = ncmecAsk;
    setNcmecAsk(null);
    if (r) void resolve(r, "escalated_ncmec");
  };

  useEffect(() => {
    if (!ncmecAsk) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNcmecAsk(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ncmecAsk]);

  const reasonLabel = (reason: string | null) => {
    const code = (reason ?? "").split(":")[0];
    return KNOWN_REASONS.includes(code) ? tr(`reasons.${code}`) : (reason ?? t("noReason"));
  };

  const reveal = (key: string) => setRevealed((prev) => new Set(prev).add(key));

  return (
    <div>
      <div style={bar}>
        {(["all", "urgent", "match"] as const).map((f) => (
          <button key={f} type="button" aria-pressed={tab === f} onClick={() => setTab(f)} style={{ ...pill, background: tab === f ? "var(--color-brand)" : "transparent", color: tab === f ? "var(--on-brand)" : "var(--text-secondary)" }}>
            {t(`tab.${f}`)}{f === "urgent" && urgentCount > 0 ? ` (${urgentCount})` : ""}
          </button>
        ))}
        <label style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}>
          <input type="checkbox" checked={showResolved} onChange={(e) => { setLoading(true); setShowResolved(e.target.checked); }} />
          {t("showResolved")}
        </label>
      </div>

      {toast && (
        <div role="status" style={{ padding: "8px 16px", fontSize: 13, background: "var(--color-brand-light)", color: "var(--text-primary)", display: "flex", justifyContent: "space-between" }}>
          <span>{toast}</span>
          <button type="button" onClick={() => setToast(null)} aria-label={t("close")} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>×</button>
        </div>
      )}
      {error && <div role="alert" style={{ padding: "10px 16px", fontSize: 13, color: "var(--color-danger)" }}>{error}</div>}
      {loading && <div style={{ padding: "14px 16px", fontSize: 13, color: "var(--text-secondary)" }}>{t("loading")}</div>}
      {!loading && visible.length === 0 && <div style={{ padding: "14px 16px", fontSize: 13, color: "var(--text-secondary)", background: "var(--bg-surface)" }}>{t("empty")}</div>}

      {visible.map((r, idx) => {
        const sensitive = SENSITIVE_REASONS.includes((r.reason ?? "").split(":")[0]);
        const pending = r.status === "pending";
        const snapshotText = typeof r.snapshot?.body === "string" ? (r.snapshot.body as string) : typeof r.snapshot?.caption === "string" ? (r.snapshot.caption as string) : null;
        const media = mediaItems(r.snapshot);
        const busy = busyId === r.id;
        const isExpired = expired.has(r.id);
        return (
          <div key={r.id} style={{ padding: "14px 16px", background: "var(--bg-surface)", borderBottom: idx === visible.length - 1 ? "none" : "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <span style={{ ...badge, background: r.priority === "urgent" ? "var(--color-danger)" : r.priority === "high" ? "var(--color-warning)" : "var(--bg-elevated)", color: r.priority === "normal" ? "var(--text-secondary)" : "var(--bg-surface-light)" }}>{t(`priority.${r.priority}`)}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{reasonLabel(r.reason)}</span>
              {!pending && <span style={{ ...badge, background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>{r.status}{r.resolution ? ` · ${r.resolution}` : ""}</span>}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              {formatRelativeTime(r.created_at, trel, { granularity: "time" })}
              {` · ${t("type")}: ${r.content_type ?? "—"}`}
              {r.reported_user_id ? ` · ${t("reported")}: ${names[r.reported_user_id] ?? r.reported_user_id.slice(0, 8)}` : ""}
              {r.business_id ? ` · ${t("venue")}: ${businessNames[r.business_id] ?? r.business_id.slice(0, 8)}` : ""}
            </div>
            {r.details && <div style={{ fontSize: 13, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{r.details}</div>}

            {isExpired && (
              <div role="status" style={{ fontSize: 12, fontWeight: 600, color: "var(--color-warning)", background: "var(--bg-elevated)", borderRadius: 6, padding: "6px 10px" }}>
                {t("contentExpired")}
              </div>
            )}

            {(snapshotText || media.length > 0) && (
              <div style={{ border: "1px dashed var(--border-subtle)", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase" }}>{t("snapshot")}</div>
                {snapshotText && <div style={{ fontSize: 13, color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{snapshotText}</div>}
                {media.map((m, i) => {
                  const key = `${r.id}:${m.key}:${i}`;
                  const isUrl = /^https?:/i.test(m.value);
                  if (sensitive && !revealed.has(key)) {
                    return (
                      <div key={key} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, color: "var(--text-secondary)" }}>
                        <span>{t("sensitiveHidden")}</span>
                        <button type="button" onClick={() => reveal(key)} style={smallBtn}>{t("show")}</button>
                      </div>
                    );
                  }
                  return isUrl && m.key !== "voice_url" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={key} src={m.value} alt={t("snapshotMedia")} loading="lazy" style={{ maxWidth: 240, maxHeight: 240, borderRadius: 8 }} />
                  ) : (
                    <div key={key} style={{ fontSize: 12, color: "var(--text-secondary)", wordBreak: "break-all" }}>{m.key}: {m.value}</div>
                  );
                })}
              </div>
            )}

            {pending ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {HIDEABLE.includes(r.content_type ?? "") && r.content_id && (
                  <button
                    type="button"
                    disabled={busy || isExpired}
                    title={isExpired ? t("hideDisabledExpired") : undefined}
                    onClick={() => void hide(r)}
                    style={{ ...smallBtn, opacity: isExpired ? 0.5 : 1, cursor: isExpired ? "not-allowed" : "pointer" }}
                  >
                    {t("hideContent")}
                  </button>
                )}
                {r.reported_user_id && (
                  <>
                    <button type="button" disabled={busy} onClick={() => suspend(r, 7)} style={smallBtn}>{t("suspendDays", { days: 7 })}</button>
                    <button type="button" disabled={busy} onClick={() => suspend(r, null)} style={{ ...smallBtn, color: "var(--color-danger)" }}>{t("suspendPermanent")}</button>
                  </>
                )}
                <button type="button" disabled={busy} onClick={() => void resolve(r, "dismissed")} style={smallBtn}>{t("dismiss")}</button>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexBasis: "100%", flexWrap: "wrap" }}>
                  <select aria-label={t("resolution")} value={resolution[r.id] ?? ""} onChange={(e) => setResolution((p) => ({ ...p, [r.id]: e.target.value }))} style={field}>
                    <option value="">{t("resolution")}</option>
                    {RESOLUTIONS.map((v) => <option key={v} value={v}>{t(`resolutions.${v}`)}</option>)}
                  </select>
                  <input aria-label={t("note")} placeholder={t("note")} value={note[r.id] ?? ""} onChange={(e) => setNote((p) => ({ ...p, [r.id]: e.target.value }))} style={{ ...field, flex: "1 1 180px" }} />
                  <button type="button" disabled={busy || !resolution[r.id]} onClick={() => requestResolve(r, resolution[r.id])} style={{ ...smallBtn, background: "var(--color-brand)", color: "var(--on-brand)", opacity: resolution[r.id] ? 1 : 0.5 }}>{t("resolve")}</button>
                </div>
              </div>
            ) : (
              r.admin_note && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t("note")}: {r.admin_note}</div>
            )}
          </div>
        );
      })}

      {ncmecAsk && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ncmec-confirm-text"
          onClick={(e) => { if (e.target === e.currentTarget) setNcmecAsk(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "color-mix(in srgb, var(--bg-base) 70%, transparent)" }}
        >
          <div style={{ maxWidth: 420, width: "100%", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <p id="ncmec-confirm-text" style={{ margin: 0, fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5 }}>{t("ncmecConfirmMessage")}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" autoFocus onClick={() => setNcmecAsk(null)} style={smallBtn}>{t("ncmecConfirmCancel")}</button>
              <button type="button" onClick={confirmNcmec} style={{ ...smallBtn, background: "var(--color-brand)", color: "var(--on-brand)" }}>{t("ncmecConfirmYes")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const bar: React.CSSProperties = { display: "flex", gap: 8, padding: "10px 16px", background: "var(--bg-surface)", borderBottom: "1px solid var(--border-subtle)", alignItems: "center", flexWrap: "wrap" };
const pill: React.CSSProperties = { padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border-subtle)", fontSize: 12, cursor: "pointer" };
const badge: React.CSSProperties = { padding: "1px 7px", borderRadius: 999, fontSize: 11, fontWeight: 700 };
const smallBtn: React.CSSProperties = { padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer" };
const field: React.CSSProperties = { padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--bg-base)", color: "var(--text-primary)", fontSize: 12 };
