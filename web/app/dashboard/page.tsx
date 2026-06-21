import Link from "next/link";
import {
  IconBuildingStore,
  IconArrowRight,
  IconCalendarEvent,
} from "@tabler/icons-react";

export default function OverviewPage() {
  return (
    <div>
      <h1
        style={{
          fontSize: "22px",
          fontWeight: 700,
          color: "var(--db-text-primary)",
          marginBottom: "8px",
        }}
      >
        Overview
      </h1>
      <p
        style={{
          fontSize: "14px",
          color: "var(--db-text-secondary)",
          marginBottom: "24px",
        }}
      >
        High-level KPIs, recent activity, and quick actions — coming soon.
      </p>

      {/* Get started: register a business */}
      <section
        style={{
          background: "var(--db-bg-surface)",
          border: "1px solid var(--db-border)",
          borderRadius: "14px",
          padding: "24px",
          maxWidth: "640px",
          display: "flex",
          alignItems: "center",
          gap: "20px",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: "var(--db-accent-bg)",
            color: "var(--db-accent)",
            flexShrink: 0,
          }}
        >
          <IconBuildingStore size={26} />
        </span>

        <div style={{ flex: 1, minWidth: "200px" }}>
          <h2
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--db-text-primary)",
              margin: "0 0 4px",
            }}
          >
            Register your business
          </h2>
          <p
            style={{
              fontSize: "13px",
              color: "var(--db-text-secondary)",
              margin: 0,
            }}
          >
            Set up your venue to start chatting with customers, taking orders,
            and hosting events.
          </p>
        </div>

        <Link
          href="/business/register"
          style={{
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
          }}
        >
          <IconBuildingStore size={18} />
          Register your business
          <IconArrowRight size={16} />
        </Link>
      </section>

      {/* Secondary: events live under their own dashboard section (needs a business first) */}
      <Link
        href="/dashboard/events"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          marginTop: "16px",
          fontSize: "13px",
          fontWeight: 600,
          color: "var(--db-accent)",
          textDecoration: "none",
        }}
      >
        <IconCalendarEvent size={16} />
        Create an event
        <IconArrowRight size={14} />
      </Link>
    </div>
  );
}
