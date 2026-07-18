"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";

/**
 * Live count of pending service_calls for the active business.
 *
 * This is a standalone COPY of the badge logic in the old Sidebar
 * (web/components/dashboard/Sidebar.tsx) — deliberately duplicated so the new
 * 4A nav can carry the badge without touching (or risking) the old nav during
 * Fase 0. When the old Sidebar is removed in Fase 3, this becomes the single
 * home for the logic.
 *
 * Subscribes on mount, unsubscribes on unmount (per Supabase Realtime rules).
 * Non-critical chrome: any failure is swallowed and the count stays at 0.
 */
export function useServicePending(): number {
  const [servicePending, setServicePending] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    async function countPending(businessId: string) {
      const { count, error } = await supabase
        .from("service_calls")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("status", "pending");
      if (!active) return;
      if (!error) setServicePending(count ?? 0);
    }

    void (async () => {
      try {
        const res = await resolveActiveBusiness();
        if (!active || !res.ok) return;
        const businessId = res.business.id;
        await countPending(businessId);
        channelRef.current = supabase
          .channel(`nav-service-${businessId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "service_calls", filter: `business_id=eq.${businessId}` },
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

  return servicePending;
}
