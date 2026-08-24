"use client";

/**
 * JChat 3.0 — Configuración › Negocios (Dashboard 4A).
 *
 * New home for creating businesses/events (moved out of Overview, which becomes
 * the sales summary later). Lists the owner's businesses + events with an
 * "Activar" action and links to the existing create flow (/dashboard/create) —
 * NO form is rebuilt here. Reuses @/lib/business helpers; --db-* tokens only.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  IconBuildingStore,
  IconArrowRight,
  IconCalendarEvent,
  IconExternalLink,
  IconMapPin,
  IconCircleCheck,
  IconPlus,
  IconPalette,
  IconCheck,
} from "@tabler/icons-react";
import { supabase } from "@/lib/supabase";
import {
  brandColorOrDefault,
  RECEIPT_COLOR_SWATCHES,
} from "@/lib/receiptColor";
import {
  listUserBusinesses,
  listUserEvents,
  resolveActiveBusiness,
  setActiveBusiness,
  type BusinessListItem,
  type EventListItem,
} from "@/lib/business";
import { getUsageAndLimits, type UsageAndLimits } from "@/lib/planLimits";
import { notifyActiveBusinessChanged } from "@/components/dashboard/useActiveBusinessName";

const CARD: React.CSSProperties = {
  background: "var(--db-bg-surface)",
  border: "1px solid var(--db-border)",
  borderRadius: "14px",
  padding: "24px",
  maxWidth: "640px",
  display: "flex",
  alignItems: "center",
  gap: "20px",
  flexWrap: "wrap",
};

const ICON_BOX: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "48px",
  height: "48px",
  borderRadius: "12px",
  background: "var(--db-accent-bg)",
  color: "var(--db-accent)",
  flexShrink: 0,
};

const CTA: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "11px 18px",
  borderRadius: "10px",
  background: "var(--db-accent)",
  color: "var(--db-accent-text)",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const SECONDARY_BTN: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "10px 16px",
  borderRadius: "10px",
  background: "transparent",
  color: "var(--db-text-primary)",
  border: "1px solid var(--db-border)",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
  color: "var(--db-text-primary)",
  margin: "0 0 14px",
};

// ---------------------------------------------------------------------------
// Receipt Brand Color Card — shows for the active business only
// ---------------------------------------------------------------------------

function ReceiptBrandColorCard({ businessId }: { businessId: string }) {
  const t = useTranslations("dashboardCommon");
  const [color, setColor] = useState("#5C7CFA");
  const [customHex, setCustomHex] = useState("#5C7CFA");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase
      .from("businesses")
      .select("receipt_brand_color")
      .eq("id", businessId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        const c = brandColorOrDefault(data?.receipt_brand_color ?? null);
        setColor(c);
        setCustomHex(c);
        setLoaded(true);
      });
    return () => { active = false; };
  }, [businessId, supabase]);

  const applyColor = (hex: string) => {
    setColor(hex);
    setCustomHex(hex);
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const { error } = await supabase
      .from("businesses")
      .update({ receipt_brand_color: color })
      .eq("id", businessId);
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  if (!loaded) return null;

  return (
    <section
      style={{
        ...CARD,
        flexDirection: "column",
        alignItems: "flex-start",
        marginBottom: "12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <IconPalette size={18} style={{ color: "var(--db-accent)" }} />
        <h3 style={{ ...SECTION_TITLE, margin: 0 }}>{t("receiptBrandColorLabel")}</h3>
      </div>
      <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "0 0 14px" }}>
        {t("receiptBrandColorHint")}
      </p>

      {/* Swatches */}
      <div style={{ fontSize: "12px", color: "var(--db-text-secondary)", marginBottom: 8 }}>
        {t("receiptBrandColorSwatchesLabel")}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {RECEIPT_COLOR_SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            disabled={saving}
            onClick={() => applyColor(hex)}
            title={hex}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: hex,
              border: color === hex ? "3px solid var(--db-text-primary)" : "2px solid transparent",
              boxShadow:
                color === hex
                  ? "0 0 0 2px var(--db-bg-surface), 0 0 0 4px var(--db-text-primary)"
                  : "0 1px 3px rgba(0,0,0,0.2)",
              cursor: saving ? "not-allowed" : "pointer",
              padding: 0,
              flexShrink: 0,
            }}
          />
        ))}
      </div>

      {/* Custom input */}
      <div style={{ fontSize: "12px", color: "var(--db-text-secondary)", marginBottom: 6 }}>
        {t("receiptBrandColorCustom")}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <input
          type="color"
          value={customHex.length === 7 && customHex.startsWith("#") ? customHex : "#5C7CFA"}
          disabled={saving}
          onChange={(e) => applyColor(e.target.value)}
          style={{
            width: 40,
            height: 34,
            borderRadius: 8,
            border: "1px solid var(--db-border)",
            padding: 2,
            cursor: saving ? "not-allowed" : "pointer",
            background: "var(--db-bg-surface)",
          }}
        />
        <input
          type="text"
          value={customHex}
          disabled={saving}
          placeholder="#5C7CFA"
          maxLength={7}
          onChange={(e) => {
            setCustomHex(e.target.value);
            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setColor(e.target.value);
          }}
          style={{
            flex: 1,
            maxWidth: 140,
            padding: "7px 10px",
            borderRadius: 8,
            border: "1px solid var(--db-border)",
            background: "var(--db-bg-surface)",
            color: "var(--db-text-primary)",
            fontSize: "13px",
            fontFamily: "monospace",
            outline: "none",
          }}
        />
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: color,
            border: "1px solid var(--db-border)",
            flexShrink: 0,
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        style={{
          ...CTA,
          cursor: saving ? "wait" : "pointer",
          opacity: saving ? 0.7 : 1,
          gap: 8,
        }}
      >
        {saved ? <IconCheck size={16} /> : null}
        {saving
          ? t("receiptBrandColorSaving")
          : saved
          ? t("receiptBrandColorSaved")
          : t("receiptBrandColorSave")}
      </button>
    </section>
  );
}

function VerificationBadge({ isVerified }: { isVerified: boolean }) {
  const t = useTranslations("dashboardCommon");
  if (!isVerified) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "3px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        background: "rgba(34,197,94,0.12)",
        color: "var(--db-success)",
      }}
    >
      <IconCircleCheck size={13} />
      {t("verifiedBadge")}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("dashboardCommon");
  const statusKey =
    status === "upcoming" ? "eventStatusUpcoming" : status === "ended" ? "eventStatusEnded" : "eventStatusLive";
  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: "999px",
        background: "var(--db-bg-overlay)",
        color: "var(--db-text-secondary)",
        textTransform: "capitalize",
      }}
    >
      {t(statusKey)}
    </span>
  );
}

// Derive an event's status from its validity window (event = temporary business).
function eventStatus(startsAt: string | null, endsAt: string | null): string {
  const now = Date.now();
  const s = startsAt ? new Date(startsAt).getTime() : null;
  const e = endsAt ? new Date(endsAt).getTime() : null;
  if (s && now < s) return "upcoming";
  if (e && now > e) return "ended";
  return "live";
}

export default function ConfigBusinessesPage() {
  const t = useTranslations("dashboardCommon");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [businesses, setBusinesses] = useState<BusinessListItem[]>([]);
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageAndLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      listUserBusinesses(),
      listUserEvents(),
      resolveActiveBusiness(),
      getUsageAndLimits(),
    ]).then(([biz, evs, res, usageRes]) => {
      if (!active) return;
      setBusinesses(biz);
      setEvents(evs);
      setActiveId(res.ok ? res.business.id : null);
      setUsage(usageRes);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleSetActive(id: string) {
    if (id === activeId) return;
    setSwitchingId(id);
    const ok = await setActiveBusiness(id);
    setSwitchingId(null);
    if (ok) {
      setActiveId(id);
      notifyActiveBusinessChanged(); // sync the rail avatar + subnav switcher
      router.refresh(); // re-fetch server components without leaving the page
    }
  }

  const loadingRow = (
    <div style={{ padding: "8px 0", color: "var(--db-text-secondary)", fontSize: "14px" }}>
      {tCommon("loading")}
    </div>
  );

  return (
    <div>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "8px" }}>
        {t("railNegocios")}
      </h1>
      {usage && (
        <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", marginBottom: "20px" }}>
          {t("usageSummary", {
            bizUsed: usage.businesses.used,
            bizLimit: usage.businesses.limit,
            evUsed: usage.events.used,
            evLimit: usage.events.limit,
            plan: usage.plan,
          })}
        </p>
      )}

      {/* Create entry point (reuses the existing chooser + wizard). */}
      <div style={{ marginBottom: "26px" }}>
        <Link href="/dashboard/create" style={{ ...CTA, fontSize: "15px", padding: "12px 22px", gap: "10px" }}>
          <IconPlus size={18} /> {t("createBusinessOrEvent")}
        </Link>
      </div>

      {/* ═══ Businesses ═══ */}
      <h2 style={SECTION_TITLE}>{t("yourBusinesses")}</h2>

      {loading ? (
        loadingRow
      ) : businesses.length === 0 ? (
        <section style={CARD}>
          <span style={ICON_BOX}>
            <IconBuildingStore size={26} />
          </span>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: "0 0 4px" }}>
              {t("registerBusinessLink")}
            </h3>
            <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: 0 }}>
              {t("venueSetupMessage")}
            </p>
          </div>
          <Link href="/dashboard/create" style={CTA}>
            <IconBuildingStore size={18} />
            {t("createBusinessLink")}
            <IconArrowRight size={16} />
          </Link>
        </section>
      ) : (
        <>
          {businesses.map((b) => {
            const isActive = b.id === activeId;
            return (
              <section
                key={b.id}
                style={{
                  ...CARD,
                  marginBottom: "12px",
                  ...(isActive
                    ? {
                        border: "2px solid var(--db-accent)",
                        boxShadow: "0 0 0 3px var(--db-accent-bg)",
                      }
                    : {}),
                }}
              >
                <span style={ICON_BOX}>
                  <IconBuildingStore size={26} />
                </span>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "4px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
                      {b.name}
                    </h3>
                    <VerificationBadge isVerified={b.is_verified} />
                    {isActive && (
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--db-accent)" }}>
                        {t("activeBadge")}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: 0 }}>
                    {b.slug ? (
                      <>
                        jchat.app/b/<strong style={{ color: "var(--db-text-primary)" }}>{b.slug}</strong>
                      </>
                    ) : (
                      t("noSlugYet")
                    )}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  {b.slug && (
                    <a href={`/b/${b.slug}`} target="_blank" rel="noreferrer" style={CTA}>
                      {t("viewPublicPage")}
                      <IconExternalLink size={16} />
                    </a>
                  )}
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => void handleSetActive(b.id)}
                      disabled={switchingId !== null}
                      style={{
                        ...SECONDARY_BTN,
                        cursor: switchingId !== null ? "wait" : "pointer",
                        opacity: switchingId !== null && switchingId !== b.id ? 0.6 : 1,
                      }}
                    >
                      {switchingId === b.id ? t("switchingState") : t("setActiveButton")}
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </>
      )}

      {/* ═══ Receipt Brand Color (active business only) ═══ */}
      {!loading && activeId && (
        <>
          <h2 style={{ ...SECTION_TITLE, marginTop: "32px" }}>{t("receiptBrandColorLabel")}</h2>
          <ReceiptBrandColorCard businessId={activeId} />
        </>
      )}

      {/* ═══ Events ═══ */}
      <h2 style={{ ...SECTION_TITLE, marginTop: "32px" }}>{t("yourEvents")}</h2>

      {loading ? (
        loadingRow
      ) : events.length === 0 ? (
        <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", margin: "0 0 4px" }}>
          {t("noEventsYet")}
        </p>
      ) : (
        events.map((e) => {
          const isActive = e.id === activeId;
          return (
            <section
              key={e.id}
              style={{
                ...CARD,
                marginBottom: "12px",
                ...(isActive
                  ? {
                      border: "2px solid var(--db-accent)",
                      boxShadow: "0 0 0 3px var(--db-accent-bg)",
                    }
                  : {}),
              }}
            >
              <span style={ICON_BOX}>
                <IconCalendarEvent size={26} />
              </span>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "4px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
                    {e.name}
                  </h3>
                  <StatusBadge status={eventStatus(e.event_starts_at, e.event_ends_at)} />
                  {isActive && (
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--db-accent)" }}>
                      {t("activeBadge")}
                    </span>
                  )}
                </div>
                <p style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--db-text-secondary)", margin: 0 }}>
                  <IconMapPin size={13} />
                  {e.event_starts_at ? new Date(e.event_starts_at).toLocaleString(locale) : t("noStartDate")}
                  {e.event_ends_at ? ` – ${new Date(e.event_ends_at).toLocaleString(locale)}` : ""}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                {!isActive && (
                  <button
                    type="button"
                    onClick={() => void handleSetActive(e.id)}
                    disabled={switchingId !== null}
                    style={{
                      ...SECONDARY_BTN,
                      cursor: switchingId !== null ? "wait" : "pointer",
                      opacity: switchingId !== null && switchingId !== e.id ? 0.6 : 1,
                    }}
                  >
                    {switchingId === e.id ? t("switchingState") : t("setActiveButton")}
                  </button>
                )}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
