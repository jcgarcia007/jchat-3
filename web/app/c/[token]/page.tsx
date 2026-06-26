/**
 * /c/[token] — Public QR entry page (mobile-first)
 * Server Component: resolves the QR token, checks session, renders welcome
 * screen or invalid-QR screen. No dashboard chrome — this is customer-facing.
 *
 * Pieza 1: resolve + login-with-return + join
 * TODO(Pieza 3): after join success, navigate to the live chat room
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  IconMessageCircle2,
  IconQrcode,
  IconBuilding,
  IconDoor,
} from "@tabler/icons-react";
import {
  createSupabaseServerClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { RoomHub } from "./RoomHub";

export const metadata: Metadata = {
  title: "Entrar al chat — JChat",
};

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

  let room: ResolvedRoom | null = null;
  let hasSession = false;
  let userId = "";

  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const [{ data: rpcData }, { data: authData }] = await Promise.all([
      supabase.rpc("resolve_room_qr", { token }),
      supabase.auth.getUser(),
    ]);
    room = (rpcData as ResolvedRoom[] | null)?.[0] ?? null;
    hasSession = !!authData.user;
    userId = authData.user?.id ?? "";
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
    boxShadow: "0 4px 32px rgba(0,0,0,0.18)",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  };

  // ── Invalid QR ──────────────────────────────────────────────────────────────
  if (!room) {
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
                color: "#fff",
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
                Acceso por QR
              </div>
            </div>
          </div>

          <div>
            <h1
              style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}
            >
              QR inválido
            </h1>
            <p
              style={{
                fontSize: 14,
                color: "var(--text-secondary)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Este código QR no está asociado a ninguna sala activa. Pide
              uno nuevo al establecimiento.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Valid QR — Welcome screen ────────────────────────────────────────────────
  const loginUrl = `/auth/login?next=${encodeURIComponent(`/c/${token}`)}`;

  return (
    <div style={shell}>
      <div style={card}>
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "var(--color-brand)",
              color: "#fff",
              flexShrink: 0,
            }}
          >
            <IconMessageCircle2 size={22} />
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>JChat</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Escaneo de código QR
            </div>
          </div>
        </div>

        {/* Venue info */}
        <div
          style={{
            background: "var(--bg-elevated)",
            borderRadius: 12,
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--text-secondary)",
              fontSize: 12,
            }}
          >
            <IconBuilding size={14} />
            Negocio
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>
            {room.business_name}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: "var(--text-secondary)",
              marginTop: 4,
            }}
          >
            <IconDoor size={14} />
            {room.room_name}
          </div>
        </div>

        {/* Access info — only shown pre-login */}
        {!hasSession && (
          <div>
            <p
              style={{
                fontSize: 14,
                color: "var(--text-primary)",
                margin: "0 0 4px",
                lineHeight: 1.5,
              }}
            >
              Estás entrando al chat de{" "}
              <strong>{room.business_name}</strong>
              {" — "}
              <strong>{room.room_name}</strong>.
            </p>
            {room.is_sub_room && (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                También tendrás acceso a la sala principal del lugar.
              </p>
            )}
          </div>
        )}

        {/* CTA */}
        {hasSession ? (
          <RoomHub
            token={token}
            roomId={room.room_id}
            businessId={room.business_id}
            isSubRoom={room.is_sub_room}
            userId={userId}
          />
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            <Link
              href={loginUrl}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "13px 16px",
                borderRadius: 12,
                background: "var(--color-brand)",
                color: "#fff",
                fontSize: 15,
                fontWeight: 600,
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              Iniciar sesión para entrar
            </Link>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-tertiary)",
                textAlign: "center",
                margin: 0,
              }}
            >
              Necesitas una cuenta JChat para acceder al chat.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
