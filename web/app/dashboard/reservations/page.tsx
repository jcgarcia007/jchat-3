/**
 * JChat 3.0 — Dashboard Reservations (Task 3.11)
 *
 * Owner view for managing table/space reservations:
 *  - Toggle between Calendar view and List view.
 *  - Confirm / Reject pending reservations (updates status).
 *  - Mark customers as No-show.
 *  - Capacity settings panel (max party size + daily slots).
 *  - Realtime subscription — list refreshes on any change to `reservations`.
 *
 * TODO(server): send push notification to customer on confirm/reject.
 * TODO(server): scheduled reminders 24h + 2h before reserved_at (Edge Function / cron).
 * TODO(schema): capacity settings — when a `business_capacity` table or column
 *               is added, persist maxPartySize + dailySlots there instead of
 *               local state.
 *
 * Design: var(--db-*) tokens only. "use client" required for hooks + state.
 * Guard: isSupabaseConfigured check before any live DB calls.
 */

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  IconCalendarEvent,
  IconList,
  IconCheck,
  IconX,
  IconAlertCircle,
  IconClock,
  IconUsers,
  IconNotes,
  IconSettings,
  IconRefresh,
  IconCalendarTime,
} from "@tabler/icons-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReservationStatus = "pending" | "confirmed" | "rejected" | "no_show";

interface Reservation {
  id: string;
  business_id: string;
  user_id: string;
  reserved_at: string;
  party_size: number;
  special_requests: string | null;
  status: ReservationStatus;
  is_waitlist: boolean;
  created_at: string;
  // joined profile info (may be absent if RLS or join fails)
  profiles?: { display_name: string | null; username: string | null } | null;
}

// ── Demo data ─────────────────────────────────────────────────────────────────

function makeDemoDate(offsetDays: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const DEMO_RESERVATIONS: Reservation[] = [
  {
    id: "demo-res-1",
    business_id: "demo-biz",
    user_id: "demo-user-1",
    reserved_at: makeDemoDate(1, 19),
    party_size: 4,
    special_requests: "Window table please",
    status: "pending",
    is_waitlist: false,
    created_at: new Date().toISOString(),
    profiles: { display_name: "Alex Rivera", username: "alexr" },
  },
  {
    id: "demo-res-2",
    business_id: "demo-biz",
    user_id: "demo-user-2",
    reserved_at: makeDemoDate(1, 20),
    party_size: 2,
    special_requests: null,
    status: "confirmed",
    is_waitlist: false,
    created_at: new Date().toISOString(),
    profiles: { display_name: "Jamie Lee", username: "jamielee" },
  },
  {
    id: "demo-res-3",
    business_id: "demo-biz",
    user_id: "demo-user-3",
    reserved_at: makeDemoDate(2, 12),
    party_size: 6,
    special_requests: "Birthday celebration — need cake space",
    status: "pending",
    is_waitlist: false,
    created_at: new Date().toISOString(),
    profiles: { display_name: "Morgan P.", username: "morganp" },
  },
  {
    id: "demo-res-4",
    business_id: "demo-biz",
    user_id: "demo-user-4",
    reserved_at: makeDemoDate(2, 18),
    party_size: 3,
    special_requests: null,
    status: "pending",
    is_waitlist: true,
    created_at: new Date().toISOString(),
    profiles: { display_name: "Sam K.", username: "samk" },
  },
  {
    id: "demo-res-5",
    business_id: "demo-biz",
    user_id: "demo-user-5",
    reserved_at: makeDemoDate(0, 13),
    party_size: 2,
    special_requests: null,
    status: "no_show",
    is_waitlist: false,
    created_at: new Date().toISOString(),
    profiles: { display_name: "Taylor W.", username: "taylorw" },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function isoDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function guestLabel(r: Reservation): string {
  if (r.profiles?.display_name) return r.profiles.display_name;
  if (r.profiles?.username) return `@${r.profiles.username}`;
  return `User …${r.user_id.slice(-6)}`;
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_META: Record<
  ReservationStatus,
  { label: string; bg: string; color: string }
> = {
  pending: {
    label: "Pending",
    bg: "rgba(245,158,11,0.15)",
    color: "var(--db-warning)",
  },
  confirmed: {
    label: "Confirmed",
    bg: "rgba(34,197,94,0.15)",
    color: "var(--db-success)",
  },
  rejected: {
    label: "Rejected",
    bg: "rgba(239,68,68,0.15)",
    color: "var(--db-danger)",
  },
  no_show: {
    label: "No-show",
    bg: "rgba(239,68,68,0.08)",
    color: "var(--db-danger)",
  },
};

function StatusBadge({
  status,
  isWaitlist,
}: {
  status: ReservationStatus;
  isWaitlist: boolean;
}) {
  const m = STATUS_META[status];
  return (
    <span style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
      <span
        style={{
          padding: "2px 10px",
          borderRadius: "999px",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          background: m.bg,
          color: m.color,
          whiteSpace: "nowrap",
        }}
      >
        {m.label}
      </span>
      {isWaitlist && (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: "999px",
            fontSize: "11px",
            fontWeight: 600,
            background: "rgba(124,58,237,0.15)",
            color: "var(--db-brand-purple, #7C3AED)",
            whiteSpace: "nowrap",
          }}
        >
          Waitlist
        </span>
      )}
    </span>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AlertBanner({
  type,
  message,
}: {
  type: "error" | "success" | "warning";
  message: string;
}) {
  const styles: Record<string, { bg: string; color: string }> = {
    error: { bg: "rgba(239,68,68,0.12)", color: "var(--db-danger)" },
    success: { bg: "rgba(34,197,94,0.12)", color: "var(--db-success)" },
    warning: { bg: "rgba(245,158,11,0.12)", color: "var(--db-warning)" },
  };
  const s = styles[type] ?? styles.error;
  const Icon =
    type === "success" ? IconCheck : IconAlertCircle;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "12px 16px",
        borderRadius: "8px",
        background: s.bg,
        color: s.color,
        fontSize: "14px",
        marginBottom: "16px",
      }}
    >
      <Icon size={16} />
      {message}
    </div>
  );
}

// ── Reservation row (list view) ───────────────────────────────────────────────

interface ReservationRowProps {
  reservation: Reservation;
  actionLoading: string | null;
  onAction: (id: string, action: "confirmed" | "rejected" | "no_show") => void;
}

function ReservationRow({
  reservation: r,
  actionLoading,
  onAction,
}: ReservationRowProps) {
  const busy = actionLoading === r.id;

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
        flexWrap: "wrap",
      }}
    >
      {/* Time column */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          minWidth: "56px",
          gap: "2px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "8px",
            background: "var(--db-accent-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconCalendarTime size={20} color="var(--db-accent)" />
        </div>
        <span
          style={{
            fontSize: "11px",
            color: "var(--db-text-tertiary)",
            textAlign: "center",
            marginTop: "4px",
          }}
        >
          {formatDateShort(r.reserved_at)}
        </span>
        <span
          style={{
            fontSize: "11px",
            color: "var(--db-text-secondary)",
            textAlign: "center",
            fontWeight: 600,
          }}
        >
          {formatTime(r.reserved_at)}
        </span>
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: "160px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            marginBottom: "6px",
          }}
        >
          <span
            style={{
              fontSize: "15px",
              fontWeight: 600,
              color: "var(--db-text-primary)",
            }}
          >
            {guestLabel(r)}
          </span>
          <StatusBadge status={r.status} isWaitlist={r.is_waitlist} />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
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
            <IconUsers size={12} />
            {r.party_size} {r.party_size === 1 ? "guest" : "guests"}
          </span>
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
            {formatDate(r.reserved_at)} · {formatTime(r.reserved_at)}
          </span>
        </div>

        {r.special_requests && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "4px",
              marginTop: "6px",
            }}
          >
            <IconNotes size={12} color="var(--db-text-tertiary)" style={{ marginTop: 2, flexShrink: 0 }} />
            <span
              style={{
                fontSize: "12px",
                color: "var(--db-text-secondary)",
                fontStyle: "italic",
              }}
            >
              {r.special_requests}
            </span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {r.status === "pending" && (
          <>
            <button
              onClick={() => onAction(r.id, "confirmed")}
              disabled={busy}
              title="Confirm reservation"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "6px 14px",
                borderRadius: "8px",
                border: "none",
                background: busy
                  ? "var(--db-text-tertiary)"
                  : "var(--db-success)",
                color: "#fff",
                fontSize: "12px",
                fontWeight: 600,
                cursor: busy ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <IconCheck size={13} />
              {busy ? "…" : "Confirm"}
            </button>
            <button
              onClick={() => onAction(r.id, "rejected")}
              disabled={busy}
              title="Reject reservation"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "6px 12px",
                borderRadius: "8px",
                border: "1px solid var(--db-danger)",
                background: "rgba(239,68,68,0.08)",
                color: "var(--db-danger)",
                fontSize: "12px",
                fontWeight: 600,
                cursor: busy ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <IconX size={13} />
              {busy ? "…" : "Reject"}
            </button>
          </>
        )}
        {r.status === "confirmed" && (
          <button
            onClick={() => onAction(r.id, "no_show")}
            disabled={busy}
            title="Mark as no-show"
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid var(--db-border)",
              background: "transparent",
              color: "var(--db-text-secondary)",
              fontSize: "12px",
              fontWeight: 500,
              cursor: busy ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {busy ? "…" : "No-show"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Calendar view ─────────────────────────────────────────────────────────────

interface CalendarViewProps {
  reservations: Reservation[];
  actionLoading: string | null;
  onAction: (id: string, action: "confirmed" | "rejected" | "no_show") => void;
}

function CalendarView({ reservations, actionLoading, onAction }: CalendarViewProps) {
  // Group reservations by date (YYYY-MM-DD)
  const grouped: Record<string, Reservation[]> = {};
  for (const r of reservations) {
    const key = isoDateOnly(r.reserved_at);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  const sortedDates = Object.keys(grouped).sort();

  if (sortedDates.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px 20px",
          color: "var(--db-text-tertiary)",
          gap: "12px",
        }}
      >
        <IconCalendarEvent size={40} />
        <p style={{ fontSize: "15px", color: "var(--db-text-secondary)" }}>
          No reservations yet
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {sortedDates.map((date) => {
        const dayRes = grouped[date] ?? [];
        const d = new Date(date + "T00:00:00");
        const dayLabel = d.toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        });

        return (
          <div key={date}>
            {/* Day header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--db-accent)",
                  flexShrink: 0,
                }}
              />
              <h3
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--db-text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {dayLabel}
              </h3>
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--db-text-tertiary)",
                }}
              >
                {dayRes.length} reservation{dayRes.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Day slots */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                paddingLeft: "18px",
                borderLeft: "2px solid var(--db-border)",
              }}
            >
              {dayRes
                .slice()
                .sort(
                  (a, b) =>
                    new Date(a.reserved_at).getTime() -
                    new Date(b.reserved_at).getTime()
                )
                .map((r) => (
                  <ReservationRow
                    key={r.id}
                    reservation={r}
                    actionLoading={actionLoading}
                    onAction={onAction}
                  />
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Capacity settings panel ───────────────────────────────────────────────────

interface CapacityPanelProps {
  maxPartySize: string;
  dailySlots: string;
  onChangeMaxParty: (v: string) => void;
  onChangeDailySlots: (v: string) => void;
  onSave: () => void;
  saving: boolean;
}

function CapacityPanel({
  maxPartySize,
  dailySlots,
  onChangeMaxParty,
  onChangeDailySlots,
  onSave,
  saving,
}: CapacityPanelProps) {
  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "12px",
        padding: "20px 24px",
        marginBottom: "24px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "16px",
        }}
      >
        <IconSettings size={17} color="var(--db-accent)" />
        <h2
          style={{
            fontSize: "15px",
            fontWeight: 600,
            color: "var(--db-text-primary)",
          }}
        >
          Capacity Settings
        </h2>
        <span
          style={{
            fontSize: "11px",
            color: "var(--db-text-tertiary)",
            marginLeft: "4px",
          }}
        >
          {/* TODO(schema): persist to business_capacity table when added */}
          (session-only until schema column added)
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: "20px",
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--db-text-secondary)",
              marginBottom: "6px",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Max party size
          </label>
          <input
            type="number"
            min={1}
            value={maxPartySize}
            onChange={(e) => onChangeMaxParty(e.target.value)}
            style={{
              width: "120px",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--db-border)",
              background: "var(--db-bg-elevated)",
              color: "var(--db-text-primary)",
              fontSize: "14px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--db-text-secondary)",
              marginBottom: "6px",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Daily slots
          </label>
          <input
            type="number"
            min={1}
            value={dailySlots}
            onChange={(e) => onChangeDailySlots(e.target.value)}
            style={{
              width: "120px",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--db-border)",
              background: "var(--db-bg-elevated)",
              color: "var(--db-text-primary)",
              fontSize: "14px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            padding: "8px 18px",
            borderRadius: "8px",
            border: "none",
            background: saving ? "var(--db-text-tertiary)" : "var(--db-accent)",
            color: "var(--db-accent-text)",
            fontSize: "13px",
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {saving ? "Saved ✓" : "Save Capacity"}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type ViewMode = "calendar" | "list";
type FilterStatus = "all" | ReservationStatus;

export default function ReservationsPage() {
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [loadingBiz, setLoadingBiz] = useState(true);

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Capacity settings (local — TODO(schema): persist to DB)
  const [maxPartySize, setMaxPartySize] = useState("10");
  const [dailySlots, setDailySlots] = useState("20");
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [showCapacity, setShowCapacity] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Resolve business id ─────────────────────────────────────────────────────
  const resolveBusinessId = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoadingBiz(false);
      return;
    }
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoadingBiz(false);
        return;
      }
      const res = await resolveActiveBusiness();
      if (!res.ok) {
        setLoadingBiz(false);
        return;
      }
      setBusinessId(res.business.id);
    } catch {
      // business not found — keep null
    } finally {
      setLoadingBiz(false);
    }
  }, []);

  // ── Load reservations ───────────────────────────────────────────────────────
  const loadReservations = useCallback(
    async (bizId: string, silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        // Left-join profiles for guest display name
        const { data, error: err } = await supabase
          .from("reservations")
          .select(
            "*, profiles:user_id(display_name, username)"
          )
          .eq("business_id", bizId)
          .order("reserved_at", { ascending: true })
          .limit(200);
        if (err) throw err;
        setReservations((data as Reservation[]) ?? []);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Failed to load reservations: ${msg}`);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    void resolveBusinessId();
  }, [resolveBusinessId]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Demo mode — use static demo data
      setReservations(DEMO_RESERVATIONS);
      return;
    }
    if (!businessId) return;

    void loadReservations(businessId);

    // Realtime subscription — refresh on any change to this business's reservations
    channelRef.current = supabase
      .channel(`reservations-dashboard-${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reservations",
          filter: `business_id=eq.${businessId}`,
        },
        () => {
          void loadReservations(businessId, true);
        }
      )
      .subscribe();

    return () => {
      // Unsubscribe on unmount — required per architecture rules
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [businessId, loadReservations]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleAction = useCallback(
    async (id: string, action: "confirmed" | "rejected" | "no_show") => {
      setActionLoading(id);
      setError(null);
      setSuccess(null);

      if (!isSupabaseConfigured) {
        // Demo mode — mutate local state
        setReservations((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: action } : r))
        );
        const labels: Record<string, string> = {
          confirmed: "Reservation confirmed.",
          rejected: "Reservation rejected.",
          no_show: "Marked as no-show.",
        };
        setSuccess(labels[action] ?? "Done.");
        setActionLoading(null);
        return;
      }

      try {
        const { error: err } = await supabase
          .from("reservations")
          .update({ status: action })
          .eq("id", id);
        if (err) throw err;

        // TODO(server): trigger push notification to customer on confirm/reject
        //               via Edge Function or server-side job.
        // TODO(server): if action === 'confirmed' and is_waitlist, send waitlist
        //               promotion notification to the user.

        const labels: Record<string, string> = {
          confirmed: "Reservation confirmed.",
          rejected: "Reservation rejected.",
          no_show: "Marked as no-show.",
        };
        setSuccess(labels[action] ?? "Done.");

        // Optimistic update while Realtime catches up
        setReservations((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: action } : r))
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Action failed: ${msg}`);
      } finally {
        setActionLoading(null);
      }
    },
    []
  );

  // ── Capacity save (stub) ───────────────────────────────────────────────────
  const handleSaveCapacity = useCallback(() => {
    setSavingCapacity(true);
    // TODO(schema): persist maxPartySize + dailySlots to a capacity settings
    //               table or column (e.g. businesses.max_party_size, businesses.daily_slots)
    //               once the schema supports it.
    setTimeout(() => setSavingCapacity(false), 800);
  }, []);

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered =
    filterStatus === "all"
      ? reservations
      : reservations.filter((r) => r.status === filterStatus);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const pendingCount = reservations.filter((r) => r.status === "pending").length;
  const confirmedCount = reservations.filter(
    (r) => r.status === "confirmed"
  ).length;
  const waitlistCount = reservations.filter((r) => r.is_waitlist).length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900 }}>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "24px",
          flexWrap: "wrap",
          gap: "12px",
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
            Reservations
          </h1>
          <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
            Manage table bookings, confirm or reject requests, and track your waitlist.
            {/* TODO(server): push notification sent on status change — see Edge Functions */}
            {/* TODO(server): scheduled reminders 24h + 2h before reserved_at */}
          </p>
        </div>

        {/* Toolbar */}
        <div
          style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}
        >
          {/* Capacity toggle */}
          <button
            onClick={() => setShowCapacity((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "7px 14px",
              borderRadius: "8px",
              border: showCapacity
                ? "1px solid var(--db-accent)"
                : "1px solid var(--db-border)",
              background: showCapacity ? "var(--db-accent-bg)" : "transparent",
              color: showCapacity
                ? "var(--db-accent)"
                : "var(--db-text-secondary)",
              fontSize: "13px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <IconSettings size={15} />
            Capacity
          </button>

          {/* Refresh */}
          {isSupabaseConfigured && businessId && (
            <button
              onClick={() => void loadReservations(businessId)}
              disabled={loading}
              title="Refresh reservations"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "7px 12px",
                borderRadius: "8px",
                border: "1px solid var(--db-border)",
                background: "transparent",
                color: "var(--db-text-secondary)",
                fontSize: "13px",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              <IconRefresh size={15} />
            </button>
          )}

          {/* View toggle */}
          <div
            style={{
              display: "flex",
              borderRadius: "8px",
              border: "1px solid var(--db-border)",
              overflow: "hidden",
            }}
          >
            {(
              [
                { mode: "calendar", icon: <IconCalendarEvent size={15} />, label: "Calendar" },
                { mode: "list", icon: <IconList size={15} />, label: "List" },
              ] as const
            ).map(({ mode, icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "7px 13px",
                  border: "none",
                  background:
                    viewMode === mode
                      ? "var(--db-accent)"
                      : "transparent",
                  color:
                    viewMode === mode
                      ? "var(--db-accent-text)"
                      : "var(--db-text-secondary)",
                  fontSize: "13px",
                  cursor: "pointer",
                  fontWeight: viewMode === mode ? 600 : 400,
                }}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        {[
          { label: "Pending", value: pendingCount, color: "var(--db-warning)" },
          {
            label: "Confirmed",
            value: confirmedCount,
            color: "var(--db-success)",
          },
          { label: "Waitlist", value: waitlistCount, color: "var(--db-brand-purple, #7C3AED)" },
          { label: "Total", value: reservations.length, color: "var(--db-accent)" },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: "var(--db-bg-surface)",
              border: "1px solid var(--db-border)",
              borderRadius: "10px",
              padding: "14px 20px",
              minWidth: "100px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "22px",
                fontWeight: 700,
                color: stat.color,
                lineHeight: 1,
                marginBottom: "4px",
              }}
            >
              {stat.value}
            </div>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--db-text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {error && <AlertBanner type="error" message={error} />}
      {success && <AlertBanner type="success" message={success} />}

      {/* Demo mode notice */}
      {!isSupabaseConfigured && (
        <AlertBanner
          type="warning"
          message="Demo mode — Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for live data."
        />
      )}

      {/* Business not found */}
      {!loadingBiz && isSupabaseConfigured && !businessId && (
        <NoBusinessCTA message="Register your business to manage reservations." />
      )}

      {/* Capacity settings panel */}
      {showCapacity && (
        <CapacityPanel
          maxPartySize={maxPartySize}
          dailySlots={dailySlots}
          onChangeMaxParty={setMaxPartySize}
          onChangeDailySlots={setDailySlots}
          onSave={handleSaveCapacity}
          saving={savingCapacity}
        />
      )}

      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        {(
          [
            { key: "all", label: "All" },
            { key: "pending", label: "Pending" },
            { key: "confirmed", label: "Confirmed" },
            { key: "rejected", label: "Rejected" },
            { key: "no_show", label: "No-show" },
          ] as { key: FilterStatus; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilterStatus(key)}
            style={{
              padding: "6px 14px",
              borderRadius: "999px",
              border: "1px solid",
              borderColor:
                filterStatus === key ? "var(--db-accent)" : "var(--db-border)",
              background:
                filterStatus === key ? "var(--db-accent-bg)" : "transparent",
              color:
                filterStatus === key
                  ? "var(--db-accent)"
                  : "var(--db-text-secondary)",
              fontSize: "13px",
              fontWeight: filterStatus === key ? 600 : 400,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && reservations.length === 0 ? (
        <div
          style={{
            padding: "60px 20px",
            textAlign: "center",
            color: "var(--db-text-tertiary)",
            fontSize: "14px",
          }}
        >
          Loading reservations…
        </div>
      ) : viewMode === "calendar" ? (
        <CalendarView
          reservations={filtered}
          actionLoading={actionLoading}
          onAction={handleAction}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filtered.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "60px 20px",
                color: "var(--db-text-tertiary)",
                gap: "12px",
              }}
            >
              <IconCalendarEvent size={40} />
              <p style={{ fontSize: "15px", color: "var(--db-text-secondary)" }}>
                No reservations match this filter
              </p>
            </div>
          ) : (
            filtered.map((r) => (
              <ReservationRow
                key={r.id}
                reservation={r}
                actionLoading={actionLoading}
                onAction={handleAction}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
