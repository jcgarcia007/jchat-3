/**
 * /t/[token] — the DOOR of a table (table QR). Server Component: resolves the table token via resolve_table_qr
 * (anon-callable, since anon has zero grants on tables) and the venue's public data, and renders the same ticket as
 * /c (TicketDoor) with "Table {label}": View menu · Request assistance · Enter the chat. A friendly "unavailable"
 * screen for an unknown / inactive table.
 *
 * The CHAT is the Expo web app: "Enter the chat" goes to https://{venue}.jchat.cloud/t/{token}. This page asks for no
 * location and no account; TicketDoor keeps the table in this tab so the menu orders to it.
 *
 * PUBLIC route — no dashboard chrome, no session required.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { IconQrcode } from "@tabler/icons-react";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { TicketDoor } from "@/components/c/TicketDoor";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("table.title") };
}

interface ResolvedTable {
  table_label: string;
  business_slug: string;
  room_qr_token: string | null;
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

export default async function TableQrPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("tableEntry");

  let resolved: ResolvedTable | null = null;
  let business: VenueRow | null = null;

  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.rpc("resolve_table_qr", { p_token: token });
    resolved = (data as ResolvedTable[] | null)?.[0] ?? null;
    if (resolved) {
      // Public columns of the venue: name, logo, the host of its chat ({subdomain || slug}.jchat.cloud) and its menu.
      const { data: biz } = await supabase
        .from("businesses")
        .select("id, name, slug, subdomain, logo_url, menu_mode, external_menu_url")
        .eq("slug", resolved.business_slug)
        .maybeSingle();
      business = (biz as VenueRow | null) ?? null;
    }
  }

  if (!resolved || !business) {
    return (
      <div style={shell}>
        <div style={card}>
          <span style={iconWrap}>
            <IconQrcode size={30} />
          </span>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
            {t("unavailableTitle")}
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
            {t("unavailableBody")}
          </p>
          <Link href="/" style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>
            {t("goHome")}
          </Link>
        </div>
      </div>
    );
  }

  const host = business.subdomain || business.slug;
  const menuExternal = business.menu_mode === "external" && !!business.external_menu_url;
  const menuHref = menuExternal ? business.external_menu_url : business.menu_mode === "web" ? `/m/${business.slug}` : null;

  return (
    <TicketDoor
      businessId={business.id}
      businessName={business.name}
      businessSlug={business.slug}
      logoUrl={business.logo_url}
      table={{ token, label: resolved.table_label }}
      menuHref={menuHref}
      menuExternal={menuExternal}
      enterUrl={`https://${host}.jchat.cloud/t/${encodeURIComponent(token)}`}
    >
      <LanguageSwitcher />
    </TicketDoor>
  );
}

const shell: React.CSSProperties = {
  minHeight: "100svh",
  display: "flex",
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
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: 14,
};

const iconWrap: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 56,
  height: 56,
  borderRadius: 16,
  background: "var(--bg-overlay, rgba(0,0,0,0.06))",
  color: "var(--text-secondary)",
};
