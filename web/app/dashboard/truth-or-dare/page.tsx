/**
 * JChat 3.0 — Dashboard · Truth or Dare (owner only)
 *
 * Same pattern as dashboard/match: owner gate (businesses.owner_id) → otherwise /dashboard; tod_* tables and RPCs are not in
 * the generated types → untypedDb (lib/untypedDb.ts). Tokens var(--db-*) / var(--color-*), no hex, Tabler icons, never email
 * (names come from public_profiles).
 *
 * Tabs:
 *  - Today: tod_rounds (24 h) + published tod_draws (24 h). Hide → tod_staff_hide(message_id, reason); Close → tod_close_round.
 *    Card texts are joined on the client against tod_cards by concept_id (dashboard locale, fallback es).
 *  - Official round: tod_create_round(room_id, category, true). terms_required → rules dialog → tod_accept_terms(version) → retry.
 *  - Reports: reports.content_type = 'message' AND business_id = venue AND snapshot.type in (tod_round, tod_draw)
 *    (reports_read_owner, 192 + trigger 226). Hide → tod_staff_hide(content_id); Remove from game → tod_kick;
 *    Resolved / Dismissed → tod_resolve_report (227).
 *  - Removed: tod_kicks with lifted_at is null, Undo → tod_unkick.
 *  - Log: tod_moderation_log (last 100).
 *  - Statistics: tod_business_stats(business_id, from, to) for 7 / 30 days.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  IconCards,
  IconLoader2,
  IconAlertCircle,
  IconBan,
  IconCheck,
  IconEyeOff,
  IconX,
  IconPlayerStop,
  IconStar,
} from "@tabler/icons-react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness, isBusinessOwner } from "@/lib/business";
import { untypedDb } from "@/lib/untypedDb";
import { TOD_CATEGORY_KEYS, TOD_TERMS_VERSION, asTodResult } from "@/lib/tod";

type TabId = "activity" | "official" | "reports" | "removed" | "log" | "stats";
const TABS: TabId[] = ["activity", "official", "reports", "removed", "log", "stats"];
const TAB_LABEL: Record<TabId, string> = {
  activity: "todTabActivity",
  official: "todTabOfficial",
  reports: "todTabReports",
  removed: "todTabRemoved",
  log: "todTabLog",
  stats: "todTabStats",
};

interface RoundRow {
  id: string;
  message_id: string | null;
  room_id: string;
  creator_id: string;
  category: string;
  is_official: boolean;
  status: string;
  plays_count: number;
  created_at: string;
}

interface DrawRow {
  id: string;
  message_id: string | null;
  user_id: string;
  kind: string;
  is_random: boolean;
  concept_id: string;
  applause_count: number;
  created_at: string;
}

interface ReportRow {
  id: string;
  content_id: string | null;
  reported_user_id: string | null;
  reason: string | null;
  details: string | null;
  status: string | null;
  created_at: string;
  snapshot: {
    type?: string;
    metadata?: { category?: string } | null;
    card_text?: Record<string, string> | null;
  } | null;
}

interface KickRow {
  user_id: string;
  reason: string | null;
  created_at: string;
}

interface LogRow {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: string | null;
  created_at: string;
}

interface RoomRow {
  id: string;
  name: string | null;
}

interface StatsData {
  rounds: number;
  official_rounds: number;
  unique_players: number;
  draws: number;
  published: number;
  reports: number;
  by_category: Record<string, number>;
  by_hour: Record<string, number>;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  username: string | null;
}

interface ConfirmState {
  kind: "hide" | "kick";
  /** message id for hide, user id for kick */
  targetId: string;
  name?: string;
}

const KNOWN_REASONS = new Set([
  "age_not_confirmed",
  "games_disabled",
  "game_disabled",
  "category_disabled",
  "not_staff",
  "room_not_found",
  "unavailable",
  "forbidden",
  "not_found",
  "invalid_target",
  "terms_required",
]);
const KNOWN_REPORT_REASONS = new Set([
  "spam",
  "harassment",
  "hate",
  "threat_violence",
  "sexual_content",
  "child_safety",
  "impersonation",
  "copyright",
  "other",
]);
const KNOWN_LOG_ACTIONS = new Set([
  "hide",
  "kick",
  "unkick",
  "official_round",
  "round_closed",
  "report_resolved",
  "report_dismissed",
]);
const KNOWN_ROUND_STATUSES = new Set(["active", "closed", "expired", "hidden"]);
const KNOWN_REPORT_STATUSES = new Set(["pending", "dismissed", "resolved"]);

const card: React.CSSProperties = {
  background: "var(--db-surface)",
  border: "1px solid var(--db-border)",
  borderRadius: "12px",
  padding: "14px 16px",
};
const list: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: "0 0 24px",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};
const h2: React.CSSProperties = { fontSize: "15px", fontWeight: 600, color: "var(--db-text-primary)", margin: "0 0 10px" };
const emptyText: React.CSSProperties = { fontSize: "13px", color: "var(--db-text-tertiary)", margin: "0 0 24px" };
const rowMeta: React.CSSProperties = { fontSize: "11px", color: "var(--db-text-tertiary)" };

export default function DashboardTruthOrDarePage() {
  const t = useTranslations("dashboardCommon");
  const locale = useLocale();
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("activity");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [gameEnabled, setGameEnabled] = useState(true);
  const [enabledCategories, setEnabledCategories] = useState<string[]>([...TOD_CATEGORY_KEYS]);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [draws, setDraws] = useState<DrawRow[]>([]);
  const [cardTexts, setCardTexts] = useState<Record<string, Record<string, string>>>({});
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<Record<string, string>>({});
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [kicks, setKicks] = useState<KickRow[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [reportFilter, setReportFilter] = useState<"pending" | "all">("pending");

  const [statsDays, setStatsDays] = useState<7 | 30>(7);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [reason, setReason] = useState("");
  const [roomId, setRoomId] = useState("");
  const [category, setCategory] = useState<string>(TOD_CATEGORY_KEYS[0]);
  const [termsOpen, setTermsOpen] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);

  const displayName = useCallback(
    (userId: string | null): string => (userId ? names[userId] : undefined) ?? t("todUnknownUser"),
    [names, t],
  );

  const reasonText = useCallback(
    (code: string | undefined): string => t(`todReason_${code && KNOWN_REASONS.has(code) ? code : "default"}`),
    [t],
  );

  /** Card text in the dashboard language, falling back to Spanish. */
  const cardText = useCallback(
    (conceptId: string): string | null => {
      const texts = cardTexts[conceptId];
      return texts?.[locale] ?? texts?.es ?? null;
    },
    [cardTexts, locale],
  );

  const loadData = useCallback(
    async (bizId: string) => {
      setError(null);
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [roundsRes, drawsRes, reportsRes, kicksRes, logRes, roomsRes, settingsRes, gameRes] = await Promise.all([
        untypedDb
          .from("tod_rounds")
          .select("id, message_id, room_id, creator_id, category, is_official, status, plays_count, created_at")
          .eq("business_id", bizId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(50),
        untypedDb
          .from("tod_draws")
          .select("id, message_id, user_id, kind, is_random, concept_id, applause_count, created_at")
          .eq("business_id", bizId)
          .eq("status", "published")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(100),
        untypedDb
          .from("reports")
          .select("id, content_id, reported_user_id, reason, details, status, created_at, snapshot")
          .eq("content_type", "message")
          .eq("business_id", bizId)
          .in("snapshot->>type", ["tod_round", "tod_draw"])
          .order("created_at", { ascending: false })
          .limit(100),
        untypedDb
          .from("tod_kicks")
          .select("user_id, reason, created_at")
          .eq("business_id", bizId)
          .is("lifted_at", null)
          .order("created_at", { ascending: false }),
        untypedDb
          .from("tod_moderation_log")
          .select("id, actor_id, action, target_type, target_id, detail, created_at")
          .eq("business_id", bizId)
          .order("created_at", { ascending: false })
          .limit(100),
        untypedDb
          .from("rooms")
          .select("id, name")
          .eq("business_id", bizId)
          .eq("is_active", true)
          .order("is_main", { ascending: false })
          .order("created_at", { ascending: true }),
        untypedDb.from("tod_settings").select("categories").eq("business_id", bizId).maybeSingle(),
        untypedDb
          .from("business_games")
          .select("enabled")
          .eq("business_id", bizId)
          .eq("game_key", "truth_or_dare")
          .maybeSingle(),
      ]);
      if (roundsRes.error || drawsRes.error || reportsRes.error || kicksRes.error || logRes.error || roomsRes.error) {
        setError(t("todLoadError"));
        return;
      }
      const roundList = (roundsRes.data ?? []) as RoundRow[];
      const drawList = (drawsRes.data ?? []) as DrawRow[];
      const reportList = ((reportsRes.data ?? []) as ReportRow[]).filter((r) =>
        ["tod_round", "tod_draw"].includes(r.snapshot?.type ?? ""),
      );
      const kickList = (kicksRes.data ?? []) as KickRow[];
      const logList = (logRes.data ?? []) as LogRow[];
      const roomList = (roomsRes.data ?? []) as RoomRow[];
      setRounds(roundList);
      setDraws(drawList);
      setReports(reportList);
      setKicks(kickList);
      setLog(logList);
      setRooms(roomList);
      setGameEnabled(gameRes.data?.enabled === true);
      const saved = Array.isArray(settingsRes.data?.categories)
        ? (settingsRes.data.categories as string[]).filter((c) => (TOD_CATEGORY_KEYS as readonly string[]).includes(c))
        : [];
      const categories: string[] = saved.length > 0 ? TOD_CATEGORY_KEYS.filter((c) => saved.includes(c)) : [...TOD_CATEGORY_KEYS];
      setEnabledCategories(categories);
      setRoomId((current) => (roomList.some((r) => r.id === current) ? current : (roomList[0]?.id ?? "")));
      setCategory((current) => (categories.includes(current) ? current : categories[0]));

      // Visible names only (public_profiles has no email). Best effort: "User" on failure.
      const userIds = [
        ...new Set(
          [
            ...roundList.map((r) => r.creator_id),
            ...drawList.map((d) => d.user_id),
            ...reportList.map((r) => r.reported_user_id),
            ...kickList.map((k) => k.user_id),
            ...logList.map((l) => l.actor_id),
            ...logList.filter((l) => l.target_type === "user").map((l) => l.target_id),
          ].filter((id): id is string => !!id),
        ),
      ];
      const conceptIds = [...new Set(drawList.map((d) => d.concept_id))];
      const messageIds = [
        ...new Set(
          [
            ...roundList.map((r) => r.message_id),
            ...drawList.map((d) => d.message_id),
            ...reportList.map((r) => r.content_id),
          ].filter((id): id is string => !!id),
        ),
      ];
      const [profilesRes, cardsRes, hiddenRes] = await Promise.all([
        userIds.length > 0
          ? untypedDb.from("public_profiles").select("id, display_name, username").in("id", userIds)
          : Promise.resolve({ data: [] as ProfileRow[] }),
        conceptIds.length > 0
          ? untypedDb.from("tod_cards").select("concept_id, locale, body").in("concept_id", conceptIds)
          : Promise.resolve({ data: [] as { concept_id: string; locale: string; body: string }[] }),
        messageIds.length > 0
          ? untypedDb.from("messages").select("id").in("id", messageIds).not("hidden_at", "is", null)
          : Promise.resolve({ data: [] as { id: string }[] }),
      ]);
      const nameMap: Record<string, string> = {};
      for (const p of (profilesRes.data ?? []) as ProfileRow[]) {
        const name = p.display_name?.trim() || (p.username ? `@${p.username}` : "");
        if (name) nameMap[p.id] = name;
      }
      setNames(nameMap);
      const textMap: Record<string, Record<string, string>> = {};
      for (const c of (cardsRes.data ?? []) as { concept_id: string; locale: string; body: string }[]) {
        (textMap[c.concept_id] ??= {})[c.locale] = c.body;
      }
      setCardTexts(textMap);
      setHiddenIds(new Set(((hiddenRes.data ?? []) as { id: string }[]).map((m) => m.id)));
    },
    [t],
  );

  const loadStats = useCallback(
    async (bizId: string, days: 7 | 30) => {
      setStatsLoading(true);
      const to = new Date();
      const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
      const { data, error: rpcErr } = await untypedDb.rpc("tod_business_stats", {
        p_business_id: bizId,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      if (rpcErr || !data) {
        setStats(null);
        setError(t("todLoadError"));
      } else {
        setStats(data as StatsData);
      }
      setStatsLoading(false);
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
        if (active) setError(t("todLoadError"));
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router, loadData, t]);

  function selectTab(id: TabId) {
    setTab(id);
    if (id === "stats" && businessId) void loadStats(businessId, statsDays);
  }

  function selectStatsDays(days: 7 | 30) {
    setStatsDays(days);
    if (businessId) void loadStats(businessId, days);
  }

  /**
   * Runs an RPC. `jsonb` RPCs answer { status }, anything but 'ok' is shown with its translated reason;
   * void RPCs (tod_resolve_report) succeed when there is no error.
   */
  async function runRpc(
    fn: string,
    args: Record<string, unknown>,
    options: { jsonb: boolean; toast?: string },
  ): Promise<{ ok: boolean; reason?: string; seconds?: number }> {
    if (!businessId) return { ok: false };
    setBusy(true);
    setError(null);
    const { data, error: rpcErr } = await untypedDb.rpc(fn, args);
    let result: { ok: boolean; reason?: string; seconds?: number };
    if (rpcErr) {
      result = { ok: false, reason: "default" };
    } else if (options.jsonb) {
      const res = asTodResult(data);
      result = { ok: res.status === "ok", reason: res.reason ?? res.status, seconds: res.seconds };
    } else {
      result = { ok: true };
    }
    if (result.ok) {
      if (options.toast) setToast(options.toast);
      await loadData(businessId);
    }
    setBusy(false);
    return result;
  }

  function showFailure(result: { reason?: string; seconds?: number }) {
    if (result.reason === "cooldown" && result.seconds) {
      setError(t("todReasonCooldown", { seconds: result.seconds }));
    } else {
      setError(reasonText(result.reason));
    }
  }

  async function submitConfirm() {
    if (!confirm) return;
    const text = reason.trim() || null;
    const result =
      confirm.kind === "hide"
        ? await runRpc("tod_staff_hide", { p_message_id: confirm.targetId, p_reason: text }, { jsonb: true, toast: t("todHiddenToast") })
        : await runRpc(
            "tod_kick",
            { p_business_id: businessId, p_user_id: confirm.targetId, p_reason: text },
            { jsonb: true, toast: t("todKickedToast") },
          );
    if (!result.ok) showFailure(result);
    setConfirm(null);
    setReason("");
  }

  async function closeRound(roundId: string) {
    const result = await runRpc("tod_close_round", { p_round_id: roundId }, { jsonb: true, toast: t("todClosedToast") });
    if (!result.ok) showFailure(result);
  }

  async function resolveReport(reportId: string, status: "resolved" | "dismissed") {
    const result = await runRpc(
      "tod_resolve_report",
      { p_report_id: reportId, p_status: status },
      { jsonb: false, toast: status === "resolved" ? t("todResolvedToast") : t("todDismissedToast") },
    );
    if (!result.ok) showFailure(result);
  }

  async function unkick(userId: string) {
    const result = await runRpc(
      "tod_unkick",
      { p_business_id: businessId, p_user_id: userId },
      { jsonb: true, toast: t("todUndoneToast") },
    );
    if (!result.ok) showFailure(result);
  }

  async function launchOfficial() {
    if (!roomId || !category) return;
    const result = await runRpc(
      "tod_create_round",
      { p_room_id: roomId, p_category: category, p_official: true },
      { jsonb: true, toast: t("todOfficialLaunchedToast") },
    );
    if (result.ok) return;
    if (result.reason === "terms_required") {
      setTermsError(null);
      setTermsOpen(true);
    } else {
      showFailure(result);
    }
  }

  async function acceptTermsAndLaunch() {
    setBusy(true);
    setTermsError(null);
    const { error: rpcErr } = await untypedDb.rpc("tod_accept_terms", { p_version: TOD_TERMS_VERSION });
    setBusy(false);
    if (rpcErr) {
      setTermsError(t("todTermsSaveError"));
      return;
    }
    setTermsOpen(false);
    await launchOfficial();
  }

  const kickedIds = useMemo(() => new Set(kicks.map((k) => k.user_id)), [kicks]);
  const visibleReports = useMemo(() => {
    const sorted = [...reports].sort((a, b) => {
      const pa = a.status === "pending" ? 0 : 1;
      const pb = b.status === "pending" ? 0 : 1;
      return pa - pb || b.created_at.localeCompare(a.created_at);
    });
    return reportFilter === "pending" ? sorted.filter((r) => r.status === "pending") : sorted;
  }, [reports, reportFilter]);

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
  const dangerButton: React.CSSProperties = {
    ...smallButton,
    borderColor: "var(--color-danger)",
    color: "var(--color-danger)",
  };
  const badge: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 8px",
    borderRadius: "999px",
    border: "1px solid var(--db-border)",
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--db-text-secondary)",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "8px",
    border: "1px solid var(--db-border)",
    background: "var(--db-bg-base)",
    color: "var(--db-text-primary)",
    fontSize: "13px",
  };
  const pill = (selected: boolean): React.CSSProperties => ({
    padding: "4px 12px",
    borderRadius: "999px",
    border: "1px solid var(--db-border)",
    background: selected ? "var(--db-accent)" : "transparent",
    color: selected ? "var(--on-brand)" : "var(--db-text-secondary)",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  });

  const categoryLabel = (c: string) => ((TOD_CATEGORY_KEYS as readonly string[]).includes(c) ? t(`todCategory_${c}`) : c);
  const fmt = (iso: string) => new Date(iso).toLocaleString(locale);

  if (checking) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
        <IconLoader2 size={24} style={{ color: "var(--db-accent)", animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const hideButton = (messageId: string | null, hidden: boolean) =>
    hidden ? (
      <span style={badge}>
        <IconEyeOff size={12} />
        {t("todHiddenBadge")}
      </span>
    ) : messageId ? (
      <button
        disabled={busy}
        onClick={() => {
          setReason("");
          setConfirm({ kind: "hide", targetId: messageId });
        }}
        style={smallButton}
      >
        <IconEyeOff size={14} />
        {t("todHideButton")}
      </button>
    ) : null;

  const maxCategory = stats ? Math.max(1, ...TOD_CATEGORY_KEYS.map((c) => stats.by_category?.[c] ?? 0)) : 1;
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const maxHour = stats ? Math.max(1, ...hours.map((h) => stats.by_hour?.[String(h)] ?? 0)) : 1;
  const statsEmpty = !!stats && stats.rounds === 0 && stats.draws === 0 && stats.reports === 0;

  return (
    <div style={{ padding: "24px", maxWidth: "820px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
        <IconCards size={22} style={{ color: "var(--db-accent)" }} />
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>{t("todTitle")}</h1>
      </div>
      <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "0 0 16px" }}>{t("todSubtitle")}</p>

      {!gameEnabled && (
        <div
          role="note"
          style={{
            padding: "10px 12px",
            marginBottom: "14px",
            borderRadius: "10px",
            border: "1px solid var(--color-warning)",
            background: "color-mix(in srgb, var(--color-warning) 12%, transparent)",
            color: "var(--db-text-primary)",
            fontSize: "13px",
          }}
        >
          {t("todNotEnabledNotice")}
        </div>
      )}

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

      <div role="tablist" style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "18px" }}>
        {TABS.map((id) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => selectTab(id)} style={pill(tab === id)}>
            {t(TAB_LABEL[id])}
          </button>
        ))}
      </div>

      {/* ── Today ─────────────────────────────────────────────────────────── */}
      {tab === "activity" && (
        <>
          <h2 style={h2}>{t("todRoundsTitle")}</h2>
          {rounds.length === 0 ? (
            <p style={emptyText}>{t("todRoundsEmpty")}</p>
          ) : (
            <ul style={list}>
              {rounds.map((r) => {
                const hidden = r.status === "hidden" || (!!r.message_id && hiddenIds.has(r.message_id));
                return (
                  <li key={r.id} style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--db-text-primary)" }}>{categoryLabel(r.category)}</span>
                        {r.is_official && (
                          <span style={{ ...badge, borderColor: "var(--color-gold)", color: "var(--color-gold)" }}>
                            <IconStar size={12} />
                            {t("todOfficialBadge")}
                          </span>
                        )}
                        <span style={badge}>
                          {t(`todRoundStatus_${KNOWN_ROUND_STATUSES.has(r.status) ? r.status : "closed"}`)}
                        </span>
                      </span>
                      <span style={rowMeta}>{fmt(r.created_at)}</span>
                    </div>
                    <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "0 0 10px" }}>
                      {t("todCreatedBy", { name: displayName(r.creator_id) })} · {t("todPlays", { count: r.plays_count })}
                    </p>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      {hideButton(r.message_id, hidden)}
                      {r.status === "active" && (
                        <button disabled={busy} onClick={() => void closeRound(r.id)} style={smallButton}>
                          <IconPlayerStop size={14} />
                          {t("todCloseButton")}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <h2 style={h2}>{t("todDrawsTitle")}</h2>
          {draws.length === 0 ? (
            <p style={emptyText}>{t("todDrawsEmpty")}</p>
          ) : (
            <ul style={list}>
              {draws.map((d) => {
                const hidden = !!d.message_id && hiddenIds.has(d.message_id);
                return (
                  <li key={d.id} style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--db-text-primary)" }}>
                        {displayName(d.user_id)} · {t(d.kind === "dare" ? "todDrawKind_dare" : "todDrawKind_truth")}
                        {d.is_random ? ` (${t("todDrawRandom")})` : ""}
                      </span>
                      <span style={rowMeta}>{fmt(d.created_at)}</span>
                    </div>
                    <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "0 0 10px" }}>
                      {cardText(d.concept_id) ?? t("todCardUnavailable")}
                    </p>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      <span style={rowMeta}>{t("todApplause", { count: d.applause_count })}</span>
                      {hideButton(d.message_id, hidden)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {/* ── Official round ────────────────────────────────────────────────── */}
      {tab === "official" && (
        <div style={{ ...card, marginBottom: "24px" }}>
          <h2 style={h2}>{t("todOfficialTitle")}</h2>
          <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "0 0 14px" }}>{t("todOfficialBody")}</p>
          {rooms.length === 0 ? (
            <p style={{ ...emptyText, margin: 0 }}>{t("todOfficialNoRooms")}</p>
          ) : (
            <>
              <label htmlFor="tod-room" style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--db-text-secondary)", marginBottom: "6px" }}>
                {t("todOfficialRoomLabel")}
              </label>
              <select id="tod-room" value={roomId} onChange={(e) => setRoomId(e.target.value)} style={{ ...inputStyle, marginBottom: "12px" }}>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name ?? r.id}
                  </option>
                ))}
              </select>
              <label htmlFor="tod-category" style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--db-text-secondary)", marginBottom: "6px" }}>
                {t("todOfficialCategoryLabel")}
              </label>
              <select id="tod-category" value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...inputStyle, marginBottom: "14px" }}>
                {enabledCategories.map((c) => (
                  <option key={c} value={c}>
                    {t(`todCategory_${c}`)} — {t(`todCategoryDesc_${c}`)}
                  </option>
                ))}
              </select>
              <button
                disabled={busy || !roomId || !category}
                onClick={() => void launchOfficial()}
                style={{ ...smallButton, border: "none", background: "var(--db-accent)", color: "var(--on-brand)", padding: "8px 16px", fontSize: "13px" }}
              >
                {busy ? <IconLoader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <IconStar size={14} />}
                {busy ? t("todOfficialLaunching") : t("todOfficialLaunch")}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Reports ───────────────────────────────────────────────────────── */}
      {tab === "reports" && (
        <>
          <h2 style={h2}>{t("todReportsTitle")}</h2>
          <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
            {(["pending", "all"] as const).map((f) => (
              <button key={f} onClick={() => setReportFilter(f)} aria-pressed={reportFilter === f} style={pill(reportFilter === f)}>
                {f === "pending" ? t("todFilterPending") : t("todFilterAll")}
              </button>
            ))}
          </div>
          {visibleReports.length === 0 ? (
            <p style={emptyText}>{t("todReportsEmpty")}</p>
          ) : (
            <ul style={list}>
              {visibleReports.map((r) => {
                const type = r.snapshot?.type === "tod_round" ? "tod_round" : "tod_draw";
                const snapshotCard = r.snapshot?.card_text;
                const text = snapshotCard ? (snapshotCard[locale] ?? snapshotCard.es ?? null) : null;
                const roundCategory = r.snapshot?.metadata?.category;
                const alreadyKicked = r.reported_user_id ? kickedIds.has(r.reported_user_id) : false;
                const hidden = !!r.content_id && hiddenIds.has(r.content_id);
                const open = r.status === "pending";
                return (
                  <li key={r.id} style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--db-text-primary)" }}>
                        {t("todReportedLabel")} {displayName(r.reported_user_id)}
                      </span>
                      <span style={rowMeta}>
                        {fmt(r.created_at)} · {t(`todReportStatus_${r.status && KNOWN_REPORT_STATUSES.has(r.status) ? r.status : "pending"}`)}
                      </span>
                    </div>
                    <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", margin: "0 0 4px" }}>
                      {t(`todReportKind_${type}`)}
                      {type === "tod_round" && roundCategory ? ` · ${categoryLabel(roundCategory)}` : ""}
                    </p>
                    {type === "tod_draw" && (
                      <p style={{ fontSize: "13px", color: "var(--db-text-primary)", margin: "0 0 4px" }}>
                        {t("todReportCardText", { text: text ?? t("todCardUnavailable") })}
                      </p>
                    )}
                    <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "0 0 10px" }}>
                      {r.reason ? (KNOWN_REPORT_REASONS.has(r.reason) ? t(`todReportReason_${r.reason}`) : r.reason) : t("todNoReason")}
                      {r.details ? ` — ${r.details}` : ""}
                    </p>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      {hideButton(r.content_id, hidden)}
                      {r.reported_user_id &&
                        (alreadyKicked ? (
                          <span style={rowMeta}>{t("todAlreadyKicked")}</span>
                        ) : (
                          <button
                            disabled={busy}
                            onClick={() => {
                              setReason("");
                              setConfirm({ kind: "kick", targetId: r.reported_user_id as string, name: displayName(r.reported_user_id) });
                            }}
                            style={dangerButton}
                          >
                            <IconBan size={14} />
                            {t("todKickButton")}
                          </button>
                        ))}
                      {open && (
                        <>
                          <button disabled={busy} onClick={() => void resolveReport(r.id, "resolved")} style={smallButton}>
                            <IconCheck size={14} />
                            {t("todResolveButton")}
                          </button>
                          <button disabled={busy} onClick={() => void resolveReport(r.id, "dismissed")} style={smallButton}>
                            <IconX size={14} />
                            {t("todDismissButton")}
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {/* ── Removed people ────────────────────────────────────────────────── */}
      {tab === "removed" && (
        <>
          <h2 style={h2}>{t("todRemovedTitle")}</h2>
          {kicks.length === 0 ? (
            <p style={emptyText}>{t("todRemovedEmpty")}</p>
          ) : (
            <ul style={list}>
              {kicks.map((k) => (
                <li key={k.user_id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--db-text-primary)" }}>{displayName(k.user_id)}</div>
                    <div style={rowMeta}>
                      {t("todRemovedOn", { date: new Date(k.created_at).toLocaleDateString(locale) })}
                      {k.reason ? ` · ${k.reason}` : ""}
                    </div>
                  </div>
                  <button disabled={busy} onClick={() => void unkick(k.user_id)} style={smallButton}>
                    {t("todUndoButton")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* ── Moderation log ────────────────────────────────────────────────── */}
      {tab === "log" && (
        <>
          <h2 style={h2}>{t("todLogTitle")}</h2>
          {log.length === 0 ? (
            <p style={emptyText}>{t("todLogEmpty")}</p>
          ) : (
            <ul style={list}>
              {log.map((l) => (
                <li key={l.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--db-text-primary)" }}>
                      {KNOWN_LOG_ACTIONS.has(l.action) ? t(`todLogAction_${l.action}`) : l.action}
                      {l.target_type === "user" && l.target_id ? ` · ${displayName(l.target_id)}` : ""}
                    </span>
                    <span style={rowMeta}>{fmt(l.created_at)}</span>
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--db-text-secondary)", margin: "4px 0 0" }}>
                    {t("todLogBy", { name: l.actor_id ? displayName(l.actor_id) : t("todLogSystem") })}
                    {l.detail ? ` · ${categoryLabel(l.detail)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* ── Statistics ────────────────────────────────────────────────────── */}
      {tab === "stats" && (
        <>
          <h2 style={h2}>{t("todStatsTitle")}</h2>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            {([7, 30] as const).map((d) => (
              <button key={d} onClick={() => selectStatsDays(d)} aria-pressed={statsDays === d} style={pill(statsDays === d)}>
                {d === 7 ? t("todStatsRange7") : t("todStatsRange30")}
              </button>
            ))}
          </div>
          {statsLoading && !stats ? (
            <IconLoader2 size={20} style={{ color: "var(--db-accent)", animation: "spin 1s linear infinite" }} />
          ) : !stats || statsEmpty ? (
            <p style={emptyText}>{t("todStatsEmpty")}</p>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "10px", marginBottom: "20px" }}>
                {(
                  [
                    ["todStatRounds", stats.rounds],
                    ["todStatOfficial", stats.official_rounds],
                    ["todStatPlayers", stats.unique_players],
                    ["todStatDraws", stats.draws],
                    ["todStatPublished", stats.published],
                    ["todStatReports", stats.reports],
                  ] as const
                ).map(([key, value]) => (
                  <div key={key} style={card}>
                    <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--db-text-primary)" }}>{value}</div>
                    <div style={{ fontSize: "12px", color: "var(--db-text-secondary)" }}>{t(key)}</div>
                  </div>
                ))}
              </div>

              <h3 style={{ ...h2, fontSize: "13px" }}>{t("todStatsByCategory")}</h3>
              <ul style={{ ...list, gap: "8px", margin: "0 0 20px" }}>
                {TOD_CATEGORY_KEYS.map((c) => {
                  const value = stats.by_category?.[c] ?? 0;
                  return (
                    <li key={c} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ width: "100px", fontSize: "12px", color: "var(--db-text-secondary)" }}>{t(`todCategory_${c}`)}</span>
                      <div style={{ flex: 1, height: "10px", borderRadius: "999px", background: "var(--db-border)" }}>
                        <div
                          role="img"
                          aria-label={`${t(`todCategory_${c}`)}: ${value}`}
                          style={{ width: `${(value / maxCategory) * 100}%`, height: "100%", borderRadius: "999px", background: "var(--db-accent)" }}
                        />
                      </div>
                      <span style={{ width: "32px", textAlign: "right", fontSize: "12px", color: "var(--db-text-primary)" }}>{value}</span>
                    </li>
                  );
                })}
              </ul>

              <h3 style={{ ...h2, fontSize: "13px" }}>{t("todStatsByHour")}</h3>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "90px", marginBottom: "4px" }}>
                {hours.map((h) => {
                  const value = stats.by_hour?.[String(h)] ?? 0;
                  return (
                    <div
                      key={h}
                      role="img"
                      aria-label={`${h}:00 — ${value}`}
                      title={`${h}:00 — ${value}`}
                      style={{
                        flex: 1,
                        height: `${value > 0 ? Math.max(4, (value / maxHour) * 100) : 0}%`,
                        borderRadius: "3px 3px 0 0",
                        background: "var(--db-accent)",
                      }}
                    />
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: "3px", marginBottom: "6px" }}>
                {hours.map((h) => (
                  <span key={h} style={{ flex: 1, textAlign: "center", fontSize: "9px", color: "var(--db-text-tertiary)" }}>
                    {h % 3 === 0 ? h : ""}
                  </span>
                ))}
              </div>
              <p style={rowMeta}>{t("todStatsHourNote")}</p>
            </>
          )}
        </>
      )}

      {/* Hide / remove-from-game confirmation */}
      {confirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tod-confirm-title"
          style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", background: "var(--bg-overlay)" }}
        >
          <div style={{ ...card, maxWidth: "420px", width: "100%", padding: "20px" }}>
            <h3 id="tod-confirm-title" style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: "0 0 8px" }}>
              {confirm.kind === "hide" ? t("todHideConfirmTitle") : t("todKickConfirmTitle", { name: confirm.name ?? t("todUnknownUser") })}
            </h3>
            <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "0 0 12px" }}>
              {confirm.kind === "hide" ? t("todHideConfirmBody") : t("todKickConfirmBody")}
            </p>
            <label htmlFor="tod-reason" style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--db-text-secondary)", marginBottom: "6px" }}>
              {confirm.kind === "hide" ? t("todHideReasonLabel") : t("todKickReasonLabel")}
            </label>
            <input
              id="tod-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={confirm.kind === "hide" ? t("todHideReasonPlaceholder") : t("todKickReasonPlaceholder")}
              maxLength={200}
              style={{ ...inputStyle, marginBottom: "14px" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button disabled={busy} onClick={() => setConfirm(null)} style={smallButton}>
                {t("todCancel")}
              </button>
              <button
                disabled={busy}
                onClick={() => void submitConfirm()}
                style={{ ...smallButton, border: "none", background: "var(--color-danger)", color: "var(--on-brand)" }}
              >
                {busy ? (
                  <IconLoader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                ) : confirm.kind === "hide" ? (
                  <IconEyeOff size={14} />
                ) : (
                  <IconBan size={14} />
                )}
                {confirm.kind === "hide" ? t("todHideConfirm") : t("todKickConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game rules (terms_required on the first official card) */}
      {termsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tod-terms-title"
          style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", background: "var(--bg-overlay)" }}
        >
          <div style={{ ...card, maxWidth: "420px", width: "100%", padding: "20px" }}>
            <h3 id="tod-terms-title" style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: "0 0 10px" }}>
              {t("todTermsTitle")}
            </h3>
            <ul style={{ margin: "0 0 12px", paddingLeft: "18px", fontSize: "13px", color: "var(--db-text-secondary)", display: "flex", flexDirection: "column", gap: "6px" }}>
              <li>{t("todTermsRule1")}</li>
              <li>{t("todTermsRule2")}</li>
              <li>{t("todTermsRule3")}</li>
            </ul>
            <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", margin: "0 0 14px" }}>{t("todTermsNotice")}</p>
            {termsError && (
              <p role="alert" style={{ fontSize: "12px", color: "var(--color-danger)", margin: "0 0 12px" }}>
                {termsError}
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button disabled={busy} onClick={() => setTermsOpen(false)} style={smallButton}>
                {t("todCancel")}
              </button>
              <button
                disabled={busy}
                onClick={() => void acceptTermsAndLaunch()}
                style={{ ...smallButton, border: "none", background: "var(--db-accent)", color: "var(--on-brand)" }}
              >
                {busy ? <IconLoader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <IconCheck size={14} />}
                {t("todTermsAccept")}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
