/**
 * JChat 3.0 — usePosAlerts
 *
 * Subscribes to two Realtime channels while the waiter is in POS / Work Mode
 * and fires in-app alerts (vibration; sound is pending expo-audio integration):
 *
 *   • order_items UPDATE  → if item_status flips to 'ready' → READY alert
 *   • service_calls INSERT filtered by business_id → SERVICE_CALL alert
 *
 * Alert settings (sound on/off, vibration on/off) come from
 * pos_kds_settings(businessId) via businesses.kds_settings.alerts. If the RPC
 * fails, defaults to vibration=true for both types.
 *
 * Sound note: expo-audio (~56.0.12) is installed but expo-av is not. Per the
 * initial spec, sound playback is a no-op until a dedicated audio integration
 * PR wires up expo-audio. All the vibration logic is fully active.
 *
 * Cleanup: both channels are removed when the component using this hook
 * unmounts, so there are no lingering subscriptions outside Work Mode.
 */

import { useEffect, useRef, useCallback } from 'react';
import { Vibration } from 'react-native';
import { supabase } from '../services/supabase';
import { posKdsSettings } from '../services/pos';
import type { PosAlertsConfig } from '../services/pos';

// ── Vibration patterns ────────────────────────────────────────────────────────
//
// Android: Vibration.vibrate(pattern) plays the array as [wait, on, off, on, …]
// iOS:     Vibration.vibrate() ignores the pattern and gives a single ~500 ms pulse.
//          Multiple calls with a short delay simulate a multi-pulse feel on iOS.

/** Two quick pulses → signals one item is ready. */
const VIBRATE_READY        = [0, 200, 120, 200];           // ~520 ms total

/** Three distinct pulses → more urgent service call. */
const VIBRATE_SERVICE_CALL = [0, 300, 100, 300, 100, 300]; // ~1 100 ms total

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Mount this inside the POS navigator (or any component that lives exactly as
 * long as Work Mode is active). Pass the business the employee is logged in to.
 */
export function usePosAlerts(businessId: string): void {
  // Keep alerts config in a ref so the Realtime callbacks always see the
  // latest value without needing to re-subscribe when the config changes.
  const alertsRef = useRef<PosAlertsConfig | null>(null);

  // Load KDS settings once per businessId. Re-fetches if the employee switches
  // business (unusual, but the hook handles it cleanly).
  useEffect(() => {
    let cancelled = false;
    void posKdsSettings(businessId).then((cfg) => {
      if (!cancelled) alertsRef.current = cfg;
    });
    return () => { cancelled = true; };
  }, [businessId]);

  // Stable alert trigger — reads from ref so it doesn't need to be in the
  // dependency array of the Realtime useEffect.
  const triggerAlert = useCallback(
    (type: 'ready' | 'service_call') => {
      const cfg = alertsRef.current?.[type];
      // Fall back to vibrating even if config hasn't loaded yet.
      const shouldVibrate = cfg ? cfg.vibration : true;

      if (shouldVibrate) {
        Vibration.vibrate(
          type === 'ready' ? VIBRATE_READY : VIBRATE_SERVICE_CALL,
        );
      }

      // ── Sound (no-op) ────────────────────────────────────────────────────
      // expo-audio is available in the project. Playback will be added here
      // once the audio integration PR lands (no rebuild needed — expo-audio
      // is already a project dependency at ~56.0.12).
      //
      // Example future implementation:
      //   if (cfg?.sound) { await player.play(); }
      // ─────────────────────────────────────────────────────────────────────
    },
    [], // stable — reads ref, no reactive deps
  );

  // Realtime subscriptions — mounted once per businessId.
  useEffect(() => {
    // ── Channel 1: order_items UPDATE ──────────────────────────────────────
    // RLS already limits events to order items belonging to the employee's
    // business, so no server-side filter is needed here. We check the status
    // transition in the callback.
    const readyCh = supabase
      .channel(`pos-alerts-ready-${businessId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'order_items' },
        (payload) => {
          const oldRow = payload.old as { item_status?: string };
          const newRow = payload.new as { item_status?: string };
          if (newRow.item_status === 'ready' && oldRow.item_status !== 'ready') {
            triggerAlert('ready');
          }
        },
      )
      .subscribe();

    // ── Channel 2: service_calls INSERT ────────────────────────────────────
    // Filter server-side by business_id so we only receive calls for this
    // business (RLS adds an additional auth gate on top).
    const scCh = supabase
      .channel(`pos-alerts-sc-${businessId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_calls',
          filter: `business_id=eq.${businessId}`,
        },
        () => {
          triggerAlert('service_call');
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(readyCh);
      void supabase.removeChannel(scCh);
    };
  }, [businessId, triggerAlert]);
}
