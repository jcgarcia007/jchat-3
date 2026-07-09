"use client";

/**
 * JChat 3.0 — Chat Rooms dashboard
 * Lists the rooms of the signed-in owner's active business with their type and
 * member count (distinct participants), lets the owner open the public page and
 * create a new room. Real data from `rooms` + `messages` (RLS: authenticated-read;
 * rooms insert allowed for the business owner).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  IconMessages,
  IconLock,
  IconStar,
  IconCalendarEvent,
  IconHash,
  IconAlertCircle,
  IconPlus,
  IconUsers,
  IconX,
  IconQrcode,
  IconLoader2,
  IconDownload,
  IconRefresh,
} from "@tabler/icons-react";
import { roomQrUrl, generateStyledQrPngDataUrl, downloadStyledQrPdf, downloadDataUrl } from "@/services/qr";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness, type ActiveBusiness } from "@/lib/business";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";
import { CHAT_THEMES, getChatTheme } from "@/constants/chatThemes";

interface RoomRow {
  id: string;
  name: string;
  icon: string | null;
  is_main: boolean;
  is_active: boolean;
  is_password_protected: boolean;
  ttl_hours: number | null;
  chat_theme_id: number;
  member_count: number;
}

type RoomType = "Main" | "Event" | "Private" | "Sub-room";

function roomType(r: RoomRow): RoomType {
  if (r.is_main) return "Main";
  if (r.ttl_hours != null) return "Event";
  if (r.is_password_protected) return "Private";
  return "Sub-room";
}

const TYPE_META: Record<RoomType, { icon: React.ComponentType<{ size?: number }>; color: string }> = {
  Main: { icon: IconStar, color: "var(--db-accent)" },
  Event: { icon: IconCalendarEvent, color: "var(--db-warning)" },
  Private: { icon: IconLock, color: "var(--db-text-secondary)" },
  "Sub-room": { icon: IconHash, color: "var(--db-text-secondary)" },
};

const DEMO_ROOMS: RoomRow[] = [
  { id: "d1", name: "Main Room", icon: "💬", is_main: true, is_active: true, is_password_protected: false, ttl_hours: null, chat_theme_id: 1, member_count: 86 },
  { id: "d2", name: "VIP Lounge", icon: "🥂", is_main: false, is_active: true, is_password_protected: true, ttl_hours: null, chat_theme_id: 4, member_count: 12 },
  { id: "d3", name: "Friday Night Live", icon: "🎶", is_main: false, is_active: true, is_password_protected: false, ttl_hours: 6, chat_theme_id: 7, member_count: 31 },
];

const ROOM_EMOJIS = ["💬", "🥂", "🎶", "🍻", "🎉", "⭐️", "🔥", "🏆", "🎯", "🪩", "🎨", "📣"];

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export default function ChatRoomsPage() {
  const [business, setBusiness] = useState<ActiveBusiness | null>(null);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsRegister, setNeedsRegister] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create-room form
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("💬");
  const [creating, setCreating] = useState(false);

  // Theme picker
  const [themeRoom, setThemeRoom] = useState<RoomRow | null>(null);
  const [savingTheme, setSavingTheme] = useState(false);

  // QR modal
  const [qrRoom, setQrRoom] = useState<RoomRow | null>(null);
  // qr_token is no longer read from the rooms table (S1 lockdown); fetched on demand
  // via the get_room_qr_token RPC (owner/admin only) when the QR modal opens.
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrGenerating, setQrGenerating] = useState(false);
  const [qrRenewing, setQrRenewing] = useState(false);
  const [qrRenewError, setQrRenewError] = useState<string | null>(null);

  async function openQr(room: RoomRow) {
    setQrRoom(room);
    setQrToken(null);
    setQrDataUrl(null);
    setQrGenerating(true);
    setQrRenewError(null);
    try {
      let token: string;
      if (!isSupabaseConfigured) {
        token = `demo-${room.id}`;
      } else {
        const { data, error: rpcErr } = await supabase.rpc("get_room_qr_token", { p_room_id: room.id });
        if (rpcErr || typeof data !== "string") {
          setQrRenewError("No se pudo obtener el código QR.");
          setQrGenerating(false);
          return;
        }
        token = data;
      }
      setQrToken(token);
      const u = await generateStyledQrPngDataUrl(roomQrUrl(token));
      setQrDataUrl(u);
    } catch {
      // qrDataUrl stays null → the modal shows the "Error al generar" fallback.
    } finally {
      setQrGenerating(false);
    }
  }

  async function renewQr() {
    if (!qrRoom) return;
    const confirmed = window.confirm(
      "¿Renovar el código QR?\n\nEsto invalidará el QR actual de esta sala. Si ya lo imprimiste, deberás reimprimirlo.\n\nLas personas que ya están en el chat no se verán afectadas.",
    );
    if (!confirmed) return;

    setQrRenewing(true);
    setQrRenewError(null);

    try {
      let newToken: string;
      if (!isSupabaseConfigured) {
        newToken = `demo-main-${Date.now().toString(16).slice(-8)}`;
      } else {
        const { data, error: rpcErr } = await supabase.rpc("regenerate_room_qr_token", {
          _room_id: qrRoom.id,
        });
        if (rpcErr) {
          const msg = (rpcErr as { message?: string }).message ?? "";
          setQrRenewError(
            msg.includes("not_authorized")
              ? "No tienes permiso para renovar este código."
              : "Error al renovar. Intenta de nuevo.",
          );
          return;
        }
        newToken = data as string;
      }

      setQrToken(newToken);

      setQrDataUrl(null);
      setQrGenerating(true);
      void generateStyledQrPngDataUrl(roomQrUrl(newToken))
        .then((u) => { setQrDataUrl(u); setQrGenerating(false); })
        .catch(() => { setQrGenerating(false); });
    } catch {
      setQrRenewError("Error al renovar. Intenta de nuevo.");
    } finally {
      setQrRenewing(false);
    }
  }

  async function changeTheme(room: RoomRow, themeId: number) {
    setSavingTheme(true);
    setError(null);
    try {
      if (isSupabaseConfigured) {
        const { error: upErr } = await supabase.from("rooms").update({ chat_theme_id: themeId }).eq("id", room.id);
        if (upErr) throw upErr;
      }
      setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, chat_theme_id: themeId } : r)));
      setThemeRoom(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change theme.");
    } finally {
      setSavingTheme(false);
    }
  }

  async function load(bizId: string) {
    const { data, error: roomsErr } = await supabase
      .from("rooms")
      .select("id, name, icon, is_main, is_active, is_password_protected, ttl_hours, chat_theme_id")
      .eq("business_id", bizId)
      .order("is_main", { ascending: false })
      .order("sort", { ascending: true });
    if (roomsErr) throw roomsErr;

    const base = (data ?? []) as Omit<RoomRow, "member_count">[];
    // "Members" = distinct message authors per room (no membership table yet).
    const counts = await Promise.all(
      base.map((r) =>
        supabase
          .from("messages")
          .select("user_id")
          .eq("room_id", r.id)
          .then(({ data: msgs }) => new Set((msgs ?? []).map((m) => m.user_id as string)).size),
      ),
    );
    setRooms(base.map((r, i) => ({ ...r, member_count: counts[i] })));
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!isSupabaseConfigured) {
        setRooms(DEMO_ROOMS);
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
        setBusiness(res.business);
        await load(res.business.id);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load chat rooms.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function createRoom() {
    const name = newName.trim();
    if (!name) {
      setError("Room name is required.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      if (!isSupabaseConfigured) {
        setRooms((prev) => [
          ...prev,
          { id: `demo-${Date.now()}`, name, icon: newEmoji, is_main: false, is_active: true, is_password_protected: false, ttl_hours: null, chat_theme_id: 1, member_count: 0 },
        ]);
      } else if (business) {
        const { error: insErr } = await supabase.from("rooms").insert({
          business_id: business.id,
          name,
          icon: newEmoji,
          chat_theme_id: 1,
          is_main: false,
          slug: `${slugify(name)}-${Date.now().toString(36)}`,
        });
        if (insErr) throw insErr;
        await load(business.id);
      }
      setNewName("");
      setNewEmoji("💬");
      setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create room.");
    } finally {
      setCreating(false);
    }
  }

  if (!loading && needsRegister) {
    return (
      <div style={{ maxWidth: "960px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "16px" }}>
          Chat Rooms
        </h1>
        <NoBusinessCTA message="Register your business to create and manage chat rooms." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "960px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", marginBottom: "8px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <IconMessages size={22} color="var(--db-accent)" />
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
            Chat Rooms
          </h1>
        </div>
        {!loading && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "9px 16px",
              borderRadius: "10px",
              background: showForm ? "var(--db-bg-elevated)" : "var(--db-accent)",
              color: showForm ? "var(--db-text-secondary)" : "var(--db-accent-text)",
              border: "none",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {showForm ? <IconX size={16} /> : <IconPlus size={16} />}
            {showForm ? "Cancel" : "New room"}
          </button>
        )}
      </div>
      <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", marginBottom: "20px" }}>
        {business
          ? `Rooms for ${business.name}. Moderation, pinned messages and members are managed in the JChat app.`
          : "Your venue's chat rooms."}
      </p>

      {/* Create form */}
      {showForm && (
        <div
          style={{
            background: "var(--db-bg-surface)",
            border: "1px solid var(--db-border)",
            borderRadius: "12px",
            padding: "20px",
            marginBottom: "20px",
            display: "flex",
            gap: "12px",
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: "200px" }}>
            <label style={labelStyle}>Room name *</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. VIP Lounge"
              style={inputStyle}
              maxLength={60}
            />
          </div>
          <div>
            <label style={labelStyle}>Emoji</label>
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", maxWidth: "260px" }}>
              {ROOM_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setNewEmoji(e)}
                  style={{
                    fontSize: "18px",
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    border: "none",
                    cursor: "pointer",
                    background: e === newEmoji ? "var(--db-accent-bg)" : "var(--db-bg-elevated)",
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void createRoom()}
            disabled={creating}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 18px",
              borderRadius: "10px",
              background: "var(--db-accent)",
              color: "var(--db-accent-text)",
              border: "none",
              fontSize: "14px",
              fontWeight: 600,
              cursor: creating ? "not-allowed" : "pointer",
              opacity: creating ? 0.7 : 1,
            }}
          >
            <IconPlus size={15} />
            {creating ? "Creating…" : "Create room"}
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 14px",
            borderRadius: "8px",
            background: "rgba(239,68,68,0.12)",
            color: "var(--db-danger)",
            fontSize: "13px",
            marginBottom: "16px",
          }}
        >
          <IconAlertCircle size={15} />
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "40px", color: "var(--db-text-secondary)", fontSize: "14px" }}>Loading…</div>
      ) : rooms.length === 0 && !error ? (
        <div
          style={{
            padding: "40px",
            textAlign: "center",
            color: "var(--db-text-secondary)",
            fontSize: "14px",
            background: "var(--db-bg-surface)",
            border: "1px solid var(--db-border)",
            borderRadius: "12px",
          }}
        >
          No chat rooms yet. Create one above, or register a business to get a main room.
        </div>
      ) : (
        <div style={{ background: "var(--db-bg-surface)", border: "1px solid var(--db-border)", borderRadius: "12px", overflow: "hidden" }}>
          {/* Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 110px 70px 360px",
              gap: "12px",
              padding: "12px 20px",
              fontSize: "11px",
              fontWeight: 700,
              color: "var(--db-text-tertiary)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              borderBottom: "1px solid var(--db-border)",
            }}
          >
            <span>Room</span>
            <span>Type</span>
            <span style={{ textAlign: "right" }}>Members</span>
            <span style={{ textAlign: "right" }}>Action</span>
          </div>

          {rooms.map((r) => {
            const type = roomType(r);
            const meta = TYPE_META[type];
            const TypeIcon = meta.icon;
            return (
              <div
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 110px 70px 360px",
                  gap: "12px",
                  padding: "14px 20px",
                  alignItems: "center",
                  borderBottom: "1px solid var(--db-border)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                  <span style={{ fontSize: "18px" }}>{r.icon ?? "💬"}</span>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--db-text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.name}
                  </span>
                  {!r.is_active && <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)" }}>(inactive)</span>}
                </div>

                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: meta.color, fontWeight: 600 }}>
                  <TypeIcon size={14} />
                  {type}
                </span>

                <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "14px", fontWeight: 600, color: "var(--db-text-primary)", justifyContent: "flex-end" }}>
                  <IconUsers size={14} color="var(--db-text-tertiary)" />
                  {r.member_count}
                </span>

                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <Link
                    href={`/dashboard/chat?room=${r.id}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "7px 12px",
                      borderRadius: "8px",
                      background: "var(--db-accent)",
                      color: "var(--db-accent-text)",
                      fontSize: "13px",
                      fontWeight: 600,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <IconMessages size={14} />
                    Open Chat
                  </Link>
                  <button
                    type="button"
                    onClick={() => setThemeRoom(r)}
                    title="Change chat theme"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "7px 10px",
                      borderRadius: "8px",
                      border: "1px solid var(--db-border)",
                      background: "var(--db-bg-elevated)",
                      color: "var(--db-text-secondary)",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: "12px",
                        height: "12px",
                        borderRadius: "50%",
                        background: getChatTheme(r.chat_theme_id).accent,
                        border: "1px solid var(--db-border)",
                        flexShrink: 0,
                      }}
                    />
                    Theme
                  </button>
                  <button
                    type="button"
                    onClick={() => { void openQr(r); }}
                    title="Ver QR de esta sala"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "7px 10px",
                      borderRadius: "8px",
                      border: "1px solid var(--db-border)",
                      background: "var(--db-bg-elevated)",
                      color: "var(--db-accent)",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      opacity: 1,
                    }}
                  >
                    <IconQrcode size={14} />
                    QR
                  </button>
                  {business?.slug && (
                    <a
                      href={`/b/${business.slug}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "7px 10px",
                        borderRadius: "8px",
                        background: "var(--db-bg-elevated)",
                        color: "var(--db-text-secondary)",
                        fontSize: "13px",
                        fontWeight: 600,
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Manage
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* QR modal — preview + download */}
      {qrRoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`QR de ${qrRoom.name}`}
          onClick={(e) => { if (e.target === e.currentTarget) { setQrRoom(null); setQrToken(null); setQrRenewError(null); } }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
            padding: "16px",
          }}
        >
          <div
            style={{
              background: "var(--db-bg-surface)",
              border: "1px solid var(--db-border)",
              borderRadius: "16px",
              padding: "24px",
              width: "340px",
              maxWidth: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <IconQrcode size={18} color="var(--db-accent)" />
                <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
                  {qrRoom.name}
                </h2>
                <button
                  type="button"
                  onClick={() => void renewQr()}
                  disabled={qrRenewing || qrGenerating}
                  title="Renovar código"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "26px",
                    height: "26px",
                    borderRadius: "6px",
                    border: "1px solid var(--db-border)",
                    background: "var(--db-bg-elevated)",
                    color: "var(--db-text-secondary)",
                    cursor: qrRenewing || qrGenerating ? "not-allowed" : "pointer",
                    opacity: qrRenewing || qrGenerating ? 0.5 : 1,
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  {qrRenewing
                    ? <IconLoader2 size={13} className="spin" />
                    : <IconRefresh size={13} />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => { setQrRoom(null); setQrToken(null); setQrRenewError(null); }}
                aria-label="Cerrar"
                style={{ border: "none", background: "transparent", color: "var(--db-text-secondary)", cursor: "pointer", padding: "4px" }}
              >
                <IconX size={20} />
              </button>
            </div>

            {/* Renew error */}
            {qrRenewError && (
              <div
                role="alert"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  background: "rgba(239,68,68,0.12)",
                  color: "var(--db-danger)",
                  fontSize: "12px",
                }}
              >
                <IconAlertCircle size={14} />
                {qrRenewError}
              </div>
            )}

            {/* QR preview */}
            <div
              style={{
                background: "#ffffff",
                borderRadius: "12px",
                padding: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "240px",
              }}
            >
              {qrGenerating ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", color: "#888", fontSize: "13px" }}>
                  <IconLoader2 size={28} className="spin" style={{ color: "#5C7CFA" }} />
                  Generando QR…
                </div>
              ) : qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR ${qrRoom.name}`}
                  style={{ width: "100%", maxWidth: "240px", height: "auto", display: "block" }}
                />
              ) : (
                <span style={{ color: "#888", fontSize: "13px" }}>Error al generar</span>
              )}
            </div>

            {/* URL */}
            {qrToken && (
              <p style={{
                fontSize: "11px",
                color: "var(--db-text-secondary)",
                textAlign: "center",
                margin: 0,
                wordBreak: "break-all",
                fontFamily: "monospace",
              }}>
                {roomQrUrl(qrToken)}
              </p>
            )}

            {/* Download buttons */}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                disabled={!qrDataUrl || !qrToken}
                onClick={() => {
                  if (!qrDataUrl || !qrToken) return;
                  downloadDataUrl(qrDataUrl, `qr-${qrToken}.png`);
                }}
                style={{
                  flex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--db-border)",
                  background: "var(--db-bg-elevated)",
                  color: "var(--db-text-primary)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: qrDataUrl ? "pointer" : "default",
                  opacity: qrDataUrl ? 1 : 0.5,
                }}
              >
                <IconDownload size={14} />
                PNG
              </button>
              <button
                type="button"
                disabled={!qrDataUrl || !qrToken}
                onClick={() => {
                  if (!qrToken) return;
                  void downloadStyledQrPdf(
                    roomQrUrl(qrToken),
                    `qr-${qrToken}`,
                    business?.name ?? "JChat",
                    qrRoom.name
                  );
                }}
                style={{
                  flex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  background: "var(--db-accent)",
                  color: "var(--db-accent-text)",
                  border: "none",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: qrDataUrl ? "pointer" : "default",
                  opacity: qrDataUrl ? 1 : 0.5,
                }}
              >
                <IconDownload size={14} />
                PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Theme picker modal — 15 chat themes with color previews */}
      {themeRoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Change theme for ${themeRoom.name}`}
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingTheme) setThemeRoom(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
            padding: "16px",
          }}
        >
          <div
            style={{
              background: "var(--db-bg-surface)",
              border: "1px solid var(--db-border)",
              borderRadius: "14px",
              padding: "20px",
              width: "560px",
              maxWidth: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
                Chat theme — {themeRoom.name}
              </h2>
              <button
                type="button"
                onClick={() => !savingTheme && setThemeRoom(null)}
                aria-label="Close"
                style={{ border: "none", background: "transparent", color: "var(--db-text-secondary)", cursor: "pointer" }}
              >
                <IconX size={20} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px" }}>
              {CHAT_THEMES.map((t) => {
                const selected = t.id === themeRoom.chat_theme_id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void changeTheme(themeRoom, t.id)}
                    disabled={savingTheme}
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      borderRadius: "10px",
                      border: selected ? "2px solid var(--db-accent)" : "1px solid var(--db-border)",
                      background: t.bg,
                      cursor: savingTheme ? "wait" : "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    {/* Mini chat preview using the theme's own colors */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ alignSelf: "flex-start", maxWidth: "80%", padding: "5px 9px", borderRadius: "9px", background: t.bubbleInBg, color: t.bubbleInText, fontSize: "11px" }}>
                        Hey there 👋
                      </span>
                      <span style={{ alignSelf: "flex-end", maxWidth: "80%", padding: "5px 9px", borderRadius: "9px", background: t.bubbleOutBg, color: t.bubbleOutText, fontSize: "11px" }}>
                        Welcome!
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: t.bubbleInText }}>
                        {t.id}. {t.name}
                      </span>
                      <span style={{ display: "flex", gap: "3px" }}>
                        {[t.bg, t.accent, t.bubbleOutBg].map((col, i) => (
                          <span key={i} style={{ width: "12px", height: "12px", borderRadius: "50%", background: col, border: `1px solid ${t.border}` }} />
                        ))}
                      </span>
                    </div>
                    {selected && (
                      <span style={{ fontSize: "11px", fontWeight: 700, color: t.accent }}>✓ Current</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--db-text-secondary)",
  marginBottom: "5px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1px solid var(--db-border)",
  background: "var(--db-bg-elevated)",
  color: "var(--db-text-primary)",
  fontSize: "14px",
  outline: "none",
};
