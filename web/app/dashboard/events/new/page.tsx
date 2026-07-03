"use client";

/**
 * JChat 3.0 — Dedicated Event Creation Wizard (/dashboard/events/new)
 * 4 steps: Info → Date & Time → Location → Cover Photo
 * On finish: inserts an `events` row + a dedicated chat `rooms` row with
 *            ttl_hours = time until the event ends (room auto-closes after).
 * Modeled on the /business/register wizard. Uses dashboard --db-* tokens.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconCalendarEvent,
  IconClock,
  IconMapPin,
  IconPhoto,
  IconMoodSmile,
  IconUpload,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconAlertCircle,
  IconMail,
  IconArrowLeft,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getUsageAndLimits, type UsageAndLimits } from "@/lib/planLimits";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BusinessOpt {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
}

interface EventData {
  business_id: string;
  name: string;
  description: string;
  category: string;
  icon_emoji: string;
  starts_at: string; // datetime-local
  ends_at: string; // datetime-local
  timezone: string;
  location_mode: "business" | "custom";
  lat: string;
  lng: string;
  cover_url: string;
}

const CATEGORIES = [
  "Party",
  "Live Music",
  "Happy Hour",
  "DJ Night",
  "Sports Viewing",
  "Launch / Opening",
  "Festival",
  "Workshop",
  "Other",
];

const EVENT_EMOJIS = [
  "🎉", "🎶", "🎤", "🪩", "🍻", "🍸", "🥂", "🎵", "🎸", "🔥", "⭐️", "🎊",
  "🏆", "⚽️", "🎭", "🎨", "🍽️", "💃", "🕺", "🎆", "🎯", "🥳", "🎟️", "📣",
];

const DETECTED_TZ =
  typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : "UTC";

const COMMON_TZS = Array.from(
  new Set([
    DETECTED_TZ,
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Mexico_City",
    "America/Bogota",
    "America/Sao_Paulo",
    "Europe/Madrid",
    "Europe/London",
    "UTC",
  ]),
);

const INITIAL: EventData = {
  business_id: "",
  name: "",
  description: "",
  category: "",
  icon_emoji: "🎉",
  starts_at: "",
  ends_at: "",
  timezone: DETECTED_TZ,
  location_mode: "business",
  lat: "",
  lng: "",
  cover_url: "",
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Convert a naive "YYYY-MM-DDTHH:MM" wall-clock + IANA zone → UTC ISO string. */
function zonedToUtcISO(localDateTime: string, timeZone: string): string {
  const naive = new Date(localDateTime);
  const asUTC = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
  const asTZ = new Date(naive.toLocaleString("en-US", { timeZone }));
  const offset = asUTC.getTime() - asTZ.getTime();
  return new Date(naive.getTime() + offset).toISOString();
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

// ─── Shared styles (dashboard --db-* tokens) ────────────────────────────────────

const S = {
  label: {
    display: "block",
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--db-text-secondary)",
    marginBottom: "6px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  },
  input: {
    width: "100%",
    boxSizing: "border-box" as const,
    background: "var(--db-bg-elevated)",
    border: "1px solid var(--db-border)",
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "14px",
    color: "var(--db-text-primary)",
    outline: "none",
  },
  inputError: { border: "1px solid var(--db-danger, #ef4444)" },
  textarea: { resize: "vertical" as const, minHeight: "80px" },
  select: { appearance: "none" as const, cursor: "pointer" },
  row: { display: "flex", gap: "12px" },
  field: { marginBottom: "16px" },
  errorMsg: {
    fontSize: "12px",
    color: "var(--db-danger, #ef4444)",
    marginTop: "4px",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  primaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "11px 20px",
    borderRadius: "10px",
    background: "var(--db-accent)",
    color: "var(--db-accent-text, #ffffff)",
    border: "none",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  ghostBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "11px 16px",
    borderRadius: "10px",
    background: "var(--db-bg-elevated)",
    color: "var(--db-text-secondary)",
    border: "1px solid var(--db-border)",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
  },
};

const STEPS = [
  { number: 1, label: "Info", icon: IconCalendarEvent },
  { number: 2, label: "Date & Time", icon: IconClock },
  { number: 3, label: "Location", icon: IconMapPin },
  { number: 4, label: "Cover", icon: IconPhoto },
];

// ─── Emoji picker ────────────────────────────────────────────────────────────────

function EmojiPicker({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (e: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Choose an event emoji"
        style={{ ...S.input, fontSize: "24px", textAlign: "center", padding: "6px 10px", cursor: "pointer" }}
      >
        {value || "🎉"}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 30,
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "var(--db-bg-surface)",
            border: "1px solid var(--db-border)",
            borderRadius: "10px",
            padding: "8px",
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: "4px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          }}
        >
          {EVENT_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onSelect(e);
                setOpen(false);
              }}
              style={{
                fontSize: "20px",
                padding: "6px",
                borderRadius: "8px",
                border: "none",
                background: e === value ? "var(--db-accent-bg, rgba(55,138,221,0.12))" : "transparent",
                cursor: "pointer",
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Cover upload (Supabase Storage bucket "covers") ────────────────────────────

function CoverUpload({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (!isSupabaseConfigured) {
      setError("Storage is not configured.");
      return;
    }
    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Please sign in before uploading.");
        return;
      }
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/event-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("covers")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("covers").getPublicUrl(path);
      onChange(pub.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt="Event cover preview"
          style={{
            width: "100%",
            height: "140px",
            objectFit: "cover",
            borderRadius: "10px",
            border: "1px solid var(--db-border)",
            marginBottom: "10px",
            display: "block",
          }}
        />
      ) : null}
      <label
        style={{
          ...S.ghostBtn,
          justifyContent: "center",
          width: "100%",
          boxSizing: "border-box",
          cursor: uploading ? "wait" : "pointer",
        }}
      >
        <IconUpload size={15} />
        {uploading ? "Uploading…" : value ? "Replace cover photo" : "Upload cover photo"}
        <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} style={{ display: "none" }} />
      </label>
      {error && (
        <p style={S.errorMsg}>
          <IconAlertCircle size={12} /> {error}
        </p>
      )}
      <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginTop: "6px" }}>
        JPG/PNG/WebP — uploaded to secure Supabase Storage (bucket “covers”).
      </p>
    </div>
  );
}

// ─── Step bar ────────────────────────────────────────────────────────────────────

function StepBar({ current }: { current: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: "32px", gap: 0 }}>
      {STEPS.map((s, idx) => {
        const done = current > s.number;
        const active = current === s.number;
        const Icon = s.icon;
        return (
          <div
            key={s.number}
            style={{ display: "flex", alignItems: "center", flex: idx < STEPS.length - 1 ? 1 : undefined }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: done
                    ? "var(--db-success)"
                    : active
                    ? "var(--db-accent)"
                    : "var(--db-bg-elevated)",
                  border: active || done ? "none" : "1px solid var(--db-border)",
                  flexShrink: 0,
                  transition: "background 0.2s ease",
                }}
              >
                {done ? (
                  <IconCheck size={14} color="white" />
                ) : (
                  <Icon size={14} color={active ? "white" : "var(--db-text-tertiary)"} />
                )}
              </div>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: active || done ? 600 : 400,
                  color: active
                    ? "var(--db-accent)"
                    : done
                    ? "var(--db-success)"
                    : "var(--db-text-tertiary)",
                  whiteSpace: "nowrap",
                }}
              >
                {s.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: "1px",
                  margin: "0 10px",
                  background: done ? "var(--db-success)" : "var(--db-border)",
                  transition: "background 0.2s ease",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Validation ──────────────────────────────────────────────────────────────────

function validateStep(step: number, d: EventData): Record<string, string> {
  const e: Record<string, string> = {};
  if (step === 1) {
    if (!d.business_id) e.business_id = "Select a business.";
    if (!d.name.trim()) e.name = "Event name is required.";
  }
  if (step === 2) {
    if (!d.starts_at) e.starts_at = "Start date/time is required.";
    if (d.ends_at && d.starts_at && new Date(d.ends_at) <= new Date(d.starts_at)) {
      e.ends_at = "End must be after the start.";
    }
  }
  if (step === 3 && d.location_mode === "custom") {
    if (d.lat !== "" && isNaN(parseFloat(d.lat))) e.lat = "Must be a number.";
    if (d.lng !== "" && isNaN(parseFloat(d.lng))) e.lng = "Must be a number.";
  }
  return e;
}

// ─── Main ────────────────────────────────────────────────────────────────────────

export default function NewEventPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<EventData>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [businesses, setBusinesses] = useState<BusinessOpt[]>([]);
  const [loadingBiz, setLoadingBiz] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageAndLimits | null>(null);
  const [usageLoaded, setUsageLoaded] = useState(false);

  function patch(u: Partial<EventData>) {
    setData((prev) => ({ ...prev, ...u }));
  }

  // Load the signed-in owner's businesses.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoadingBiz(false);
      return;
    }
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/auth/login?next=/dashboard/events/new");
        return;
      }
      // Load plan usage in parallel to decide whether to show the limit gate.
      void getUsageAndLimits().then((u) => {
        if (!active) return;
        setUsage(u);
        setUsageLoaded(true);
      });
      const { data: rows } = await supabase
        .from("businesses")
        .select("id, name, lat, lng, address")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true });
      if (!active) return;
      const list = (rows ?? []) as BusinessOpt[];
      setBusinesses(list);
      if (list.length > 0) patch({ business_id: list[0].id });
      setLoadingBiz(false);
    })();
    return () => {
      active = false;
    };
  }, [router]);

  const selectedBiz = businesses.find((b) => b.id === data.business_id) ?? null;

  function handleNext() {
    const errs = validateStep(step, data);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setStep((s) => s + 1);
  }

  function handleBack() {
    setErrors({});
    setStep((s) => s - 1);
  }

  async function handleFinish() {
    // Validate everything required across steps.
    const errs = { ...validateStep(1, data), ...validateStep(2, data), ...validateStep(3, data) };
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setStep(errs.business_id || errs.name ? 1 : errs.starts_at || errs.ends_at ? 2 : 3);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (!isSupabaseConfigured) {
        router.push("/dashboard/events");
        return;
      }
      const startsIso = zonedToUtcISO(data.starts_at, data.timezone);
      const endsIso = data.ends_at ? zonedToUtcISO(data.ends_at, data.timezone) : null;
      const ttlHours = endsIso
        ? Math.max(1, Math.ceil((new Date(endsIso).getTime() - Date.now()) / 3_600_000))
        : null;

      const lat =
        data.location_mode === "business"
          ? selectedBiz?.lat ?? null
          : data.lat !== ""
            ? parseFloat(data.lat)
            : null;
      const lng =
        data.location_mode === "business"
          ? selectedBiz?.lng ?? null
          : data.lng !== ""
            ? parseFloat(data.lng)
            : null;

      // 1) Dedicated event chat room with TTL.
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .insert({
          business_id: data.business_id,
          name: data.name.trim(),
          is_main: false,
          chat_theme_id: 1,
          icon: data.icon_emoji || null,
          slug: `${toSlug(data.name)}-event-${Date.now().toString(36)}`,
          ttl_hours: ttlHours,
        })
        .select("id")
        .single();
      if (roomError) throw new Error(roomError.message);

      // 2) Event row.
      const { error: eventError } = await supabase.from("events").insert({
        business_id: data.business_id,
        name: data.name.trim(),
        description: data.description.trim() || null,
        category: data.category || null,
        icon_emoji: data.icon_emoji || null,
        cover_url: data.cover_url || null,
        starts_at: startsIso,
        ends_at: endsIso,
        lat,
        lng,
        room_id: room?.id ?? null,
        status: "upcoming",
      });
      if (eventError) throw new Error(eventError.message);

      router.push("/dashboard/events");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create event.");
      setSubmitting(false);
    }
  }

  const stepTitles: Record<number, string> = {
    1: "Event details",
    2: "When is it happening?",
    3: "Where is it?",
    4: "Add a cover photo",
  };

  // No business yet → can't create an event.
  // Plan limit gate (UX): if the user has hit their event limit, show a banner
  // instead of the wizard. Takes priority over the "no businesses" banner. The
  // DB trigger is the real lock; when usage is null (demo) or still loading,
  // the normal flow (including the no-businesses banner) runs unchanged.
  if (usageLoaded && usage !== null && !usage.events.canCreate) {
    return (
      <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--db-text-secondary)" }}>
        <IconAlertCircle size={32} color="var(--db-danger, #ef4444)" />
        <h1 style={{ fontSize: "18px", fontWeight: 700, color: "var(--db-text-primary)", margin: "12px 0 6px" }}>
          Event limit reached
        </h1>
        <p style={{ fontSize: "14px", margin: "0 0 16px" }}>
          Your current plan allows {usage.events.limit} event(s) and you already have{" "}
          {usage.events.used}. Upgrade or request a custom plan to add more.
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href="mailto:support@jchat.cloud?subject=Custom plan request"
            style={{ ...S.primaryBtn, textDecoration: "none" }}
          >
            <IconMail size={16} />
            Contact us
          </a>
          <a href="/dashboard" style={{ ...S.ghostBtn, textDecoration: "none" }}>
            <IconArrowLeft size={16} />
            Back to dashboard
          </a>
        </div>
      </div>
    );
  }

  if (!loadingBiz && isSupabaseConfigured && businesses.length === 0) {
    return (
      <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--db-text-secondary)" }}>
        <IconCalendarEvent size={32} color="var(--db-accent)" />
        <h1 style={{ fontSize: "18px", fontWeight: 700, color: "var(--db-text-primary)", margin: "12px 0 6px" }}>
          You need a business first
        </h1>
        <p style={{ fontSize: "14px", margin: "0 0 16px" }}>Events are attached to a venue you own.</p>
        <a href="/business/register" style={{ ...S.primaryBtn, textDecoration: "none" }}>
          Register your business
          <IconChevronRight size={15} />
        </a>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--db-bg-base)",
        color: "var(--db-text-primary)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 16px 80px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "640px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "48px",
              height: "48px",
              borderRadius: "14px",
              background: "var(--db-accent-bg, rgba(55,138,221,0.12))",
              marginBottom: "14px",
            }}
          >
            <IconCalendarEvent size={24} color="var(--db-accent)" />
          </div>
          <h1
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "var(--db-text-primary)",
              margin: "0 0 6px",
            }}
          >
            Create an event
          </h1>
          <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", margin: 0 }}>
            Publish an event and open a dedicated chat room for it.
          </p>
        </div>

        {/* Step indicator */}
        <StepBar current={step} />

        {/* Card */}
        <div
          style={{
            background: "var(--db-bg-surface)",
            border: "1px solid var(--db-border)",
            borderRadius: "16px",
            padding: "28px",
          }}
        >
          <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--db-text-primary)", margin: "0 0 20px" }}>
          {stepTitles[step]}
        </h2>

        {/* Step 1 — Info */}
        {step === 1 && (
          <div>
            {businesses.length > 1 && (
              <div style={S.field}>
                <label style={S.label}>Business *</label>
                <select
                  style={{ ...S.input, ...S.select, ...(errors.business_id ? S.inputError : {}) }}
                  value={data.business_id}
                  onChange={(e) => patch({ business_id: e.target.value })}
                >
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div style={S.field}>
              <label style={S.label}>Event Name *</label>
              <input
                style={{ ...S.input, ...(errors.name ? S.inputError : {}) }}
                value={data.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="e.g. Saturday Rooftop Party"
                maxLength={100}
              />
              {errors.name && (
                <p style={S.errorMsg}>
                  <IconAlertCircle size={12} /> {errors.name}
                </p>
              )}
            </div>
            <div style={S.field}>
              <label style={S.label}>Description</label>
              <textarea
                style={{ ...S.input, ...S.textarea }}
                value={data.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="What's happening at this event?"
                maxLength={500}
              />
            </div>
            <div style={{ ...S.row, alignItems: "flex-start" }}>
              <div style={{ ...S.field, flex: 2 }}>
                <label style={S.label}>Category</label>
                <select
                  style={{ ...S.input, ...S.select }}
                  value={data.category}
                  onChange={(e) => patch({ category: e.target.value })}
                >
                  <option value="">Select a category…</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={{ ...S.label, display: "flex", alignItems: "center", gap: "6px" }}>
                  <IconMoodSmile size={14} /> Emoji
                </label>
                <EmojiPicker value={data.icon_emoji} onSelect={(e) => patch({ icon_emoji: e })} />
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Date & Time */}
        {step === 2 && (
          <div>
            <div style={S.row}>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>Starts *</label>
                <input
                  type="datetime-local"
                  style={{ ...S.input, ...(errors.starts_at ? S.inputError : {}) }}
                  value={data.starts_at}
                  onChange={(e) => patch({ starts_at: e.target.value })}
                />
                {errors.starts_at && (
                  <p style={S.errorMsg}>
                    <IconAlertCircle size={12} /> {errors.starts_at}
                  </p>
                )}
              </div>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>Ends</label>
                <input
                  type="datetime-local"
                  style={{ ...S.input, ...(errors.ends_at ? S.inputError : {}) }}
                  value={data.ends_at}
                  onChange={(e) => patch({ ends_at: e.target.value })}
                />
                {errors.ends_at && (
                  <p style={S.errorMsg}>
                    <IconAlertCircle size={12} /> {errors.ends_at}
                  </p>
                )}
              </div>
            </div>
            <div style={S.field}>
              <label style={S.label}>Timezone</label>
              <select
                style={{ ...S.input, ...S.select }}
                value={data.timezone}
                onChange={(e) => patch({ timezone: e.target.value })}
              >
                {COMMON_TZS.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                    {tz === DETECTED_TZ ? " (detected)" : ""}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginTop: "6px" }}>
                The event chat room auto-closes when the event ends.
              </p>
            </div>
          </div>
        )}

        {/* Step 3 — Location */}
        {step === 3 && (
          <div>
            <div style={{ ...S.field, display: "flex", flexDirection: "column", gap: "10px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="loc"
                  checked={data.location_mode === "business"}
                  onChange={() => patch({ location_mode: "business" })}
                  style={{ accentColor: "var(--db-accent)" }}
                />
                <span style={{ fontSize: "14px", color: "var(--db-text-primary)" }}>
                  Use my business location
                  {selectedBiz?.address ? ` — ${selectedBiz.address}` : ""}
                </span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="loc"
                  checked={data.location_mode === "custom"}
                  onChange={() => patch({ location_mode: "custom" })}
                  style={{ accentColor: "var(--db-accent)" }}
                />
                <span style={{ fontSize: "14px", color: "var(--db-text-primary)" }}>Custom location</span>
              </label>
            </div>

            {data.location_mode === "custom" && (
              <div style={S.row}>
                <div style={{ ...S.field, flex: 1 }}>
                  <label style={S.label}>Latitude</label>
                  <input
                    style={{ ...S.input, ...(errors.lat ? S.inputError : {}) }}
                    value={data.lat}
                    onChange={(e) => patch({ lat: e.target.value })}
                    placeholder="25.7617"
                  />
                  {errors.lat && (
                    <p style={S.errorMsg}>
                      <IconAlertCircle size={12} /> {errors.lat}
                    </p>
                  )}
                </div>
                <div style={{ ...S.field, flex: 1 }}>
                  <label style={S.label}>Longitude</label>
                  <input
                    style={{ ...S.input, ...(errors.lng ? S.inputError : {}) }}
                    value={data.lng}
                    onChange={(e) => patch({ lng: e.target.value })}
                    placeholder="-80.1918"
                  />
                  {errors.lng && (
                    <p style={S.errorMsg}>
                      <IconAlertCircle size={12} /> {errors.lng}
                    </p>
                  )}
                </div>
              </div>
            )}
            {/* TODO(Stage 4): pick the custom point on the native map. */}
          </div>
        )}

        {/* Step 4 — Cover */}
        {step === 4 && (
          <div>
            <label style={{ ...S.label, display: "flex", alignItems: "center", gap: "6px" }}>
              <IconPhoto size={14} /> Cover Photo
            </label>
            <CoverUpload value={data.cover_url} onChange={(url) => patch({ cover_url: url })} />
          </div>
        )}

        {submitError && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid var(--db-danger, #ef4444)",
              borderRadius: "8px",
              padding: "10px 14px",
              fontSize: "13px",
              color: "var(--db-danger, #ef4444)",
              margin: "16px 0 0",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <IconAlertCircle size={14} />
            {submitError}
          </div>
        )}

        {/* Navigation */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "24px",
            paddingTop: "20px",
            borderTop: "1px solid var(--db-border)",
          }}
        >
          {step === 1 ? (
            <span style={{ fontSize: "13px", color: "var(--db-text-tertiary)" }}>
              Step {step} of {STEPS.length}
            </span>
          ) : (
            <button type="button" onClick={handleBack} disabled={submitting} style={S.ghostBtn}>
              <IconChevronLeft size={15} />
              Back
            </button>
          )}

          {step < STEPS.length ? (
            <button type="button" onClick={handleNext} style={S.primaryBtn}>
              Continue
              <IconChevronRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              disabled={submitting}
              style={{ ...S.primaryBtn, opacity: submitting ? 0.6 : 1, cursor: submitting ? "wait" : "pointer" }}
            >
              {submitting ? "Creating…" : "Create Event"}
              {!submitting && <IconCheck size={15} />}
            </button>
          )}
        </div>
        </div>

        {/* Footer note */}
        <p
          style={{
            textAlign: "center",
            fontSize: "12px",
            color: "var(--db-text-tertiary)",
            marginTop: "20px",
          }}
        >
          The event&apos;s chat room closes automatically when the event ends.
        </p>
      </div>
    </div>
  );
}
