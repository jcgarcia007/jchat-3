/**
 * JChat 3.0 — Events Screen (Task 2.19)
 *
 * Mobile list of upcoming/live events for the authenticated user.
 * Feeds the Nearby screen with date/time info.
 *
 * - Loads `events` with status upcoming|live from Supabase (sorted by starts_at).
 * - Realtime subscription refreshes the list when events change.
 * - Tap an event → EventDetailScreen.
 * - Demo fallback: renders placeholder cards when Supabase is not configured.
 *
 * TODO(Stage 4): tap "View on map" when native map (Stage 4) is complete.
 * TODO(i18n): wrap user-facing strings with t() once locales cover this screen.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Image,
} from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  IconCalendarEvent,
  IconClock,
  IconMapPin,
  IconAlertCircle,
} from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { supabase, isSupabaseConfigured } from '../../services/supabase';

// ── Types ────────────────────────────────────────────────────────────────────

export interface Event {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  starts_at: string;
  ends_at: string | null;
  lat: number | null;
  lng: number | null;
  room_id: string | null;
  status: 'upcoming' | 'live' | 'closed';
  created_at: string;
}

// ── Demo data (shown when Supabase is not configured) ─────────────────────────

const DEMO_EVENTS: Event[] = [
  {
    id: 'demo-evt-1',
    business_id: 'demo-biz',
    name: 'Friday Night Live 🎤',
    description: 'Live music every Friday from 8pm.',
    cover_url: null,
    starts_at: new Date(Date.now() + 2 * 86400000).toISOString(),
    ends_at: new Date(Date.now() + 2 * 86400000 + 4 * 3600000).toISOString(),
    lat: 25.7617,
    lng: -80.1918,
    room_id: 'demo-room-1',
    status: 'upcoming',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-evt-2',
    business_id: 'demo-biz',
    name: 'Saturday Brunch & Jazz',
    description: 'Bottomless brunch with live jazz trio.',
    cover_url: null,
    starts_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    ends_at: new Date(Date.now() + 3 * 86400000 + 3 * 3600000).toISOString(),
    lat: 25.7617,
    lng: -80.1918,
    room_id: 'demo-room-2',
    status: 'upcoming',
    created_at: new Date().toISOString(),
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatEventDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatEventTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// ── EventsScreen ─────────────────────────────────────────────────────────────

interface EventsScreenProps {
  /** Optional: filter by a specific venue. Used by Nearby screen integration. */
  businessId?: string;
  /** Called when user taps an event card — host navigator can push detail. */
  onSelectEvent?: (event: Event) => void;
}

export default function EventsScreen({
  businessId,
  onSelectEvent,
}: EventsScreenProps) {
  const c = useThemeColors();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchEvents = useCallback(async (silent = false) => {
    if (!isSupabaseConfigured) {
      setEvents(DEMO_EVENTS);
      return;
    }
    if (!silent) setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('events')
        .select('*')
        .in('status', ['upcoming', 'live'])
        .order('starts_at', { ascending: true })
        .limit(50);

      if (businessId) {
        query = query.eq('business_id', businessId);
      }

      const { data, error: err } = await query;
      if (err) throw err;
      setEvents((data as Event[]) ?? []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    void fetchEvents();

    if (!isSupabaseConfigured) return;

    channelRef.current = supabase
      .channel('events-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => {
          void fetchEvents(true);
        }
      )
      .subscribe();

    return () => {
      // Unsubscribe on unmount — required per architecture rules
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchEvents]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchEvents();
  }, [fetchEvents]);

  // ── render helpers ─────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: Event }) => (
      <EventCard
        event={item}
        colors={c}
        onPress={onSelectEvent ? () => onSelectEvent(item) : undefined}
      />
    ),
    [c, onSelectEvent]
  );

  const keyExtractor = useCallback((item: Event) => item.id, []);

  // ── render ─────────────────────────────────────────────────────────────────
  if (loading && events.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: c.bgBase }]}>
        <ActivityIndicator color={palette.brand} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bgBase }]}>
      {/* Error banner */}
      {error && (
        <View
          style={[
            styles.errorBanner,
            { backgroundColor: `${palette.danger}20`, borderColor: palette.danger },
          ]}
        >
          <IconAlertCircle size={14} color={palette.danger} />
          <Text style={[styles.errorText, { color: palette.danger }]}>
            {error}
          </Text>
        </View>
      )}

      {/* Demo mode notice */}
      {!isSupabaseConfigured && (
        <View
          style={[
            styles.demoBanner,
            { backgroundColor: `${palette.warning}20` },
          ]}
        >
          <Text style={[styles.demoText, { color: palette.warning }]}>
            Demo mode — connect Supabase to see live events
          </Text>
        </View>
      )}

      <FlatList<Event>
        data={events}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={
          events.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={palette.brand}
          />
        }
        ListEmptyComponent={
          <EmptyState colors={c} />
        }
      />
    </View>
  );
}

// ── EventCard ─────────────────────────────────────────────────────────────────

interface EventCardProps {
  event: Event;
  colors: ReturnType<typeof useThemeColors>;
  onPress?: () => void;
}

function EventCard({ event, colors: c, onPress }: EventCardProps) {
  const isLive = event.status === 'live';

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.75 : 1}
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: c.bgSurface,
          borderColor: isLive ? palette.success : c.borderSubtle,
          borderWidth: isLive ? 1.5 : 1,
        },
      ]}
    >
      {/* Cover image or placeholder */}
      {event.cover_url ? (
        <Image
          source={{ uri: event.cover_url }}
          style={styles.cover}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            styles.coverPlaceholder,
            { backgroundColor: `${palette.brand}18` },
          ]}
        >
          <IconCalendarEvent size={32} color={palette.brand} />
        </View>
      )}

      <View style={styles.cardBody}>
        {/* Status + name */}
        <View style={styles.nameRow}>
          {isLive && (
            <View
              style={[
                styles.liveBadge,
                { backgroundColor: `${palette.success}20` },
              ]}
            >
              <Text style={[styles.liveBadgeText, { color: palette.success }]}>
                LIVE
              </Text>
            </View>
          )}
          <Text
            style={[styles.name, { color: c.textPrimary }]}
            numberOfLines={1}
          >
            {event.name}
          </Text>
        </View>

        {/* Description */}
        {event.description ? (
          <Text
            style={[styles.description, { color: c.textSecondary }]}
            numberOfLines={2}
          >
            {event.description}
          </Text>
        ) : null}

        {/* Date / time row */}
        <View style={styles.metaRow}>
          <IconClock size={12} color={c.textTertiary} />
          <Text style={[styles.metaText, { color: c.textTertiary }]}>
            {formatEventDate(event.starts_at)} · {formatEventTime(event.starts_at)}
            {event.ends_at
              ? ` – ${formatEventTime(event.ends_at)}`
              : ''}
          </Text>
        </View>

        {/* Location */}
        {event.lat != null && event.lng != null && (
          <View style={styles.metaRow}>
            <IconMapPin size={12} color={c.textTertiary} />
            <Text style={[styles.metaText, { color: c.textTertiary }]}>
              {event.lat.toFixed(4)}, {event.lng.toFixed(4)}
              {/* TODO(Stage 4): "View on map" button triggers map tab with event pin */}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ colors: c }: { colors: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={styles.emptyInner}>
      <IconCalendarEvent size={40} color={c.textTertiary} />
      <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
        No upcoming events
      </Text>
      <Text style={[styles.emptySubtitle, { color: c.textTertiary }]}>
        Check back soon or visit the venue to learn more.
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    padding: 16,
  },
  emptyInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 260,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    margin: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 13,
    flex: 1,
  },
  demoBanner: {
    margin: 12,
    padding: 10,
    borderRadius: 8,
  },
  demoText: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  // Card
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 2,
  },
  cover: {
    width: '100%',
    height: 140,
  },
  coverPlaceholder: {
    width: '100%',
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: 14,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  liveBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  metaText: {
    fontSize: 12,
  },
});
