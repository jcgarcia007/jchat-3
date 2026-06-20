/**
 * JChat 3.0 — BusinessPreviewCard (Task 2.3)
 * Source of truth: JCHAT_3.0_MASTER_SPEC.docx · Section 5.2
 *                  JCHAT_3.0_DESIGN_SYSTEM.docx · Section 11
 *
 * Presentational card displayed when a user taps a business pin on the Map tab.
 * All data is passed via props — no Supabase calls inside this component.
 *
 * Design constraints:
 *   - No hardcoded hex EXCEPT the small CARD_COLORS block below (design-system
 *     accent values that are not global tokens).
 *   - Dark + light mode via useThemeColors().
 *   - Icons: @tabler/icons-react-native only.
 *   - Cover gradient: expo-linear-gradient.
 *
 * // TODO(i18n): replace English strings with translation keys
 */

import React, { useMemo } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  IconMapPin,
  IconNavigation,
  IconShare,
  IconStar,
  IconStarFilled,
} from '@tabler/icons-react-native';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';

// ── Design-System accent hexes not covered by global tokens ──────────────────
// These exact values come from JCHAT_3.0_DESIGN_SYSTEM.docx Section 11 and
// cannot be expressed as tokens — keep them here, not scattered in JSX/styles.
const CARD_COLORS = {
  starGold: '#FFCC00',     // star rating fill (DS §11 "Stars in #FFCC00")
  openGreen: '#34C759',    // open badge green dot + today highlight (DS §11)
} as const;

// ── Hours type ────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface DayHours {
  open: string;   // e.g. "09:00" (24h)
  close: string;  // e.g. "22:00" (24h)
  closed?: boolean;
}

export type HoursMap = Partial<Record<DayKey, DayHours>>;

// ── Room type ─────────────────────────────────────────────────────────────────

export interface RoomChip {
  id: string;
  name: string;
  accentColor?: string; // room theme accent hex — optional
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface BusinessPreviewCardProps {
  business: {
    id: string;
    name: string;
    category: string;
    icon_emoji: string;
    cover_url: string | null;
    hours: HoursMap | null;
    address: string;
    lat: number;
    lng: number;
    rating?: number;       // 0–5
    review_count?: number;
    gallery_urls?: string[];
    rooms?: RoomChip[];
    active_count?: number; // live users right now
    distance?: string;     // pre-formatted string, e.g. "0.3 mi"
  };
  onEnterChat: (businessId: string) => void;
  onViewMenu: (businessId: string) => void;
  onNavigate: (lat: number, lng: number) => void;
  onShare: (businessId: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_ORDER: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Returns whether the business is open right now based on its hours map.
 * Uses the device's local clock and the 24h open/close strings.
 */
export function isOpenNow(hours: HoursMap | null | undefined): boolean {
  if (!hours) return false;
  const now = new Date();
  const dayKey = DAY_ORDER[now.getDay()];
  const todayHours = hours[dayKey];
  if (!todayHours || todayHours.closed) return false;

  const [openH, openM] = todayHours.open.split(':').map(Number);
  const [closeH, closeM] = todayHours.close.split(':').map(Number);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  // Handle overnight hours (e.g. 20:00 – 02:00)
  if (closeMinutes < openMinutes) {
    return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
  }
  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

/** Format "09:00" → "9:00 AM" */
function fmt12h(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Render up to 5 star icons for a rating value. */
function StarRow({ rating, size, c }: { rating: number; size: number; c: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) =>
        n <= Math.round(rating) ? (
          <IconStarFilled key={n} size={size} color={CARD_COLORS.starGold} />
        ) : (
          <IconStar key={n} size={size} color={c.textTertiary} />
        ),
      )}
    </View>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BusinessPreviewCard({
  business,
  onEnterChat,
  onViewMenu,
  onNavigate,
  onShare,
}: BusinessPreviewCardProps) {
  const c = useThemeColors();

  const open = useMemo(() => isOpenNow(business.hours), [business.hours]);

  // Today's day index (0 = Sun … 6 = Sat)
  const todayIndex = new Date().getDay();

  // Ordered hours entries for the hours grid (7 days)
  const hoursEntries = useMemo((): Array<{ label: string; dayKey: DayKey; hours: DayHours | undefined; isToday: boolean }> => {
    return DAY_ORDER.map((dayKey, idx) => ({
      label: DAY_LABELS[idx],
      dayKey,
      hours: business.hours?.[dayKey],
      isToday: idx === todayIndex,
    }));
  }, [business.hours, todayIndex]);

  // Gallery — cap thumbnails at 5 visible + "+N" counter
  const gallery = business.gallery_urls ?? [];
  const MAX_VISIBLE = 5;
  const visiblePhotos = gallery.slice(0, MAX_VISIBLE);
  const extraCount = gallery.length - MAX_VISIBLE;

  // Cover gradient stop color in rgba from the bgBase token
  // We derive it from the current bgBase hex (always 6-char hex in tokens)
  const bgBaseRgba = hexToRgba(c.bgBase, 0.96);

  return (
    <View style={[styles.card, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>

      {/* ── Cover photo + gradient ───────────────────────────────────────────── */}
      <View style={styles.coverWrap}>
        {business.cover_url ? (
          <Image
            source={{ uri: business.cover_url }}
            style={styles.coverImage}
            resizeMode="cover"
            accessibilityLabel={`${business.name} cover photo`}
          />
        ) : (
          <View style={[styles.coverImage, styles.coverFallback, { backgroundColor: c.bgElevated }]} />
        )}

        {/* Gradient overlay — transparent → bgBase 96% — 60px at bottom */}
        <LinearGradient
          colors={['transparent', bgBaseRgba]}
          style={styles.coverGradient}
          pointerEvents="none"
        />

        {/* Open / Closed badge — top-right */}
        <View style={[styles.openBadge, { backgroundColor: c.bgSurface }]}>
          <View style={[styles.openDot, { backgroundColor: open ? CARD_COLORS.openGreen : c.textTertiary }]} />
          <Text style={[styles.openBadgeText, { color: open ? CARD_COLORS.openGreen : c.textSecondary }]}>
            {open ? 'Open' : 'Closed'}{/* TODO(i18n) */}
          </Text>
        </View>

        {/* Business emoji icon — absolute bottom-left, overlaps cover */}
        <View
          style={[
            styles.emojiIcon,
            { backgroundColor: c.bgSurface, borderColor: c.bgBase },
          ]}
        >
          <Text style={styles.emojiText} accessibilityLabel={`${business.name} icon`}>
            {business.icon_emoji}
          </Text>
        </View>
      </View>

      {/* ── Scrollable body ──────────────────────────────────────────────────── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.bodyContent}
        bounces={false}
      >
        {/* ── Name + category + distance ────────────────────────────────────── */}
        <View style={styles.nameSection}>
          <Text style={[styles.businessName, { color: c.textPrimary }]} numberOfLines={1}>
            {business.name}
          </Text>
          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: c.textSecondary }]}>
              {business.category}
            </Text>
            {business.distance != null && (
              <>
                <Text style={[styles.metaDot, { color: c.textTertiary }]}>·</Text>
                <Text style={[styles.metaText, { color: c.textSecondary }]}>
                  {business.distance}
                </Text>
              </>
            )}
          </View>

          {/* Rating row */}
          {business.rating != null && (
            <View style={styles.ratingRow}>
              <StarRow rating={business.rating} size={13} c={c} />
              <Text style={[styles.ratingValue, { color: c.textPrimary }]}>
                {business.rating.toFixed(1)}
              </Text>
              {business.review_count != null && (
                <Text style={[styles.ratingCount, { color: c.textSecondary }]}>
                  ({business.review_count})
                </Text>
              )}
            </View>
          )}
        </View>

        {/* ── Divider ───────────────────────────────────────────────────────── */}
        <View style={[styles.divider, { backgroundColor: c.borderSubtle }]} />

        {/* ── Address row ───────────────────────────────────────────────────── */}
        <View style={styles.addressRow}>
          <IconMapPin size={13} color={palette.brand} style={styles.addressIcon} />
          <Text style={[styles.addressText, { color: c.textSecondary }]} numberOfLines={2}>
            {business.address}
          </Text>
        </View>

        {/* ── Hours section ─────────────────────────────────────────────────── */}
        {business.hours && (
          <View style={styles.hoursSection}>
            {/* 7-day working-day circle row */}
            <View style={styles.workingDaysRow}>
              {DAY_ORDER.map((dayKey, idx) => {
                const entry = hoursEntries[idx];
                const isToday = idx === todayIndex;
                const isClosed = !entry.hours || entry.hours.closed;
                return (
                  <View
                    key={dayKey}
                    style={[
                      styles.dayCircle,
                      {
                        backgroundColor: isToday
                          ? CARD_COLORS.openGreen
                          : c.bgElevated,
                        opacity: isClosed && !isToday ? 0.4 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayCircleLabel,
                        { color: isToday ? '#ffffff' : c.textSecondary },
                      ]}
                    >
                      {DAY_LABELS[idx].charAt(0)}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Hours grid — 2 columns */}
            <View style={styles.hoursGrid}>
              {hoursEntries.map(({ label, dayKey, hours: dayH, isToday }) => (
                <View key={dayKey} style={styles.hoursGridItem}>
                  <Text
                    style={[
                      styles.hoursGridDay,
                      {
                        color: isToday ? CARD_COLORS.openGreen : c.textSecondary,
                        fontWeight: isToday ? '700' : '400',
                      },
                    ]}
                  >
                    {label}
                  </Text>
                  <Text
                    style={[
                      styles.hoursGridTime,
                      {
                        color: isToday ? CARD_COLORS.openGreen : c.textTertiary,
                        fontWeight: isToday ? '600' : '400',
                      },
                    ]}
                  >
                    {!dayH || dayH.closed
                      ? 'Closed'
                      : `${fmt12h(dayH.open)} – ${fmt12h(dayH.close)}`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Photo gallery ─────────────────────────────────────────────────── */}
        {gallery.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.galleryScroll}
          >
            {visiblePhotos.map((uri, idx) => (
              <Image
                key={uri + idx}
                source={{ uri }}
                style={[styles.galleryThumb, { backgroundColor: c.bgElevated }]}
                resizeMode="cover"
                accessibilityLabel={`Photo ${idx + 1}`}
              />
            ))}
            {extraCount > 0 && (
              <View style={[styles.galleryThumb, styles.galleryCounter, { backgroundColor: c.bgElevated }]}>
                <Text style={[styles.galleryCounterText, { color: c.textPrimary }]}>
                  +{extraCount}
                </Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* ── Live strip ────────────────────────────────────────────────────── */}
        {((business.active_count ?? 0) > 0 || (business.rooms?.length ?? 0) > 0) && (
          <View style={[styles.liveStrip, { borderTopColor: c.borderSubtle }]}>
            <View style={styles.liveLeft}>
              {/* Green live dot */}
              <View style={[styles.liveDot, { backgroundColor: CARD_COLORS.openGreen }]} />
              <Text style={[styles.liveCount, { color: c.textSecondary }]}>
                {business.active_count ?? 0} active{/* TODO(i18n) */}
              </Text>
            </View>

            {/* Room chips */}
            {business.rooms && business.rooms.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.roomChipsRow}
              >
                {business.rooms.map((room) => (
                  <View
                    key={room.id}
                    style={[
                      styles.roomChip,
                      {
                        backgroundColor: room.accentColor
                          ? room.accentColor + '22' // ~13% opacity tint
                          : c.bgElevated,
                        borderColor: room.accentColor ?? c.borderSubtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.roomChipText,
                        { color: room.accentColor ?? c.textSecondary },
                      ]}
                    >
                      {room.name}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* ── Action buttons ────────────────────────────────────────────────── */}
        <View style={styles.actionRow}>
          {/* Enter Chat — primary */}
          <TouchableOpacity
            style={[styles.btnPrimary, { backgroundColor: c.brand }]}
            onPress={() => onEnterChat(business.id)}
            accessibilityRole="button"
            accessibilityLabel="Enter chat"
          >
            <Text style={[styles.btnPrimaryLabel, { color: '#ffffff' }]}>
              Enter Chat{/* TODO(i18n) */}
            </Text>
          </TouchableOpacity>

          {/* View Menu — secondary */}
          <TouchableOpacity
            style={[styles.btnSecondary, { borderColor: c.borderSubtle, backgroundColor: c.bgElevated }]}
            onPress={() => onViewMenu(business.id)}
            accessibilityRole="button"
            accessibilityLabel="View menu"
          >
            <Text style={[styles.btnSecondaryLabel, { color: c.textPrimary }]}>
              View Menu{/* TODO(i18n) */}
            </Text>
          </TouchableOpacity>

          {/* Navigation icon button */}
          <Pressable
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: c.bgElevated, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={() => onNavigate(business.lat, business.lng)}
            accessibilityRole="button"
            accessibilityLabel="Navigate to business"
          >
            <IconNavigation size={18} color={c.brand} />
          </Pressable>

          {/* Share icon button */}
          <Pressable
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: c.bgElevated, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={() => onShare(business.id)}
            accessibilityRole="button"
            accessibilityLabel="Share this business"
          >
            <IconShare size={18} color={c.textSecondary} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

/** Convert a 6- or 7-char hex string to an rgba() string. */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Styles ────────────────────────────────────────────────────────────────────
// Numbers and tokens only — zero hardcoded hex EXCEPT through c.* theme tokens.

const styles = StyleSheet.create({
  // Card shell
  card: {
    borderRadius: 24,
    borderWidth: 0.5,
    overflow: 'hidden',
    // Shadow rendered by the parent (bottom sheet / map overlay)
  },

  // Cover
  coverWrap: {
    height: 120,
    width: '100%',
    overflow: 'visible', // allow emoji icon to overflow
  },
  coverImage: {
    width: '100%',
    height: 120,
  },
  coverFallback: {
    // backgroundColor applied inline
  },
  coverGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },

  // Open / Closed badge
  openBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  openDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  openBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // Business emoji icon
  emojiIcon: {
    position: 'absolute',
    bottom: -20,
    left: 14,
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 3,
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: {
    fontSize: 26,
    lineHeight: 34,
  },

  // Scrollable body
  bodyContent: {
    paddingBottom: 16,
  },

  // Name section — marginTop: 28 from spec (below cover / emoji icon overlap)
  nameSection: {
    marginTop: 28,
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 4,
  },
  businessName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 11,
  },
  metaDot: {
    fontSize: 11,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  ratingValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  ratingCount: {
    fontSize: 11,
  },

  // Divider
  divider: {
    height: 0.5,
    marginHorizontal: 14,
  },

  // Address
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addressIcon: {
    marginTop: 1,
  },
  addressText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },

  // Hours
  hoursSection: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 10,
  },

  // 7-day circle row
  workingDaysRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  dayCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleLabel: {
    fontSize: 9,
    fontWeight: '600',
  },

  // Hours 2-column grid
  hoursGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  hoursGridItem: {
    width: '50%',
    paddingRight: 8,
    paddingVertical: 2,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  hoursGridDay: {
    fontSize: 11,
    width: 30,
  },
  hoursGridTime: {
    fontSize: 10,
    flex: 1,
  },

  // Gallery
  galleryScroll: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 6,
  },
  galleryThumb: {
    width: 58,
    height: 58,
    borderRadius: 10,
  },
  galleryCounter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryCounterText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Live strip
  liveStrip: {
    borderTopWidth: 0.5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  liveLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  liveCount: {
    fontSize: 11,
    fontWeight: '500',
  },
  roomChipsRow: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  roomChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 0.5,
  },
  roomChipText: {
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 0.1,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  btnPrimary: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  btnSecondary: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
