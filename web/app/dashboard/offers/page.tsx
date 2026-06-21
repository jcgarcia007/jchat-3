/**
 * JChat 3.0 — Offers & Promotions Builder (Dashboard) · Task 3.16
 *
 * Advanced offer builder — more capable than the in-chat quick offer (Task 2.6).
 *
 * Features:
 *  1. Offer types: Happy Hour, Bundle, Flash Sale, BOGO, Discount Code.
 *     Discount Code type exposes the `code` field.
 *  2. Scheduling: start_at + expires_at date/time pickers.
 *     If start_at is in the future → status='scheduled'.
 *     If start_at is now/past and active → status='active'.
 *  3. Targeting: all users in chat / verified users only / new users first visit.
 *  4. Active offers list: name, type, status badge, redemption count.
 *  5. Pause/resume toggle: active ↔ paused.
 *  6. Analytics per offer: views, taps on "Order now", conversions (redemption_count).
 *  7. Auto-publish to chat: when an offer is created as 'active', a message is
 *     inserted into `messages` (type='offer', is_system=false) so an OfferCard
 *     appears in the chat timeline.
 *     For scheduled offers: // TODO(cron): publish message at start_at via
 *     an Edge Function / pg_cron job (see supabase/functions/offers-scheduler/).
 *
 * Design: var(--db-*) tokens only. No hardcoded hex.
 * Guard: isSupabaseConfigured before any live DB call; demo data otherwise.
 * Icons: @tabler/icons-react only.
 * "use client" — hooks + form state throughout.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  IconAlertCircle,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconEye,
  IconGift,
  IconHash,
  IconPercentage,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconShoppingCart,
  IconTag,
  IconTargetArrow,
  IconUsers,
  IconX,
  IconBolt,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";

// ── Types ─────────────────────────────────────────────────────────────────────

type OfferType =
  | "happy_hour"
  | "bundle"
  | "flash_sale"
  | "bogo"
  | "discount_code";

type OfferStatus = "active" | "paused" | "scheduled" | "ended";

type OfferTargeting = "all" | "verified" | "new";

interface Offer {
  id: string;
  business_id: string;
  room_id: string | null;
  title: string;
  discount: string | null;
  description: string | null;
  type: string | null;
  min_purchase_cents: number | null;
  created_by: string | null;
  expires_at: string | null;
  start_at: string | null;
  status: OfferStatus;
  targeting: OfferTargeting;
  redemption_count: number;
  views: number;
  taps: number;
  code: string | null;
  created_at: string;
}

interface CreateOfferForm {
  title: string;
  offerType: OfferType;
  discount: string;
  description: string;
  minPurchase: string;
  code: string;
  targeting: OfferTargeting;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

interface Room {
  id: string;
  name: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OFFER_TYPES: { value: OfferType; label: string; icon: React.ReactNode; hint: string }[] = [
  {
    value: "happy_hour",
    label: "Happy Hour",
    icon: <IconClock size={18} />,
    hint: "Time-limited discount during specific hours",
  },
  {
    value: "bundle",
    label: "Bundle",
    icon: <IconShoppingCart size={18} />,
    hint: "Discount when buying multiple items together",
  },
  {
    value: "flash_sale",
    label: "Flash Sale",
    icon: <IconBolt size={18} />,
    hint: "Short-term deep discount with urgency",
  },
  {
    value: "bogo",
    label: "BOGO",
    icon: <IconGift size={18} />,
    hint: "Buy one, get one free or discounted",
  },
  {
    value: "discount_code",
    label: "Discount Code",
    icon: <IconHash size={18} />,
    hint: "Redeemable promo code with a custom code string",
  },
];

const TARGETING_OPTIONS: { value: OfferTargeting; label: string; description: string }[] = [
  { value: "all", label: "All users in chat", description: "Everyone currently in the room" },
  { value: "verified", label: "Verified users only", description: "Users who have completed verification" },
  { value: "new", label: "New users — first visit", description: "First-time visitors to this venue" },
];

const EMPTY_FORM: CreateOfferForm = {
  title: "",
  offerType: "happy_hour",
  discount: "",
  description: "",
  minPurchase: "",
  code: "",
  targeting: "all",
  startDate: "",
  startTime: "",
  endDate: "",
  endTime: "",
};

// ── Demo data (when Supabase is not configured) ───────────────────────────────

const DEMO_OFFERS: Offer[] = [
  {
    id: "demo-1",
    business_id: "demo-biz",
    room_id: null,
    title: "Happy Hour 2-for-1 Drinks",
    discount: "50%",
    description: "Every Tuesday and Thursday 5–7 PM",
    type: "happy_hour",
    min_purchase_cents: null,
    created_by: null,
    expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    start_at: null,
    status: "active",
    targeting: "all",
    redemption_count: 42,
    views: 310,
    taps: 89,
    code: null,
    created_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: "demo-2",
    business_id: "demo-biz",
    room_id: null,
    title: "Weekend Bundle Deal",
    discount: "$10 off",
    description: "Get any 3 items from our menu for $10 off",
    type: "bundle",
    min_purchase_cents: 3000,
    created_by: null,
    expires_at: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
    start_at: new Date(Date.now() + 1 * 24 * 3600 * 1000).toISOString(),
    status: "scheduled",
    targeting: "verified",
    redemption_count: 0,
    views: 0,
    taps: 0,
    code: null,
    created_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
  },
  {
    id: "demo-3",
    business_id: "demo-biz",
    room_id: null,
    title: "Flash Sale — 30% Off Everything",
    discount: "30%",
    description: "One hour only — grab it before it's gone!",
    type: "flash_sale",
    min_purchase_cents: null,
    created_by: null,
    expires_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    start_at: null,
    status: "ended",
    targeting: "all",
    redemption_count: 128,
    views: 2400,
    taps: 410,
    code: null,
    created_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: "demo-4",
    business_id: "demo-biz",
    room_id: null,
    title: "New User Welcome Code",
    discount: "15%",
    description: "First visit discount for new customers",
    type: "discount_code",
    min_purchase_cents: 1000,
    created_by: null,
    expires_at: null,
    start_at: null,
    status: "paused",
    targeting: "new",
    redemption_count: 17,
    views: 95,
    taps: 28,
    code: "WELCOME15",
    created_at: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function combineDatetime(date: string, time: string): string | null {
  if (!date) return null;
  return `${date}T${time || "00:00"}:00`;
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function offerTypeLabel(type: string | null): string {
  const found = OFFER_TYPES.find((t) => t.value === type);
  return found?.label ?? (type ?? "—");
}

function targetingLabel(t: OfferTargeting): string {
  return TARGETING_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

function computeStatus(startAt: string | null, currentStatus: OfferStatus): OfferStatus {
  // If manually paused or ended, respect that
  if (currentStatus === "paused" || currentStatus === "ended") return currentStatus;
  if (startAt && new Date(startAt) > new Date()) return "scheduled";
  return "active";
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function statusStyle(status: OfferStatus): React.CSSProperties {
  const map: Record<OfferStatus, { bg: string; color: string }> = {
    active: { bg: "rgba(29,158,117,0.15)", color: "var(--db-success)" },
    paused: { bg: "rgba(245,158,11,0.15)", color: "var(--db-warning)" },
    scheduled: { bg: "var(--db-accent-bg)", color: "var(--db-accent)" },
    ended: { bg: "rgba(239,68,68,0.12)", color: "var(--db-danger)" },
  };
  const s = map[status] ?? map.ended;
  return {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
    background: s.bg,
    color: s.color,
  };
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

function FieldInput({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: "8px",
        border: "1px solid var(--db-border)",
        background: disabled ? "var(--db-bg-base)" : "var(--db-bg-elevated)",
        color: "var(--db-text-primary)",
        fontSize: "14px",
        outline: "none",
        boxSizing: "border-box",
        opacity: disabled ? 0.5 : 1,
      }}
    />
  );
}

function StatBadge({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "5px",
        padding: "4px 10px",
        borderRadius: "6px",
        background: "var(--db-bg-base)",
        border: "1px solid var(--db-border)",
        fontSize: "12px",
        color: "var(--db-text-secondary)",
      }}
      title={label}
    >
      <span style={{ color: "var(--db-text-tertiary)" }}>{icon}</span>
      <span style={{ fontWeight: 600, color: "var(--db-text-primary)" }}>
        {value.toLocaleString()}
      </span>
      <span>{label}</span>
    </div>
  );
}

// ── OfferRow ──────────────────────────────────────────────────────────────────

function OfferRow({
  offer,
  toggling,
  onToggle,
}: {
  offer: Offer;
  toggling: boolean;
  onToggle: (offer: Offer) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const canToggle = offer.status === "active" || offer.status === "paused";

  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "10px",
        overflow: "hidden",
      }}
    >
      {/* Row header */}
      <div
        style={{
          padding: "16px 20px",
          display: "flex",
          alignItems: "flex-start",
          gap: "14px",
        }}
      >
        {/* Type icon */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "8px",
            background: "var(--db-accent-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: "var(--db-accent)",
          }}
        >
          {OFFER_TYPES.find((t) => t.value === offer.type)?.icon ?? <IconTag size={18} />}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
              marginBottom: "4px",
            }}
          >
            <span
              style={{
                fontSize: "15px",
                fontWeight: 600,
                color: "var(--db-text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {offer.title}
            </span>
            <span style={statusStyle(offer.status)}>{offer.status}</span>
            {offer.discount && (
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "6px",
                  background: "var(--db-bg-elevated)",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--db-text-primary)",
                }}
              >
                {offer.discount}
              </span>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
              fontSize: "12px",
              color: "var(--db-text-tertiary)",
            }}
          >
            <span>{offerTypeLabel(offer.type)}</span>
            {offer.targeting !== "all" && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                }}
              >
                <IconTargetArrow size={11} />
                {targetingLabel(offer.targeting)}
              </span>
            )}
            {offer.expires_at && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                }}
              >
                <IconClock size={11} />
                Expires {formatDateShort(offer.expires_at)}
              </span>
            )}
            {offer.start_at && offer.status === "scheduled" && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                }}
              >
                <IconClock size={11} />
                Starts {formatDateShort(offer.start_at)}
              </span>
            )}
            {offer.code && (
              <span
                style={{
                  fontFamily: "monospace",
                  background: "var(--db-bg-elevated)",
                  padding: "1px 6px",
                  borderRadius: "4px",
                  color: "var(--db-accent)",
                }}
              >
                {offer.code}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {/* Pause / Resume */}
          {canToggle && (
            <button
              onClick={() => onToggle(offer)}
              disabled={toggling}
              title={offer.status === "active" ? "Pause offer" : "Resume offer"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "6px 12px",
                borderRadius: "7px",
                border: "1px solid var(--db-border)",
                background: "transparent",
                color:
                  offer.status === "active"
                    ? "var(--db-warning)"
                    : "var(--db-success)",
                fontSize: "12px",
                fontWeight: 600,
                cursor: toggling ? "not-allowed" : "pointer",
                opacity: toggling ? 0.5 : 1,
              }}
            >
              {offer.status === "active" ? (
                <IconPlayerPause size={13} />
              ) : (
                <IconPlayerPlay size={13} />
              )}
              {offer.status === "active" ? "Pause" : "Resume"}
            </button>
          )}

          {/* Expand analytics */}
          <button
            onClick={() => setExpanded((v) => !v)}
            title="Toggle analytics"
            style={{
              display: "flex",
              alignItems: "center",
              padding: "6px",
              borderRadius: "7px",
              border: "1px solid var(--db-border)",
              background: "transparent",
              color: "var(--db-text-tertiary)",
              cursor: "pointer",
            }}
          >
            {expanded ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}
          </button>
        </div>
      </div>

      {/* Analytics panel */}
      {expanded && (
        <div
          style={{
            borderTop: "1px solid var(--db-border)",
            padding: "14px 20px",
            background: "var(--db-bg-base)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "var(--db-text-tertiary)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Analytics
          </span>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <StatBadge icon={<IconEye size={12} />} label="views" value={offer.views} />
            <StatBadge
              icon={<IconTargetArrow size={12} />}
              label="taps (Order now)"
              value={offer.taps}
            />
            <StatBadge
              icon={<IconCheck size={12} />}
              label="conversions"
              value={offer.redemption_count}
            />
          </div>

          {/* Conversion rate */}
          {offer.views > 0 && (
            <span
              style={{
                fontSize: "12px",
                color: "var(--db-text-tertiary)",
              }}
            >
              Tap rate:{" "}
              <strong style={{ color: "var(--db-text-secondary)" }}>
                {((offer.taps / offer.views) * 100).toFixed(1)}%
              </strong>{" "}
              &nbsp;|&nbsp; Conversion rate:{" "}
              <strong style={{ color: "var(--db-text-secondary)" }}>
                {((offer.redemption_count / offer.views) * 100).toFixed(1)}%
              </strong>
            </span>
          )}

          {offer.description && (
            <p
              style={{
                fontSize: "13px",
                color: "var(--db-text-secondary)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {offer.description}
            </p>
          )}

          {offer.min_purchase_cents != null && (
            <span style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>
              Min. purchase:{" "}
              <strong style={{ color: "var(--db-text-secondary)" }}>
                ${(offer.min_purchase_cents / 100).toFixed(2)}
              </strong>
            </span>
          )}

          {offer.status === "scheduled" && (
            <p
              style={{
                fontSize: "12px",
                color: "var(--db-text-tertiary)",
                margin: 0,
                fontStyle: "italic",
              }}
            >
              {/* TODO(cron): an Edge Function / pg_cron job publishes the offer
                   message to chat at start_at. See supabase/functions/offers-scheduler/.
                   Until that lands, the offer will appear in chat only when manually
                   set active from this dashboard. */}
              Scheduled offer: will auto-publish to chat at start time via server cron
              (see supabase/functions/offers-scheduler/ — TODO).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateOfferForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");

  // ── Load offers ─────────────────────────────────────────────────────────────
  const loadOffers = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setOffers(DEMO_OFFERS);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("offers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (err) throw err;
      setOffers((data as Offer[]) ?? []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to load offers: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load rooms (for targeting a specific room) ───────────────────────────────
  const loadRooms = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      // Shared resolver: tolerant of multiple businesses per owner.
      const res = await resolveActiveBusiness();
      if (!res.ok) return;

      const { data, error: err } = await supabase
        .from("rooms")
        .select("id, name")
        .eq("business_id", res.business.id)
        .eq("is_active", true)
        .order("sort");
      if (err) throw err;
      setRooms((data as Room[]) ?? []);
      if (data && data.length > 0) {
        setSelectedRoomId((data[0] as Room).id);
      }
    } catch {
      // Non-fatal: rooms list is optional
    }
  }, []);

  useEffect(() => {
    void loadOffers();
    void loadRooms();
  }, [loadOffers, loadRooms]);

  // ── Auto-publish offer to chat ───────────────────────────────────────────────
  /**
   * Inserts an 'offer' message into the messages table so an OfferCard appears
   * in the chat timeline for the linked room.
   * Called immediately when an offer becomes active (start_at is null or past).
   *
   * TODO(cron): For scheduled offers, this call should happen at start_at via
   * an Edge Function triggered by pg_cron. See supabase/functions/offers-scheduler/
   * (not yet implemented). Until that ships, scheduled offers need to be manually
   * activated from this dashboard to push the message.
   */
  const publishOfferToChat = useCallback(
    async (
      offerId: string,
      roomId: string,
      userId: string,
      businessId: string,
      fields: {
        title: string;
        discount: string | null;
        description: string | null;
        expires_at: string | null;
        offer_type: string;
        min_purchase_cents: number | null;
      }
    ) => {
      const { error: msgErr } = await supabase.from("messages").insert({
        room_id: roomId,
        user_id: userId,
        body: fields.title,
        type: "offer",
        is_system: false,
        metadata: {
          offer_id: offerId,
          title: fields.title,
          discount: fields.discount,
          description: fields.description,
          expires_at: fields.expires_at,
          offer_type: fields.offer_type,
          min_purchase_cents: fields.min_purchase_cents,
          created_by: userId,
          business_id: businessId,
        },
      });
      if (msgErr) {
        // Non-fatal: log but don't block the offer creation
        console.warn("[OffersPage] Auto-publish to chat failed:", msgErr.message);
      }
    },
    []
  );

  // ── Create offer ─────────────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    setError(null);
    setSuccess(null);

    if (!form.title.trim()) {
      setError("Offer title is required.");
      return;
    }
    if (!isSupabaseConfigured) {
      setError(
        "Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
      return;
    }

    setCreating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated.");

      // Shared resolver: tolerant of multiple businesses per owner.
      const res = await resolveActiveBusiness();
      if (!res.ok) throw new Error(res.message);

      const businessId: string = res.business.id;

      const startAt = combineDatetime(form.startDate, form.startTime);
      const expiresAt = combineDatetime(form.endDate, form.endTime);
      const minCents =
        form.minPurchase.trim()
          ? Math.round(parseFloat(form.minPurchase) * 100)
          : null;

      // Determine initial status
      const status: OfferStatus =
        startAt && new Date(startAt) > new Date() ? "scheduled" : "active";

      const roomId = selectedRoomId || null;

      const { data: newOffer, error: offerErr } = await supabase
        .from("offers")
        .insert({
          business_id: businessId,
          room_id: roomId,
          title: form.title.trim(),
          discount: form.discount.trim() || null,
          description: form.description.trim() || null,
          type: form.offerType,
          min_purchase_cents: minCents,
          code:
            form.offerType === "discount_code" && form.code.trim()
              ? form.code.trim().toUpperCase()
              : null,
          targeting: form.targeting,
          start_at: startAt,
          expires_at: expiresAt,
          status,
          created_by: user.id,
          redemption_count: 0,
          views: 0,
          taps: 0,
        })
        .select()
        .single();

      if (offerErr || !newOffer) throw offerErr ?? new Error("Offer insert failed.");

      const offerId: string = (newOffer as Offer).id;

      // Auto-publish to chat if immediately active and a room is selected
      if (status === "active" && roomId) {
        await publishOfferToChat(offerId, roomId, user.id, businessId, {
          title: form.title.trim(),
          discount: form.discount.trim() || null,
          description: form.description.trim() || null,
          expires_at: expiresAt,
          offer_type: form.offerType,
          min_purchase_cents: minCents,
        });
      }

      // For scheduled offers, the message will be published by a cron job at start_at.
      // TODO(cron): trigger supabase/functions/offers-scheduler/ at start_at to call
      // publishOfferToChat server-side. Until that lands, the owner must manually
      // activate the scheduled offer from this dashboard to push the chat message.

      setSuccess(
        status === "scheduled"
          ? `Offer "${form.title.trim()}" scheduled for ${startAt ? formatDateShort(startAt) : "future"}.`
          : `Offer "${form.title.trim()}" published${roomId ? " to chat" : ""}.`
      );
      setForm(EMPTY_FORM);
      setShowForm(false);
      await loadOffers();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Create failed: ${msg}`);
    } finally {
      setCreating(false);
    }
  }, [form, selectedRoomId, publishOfferToChat, loadOffers]);

  // ── Pause / Resume toggle ────────────────────────────────────────────────────
  const handleToggle = useCallback(
    async (offer: Offer) => {
      if (!isSupabaseConfigured) {
        // Demo mode: toggle in local state
        setOffers((prev) =>
          prev.map((o) =>
            o.id === offer.id
              ? { ...o, status: o.status === "active" ? "paused" : "active" }
              : o
          )
        );
        return;
      }

      setToggling(offer.id);
      setError(null);
      try {
        const newStatus: OfferStatus = offer.status === "active" ? "paused" : "active";
        const { error: err } = await supabase
          .from("offers")
          .update({ status: newStatus })
          .eq("id", offer.id);
        if (err) throw err;

        // If resuming a scheduled offer as active + it has a room, publish to chat
        if (
          newStatus === "active" &&
          offer.room_id &&
          isSupabaseConfigured
        ) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            // Shared resolver: tolerant of multiple businesses per owner.
            const res = await resolveActiveBusiness();
            if (res.ok) {
              await publishOfferToChat(offer.id, offer.room_id, user.id, res.business.id, {
                title: offer.title,
                discount: offer.discount,
                description: offer.description,
                expires_at: offer.expires_at,
                offer_type: offer.type ?? "happy_hour",
                min_purchase_cents: offer.min_purchase_cents,
              });
            }
          }
        }

        await loadOffers();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Toggle failed: ${msg}`);
      } finally {
        setToggling(null);
      }
    },
    [publishOfferToChat, loadOffers]
  );

  // ── Form field helper ────────────────────────────────────────────────────────
  const setField = <K extends keyof CreateOfferForm>(
    key: K,
    value: CreateOfferForm[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  // ── Computed stats ───────────────────────────────────────────────────────────
  const activeCount = offers.filter((o) => o.status === "active").length;
  const scheduledCount = offers.filter((o) => o.status === "scheduled").length;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "24px",
          gap: "16px",
          flexWrap: "wrap",
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
            Offers &amp; Promotions
          </h1>
          <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
            Build and schedule promotional offers — they auto-publish as OfferCards
            in the chat room when they go live.
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
              padding: "9px 18px",
              borderRadius: "8px",
              border: "none",
              background: "var(--db-accent)",
              color: "var(--db-accent-text)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            <IconPlus size={16} />
            New Offer
          </button>
        )}
      </div>

      {/* Summary cards */}
      {offers.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: "12px",
            marginBottom: "24px",
          }}
        >
          {[
            { label: "Total", value: offers.length, color: "var(--db-text-primary)" },
            { label: "Active", value: activeCount, color: "var(--db-success)" },
            { label: "Scheduled", value: scheduledCount, color: "var(--db-accent)" },
            {
              label: "Redemptions",
              value: offers.reduce((s, o) => s + o.redemption_count, 0),
              color: "var(--db-warning)",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                background: "var(--db-bg-surface)",
                border: "1px solid var(--db-border)",
                borderRadius: "10px",
                padding: "14px 16px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: stat.color,
                  lineHeight: 1,
                  marginBottom: "4px",
                }}
              >
                {stat.value.toLocaleString()}
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--db-text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Demo mode banner */}
      {!isSupabaseConfigured && (
        <div
          style={{
            padding: "12px 16px",
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
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit" }}
          >
            <IconX size={14} />
          </button>
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
            background: "rgba(29,158,117,0.12)",
            color: "var(--db-success)",
            fontSize: "14px",
            marginBottom: "16px",
          }}
        >
          <IconCheck size={16} />
          {success}
          <button
            onClick={() => setSuccess(null)}
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit" }}
          >
            <IconX size={14} />
          </button>
        </div>
      )}

      {/* ── Create Form ───────────────────────────────────────────────────────── */}
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
          {/* Form header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "24px",
            }}
          >
            <h2
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--db-text-primary)",
              }}
            >
              New Offer
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

          {/* Offer type selector */}
          <div style={{ marginBottom: "20px" }}>
            <Label>Offer type *</Label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: "10px",
              }}
            >
              {OFFER_TYPES.map((t) => {
                const selected = form.offerType === t.value;
                return (
                  <button
                    key={t.value}
                    onClick={() => setField("offerType", t.value)}
                    title={t.hint}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "6px",
                      padding: "12px 8px",
                      borderRadius: "10px",
                      border: selected
                        ? "2px solid var(--db-accent)"
                        : "1px solid var(--db-border)",
                      background: selected
                        ? "var(--db-accent-bg)"
                        : "var(--db-bg-elevated)",
                      color: selected ? "var(--db-accent)" : "var(--db-text-secondary)",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: selected ? 700 : 500,
                      textAlign: "center",
                      transition: "border-color 0.15s",
                    }}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                );
              })}
            </div>
            <p
              style={{
                fontSize: "12px",
                color: "var(--db-text-tertiary)",
                marginTop: "6px",
              }}
            >
              {OFFER_TYPES.find((t) => t.value === form.offerType)?.hint}
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
            }}
          >
            {/* Title */}
            <div style={{ gridColumn: "1 / -1" }}>
              <Label>Offer title *</Label>
              <FieldInput
                value={form.title}
                onChange={(v) => setField("title", v)}
                placeholder='e.g. "Happy Hour — 2-for-1 cocktails"'
              />
            </div>

            {/* Discount */}
            <div>
              <Label>
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <IconPercentage size={12} />
                  Discount value
                </span>
              </Label>
              <FieldInput
                value={form.discount}
                onChange={(v) => setField("discount", v)}
                placeholder='e.g. "20%" or "$5 off"'
              />
            </div>

            {/* Min purchase */}
            <div>
              <Label>Min. purchase ($)</Label>
              <FieldInput
                value={form.minPurchase}
                onChange={(v) => setField("minPurchase", v)}
                type="number"
                placeholder="0.00 (leave blank for none)"
              />
            </div>

            {/* Discount code field — only when type is discount_code */}
            {form.offerType === "discount_code" && (
              <div style={{ gridColumn: "1 / -1" }}>
                <Label>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <IconHash size={12} />
                    Promo code *
                  </span>
                </Label>
                <FieldInput
                  value={form.code}
                  onChange={(v) => setField("code", v.toUpperCase())}
                  placeholder="e.g. SAVE20"
                />
                <p
                  style={{
                    fontSize: "11px",
                    color: "var(--db-text-tertiary)",
                    marginTop: "4px",
                  }}
                >
                  Stored in <code>offers.code</code>. Displayed in the OfferCard
                  so customers can quote it at the counter.
                </p>
              </div>
            )}

            {/* Description */}
            <div style={{ gridColumn: "1 / -1" }}>
              <Label>Description</Label>
              <textarea
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="Tell customers what's included…"
                rows={2}
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

            {/* Targeting */}
            <div style={{ gridColumn: "1 / -1" }}>
              <Label>
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <IconTargetArrow size={12} />
                  Targeting
                </span>
              </Label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {TARGETING_OPTIONS.map((opt) => {
                  const sel = form.targeting === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setField("targeting", opt.value)}
                      title={opt.description}
                      style={{
                        padding: "7px 14px",
                        borderRadius: "8px",
                        border: sel
                          ? "2px solid var(--db-accent)"
                          : "1px solid var(--db-border)",
                        background: sel
                          ? "var(--db-accent-bg)"
                          : "var(--db-bg-elevated)",
                        color: sel
                          ? "var(--db-accent)"
                          : "var(--db-text-secondary)",
                        fontSize: "13px",
                        fontWeight: sel ? 600 : 400,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      {opt.value === "all" && <IconUsers size={13} />}
                      {opt.value === "verified" && <IconCheck size={13} />}
                      {opt.value === "new" && <IconBolt size={13} />}
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--db-text-tertiary)",
                  marginTop: "6px",
                }}
              >
                {TARGETING_OPTIONS.find((o) => o.value === form.targeting)?.description}
              </p>
            </div>

            {/* Room selector */}
            {rooms.length > 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <Label>Publish to chat room</Label>
                <select
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--db-border)",
                    background: "var(--db-bg-elevated)",
                    color: "var(--db-text-primary)",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="">— Select a room (optional) —</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <p
                  style={{
                    fontSize: "11px",
                    color: "var(--db-text-tertiary)",
                    marginTop: "4px",
                  }}
                >
                  When active, an OfferCard message is auto-inserted into this room.
                </p>
              </div>
            )}

            {/* Scheduling */}
            <div>
              <Label>
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <IconClock size={12} />
                  Start date (optional)
                </span>
              </Label>
              <FieldInput
                type="date"
                value={form.startDate}
                onChange={(v) => setField("startDate", v)}
              />
            </div>
            <div>
              <Label>Start time</Label>
              <FieldInput
                type="time"
                value={form.startTime}
                onChange={(v) => setField("startTime", v)}
                disabled={!form.startDate}
              />
            </div>

            <div>
              <Label>End date (expires_at)</Label>
              <FieldInput
                type="date"
                value={form.endDate}
                onChange={(v) => setField("endDate", v)}
              />
            </div>
            <div>
              <Label>End time</Label>
              <FieldInput
                type="time"
                value={form.endTime}
                onChange={(v) => setField("endTime", v)}
                disabled={!form.endDate}
              />
            </div>

            {/* Scheduling note */}
            {form.startDate && (
              <div
                style={{
                  gridColumn: "1 / -1",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  background: "var(--db-accent-bg)",
                  fontSize: "13px",
                  color: "var(--db-accent)",
                  lineHeight: 1.5,
                }}
              >
                {combineDatetime(form.startDate, form.startTime) &&
                new Date(combineDatetime(form.startDate, form.startTime)!) > new Date() ? (
                  <>
                    <strong>Scheduled offer:</strong> status will be set to{" "}
                    <em>scheduled</em>. The OfferCard will be published to chat
                    automatically at start time via server cron.
                    <br />
                    {/* TODO(cron): implement supabase/functions/offers-scheduler/ to call
                         publishOfferToChat at start_at. Until then, the owner must manually
                         resume the offer from this dashboard to trigger the chat message. */}
                    <span style={{ color: "var(--db-text-tertiary)", fontSize: "11px" }}>
                      TODO(cron): supabase/functions/offers-scheduler/ not yet deployed —
                      manual activation needed until then.
                    </span>
                  </>
                ) : (
                  <>
                    <strong>Immediate:</strong> start date is in the past or now —
                    offer will be created as <em>active</em>.
                  </>
                )}
              </div>
            )}
          </div>

          {/* Form actions */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "24px",
            }}
          >
            <button
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY_FORM);
                setError(null);
              }}
              style={{
                padding: "9px 18px",
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
                padding: "9px 20px",
                borderRadius: "8px",
                border: "none",
                background: creating ? "var(--db-text-tertiary)" : "var(--db-accent)",
                color: "var(--db-accent-text)",
                fontSize: "14px",
                fontWeight: 600,
                cursor: creating ? "not-allowed" : "pointer",
              }}
            >
              <IconPlus size={15} />
              {creating ? "Publishing…" : "Create Offer"}
            </button>
          </div>
        </div>
      )}

      {/* ── Offers list ───────────────────────────────────────────────────────── */}
      <div>
        <h2
          style={{
            fontSize: "13px",
            fontWeight: 700,
            color: "var(--db-text-tertiary)",
            marginBottom: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {loading
            ? "Loading…"
            : offers.length === 0
            ? "No offers yet"
            : `${offers.length} offer${offers.length === 1 ? "" : "s"}`}
        </h2>

        {offers.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {offers.map((offer) => (
              <OfferRow
                key={offer.id}
                offer={offer}
                toggling={toggling === offer.id}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}

        {!loading && offers.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "var(--db-text-tertiary)",
              background: "var(--db-bg-surface)",
              borderRadius: "12px",
              border: "1px dashed var(--db-border)",
            }}
          >
            <IconTag size={36} style={{ opacity: 0.3, marginBottom: "12px" }} />
            <p style={{ fontSize: "14px" }}>
              No offers yet. Create your first promotion above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
