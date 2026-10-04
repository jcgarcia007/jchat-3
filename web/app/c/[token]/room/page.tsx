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
import { requireAgeConfirmed } from "@/lib/age";
import { ChatRoom } from "./ChatRoom";
import { getTranslations } from "next-intl/server";

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
  const t = await getTranslations("qrEntry");

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
        chatThemeId={1}
      />
    );
  }

  const supabase = await createSupabaseServerClient();

  const [{ data: rpcData }, { data: authData }] = await Promise.all([
    supabase.rpc("resolve_room_qr", { token }),
    supabase.auth.getUser(),
  ]);

  // Fetch chat_theme_id after we have the room_id
  const room = (rpcData as ResolvedRoom[] | null)?.[0] ?? null;
  let chatThemeId = 1;
  if (room) {
    const { data: roomRow } = await supabase
      .from("rooms")
      .select("chat_theme_id")
      .eq("id", room.room_id)
      .maybeSingle();
    chatThemeId = (roomRow as { chat_theme_id: number | null } | null)?.chat_theme_id ?? 1;
  }

  // No session → login with return URL
  if (!authData.user) {
    redirect(
      `/auth/login?next=${encodeURIComponent(`/c/${token}/room`)}`
    );
  }
  await requireAgeConfirmed(supabase, authData.user.id, `/c/${token}/room`);

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
              color: "var(--on-brand)",
            }}
          >
            <IconQrcode size={24} />
          </span>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>
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
              {t("invalidBodyShort")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Golden rule: the chat needs a live venue presence (created by join_room_via_qr WITH coordinates).
  // Staff are exempt. Without presence the hub asks for the location again (membership alone is not enough).
  const db = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }>;
  };
  const [{ data: present }, { data: staff }] = await Promise.all([
    db.rpc("venue_presence_ok", { p_business_id: room.business_id, p_user_id: authData.user.id }),
    db.rpc("is_venue_staff", { p_business_id: room.business_id, p_user_id: authData.user.id }),
  ]);
  if (present !== true && staff !== true) redirect(`/c/${token}`);

  return (
    <ChatRoom
      token={token}
      roomId={room.room_id}
      roomName={room.room_name}
      businessName={room.business_name}
      businessId={room.business_id}
      userId={authData.user!.id}
      chatThemeId={chatThemeId}
    />
  );
}
