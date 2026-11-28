"use client";

/**
 * JChat 3.0 — Business Registration Wizard (Task 2.1)
 * 4-step wizard: Info → Location → Hours → Payments (informative: Stripe is connected later from the dashboard's Payments page)
 * On finish: inserts `businesses` row (status='pending_verification')
 *            + auto-creates default Main Room in `rooms`
 *            → redirects to /business/verify
 */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { copyHoursToAll, isOpen24h, isOvernight, setOpen24h } from "@/lib/businessHours";
import {
  IconBuilding,
  IconCalendarEvent,
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
  IconUpload,
  IconMail,
  IconArrowLeft,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";
import { getUsageAndLimits, type UsageAndLimits } from "@/lib/planLimits";
import { categoryLabel } from "@/lib/categoryLabel";
import { registerErrorKind, type RegisterErrorKind } from "@/lib/registerErrors";
import { APIProvider, useMapsLibrary } from "@vis.gl/react-google-maps";
import {
  coordsFrom,
  geocodeAddress,
  needsGeocode,
  normalizeAddress,
  shouldGeocodeOnBlur,
  type CoordSource,
  type GeocodeOutcome,
  type GeocoderLike,
} from "@/lib/registerLocation";

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
  // Step 4 (Payments) is informative: the sign-up NEVER writes stripe_account_id (only the stripe-connect function does).
  // Event mode (?type=event) — validity window for a temporary business
  event_starts_at: string; // datetime-local value
  event_ends_at: string;
}

/** `label` and `short` are keys of the businessRegister messages. */
const DAYS: { key: DayKey; label: string; short: string }[] = [
  { key: "mon", label: "dayMon", short: "dayShortMon" },
  { key: "tue", label: "dayTue", short: "dayShortTue" },
  { key: "wed", label: "dayWed", short: "dayShortWed" },
  { key: "thu", label: "dayThu", short: "dayShortThu" },
  { key: "fri", label: "dayFri", short: "dayShortFri" },
  { key: "sat", label: "daySat", short: "dayShortSat" },
  { key: "sun", label: "daySun", short: "dayShortSun" },
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
  event_starts_at: "",
  event_ends_at: "",
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

const BUSINESS_EMOJIS = [
  "🏢", "🍸", "🍺", "🍷", "🍻", "🥂", "🍹", "☕️", "🍴", "🍕", "🍔", "🌮",
  "🍣", "🎤", "🎶", "🎵", "🎉", "🪩", "🎳", "🏨", "🛍️", "💈", "🔥", "⭐️",
];

/** Clickable emoji picker (a button that opens a small grid). */
function EmojiPicker({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (emoji: string) => void;
}) {
  const tr = useTranslations("businessRegister");
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={tr("emojiPickerAria")}
        style={{
          ...S.input,
          fontSize: "24px",
          textAlign: "center",
          padding: "6px 10px",
          cursor: "pointer",
        }}
      >
        {value || "🏢"}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 30,
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "10px",
            padding: "8px",
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: "4px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          }}
        >
          {BUSINESS_EMOJIS.map((e) => (
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
                background: e === value ? "var(--color-brand-light)" : "transparent",
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

/** Cover photo upload → Supabase Storage bucket "covers". */
function CoverUpload({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const tr = useTranslations("businessRegister");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (!isSupabaseConfigured) {
      setError(tr("storageNotConfigured"));
      return;
    }
    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError(tr("signInToUpload"));
        return;
      }
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      // Path must start with the user's id (storage RLS: own folder only).
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("covers")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("covers").getPublicUrl(path);
      onChange(pub.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("uploadFailed"));
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
          alt={tr("coverAlt")}
          style={{
            width: "100%",
            height: "120px",
            objectFit: "cover",
            borderRadius: "10px",
            border: "1px solid var(--border-subtle)",
            marginBottom: "8px",
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
        {uploading ? tr("uploading") : value ? tr("replaceCover") : tr("uploadCover")}
        <input
          type="file"
          accept="image/*"
          onChange={handleFile}
          disabled={uploading}
          style={{ display: "none" }}
        />
      </label>
      {error && (
        <p style={S.errorMsg}>
          <IconAlertCircle size={12} /> {error}
        </p>
      )}
      <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
        {tr("coverHint")}
      </p>
    </div>
  );
}

/** Step 1 — Business Info */
function StepInfo({
  data,
  onChange,
  errors,
  isEventMode,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
  errors: Record<string, string>;
  isEventMode: boolean;
}) {
  const tr = useTranslations("businessRegister");
  const tc = useTranslations("businessCategories");
  return (
    <div>
      <div style={S.field()}>
        <label style={S.label}>{isEventMode ? tr("eventName") : tr("businessName")}</label>
        <input
          style={{ ...S.input, ...(errors.name ? S.inputError : {}) }}
          value={data.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={isEventMode ? tr("eventNamePlaceholder") : tr("businessNamePlaceholder")}
          maxLength={80}
        />
        {errors.name && (
          <p style={S.errorMsg}>
            <IconAlertCircle size={12} /> {errors.name}
          </p>
        )}
      </div>

      {!isEventMode && (
        <div style={S.field()}>
          <label style={S.label}>{tr("category")}</label>
          <select
            style={{ ...S.input, ...S.select, ...(errors.category ? S.inputError : {}) }}
            value={data.category}
            onChange={(e) => onChange({ category: e.target.value })}
          >
            <option value="">{tr("categoryPlaceholder")}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c, tc)}
              </option>
            ))}
          </select>
          {errors.category && (
            <p style={S.errorMsg}>
              <IconAlertCircle size={12} /> {errors.category}
            </p>
          )}
        </div>
      )}

      <div style={S.field()}>
        <label style={S.label}>{tr("description")}</label>
        <textarea
          style={{ ...S.input, ...S.textarea }}
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder={tr("descriptionPlaceholder")}
          maxLength={500}
        />
        <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
          {data.description.length}/500
        </p>
      </div>

      {/* Photos + emoji */}
      <div style={{ ...S.row, marginBottom: "16px", alignItems: "flex-start" }}>
        <div style={S.field(2)}>
          <label
            style={{ ...S.label, display: "flex", alignItems: "center", gap: "6px" }}
          >
            <IconPhoto size={14} /> {tr("coverPhoto")}
          </label>
          <CoverUpload
            value={data.cover_url}
            onChange={(url) => onChange({ cover_url: url })}
          />
        </div>

        <div style={S.field(1)}>
          <label
            style={{ ...S.label, display: "flex", alignItems: "center", gap: "6px" }}
          >
            <IconMoodSmile size={14} /> {tr("iconEmoji")}
          </label>
          <EmojiPicker
            value={data.icon_emoji}
            onSelect={(e) => onChange({ icon_emoji: e })}
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
  onManualCoords,
  onAddressBlur,
  geocoding,
  located,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
  errors: Record<string, string>;
  /** The owner typed a coordinate: it is theirs from now on (the geocoder never replaces it). */
  onManualCoords: () => void;
  /** The address field lost focus: the wizard may geocode it ahead of "Continue" (silently). */
  onAddressBlur: () => void;
  geocoding: boolean;
  /** The coordinates in the boxes were just found from the address. */
  located: boolean;
}) {
  const tr = useTranslations("businessRegister");
  return (
    <div>
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
        {tr("locationNote")}
      </div>
      {geocoding && (
        <p role="status" style={{ ...S.errorMsg, color: "var(--text-secondary)", marginBottom: "12px" }}>
          {tr("locating")}
        </p>
      )}
      {located && !geocoding && (
        <p role="status" style={{ ...S.errorMsg, color: "var(--color-success)", marginBottom: "12px" }}>
          {tr("located")}
        </p>
      )}

      <div style={S.field()}>
        <label style={S.label}>{tr("streetAddress")}</label>
        <input
          style={{ ...S.input, ...(errors.address ? S.inputError : {}) }}
          value={data.address}
          onChange={(e) => onChange({ address: e.target.value })}
          onBlur={onAddressBlur}
          placeholder={tr("addressPlaceholder")}
        />
        {errors.address && (
          <p style={S.errorMsg}>
            <IconAlertCircle size={12} /> {errors.address}
          </p>
        )}
      </div>

      <div style={{ ...S.row, marginBottom: "16px" }}>
        <div style={S.field()}>
          <label style={S.label}>{tr("latitude")}</label>
          <input
            style={{ ...S.input, ...(errors.lat ? S.inputError : {}) }}
            value={data.lat}
            onChange={(e) => {
              onManualCoords();
              onChange({ lat: e.target.value });
            }}
            placeholder={tr("latPlaceholder")}
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
          <label style={S.label}>{tr("longitude")}</label>
          <input
            style={{ ...S.input, ...(errors.lng ? S.inputError : {}) }}
            value={data.lng}
            onChange={(e) => {
              onManualCoords();
              onChange({ lng: e.target.value });
            }}
            placeholder={tr("lngPlaceholder")}
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
          <label style={S.label}>{tr("radius")}</label>
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
            <IconPhone size={13} /> {tr("phone")}
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
            <IconWorld size={13} /> {tr("website")}
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

  const tr = useTranslations("businessRegister");
  // The times a day had before "Open 24 h" was ticked, so unticking gives them back.
  const before24h = useRef<Partial<Record<DayKey, { open: string; close: string }>>>({});
  const DEFAULT_TIMES = { open: "09:00", close: "21:00" };

  function toggle24h(key: DayKey, on: boolean) {
    const day = data.hours[key];
    if (on && !isOpen24h(day)) before24h.current[key] = { open: day.open, close: day.close };
    updateDay(key, setOpen24h(day, on, before24h.current[key] ?? null, DEFAULT_TIMES));
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
        <label style={{ ...S.label, marginBottom: "10px" }}>{tr("workingDays")}</label>
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
                {tr(d.short)}
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
            {tr("selectAll")}
          </button>
          <button
            type="button"
            onClick={() => toggleAll(true)}
            style={{ fontSize: "12px", color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            {tr("clearAll")}
          </button>
          <button
            type="button"
            onClick={() => onChange({ hours: copyHoursToAll(data.hours, DAYS.map((d) => d.key)) })}
            style={{ fontSize: "12px", color: "var(--color-brand)", background: "none", border: "none", cursor: "pointer", padding: 0, marginLeft: "auto" }}
          >
            {tr("hoursCopyToAll")}
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
                flexWrap: "wrap",
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
                {tr(d.label)}
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
                {tr("closed")}
              </label>

              {/* Open 24 h */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  cursor: day.closed ? "default" : "pointer",
                  userSelect: "none",
                  flexShrink: 0,
                }}
              >
                <input
                  type="checkbox"
                  checked={isOpen24h(day)}
                  disabled={day.closed}
                  onChange={(e) => toggle24h(d.key, e.target.checked)}
                  style={{ accentColor: "var(--color-brand)" }}
                />
                {tr("hoursOpen24h")}
              </label>

              {/* Time inputs */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1 1 220px" }}>
                <input
                  type="time"
                  value={day.open}
                  disabled={day.closed || isOpen24h(day)}
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
                  {tr("hoursTo")}
                </span>
                <input
                  type="time"
                  value={day.close}
                  disabled={day.closed || isOpen24h(day)}
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
              {isOvernight(day) && (
                <p style={{ flexBasis: "100%", margin: 0, fontSize: "12px", color: "var(--text-tertiary)" }}>
                  {tr("hoursOvernight")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Step 4 — Payments. Informative only: Stripe is connected later from the dashboard's Payments page (stripe-connect Edge Function). */
function StepPayments() {
  const tr = useTranslations("businessRegister");
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
          style={{ color: "var(--color-brand)", marginBottom: "12px" }}
        />
        <h3
          style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 8px",
          }}
        >
          {tr("payTitle")}
        </h3>
        <p
          style={{
            fontSize: "14px",
            color: "var(--text-secondary)",
            lineHeight: 1.5,
            margin: "0 0 12px",
          }}
        >
          {tr("payBody")}
        </p>
        <p
          style={{
            fontSize: "13px",
            color: "var(--text-secondary)",
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {tr("payNeeds")}
        </p>
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
        {tr("payNote")}
      </div>
    </div>
  );
}

/** Event mode — validity window for the temporary business. */
function StepEventDates({
  data,
  onChange,
  errors,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
  errors: Record<string, string>;
}) {
  const tr = useTranslations("businessRegister");
  return (
    <div>
      <div style={S.field()}>
        <label style={S.label}>{tr("eventStart")}</label>
        <input
          type="datetime-local"
          style={{ ...S.input, colorScheme: "dark", ...(errors.event_starts_at ? S.inputError : {}) }}
          value={data.event_starts_at}
          onChange={(e) => onChange({ event_starts_at: e.target.value })}
        />
        {errors.event_starts_at && (
          <p style={S.errorMsg}>
            <IconAlertCircle size={12} /> {errors.event_starts_at}
          </p>
        )}
      </div>
      <div style={S.field()}>
        <label style={S.label}>{tr("eventEnd")}</label>
        <input
          type="datetime-local"
          style={{ ...S.input, colorScheme: "dark", ...(errors.event_ends_at ? S.inputError : {}) }}
          value={data.event_ends_at}
          onChange={(e) => onChange({ event_ends_at: e.target.value })}
        />
        {errors.event_ends_at && (
          <p style={S.errorMsg}>
            <IconAlertCircle size={12} /> {errors.event_ends_at}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Validation ───────────────────────────────────────────────────────────────

type Tr = (key: string) => string;

function validateStep(
  key: StepKey,
  data: WizardData,
  isEventMode: boolean,
  tr: Tr,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (key === "info") {
    if (!data.name.trim())
      errors.name = isEventMode ? tr("errNameEvent") : tr("errNameBusiness");
    if (!isEventMode && !data.category) errors.category = tr("errCategory");
  }
  if (key === "dates") {
    if (!data.event_starts_at) errors.event_starts_at = tr("errEventStart");
    if (!data.event_ends_at) errors.event_ends_at = tr("errEventEnd");
    if (
      data.event_starts_at &&
      data.event_ends_at &&
      new Date(data.event_ends_at) <= new Date(data.event_starts_at)
    ) {
      errors.event_ends_at = tr("errEndAfterStart");
    }
  }
  if (key === "location") {
    if (!data.address.trim()) errors.address = tr("errAddress");
    if (!data.phone.trim()) errors.phone = tr("errPhone");
    if (data.lat !== "" && isNaN(parseFloat(data.lat)))
      errors.lat = tr("errNumber");
    if (data.lng !== "" && isNaN(parseFloat(data.lng)))
      errors.lng = tr("errNumber");
    if (data.radius_m !== "" && (isNaN(parseInt(data.radius_m)) || parseInt(data.radius_m) < 10))
      errors.radius_m = tr("errRadius");
  }
  // "hours" and "payments" have no hard required fields.
  return errors;
}

// ─── Step header ──────────────────────────────────────────────────────────────

type StepKey = "info" | "dates" | "location" | "hours" | "stripe";

interface StepDef {
  key: StepKey;
  /** Keys of the businessRegister messages. */
  labelKey: string;
  titleKey: string;
  icon: typeof IconBuilding;
}

const STEP_DEFS: Record<StepKey, StepDef> = {
  info:     { key: "info",     labelKey: "stepInfo",     titleKey: "titleInfo",     icon: IconBuilding },
  dates:    { key: "dates",    labelKey: "stepDates",    titleKey: "titleDates",    icon: IconCalendarEvent },
  location: { key: "location", labelKey: "stepLocation", titleKey: "titleLocation", icon: IconMapPin },
  hours:    { key: "hours",    labelKey: "stepHours",    titleKey: "titleHours",    icon: IconClock },
  stripe:   { key: "stripe",   labelKey: "stepPayments", titleKey: "titlePayments", icon: IconBrandStripe },
};

const BUSINESS_STEPS: StepDef[] = [STEP_DEFS.info, STEP_DEFS.location, STEP_DEFS.hours, STEP_DEFS.stripe];
const EVENT_STEPS: StepDef[] = [STEP_DEFS.info, STEP_DEFS.dates, STEP_DEFS.location, STEP_DEFS.hours, STEP_DEFS.stripe];

function StepBar({ steps, current }: { steps: StepDef[]; current: number }) {
  const tr = useTranslations("businessRegister");
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        marginBottom: "32px",
        gap: 0,
      }}
    >
      {steps.map((s, idx) => {
        const stepNum = idx + 1;
        const done = current > stepNum;
        const active = current === stepNum;
        const Icon = s.icon;
        return (
          <div
            key={s.key}
            style={{ display: "flex", alignItems: "center", flex: idx < steps.length - 1 ? 1 : undefined }}
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
                {tr(s.labelKey)}
              </span>
            </div>
            {idx < steps.length - 1 && (
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

function BusinessRegisterWizard() {
  const tr = useTranslations("businessRegister");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEventMode = searchParams.get("type") === "event";
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The database refused the insert because of the plan limit: the message ends with a link to the plans.
  const [submitErrorKind, setSubmitErrorKind] = useState<RegisterErrorKind | null>(null);
  const [usage, setUsage] = useState<UsageAndLimits | null>(null);
  const [usageLoaded, setUsageLoaded] = useState(false);
  // Location: the coordinates come from the address (Google Maps Geocoder) unless the owner types them.
  const geocodingLib = useMapsLibrary("geocoding");
  const geocoder = useMemo<GeocoderLike | null>(() => (geocodingLib ? new geocodingLib.Geocoder() : null), [geocodingLib]);
  const [coordSource, setCoordSource] = useState<CoordSource>(null);
  const [geocodedFor, setGeocodedFor] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [located, setLocated] = useState(false);

  // Step flow depends on the mode: events get an extra "Dates" step.
  const steps = useMemo<StepDef[]>(
    () => (isEventMode ? EVENT_STEPS : BUSINESS_STEPS),
    [isEventMode],
  );
  const currentStep = steps[step - 1];
  // Which plan resource gates this flow (events vs businesses).
  const limitInfo = usage ? (isEventMode ? usage.events : usage.businesses) : null;

  // Require an authenticated session to register a business (RLS: owner insert
  // checks auth.uid() = owner_id). Redirect to login if signed out.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!active) return;
      if (!user) {
        router.replace("/auth/login?next=/business/register");
        return;
      }
      // User is signed in — load plan usage to decide whether to show the gate.
      void getUsageAndLimits().then((u) => {
        if (!active) return;
        setUsage(u);
        setUsageLoaded(true);
      });
    });
    return () => {
      active = false;
    };
  }, [router]);

  function patch(update: Partial<WizardData>) {
    setData((prev) => ({ ...prev, ...update }));
  }

  // The ONE place that geocodes (Continue and the address blur both come here): never two at once. A request for the address that
  // is already being resolved shares that answer; a request for another address waits for the running one first.
  const inflight = useRef<{ key: string; job: Promise<GeocodeOutcome> } | null>(null);
  async function geocodeNow(address: string): Promise<GeocodeOutcome> {
    const key = normalizeAddress(address);
    while (inflight.current) {
      if (inflight.current.key === key) return inflight.current.job;
      await inflight.current.job;
    }
    setLocated(false);
    setGeocoding(true);
    const job = geocodeAddress(geocoder, address).then((outcome) => {
      if (outcome.ok) {
        patch({ lat: String(outcome.coords.lat), lng: String(outcome.coords.lng) });
        setCoordSource("auto");
        setGeocodedFor(key);
        setLocated(true);
      }
      return outcome;
    });
    inflight.current = { key, job };
    try {
      return await job;
    } finally {
      inflight.current = null;
      setGeocoding(false);
    }
  }

  /** Leaving the address field: find the coordinates ahead of time. Silent: a failure here shows nothing (only Continue does). */
  function handleAddressBlur() {
    if (!shouldGeocodeOnBlur({ address: data.address, state: { lat: data.lat, lng: data.lng, source: coordSource, geocodedFor }, busy: inflight.current !== null })) return;
    void geocodeNow(data.address);
  }

  async function handleNext() {
    const errs = validateStep(currentStep.key, data, isEventMode, tr);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    // Location: coordinates are required (without them the venue has no geofence and the server refuses everyone at the door).
    if (currentStep.key === "location" && needsGeocode({ lat: data.lat, lng: data.lng, source: coordSource, geocodedFor }, data.address)) {
      const outcome = await geocodeNow(data.address);
      if (!outcome.ok) {
        setErrors({
          lat:
            outcome.reason === "unavailable"
              ? tr("geocodeUnavailable")
              : outcome.reason === "empty_address"
                ? tr("coordsRequired")
                : tr("geocodeFailed"),
        });
        return;
      }
      setErrors({}); // stay on the step: the owner sees the coordinates found and presses Continue again
      return;
    }
    if (currentStep.key === "location" && !coordsFrom(data.lat, data.lng)) {
      setErrors({ lat: tr("coordsRequired") });
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
    setErrors({});
    setSubmitting(true);
    setSubmitError(null);
    setSubmitErrorKind(null);

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

      // 0) The public.users row is created by the handle_new_auth_user trigger for every
      // auth user (email, Google, Apple). businesses.owner_id → public.users(id), so just
      // verify it exists. Never invent a username here (it used to derive one from the email).
      const { data: profileRow, error: profileError } = await supabase
        .from("users")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError || !profileRow) throw new Error(tr("profileMissing"));

      // Defence in depth: the location step does not let anyone through without coordinates, but never save a business without them.
      const coords = coordsFrom(data.lat, data.lng);
      if (!coords) {
        setStep(steps.findIndex((st) => st.key === "location") + 1);
        setErrors({ lat: tr("coordsRequired") });
        setSubmitting(false);
        return;
      }

      // 1) Insert business row (owned by the signed-in user)
      // Append a short random suffix so the slug never collides with an
      // existing business (businesses_slug_key is UNIQUE).
      const slugSuffix = (Math.random().toString(36) + "0000").slice(2, 6);
      const slug = `${toSlug(data.name)}-${slugSuffix}`;
      const { data: inserted, error: bizError } = await supabase
        .from("businesses")
        .insert({
          owner_id: user.id,
          name: data.name.trim(),
          slug,
          category: isEventMode ? null : data.category,
          description: data.description.trim() || null,
          cover_url: data.cover_url.trim() || null,
          icon_emoji: data.icon_emoji || "🏢",
          address: data.address.trim(),
          lat: coords.lat,
          lng: coords.lng,
          radius_m: data.radius_m !== "" ? parseInt(data.radius_m) : 100,
          phone: data.phone.trim(),
          website: data.website.trim() || null,
          hours: data.hours as unknown as Json,
          status: "pending_verification",
          plan: "free",
          is_temporary: isEventMode,
          event_starts_at:
            isEventMode && data.event_starts_at
              ? new Date(data.event_starts_at).toISOString()
              : null,
          event_ends_at:
            isEventMode && data.event_ends_at
              ? new Date(data.event_ends_at).toISOString()
              : null,
          // stripe_account_id is NEVER written here: only the stripe-connect Edge Function sets it (dashboard → Payments).
        })
        .select("id")
        .single();

      if (bizError) throw new Error(bizError.message);
      if (!inserted) throw new Error(tr("errInsertEmpty"));

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

      // 3) Redirect to verification with the real business UUID
      router.push(`/business/verify?id=${businessId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      const kind = registerErrorKind(message);
      setSubmitErrorKind(kind);
      setSubmitError(
        kind
          ? tr(kind === "planLimit" ? "errPlanLimit" : kind === "planLimitEvents" ? "errPlanLimitEvents" : "errPlanLimitBusinesses")
          : message || tr("errUnexpected")
      );
      setSubmitting(false);
    }
  }

  // Plan limit gate (UX): if the user has hit the relevant limit (events in
  // event mode, businesses otherwise), show a banner instead of the wizard.
  // The DB trigger is the real lock; when usage is null (demo/no session) or
  // still loading, the wizard renders as before.
  if (usageLoaded && limitInfo !== null && !limitInfo.canCreate) {
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
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "16px",
              padding: "28px",
              textAlign: "center",
            }}
          >
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
              <IconAlertCircle size={24} color="var(--color-danger)" />
            </div>
            <h1
              style={{
                fontSize: "22px",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: "0 0 8px",
              }}
            >
              {isEventMode ? tr("limitEventTitle") : tr("limitBusinessTitle")}
            </h1>
            <p
              style={{
                fontSize: "14px",
                color: "var(--text-secondary)",
                margin: "0 0 24px",
                lineHeight: 1.5,
              }}
            >
              {tr(isEventMode ? "limitBodyEvent" : "limitBodyBusiness", {
                limit: limitInfo.limit,
                used: limitInfo.used,
              })}
            </p>
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <a
                href={`mailto:soporte@jchat.cloud?subject=${encodeURIComponent(tr("limitMailSubject"))}`}
                style={{ ...S.primaryBtn, textDecoration: "none" }}
              >
                <IconMail size={18} />
                {tr("limitContact")}
              </a>
              <a href="/dashboard" style={{ ...S.ghostBtn, textDecoration: "none" }}>
                <IconArrowLeft size={18} />
                {tr("limitBack")}
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            {isEventMode ? (
              <IconCalendarEvent size={24} color="var(--color-brand)" />
            ) : (
              <IconBuilding size={24} color="var(--color-brand)" />
            )}
          </div>
          <h1
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: "0 0 6px",
            }}
          >
            {isEventMode ? tr("pageTitleEvent") : tr("pageTitleBusiness")}
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: 0 }}>
            {isEventMode ? tr("pageSubEvent") : tr("pageSubBusiness")}
          </p>
        </div>

        {/* Step indicator */}
        <StepBar steps={steps} current={step} />

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
            {isEventMode && currentStep.key === "info"
              ? tr("titleInfoEvent")
              : tr(currentStep.titleKey)}
          </h2>

          {/* Step content (rendered by the current step's key, order-agnostic) */}
          {currentStep.key === "info" && (
            <StepInfo data={data} onChange={patch} errors={errors} isEventMode={isEventMode} />
          )}
          {currentStep.key === "dates" && (
            <StepEventDates data={data} onChange={patch} errors={errors} />
          )}
          {currentStep.key === "location" && (
            <StepLocation
              data={data}
              onChange={(update) => {
                setLocated(false);
                patch(update);
              }}
              errors={errors}
              onManualCoords={() => setCoordSource("manual")}
              onAddressBlur={handleAddressBlur}
              geocoding={geocoding}
              located={located}
            />
          )}
          {currentStep.key === "hours" && (
            <StepHours data={data} onChange={patch} />
          )}
          {currentStep.key === "stripe" && <StepPayments />}

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
              <span>
                {submitError}
                {submitErrorKind && (
                  <>
                    {" "}
                    <a href="/pricing" style={{ color: "var(--color-danger)", fontWeight: 600 }}>
                      {tr("seePlans")}
                    </a>
                  </>
                )}
              </span>
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
                {tr("stepOf", { step, total: steps.length })}
              </span>
            ) : (
              <button
                type="button"
                onClick={handleBack}
                disabled={submitting}
                style={S.ghostBtn}
              >
                <IconChevronLeft size={15} />
                {tr("back")}
              </button>
            )}

            {/* Continue / Finish */}
            {step < steps.length ? (
              <button
                type="button"
                onClick={() => void handleNext()}
                disabled={geocoding}
                style={{ ...S.primaryBtn, opacity: geocoding ? 0.6 : 1, cursor: geocoding ? "wait" : "pointer" }}
              >
                {tr("continue")}
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
                {submitting
                  ? isEventMode
                    ? tr("creating")
                    : tr("registering")
                  : isEventMode
                    ? tr("createEvent")
                    : tr("completeRegistration")}
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
          {tr("footerNote")}{" "}
          {tr("footerQuestions")}{" "}
          <a
            href="mailto:soporte@jchat.cloud"
            style={{ color: "var(--color-brand)", textDecoration: "none" }}
          >
            soporte@jchat.cloud
          </a>
        </p>
      </div>
    </div>
  );
}

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

export default function BusinessRegisterPage() {
  const wizard = (
    <Suspense fallback={null}>
      <BusinessRegisterWizard />
    </Suspense>
  );
  // Same Maps key and loader as the dashboard (configuration page); without a key the owner types the coordinates.
  return MAPS_KEY ? <APIProvider apiKey={MAPS_KEY}>{wizard}</APIProvider> : wizard;
}
