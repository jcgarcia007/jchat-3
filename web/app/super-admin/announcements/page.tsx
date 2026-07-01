/**
 * JChat 3.0 — Super Admin Announcements (Task 3.13)
 *
 * Segment builder (audience filters stored on announcements.segment JSON),
 * compose message, send (INSERT into announcements).
 * Lists past announcements.
 *
 * TODO(roles): gate to Super Admin / Communications Admin.
 * TODO(server): actual push/email delivery via Edge Function on insert.
 *
 * Tokens: var(--bg-*) / var(--text-*) / var(--color-*) / var(--border-*)
 * NO hardcoded hex. Icons: @tabler/icons-react only.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  IconBroadcast,
  IconLoader2,
  IconAlertCircle,
  IconX,
  IconPlus,
  IconCheck,
  IconSend,
  IconFilter,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnnouncementSegment {
  audience: "all" | "business_owners" | "users" | "plan_pro" | "plan_starter" | "plan_enterprise" | "inactive_30d";
  city?: string;
  [key: string]: string | undefined;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  segment: AnnouncementSegment;
  sent_at: string | null;
  created_at: string;
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_ANNOUNCEMENTS: Announcement[] = [
  {
    id: "ann-01",
    title: "Welcome to JChat 3.0!",
    body: "We've just launched JChat 3.0 with a brand new design, faster chat, and more. Check it out!",
    segment: { audience: "all" },
    sent_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 8 * 86400000).toISOString(),
  },
  {
    id: "ann-02",
    title: "Pro Plan upgrade — 20% off this weekend",
    body: "Upgrade to Pro this weekend and get 20% off your first 3 months. Offer ends Sunday.",
    segment: { audience: "plan_starter" },
    sent_at: null,
    created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
];

const AUDIENCE_LABELS: Record<AnnouncementSegment["audience"], string> = {
  all: "Everyone",
  business_owners: "Business Owners",
  users: "Regular Users",
  plan_pro: "Pro Plan Subscribers",
  plan_starter: "Starter Plan Subscribers",
  plan_enterprise: "Enterprise Subscribers",
  inactive_30d: "Inactive 30+ Days",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "1d ago";
  return `${d}d ago`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuperAdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Compose state
  const [composeTitle, setComposeTitle] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeAudience, setComposeAudience] = useState<AnnouncementSegment["audience"]>("all");
  const [composeCity, setComposeCity] = useState("");
  const [composeSaving, setComposeSaving] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [sendNow, setSendNow] = useState(true);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchAnnouncements = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setAnnouncements(DEMO_ANNOUNCEMENTS);
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(null);

    const { data, error } = await supabase
      .from("announcements")
      .select("id, title, body, segment, sent_at, created_at")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      setFetchError(error.message);
      setLoading(false);
      return;
    }

    setAnnouncements((data ?? []) as Announcement[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAnnouncements();
  }, [fetchAnnouncements]);

  // ── Send / Save ───────────────────────────────────────────────────────────

  async function handleSend() {
    if (!composeTitle.trim() || !composeBody.trim()) {
      setComposeError("Title and body are required.");
      return;
    }
    setComposeSaving(true);
    setComposeError(null);

    const segment: AnnouncementSegment = {
      audience: composeAudience,
      ...(composeCity.trim() ? { city: composeCity.trim() } : {}),
    };

    const payload = {
      title: composeTitle.trim(),
      body: composeBody.trim(),
      segment,
      sent_at: sendNow ? new Date().toISOString() : null,
    };

    if (isSupabaseConfigured) {
      const { error } = await supabase.from("announcements").insert(payload);
      if (error) {
        setComposeError(error.message);
        setComposeSaving(false);
        return;
      }
      // TODO(server): trigger push/email delivery via Edge Function when status='sent'.
      // e.g. supabase.functions.invoke('send-announcement', { body: { segment, title, body } })
    } else {
      // Demo: add locally
      const demo: Announcement = {
        id: `demo-ann-${Date.now()}`,
        ...payload,
        created_at: new Date().toISOString(),
      } as Announcement;
      setAnnouncements((prev) => [demo, ...prev]);
    }

    setSuccessMsg(
      sendNow
        ? `Announcement "${composeTitle.trim()}" sent to ${AUDIENCE_LABELS[composeAudience]}.`
        : `Draft "${composeTitle.trim()}" saved.`
    );
    setComposeSaving(false);
    setShowCompose(false);
    setComposeTitle("");
    setComposeBody("");
    setComposeCity("");
    setComposeAudience("all");

    if (isSupabaseConfigured) void fetchAnnouncements();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: "900px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <IconBroadcast size={22} stroke={1.6} style={{ color: "var(--color-brand)" }} />
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            Announcements
          </h1>
        </div>
        <button
          onClick={() => { setShowCompose(true); setComposeError(null); }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 14px",
            borderRadius: "8px",
            border: "none",
            background: "var(--color-brand)",
            color: "var(--bg-surface-light)",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <IconPlus size={14} stroke={2} />
          New Announcement
        </button>
      </div>

      {/* TODO(roles): gate to Super Admin / Communications Admin */}

      {!isSupabaseConfigured && (
        <Banner type="warning" message="Demo mode — announcements shown but not delivered." />
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

      {!loading && announcements.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "64px 24px",
            border: "1px dashed var(--border-subtle)",
            borderRadius: "12px",
            color: "var(--text-secondary)",
            fontSize: "14px",
          }}
        >
          No announcements yet. Create one to broadcast to your users.
        </div>
      )}

      {!loading && announcements.length > 0 && (
        <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "12px", overflow: "hidden" }}>
          {announcements.map((ann, idx) => (
            <AnnouncementRow
              key={ann.id}
              ann={ann}
              isLast={idx === announcements.length - 1}
            />
          ))}
        </div>
      )}

      {/* Compose modal */}
      {showCompose && (
        <ComposeModal
          title={composeTitle}
          setTitle={setComposeTitle}
          body={composeBody}
          setBody={setComposeBody}
          audience={composeAudience}
          setAudience={setComposeAudience}
          city={composeCity}
          setCity={setComposeCity}
          sendNow={sendNow}
          setSendNow={setSendNow}
          saving={composeSaving}
          error={composeError}
          onSend={() => void handleSend()}
          onClose={() => setShowCompose(false)}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── AnnouncementRow ──────────────────────────────────────────────────────────

function AnnouncementRow({ ann, isLast }: { ann: Announcement; isLast: boolean }) {
  const isSent = ann.sent_at !== null;
  return (
    <div
      style={{
        padding: "16px 18px",
        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
        background: "var(--bg-surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", flexWrap: "wrap", rowGap: "8px" }}>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-block",
                padding: "2px 8px",
                borderRadius: "20px",
                fontSize: "11px",
                fontWeight: 700,
                border: `1px solid ${isSent ? "var(--color-success)" : "var(--color-warning)"}`,
                color: isSent ? "var(--color-success)" : "var(--color-warning)",
                textTransform: "uppercase",
                flexShrink: 0,
              }}
            >
              {isSent ? "Sent" : "Draft"}
            </span>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
              {ann.title}
            </span>
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "6px", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
            {ann.body}
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--text-tertiary)" }}>
              <IconFilter size={12} stroke={1.6} />
              {AUDIENCE_LABELS[ann.segment?.audience ?? "all"]}
              {ann.segment?.city ? ` · ${ann.segment.city}` : ""}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
              {isSent && ann.sent_at ? `Sent ${timeAgo(ann.sent_at)}` : `Created ${timeAgo(ann.created_at)}`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ComposeModal ─────────────────────────────────────────────────────────────

function ComposeModal({
  title,
  setTitle,
  body,
  setBody,
  audience,
  setAudience,
  city,
  setCity,
  sendNow,
  setSendNow,
  saving,
  error,
  onSend,
  onClose,
}: {
  title: string;
  setTitle: (s: string) => void;
  body: string;
  setBody: (s: string) => void;
  audience: AnnouncementSegment["audience"];
  setAudience: (a: AnnouncementSegment["audience"]) => void;
  city: string;
  setCity: (s: string) => void;
  sendNow: boolean;
  setSendNow: (b: boolean) => void;
  saving: boolean;
  error: string | null;
  onSend: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  const audienceOptions = Object.entries(AUDIENCE_LABELS) as [AnnouncementSegment["audience"], string][];

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40 }} />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 50,
          width: "min(560px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "14px",
          padding: "24px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
          <IconBroadcast size={18} stroke={1.6} style={{ color: "var(--color-brand)" }} />
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", margin: 0, flex: 1 }}>
            New Announcement
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex" }}>
            <IconX size={16} stroke={1.6} />
          </button>
        </div>

        {/* Segment builder */}
        <div
          style={{
            padding: "14px 16px",
            background: "var(--bg-elevated, var(--bg-overlay))",
            border: "1px solid var(--border-subtle)",
            borderRadius: "10px",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
            <IconFilter size={14} stroke={1.6} style={{ color: "var(--color-brand)" }} />
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Segment Builder</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "5px" }}>
                Audience
              </label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as AnnouncementSegment["audience"])}
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "6px",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  outline: "none",
                }}
              >
                {audienceOptions.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "5px" }}>
                City filter (optional)
              </label>
              <input
                type="text"
                placeholder="Miami, Austin…"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "6px",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: "8px 0 0" }}>
            Segment stored as JSON on announcements.segment.
            {/* TODO(server): actual push/email routing by segment via Edge Function */}
          </p>
        </div>

        {/* Title */}
        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "5px" }}>
            Title
          </label>
          <input
            type="text"
            placeholder="Announcement title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            style={{
              width: "100%",
              padding: "9px 12px",
              background: "var(--bg-base)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "6px",
              color: "var(--text-primary)",
              fontSize: "14px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Body */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "5px" }}>
            Message
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your announcement…"
            rows={4}
            style={{
              width: "100%",
              padding: "9px 12px",
              background: "var(--bg-base)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "6px",
              color: "var(--text-primary)",
              fontSize: "14px",
              outline: "none",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Send now vs draft */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={sendNow}
              onChange={(e) => setSendNow(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            Send immediately (uncheck to save as draft)
          </label>
        </div>

        {error && <Banner type="error" message={error} />}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", fontSize: "13px", cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={onSend}
            disabled={saving}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: saving ? "var(--text-tertiary)" : "var(--color-brand)",
              color: "var(--bg-surface-light)",
              fontSize: "13px",
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? (
              <IconLoader2 size={13} stroke={2} style={{ animation: "spin 1s linear infinite" }} />
            ) : sendNow ? (
              <IconSend size={13} stroke={2} />
            ) : (
              <IconCheck size={13} stroke={2} />
            )}
            {saving ? "Sending…" : sendNow ? "Send Now" : "Save Draft"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Banner ───────────────────────────────────────────────────────────────────

function Banner({ type, message, onDismiss }: { type: "error" | "success" | "warning"; message: string; onDismiss?: () => void }) {
  const colors = { error: "var(--color-danger)", success: "var(--color-success)", warning: "var(--color-warning)" };
  const bgs = { error: "rgba(239,68,68,0.08)", success: "rgba(29,158,117,0.08)", warning: "rgba(245,158,11,0.08)" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "8px", background: bgs[type], border: `1px solid ${colors[type]}`, color: colors[type], fontSize: "13px", marginBottom: "14px" }}>
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
