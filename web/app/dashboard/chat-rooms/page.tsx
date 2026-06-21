"use client";

/**
 * JChat 3.0 — Chat Rooms dashboard
 * Lists the rooms belonging to the signed-in owner's active business with their
 * type and message count, plus a link to view the public page. Real data from
 * the `rooms` + `messages` tables (RLS: rooms/messages are authenticated-read).
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
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness, type ActiveBusiness } from "@/lib/business";

interface RoomRow {
  id: string;
  name: string;
  icon: string | null;
  is_main: boolean;
  is_active: boolean;
  is_password_protected: boolean;
  ttl_hours: number | null;
  message_count: number;
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
  { id: "d1", name: "Main Room", icon: "💬", is_main: true, is_active: true, is_password_protected: false, ttl_hours: null, message_count: 128 },
  { id: "d2", name: "VIP Lounge", icon: "🥂", is_main: false, is_active: true, is_password_protected: true, ttl_hours: null, message_count: 42 },
  { id: "d3", name: "Friday Night Live", icon: "🎶", is_main: false, is_active: true, is_password_protected: false, ttl_hours: 6, message_count: 17 },
];

export default function ChatRoomsPage() {
  const [business, setBusiness] = useState<ActiveBusiness | null>(null);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          setError(res.message);
          setLoading(false);
          return;
        }
        setBusiness(res.business);

        const { data, error: roomsErr } = await supabase
          .from("rooms")
          .select("id, name, icon, is_main, is_active, is_password_protected, ttl_hours")
          .eq("business_id", res.business.id)
          .order("is_main", { ascending: false })
          .order("sort", { ascending: true });
        if (roomsErr) throw roomsErr;

        const base = (data ?? []) as Omit<RoomRow, "message_count">[];

        // Message count per room (rooms are few — count in parallel).
        const counts = await Promise.all(
          base.map((r) =>
            supabase
              .from("messages")
              .select("id", { count: "exact", head: true })
              .eq("room_id", r.id)
              .then(({ count }) => count ?? 0),
          ),
        );
        if (!active) return;
        setRooms(base.map((r, i) => ({ ...r, message_count: counts[i] })));
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

  return (
    <div style={{ maxWidth: "960px" }}>
      <div style={{ marginBottom: "8px", display: "flex", alignItems: "center", gap: "10px" }}>
        <IconMessages size={22} color="var(--db-accent)" />
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
          Chat Rooms
        </h1>
      </div>
      <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", marginBottom: "24px" }}>
        {business
          ? `Rooms for ${business.name}. Moderation, pinned messages and members are managed in the JChat app.`
          : "Your venue's chat rooms."}
      </p>

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
          No chat rooms yet. A main room is created when you register a business.
        </div>
      ) : (
        <div
          style={{
            background: "var(--db-bg-surface)",
            border: "1px solid var(--db-border)",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
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
            <span style={{ textAlign: "right" }}>Messages</span>
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
                {/* Name */}
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
                  {!r.is_active && (
                    <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)" }}>(inactive)</span>
                  )}
                </div>

                {/* Type */}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "13px",
                    color: meta.color,
                    fontWeight: 600,
                  }}
                >
                  <TypeIcon size={14} />
                  {type}
                </span>

                {/* Message count */}
                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--db-text-primary)", textAlign: "right" }}>
                  {r.message_count}
                </span>

                {/* Action */}
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
                      View
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
