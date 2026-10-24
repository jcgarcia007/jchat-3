/**
 * /c/[token]/room — the old Next web chat room, retired in W1. The chat now lives only in the Expo web app
 * ({venue}.jchat.cloud, the same code as the app), so this route only hands off, for anyone who saved the old URL:
 *   valid QR   → https://{subdomain || slug}.jchat.cloud/c/{token}   (the venue is resolved like /c/[token]/page.tsx)
 *   otherwise  → /c/{token}                                           (the door shows its own invalid-QR screen)
 * redirect() works by throwing, so it is never called inside a try/catch.
 */

import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export default async function RoomRedirectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const door = `/c/${encodeURIComponent(token)}`;

  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const { data: rooms } = await supabase.rpc("resolve_room_qr", { token });
    const room = (rooms as { business_id: string }[] | null)?.[0];
    if (room) {
      const { data: venue } = await supabase
        .from("businesses")
        .select("slug, subdomain")
        .eq("id", room.business_id)
        .maybeSingle();
      const host = venue?.subdomain || venue?.slug;
      if (host) redirect(`https://${host}.jchat.cloud${door}`);
    }
  }

  redirect(door);
}
