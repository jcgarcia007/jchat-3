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
import { IconMapPinOff, IconShoppingBag, IconToolsKitchen2, IconRefresh } from "@tabler/icons-react";
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

const row: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "15px 18px",
  borderRadius: 14,
  fontSize: 15,
  fontWeight: 600,
  textDecoration: "none",
  textAlign: "left",
  border: "none",
  cursor: "pointer",
};

export function RestrictedHub({ businessName, menuHref, menuExternal, pickupEnabled, locationFailure, onRetry }: Props) {
  const t = useTranslations("venue");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} role="status">
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "var(--bg-elevated)",
            color: "var(--color-warning)",
            flexShrink: 0,
          }}
        >
          <IconMapPinOff size={20} />
        </span>
        <div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{t("restrictedTitle", { business: businessName })}</p>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {locationFailure ? t(`location.${locationFailure}`) : t("restrictedBody")}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onRetry}
        style={{ ...row, background: "var(--color-brand)", color: "var(--on-brand)", justifyContent: "center" }}
      >
        <IconRefresh size={18} />
        {locationFailure === "denied" ? t("allowLocation") : t("retry")}
      </button>

      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {t("whatYouCanDo")}
      </p>

      {menuHref ? (
        <a
          href={menuHref}
          {...(menuExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          style={{ ...row, background: "var(--color-brand-light)", color: "var(--color-brand)", border: "1px solid rgb(var(--color-brand-rgb) / 0.3)" }}
        >
          <IconToolsKitchen2 size={20} />
          <span style={{ flex: 1 }}>{t("viewMenu")}</span>
        </a>
      ) : null}

      {menuHref && pickupEnabled ? (
        <a
          href={menuHref}
          style={{ ...row, background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
        >
          <IconShoppingBag size={20} />
          <span style={{ flex: 1 }}>{t("orderPickup")}</span>
        </a>
      ) : null}

      {menuHref && !pickupEnabled ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
          {t("pickupDisabled", { business: businessName })}
        </p>
      ) : null}
    </div>
  );
}
