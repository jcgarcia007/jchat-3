"use client";

/**
 * Live order status for a guest (polls every 15 s while the tab is visible) + "Let the venue know".
 * Data: rpc guest_order_view(p_code) → null when the code is unknown or the order is older than 12 h.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const POLL_MS = 15_000;
const STEPS = ["confirmed", "preparing", "ready", "delivered"] as const;
const KNOWN_STATUS = ["pending", "confirmed", "preparing", "ready", "delivered", "cancelled", "disputed"];
type NoticeKind = "on_my_way" | "arrived" | "question";

interface OrderView {
  order_number: number;
  status: string;
  order_type: string;
  table_label: string | null;
  business: { name: string; slug: string } | null;
  items: { name: string; qty: number; item_status: string }[];
}

export function OrderTracker({ code }: { code: string }) {
  const t = useTranslations("orderTracking");
  const [order, setOrder] = useState<OrderView | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const [kind, setKind] = useState<NoticeKind | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setState("missing"); return; }
    const { data, error } = await supabase.rpc("guest_order_view" as never, { p_code: code } as never);
    if (error) return; // transient: keep what is on screen, try again next tick
    if (!data) { setOrder(null); setState("missing"); return; }
    setOrder(data as unknown as OrderView);
    setState("ok");
  }, [code]);

  useEffect(() => {
    void load();
    const start = () => { if (!timer.current) timer.current = setInterval(() => void load(), POLL_MS); };
    const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
    const onVisibility = () => { if (document.hidden) stop(); else { void load(); start(); } };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [load]);

  const send = useCallback(async () => {
    if (!kind || sending) return;
    if (kind === "question" && !note.trim()) { setNotice({ tone: "error", text: t("errNote") }); return; }
    setSending(true);
    setNotice(null);
    const { error } = await supabase.rpc("guest_order_notify_staff" as never, {
      p_code: code, p_kind: kind, p_note: kind === "question" ? note.trim() : null,
    } as never);
    setSending(false);
    if (error) {
      const msg = error.message ?? "";
      const key = msg.includes("notice_cooldown") ? "errCooldown"
        : msg.includes("notice_limit") ? "errLimit"
        : msg.includes("note_required") ? "errNote"
        : msg.includes("order_closed") ? "errClosed"
        : "errGeneric";
      setNotice({ tone: "error", text: t(key) });
      return;
    }
    setNotice({ tone: "ok", text: t("sent") });
    setKind(null);
    setNote("");
  }, [kind, note, sending, code, t]);

  if (state === "loading") {
    return <div style={shell}><p style={{ color: "var(--text-secondary)" }}>{t("loading")}</p></div>;
  }
  if (state === "missing" || !order) {
    return (
      <div style={shell}>
        <div style={card}>
          <h1 style={h1}>{t("notFoundTitle")}</h1>
          <p style={muted}>{t("notFoundBody")}</p>
        </div>
      </div>
    );
  }

  const stepIndex = STEPS.indexOf(order.status as (typeof STEPS)[number]);
  const cancelled = order.status === "cancelled";
  const statusText = KNOWN_STATUS.includes(order.status) ? t(`status.${order.status}`) : order.status;
  const where = order.order_type === "table" && order.table_label
    ? t("atTable", { label: order.table_label })
    : t("pickup");

  return (
    <div style={shell}>
      <div style={card}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{order.business?.name}</div>
        <h1 style={h1}>{t("orderNumber", { n: order.order_number })}</h1>
        <div
          role="status"
          aria-live="polite"
          style={{
            fontSize: 20, fontWeight: 800,
            color: cancelled ? "var(--color-danger)" : order.status === "ready" ? "var(--color-success)" : "var(--text-primary)",
          }}
        >
          {statusText}
        </div>
        <div style={muted}>{where}</div>

        {!cancelled && stepIndex >= 0 && (
          <ol style={{ display: "flex", gap: 6, listStyle: "none", padding: 0, margin: "4px 0" }} aria-label={t("progress")}>
            {STEPS.map((s, i) => (
              <li
                key={s}
                style={{
                  flex: 1, height: 6, borderRadius: 3,
                  background: i <= stepIndex ? "var(--color-brand)" : "var(--border-subtle)",
                }}
                title={t(`status.${s}`)}
              />
            ))}
          </ol>
        )}

        <h2 style={h2}>{t("itemsTitle")}</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {order.items.map((it, i) => (
            <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 15, color: "var(--text-primary)" }}>
              <span>{it.qty} × {it.name}</span>
            </li>
          ))}
        </ul>
        <div style={{ ...muted, fontSize: 12 }}>{t("autoUpdates")}</div>
      </div>

      {!cancelled && (
        <div style={card}>
          <h2 style={h2}>{t("notifyTitle")}</h2>
          <div role="radiogroup" aria-label={t("notifyTitle")} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(["on_my_way", "arrived", "question"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => { setKind(k); setNotice(null); }}
                style={{
                  ...optionBtn,
                  borderColor: kind === k ? "var(--color-brand)" : "var(--border-subtle)",
                  background: kind === k ? "var(--color-brand-light)" : "transparent",
                }}
              >
                {t(`kind.${k}`)}
              </button>
            ))}
          </div>
          {kind === "question" && (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              placeholder={t("notePlaceholder")}
              aria-label={t("notePlaceholder")}
              rows={3}
              style={textarea}
            />
          )}
          <button
            type="button"
            onClick={() => void send()}
            disabled={!kind || sending}
            style={{ ...primaryBtn, opacity: !kind || sending ? 0.5 : 1 }}
          >
            {sending ? t("sending") : t("send")}
          </button>
          {notice && (
            <div role={notice.tone === "error" ? "alert" : "status"} style={{ fontSize: 14, color: notice.tone === "error" ? "var(--color-danger)" : "var(--color-success)" }}>
              {notice.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const shell: React.CSSProperties = {
  minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center",
  gap: 14, padding: "24px 16px", background: "var(--bg-base)",
};
const card: React.CSSProperties = {
  width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", gap: 10, padding: 18,
  borderRadius: 16, border: "1px solid var(--border-subtle)", background: "var(--bg-surface)",
};
const h1: React.CSSProperties = { fontSize: 22, fontWeight: 800, margin: 0, color: "var(--text-primary)" };
const h2: React.CSSProperties = { fontSize: 15, fontWeight: 700, margin: "6px 0 0", color: "var(--text-primary)" };
const muted: React.CSSProperties = { fontSize: 14, color: "var(--text-secondary)", margin: 0 };
const optionBtn: React.CSSProperties = {
  minHeight: 44, padding: "10px 14px", borderRadius: 12, border: "1px solid var(--border-subtle)",
  color: "var(--text-primary)", fontSize: 15, fontWeight: 600, textAlign: "left", cursor: "pointer",
};
const textarea: React.CSSProperties = {
  width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--border-subtle)",
  background: "var(--bg-base)", color: "var(--text-primary)", fontSize: 15, resize: "vertical",
};
const primaryBtn: React.CSSProperties = {
  minHeight: 46, padding: "12px 18px", borderRadius: 12, background: "var(--color-brand)",
  color: "var(--bg-surface-light)", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer",
};
