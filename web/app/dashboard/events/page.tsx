/**
 * JChat 3.0 — Dashboard Events Manager (Task 2.19)
 *
 * Lets business owners:
 *  1. Create an event (name, date, time, description, cover URL, lat/lng, TTL).
 *  2. On create: insert into `events` AND auto-create a matching chat room
 *     (insert into `rooms` with ttl_hours, is_main=false), then link room_id
 *     back to the event.
 *  3. List existing events with status badges.
 *  4. Close an event early → sets events.status = 'closed'.
 *
 * Stage 4 TODO: event pin overlay on the native map — see // TODO(Stage 4).
 * Server TODO: cron job / Edge Function to auto-close room at starts_at+ttl
 *              — see // TODO(server).
 *
 * Design: var(--db-*) tokens only. "use client" for hooks + form state.
 * Guard: isSupabaseConfigured check before any live DB calls.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  IconCalendarPlus,
  IconCalendarEvent,
  IconClock,
  IconMapPin,
  IconX,
  IconAlertCircle,
  IconCheck,
  IconPhoto,
  IconDoor,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────

interface Event {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  starts_at: string;
  ends_at: string | null;
  lat: number | null;
  lng: number | null;
  room_id: string | null;
  status: "upcoming" | "live" | "closed";
  created_at: string;
}

interface CreateEventForm {
  name: string;
  description: string;
  cover_url: string;
  date: string;
  time: string;
  ends_date: string;
  ends_time: string;
  lat: string;
  lng: string;
  ttl_hours: string;
}

const EMPTY_FORM: CreateEventForm = {
  name: "",
  description: "",
  cover_url: "",
  date: "",
  time: "19:00",
  ends_date: "",
  ends_time: "23:00",
  lat: "",
  lng: "",
  ttl_hours: "24",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function combineDatetime(date: string, time: string): string | null {
  if (!date) return null;
  return `${date}T${time || "00:00"}:00`;
}

function formatDatetime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadgeStyle(status: Event["status"]): React.CSSProperties {
  const map: Record<Event["status"], { bg: string; color: string }> = {
    upcoming: { bg: "var(--db-accent-bg)", color: "var(--db-accent)" },
    live: { bg: "rgba(34,197,94,0.15)", color: "var(--db-success)" },
    closed: {
      bg: "rgba(239,68,68,0.15)",
      color: "var(--db-danger)",
    },
  };
  const s = map[status] ?? map.upcoming;
  return {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    background: s.bg,
    color: s.color,
  };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateEventForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── load events ────────────────────────────────────────────────────────────
  const loadEvents = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("events")
        .select("*")
        .order("starts_at", { ascending: false })
        .limit(50);
      if (err) throw err;
      setEvents((data as Event[]) ?? []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to load events: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  // ── create event ───────────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    setError(null);
    setSuccess(null);

    if (!form.name.trim()) {
      setError("Event name is required.");
      return;
    }
    if (!form.date) {
      setError("Start date is required.");
      return;
    }
    if (!isSupabaseConfigured) {
      setError("Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    setCreating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated.");

      // Resolve business_id from the current user. Owners may have multiple
      // businesses, so pick the most-recent with maybeSingle() instead of
      // .single() (which errors on multiple rows). lat/lng are needed here, so
      // we query directly rather than via the shared id-only resolver.
      const { data: biz, error: bizErr } = await supabase
        .from("businesses")
        .select("id, lat, lng")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (bizErr || !biz) throw new Error("Business not found for this account.");

      const starts_at = combineDatetime(form.date, form.time);
      const ends_at =
        form.ends_date ? combineDatetime(form.ends_date, form.ends_time) : null;
      const ttl = parseInt(form.ttl_hours, 10) || 24;

      // Use form lat/lng or fall back to business location
      const lat =
        form.lat.trim() !== "" ? parseFloat(form.lat) : (biz.lat ?? null);
      const lng =
        form.lng.trim() !== "" ? parseFloat(form.lng) : (biz.lng ?? null);

      // 1. Insert event (room_id left null for now)
      const { data: newEvent, error: evErr } = await supabase
        .from("events")
        .insert({
          business_id: biz.id,
          name: form.name.trim(),
          description: form.description.trim() || null,
          cover_url: form.cover_url.trim() || null,
          starts_at,
          ends_at,
          lat,
          lng,
          status: "upcoming",
        })
        .select()
        .single();
      if (evErr || !newEvent) throw evErr ?? new Error("Event insert failed.");

      // 2. Auto-create the event chat room
      // TODO(server): a cron job / Edge Function should close this room at
      //               starts_at + ttl_hours automatically.
      const roomName = `${form.name.trim()} — Event Chat`;
      const { data: newRoom, error: roomErr } = await supabase
        .from("rooms")
        .insert({
          business_id: biz.id,
          name: roomName,
          description: `Auto-created event room for: ${form.name.trim()}`,
          is_main: false,
          ttl_hours: ttl,
          is_active: true,
        })
        .select("id")
        .single();
      if (roomErr || !newRoom) throw roomErr ?? new Error("Room insert failed.");

      // 3. Link room_id back to the event
      const { error: linkErr } = await supabase
        .from("events")
        .update({ room_id: newRoom.id })
        .eq("id", (newEvent as Event).id);
      if (linkErr) throw linkErr;

      // TODO(Stage 4): add event pin to native map layer here when
      //                map.native.tsx (Stage 4) is implemented.

      setSuccess(`Event "${form.name.trim()}" created with chat room.`);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await loadEvents();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Create failed: ${msg}`);
    } finally {
      setCreating(false);
    }
  }, [form, loadEvents]);

  // ── close event early ──────────────────────────────────────────────────────
  const handleCloseEarly = useCallback(
    async (eventId: string, eventName: string) => {
      if (!isSupabaseConfigured) return;
      if (!confirm(`Close "${eventName}" early? This cannot be undone.`)) return;

      setClosing(eventId);
      setError(null);
      try {
        const { error: err } = await supabase
          .from("events")
          .update({ status: "closed" })
          .eq("id", eventId);
        if (err) throw err;
        // Optionally deactivate the linked room immediately as well
        const ev = events.find((e) => e.id === eventId);
        if (ev?.room_id) {
          await supabase
            .from("rooms")
            .update({ is_active: false })
            .eq("id", ev.room_id);
        }
        await loadEvents();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Close failed: ${msg}`);
      } finally {
        setClosing(null);
      }
    },
    [events, loadEvents]
  );

  // ── form field helper ──────────────────────────────────────────────────────
  const setField = <K extends keyof CreateEventForm>(
    key: K,
    value: CreateEventForm[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 860 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "24px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--db-text-primary)",
              marginBottom: "4px",
            }}
          >
            Events
          </h1>
          <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
            Create and manage events — each event gets an auto-created chat room
            that closes after its TTL.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              setError(null);
              setSuccess(null);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: "var(--db-accent)",
              color: "var(--db-accent-text)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <IconCalendarPlus size={16} />
            New Event
          </button>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 16px",
            borderRadius: "8px",
            background: "rgba(239,68,68,0.12)",
            color: "var(--db-danger)",
            fontSize: "14px",
            marginBottom: "16px",
          }}
        >
          <IconAlertCircle size={16} />
          {error}
        </div>
      )}
      {success && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 16px",
            borderRadius: "8px",
            background: "rgba(34,197,94,0.12)",
            color: "var(--db-success)",
            fontSize: "14px",
            marginBottom: "16px",
          }}
        >
          <IconCheck size={16} />
          {success}
        </div>
      )}

      {/* Supabase not configured warning */}
      {!isSupabaseConfigured && (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: "8px",
            background: "rgba(245,158,11,0.12)",
            color: "var(--db-warning)",
            fontSize: "13px",
            marginBottom: "20px",
            lineHeight: 1.5,
          }}
        >
          <strong>Demo mode:</strong> Supabase is not configured. Set{" "}
          <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable live data.
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div
          style={{
            background: "var(--db-bg-surface)",
            border: "1px solid var(--db-border)",
            borderRadius: "12px",
            padding: "24px",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "20px",
            }}
          >
            <h2
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--db-text-primary)",
              }}
            >
              New Event
            </h2>
            <button
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY_FORM);
                setError(null);
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--db-text-tertiary)",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
              }}
              aria-label="Cancel"
            >
              <IconX size={18} />
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
            }}
          >
            {/* Name */}
            <div style={{ gridColumn: "1 / -1" }}>
              <Label>Event name *</Label>
              <Input
                value={form.name}
                onChange={(v) => setField("name", v)}
                placeholder="e.g. Friday Night Live"
              />
            </div>

            {/* Description */}
            <div style={{ gridColumn: "1 / -1" }}>
              <Label>Description</Label>
              <textarea
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="Tell guests what to expect…"
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--db-border)",
                  background: "var(--db-bg-elevated)",
                  color: "var(--db-text-primary)",
                  fontSize: "14px",
                  resize: "vertical",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Cover photo URL */}
            <div style={{ gridColumn: "1 / -1" }}>
              <Label>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <IconPhoto size={13} />
                  Cover photo URL
                  <span style={{ color: "var(--db-text-tertiary)" }}>
                    {/* TODO(storage): replace with Supabase Storage upload */}
                    (paste URL — upload coming in storage task)
                  </span>
                </span>
              </Label>
              <Input
                value={form.cover_url}
                onChange={(v) => setField("cover_url", v)}
                placeholder="https://…"
              />
            </div>

            {/* Start date */}
            <div>
              <Label>Start date *</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(v) => setField("date", v)}
              />
            </div>

            {/* Start time */}
            <div>
              <Label>Start time</Label>
              <Input
                type="time"
                value={form.time}
                onChange={(v) => setField("time", v)}
              />
            </div>

            {/* End date */}
            <div>
              <Label>End date</Label>
              <Input
                type="date"
                value={form.ends_date}
                onChange={(v) => setField("ends_date", v)}
              />
            </div>

            {/* End time */}
            <div>
              <Label>End time</Label>
              <Input
                type="time"
                value={form.ends_time}
                onChange={(v) => setField("ends_time", v)}
              />
            </div>

            {/* Location */}
            <div>
              <Label>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <IconMapPin size={13} />
                  Latitude (optional)
                </span>
              </Label>
              <Input
                value={form.lat}
                onChange={(v) => setField("lat", v)}
                placeholder="Defaults to business location"
              />
            </div>
            <div>
              <Label>Longitude (optional)</Label>
              <Input
                value={form.lng}
                onChange={(v) => setField("lng", v)}
                placeholder="Defaults to business location"
              />
            </div>

            {/* TTL */}
            <div>
              <Label>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <IconClock size={13} />
                  Auto-close chat room (hours after event ends)
                </span>
              </Label>
              <Input
                type="number"
                value={form.ttl_hours}
                onChange={(v) => setField("ttl_hours", v)}
                placeholder="24"
              />
              <p
                style={{
                  fontSize: "11px",
                  color: "var(--db-text-tertiary)",
                  marginTop: "4px",
                }}
              >
                {/* TODO(server): Edge Function / cron closes the room at ends_at + ttl_hours */}
                The event chat room deactivates automatically after this many
                hours past the end time (server job — see TESTING.md).
              </p>
            </div>
          </div>

          {/* Submit */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "20px",
              gap: "10px",
            }}
          >
            <button
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY_FORM);
                setError(null);
              }}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid var(--db-border)",
                background: "transparent",
                color: "var(--db-text-secondary)",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 20px",
                borderRadius: "8px",
                border: "none",
                background: creating
                  ? "var(--db-text-tertiary)"
                  : "var(--db-accent)",
                color: "var(--db-accent-text)",
                fontSize: "14px",
                fontWeight: 600,
                cursor: creating ? "not-allowed" : "pointer",
              }}
            >
              <IconCalendarPlus size={15} />
              {creating ? "Creating…" : "Create Event"}
            </button>
          </div>
        </div>
      )}

      {/* Events list */}
      <div>
        <h2
          style={{
            fontSize: "15px",
            fontWeight: 600,
            color: "var(--db-text-secondary)",
            marginBottom: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {loading
            ? "Loading…"
            : events.length === 0
            ? "No events yet"
            : `${events.length} event${events.length === 1 ? "" : "s"}`}
        </h2>

        {events.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {events.map((ev) => (
              <EventRow
                key={ev.id}
                event={ev}
                isClosing={closing === ev.id}
                onCloseEarly={handleCloseEarly}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: "12px",
        fontWeight: 600,
        color: "var(--db-text-secondary)",
        marginBottom: "6px",
        letterSpacing: "0.03em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: "8px",
        border: "1px solid var(--db-border)",
        background: "var(--db-bg-elevated)",
        color: "var(--db-text-primary)",
        fontSize: "14px",
        outline: "none",
        boxSizing: "border-box",
      }}
    />
  );
}

function EventRow({
  event,
  isClosing,
  onCloseEarly,
}: {
  event: Event;
  isClosing: boolean;
  onCloseEarly: (id: string, name: string) => void;
}) {
  const canClose = event.status !== "closed";

  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "10px",
        padding: "16px 20px",
        display: "flex",
        alignItems: "flex-start",
        gap: "16px",
      }}
    >
      {/* Cover thumbnail */}
      {event.cover_url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={event.cover_url}
          alt={event.name}
          style={{
            width: 60,
            height: 60,
            borderRadius: "8px",
            objectFit: "cover",
            flexShrink: 0,
            background: "var(--db-bg-elevated)",
          }}
        />
      ) : (
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: "8px",
            background: "var(--db-accent-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <IconCalendarEvent size={24} color="var(--db-accent)" />
        </div>
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "4px",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: "15px",
              fontWeight: 600,
              color: "var(--db-text-primary)",
            }}
          >
            {event.name}
          </span>
          <span style={statusBadgeStyle(event.status)}>{event.status}</span>
        </div>

        {event.description && (
          <p
            style={{
              fontSize: "13px",
              color: "var(--db-text-secondary)",
              marginBottom: "6px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {event.description}
          </p>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "12px",
              color: "var(--db-text-tertiary)",
            }}
          >
            <IconClock size={12} />
            {formatDatetime(event.starts_at)}
            {event.ends_at && ` – ${formatDatetime(event.ends_at)}`}
          </span>
          {event.room_id && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "12px",
                color: "var(--db-text-tertiary)",
              }}
            >
              <IconDoor size={12} />
              Chat room linked
            </span>
          )}
          {(event.lat != null || event.lng != null) && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "12px",
                color: "var(--db-text-tertiary)",
              }}
            >
              <IconMapPin size={12} />
              {event.lat?.toFixed(4)}, {event.lng?.toFixed(4)}
              {/* TODO(Stage 4): render event pin on native map */}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      {canClose && (
        <button
          onClick={() => onCloseEarly(event.id, event.name)}
          disabled={isClosing}
          style={{
            flexShrink: 0,
            padding: "6px 14px",
            borderRadius: "8px",
            border: "1px solid var(--db-danger)",
            background: "rgba(239,68,68,0.08)",
            color: "var(--db-danger)",
            fontSize: "12px",
            fontWeight: 600,
            cursor: isClosing ? "not-allowed" : "pointer",
            opacity: isClosing ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {isClosing ? "Closing…" : "Close early"}
        </button>
      )}
    </div>
  );
}
