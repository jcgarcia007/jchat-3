/**
 * /c/[token] — the DOOR of a venue (room QR). Server Component: resolves the QR token and the venue's public data and
 * renders the venue's ticket (TicketDoor): View menu · Request assistance · Enter the chat. Or the invalid-QR screen.
 * No dashboard chrome — this is customer-facing. The CHAT is the Expo web app ({venue}.jchat.cloud, the same code as
 * the app): "Enter the chat" goes to https://{venue}.jchat.cloud/c/{token}. This page asks for no location and no account.
 */

import type { Metadata } from "next";
import { IconQrcode } from "@tabler/icons-react";
import {
  createSupabaseServerClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { TicketDoor } from "@/components/c/TicketDoor";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("qrEntry.title") };
}

interface VenueRow {
  id: string;
  name: string;
  slug: string;
  subdomain: string | null;
  logo_url: string | null;
  menu_mode: string | null;
  external_menu_url: string | null;
}

interface ResolvedRoom {
  room_id: string;
  parent_room_id: string | null;
  business_id: string;
  business_name: string;
  room_name: string;
  is_sub_room: boolean;
}

export default async function QREntryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("qrEntry");

  let room: ResolvedRoom | null = null;
  let venue: VenueRow | null = null;

  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const { data: rpcData } = await supabase.rpc("resolve_room_qr", { token });
    room = (rpcData as ResolvedRoom[] | null)?.[0] ?? null;
    if (room) {
      // Public columns of the venue: name, logo, the host of its chat ({subdomain || slug}.jchat.cloud) and its menu.
      const { data } = await supabase
        .from("businesses")
        .select("id, name, slug, subdomain, logo_url, menu_mode, external_menu_url")
        .eq("id", room.business_id)
        .maybeSingle();
      venue = (data as VenueRow | null) ?? null;
    }
  }

  const shell: React.CSSProperties = {
    minHeight: "100svh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    background: "var(--bg-base)",
    color: "var(--text-primary)",
  };

  const card: React.CSSProperties = {
    width: "100%",
    maxWidth: 400,
    background: "var(--bg-surface)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 20,
    padding: "28px 24px",
    boxShadow: "0 4px 32px rgb(var(--ink-rgb) / 0.18)",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  };

  // ── Invalid QR ──────────────────────────────────────────────────────────────
  if (!room || !venue) {
    return (
      <div style={shell}>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: 12,
                background: "var(--color-danger)",
                color: "var(--on-brand)",
                flexShrink: 0,
              }}
            >
              <IconQrcode size={22} />
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>JChat</div>
              <div
                style={{ fontSize: 12, color: "var(--text-secondary)" }}
              >
                {t("accessByQr")}
              </div>
            </div>
          </div>

          <div>
            <h1
              style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}
            >
              {t("invalidTitle")}
            </h1>
            <p
              style={{
                fontSize: 14,
                color: "var(--text-secondary)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {t("invalidBody")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Valid QR — the venue's ticket ────────────────────────────────────────────
  const host = venue.subdomain || venue.slug;
  const menuExternal = venue.menu_mode === "external" && !!venue.external_menu_url;
  const menuHref = menuExternal ? venue.external_menu_url : venue.menu_mode === "web" ? `/m/${venue.slug}` : null;

  return (
    <TicketDoor
      businessId={venue.id}
      businessName={venue.name}
      businessSlug={venue.slug}
      logoUrl={venue.logo_url}
      roomLabel={room.is_sub_room ? room.room_name : null}
      menuHref={menuHref}
      menuExternal={menuExternal}
      enterUrl={`https://${host}.jchat.cloud/c/${encodeURIComponent(token)}`}
    >
      <LanguageSwitcher />
    </TicketDoor>
  );
}
