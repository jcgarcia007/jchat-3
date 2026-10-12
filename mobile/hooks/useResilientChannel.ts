/**
 * JChat 3.0 — useResilientChannel: a Supabase Realtime channel that recovers by itself.
 *
 * Handles the subscribe() states — SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, CLOSED. When the channel fails it is
 * REMOVED (so realtime-js stops its own rejoin and there is never a second live channel) and a new one is
 * created after 1 s, 2 s, 5 s, 10 s, then every 30 s at most (utils/channelBackoff). Every channel has its own
 * topic (channelTopic) because supabase.channel(name) returns the existing channel for a repeated name and
 * `.on()` throws after subscribe().
 *
 * Catching up: `onResubscribed` fires when the channel is subscribed again after a gap, when the app returns to
 * the foreground (AppState 'active' on iOS / Android; visibilitychange + `online` on web) while the channel is
 * healthy, and when the socket's heartbeat recovers (web). The screen then fetches what it missed. If the
 * channel is failed when the app returns to the foreground, it reconnects at once instead of waiting for the backoff.
 *
 * `reconnecting` turns true when the channel has not been SUBSCRIBED for more than 3 s (the "Reconectando…" hint).
 */

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { channelTopic, supabase } from '../services/supabase';
import { isRealtimeHealthy, subscribeRealtimeHealth } from '../services/realtimeHealth';
import { channelBackoffMs } from '../utils/channelBackoff';
import { subscribeForeground } from '../utils/foregroundEvents';

export type ResubscribeReason = 'resubscribed' | 'foreground' | 'online' | 'heartbeat';

/** How long the channel may stay un-subscribed before the UI says it is reconnecting. */
export const RECONNECTING_AFTER_MS = 3_000;

interface Options {
  /** false → no channel (not configured, entry gate still showing…). */
  enabled: boolean;
  /** Base of the unique topic (see channelTopic). */
  name: string;
  /** Anything that must recreate the channel when it changes (room id, user id…). */
  scopeKey: string;
  /** Adds the `.on(...)` handlers to a fresh channel and returns it. Latest closure is used on every (re)connect. */
  configure: (channel: RealtimeChannel) => RealtimeChannel;
  /** Catch up on what was missed while the channel was down. */
  onResubscribed?: (reason: ResubscribeReason) => void;
}

export interface ResilientChannelState {
  subscribed: boolean;
  /** Not SUBSCRIBED for more than RECONNECTING_AFTER_MS. */
  reconnecting: boolean;
}

export function useResilientChannel({ enabled, name, scopeKey, configure, onResubscribed }: Options): ResilientChannelState {
  const configureRef = useRef(configure);
  configureRef.current = configure;
  const resubscribedRef = useRef(onResubscribed);
  resubscribedRef.current = onResubscribed;

  const [subscribed, setSubscribed] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setSubscribed(false);
      setReconnecting(false);
      return undefined;
    }

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let slowTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    /** A failure status was seen since the last SUBSCRIBED (a retry is pending or running). */
    let failed = false;
    /** There was a gap: a failure happened, or this is not the first SUBSCRIBED. */
    let hadGap = false;
    let everSubscribed = false;
    let heartbeatBad = !isRealtimeHealthy();

    const clearSlowTimer = () => {
      if (slowTimer) clearTimeout(slowTimer);
      slowTimer = null;
    };
    const markUp = () => {
      clearSlowTimer();
      setSubscribed(true);
      setReconnecting(false);
    };
    const markDown = () => {
      setSubscribed(false);
      if (slowTimer || cancelled) return;
      slowTimer = setTimeout(() => {
        slowTimer = null;
        if (!cancelled) setReconnecting(true);
      }, RECONNECTING_AFTER_MS);
    };
    const removeChannel = () => {
      const old = channel;
      channel = null; // statuses of the removed channel are ignored from here on
      if (old) void supabase.removeChannel(old);
    };

    const connect = () => {
      if (cancelled) return;
      removeChannel();
      const created = configureRef.current(supabase.channel(channelTopic(name)));
      channel = created;
      created.subscribe((status) => {
        if (cancelled || channel !== created) return;
        if (status === 'SUBSCRIBED') {
          attempt = 0;
          failed = false;
          heartbeatBad = false; // a successful join means the socket is alive
          const catchUp = hadGap || everSubscribed;
          everSubscribed = true;
          hadGap = false;
          markUp();
          if (catchUp) resubscribedRef.current?.('resubscribed');
          return;
        }
        // CHANNEL_ERROR | TIMED_OUT | CLOSED: drop this channel and retry with backoff.
        failed = true;
        hadGap = true;
        markDown();
        removeChannel();
        if (!retryTimer) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            connect();
          }, channelBackoffMs(attempt++));
        }
      });
    };

    markDown(); // connecting counts as "not subscribed": the hint appears if it takes more than 3 s
    connect();

    const unsubscribeForeground = subscribeForeground((reason) => {
      if (cancelled) return;
      if (failed) {
        // Down and waiting for the backoff: the app is back, try now.
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = null;
        attempt = 0;
        connect();
      } else if (!heartbeatBad && channel) {
        resubscribedRef.current?.(reason);
      }
    });

    const unsubscribeHealth = subscribeRealtimeHealth((ok) => {
      if (cancelled) return;
      if (!ok) {
        heartbeatBad = true;
        markDown();
      } else if (heartbeatBad) {
        heartbeatBad = false;
        if (!failed) {
          markUp();
          resubscribedRef.current?.('heartbeat');
        }
      }
    });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      clearSlowTimer();
      unsubscribeForeground();
      unsubscribeHealth();
      removeChannel();
    };
  }, [enabled, name, scopeKey]);

  return { subscribed, reconnecting };
}
