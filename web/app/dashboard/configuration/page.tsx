/**
 * JChat 3.0 — Business Settings / Configuration (Task 2.16)
 *
 * Sections:
 *  1. Business Info  — name, description, category, address, phone, website
 *  2. Operating Hours — 7-day grid with open/close times + per-day closed toggle
 *  3. Coverage Radius — read-only display (Super Admin to change)
 *  4. Cover Photo + Icon Emoji — URL / emoji inputs (storage TODO)
 *  5. Photo Gallery Manager — add / reorder / remove image URLs (storage TODO)
 *  6. Menu Enabled — toggle for businesses.menu_enabled
 *  7. Dashboard Theme — 10-theme picker; applies instantly via useDashboardTheme
 *  8. Tip Configuration — enabled toggle + editable suggested percentages
 *  9. Payout Frequency — Daily / Weekly / Monthly (Stripe schedule TODO)
 *
 * Design: var(--db-*) tokens only. Icons: @tabler/icons-react.
 * Guard: isSupabaseConfigured before any live DB call.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  IconBuilding,
  IconClock,
  IconMapPin,
  IconPhoto,
  IconMenu2,
  IconPalette,
  IconCurrencyDollar,
  IconCalendarTime,
  IconAlertCircle,
  IconCheck,
  IconPlus,
  IconTrash,
  IconChevronUp,
  IconChevronDown,
  IconLock,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  useDashboardTheme,
  DASHBOARD_THEMES,
} from "@/hooks/useDashboardTheme";
import { ThemePreview } from "@/components/dashboard/ThemePreview";
import { LocationEditor } from "@/components/dashboard/LocationEditor";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BusinessRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  hours: HoursJson | null;
  radius_m: number | null;
  cover_url: string | null;
  icon_emoji: string | null;
  gallery_urls: string[] | null;
  menu_enabled: boolean;
  tips_enabled: boolean;
  tip_percentages: number[] | null;
  payout_frequency: "daily" | "weekly" | "monthly" | null;
  dashboard_theme_id: number | null;
}

/** Shape stored in businesses.hours (JSONB) */
interface DayHours {
  open: string;   // "HH:MM" 24-h
  close: string;  // "HH:MM" 24-h
  closed: boolean;
}

type HoursJson = Record<string, DayHours>;

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type Day = (typeof DAYS)[number];

const DEFAULT_DAY_HOURS: DayHours = { open: "09:00", close: "21:00", closed: false };

function defaultHours(): HoursJson {
  const h: HoursJson = {};
  for (const d of DAYS) h[d] = { ...DEFAULT_DAY_HOURS };
  return h;
}

const PAYOUT_OPTIONS = [
  { value: "daily",   label: "Daily"   },
  { value: "weekly",  label: "Weekly"  },
  { value: "monthly", label: "Monthly" },
] as const;

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "20px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: subtitle ? "4px" : "20px",
        }}
      >
        {icon}
        <h2
          style={{
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--db-text-primary)",
            margin: 0,
          }}
        >
          {title}
        </h2>
      </div>
      {subtitle && (
        <p
          style={{
            fontSize: "13px",
            color: "var(--db-text-secondary)",
            marginBottom: "20px",
            marginTop: 0,
          }}
        >
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
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

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: "8px",
        border: "1px solid var(--db-border)",
        background: disabled ? "var(--db-bg-elevated)" : "var(--db-bg-elevated)",
        color: disabled ? "var(--db-text-tertiary)" : "var(--db-text-primary)",
        fontSize: "14px",
        outline: "none",
        boxSizing: "border-box",
        cursor: disabled ? "not-allowed" : "text",
      }}
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        cursor: disabled ? "not-allowed" : "pointer",
        userSelect: "none",
      }}
    >
      <div
        onClick={() => !disabled && onChange(!checked)}
        style={{
          width: "40px",
          height: "22px",
          borderRadius: "999px",
          background: checked ? "var(--db-accent)" : "var(--db-border)",
          position: "relative",
          transition: "background 0.2s",
          flexShrink: 0,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "3px",
            left: checked ? "21px" : "3px",
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            background: "var(--db-accent-text)",
            transition: "left 0.2s",
          }}
        />
      </div>
      {label && (
        <span style={{ fontSize: "14px", color: "var(--db-text-primary)" }}>
          {label}
        </span>
      )}
    </label>
  );
}

function AlertBanner({
  type,
  message,
}: {
  type: "error" | "success" | "warning";
  message: string;
}) {
  const palettes = {
    error:   { bg: "rgba(239,68,68,0.10)",   color: "var(--db-danger)"  },
    success: { bg: "rgba(29,158,117,0.10)",  color: "var(--db-success)" },
    warning: { bg: "rgba(245,158,11,0.10)",  color: "var(--db-warning)" },
  };
  const p = palettes[type];
  const Icon = type === "success" ? IconCheck : IconAlertCircle;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "12px 16px",
        borderRadius: "8px",
        background: p.bg,
        color: p.color,
        fontSize: "14px",
        marginBottom: "16px",
      }}
    >
      <Icon size={16} />
      {message}
    </div>
  );
}

function PrimaryBtn({
  onClick,
  disabled,
  loading,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
}) {
  const dis = disabled ?? loading ?? false;
  return (
    <button
      onClick={onClick}
      disabled={dis}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "9px 18px",
        borderRadius: "8px",
        border: "none",
        background: dis ? "var(--db-text-tertiary)" : "var(--db-accent)",
        color: "var(--db-accent-text)",
        fontSize: "14px",
        fontWeight: 600,
        cursor: dis ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {loading ? "Saving…" : children}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ConfigurationPage() {
  // ── Business state ────────────────────────────────────────────────────────────
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [loadingBiz, setLoadingBiz] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── Section 1: Business info ──────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);

  // ── Section 2: Hours ──────────────────────────────────────────────────────────
  const [hours, setHours] = useState<HoursJson>(defaultHours());
  const [savingHours, setSavingHours] = useState(false);

  // ── Section 3: Radius (read-only) ────────────────────────────────────────────
  const [radiusM, setRadiusM] = useState<number | null>(null);

  // ── Section 4: Cover + emoji ──────────────────────────────────────────────────
  const [coverUrl, setCoverUrl] = useState("");
  const [iconEmoji, setIconEmoji] = useState("");
  const [savingCover, setSavingCover] = useState(false);

  // ── Section 5: Photo gallery ──────────────────────────────────────────────────
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [newGalleryUrl, setNewGalleryUrl] = useState("");
  const [savingGallery, setSavingGallery] = useState(false);

  // ── Section 6: Menu enabled ───────────────────────────────────────────────────
  const [menuEnabled, setMenuEnabled] = useState(false);
  const [savingMenu, setSavingMenu] = useState(false);

  // ── Section 7: Dashboard theme ────────────────────────────────────────────────
  const { themeId, setThemeId } = useDashboardTheme(1);
  const [savingTheme, setSavingTheme] = useState(false);

  // ── Section 8: Tips ───────────────────────────────────────────────────────────
  const [tipsEnabled, setTipsEnabled] = useState(false);
  const [tipPercentages, setTipPercentages] = useState<number[]>([15, 18, 20]);
  const [tipInput, setTipInput] = useState("");
  const [savingTips, setSavingTips] = useState(false);

  // ── Section 9: Payout frequency ──────────────────────────────────────────────
  const [payoutFrequency, setPayoutFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [savingPayout, setSavingPayout] = useState(false);

  // ── Resolve business + load ───────────────────────────────────────────────────
  const loadBusiness = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoadingBiz(false);
      return;
    }
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { setLoadingBiz(false); return; }

      const { data: biz, error: bizErr } = await supabase
        .from("businesses")
        .select(
          "id, name, description, category, address, phone, website, hours, radius_m, cover_url, icon_emoji, gallery_urls, menu_enabled, tips_enabled, tip_percentages, payout_frequency, dashboard_theme_id"
        )
        .eq("owner_id", user.id)
        .single();

      if (bizErr || !biz) { setLoadingBiz(false); return; }

      const b = biz as BusinessRow;
      setBusinessId(b.id);
      setName(b.name ?? "");
      setDescription(b.description ?? "");
      setCategory(b.category ?? "");
      setAddress(b.address ?? "");
      setPhone(b.phone ?? "");
      setWebsite(b.website ?? "");
      setHours(b.hours && Object.keys(b.hours).length > 0 ? b.hours : defaultHours());
      setRadiusM(b.radius_m ?? null);
      setCoverUrl(b.cover_url ?? "");
      setIconEmoji(b.icon_emoji ?? "");
      setGalleryUrls(b.gallery_urls ?? []);
      setMenuEnabled(b.menu_enabled ?? false);
      setTipsEnabled(b.tips_enabled ?? false);
      setTipPercentages(b.tip_percentages ?? [15, 18, 20]);
      setPayoutFrequency(b.payout_frequency ?? "weekly");
      if (b.dashboard_theme_id) setThemeId(b.dashboard_theme_id);
    } catch {
      // ignore: business not found
    } finally {
      setLoadingBiz(false);
    }
  }, [setThemeId]);

  useEffect(() => { void loadBusiness(); }, [loadBusiness]);

  // ── Generic patch helper ──────────────────────────────────────────────────────
  const patch = useCallback(
    async (payload: Partial<BusinessRow>): Promise<boolean> => {
      if (!isSupabaseConfigured || !businessId) return false;
      const { error: patchErr } = await supabase
        .from("businesses")
        .update(payload)
        .eq("id", businessId);
      if (patchErr) throw patchErr;
      return true;
    },
    [businessId]
  );

  const withSave = useCallback(
    async (
      setter: (v: boolean) => void,
      payload: Partial<BusinessRow>,
      successMsg: string
    ) => {
      setError(null);
      setSuccess(null);
      setter(true);
      try {
        await patch(payload);
        setSuccess(successMsg);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setter(false);
      }
    },
    [patch]
  );

  // ── Section handlers ──────────────────────────────────────────────────────────

  const handleSaveInfo = () =>
    withSave(setSavingInfo, { name, description, category, address, phone, website }, "Business info saved.");

  const handleSaveHours = () =>
    withSave(setSavingHours, { hours }, "Operating hours saved.");

  const handleSaveCover = () =>
    withSave(setSavingCover, { cover_url: coverUrl || null, icon_emoji: iconEmoji || null }, "Cover & emoji saved.");

  const handleSaveGallery = () =>
    withSave(setSavingGallery, { gallery_urls: galleryUrls }, "Gallery saved.");

  const handleSaveMenu = async (v: boolean) => {
    setMenuEnabled(v);
    await withSave(setSavingMenu, { menu_enabled: v }, `Menu ${v ? "enabled" : "disabled"}.`);
  };

  const handleThemePick = useCallback(
    async (id: number) => {
      setThemeId(id); // instant visual update
      setSavingTheme(true);
      setError(null);
      setSuccess(null);
      try {
        await patch({ dashboard_theme_id: id });
        setSuccess("Dashboard theme saved.");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSavingTheme(false);
      }
    },
    [patch, setThemeId]
  );

  const handleSaveTips = () =>
    withSave(setSavingTips, { tips_enabled: tipsEnabled, tip_percentages: tipPercentages }, "Tip settings saved.");

  const handleSavePayout = () => {
    // TODO(Task 3.6): call Stripe payout schedule API to update the connected account's payout interval
    void withSave(setSavingPayout, { payout_frequency: payoutFrequency }, "Payout frequency saved.");
  };

  // ── Hours helpers ─────────────────────────────────────────────────────────────
  const setDayField = (
    day: Day,
    field: keyof DayHours,
    value: string | boolean
  ) => {
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  // ── Tip percentage helpers ────────────────────────────────────────────────────
  const addTipPercentage = () => {
    const n = parseInt(tipInput, 10);
    if (isNaN(n) || n < 1 || n > 100) return;
    if (tipPercentages.includes(n)) return;
    setTipPercentages((prev) => [...prev, n].sort((a, b) => a - b));
    setTipInput("");
  };

  const removeTipPercentage = (pct: number) =>
    setTipPercentages((prev) => prev.filter((p) => p !== pct));

  // ── Gallery helpers ───────────────────────────────────────────────────────────
  const addGalleryUrl = () => {
    const url = newGalleryUrl.trim();
    if (!url) return;
    setGalleryUrls((prev) => [...prev, url]);
    setNewGalleryUrl("");
  };

  const removeGalleryUrl = (idx: number) =>
    setGalleryUrls((prev) => prev.filter((_, i) => i !== idx));

  const moveGalleryUrl = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= galleryUrls.length) return;
    setGalleryUrls((prev) => {
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  };

  // ── Not configured banner ─────────────────────────────────────────────────────
  const noSupabase = !isSupabaseConfigured;
  const noBiz = !loadingBiz && isSupabaseConfigured && !businessId;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 860 }}>
      {/* Page header */}
      <div style={{ marginBottom: "28px" }}>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "var(--db-text-primary)",
            marginBottom: "4px",
          }}
        >
          Configuration
        </h1>
        <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
          Business profile, operating hours, dashboard theme, and payment settings.
        </p>
      </div>

      {/* Global banners */}
      {error && <AlertBanner type="error" message={error} />}
      {success && <AlertBanner type="success" message={success} />}
      {noSupabase && (
        <AlertBanner
          type="warning"
          message="Demo mode: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable live saves."
        />
      )}
      {noBiz && (
        <AlertBanner
          type="warning"
          message="No business found for this account. Settings cannot be saved."
        />
      )}

      {/* ── 1. Business Info ─────────────────────────────────────────────────── */}
      <Section
        icon={<IconBuilding size={18} color="var(--db-accent)" />}
        title="Business Info"
        subtitle="Public-facing details shown on your venue profile."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
            marginBottom: "16px",
          }}
        >
          <div>
            <FieldLabel>Business name *</FieldLabel>
            <TextInput value={name} onChange={setName} placeholder="e.g. The Rusty Anchor" />
          </div>
          <div>
            <FieldLabel>Category</FieldLabel>
            <TextInput value={category} onChange={setCategory} placeholder="e.g. Bar, Restaurant, Club…" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <FieldLabel>Description</FieldLabel>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short description visible on the map pin and profile…"
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
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>
          <div>
            <FieldLabel>Address</FieldLabel>
            <TextInput value={address} onChange={setAddress} placeholder="123 Main St, City, State" />
          </div>
          <div>
            <FieldLabel>Phone</FieldLabel>
            <TextInput value={phone} onChange={setPhone} placeholder="+1 (555) 000-0000" type="tel" />
          </div>
          <div>
            <FieldLabel>Website</FieldLabel>
            <TextInput value={website} onChange={setWebsite} placeholder="https://yourbusiness.com" type="url" />
          </div>
        </div>
        <PrimaryBtn
          onClick={handleSaveInfo}
          disabled={noSupabase || noBiz}
          loading={savingInfo}
        >
          Save Info
        </PrimaryBtn>
      </Section>

      {/* ── 📍 Location & Geofence ───────────────────────────────────────────── */}
      <Section
        icon={<IconMapPin size={18} color="var(--db-accent)" />}
        title="Location & Geofence"
        subtitle="Set your venue's map position and geofence radius, or draw a custom area for an event."
      >
        <LocationEditor businessId={businessId} />
      </Section>

      {/* ── 2. Operating Hours ───────────────────────────────────────────────── */}
      <Section
        icon={<IconClock size={18} color="var(--db-accent)" />}
        title="Operating Hours"
        subtitle="Set open/close times per day. Toggle 'Closed' to mark a day as unavailable."
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "110px 1fr 1fr 80px",
              gap: "10px",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Day</span>
            <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Open</span>
            <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Close</span>
            <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Closed</span>
          </div>

          {DAYS.map((day) => {
            const d = hours[day] ?? DEFAULT_DAY_HOURS;
            return (
              <div
                key={day}
                style={{
                  display: "grid",
                  gridTemplateColumns: "110px 1fr 1fr 80px",
                  gap: "10px",
                  alignItems: "center",
                  opacity: d.closed ? 0.45 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                <span
                  style={{
                    fontSize: "14px",
                    color: "var(--db-text-primary)",
                    fontWeight: 500,
                  }}
                >
                  {day}
                </span>
                <input
                  type="time"
                  value={d.open}
                  onChange={(e) => setDayField(day, "open", e.target.value)}
                  disabled={d.closed}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border: "1px solid var(--db-border)",
                    background: "var(--db-bg-elevated)",
                    color: d.closed ? "var(--db-text-tertiary)" : "var(--db-text-primary)",
                    fontSize: "14px",
                    outline: "none",
                    cursor: d.closed ? "not-allowed" : "text",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
                <input
                  type="time"
                  value={d.close}
                  onChange={(e) => setDayField(day, "close", e.target.value)}
                  disabled={d.closed}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border: "1px solid var(--db-border)",
                    background: "var(--db-bg-elevated)",
                    color: d.closed ? "var(--db-text-tertiary)" : "var(--db-text-primary)",
                    fontSize: "14px",
                    outline: "none",
                    cursor: d.closed ? "not-allowed" : "text",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
                <Toggle
                  checked={d.closed}
                  onChange={(v) => setDayField(day, "closed", v)}
                />
              </div>
            );
          })}
        </div>
        <PrimaryBtn
          onClick={handleSaveHours}
          disabled={noSupabase || noBiz}
          loading={savingHours}
        >
          Save Hours
        </PrimaryBtn>
      </Section>

      {/* ── 3. Coverage Radius (read-only) ──────────────────────────────────── */}
      <Section
        icon={<IconMapPin size={18} color="var(--db-accent)" />}
        title="Coverage Radius"
        subtitle="Determines the geofencing area. Contact support to adjust."
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "14px 16px",
            borderRadius: "10px",
            background: "var(--db-bg-elevated)",
            border: "1px solid var(--db-border)",
            marginBottom: "10px",
          }}
        >
          <IconLock size={16} color="var(--db-text-tertiary)" />
          <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--db-text-primary)" }}>
            {radiusM != null ? `${radiusM.toLocaleString()} m` : loadingBiz ? "Loading…" : "Not set"}
          </span>
          <span style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>
            — read-only
          </span>
        </div>
        <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", margin: 0 }}>
          {/* TODO(Super Admin): radius change request — only Super Admin can modify coverage radius */}
          To change your coverage radius, submit a support request to your JChat administrator.
        </p>
      </Section>

      {/* ── 4. Cover Photo + Icon Emoji ─────────────────────────────────────── */}
      <Section
        icon={<IconPhoto size={18} color="var(--db-accent)" />}
        title="Cover Photo & Icon"
        subtitle="Displayed on your map pin and public venue profile."
      >
        {/* Cover URL preview */}
        {coverUrl && (
          <div
            style={{
              width: "100%",
              height: "140px",
              borderRadius: "10px",
              overflow: "hidden",
              marginBottom: "14px",
              background: "var(--db-bg-elevated)",
              border: "1px solid var(--db-border)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverUrl}
              alt="Cover preview"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "16px",
            marginBottom: "16px",
            alignItems: "flex-end",
          }}
        >
          <div>
            <FieldLabel>Cover photo URL</FieldLabel>
            {/* TODO(storage): replace with Supabase Storage upload when wired */}
            <TextInput value={coverUrl} onChange={setCoverUrl} placeholder="https://… (Supabase Storage URL)" type="url" />
            <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginTop: "4px", marginBottom: 0 }}>
              {/* TODO(storage): real upload via Supabase Storage */}
              Paste a URL for now; file upload coming when Storage is wired.
            </p>
          </div>
          <div>
            <FieldLabel>Icon emoji</FieldLabel>
            <input
              type="text"
              value={iconEmoji}
              onChange={(e) => setIconEmoji(e.target.value)}
              placeholder="🍺"
              maxLength={2}
              style={{
                width: "64px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid var(--db-border)",
                background: "var(--db-bg-elevated)",
                color: "var(--db-text-primary)",
                fontSize: "24px",
                textAlign: "center",
                outline: "none",
              }}
            />
          </div>
        </div>
        <PrimaryBtn
          onClick={handleSaveCover}
          disabled={noSupabase || noBiz}
          loading={savingCover}
        >
          Save Cover & Emoji
        </PrimaryBtn>
      </Section>

      {/* ── 5. Photo Gallery ────────────────────────────────────────────────── */}
      <Section
        icon={<IconPhoto size={18} color="var(--db-accent)" />}
        title="Photo Gallery"
        subtitle="Upload and reorder photos shown on your public venue profile."
      >
        {/* Add URL row */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "flex-end",
            marginBottom: "16px",
          }}
        >
          <div style={{ flex: 1 }}>
            <FieldLabel>Image URL</FieldLabel>
            {/* TODO(storage): replace URL input with file upload when Supabase Storage is wired */}
            <TextInput
              value={newGalleryUrl}
              onChange={setNewGalleryUrl}
              placeholder="https://… (Supabase Storage URL)"
              type="url"
            />
          </div>
          <button
            onClick={addGalleryUrl}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid var(--db-border)",
              background: "transparent",
              color: "var(--db-accent)",
              fontSize: "14px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <IconPlus size={14} /> Add
          </button>
        </div>

        {/* Gallery list */}
        {galleryUrls.length === 0 ? (
          <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", marginBottom: "16px" }}>
            No photos yet. Paste an image URL above to add one.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
            {galleryUrls.map((url, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  background: "var(--db-bg-elevated)",
                  border: "1px solid var(--db-border)",
                }}
              >
                {/* Thumbnail */}
                <div
                  style={{
                    width: "48px",
                    height: "36px",
                    borderRadius: "6px",
                    overflow: "hidden",
                    flexShrink: 0,
                    background: "var(--db-border)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
                {/* URL (truncated) */}
                <span
                  style={{
                    flex: 1,
                    fontSize: "13px",
                    color: "var(--db-text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                  }}
                >
                  {url}
                </span>
                {/* Reorder */}
                <div style={{ display: "flex", flexDirection: "column", gap: "2px", flexShrink: 0 }}>
                  <button
                    onClick={() => moveGalleryUrl(idx, -1)}
                    disabled={idx === 0}
                    aria-label="Move up"
                    style={{
                      background: "none",
                      border: "none",
                      color: idx === 0 ? "var(--db-text-tertiary)" : "var(--db-text-secondary)",
                      cursor: idx === 0 ? "not-allowed" : "pointer",
                      padding: "2px",
                      display: "flex",
                    }}
                  >
                    <IconChevronUp size={14} />
                  </button>
                  <button
                    onClick={() => moveGalleryUrl(idx, 1)}
                    disabled={idx === galleryUrls.length - 1}
                    aria-label="Move down"
                    style={{
                      background: "none",
                      border: "none",
                      color: idx === galleryUrls.length - 1 ? "var(--db-text-tertiary)" : "var(--db-text-secondary)",
                      cursor: idx === galleryUrls.length - 1 ? "not-allowed" : "pointer",
                      padding: "2px",
                      display: "flex",
                    }}
                  >
                    <IconChevronDown size={14} />
                  </button>
                </div>
                {/* Delete */}
                <button
                  onClick={() => removeGalleryUrl(idx)}
                  aria-label="Remove photo"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--db-danger)",
                    cursor: "pointer",
                    padding: "4px",
                    display: "flex",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <IconTrash size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        <PrimaryBtn
          onClick={handleSaveGallery}
          disabled={noSupabase || noBiz}
          loading={savingGallery}
        >
          Save Gallery
        </PrimaryBtn>
      </Section>

      {/* ── 6. Menu Enabled ─────────────────────────────────────────────────── */}
      <Section
        icon={<IconMenu2 size={18} color="var(--db-accent)" />}
        title="Menu"
        subtitle="Show the menu icon in your chat room. Requires at least one menu item (Task 3.1)."
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <Toggle
            checked={menuEnabled}
            onChange={handleSaveMenu}
            label="Menu enabled"
            disabled={noSupabase || noBiz || savingMenu}
          />
          {savingMenu && (
            <span style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>Saving…</span>
          )}
        </div>
        <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", marginTop: "12px", marginBottom: 0 }}>
          When disabled, the menu icon is hidden from chat room members.
          {/* Controls businesses.menu_enabled → read by chat room icon logic */}
        </p>
      </Section>

      {/* ── 7. Dashboard Theme ──────────────────────────────────────────────── */}
      <Section
        icon={<IconPalette size={18} color="var(--db-accent)" />}
        title="Dashboard Theme"
        subtitle="Applies instantly. Saved to your business profile so it persists across sessions."
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "14px",
            marginBottom: "16px",
          }}
        >
          {DASHBOARD_THEMES.map((t) => {
            const isActive = themeId === t.id;
            return (
              <button
                key={t.id}
                onClick={() => void handleThemePick(t.id)}
                style={{
                  background: "none",
                  border: isActive
                    ? "2px solid var(--db-accent)"
                    : "2px solid transparent",
                  borderRadius: "12px",
                  padding: "4px",
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                  outline: "none",
                }}
                aria-label={`Select ${t.name} theme`}
                aria-pressed={isActive}
              >
                <ThemePreview themeKey={t.key} label={t.name} />
              </button>
            );
          })}
        </div>
        {savingTheme && (
          <span style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>
            Saving theme…
          </span>
        )}
      </Section>

      {/* ── 8. Tip Configuration ────────────────────────────────────────────── */}
      <Section
        icon={<IconCurrencyDollar size={18} color="var(--db-accent)" />}
        title="Tip Configuration"
        subtitle="Enable tips and set the suggested percentages shown to customers at checkout."
      >
        <div style={{ marginBottom: "20px" }}>
          <Toggle
            checked={tipsEnabled}
            onChange={setTipsEnabled}
            label="Tips enabled"
          />
        </div>

        {tipsEnabled && (
          <>
            <FieldLabel>Suggested percentages</FieldLabel>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                marginBottom: "14px",
              }}
            >
              {tipPercentages.map((pct) => (
                <div
                  key={pct}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    borderRadius: "999px",
                    background: "var(--db-accent-bg)",
                    color: "var(--db-accent)",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  {pct}%
                  <button
                    onClick={() => removeTipPercentage(pct)}
                    aria-label={`Remove ${pct}%`}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--db-accent)",
                      cursor: "pointer",
                      padding: "0",
                      display: "flex",
                      alignItems: "center",
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", marginBottom: "16px" }}>
              <div style={{ flex: "0 0 120px" }}>
                <FieldLabel>Add percentage</FieldLabel>
                <TextInput
                  value={tipInput}
                  onChange={setTipInput}
                  placeholder="e.g. 25"
                  type="number"
                />
              </div>
              <button
                onClick={addTipPercentage}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid var(--db-border)",
                  background: "transparent",
                  color: "var(--db-accent)",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                <IconPlus size={14} /> Add
              </button>
            </div>
          </>
        )}

        <PrimaryBtn
          onClick={handleSaveTips}
          disabled={noSupabase || noBiz}
          loading={savingTips}
        >
          Save Tip Settings
        </PrimaryBtn>
      </Section>

      {/* ── 9. Payout Frequency ─────────────────────────────────────────────── */}
      <Section
        icon={<IconCalendarTime size={18} color="var(--db-accent)" />}
        title="Payout Frequency"
        subtitle="How often Stripe transfers your earnings to your bank account."
      >
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "16px",
            flexWrap: "wrap",
          }}
        >
          {PAYOUT_OPTIONS.map((opt) => {
            const isActive = payoutFrequency === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setPayoutFrequency(opt.value)}
                style={{
                  padding: "9px 20px",
                  borderRadius: "8px",
                  border: isActive
                    ? "2px solid var(--db-accent)"
                    : "1px solid var(--db-border)",
                  background: isActive ? "var(--db-accent-bg)" : "transparent",
                  color: isActive ? "var(--db-accent)" : "var(--db-text-secondary)",
                  fontSize: "14px",
                  fontWeight: isActive ? 600 : 400,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                aria-pressed={isActive}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", marginBottom: "16px" }}>
          {/* TODO(Task 3.6): call Stripe payout schedule API to update the connected account's interval_count + interval */}
          Payout schedule is managed via Stripe Connect. Changes apply from the next settlement cycle.
        </p>
        <PrimaryBtn
          onClick={handleSavePayout}
          disabled={noSupabase || noBiz}
          loading={savingPayout}
        >
          Save Payout Frequency
        </PrimaryBtn>
      </Section>
    </div>
  );
}
