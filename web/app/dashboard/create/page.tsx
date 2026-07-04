"use client";

/**
 * JChat 3.0 — Create chooser.
 * A single entry point that lets the owner pick what to create: a permanent
 * business or a temporary event. Both flows are the unified registration
 * wizard (event mode just adds a dates step). A type whose plan limit is
 * reached is shown disabled with a contact-us hint.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  IconBuildingStore,
  IconCalendarEvent,
  IconArrowLeft,
} from "@tabler/icons-react";
import { getUsageAndLimits, type UsageAndLimits } from "@/lib/planLimits";

const CARD: React.CSSProperties = {
  background: "var(--db-bg-surface)",
  border: "1px solid var(--db-border)",
  borderRadius: "14px",
  padding: "26px 20px",
  textAlign: "center",
  maxWidth: "280px",
  minWidth: "220px",
  flex: "1 1 220px",
};

const ICON_BOX: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "52px",
  height: "52px",
  borderRadius: "14px",
  background: "var(--db-accent-bg)",
  color: "var(--db-accent)",
  marginBottom: "14px",
};

function ChoiceCard({
  title,
  text,
  icon,
  disabled,
  hovered,
  onHover,
  onClick,
}: {
  title: string;
  text: string;
  icon: React.ReactNode;
  disabled: boolean;
  hovered: boolean;
  onHover: (v: boolean) => void;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        ...CARD,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        borderColor: !disabled && hovered ? "var(--db-accent)" : "var(--db-border)",
        transition: "border-color 0.15s ease",
      }}
    >
      <span style={ICON_BOX}>{icon}</span>
      <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: "0 0 6px" }}>
        {title}
      </h2>
      <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: 0, lineHeight: 1.5 }}>
        {text}
      </p>
      {disabled && (
        <p style={{ fontSize: "12px", color: "var(--db-warning)", margin: "12px 0 0", fontWeight: 600 }}>
          Limit reached — contact us for a custom plan
        </p>
      )}
    </div>
  );
}

export default function CreateChooserPage() {
  const router = useRouter();
  const [usage, setUsage] = useState<UsageAndLimits | null>(null);
  const [hovered, setHovered] = useState<"business" | "event" | null>(null);

  useEffect(() => {
    let active = true;
    void getUsageAndLimits().then((u) => {
      if (active) setUsage(u);
    });
    return () => {
      active = false;
    };
  }, []);

  // usage null (demo/no session) → both enabled.
  const businessDisabled = usage != null && !usage.businesses.canCreate;
  const eventDisabled = usage != null && !usage.events.canCreate;

  return (
    <div style={{ maxWidth: "620px", margin: "0 auto", paddingTop: "8px" }}>
      <div style={{ marginBottom: "20px" }}>
        <Link
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--db-text-secondary)",
            textDecoration: "none",
          }}
        >
          <IconArrowLeft size={15} />
          Back to dashboard
        </Link>
      </div>

      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", textAlign: "center", margin: "0 0 6px" }}>
        What do you want to create?
      </h1>
      <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", textAlign: "center", margin: "0 0 28px" }}>
        Both work the same — an event is just temporary.
      </p>

      <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
        <ChoiceCard
          title="Business"
          text="A permanent venue — bar, restaurant, café. Always on the map."
          icon={<IconBuildingStore size={26} />}
          disabled={businessDisabled}
          hovered={hovered === "business"}
          onHover={(v) => setHovered(v ? "business" : null)}
          onClick={() => router.push("/business/register")}
        />
        <ChoiceCard
          title="Event"
          text="A temporary happening with start and end dates. Same features, limited time."
          icon={<IconCalendarEvent size={26} />}
          disabled={eventDisabled}
          hovered={hovered === "event"}
          onHover={(v) => setHovered(v ? "event" : null)}
          onClick={() => router.push("/business/register?type=event")}
        />
      </div>
    </div>
  );
}
