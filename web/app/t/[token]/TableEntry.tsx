"use client";

/**
 * Client entry for /t/[token] (B5 + golden rule, migrations 197–199).
 *
 * The browser location is requested FIRST. The server decides whether the person is inside the venue
 * (venue_order_access):
 *   - INSIDE: the table context is stored (sessionStorage, per tab — it clears when the tab closes),
 *     the table subchat is joined when there is a session (join_room_via_qr with coordinates), and a
 *     small hub offers "View menu and order" and "Call the waiter" (no account needed).
 *   - OUTSIDE / no permission: no table context is saved; RestrictedHub offers the menu and, only if
 *     the owner enabled it, "Order for pick-up", plus "Allow location / Retry".
 */

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconBell, IconLoader2, IconToolsKitchen2 } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { RestrictedHub } from "@/components/c/RestrictedHub";
import { GuestWaiterSheet } from "@/components/c/GuestWaiterSheet";
import { fetchVenueOrderAccess, requestPosition, type LocationFailure } from "@/lib/venueLocation";

/** sessionStorage key holding the current table context ({ token, tableLabel, businessSlug }). */
export const TABLE_CONTEXT_KEY = "jchat.tableContext";

type Phase = "locating" | "inside" | "restricted";

export function TableEntry({
  token,
  tableLabel,
  businessSlug,
  businessId,
  businessName,
  roomQrToken,
  hasSession,
}: {
  token: string;
  tableLabel: string;
  businessSlug: string;
  businessId: string;
  businessName: string;
  roomQrToken: string | null;
  hasSession: boolean;
}) {
  const router = useRouter();
  const tv = useTranslations("venue");
  const [phase, setPhase] = useState<Phase>("locating");
  const [failure, setFailure] = useState<LocationFailure | null>(null);
  const [pickupEnabled, setPickupEnabled] = useState(false);
  const [showWaiter, setShowWaiter] = useState(false);
  const ran = useRef(false);

  const run = useCallback(
    async (fresh: boolean) => {
      setFailure(null);
      setPhase("locating");

      const clearContext = () => {
        try {
          sessionStorage.removeItem(TABLE_CONTEXT_KEY);
        } catch {
          // non-fatal
        }
      };

      const position = await requestPosition({ useCache: !fresh });
      if (!position.ok) {
        setFailure(position.reason);
        clearContext();
        const access = await fetchVenueOrderAccess(businessId, null);
        setPickupEnabled(access.pickup_enabled);
        setPhase("restricted");
        return;
      }

      const access = await fetchVenueOrderAccess(businessId, position.pos);
      setPickupEnabled(access.pickup_enabled);
      if (!access.inside) {
        clearContext();
        setPhase("restricted");
        return;
      }

      // Inside: persist the table context for the ordering flow (the menu consumes it).
      try {
        sessionStorage.setItem(TABLE_CONTEXT_KEY, JSON.stringify({ token, tableLabel, businessSlug }));
      } catch {
        // sessionStorage may be unavailable (private mode) — non-fatal.
      }
      // Table subchat: join with coordinates (the server re-checks the area). Non-fatal.
      if (roomQrToken && hasSession && isSupabaseConfigured) {
        try {
          await supabase.rpc("join_room_via_qr", {
            token: roomQrToken,
            p_lat: position.pos.lat,
            p_lng: position.pos.lng,
          } as never);
        } catch {
          // Still let the user order.
        }
      }
      setPhase("inside");
    },
    [businessId, businessSlug, hasSession, roomQrToken, tableLabel, token],
  );

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void run(false);
  }, [run]);

  const btn: React.CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "15px 18px",
    borderRadius: 14,
    border: "none",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
  };

  return (
    <div
      style={{
        minHeight: "100svh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "24px 16px",
        background: "var(--bg-base)",
        color: "var(--text-primary)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{businessName}</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{tableLabel}</div>
        </div>

        {phase === "locating" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--text-secondary)", fontSize: 14 }}>
            <IconLoader2 size={18} className="spin" />
            {tv("locating")}
          </div>
        )}

        {phase === "restricted" && (
          <RestrictedHub
            businessName={businessName}
            menuHref={`/m/${businessSlug}`}
            pickupEnabled={pickupEnabled}
            locationFailure={failure}
            onRetry={() => void run(true)}
          />
        )}

        {phase === "inside" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              type="button"
              onClick={() => router.replace(`/m/${businessSlug}`)}
              style={{ ...btn, background: "var(--color-brand)", color: "var(--on-brand)" }}
            >
              <IconToolsKitchen2 size={20} />
              {tv("tableOrder")}
            </button>
            <button
              type="button"
              onClick={() => setShowWaiter(true)}
              style={{ ...btn, background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
            >
              <IconBell size={20} />
              {tv("callWaiter")}
            </button>
          </div>
        )}
      </div>

      {showWaiter && (
        <GuestWaiterSheet
          tableToken={token}
          tableLabel={tableLabel}
          businessName={businessName}
          onClose={() => setShowWaiter(false)}
        />
      )}
    </div>
  );
}
