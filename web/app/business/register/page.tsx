"use client";

/**
 * JChat 3.0 — Business Registration Wizard (Task 2.1)
 * 4-step wizard: Info → Location → Hours → Stripe Connect
 * On finish: inserts `businesses` row (status='pending_verification')
 *            + auto-creates default Main Room in `rooms`
 *            → redirects to /business/verify
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconBuilding,
  IconMapPin,
  IconClock,
  IconBrandStripe,
  IconCheck,
  IconChevronRight,
  IconChevronLeft,
  IconPhoto,
  IconMoodSmile,
  IconPhone,
  IconWorld,
  IconAlertCircle,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type DayKey =
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat"
  | "sun";

interface DayHours {
  open: string;   // "HH:MM" 24-h
  close: string;  // "HH:MM" 24-h
  closed: boolean;
}

type HoursMap = Record<DayKey, DayHours>;

interface WizardData {
  // Step 1 — Info
  name: string;
  category: string;
  description: string;
  cover_url: string;
  icon_emoji: string;
  // Step 2 — Location
  address: string;
  lat: string;
  lng: string;
  radius_m: string;
  phone: string;
  website: string;
  // Step 3 — Hours
  hours: HoursMap;
  // Step 4 — Stripe
  stripe_account_id: string; // set after Stripe redirect (stub)
}

const DAYS: { key: DayKey; label: string; short: string }[] = [
  { key: "mon", label: "Monday",    short: "Mo" },
  { key: "tue", label: "Tuesday",   short: "Tu" },
  { key: "wed", label: "Wednesday", short: "We" },
  { key: "thu", label: "Thursday",  short: "Th" },
  { key: "fri", label: "Friday",    short: "Fr" },
  { key: "sat", label: "Saturday",  short: "Sa" },
  { key: "sun", label: "Sunday",    short: "Su" },
];

const CATEGORIES = [
  "Bar & Nightclub",
  "Restaurant",
  "Café",
  "Lounge",
  "Club",
  "Brewery",
  "Rooftop Bar",
  "Sports Bar",
  "Cocktail Bar",
  "Wine Bar",
  "Other",
];

const DEFAULT_HOURS: HoursMap = {
  mon: { open: "09:00", close: "22:00", closed: false },
  tue: { open: "09:00", close: "22:00", closed: false },
  wed: { open: "09:00", close: "22:00", closed: false },
  thu: { open: "09:00", close: "23:00", closed: false },
  fri: { open: "09:00", close: "02:00", closed: false },
  sat: { open: "10:00", close: "02:00", closed: false },
  sun: { open: "10:00", close: "22:00", closed: false },
};

const INITIAL_DATA: WizardData = {
  name: "",
  category: "",
  description: "",
  cover_url: "",
  icon_emoji: "🏢",
  address: "",
  lat: "",
  lng: "",
  radius_m: "100",
  phone: "",
  website: "",
  hours: DEFAULT_HOURS,
  stripe_account_id: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive a URL-safe slug from a business name. */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 60);
}

// ─── Shared style atoms ───────────────────────────────────────────────────────

const S = {
  label: {
    display: "block",
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: "6px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  },
  input: {
    width: "100%",
    boxSizing: "border-box" as const,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "14px",
    color: "var(--text-primary)",
    outline: "none",
  },
  inputError: {
    border: "1px solid var(--color-danger)",
  },
  textarea: {
    resize: "vertical" as const,
    minHeight: "88px",
  },
  select: {
    appearance: "none" as const,
    cursor: "pointer",
  },
  row: {
    display: "flex",
    gap: "12px",
  },
  field: (flex?: number): React.CSSProperties => ({
    flex: flex ?? 1,
    marginBottom: "16px",
  }),
  errorMsg: {
    fontSize: "12px",
    color: "var(--color-danger)",
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
    background: "var(--color-brand)",
    color: "var(--bg-surface-light)",
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
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-subtle)",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
  },
};

// ─── Step components ──────────────────────────────────────────────────────────

/** Step 1 — Business Info */
function StepInfo({
  data,
  onChange,
  errors,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
  errors: Record<string, string>;
}) {
  return (
    <div>
      <div style={S.field()}>
        <label style={S.label}>Business Name *</label>
        <input
          style={{ ...S.input, ...(errors.name ? S.inputError : {}) }}
          value={data.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. The Blue Lounge"
          maxLength={80}
        />
        {errors.name && (
          <p style={S.errorMsg}>
            <IconAlertCircle size={12} /> {errors.name}
          </p>
        )}
      </div>

      <div style={S.field()}>
        <label style={S.label}>Category *</label>
        <select
          style={{ ...S.input, ...S.select, ...(errors.category ? S.inputError : {}) }}
          value={data.category}
          onChange={(e) => onChange({ category: e.target.value })}
        >
          <option value="">Select a category…</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {errors.category && (
          <p style={S.errorMsg}>
            <IconAlertCircle size={12} /> {errors.category}
          </p>
        )}
      </div>

      <div style={S.field()}>
        <label style={S.label}>Description</label>
        <textarea
          style={{ ...S.input, ...S.textarea }}
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Tell guests what makes your venue special…"
          maxLength={500}
        />
        <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
          {data.description.length}/500
        </p>
      </div>

      {/* Photos row */}
      <div style={{ ...S.row, marginBottom: "16px" }}>
        <div style={S.field(2)}>
          <label
            style={{ ...S.label, display: "flex", alignItems: "center", gap: "6px" }}
          >
            <IconPhoto size={14} /> Cover Photo URL
          </label>
          {/* TODO(storage): replace URL input with file upload when Supabase Storage is configured */}
          <input
            style={S.input}
            value={data.cover_url}
            onChange={(e) => onChange({ cover_url: e.target.value })}
            placeholder="https://…/cover.jpg"
            type="url"
          />
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
            {/* TODO(storage): swap for an upload button once Storage bucket is ready */}
            Paste an image URL for now — upload will be available once storage is configured.
          </p>
        </div>

        <div style={S.field(1)}>
          <label
            style={{ ...S.label, display: "flex", alignItems: "center", gap: "6px" }}
          >
            <IconMoodSmile size={14} /> Icon Emoji
          </label>
          <input
            style={{ ...S.input, fontSize: "24px", textAlign: "center", padding: "6px 10px" }}
            value={data.icon_emoji}
            onChange={(e) => onChange({ icon_emoji: e.target.value })}
            maxLength={2}
          />
        </div>
      </div>
    </div>
  );
}

/** Step 2 — Location & Contact */
function StepLocation({
  data,
  onChange,
  errors,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
  errors: Record<string, string>;
}) {
  return (
    <div>
      {/* TODO(Stage 4): replace lat/lng inputs with Google Maps radius-draw widget once API key is available */}
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "10px",
          padding: "12px 14px",
          marginBottom: "16px",
          fontSize: "13px",
          color: "var(--text-secondary)",
        }}
      >
        <strong style={{ color: "var(--text-primary)" }}>Note:</strong> Google Maps radius
        drawing requires an API key (Stage 4). Enter coordinates and radius manually for now.
      </div>

      <div style={S.field()}>
        <label style={S.label}>Street Address *</label>
        <input
          style={{ ...S.input, ...(errors.address ? S.inputError : {}) }}
          value={data.address}
          onChange={(e) => onChange({ address: e.target.value })}
          placeholder="123 Main St, City, State, ZIP"
        />
        {errors.address && (
          <p style={S.errorMsg}>
            <IconAlertCircle size={12} /> {errors.address}
          </p>
        )}
      </div>

      <div style={{ ...S.row, marginBottom: "16px" }}>
        <div style={S.field()}>
          <label style={S.label}>Latitude</label>
          <input
            style={{ ...S.input, ...(errors.lat ? S.inputError : {}) }}
            value={data.lat}
            onChange={(e) => onChange({ lat: e.target.value })}
            placeholder="e.g. 25.7617"
            type="number"
            step="any"
          />
          {errors.lat && (
            <p style={S.errorMsg}>
              <IconAlertCircle size={12} /> {errors.lat}
            </p>
          )}
        </div>
        <div style={S.field()}>
          <label style={S.label}>Longitude</label>
          <input
            style={{ ...S.input, ...(errors.lng ? S.inputError : {}) }}
            value={data.lng}
            onChange={(e) => onChange({ lng: e.target.value })}
            placeholder="e.g. -80.1918"
            type="number"
            step="any"
          />
          {errors.lng && (
            <p style={S.errorMsg}>
              <IconAlertCircle size={12} /> {errors.lng}
            </p>
          )}
        </div>
        <div style={S.field()}>
          <label style={S.label}>Radius (m)</label>
          <input
            style={{ ...S.input, ...(errors.radius_m ? S.inputError : {}) }}
            value={data.radius_m}
            onChange={(e) => onChange({ radius_m: e.target.value })}
            placeholder="100"
            type="number"
            min="10"
            max="5000"
          />
          {errors.radius_m && (
            <p style={S.errorMsg}>
              <IconAlertCircle size={12} /> {errors.radius_m}
            </p>
          )}
        </div>
      </div>

      <div style={{ ...S.row, marginBottom: "16px" }}>
        <div style={S.field()}>
          <label
            style={{ ...S.label, display: "flex", alignItems: "center", gap: "6px" }}
          >
            <IconPhone size={13} /> Phone *
          </label>
          <input
            style={{ ...S.input, ...(errors.phone ? S.inputError : {}) }}
            value={data.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="+1 (305) 555-0100"
            type="tel"
          />
          {errors.phone && (
            <p style={S.errorMsg}>
              <IconAlertCircle size={12} /> {errors.phone}
            </p>
          )}
        </div>
        <div style={S.field()}>
          <label
            style={{ ...S.label, display: "flex", alignItems: "center", gap: "6px" }}
          >
            <IconWorld size={13} /> Website
          </label>
          <input
            style={S.input}
            value={data.website}
            onChange={(e) => onChange({ website: e.target.value })}
            placeholder="https://yourvenue.com"
            type="url"
          />
        </div>
      </div>
    </div>
  );
}

/** Step 3 — Operating Hours */
function StepHours({
  data,
  onChange,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
}) {
  function updateDay(key: DayKey, patch: Partial<DayHours>) {
    onChange({
      hours: {
        ...data.hours,
        [key]: { ...data.hours[key], ...patch },
      },
    });
  }

  function toggleAll(closed: boolean) {
    const next = { ...data.hours };
    (Object.keys(next) as DayKey[]).forEach((k) => {
      next[k] = { ...next[k], closed };
    });
    onChange({ hours: next });
  }

  return (
    <div>
      {/* Working-days pill row */}
      <div style={{ marginBottom: "20px" }}>
        <label style={{ ...S.label, marginBottom: "10px" }}>Working Days</label>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {DAYS.map((d) => {
            const isOpen = !data.hours[d.key].closed;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => updateDay(d.key, { closed: isOpen })}
                style={{
                  padding: "6px 12px",
                  borderRadius: "20px",
                  border: "1px solid",
                  borderColor: isOpen ? "var(--color-brand)" : "var(--border-subtle)",
                  background: isOpen
                    ? "var(--color-brand-light)"
                    : "var(--bg-elevated)",
                  color: isOpen ? "var(--color-brand)" : "var(--text-tertiary)",
                  fontSize: "13px",
                  fontWeight: isOpen ? 600 : 400,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {d.short}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
          <button
            type="button"
            onClick={() => toggleAll(false)}
            style={{ fontSize: "12px", color: "var(--color-brand)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => toggleAll(true)}
            style={{ fontSize: "12px", color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            Clear all
          </button>
        </div>
      </div>

      {/* Per-day time inputs */}
      <div>
        {DAYS.map((d) => {
          const day = data.hours[d.key];
          return (
            <div
              key={d.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 0",
                borderBottom: "1px solid var(--border-subtle)",
                opacity: day.closed ? 0.4 : 1,
                transition: "opacity 0.15s ease",
              }}
            >
              {/* Day name */}
              <span
                style={{
                  width: "90px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  flexShrink: 0,
                }}
              >
                {d.label}
              </span>

              {/* Closed toggle */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  userSelect: "none",
                  flexShrink: 0,
                  width: "68px",
                }}
              >
                <input
                  type="checkbox"
                  checked={day.closed}
                  onChange={(e) => updateDay(d.key, { closed: e.target.checked })}
                  style={{ accentColor: "var(--color-brand)" }}
                />
                Closed
              </label>

              {/* Time inputs */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                <input
                  type="time"
                  value={day.open}
                  disabled={day.closed}
                  onChange={(e) => updateDay(d.key, { open: e.target.value })}
                  style={{
                    ...S.input,
                    padding: "6px 10px",
                    flex: 1,
                    minWidth: 0,
                    colorScheme: "dark",
                    opacity: day.closed ? 0.4 : 1,
                  }}
                />
                <span style={{ fontSize: "12px", color: "var(--text-tertiary)", flexShrink: 0 }}>
                  to
                </span>
                <input
                  type="time"
                  value={day.close}
                  disabled={day.closed}
                  onChange={(e) => updateDay(d.key, { close: e.target.value })}
                  style={{
                    ...S.input,
                    padding: "6px 10px",
                    flex: 1,
                    minWidth: 0,
                    colorScheme: "dark",
                    opacity: day.closed ? 0.4 : 1,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Step 4 — Stripe Connect (stub) */
function StepStripe({
  data,
  onConnected,
}: {
  data: WizardData;
  onConnected: (accountId: string) => void;
}) {
  const isConnected = data.stripe_account_id !== "";

  function handleConnect() {
    // TODO(Task 3.6): redirect to stripe-connect Edge Function, capture account_id
    // e.g. window.location.href = `/api/stripe-connect?redirect_uri=${encodeURIComponent(window.location.href)}`;
    // For now, stub a fake account_id so the wizard can be completed.
    onConnected("acct_STUB_" + Math.random().toString(36).slice(2, 10));
  }

  return (
    <div>
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "20px",
          textAlign: "center",
        }}
      >
        <IconBrandStripe
          size={48}
          style={{ color: "#635BFF", marginBottom: "12px" }}
        />
        <h3
          style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 8px",
          }}
        >
          Connect your Stripe account
        </h3>
        <p
          style={{
            fontSize: "14px",
            color: "var(--text-secondary)",
            lineHeight: 1.5,
            marginBottom: "20px",
          }}
        >
          JChat uses Stripe Connect to handle payments securely.
          You&apos;ll be redirected to Stripe to create or connect your account.
        </p>

        {isConnected ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              borderRadius: "10px",
              background: "rgba(29, 158, 117, 0.15)",
              color: "var(--color-success)",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            <IconCheck size={16} />
            Stripe Connected (stub)
          </div>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            style={{
              ...S.primaryBtn,
              background: "#635BFF",
            }}
          >
            <IconBrandStripe size={16} />
            Connect Stripe
          </button>
        )}
      </div>

      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "10px",
          padding: "12px 14px",
          fontSize: "12px",
          color: "var(--text-secondary)",
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: "var(--text-primary)" }}>Stripe Connect is optional.</strong>{" "}
        You can skip this step and connect Stripe later from your dashboard. Without it,
        in-app ordering and payments will be unavailable.
        {/* TODO(Task 3.6): redirect to stripe-connect Edge Function, capture account_id */}
      </div>

      {data.stripe_account_id && (
        <p
          style={{
            fontSize: "11px",
            color: "var(--text-tertiary)",
            marginTop: "10px",
          }}
        >
          Account: {data.stripe_account_id}
        </p>
      )}
    </div>
  );
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateStep(step: number, data: WizardData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (step === 1) {
    if (!data.name.trim()) errors.name = "Business name is required.";
    if (!data.category) errors.category = "Please select a category.";
  }
  if (step === 2) {
    if (!data.address.trim()) errors.address = "Address is required.";
    if (!data.phone.trim()) errors.phone = "Phone number is required.";
    if (data.lat !== "" && isNaN(parseFloat(data.lat)))
      errors.lat = "Must be a valid number.";
    if (data.lng !== "" && isNaN(parseFloat(data.lng)))
      errors.lng = "Must be a valid number.";
    if (data.radius_m !== "" && (isNaN(parseInt(data.radius_m)) || parseInt(data.radius_m) < 10))
      errors.radius_m = "Radius must be at least 10 m.";
  }
  // Steps 3 and 4 have no hard required fields — hours defaults are valid.
  return errors;
}

// ─── Step header ──────────────────────────────────────────────────────────────

const STEPS = [
  { number: 1, label: "Info",     icon: IconBuilding },
  { number: 2, label: "Location", icon: IconMapPin },
  { number: 3, label: "Hours",    icon: IconClock },
  { number: 4, label: "Stripe",   icon: IconBrandStripe },
];

function StepBar({ current }: { current: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        marginBottom: "32px",
        gap: 0,
      }}
    >
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
                    ? "var(--color-success)"
                    : active
                    ? "var(--color-brand)"
                    : "var(--bg-elevated)",
                  border: active
                    ? "none"
                    : done
                    ? "none"
                    : "1px solid var(--border-subtle)",
                  flexShrink: 0,
                  transition: "background 0.2s ease",
                }}
              >
                {done ? (
                  <IconCheck size={14} color="white" />
                ) : (
                  <Icon
                    size={14}
                    color={active ? "white" : "var(--text-tertiary)"}
                  />
                )}
              </div>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: active || done ? 600 : 400,
                  color: active
                    ? "var(--color-brand)"
                    : done
                    ? "var(--color-success)"
                    : "var(--text-tertiary)",
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
                  background: done
                    ? "var(--color-success)"
                    : "var(--border-subtle)",
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

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function BusinessRegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Require an authenticated session to register a business (RLS: owner insert
  // checks auth.uid() = owner_id). Redirect to login if signed out.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (active && !user) {
        router.replace("/auth/login?next=/business/register");
      }
    });
    return () => {
      active = false;
    };
  }, [router]);

  function patch(update: Partial<WizardData>) {
    setData((prev) => ({ ...prev, ...update }));
  }

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
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (!isSupabaseConfigured) {
        // Dev/demo mode: skip DB writes and go straight to verify
        router.push("/business/verify");
        return;
      }

      // Require an authenticated session — owner_id must match auth.uid() (RLS).
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/auth/login?next=/business/register");
        return;
      }

      // 1) Insert business row (owned by the signed-in user)
      const slug = toSlug(data.name);
      const { data: inserted, error: bizError } = await supabase
        .from("businesses")
        .insert({
          owner_id: user.id,
          name: data.name.trim(),
          slug,
          category: data.category,
          description: data.description.trim() || null,
          cover_url: data.cover_url.trim() || null,
          icon_emoji: data.icon_emoji || "🏢",
          address: data.address.trim(),
          lat: data.lat !== "" ? parseFloat(data.lat) : null,
          lng: data.lng !== "" ? parseFloat(data.lng) : null,
          radius_m: data.radius_m !== "" ? parseInt(data.radius_m) : 100,
          phone: data.phone.trim(),
          website: data.website.trim() || null,
          hours: data.hours,
          status: "pending_verification",
          plan: "free",
          stripe_account_id: data.stripe_account_id || null,
        })
        .select("id")
        .single();

      if (bizError) throw new Error(bizError.message);
      if (!inserted) throw new Error("Business insert returned no data.");

      const businessId: string = inserted.id as string;

      // 2) Auto-create default Main Room
      const { error: roomError } = await supabase.from("rooms").insert({
        business_id: businessId,
        name: "Main Room",
        is_main: true,
        chat_theme_id: 1,
        slug: `${slug}-main`,
      });

      if (roomError) {
        // Non-fatal: log and continue — business was created
        console.error("Failed to create Main Room:", roomError.message);
      }

      // 3) Redirect to verification
      router.push("/business/verify");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
      setSubmitting(false);
    }
  }

  const stepTitles: Record<number, string> = {
    1: "Tell us about your business",
    2: "Where are you located?",
    3: "When are you open?",
    4: "Set up payments",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--text-primary)",
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
              background: "var(--color-brand-light)",
              marginBottom: "14px",
            }}
          >
            <IconBuilding size={24} color="var(--color-brand)" />
          </div>
          <h1
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: "0 0 6px",
            }}
          >
            Register your business
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: 0 }}>
            Complete all steps to get listed on JChat.
          </p>
        </div>

        {/* Step indicator */}
        <StepBar current={step} />

        {/* Card */}
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "16px",
            padding: "28px",
          }}
        >
          <h2
            style={{
              fontSize: "17px",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: "0 0 20px",
            }}
          >
            {stepTitles[step]}
          </h2>

          {/* Step content */}
          {step === 1 && (
            <StepInfo data={data} onChange={patch} errors={errors} />
          )}
          {step === 2 && (
            <StepLocation data={data} onChange={patch} errors={errors} />
          )}
          {step === 3 && (
            <StepHours data={data} onChange={patch} />
          )}
          {step === 4 && (
            <StepStripe
              data={data}
              onConnected={(accountId) => patch({ stripe_account_id: accountId })}
            />
          )}

          {/* Global submit error */}
          {submitError && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid var(--color-danger)",
                borderRadius: "8px",
                padding: "10px 14px",
                fontSize: "13px",
                color: "var(--color-danger)",
                marginBottom: "16px",
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
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            {/* Back / Cancel */}
            {step === 1 ? (
              <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
                Step {step} of {STEPS.length}
              </span>
            ) : (
              <button
                type="button"
                onClick={handleBack}
                disabled={submitting}
                style={S.ghostBtn}
              >
                <IconChevronLeft size={15} />
                Back
              </button>
            )}

            {/* Continue / Finish */}
            {step < STEPS.length ? (
              <button
                type="button"
                onClick={handleNext}
                style={S.primaryBtn}
              >
                Continue
                <IconChevronRight size={15} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={submitting}
                style={{
                  ...S.primaryBtn,
                  opacity: submitting ? 0.6 : 1,
                  cursor: submitting ? "wait" : "pointer",
                }}
              >
                {submitting ? "Registering…" : "Complete Registration"}
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
            color: "var(--text-tertiary)",
            marginTop: "20px",
          }}
        >
          Your listing will be reviewed before going live.{" "}
          Questions? Contact{" "}
          <a
            href="mailto:support@jchat.app"
            style={{ color: "var(--color-brand)", textDecoration: "none" }}
          >
            support@jchat.app
          </a>
        </p>
      </div>
    </div>
  );
}
