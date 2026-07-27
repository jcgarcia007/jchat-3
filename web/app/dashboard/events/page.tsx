"use client";

/**
 * JChat 3.0 — Dashboard Events list.
 * Events are temporary businesses (is_temporary=true). This page lists the
 * owner's events; creation happens in the unified registration wizard
 * (/business/register?type=event) and management reuses the business switcher.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  IconCalendarEvent,
  IconPlus,
  IconArrowRight,
} from "@tabler/icons-react";
import {
  listUserEvents,
  setActiveBusiness,
  type EventListItem,
} from "@/lib/business";
import type { TFn } from "@/lib/tabSemantics";

const CARD: React.CSSProperties = {
  background: "var(--db-bg-surface)",
  border: "1px solid var(--db-border)",
  borderRadius: "14px",
  padding: "20px 24px",
  display: "flex",
  alignItems: "center",
  gap: "20px",
  flexWrap: "wrap",
  marginBottom: "12px",
};

const ICON_BOX: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "44px",
  height: "44px",
  borderRadius: "12px",
  background: "var(--db-accent-bg)",
  color: "var(--db-accent)",
  flexShrink: 0,
};

const CTA: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "10px 16px",
  borderRadius: "10px",
  background: "var(--db-accent)",
  color: "var(--db-accent-text)",
  fontSize: "14px",
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const SECONDARY_BTN: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "9px 16px",
  borderRadius: "10px",
  background: "transparent",
  color: "var(--db-text-primary)",
  border: "1px solid var(--db-border)",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

type EventStatus = "upcoming" | "live" | "ended";

function eventStatus(startsAt: string | null, endsAt: string | null): EventStatus {
  const now = Date.now();
  const s = startsAt ? new Date(startsAt).getTime() : null;
  const e = endsAt ? new Date(endsAt).getTime() : null;
  if (s && now < s) return "upcoming";
  if (e && now > e) return "ended";
  return "live";
}

const STATUS_COLOR: Record<EventStatus, string> = {
  upcoming: "var(--db-accent)",
  live: "var(--db-success)",
  ended: "var(--db-text-tertiary)",
};

const STATUS_LABEL_KEY: Record<EventStatus, string> = {
  upcoming: "eventStatusUpcoming",
  live: "eventStatusLive",
  ended: "eventStatusEnded",
};

function StatusBadge({ status, t }: { status: EventStatus; t: TFn }) {
  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: "999px",
        background: "var(--db-bg-overlay)",
        color: STATUS_COLOR[status],
        textTransform: "capitalize",
      }}
    >
      {t(STATUS_LABEL_KEY[status])}
    </span>
  );
}

// Note: no hardcoded locale here — toLocaleString() uses the browser's own
// locale, same as reservations/page.tsx. Flagging for the future dates chunk
// only as a place that WILL need real formatting once that's tackled; it's
// not the es-ES-hardcode gap from the receipt/SalesCalendar.
function formatWindow(startsAt: string | null, endsAt: string | null, t: TFn): string {
  const s = startsAt ? new Date(startsAt).toLocaleString() : null;
  const e = endsAt ? new Date(endsAt).toLocaleString() : null;
  if (s && e) return `${s} – ${e}`;
  if (s) return t("eventsWindowFrom", { date: s });
  if (e) return t("eventsWindowUntil", { date: e });
  return t("eventsNoDatesSet");
}

function EventRow({
  event,
  switching,
  onManage,
  t,
}: {
  event: EventListItem;
  switching: boolean;
  onManage: () => void;
  t: TFn;
}) {
  const status = eventStatus(event.event_starts_at, event.event_ends_at);
  return (
    <section style={CARD}>
      <span style={ICON_BOX}>
        <IconCalendarEvent size={24} />
      </span>
      <div style={{ flex: 1, minWidth: "200px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "4px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
            {event.name}
          </h3>
          <StatusBadge status={status} t={t} />
        </div>
        <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: 0 }}>
          {formatWindow(event.event_starts_at, event.event_ends_at, t)}
        </p>
      </div>
      <button
        type="button"
        onClick={onManage}
        disabled={switching}
        style={{ ...SECONDARY_BTN, cursor: switching ? "wait" : "pointer", opacity: switching ? 0.6 : 1 }}
      >
        {switching ? t("eventsOpeningState") : t("eventsManageButton")}
        {!switching && <IconArrowRight size={15} />}
      </button>
    </section>
  );
}

export default function EventsPage() {
  const t = useTranslations("dashboardCommon");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listUserEvents().then((list) => {
      if (!active) return;
      setEvents(list);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  function handleNew() {
    router.push("/business/register?type=event");
  }

  async function handleManage(id: string) {
    setSwitchingId(id);
    const ok = await setActiveBusiness(id);
    if (ok) {
      router.push("/dashboard");
    } else {
      setSwitchingId(null);
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "24px", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: "0 0 6px" }}>
            {t("eventsPageTitle")}
          </h1>
          <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", margin: 0 }}>
            {t("eventsSubtitle")}
          </p>
        </div>
        <button type="button" onClick={handleNew} style={CTA}>
          <IconPlus size={16} />
          {t("eventsNewButton")}
        </button>
      </div>

      {loading ? (
        <div style={{ padding: "8px 0", color: "var(--db-text-secondary)", fontSize: "14px" }}>{tCommon("loading")}</div>
      ) : events.length === 0 ? (
        <section
          style={{
            ...CARD,
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            padding: "48px 24px",
            gap: "14px",
          }}
        >
          <span style={ICON_BOX}>
            <IconCalendarEvent size={24} />
          </span>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: "0 0 4px" }}>
              {t("eventsEmptyTitle")}
            </h3>
            <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: 0 }}>
              {t("eventsEmptyBody")}
            </p>
          </div>
          <button type="button" onClick={handleNew} style={CTA}>
            <IconPlus size={16} />
            {t("eventsNewButton")}
          </button>
        </section>
      ) : (
        events.map((ev) => (
          <EventRow
            key={ev.id}
            event={ev}
            t={t}
            switching={switchingId === ev.id}
            onManage={() => void handleManage(ev.id)}
          />
        ))
      )}
    </div>
  );
}
