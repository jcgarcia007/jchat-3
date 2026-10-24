"use client";

/**
 * TicketDoor — the venue's page behind a QR (/c/{token} room QR, /t/{token} table QR): a paper "boleto".
 *
 * The DOOR is this Next page; the CHAT is the Expo web app ({venue}.jchat.cloud, the same code as the app).
 * So this page does not ask for the location and does not join any room: it only offers three things.
 *   · View menu          → the public menu (/m/{slug}) or the venue's external menu. No account.
 *   · Request assistance → the guest call (GuestWaiterSheet → guest-tab). No account; the server asks for the location.
 *   · Enter the chat     → https://{venue}.jchat.cloud/c/{token} (or /t/{token}): Expo asks for the account, then the location.
 * With the app installed, that URL opens the app (App Links / Universal Links): nothing to do here.
 *
 * Look: the login ticket of the app (mobile/components/auth/Ticket*): paper, dotted perforation with a bite on each
 * side. Only the theme tokens of web/styles/tokens.css (--bg-*, --text-*, --border-subtle, --color-*), no new hex.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { IconBell, IconMessages, IconToolsKitchen2 } from "@tabler/icons-react";
import { GuestWaiterSheet } from "@/components/c/GuestWaiterSheet";

/** sessionStorage key of the table context ({ token, tableLabel, businessSlug }); the menu (/m) reads it to order to the table. */
export const TABLE_CONTEXT_KEY = "jchat.tableContext";

export interface TicketDoorProps {
  businessId: string;
  businessName: string;
  businessSlug: string;
  logoUrl: string | null;
  /** /t: the table of THIS QR (its token and label). */
  table?: { token: string; label: string } | null;
  /** /c of a sub-room: the room's name, shown under the venue like a table would be. */
  roomLabel?: string | null;
  /** Public menu (an internal path like /m/slug, or an external URL); null → the button says "soon". */
  menuHref: string | null;
  menuExternal: boolean;
  /** Where "Enter the chat" and "Open in the app" go: https://{venue}.jchat.cloud/c/{token} or /t/{token}. */
  enterUrl: string;
  /** Under the ticket (the language switcher). */
  children?: React.ReactNode;
}

const NOTCH = 24;
const PADDING = 24;

export function TicketDoor({ businessId, businessName, businessSlug, logoUrl, table, roomLabel, menuHref, menuExternal, enterUrl, children }: TicketDoorProps) {
  const t = useTranslations("qrEntry");
  const tv = useTranslations("venue");
  const [showAssist, setShowAssist] = useState(false);
  // /c: a table left in this tab by a /t scan of THIS venue lets the guest skip typing the number.
  const [savedTable, setSavedTable] = useState<{ token: string; label: string } | null>(null);

  useEffect(() => {
    try {
      if (table) {
        // /t: remember the table so the menu orders to it (the server still checks the location when ordering).
        sessionStorage.setItem(TABLE_CONTEXT_KEY, JSON.stringify({ token: table.token, tableLabel: table.label, businessSlug }));
        return;
      }
      const raw = sessionStorage.getItem(TABLE_CONTEXT_KEY);
      if (!raw) return;
      const ctx = JSON.parse(raw) as { token?: string; tableLabel?: string; businessSlug?: string };
      if (ctx.token && ctx.tableLabel && ctx.businessSlug === businessSlug) setSavedTable({ token: ctx.token, label: ctx.tableLabel });
    } catch {
      // sessionStorage unavailable (private mode): the guest can still type the number.
    }
  }, [table, businessSlug]);

  const assistTable = table ?? savedTable;
  const initial = (businessName.trim().charAt(0) || "J").toUpperCase();

  const button: React.CSSProperties = {
    width: "100%",
    minHeight: 48,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "0 16px",
    borderRadius: 12,
    border: "1px solid var(--border-subtle)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 15,
    fontWeight: 700,
    fontFamily: "inherit",
    textDecoration: "none",
    cursor: "pointer",
  };
  const primary: React.CSSProperties = { ...button, border: "none", background: "var(--color-brand)", color: "var(--on-brand)" };
  const disabled: React.CSSProperties = { ...button, opacity: 0.55, cursor: "default" };
  const bite: React.CSSProperties = {
    position: "absolute",
    top: 0,
    width: NOTCH,
    height: NOTCH,
    borderRadius: "50%",
    background: "var(--bg-base)",
    border: "1px solid var(--border-subtle)",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        minHeight: "100svh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: "24px 16px",
        background: "var(--bg-base)",
        color: "var(--text-primary)",
      }}
    >
      <div
        data-testid="ticket-door"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 400,
          boxSizing: "border-box",
          padding: PADDING,
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 20,
          boxShadow: "0 4px 32px rgb(var(--ink-rgb) / 0.18)",
        }}
      >
        {/* Header of the ticket: logo (or the initial), venue and table / room */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" width={56} height={56} style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover", flexShrink: 0 }} />
          ) : (
            <span
              aria-hidden="true"
              style={{ width: 56, height: 56, borderRadius: 14, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--color-brand-light)", color: "var(--color-brand)", fontSize: 24, fontWeight: 800 }}
            >
              {initial}
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.2, fontWeight: 800, overflowWrap: "anywhere" }}>{businessName}</h1>
            {table ? (
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>{tv("tableTitle", { table: table.label })}</div>
            ) : roomLabel ? (
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>{roomLabel}</div>
            ) : null}
          </div>
        </div>

        {/* Perforation: a dotted line across the whole ticket with a bite out of each edge */}
        <div aria-hidden="true" style={{ position: "relative", height: NOTCH, margin: `18px -${PADDING}px` }}>
          <span style={{ ...bite, left: -NOTCH / 2 - 1 }} />
          <span style={{ ...bite, right: -NOTCH / 2 - 1 }} />
          <div style={{ position: "absolute", left: NOTCH, right: NOTCH, top: NOTCH / 2, borderTop: "2px dotted var(--text-tertiary)" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {menuHref ? (
            menuExternal ? (
              <a href={menuHref} target="_blank" rel="noopener noreferrer" style={button}>
                <IconToolsKitchen2 size={20} />
                {tv("viewMenu")}
              </a>
            ) : (
              <Link href={menuHref} style={button}>
                <IconToolsKitchen2 size={20} />
                {tv("viewMenu")}
              </Link>
            )
          ) : (
            <button type="button" disabled style={disabled}>
              <IconToolsKitchen2 size={20} />
              {tv("viewMenu")}
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>{t("soon")}</span>
            </button>
          )}

          <button type="button" onClick={() => setShowAssist(true)} style={button}>
            <IconBell size={20} />
            {t("requestAssistance")}
          </button>

          <button type="button" onClick={() => window.location.assign(enterUrl)} style={primary}>
            <IconMessages size={20} />
            {t("enterChat")}
          </button>
        </div>

        <p style={{ margin: "18px 0 0", textAlign: "center", fontSize: 13, color: "var(--text-secondary)" }}>
          {t("haveApp")}{" "}
          <a href={enterUrl} style={{ color: "var(--color-brand)", fontWeight: 700 }}>
            {t("openInApp")}
          </a>
        </p>
      </div>

      {children}

      {showAssist && (
        <GuestWaiterSheet
          businessId={businessId}
          businessName={businessName}
          tableToken={assistTable?.token}
          tableLabel={assistTable?.label}
          onClose={() => setShowAssist(false)}
        />
      )}
    </div>
  );
}
