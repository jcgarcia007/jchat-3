/**
 * JChat 3.0 — Super Admin Review mode (Phase D1, migration 262)
 *
 * The switch of the review group: on for up to 30 days, the accounts and venues of the group with pause / retire, and the last 50 uses of
 * the bypass. Everything goes through the review_* RPCs, which check is_platform_admin() on the server.
 *
 * Tokens: var(--bg-*) / var(--text-*) / var(--color-*) / var(--border-*). NO hardcoded hex. Icons: @tabler/icons-react only.
 */

"use client";

import React, { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconAlertCircle, IconLoader2, IconTestPipe } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// The review_* functions (migration 262) are not in the generated types yet: a narrow untyped view of the client.
type RpcResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;
const rpc = (fn: string, args?: Record<string, unknown>): RpcResult =>
  (supabase as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => RpcResult }).rpc(fn, args);

type GroupStatus = "active" | "paused" | "retired";

interface Overview {
  enabled_until: string | null;
  active: boolean;
  members: { username: string; kind: "reviewer" | "qa"; status: GroupStatus; note: string | null }[];
  businesses: { slug: string; name: string; status: GroupStatus }[];
  log: { at: string; username: string | null; slug: string | null; fn: string }[];
}

const CARD: React.CSSProperties = {
  border: "1px solid var(--border-subtle)",
  borderRadius: "12px",
  background: "var(--bg-surface)",
  padding: "16px",
  marginBottom: "16px",
};
const H2: React.CSSProperties = { fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" };
const BTN: React.CSSProperties = {
  minHeight: "44px",
  padding: "0 16px",
  borderRadius: "8px",
  border: "1px solid var(--border-subtle)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};
const BTN_PRIMARY: React.CSSProperties = { ...BTN, background: "var(--color-brand)", borderColor: "var(--color-brand)", color: "var(--bg-surface-light)" };
const INPUT: React.CSSProperties = {
  minHeight: "44px",
  padding: "0 12px",
  borderRadius: "8px",
  border: "1px solid var(--border-subtle)",
  background: "var(--bg-input)",
  color: "var(--text-primary)",
  fontSize: "14px",
};

export default function ReviewModePage() {
  const t = useTranslations("superAdmin.reviewMode");
  const locale = useLocale();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [kind, setKind] = useState<"reviewer" | "qa">("reviewer");
  const [slug, setSlug] = useState("");

  const [tick, setTick] = useState(0); // bumped after every change to read the overview again

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    void rpc("review_group_overview").then(({ data: overview, error: err }) => {
      if (!alive) return;
      if (err) setError(t("loadError"));
      else { setError(null); setData(overview as Overview); }
      setLoading(false);
    });
    return () => { alive = false; };
  }, [t, tick]);

  async function run(call: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    const { error: err } = await call();
    setError(err ? t("actionError") : null);
    setTick((n) => n + 1);
    setBusy(false);
  }

  const when = (iso: string) => new Date(iso).toLocaleString(locale);
  const statusLabel = (s: GroupStatus) => (s === "active" ? t("statusActive") : s === "paused" ? t("statusPaused") : t("statusRetired"));

  if (loading) {
    return <div style={{ padding: "48px", textAlign: "center" }}><IconLoader2 size={24} stroke={2} style={{ animation: "spin 1s linear infinite", color: "var(--text-secondary)" }} /><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div>;
  }

  return (
    <div style={{ maxWidth: "860px" }}>
      <h1 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "20px", fontWeight: 800, color: "var(--text-primary)", margin: "0 0 4px" }}>
        <IconTestPipe size={22} stroke={1.8} /> {t("title")}
      </h1>
      <p style={{ fontSize: "14px", lineHeight: 1.5, color: "var(--text-secondary)", margin: "0 0 20px" }}>{t("intro")}</p>

      {error && (
        <div role="alert" style={{ display: "flex", gap: "8px", alignItems: "center", padding: "12px", borderRadius: "8px", marginBottom: "16px", border: "1px solid var(--color-danger)", color: "var(--color-danger)", fontSize: "14px" }}>
          <IconAlertCircle size={18} stroke={1.8} /> {error}
        </div>
      )}

      {data && (
        <>
          <section style={CARD} aria-live="polite">
            <p style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 12px", color: data.active ? "var(--color-success)" : "var(--text-secondary)" }}>
              {data.active && data.enabled_until ? t("statusOn", { date: when(data.enabled_until) }) : t("statusOff")}
            </p>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" disabled={busy} style={BTN_PRIMARY} onClick={() => void run(() => rpc("review_mode_set", { p_days: 30 }))}>{t("enable")}</button>
              <button type="button" disabled={busy || !data.active} style={BTN} onClick={() => { if (window.confirm(t("confirmOff"))) void run(() => rpc("review_mode_off")); }}>{t("disable")}</button>
            </div>
          </section>

          <section style={CARD}>
            <h2 style={H2}>{t("members")}</h2>
            {data.members.length === 0 ? <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>{t("none")}</p> : data.members.map((m) => (
              <GroupRow key={m.username} title={`@${m.username}`} sub={m.kind === "reviewer" ? t("kindReviewer") : t("kindQa")} status={statusLabel(m.status)}
                current={m.status} busy={busy} t={t}
                onSet={(s) => void run(() => rpc("review_group_set_status", { p_target: "member", p_ref: m.username, p_status: s }))} />
            ))}
            <form style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }} onSubmit={(e) => { e.preventDefault(); if (username.trim()) void run(() => rpc("review_group_add_member", { p_username: username.trim().replace(/^@/, ""), p_kind: kind })).then(() => setUsername("")); }}>
              <input aria-label={t("username")} placeholder={t("username")} value={username} onChange={(e) => setUsername(e.target.value)} style={INPUT} autoCapitalize="none" autoCorrect="off" />
              <select aria-label={t("addMember")} value={kind} onChange={(e) => setKind(e.target.value as "reviewer" | "qa")} style={INPUT}>
                <option value="reviewer">{t("kindReviewer")}</option>
                <option value="qa">{t("kindQa")}</option>
              </select>
              <button type="submit" disabled={busy || !username.trim()} style={BTN}>{t("addMember")}</button>
            </form>
          </section>

          <section style={CARD}>
            <h2 style={H2}>{t("venues")}</h2>
            {data.businesses.length === 0 ? <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>{t("none")}</p> : data.businesses.map((b) => (
              <GroupRow key={b.slug} title={b.name} sub={`/${b.slug}`} status={statusLabel(b.status)} current={b.status} busy={busy} t={t}
                onSet={(s) => void run(() => rpc("review_group_set_status", { p_target: "business", p_ref: b.slug, p_status: s }))} />
            ))}
            <form style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }} onSubmit={(e) => { e.preventDefault(); if (slug.trim()) void run(() => rpc("review_group_add_business", { p_slug: slug.trim() })).then(() => setSlug("")); }}>
              <input aria-label={t("slug")} placeholder={t("slug")} value={slug} onChange={(e) => setSlug(e.target.value)} style={INPUT} autoCapitalize="none" autoCorrect="off" />
              <button type="submit" disabled={busy || !slug.trim()} style={BTN}>{t("addVenue")}</button>
            </form>
          </section>

          <section style={CARD}>
            <h2 style={H2}>{t("log")}</h2>
            {data.log.length === 0 ? <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>{t("logEmpty")}</p> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", color: "var(--text-primary)" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--text-secondary)" }}>
                      <th scope="col" style={{ padding: "6px 8px" }}>{t("colWhen")}</th>
                      <th scope="col" style={{ padding: "6px 8px" }}>{t("colWho")}</th>
                      <th scope="col" style={{ padding: "6px 8px" }}>{t("colVenue")}</th>
                      <th scope="col" style={{ padding: "6px 8px" }}>{t("colFn")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.log.map((l, i) => (
                      <tr key={`${l.at}-${i}`} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{when(l.at)}</td>
                        <td style={{ padding: "6px 8px" }}>{l.username ? `@${l.username}` : "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{l.slug ?? "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{l.fn}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function GroupRow({ title, sub, status, current, busy, onSet, t }: {
  title: string; sub: string; status: string; current: GroupStatus; busy: boolean; onSet: (s: GroupStatus) => void;
  t: (key: string) => string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", padding: "10px 0", borderTop: "1px solid var(--border-subtle)" }}>
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{title}</div>
        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{sub} · {status}</div>
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {current === "active" ? (
          <button type="button" disabled={busy} style={BTN} onClick={() => onSet("paused")}>{t("pause")}</button>
        ) : (
          <button type="button" disabled={busy} style={BTN} onClick={() => onSet("active")}>{t("resume")}</button>
        )}
        {current !== "retired" && <button type="button" disabled={busy} style={BTN} onClick={() => onSet("retired")}>{t("retire")}</button>}
      </div>
    </div>
  );
}
