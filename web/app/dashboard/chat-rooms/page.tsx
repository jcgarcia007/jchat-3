"use client";

/**
 * JChat 3.0 — Chat Rooms dashboard
 * Lists the rooms of the signed-in owner's active business with their type and
 * member count (distinct participants), lets the owner open the public page and
 * create a new room. Real data from `rooms` + `messages` (RLS: authenticated-read;
 * rooms insert allowed for the business owner).
 */

import { useEffect, useState } from "react";
import {
  IconMessages,
  IconArrowRight,
  IconLock,
  IconStar,
  IconCalendarEvent,
  IconHash,
  IconAlertCircle,
  IconPlus,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness, type ActiveBusiness } from "@/lib/business";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

interface RoomRow {
  id: string;
  name: string;
  icon: string | null;
  is_main: boolean;
  is_active: boolean;
  is_password_protected: boolean;
  ttl_hours: number | null;
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
  { id: "d1", name: "Main Room", icon: "💬", is_main: true, is_active: true, is_password_protected: false, ttl_hours: null, member_count: 86 },
  { id: "d2", name: "VIP Lounge", icon: "🥂", is_main: false, is_active: true, is_password_protected: true, ttl_hours: null, member_count: 12 },
  { id: "d3", name: "Friday Night Live", icon: "🎶", is_main: false, is_active: true, is_password_protected: false, ttl_hours: 6, member_count: 31 },
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

  async function load(bizId: string) {
    const { data, error: roomsErr } = await supabase
      .from("rooms")
      .select("id, name, icon, is_main, is_active, is_password_protected, ttl_hours")
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
          { id: `demo-${Date.now()}`, name, icon: newEmoji, is_main: false, is_active: true, is_password_protected: false, ttl_hours: null, member_count: 0 },
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
              gridTemplateColumns: "1fr 130px 130px 120px",
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
                  gridTemplateColumns: "1fr 130px 130px 120px",
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

                <div style={{ textAlign: "right" }}>
                  {business?.slug ? (
                    <a
                      href={`/b/${business.slug}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "7px 12px",
                        borderRadius: "8px",
                        background: "var(--db-bg-elevated)",
                        color: "var(--db-text-secondary)",
                        fontSize: "13px",
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      Manage
                      <IconArrowRight size={14} />
                    </a>
                  ) : (
                    <span style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>—</span>
                  )}
                </div>
              </div>
            );
          })}
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
