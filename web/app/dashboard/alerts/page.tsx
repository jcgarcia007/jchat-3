"use client";

/**
 * JChat 3.0 — Alerts / Notifications dashboard
 * Lists the signed-in owner's notifications (RLS: user reads/updates own rows),
 * newest first, with read/unread state and a mark-as-read action. Realtime updates.
 * Uses --db-* tokens only.
 */

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  IconBell,
  IconBellRinging,
  IconCheck,
  IconChecks,
  IconAlertCircle,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

interface Notification {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

function titleOf(n: Notification): string {
  const p = n.payload ?? {};
  return (
    (p.title as string) ||
    (p.message as string) ||
    (p.body as string) ||
    (p.text as string) ||
    n.type.replace(/_/g, " ")
  );
}

function bodyOf(n: Notification): string | null {
  const p = n.payload ?? {};
  const t = titleOf(n);
  const candidate = (p.body as string) || (p.message as string) || (p.description as string) || null;
  return candidate && candidate !== t ? candidate : null;
}

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const DEMO: Notification[] = [
  { id: "n1", type: "new_order", payload: { title: "New order received", body: "Order #A12F · $28.00" }, is_read: false, created_at: new Date(Date.now() - 300000).toISOString() },
  { id: "n2", type: "review", payload: { title: "New 5-star review", body: "Great vibe and fast service!" }, is_read: false, created_at: new Date(Date.now() - 5400000).toISOString() },
  { id: "n3", type: "low_stock", payload: { title: "Low stock: Caesar Salad" }, is_read: true, created_at: new Date(Date.now() - 86400000).toISOString() },
];

export default function AlertsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsRegister, setNeedsRegister] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error: err } = await supabase
      .from("notifications")
      .select("id, type, payload, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (err) throw err;
    setItems((data ?? []) as Notification[]);
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!isSupabaseConfigured) {
        setItems(DEMO);
        setLoading(false);
        return;
      }
      try {
        const res = await resolveActiveBusiness();
        if (!active) return;
        if (!res.ok) {
          if (res.reason === "no_business" || res.reason === "unauthenticated") setNeedsRegister(true);
          else setError(res.message);
          setLoading(false);
          return;
        }
        await load();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          channelRef.current = supabase
            .channel(`notifications-${user.id}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
              void load().catch(() => {});
            })
            .subscribe();
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load alerts.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      if (channelRef.current) void supabase.removeChannel(channelRef.current);
    };
  }, []);

  async function markRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    if (isSupabaseConfigured) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    }
  }

  async function markAllRead() {
    const unread = items.filter((n) => !n.is_read).map((n) => n.id);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    if (isSupabaseConfigured && unread.length > 0) {
      await supabase.from("notifications").update({ is_read: true }).in("id", unread);
    }
  }

  if (!loading && needsRegister) {
    return (
      <div style={{ maxWidth: "760px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "16px" }}>Alerts</h1>
        <NoBusinessCTA message="Register your business to receive order, review and stock alerts." />
      </div>
    );
  }

  const unreadCount = items.filter((n) => !n.is_read).length;

  return (
    <div style={{ maxWidth: "760px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", marginBottom: "8px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <IconBell size={22} color="var(--db-accent)" />
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>Alerts</h1>
          {unreadCount > 0 && (
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--db-accent-text)", background: "var(--db-accent)", borderRadius: "999px", padding: "2px 9px" }}>{unreadCount}</span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => void markAllRead()}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "10px", border: "1px solid var(--db-border)", background: "var(--db-bg-surface)", color: "var(--db-text-secondary)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
          >
            <IconChecks size={15} />
            Mark all read
          </button>
        )}
      </div>
      <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", marginBottom: "20px" }}>
        Order, review and stock notifications — updates live.
      </p>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "8px", background: "rgba(239,68,68,0.12)", color: "var(--db-danger)", fontSize: "13px", marginBottom: "16px" }}>
          <IconAlertCircle size={15} />
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "40px", color: "var(--db-text-secondary)", fontSize: "14px" }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: "48px 24px", textAlign: "center", background: "var(--db-bg-surface)", border: "1px solid var(--db-border)", borderRadius: "12px" }}>
          <IconBell size={28} color="var(--db-text-tertiary)" />
          <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", margin: "10px 0 0" }}>No alerts yet. You&apos;re all caught up.</p>
        </div>
      ) : (
        <div style={{ background: "var(--db-bg-surface)", border: "1px solid var(--db-border)", borderRadius: "12px", overflow: "hidden" }}>
          {items.map((n) => (
            <div
              key={n.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "14px 18px",
                borderBottom: "1px solid var(--db-border)",
                background: n.is_read ? "transparent" : "var(--db-accent-bg)",
              }}
            >
              <span style={{ marginTop: "2px", color: n.is_read ? "var(--db-text-tertiary)" : "var(--db-accent)" }}>
                {n.is_read ? <IconBell size={18} /> : <IconBellRinging size={18} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "14px", fontWeight: n.is_read ? 500 : 700, color: "var(--db-text-primary)" }}>{titleOf(n)}</span>
                  <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{n.type.replace(/_/g, " ")}</span>
                </div>
                {bodyOf(n) && <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "3px 0 0" }}>{bodyOf(n)}</p>}
                <span style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>{relativeTime(n.created_at)}</span>
              </div>
              {!n.is_read && (
                <button
                  type="button"
                  onClick={() => void markRead(n.id)}
                  title="Mark as read"
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--db-border)", background: "var(--db-bg-surface)", color: "var(--db-text-secondary)", fontSize: "12px", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
                >
                  <IconCheck size={13} />
                  Read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
