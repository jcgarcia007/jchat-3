/**
 * JChat 3.0 — PinnedBanner (Task 2.5)
 *
 * A sticky banner rendered below the sub-rooms tab row. Shows the most recent
 * active (non-expired) pinned message for a room. Tapping expands a list of
 * ALL active pins.
 *
 * Features:
 *   • Displays pin icon + truncated text + live countdown (updated every minute).
 *   • X button (only when canUnpin === true) calls onUnpin(pinId).
 *   • Multiple pins: tap the banner to open an inline expanded list.
 *   • Auto-unpin: on mount and on every minute tick, expired rows are deleted
 *     from pinned_messages and hidden from the UI.
 *   • Realtime subscription: updates when a new row is inserted/deleted.
 *   • Unsubscribes on unmount.
 *
 * Exported helpers:
 *   useActivePins(roomId) — returns the active pins for a room; use this hook
 *     to decide whether to render <PinnedBanner />.
 *   fetchActivePins(roomId) — one-shot fetch (no subscription).
 *
 * Colors: ChatTheme prop + useThemeColors() for fallback chrome. NO hardcoded hex.
 * Icons: @tabler/icons-react-native
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {
  IconChevronDown,
  IconChevronUp,
  IconPin,
  IconX,
} from '@tabler/icons-react-native';
import { useThemeColors } from '../../theme/colors';
import type { ThemeColors } from '../../theme/colors';
import type { ChatTheme } from '../../theme/chatThemes';
import { supabase, isSupabaseConfigured } from '../../services/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PinnedMessage {
  id: string;
  message_id: string;
  room_id: string;
  pinned_by: string;
  expires_at: string | null;
  notify: boolean;
  created_at: string;
  /** Joined from messages.body (fetched separately). */
  body: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * One-shot fetch of all active (non-expired) pinned messages for a room,
 * joined with the corresponding message body.
 *
 * Usage in the parent:
 *   const pins = await fetchActivePins(roomId);
 */
export async function fetchActivePins(roomId: string): Promise<PinnedMessage[]> {
  if (!isSupabaseConfigured) return [];

  const now = new Date().toISOString();

  // Fetch pinned_messages rows that have not expired.
  const { data: rows, error } = await supabase
    .from('pinned_messages')
    .select('id, message_id, room_id, pinned_by, expires_at, notify, created_at')
    .eq('room_id', roomId)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false });

  if (error || !rows || rows.length === 0) return [];

  // Fetch the bodies of the referenced messages.
  const msgIds = rows.map((r) => r.message_id);
  const { data: messages } = await supabase
    .from('messages')
    .select('id, body')
    .in('id', msgIds);

  const bodyMap = new Map<string, string>(
    (messages ?? []).map((m: { id: string; body: string }) => [m.id, m.body]),
  );

  return rows.map((r) => ({
    id:         r.id as string,
    message_id: r.message_id as string,
    room_id:    r.room_id as string,
    pinned_by:  r.pinned_by as string,
    expires_at: r.expires_at as string | null,
    notify:     r.notify as boolean,
    created_at: r.created_at as string,
    body:       bodyMap.get(r.message_id as string) ?? '',
  }));
}

/**
 * Hook: subscribes to pinned_messages for a room and maintains a live list of
 * active (non-expired) pins. Unsubscribes on unmount.
 *
 * Usage:
 *   const { pins, loading } = useActivePins(roomId);
 *   // Render <PinnedBanner /> only when pins.length > 0
 */
export function useActivePins(roomId: string): {
  pins: PinnedMessage[];
  loading: boolean;
} {
  const [pins, setPins] = useState<PinnedMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const active = await fetchActivePins(roomId);
    setPins(active);
    setLoading(false);
  }, [roomId]);

  useEffect(() => {
    setLoading(true);
    void load();

    if (!isSupabaseConfigured) return;

    // Realtime: refresh the full list on any change to this room's pins.
    // Unique topic per subscription: supabase.channel(topic) returns the EXISTING
    // channel for a repeated topic, and .on() after subscribe() throws. removeChannel
    // is async, so a fast remount (e.g. returning from checkout) can still hit the old
    // one. The real scoping is the filter below, not the topic.
    const topic = `pinned_messages:${roomId}:${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'pinned_messages',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, load]);

  return { pins, loading };
}

// ── Countdown helper ──────────────────────────────────────────────────────────

/** Returns a human-readable time remaining string, or '' if no expiry. */
function timeRemaining(expiresAt: string | null): string {
  if (!expiresAt) return '';
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return '';
  const totalMins = Math.ceil(diff / 60_000);
  if (totalMins < 60) return `${totalMins}m`;
  const hours = Math.floor(totalMins / 60);
  const mins  = totalMins % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/** Returns true when the pin has already passed its expiry. */
function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

// ── All-pins modal ────────────────────────────────────────────────────────────

interface AllPinsModalProps {
  pins: PinnedMessage[];
  visible: boolean;
  canUnpin: boolean;
  onUnpin: (pinId: string) => void;
  onClose: () => void;
  theme: ChatTheme;
  c: ThemeColors;
  countdown: Map<string, string>;
}

function AllPinsModal({
  pins,
  visible,
  canUnpin,
  onUnpin,
  onClose,
  theme,
  c,
  countdown,
}: AllPinsModalProps) {
  const { t } = useTranslation('chat');
  const s = useMemo(() => modalStyles(c, theme), [c, theme]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose} accessible={false}>
        <View style={s.scrim} />
      </TouchableWithoutFeedback>

      <View style={s.sheet}>
        <View style={s.handle} />

        <View style={s.header}>
          <IconPin size={18} color={theme.accent} />
          <Text style={s.headerTitle}>
            {t('pin.allPinsTitle', { count: pins.length })}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('actions.close', { ns: 'common' })}
          >
            <IconX size={20} color={c.textSecondary} />
          </Pressable>
        </View>

        <FlatList
          data={pins}
          keyExtractor={(item) => item.id}
          bounces={false}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={s.separator} />}
          renderItem={({ item }) => (
            <View style={s.pinRow}>
              <View style={s.pinAccent} />
              <View style={s.pinBody}>
                <Text style={s.pinText} numberOfLines={3}>
                  {item.body}
                </Text>
                {countdown.get(item.id) !== '' && (
                  <View style={s.timerRow}>
                    <Text style={s.timerText}>
                      ⏱ {countdown.get(item.id)}
                    </Text>
                  </View>
                )}
              </View>
              {canUnpin && (
                <Pressable
                  onPress={() => onUnpin(item.id)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('pin.unpin')}
                  style={s.unpinBtn}
                >
                  <IconX size={16} color={c.textSecondary} />
                </Pressable>
              )}
            </View>
          )}
          contentContainerStyle={s.listContent}
          ListEmptyComponent={
            <Text style={s.empty}>{t('pin.noActivePins')}</Text>
          }
        />
      </View>
    </Modal>
  );
}

function modalStyles(c: ThemeColors, theme: ChatTheme) {
  return StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.50)',
    },
    sheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: c.bgSurface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderTopWidth: 1,
      borderTopColor: c.borderSubtle,
      maxHeight: '70%',
      paddingBottom: 32,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.borderSubtle,
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 4,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderSubtle,
    },
    headerTitle: {
      flex: 1,
      color: c.textPrimary,
      fontSize: 16,
      fontWeight: '700',
    },
    listContent: {
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.borderSubtle,
      marginVertical: 4,
    },
    pinRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 10,
      gap: 10,
    },
    pinAccent: {
      width: 3,
      borderRadius: 2,
      backgroundColor: theme.accent,
      alignSelf: 'stretch',
      minHeight: 20,
    },
    pinBody: {
      flex: 1,
      gap: 4,
    },
    pinText: {
      color: c.textPrimary,
      fontSize: 14,
      lineHeight: 20,
    },
    timerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    timerText: {
      color: c.textTertiary,
      fontSize: 11,
    },
    unpinBtn: {
      paddingTop: 2,
    },
    empty: {
      color: c.textTertiary,
      fontSize: 14,
      textAlign: 'center',
      paddingVertical: 24,
    },
  });
}

// ── PinnedBanner component ────────────────────────────────────────────────────

export interface PinnedBannerProps {
  /**
   * Room id whose pins are displayed.
   * The component manages its own data subscription via useActivePins().
   */
  roomId: string;
  /** Active ChatTheme for accent color. */
  theme: ChatTheme;
  /**
   * When true the X button is visible, allowing the current user to unpin.
   * Should be true when the viewer is Owner or Moderator.
   */
  canUnpin: boolean;
  /**
   * Called when the user confirms unpinning a message.
   * Receives the pinned_messages.id (not the message_id).
   * The parent MAY handle further cleanup; the component itself deletes the
   * row from Supabase.
   */
  onUnpin?: (pinId: string) => void;
}

export function PinnedBanner({
  roomId,
  theme,
  canUnpin,
  onUnpin,
}: PinnedBannerProps) {
  const c = useThemeColors();
  const { t } = useTranslation('chat');
  const { pins, loading } = useActivePins(roomId);

  /** Per-pin countdown strings, updated every minute. */
  const [countdown, setCountdown] = useState<Map<string, string>>(new Map());
  /** Whether the all-pins modal is open. */
  const [showAll, setShowAll] = useState(false);
  /** Unpin in-flight set. */
  const [unpinning, setUnpinning] = useState<Set<string>>(new Set());

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Countdown timer ─────────────────────────────────────────────────────────

  const refreshCountdown = useCallback((activePins: PinnedMessage[]) => {
    const map = new Map<string, string>();
    activePins.forEach((p) => {
      map.set(p.id, timeRemaining(p.expires_at));
    });
    setCountdown(map);
  }, []);

  useEffect(() => {
    refreshCountdown(pins);

    // Tick every minute to refresh countdowns and remove newly-expired pins.
    intervalRef.current = setInterval(() => {
      refreshCountdown(pins);
      // Auto-unpin expired rows: if any have expired, delete from DB.
      const expired = pins.filter((p) => isExpired(p.expires_at));
      if (expired.length > 0 && isSupabaseConfigured) {
        const ids = expired.map((p) => p.id);
        void supabase.from('pinned_messages').delete().in('id', ids);
        // The realtime subscription in useActivePins will refresh the list.
      }
    }, 60_000);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [pins, refreshCountdown]);

  // ── Unpin handler ───────────────────────────────────────────────────────────

  const handleUnpin = useCallback(
    (pinId: string) => {
      Alert.alert(
        t('pin.unpinTitle'),
        t('pin.unpinMessage'),
        [
          { text: t('actions.cancel', { ns: 'common' }), style: 'cancel' },
          {
            text: t('pin.unpin'),
            style: 'destructive',
            onPress: async () => {
              setUnpinning((prev) => new Set(prev).add(pinId));
              try {
                if (isSupabaseConfigured) {
                  const { error } = await supabase
                    .from('pinned_messages')
                    .delete()
                    .eq('id', pinId);
                  if (error) throw error;
                }
                onUnpin?.(pinId);
                setShowAll(false);
              } catch (err) {
                Alert.alert(
                  t('pin.couldNotUnpinTitle'),
                  err instanceof Error ? err.message : t('pin.tryAgain'),
                );
              } finally {
                setUnpinning((prev) => {
                  const next = new Set(prev);
                  next.delete(pinId);
                  return next;
                });
              }
            },
          },
        ],
      );
    },
    [onUnpin, t],
  );

  // ── Filter out expired (already expired at render time) ─────────────────────

  const activePins = useMemo(
    () => pins.filter((p) => !isExpired(p.expires_at)),
    [pins],
  );

  const latestPin = activePins[0];

  // ── Styles ──────────────────────────────────────────────────────────────────

  const s = useMemo(() => bannerStyles(c, theme), [c, theme]);

  // Nothing to show.
  if (loading || !latestPin) return null;

  const latestCountdown = countdown.get(latestPin.id) ?? '';
  const isUnpinning = unpinning.has(latestPin.id);

  return (
    <>
      <Pressable
        onPress={() => {
          if (activePins.length > 1) {
            setShowAll(true);
          }
        }}
        style={s.banner}
        accessibilityRole="button"
        accessibilityLabel={
          activePins.length > 1
            ? t('pin.bannerA11yMultiple', { count: activePins.length })
            : t('pin.bannerA11ySingle')
        }
      >
        {/* Left accent bar */}
        <View style={s.accentBar} />

        {/* Pin icon */}
        <IconPin size={14} color={theme.accent} style={s.pinIcon} />

        {/* Content */}
        <View style={s.content}>
          <Text style={s.pinText} numberOfLines={1}>
            {latestPin.body}
          </Text>
          <View style={s.metaRow}>
            {latestCountdown !== '' && (
              <Text style={s.countdownText}>{latestCountdown}</Text>
            )}
            {activePins.length > 1 && (
              <Text style={s.moreText}>
                {t('pin.moreCount', { count: activePins.length - 1 })}
              </Text>
            )}
          </View>
        </View>

        {/* Expand chevron — only when there are multiple pins */}
        {activePins.length > 1 && (
          <IconChevronDown size={14} color={c.textTertiary} style={s.chevron} />
        )}

        {/* Unpin X — only for owner/moderator, one-at-a-time spinner */}
        {canUnpin && (
          <Pressable
            onPress={() => handleUnpin(latestPin.id)}
            disabled={isUnpinning}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('pin.unpin')}
            style={s.unpinBtn}
          >
            {isUnpinning ? (
              <ActivityIndicator size="small" color={c.textSecondary} />
            ) : (
              <IconX size={14} color={c.textSecondary} />
            )}
          </Pressable>
        )}
      </Pressable>

      {/* All-pins modal */}
      <AllPinsModal
        pins={activePins}
        visible={showAll}
        canUnpin={canUnpin}
        onUnpin={handleUnpin}
        onClose={() => setShowAll(false)}
        theme={theme}
        c={c}
        countdown={countdown}
      />
    </>
  );
}

// ── Banner styles ─────────────────────────────────────────────────────────────

function bannerStyles(c: ThemeColors, theme: ChatTheme) {
  return StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
      paddingVertical: 6,
      paddingRight: 10,
      minHeight: 36,
      overflow: 'hidden',
    },
    accentBar: {
      width: 3,
      alignSelf: 'stretch',
      backgroundColor: theme.accent,
      borderRadius: 2,
      marginRight: 8,
    },
    pinIcon: {
      marginRight: 6,
      opacity: 0.8,
    },
    content: {
      flex: 1,
      gap: 1,
    },
    pinText: {
      color: theme.bubbleInText,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    countdownText: {
      color: c.textTertiary,
      fontSize: 10,
    },
    moreText: {
      color: theme.accent,
      fontSize: 10,
      fontWeight: '600',
    },
    chevron: {
      marginHorizontal: 4,
      opacity: 0.6,
    },
    unpinBtn: {
      paddingLeft: 8,
      paddingVertical: 4,
    },
  });
}
