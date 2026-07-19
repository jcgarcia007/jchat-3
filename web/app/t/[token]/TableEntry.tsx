"use client";

/**
 * Client hand-off for /t/[token] (B5). Stores the table context, optionally
 * joins the table subchat (reusing join_room_via_qr — the /c mechanism), then
 * redirects to the ordering surface /m/{slug}.
 *
 * Table context is stored in sessionStorage under TABLE_CONTEXT_KEY: it is a
 * transient, per-tab ordering session tied to sitting at the table. sessionStorage
 * (not a cookie/localStorage) is deliberate — it clears when the tab closes, isn't
 * sent to the server on every request, and doesn't persist across sessions, which
 * suits a short-lived, privacy-sensitive "I'm at this table" hint. B3 CONSUMES it;
 * this phase only WRITES it.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/** sessionStorage key holding the current table context ({ token, tableLabel, businessSlug }). */
export const TABLE_CONTEXT_KEY = "jchat.tableContext";

export function TableEntry({
  token,
  tableLabel,
  businessSlug,
  roomQrToken,
  hasSession,
}: {
  token: string;
  tableLabel: string;
  businessSlug: string;
  roomQrToken: string | null;
  hasSession: boolean;
}) {
  const router = useRouter();
  const ran = useRef(false);
  const [status, setStatus] = useState("Preparando tu mesa…");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      // 1) Persist the table context for the ordering flow (B3 consumes it).
      try {
        sessionStorage.setItem(
          TABLE_CONTEXT_KEY,
          JSON.stringify({ token, tableLabel, businessSlug }),
        );
      } catch {
        // sessionStorage may be unavailable (private mode) — non-fatal.
      }

      // 2) If the table has a subchat AND we have a session, join it reusing the
      //    existing /c mechanism (join_room_via_qr grants 24h membership in the
      //    room + its parent). Without a session we skip — anonymous login lands
      //    later; the redirect still proceeds.
      if (roomQrToken && hasSession && isSupabaseConfigured) {
        setStatus("Entrando al chat de la mesa…");
        try {
          await supabase.rpc("join_room_via_qr", { token: roomQrToken });
        } catch {
          // Non-fatal: still send the user to order.
        }
      }

      // 3) Go to the ordering surface.
      router.replace(`/m/${businessSlug}`);
    })();
  }, [token, tableLabel, businessSlug, roomQrToken, hasSession, router]);

  return (
    <div
      style={{
        minHeight: "100svh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "24px 16px",
        background: "var(--bg-base)",
        color: "var(--text-primary)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 800 }}>{tableLabel}</div>
      <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>{status}</div>
    </div>
  );
}
