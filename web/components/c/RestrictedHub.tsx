"use client";

/**
 * RestrictedHub — golden rule, web (migrations 197–199).
 *
 * Shown when the server could NOT confirm the person is inside the venue (outside the area, or
 * without location permission). "Outside" is never a flat rejection: it explains, offers
 * "Allow location / Retry" and lists what IS possible — view the menu and, only if the owner turned
 * pick-up on, order for pick-up. No chat, no waiter, no table orders.
 */

import { useTranslations } from "next-intl";
import { IconMapPin } from "@tabler/icons-react";
import type { LocationFailure } from "@/lib/venueLocation";

interface Props {
  businessName: string;
  /** Menu destination (ordering surface or external menu), or null when the venue has no menu to show. */
  menuHref: string | null;
  menuExternal?: boolean;
  /** Owner's "Pickup orders" switch (businesses.pickup_enabled). */
  pickupEnabled: boolean;
  /** Why there was no position, if that is the cause. */
  locationFailure: LocationFailure | null;
  onRetry: () => void;
}

const btn: React.CSSProperties = {
  width: "100%",
  minHeight: 52,
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 16px",
  borderRadius: 14,
  fontSize: 16,
  fontWeight: 700,
  textDecoration: "none",
  textAlign: "center",
  whiteSpace: "nowrap",
  cursor: "pointer",
};

export function RestrictedHub({ businessName, menuHref, menuExternal, pickupEnabled, locationFailure, onRetry }: Props) {
  const t = useTranslations("venue");

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }} role="status">
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "var(--bg-elevated)",
          color: "var(--color-brand)",
        }}
      >
        <IconMapPin size={30} />
      </span>
      <p style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{t("notAtTitle", { business: businessName })}</p>
      <p style={{ margin: "0 0 4px", fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.4 }}>
        {locationFailure ? t(`location.${locationFailure}`) : t("notAtBody")}
      </p>

      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
        <button
          type="button"
          onClick={onRetry}
          style={{ ...btn, border: "none", background: "var(--color-brand)", color: "var(--on-brand)" }}
        >
          {locationFailure === "denied" ? t("allowLocation") : t("retry")}
        </button>

        {menuHref ? (
          <a
            href={menuHref}
            {...(menuExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            style={{ ...btn, background: "transparent", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
          >
            {pickupEnabled ? t("viewMenuAndPickup") : t("viewMenu")}
          </a>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
        }}
        style={{ border: "none", background: "transparent", color: "var(--text-secondary)", fontSize: 15, cursor: "pointer", padding: 8 }}
      >
        {t("notNow")}
      </button>
    </div>
  );
}
