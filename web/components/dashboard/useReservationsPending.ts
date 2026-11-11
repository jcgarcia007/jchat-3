"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";

/**
 * M3: live count of reservations waiting for an answer (status = 'pending') for the active business — the number next to "Reservations" in the menu.
 * Subscribes on mount, unsubscribes on unmount (Supabase Realtime rule). Non-critical chrome: any failure is swallowed and the count stays at 0.
 */
export function useReservationsPending(): number {
  const [pending, setPending] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    async function countPending(businessId: string) {
      const { count, error } = await supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("status", "pending");
      if (!active) return;
      if (!error) setPending(count ?? 0);
    }

    void (async () => {
      try {
        const res = await resolveActiveBusiness();
        if (!active || !res.ok) return;
        const businessId = res.business.id;
        await countPending(businessId);
        channelRef.current = supabase
          .channel(`nav-reservations-${businessId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "reservations", filter: `business_id=eq.${businessId}` },
            () => {
              void countPending(businessId).catch(() => {});
            },
          )
          .subscribe();
      } catch {
        // Silent: badge is non-critical chrome.
      }
    })();

    return () => {
      active = false;
      if (channelRef.current) void supabase.removeChannel(channelRef.current);
    };
  }, []);

  return pending;
}
