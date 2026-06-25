/**
 * /c/[token]/room — Web chat room (Pieza 3a)
 * Server Component: resolves token → room, verifies session, gates access.
 * Renders <ChatRoom> client component that owns messages + realtime.
 */

import { redirect } from "next/navigation";
import { IconQrcode } from "@tabler/icons-react";
import {
  createSupabaseServerClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { ChatRoom } from "./ChatRoom";

interface ResolvedRoom {
  room_id: string;
  parent_room_id: string | null;
  business_id: string;
  business_name: string;
  room_name: string;
  is_sub_room: boolean;
}

export default async function RoomPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Demo mode — no real backend
  if (!isSupabaseConfigured) {
    return (
      <ChatRoom
        token={token}
        roomId="demo-room"
        roomName="Demo Room"
        businessName="Demo Business"
        businessId="demo-business"
        userId="demo-user"
      />
    );
  }

  const supabase = await createSupabaseServerClient();

  const [{ data: rpcData }, { data: authData }] = await Promise.all([
    supabase.rpc("resolve_room_qr", { token }),
    supabase.auth.getUser(),
  ]);

  // No session → login with return URL
  if (!authData.user) {
    redirect(
      `/auth/login?next=${encodeURIComponent(`/c/${token}/room`)}`
    );
  }

  const room = (rpcData as ResolvedRoom[] | null)?.[0] ?? null;

  // Invalid token
  if (!room) {
    return (
      <div
        style={{
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 16px",
          background: "var(--bg-base)",
          color: "var(--text-primary)",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 400,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 20,
            padding: "28px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "var(--color-danger)",
              color: "#fff",
            }}
          >
            <IconQrcode size={24} />
          </span>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>
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
              Este código QR no está asociado a ninguna sala activa.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ChatRoom
      token={token}
      roomId={room.room_id}
      roomName={room.room_name}
      businessName={room.business_name}
      businessId={room.business_id}
      userId={authData.user.id}
    />
  );
}
