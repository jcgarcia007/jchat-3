/**
 * /t/[token] — Public per-table QR entry (Mesas/Taps B5).
 *
 * Server Component: resolves the table token via resolve_table_qr (anon-callable,
 * since anon has zero grants on tables). Renders a friendly "unavailable" screen
 * for an unknown/inactive table, otherwise hands off to a small client piece that
 * stores the table context, optionally joins the table subchat (reusing
 * join_room_via_qr, the /c mechanism), and redirects to /m/{slug} to order.
 *
 * PUBLIC route — no dashboard chrome, no session required.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { IconQrcode } from "@tabler/icons-react";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { TableEntry } from "./TableEntry";

export const metadata: Metadata = {
  title: "Mesa — JChat",
};

interface ResolvedTable {
  table_label: string;
  business_slug: string;
  room_qr_token: string | null;
}

export default async function TableQrPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let resolved: ResolvedTable | null = null;
  let hasSession = false;

  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const [{ data }, { data: auth }] = await Promise.all([
      supabase.rpc("resolve_table_qr", { p_token: token }),
      supabase.auth.getUser(),
    ]);
    resolved = (data as ResolvedTable[] | null)?.[0] ?? null;
    hasSession = !!auth.user;
  }

  if (!resolved) {
    return (
      <div style={shell}>
        <div style={card}>
          <span style={iconWrap}>
            <IconQrcode size={30} />
          </span>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
            Esta mesa no está disponible
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
            El código QR no corresponde a ninguna mesa activa. Pídele al personal que lo revise.
          </p>
          <Link href="/" style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>
            Ir al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <TableEntry
      token={token}
      tableLabel={resolved.table_label}
      businessSlug={resolved.business_slug}
      roomQrToken={resolved.room_qr_token}
      hasSession={hasSession}
    />
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
