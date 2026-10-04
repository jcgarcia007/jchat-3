"use client";

/**
 * RoomHub — hub of /c/[token] (golden rule, migrations 197–199).
 *
 * The browser location is requested BEFORE the hub. The server decides:
 *   - with an account: join_room_via_qr(token, lat, lng) → access_granted (creates the 24 h membership
 *     and the venue presence only INSIDE the area);
 *   - without an account: venue_order_access(business, lat, lng) → inside.
 * Inside → full hub (Menu · Call the waiter · Enter the chat). Outside / no permission → RestrictedHub:
 * Menu + "Order for pick-up" (only if the owner allows it) + the rule + "Allow location / Retry".
 * Entering the chat needs: inside + account + age (the room page enforces the last two).
 *
 * Menu button behavior (unchanged):
 *   menu_mode='external' + external_menu_url → opens URL in new tab
 *   menu_mode='web'                          → /m/{slug}
 *   menu_mode='none' (or unset)              → disabled with "soon"
 */

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconToolsKitchen2, IconBell, IconMessages, IconLoader2 } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { WaiterSheet } from "@/components/c/WaiterSheet";
import { GuestWaiterSheet } from "@/components/c/GuestWaiterSheet";
import { RestrictedHub } from "@/components/c/RestrictedHub";
import {
  fetchVenueOrderAccess,
  requestPosition,
  type LocationFailure,
} from "@/lib/venueLocation";
import { TABLE_CONTEXT_KEY } from "@/app/t/[token]/TableEntry";

interface Props {
  token: string;
  roomId: string;
  businessId: string;
  businessName: string;
  isSubRoom: boolean;
  /** Empty when there is no session. */
  userId: string;
  hasSession: boolean;
}

type Phase = "locating" | "joining" | "full" | "restricted" | "invalid" | "error";

interface JoinRow {
  access_granted?: boolean;
}

export function RoomHub({ token, roomId, businessId, businessName, isSubRoom, userId, hasSession }: Props) {
  const t = useTranslations("qrEntry");
  const tv = useTranslations("venue");
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("locating");
  const [failure, setFailure] = useState<LocationFailure | null>(null);
  const [pickupEnabled, setPickupEnabled] = useState(false);
  const [showWaiter, setShowWaiter] = useState(false);
  const [showGuestWaiter, setShowGuestWaiter] = useState(false);

  // Menu mode from businesses table
  const [menuMode, setMenuMode] = useState<"none" | "external" | "web">("none");
  const [externalMenuUrl, setExternalMenuUrl] = useState<string | null>(null);
  const [bizSlug, setBizSlug] = useState<string | null>(null);

  // Table saved by /t (sessionStorage) — lets a guest call the waiter from the hub.
  const [table, setTable] = useState<{ token: string; tableLabel: string } | null>(null);

  const run = useCallback(
    async (fresh: boolean) => {
      setFailure(null);
      if (!isSupabaseConfigured) {
        setPhase("full");
        return;
      }
      setPhase("locating");
      const position = await requestPosition({ useCache: !fresh });
      if (!position.ok) {
        setFailure(position.reason);
        const access = await fetchVenueOrderAccess(businessId, null);
        setPickupEnabled(access.pickup_enabled);
        setPhase("restricted");
        return;
      }
      const pos = position.pos;

      if (hasSession) {
        setPhase("joining");
        // join_room_via_qr(token, lat, lng): the OLD version without coordinates must not be used anymore.
        const { data, error } = await supabase.rpc("join_room_via_qr", {
          token,
          p_lat: pos.lat,
          p_lng: pos.lng,
        } as never);
        if (error) {
          const msg = (error as { message?: string }).message ?? "";
          if (msg.includes("auth_required")) {
            router.push(`/auth/login?next=${encodeURIComponent(`/c/${token}`)}`);
            return;
          }
          setPhase(msg.includes("invalid_qr") ? "invalid" : "error");
          return;
        }
        const row = (Array.isArray(data) ? data[0] : data) as JoinRow | null;
        if (row?.access_granted) {
          setPhase("full");
          return;
        }
        const access = await fetchVenueOrderAccess(businessId, pos);
        setPickupEnabled(access.pickup_enabled);
        setPhase("restricted");
        return;
      }

      // No account: only the coordinates can prove presence (server-side).
      const access = await fetchVenueOrderAccess(businessId, pos);
      setPickupEnabled(access.pickup_enabled);
      setPhase(access.inside ? "full" : "restricted");
    },
    [businessId, hasSession, router, token],
  );

  useEffect(() => {
    void run(false);
  }, [run]);

  // Fetch menu_mode + external_menu_url from the business (read-only, public fields).
  useEffect(() => {
    if (!isSupabaseConfigured || !businessId) return;
    void (async () => {
      const { data } = await supabase
        .from("businesses")
        .select("slug, menu_mode, external_menu_url")
        .eq("id", businessId)
        .maybeSingle();
      if (data) {
        setMenuMode((data.menu_mode as "none" | "external" | "web") ?? "none");
        setExternalMenuUrl(data.external_menu_url ?? null);
        setBizSlug((data as unknown as { slug?: string }).slug ?? null);
      }
    })();
  }, [businessId]);

  // Table context left by /t for THIS business.
  useEffect(() => {
    if (!bizSlug) return;
    try {
      const raw = sessionStorage.getItem(TABLE_CONTEXT_KEY);
      if (!raw) return;
      const ctx = JSON.parse(raw) as { token?: string; tableLabel?: string; businessSlug?: string };
      if (ctx.token && ctx.tableLabel && ctx.businessSlug === bizSlug) setTable({ token: ctx.token, tableLabel: ctx.tableLabel });
    } catch {
      // sessionStorage unavailable
    }
  }, [bizSlug]);

  const menuIsExternal = menuMode === "external" && !!externalMenuUrl;
  const menuIsWeb = menuMode === "web" && !!bizSlug;
  const menuHref = menuIsExternal ? externalMenuUrl : menuIsWeb ? `/m/${bizSlug}` : null;

  const btnBase: React.CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "15px 18px",
    borderRadius: 14,
    border: "none",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
    transition: "opacity 0.15s",
  };
  const iconBox = (bg: string, color: string): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    borderRadius: 10,
    background: bg,
    color,
    flexShrink: 0,
  });

  // ── Locating / joining ───────────────────────────────────────────────────────
  if (phase === "locating" || phase === "joining") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "14px 0", color: "var(--text-secondary)", fontSize: 14 }}>
        <IconLoader2 size={18} className="spin" />
        {phase === "locating" ? tv("locating") : t("verifyingAccess")}
      </div>
    );
  }

  // ── QR renewed between server render and client join ─────────────────────────
  if (phase === "invalid") {
    return (
      <div
        style={{
          padding: "12px 14px",
          borderRadius: 12,
          background: "rgb(var(--color-danger-rgb) / 0.1)",
          border: "1px solid var(--color-danger)",
          color: "var(--color-danger)",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {t("invalidQrShort")}
      </div>
    );
  }

  // ── Generic join error ────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>{t("verifyFailed")}</p>
        <button
          type="button"
          onClick={() => void run(true)}
          style={{ ...btnBase, background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)", justifyContent: "center" }}
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  // ── Outside / no permission → reduced hub ────────────────────────────────────
  if (phase === "restricted") {
    return (
      <RestrictedHub
        businessName={businessName}
        menuHref={menuHref}
        menuExternal={menuIsExternal}
        pickupEnabled={pickupEnabled}
        locationFailure={failure}
        onRetry={() => void run(true)}
      />
    );
  }

  // ── Full hub (inside) ─────────────────────────────────────────────────────────
  return (
    <>
      {isSubRoom && (
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 4px", lineHeight: 1.5 }}>{t("alsoMainRoomHub")}</p>
      )}

      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {t("whatToDo")}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* MENÚ */}
        {menuHref ? (
          <a
            href={menuHref}
            {...(menuIsExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            style={{ ...btnBase, background: "var(--color-brand-light)", color: "var(--color-brand)", border: "1px solid rgb(var(--color-brand-rgb) / 0.3)", textDecoration: "none" }}
          >
            <span style={iconBox("var(--color-brand)", "var(--on-brand)")}>
              <IconToolsKitchen2 size={20} />
            </span>
            <span style={{ flex: 1 }}>{t("menu")}</span>
            {menuIsExternal && <span style={{ fontSize: 11, color: "var(--color-brand)", opacity: 0.7 }}>↗</span>}
          </a>
        ) : (
          <button
            type="button"
            disabled
            style={{ ...btnBase, background: "var(--color-brand-light)", color: "var(--color-brand)", border: "1px solid rgb(var(--color-brand-rgb) / 0.3)", opacity: 0.6, cursor: "not-allowed" }}
          >
            <span style={iconBox("var(--color-brand)", "var(--on-brand)")}>
              <IconToolsKitchen2 size={20} />
            </span>
            <span style={{ flex: 1 }}>{t("menu")}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "var(--color-brand)", color: "var(--on-brand)", whiteSpace: "nowrap" }}>
              {t("soon")}
            </span>
          </button>
        )}

        {/* LLAMAR AL SERVICIO — account: current flow; guest: needs the table from /t */}
        {(hasSession || table) && (
          <button
            type="button"
            onClick={() => (hasSession ? setShowWaiter(true) : setShowGuestWaiter(true))}
            style={{ ...btnBase, background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
          >
            <span style={iconBox("var(--color-brand-light)", "var(--color-brand)")}>
              <IconBell size={20} />
            </span>
            {t("callService")}
          </button>
        )}

        {/* ENTRAR AL CHAT — account + inside (+ age, enforced by the room page) */}
        {hasSession ? (
          <button
            type="button"
            onClick={() => router.push(`/c/${token}/room`)}
            style={{ ...btnBase, background: "var(--color-brand)", color: "var(--on-brand)" }}
          >
            <span style={iconBox("rgb(var(--white-rgb) / 0.18)", "inherit")}>
              <IconMessages size={20} />
            </span>
            {t("enterChat")}
          </button>
        ) : (
          <>
            <Link
              href={`/auth/login?next=${encodeURIComponent(`/c/${token}`)}`}
              style={{ ...btnBase, background: "var(--color-brand)", color: "var(--on-brand)", textDecoration: "none" }}
            >
              <span style={iconBox("rgb(var(--white-rgb) / 0.18)", "inherit")}>
                <IconMessages size={20} />
              </span>
              {tv("signInChat")}
            </Link>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              {tv("chatNeedsAccount", { business: businessName })}
            </p>
          </>
        )}
      </div>

      {showWaiter && (
        <WaiterSheet roomId={roomId} businessId={businessId} userId={userId} onClose={() => setShowWaiter(false)} />
      )}
      {showGuestWaiter && table && (
        <GuestWaiterSheet
          tableToken={table.token}
          tableLabel={table.tableLabel}
          businessName={businessName}
          onClose={() => setShowGuestWaiter(false)}
        />
      )}
    </>
  );
}
