"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  IconBuildingStore,
  IconArrowRight,
  IconCalendarEvent,
  IconCircleCheck,
  IconClockHour4,
  IconExternalLink,
} from "@tabler/icons-react";
import { resolveActiveBusiness, type ActiveBusiness } from "@/lib/business";

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

function VerificationBadge({ business }: { business: ActiveBusiness }) {
  const verified = business.is_verified || business.status === "active" || business.status === "verified";
  const Icon = verified ? IconCircleCheck : IconClockHour4;
  const color = verified ? "var(--db-success)" : "var(--db-warning)";
  const label = verified
    ? "Verified"
    : business.status
      ? business.status.replace(/_/g, " ")
      : "Pending verification";
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
        textTransform: "capitalize",
        background: verified ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)",
        color,
      }}
    >
      <Icon size={13} />
      {label}
    </span>
  );
}

export default function OverviewPage() {
  const [business, setBusiness] = useState<ActiveBusiness | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void resolveActiveBusiness().then((res) => {
      if (!active) return;
      if (res.ok) setBusiness(res.business);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "8px" }}>
        Overview
      </h1>
      <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", marginBottom: "24px" }}>
        High-level KPIs, recent activity, and quick actions — coming soon.
      </p>

      {loading ? (
        <div style={{ padding: "8px 0", color: "var(--db-text-secondary)", fontSize: "14px" }}>Loading…</div>
      ) : business ? (
        /* Active business summary */
        <section style={CARD}>
          <span style={ICON_BOX}>
            <IconBuildingStore size={26} />
          </span>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "4px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
                {business.name}
              </h2>
              <VerificationBadge business={business} />
            </div>
            <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: 0 }}>
              {business.slug ? (
                <>
                  jchat.app/b/<strong style={{ color: "var(--db-text-primary)" }}>{business.slug}</strong>
                </>
              ) : (
                "No public slug yet."
              )}
              {business.plan ? ` · ${business.plan} plan` : ""}
            </p>
          </div>
          {business.slug && (
            <a href={`/b/${business.slug}`} target="_blank" rel="noreferrer" style={CTA}>
              View public page
              <IconExternalLink size={16} />
            </a>
          )}
        </section>
      ) : (
        /* No business yet → register CTA */
        <section style={CARD}>
          <span style={ICON_BOX}>
            <IconBuildingStore size={26} />
          </span>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: "0 0 4px" }}>
              Register your business
            </h2>
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
      )}

      {/* Dedicated event creation wizard */}
      <section style={{ ...CARD, marginTop: "16px" }}>
        <span style={ICON_BOX}>
          <IconCalendarEvent size={26} />
        </span>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: "0 0 4px" }}>
            Create an event
          </h2>
          <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: 0 }}>
            Publish an event on the map and open a dedicated chat room that closes when it ends.
          </p>
        </div>
        <Link href="/dashboard/events/new" style={CTA}>
          <IconCalendarEvent size={18} />
          Create an event
          <IconArrowRight size={16} />
        </Link>
      </section>

      {business && (
        <p style={{ fontSize: "13px", marginTop: "16px" }}>
          <Link href="/business/register" style={{ color: "var(--db-accent)", textDecoration: "none" }}>
            + Register another business
          </Link>
        </p>
      )}
    </div>
  );
}
