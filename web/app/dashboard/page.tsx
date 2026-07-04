"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  IconBuildingStore,
  IconArrowRight,
  IconCalendarEvent,
  IconCircleCheck,
  IconExternalLink,
  IconMail,
  IconMapPin,
  IconPlus,
} from "@tabler/icons-react";
import {
  listUserBusinesses,
  listUserEvents,
  resolveActiveBusiness,
  setActiveBusiness,
  type BusinessListItem,
  type EventListItem,
} from "@/lib/business";
import { getUsageAndLimits, type UsageAndLimits } from "@/lib/planLimits";

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
  fontSize: "24px",
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

const ADD_LINK: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  color: "var(--db-accent)",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: 600,
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
  color: "var(--db-text-primary)",
  margin: "0 0 14px",
};

/** Green "Verified" pill; renders nothing when the business isn't verified. */
function VerificationBadge({ isVerified }: { isVerified: boolean }) {
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
      Verified
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
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
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ContactUsCard({ resource }: { resource: "business" | "event" }) {
  const text =
    resource === "business"
      ? "You've reached your plan's business limit. Request a custom plan to add more."
      : "You've reached your plan's event limit. Request a custom plan to add more.";
  return (
    <section style={{ ...CARD, marginTop: "16px" }}>
      <span style={ICON_BOX}>
        <IconMail size={26} />
      </span>
      <div style={{ flex: 1, minWidth: "200px" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: "0 0 4px" }}>
          Limit reached
        </h2>
        <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: 0 }}>
          {text}
        </p>
      </div>
      <a href="mailto:support@jchat.cloud?subject=Custom plan request" style={CTA}>
        <IconMail size={18} />
        Contact us
      </a>
    </section>
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

export default function OverviewPage() {
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
    if (ok) {
      // Reload so every dashboard surface re-resolves the active business.
      window.location.reload();
    } else {
      setSwitchingId(null);
    }
  }

  const loadingRow = (
    <div style={{ padding: "8px 0", color: "var(--db-text-secondary)", fontSize: "14px" }}>
      Loading…
    </div>
  );

  const canRegisterMore =
    !usage || usage.businesses.canCreate || usage.businesses.used === 0;

  return (
    <div>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "8px" }}>
        Overview
      </h1>
      {usage && (
        <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", marginBottom: "24px" }}>
          Businesses: {usage.businesses.used}/{usage.businesses.limit} · Events:{" "}
          {usage.events.used}/{usage.events.limit} · {usage.plan} plan
        </p>
      )}

      {/* ═══ Section 1 — Businesses ═══ */}
      <h2 style={SECTION_TITLE}>Your businesses</h2>

      {loading ? (
        loadingRow
      ) : businesses.length === 0 ? (
        <section style={CARD}>
          <span style={ICON_BOX}>
            <IconBuildingStore size={26} />
          </span>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: "0 0 4px" }}>
              Register your business
            </h3>
            <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: 0 }}>
              Set up your venue to start chatting with customers, taking orders, and hosting events.
            </p>
          </div>
          <Link href="/business/register" style={CTA}>
            <IconBuildingStore size={18} />
            Register your business
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
                        Active
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: 0 }}>
                    {b.slug ? (
                      <>
                        jchat.app/b/<strong style={{ color: "var(--db-text-primary)" }}>{b.slug}</strong>
                      </>
                    ) : (
                      "No public slug yet."
                    )}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  {b.slug && (
                    <a href={`/b/${b.slug}`} target="_blank" rel="noreferrer" style={CTA}>
                      View public page
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
                      {switchingId === b.id ? "Switching…" : "Set as active"}
                    </button>
                  )}
                </div>
              </section>
            );
          })}

          {usage && !usage.businesses.canCreate && usage.businesses.used > 0 ? (
            <ContactUsCard resource="business" />
          ) : (
            canRegisterMore && (
              <div style={{ marginTop: "12px" }}>
                <Link href="/business/register" style={ADD_LINK}>
                  <IconPlus size={15} />
                  Register another business
                </Link>
              </div>
            )
          )}
        </>
      )}

      {/* ═══ Section 2 — Events ═══ */}
      <h2 style={{ ...SECTION_TITLE, marginTop: "32px" }}>Your events</h2>

      {loading ? (
        loadingRow
      ) : (
        <>
          {events.length === 0 ? (
            <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", margin: "0 0 4px" }}>
              No events yet.
            </p>
          ) : (
            events.map((e) => (
              <section key={e.id} style={{ ...CARD, marginBottom: "12px" }}>
                <span style={ICON_BOX}>
                  <IconCalendarEvent size={26} />
                </span>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "4px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
                      {e.name}
                    </h3>
                    <StatusBadge status={eventStatus(e.event_starts_at, e.event_ends_at)} />
                  </div>
                  <p style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--db-text-secondary)", margin: 0 }}>
                    <IconMapPin size={13} />
                    {e.event_starts_at ? new Date(e.event_starts_at).toLocaleString() : "No start date"}
                    {e.event_ends_at ? ` – ${new Date(e.event_ends_at).toLocaleString()}` : ""}
                  </p>
                </div>
              </section>
            ))
          )}

          {usage && !usage.events.canCreate ? (
            <ContactUsCard resource="event" />
          ) : (
            <div style={{ marginTop: "12px" }}>
              <Link href="/dashboard/events/new" style={ADD_LINK}>
                <IconPlus size={15} />
                Create an event
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
