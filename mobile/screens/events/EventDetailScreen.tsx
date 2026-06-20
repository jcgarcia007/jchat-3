/**
 * JChat 3.0 — Event Detail Screen (Task 2.19)
 *
 * Shows full details for a single event:
 *  - Cover image (if present)
 *  - Name, status badge, date/time range
 *  - Description
 *  - Location (lat/lng text; map pin in Stage 4)
 *  - "Join Chat" button → navigates to the event's linked chat room
 *
 * Can be used as a standalone stack screen pushed from EventsScreen or
 * from the Nearby screen when an event is tapped.
 *
 * TODO(Stage 4): "View on map" navigates to Map tab and highlights the event
 *                pin — wire up once map.native.tsx (Stage 4) is implemented.
 * TODO(i18n): wrap user-facing strings with t() once locales cover this screen.
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  SafeAreaView,
} from 'react-native';
import {
  IconCalendarEvent,
  IconClock,
  IconMapPin,
  IconArrowLeft,
  IconDoor,
} from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import type { Event } from './EventsScreen';

// ── Types ────────────────────────────────────────────────────────────────────

interface EventDetailScreenProps {
  event: Event;
  onBack?: () => void;
  onJoinChat?: (roomId: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatFullDatetime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusColor(
  status: Event['status'],
  c: ReturnType<typeof useThemeColors>
): { bg: string; text: string } {
  switch (status) {
    case 'live':
      return { bg: `${palette.success}20`, text: palette.success };
    case 'closed':
      return { bg: `${palette.danger}20`, text: palette.danger };
    default:
      return { bg: `${palette.brand}18`, text: palette.brand };
  }
}

// ── EventDetailScreen ─────────────────────────────────────────────────────────

export default function EventDetailScreen({
  event,
  onBack,
  onJoinChat,
}: EventDetailScreenProps) {
  const c = useThemeColors();
  const badge = statusColor(event.status, c);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bgBase }]}>
      {/* Back button */}
      {onBack && (
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconArrowLeft size={22} color={c.textPrimary} />
        </TouchableOpacity>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Cover */}
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
            <IconCalendarEvent size={52} color={palette.brand} />
          </View>
        )}

        <View style={styles.body}>
          {/* Status badge */}
          <View
            style={[
              styles.badge,
              { backgroundColor: badge.bg },
            ]}
          >
            <Text style={[styles.badgeText, { color: badge.text }]}>
              {event.status.toUpperCase()}
            </Text>
          </View>

          {/* Name */}
          <Text style={[styles.name, { color: c.textPrimary }]}>
            {event.name}
          </Text>

          {/* Date/time */}
          <View style={styles.metaRow}>
            <IconClock size={14} color={palette.brand} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.metaLabel, { color: c.textTertiary }]}>
                Starts
              </Text>
              <Text style={[styles.metaValue, { color: c.textSecondary }]}>
                {formatFullDatetime(event.starts_at)}
              </Text>
              {event.ends_at && (
                <>
                  <Text
                    style={[
                      styles.metaLabel,
                      { color: c.textTertiary, marginTop: 6 },
                    ]}
                  >
                    Ends
                  </Text>
                  <Text style={[styles.metaValue, { color: c.textSecondary }]}>
                    {formatFullDatetime(event.ends_at)}
                  </Text>
                </>
              )}
            </View>
          </View>

          {/* Location */}
          {event.lat != null && event.lng != null && (
            <View style={styles.metaRow}>
              <IconMapPin size={14} color={palette.brand} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.metaLabel, { color: c.textTertiary }]}>
                  Location
                </Text>
                <Text style={[styles.metaValue, { color: c.textSecondary }]}>
                  {event.lat.toFixed(5)}, {event.lng.toFixed(5)}
                </Text>
                {/* TODO(Stage 4): add "View on map" button here once map.native.tsx is done */}
              </View>
            </View>
          )}

          {/* Description */}
          {event.description ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: c.textTertiary }]}>
                About this event
              </Text>
              <Text
                style={[styles.descriptionText, { color: c.textSecondary }]}
              >
                {event.description}
              </Text>
            </View>
          ) : null}

          {/* Join Chat */}
          {event.room_id && event.status !== 'closed' && onJoinChat && (
            <TouchableOpacity
              onPress={() => onJoinChat(event.room_id!)}
              style={[
                styles.joinButton,
                { backgroundColor: palette.brand },
              ]}
              activeOpacity={0.8}
            >
              <IconDoor size={18} color="#ffffff" />
              <Text style={styles.joinButtonText}>Join Event Chat</Text>
            </TouchableOpacity>
          )}

          {event.status === 'closed' && (
            <View
              style={[
                styles.closedNotice,
                {
                  backgroundColor: `${palette.danger}15`,
                  borderColor: `${palette.danger}30`,
                },
              ]}
            >
              <Text style={[styles.closedText, { color: palette.danger }]}>
                This event has ended. The chat room is no longer available.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    top: 52,
    left: 16,
    zIndex: 10,
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  cover: {
    width: '100%',
    height: 220,
  },
  coverPlaceholder: {
    width: '100%',
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: 20,
    gap: 12,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 6,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    marginTop: 4,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 21,
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  joinButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  closedNotice: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  closedText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
