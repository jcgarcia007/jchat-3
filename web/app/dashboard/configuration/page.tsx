/**
 * JChat 3.0 — Business Settings / Configuration (Task 2.16)
 *
 * Sections:
 *  1. Business Info  — name, description, category, address, phone, website
 *  2. Operating Hours — 7-day grid with open/close times + per-day closed toggle
 *  3. Cover Photo + Icon Emoji — URL / emoji inputs (storage TODO)
 *  4. Photo Gallery Manager — add / reorder / remove image URLs (storage TODO)
 *  5. Menu Enabled — toggle for businesses.menu_enabled
 *  6. Dashboard Theme — 10-theme picker; applies instantly via useDashboardTheme
 *  7. Tip Configuration — enabled toggle + editable suggested percentages
 *  8. Payout Frequency — Daily / Weekly / Monthly (Stripe schedule TODO)
 *
 * Design: var(--db-*) tokens only. Icons: @tabler/icons-react.
 * Guard: isSupabaseConfigured before any live DB call.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { resolveActiveBusiness } from "@/lib/business";
import { DASHBOARD_THEMES } from "@/hooks/useDashboardTheme";
import { useDashboardThemeContext } from "@/components/dashboard/DashboardThemeProvider";
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
  cover_url: string | null;
  icon_emoji: string | null;
  gallery_urls: string[] | null;
  menu_enabled: boolean;
  tips_enabled: boolean;
  tip_percentages: number[] | null;
  payout_frequency: "daily" | "weekly" | "monthly" | null;
  dashboard_theme_id?: number;
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
  const t = useTranslations("dashboardCommon");
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
      {loading ? t("tablesSavingState") : children}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ConfigurationPage() {
  const t = useTranslations("dashboardCommon");

  const dayLabels: Record<Day, string> = {
    Monday: t("configurationDayMonday"),
    Tuesday: t("configurationDayTuesday"),
    Wednesday: t("configurationDayWednesday"),
    Thursday: t("configurationDayThursday"),
    Friday: t("configurationDayFriday"),
    Saturday: t("configurationDaySaturday"),
    Sunday: t("configurationDaySunday"),
  };

  const payoutLabels: Record<"daily" | "weekly" | "monthly", string> = {
    daily: t("configurationPayoutDaily"),
    weekly: t("configurationPayoutWeekly"),
    monthly: t("configurationPayoutMonthly"),
  };

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

  // ── Section 3: Cover + emoji ──────────────────────────────────────────────────
  const [coverUrl, setCoverUrl] = useState("");
  const [iconEmoji, setIconEmoji] = useState("");
  const [savingCover, setSavingCover] = useState(false);

  // ── Section 4: Photo gallery ──────────────────────────────────────────────────
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [newGalleryUrl, setNewGalleryUrl] = useState("");
  const [savingGallery, setSavingGallery] = useState(false);

  // ── Section 5: Menu enabled ───────────────────────────────────────────────────
  const [menuEnabled, setMenuEnabled] = useState(false);
  const [savingMenu, setSavingMenu] = useState(false);

  // ── Section 6: Dashboard theme ────────────────────────────────────────────────
  // Shared with the layout via context so the picker updates the layout's
  // data-db-theme wrapper (not a local, isolated copy).
  const { themeId, setThemeId } = useDashboardThemeContext();
  const [savingTheme, setSavingTheme] = useState(false);

  // ── Section 7: Tips ───────────────────────────────────────────────────────────
  const [tipsEnabled, setTipsEnabled] = useState(false);
  const [tipPercentages, setTipPercentages] = useState<number[]>([15, 18, 20]);
  const [tipInput, setTipInput] = useState("");
  const [savingTips, setSavingTips] = useState(false);

  // ── Section 8: Payout frequency ──────────────────────────────────────────────
  const [payoutFrequency, setPayoutFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [savingPayout, setSavingPayout] = useState(false);

  // ── Resolve business + load ───────────────────────────────────────────────────
  const loadBusiness = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoadingBiz(false);
      return;
    }
    try {
      // Step 1: resolve the active business (reads active_business_id, handles multi-business owners).
      // Uses resolveActiveBusiness() — the same resolver the rest of the dashboard uses — so the
      // business selector in the top bar is respected. .single() on owner_id was the bug: it fails
      // with PGRST116 ("multiple rows") for owners with >1 businesses (e.g. the super_admin).
      const res = await resolveActiveBusiness();
      if (!res.ok) {
        // no_business / unauthenticated / error → businessId stays null → noBiz banner.
        setLoadingBiz(false);
        return;
      }

      // Step 2: fetch all Configuration-specific fields for that resolved business id.
      // resolveActiveBusiness only returns a subset of columns; Configuration needs the rest.
      const { data: biz } = await supabase
        .from("businesses")
        .select(
          "id, name, description, category, address, phone, website, hours, cover_url, icon_emoji, gallery_urls, menu_enabled, tips_enabled, tip_percentages, payout_frequency, dashboard_theme_id"
        )
        .eq("id", res.business.id)
        .maybeSingle();

      if (!biz) { setLoadingBiz(false); return; }

      const b = biz as BusinessRow;
      setBusinessId(b.id);
      setName(b.name ?? "");
      setDescription(b.description ?? "");
      setCategory(b.category ?? "");
      setAddress(b.address ?? "");
      setPhone(b.phone ?? "");
      setWebsite(b.website ?? "");
      setHours(b.hours && Object.keys(b.hours).length > 0 ? b.hours : defaultHours());
      setCoverUrl(b.cover_url ?? "");
      setIconEmoji(b.icon_emoji ?? "");
      setGalleryUrls(b.gallery_urls ?? []);
      setMenuEnabled(b.menu_enabled ?? false);
      setTipsEnabled(b.tips_enabled ?? false);
      setTipPercentages(b.tip_percentages ?? [15, 18, 20]);
      setPayoutFrequency(b.payout_frequency ?? "weekly");
      if (b.dashboard_theme_id) setThemeId(b.dashboard_theme_id);
    } catch {
      // ignore unexpected errors — businessId stays null → noBiz banner
    } finally {
      setLoadingBiz(false);
    }
  }, [setThemeId]);

  useEffect(() => { void loadBusiness(); }, [loadBusiness]);

  // ── Generic patch helper ──────────────────────────────────────────────────────
  const patch = useCallback(
    async (payload: Partial<BusinessRow>): Promise<boolean> => {
      // Demo mode: no Supabase — pretend-save (acceptable; user is just exploring the UI).
      if (!isSupabaseConfigured) return false;
      // Real mode with no resolved business: throw so withSave shows an error instead of
      // silently displaying "guardado" when nothing was actually persisted.
      if (!businessId) throw new Error("No se pudo guardar: no hay un negocio activo resuelto.");
      const { error: patchErr } = await supabase
        .from("businesses")
        .update(payload as unknown as Database["public"]["Tables"]["businesses"]["Update"])
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
    withSave(setSavingInfo, { name, description, category, address, phone, website }, t("configurationInfoSavedSuccess"));

  const handleSaveHours = () =>
    withSave(setSavingHours, { hours }, t("configurationHoursSavedSuccess"));

  const handleSaveCover = () =>
    withSave(setSavingCover, { cover_url: coverUrl || null, icon_emoji: iconEmoji || null }, t("configurationCoverSavedSuccess"));

  const handleSaveGallery = () =>
    withSave(setSavingGallery, { gallery_urls: galleryUrls }, t("configurationGallerySavedSuccess"));

  const handleSaveMenu = async (v: boolean) => {
    setMenuEnabled(v);
    await withSave(
      setSavingMenu,
      { menu_enabled: v },
      v ? t("configurationMenuEnabledSuccess") : t("configurationMenuDisabledSuccess")
    );
  };

  const handleThemePick = useCallback(
    async (id: number) => {
      setThemeId(id); // instant visual update
      setSavingTheme(true);
      setError(null);
      setSuccess(null);
      try {
        await patch({ dashboard_theme_id: id });
        setSuccess(t("configurationThemeSavedSuccess"));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSavingTheme(false);
      }
    },
    [patch, setThemeId, t]
  );

  const handleSaveTips = () =>
    withSave(setSavingTips, { tips_enabled: tipsEnabled, tip_percentages: tipPercentages }, t("configurationTipsSavedSuccess"));

  const handleSavePayout = () => {
    // TODO(Task 3.6): call Stripe payout schedule API to update the connected account's payout interval
    void withSave(setSavingPayout, { payout_frequency: payoutFrequency }, t("configurationPayoutSavedSuccess"));
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
          {t("railConfiguracion")}
        </h1>
        <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
          {t("configurationSubtitle")}
        </p>
      </div>

      {/* Global banners */}
      {error && <AlertBanner type="error" message={error} />}
      {success && <AlertBanner type="success" message={success} />}
      {noSupabase && (
        <AlertBanner
          type="warning"
          message={t("configurationDemoModeMessage")}
        />
      )}
      {noBiz && (
        <AlertBanner
          type="warning"
          message={t("configurationNoBusinessMessage")}
        />
      )}

      {/* ── 1. Business Info ─────────────────────────────────────────────────── */}
      <Section
        icon={<IconBuilding size={18} color="var(--db-accent)" />}
        title={t("configurationBusinessInfoTitle")}
        subtitle={t("configurationBusinessInfoSubtitle")}
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
            <FieldLabel>{t("configurationBusinessNameLabel")}</FieldLabel>
            <TextInput value={name} onChange={setName} placeholder={t("configurationBusinessNamePlaceholder")} />
          </div>
          <div>
            <FieldLabel>{t("configurationCategoryLabel")}</FieldLabel>
            <TextInput value={category} onChange={setCategory} placeholder={t("configurationCategoryPlaceholder")} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <FieldLabel>{t("loyaltyRewardDescriptionLabel")}</FieldLabel>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("configurationDescriptionPlaceholder")}
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
            <FieldLabel>{t("configurationAddressLabel")}</FieldLabel>
            <TextInput value={address} onChange={setAddress} placeholder={t("configurationAddressPlaceholder")} />
          </div>
          <div>
            <FieldLabel>{t("configurationPhoneLabel")}</FieldLabel>
            <TextInput value={phone} onChange={setPhone} placeholder="+1 (555) 000-0000" type="tel" />
          </div>
          <div>
            <FieldLabel>{t("configurationWebsiteLabel")}</FieldLabel>
            <TextInput value={website} onChange={setWebsite} placeholder="https://yourbusiness.com" type="url" />
          </div>
        </div>
        <PrimaryBtn
          onClick={handleSaveInfo}
          disabled={noSupabase || noBiz}
          loading={savingInfo}
        >
          {t("configurationSaveInfoButton")}
        </PrimaryBtn>
      </Section>

      {/* ── 📍 Location & Geofence ───────────────────────────────────────────── */}
      <Section
        icon={<IconMapPin size={18} color="var(--db-accent)" />}
        title={t("configurationLocationSectionTitle")}
        subtitle={t("configurationLocationSectionSubtitle")}
      >
        <LocationEditor businessId={businessId} onAddressResolved={setAddress} />
      </Section>

      {/* ── 2. Operating Hours ───────────────────────────────────────────────── */}
      <Section
        icon={<IconClock size={18} color="var(--db-accent)" />}
        title={t("configurationHoursSectionTitle")}
        subtitle={t("configurationHoursSectionSubtitle")}
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
            <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{t("configurationDayColumnLabel")}</span>
            <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{t("configurationOpenColumnLabel")}</span>
            <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{t("configurationCloseColumnLabel")}</span>
            <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{t("configurationClosedColumnLabel")}</span>
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
                  {dayLabels[day]}
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
          {t("configurationSaveHoursButton")}
        </PrimaryBtn>
      </Section>

      {/* ── 3. Cover Photo + Icon Emoji ─────────────────────────────────────── */}
      <Section
        icon={<IconPhoto size={18} color="var(--db-accent)" />}
        title={t("configurationCoverSectionTitle")}
        subtitle={t("configurationCoverSectionSubtitle")}
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
              alt={t("configurationCoverPreviewAlt")}
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
            <FieldLabel>{t("configurationCoverUrlLabel")}</FieldLabel>
            {/* TODO(storage): replace with Supabase Storage upload when wired */}
            <TextInput value={coverUrl} onChange={setCoverUrl} placeholder={t("configurationStorageUrlPlaceholder")} type="url" />
            <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginTop: "4px", marginBottom: 0 }}>
              {/* TODO(storage): real upload via Supabase Storage */}
              {t("configurationCoverUploadNote")}
            </p>
          </div>
          <div>
            <FieldLabel>{t("configurationIconEmojiLabel")}</FieldLabel>
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
          {t("configurationSaveCoverButton")}
        </PrimaryBtn>
      </Section>

      {/* ── 4. Photo Gallery ────────────────────────────────────────────────── */}
      <Section
        icon={<IconPhoto size={18} color="var(--db-accent)" />}
        title={t("configurationGallerySectionTitle")}
        subtitle={t("configurationGallerySectionSubtitle")}
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
            <FieldLabel>{t("configurationImageUrlLabel")}</FieldLabel>
            {/* TODO(storage): replace URL input with file upload when Supabase Storage is wired */}
            <TextInput
              value={newGalleryUrl}
              onChange={setNewGalleryUrl}
              placeholder={t("configurationStorageUrlPlaceholder")}
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
            <IconPlus size={14} /> {t("terminalModifierAddDefault")}
          </button>
        </div>

        {/* Gallery list */}
        {galleryUrls.length === 0 ? (
          <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", marginBottom: "16px" }}>
            {t("configurationNoPhotosMessage")}
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
                    aria-label={t("configurationMoveUpAria")}
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
                    aria-label={t("configurationMoveDownAria")}
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
                  aria-label={t("configurationRemovePhotoAria")}
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
          {t("configurationSaveGalleryButton")}
        </PrimaryBtn>
      </Section>

      {/* ── 5. Menu Enabled ─────────────────────────────────────────────────── */}
      <Section
        icon={<IconMenu2 size={18} color="var(--db-accent)" />}
        title={t("navMenu")}
        subtitle={t("configurationMenuSectionSubtitle")}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <Toggle
            checked={menuEnabled}
            onChange={handleSaveMenu}
            label={t("configurationMenuEnabledLabel")}
            disabled={noSupabase || noBiz || savingMenu}
          />
          {savingMenu && (
            <span style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>{t("tablesSavingState")}</span>
          )}
        </div>
        <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", marginTop: "12px", marginBottom: 0 }}>
          {t("configurationMenuDisabledNote")}
          {/* Controls businesses.menu_enabled → read by chat room icon logic */}
        </p>
      </Section>

      {/* ── 6. Dashboard Theme ──────────────────────────────────────────────── */}
      <Section
        icon={<IconPalette size={18} color="var(--db-accent)" />}
        title={t("configurationThemeSectionTitle")}
        subtitle={t("configurationThemeSectionSubtitle")}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "14px",
            marginBottom: "16px",
          }}
        >
          {DASHBOARD_THEMES.map((ot) => {
            const isActive = themeId === ot.id;
            return (
              <button
                key={ot.id}
                onClick={() => void handleThemePick(ot.id)}
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
                aria-label={t("configurationSelectThemeAria", { name: ot.name })}
                aria-pressed={isActive}
              >
                <ThemePreview themeKey={ot.key} label={ot.name} />
              </button>
            );
          })}
        </div>
        {savingTheme && (
          <span style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>
            {t("configurationSavingThemeState")}
          </span>
        )}
      </Section>

      {/* ── 7. Tip Configuration ────────────────────────────────────────────── */}
      <Section
        icon={<IconCurrencyDollar size={18} color="var(--db-accent)" />}
        title={t("configurationTipsSectionTitle")}
        subtitle={t("configurationTipsSectionSubtitle")}
      >
        <div style={{ marginBottom: "20px" }}>
          <Toggle
            checked={tipsEnabled}
            onChange={setTipsEnabled}
            label={t("configurationTipsEnabledLabel")}
          />
        </div>

        {tipsEnabled && (
          <>
            <FieldLabel>{t("configurationSuggestedPercentagesLabel")}</FieldLabel>
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
                    aria-label={t("configurationRemovePercentAria", { pct })}
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
                <FieldLabel>{t("configurationAddPercentageLabel")}</FieldLabel>
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
                <IconPlus size={14} /> {t("terminalModifierAddDefault")}
              </button>
            </div>
          </>
        )}

        <PrimaryBtn
          onClick={handleSaveTips}
          disabled={noSupabase || noBiz}
          loading={savingTips}
        >
          {t("configurationSaveTipsButton")}
        </PrimaryBtn>
      </Section>

      {/* ── 8. Payout Frequency ─────────────────────────────────────────────── */}
      <Section
        icon={<IconCalendarTime size={18} color="var(--db-accent)" />}
        title={t("configurationPayoutSectionTitle")}
        subtitle={t("configurationPayoutSectionSubtitle")}
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
                {payoutLabels[opt.value]}
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", marginBottom: "16px" }}>
          {/* TODO(Task 3.6): call Stripe payout schedule API to update the connected account's interval_count + interval */}
          {t("configurationPayoutNote")}
        </p>
        <PrimaryBtn
          onClick={handleSavePayout}
          disabled={noSupabase || noBiz}
          loading={savingPayout}
        >
          {t("configurationSavePayoutButton")}
        </PrimaryBtn>
      </Section>
    </div>
  );
}
