/**
 * JChat 3.0 — BusinessPreviewCard (Task 2.3, redesigned: "Tarjeta B + A")
 * Source of truth: JCHAT_3.0_MASTER_SPEC.docx · Section 5.2
 *                  JCHAT_3.0_DESIGN_SYSTEM.docx · Section 11
 *
 * Presentational card displayed when a user taps a business pin on the Map tab. Top to bottom, in one ScrollView:
 * the cover (status chip, share and close, logo + name + category + distance · city), the main buttons, the
 * description, the gallery, the live strip, the opening hours (folded) and, outside the venue's radius, a notice.
 * All data is passed via props — no Supabase calls inside this component.
 *
 * Design constraints:
 *   - Tokens only (palette / useThemeColors); no hardcoded hex.
 *   - Dark + light mode via useThemeColors().
 *   - Icons: @tabler/icons-react-native only.
 *   - Cover gradient: expo-linear-gradient.
 */

import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import {
  IconCalendarEvent,
  IconChevronDown,
  IconChevronUp,
  IconMapPin,
  IconMessage,
  IconNavigation,
  IconShare,
  IconStarFilled,
  IconTag,
  IconToolsKitchen2,
  IconX,
} from '@tabler/icons-react-native';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { CATEGORY_ICONS, initialsColor } from './pinAppearance';
import { initials, pinCategory } from '../../utils/mapPin';
import { cityFromAddress, formatMeters } from '../../utils/businessCard';
import { usesKilometers } from '../../utils/distanceUnits';
import {
  DAY_ORDER,
  closesAtLabel,
  formatDayRange,
  getOpenStatus,
  opensAtLabel,
  type DayHours,
  type DayKey,
  type HoursMap,
} from '../../utils/hours';

// ── Design-System accents (DS §11), taken from the global tokens ─────────────
const CARD_COLORS = {
  openGreen: palette.success, // open chip, today highlight, live dot
} as const;

const COVER_HEIGHT = 190;
const LOGO_SIZE = 60;
const MIN_TOUCH = 44;
const DESCRIPTION_LINES = 3;

// ── Hours type ────────────────────────────────────────────────────────────────

export type { DayHours, HoursMap } from '../../utils/hours';

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
    /** The icon image the owner uploaded; the logo when there is no logo_url. */
    icon_url?: string | null;
    /** businesses.logo_url: the circular logo on the cover. */
    logo_url?: string | null;
    cover_url: string | null;
    hours: HoursMap | null;
    address: string;
    lat: number;
    lng: number;
    /** businesses.description: shown under the buttons (3 lines + "show more"); nothing when empty. */
    description?: string | null;
    /** businesses.geofence_radius_m (meters). */
    geofence_radius_m?: number | null;
    rating?: number;       // 0–5
    review_count?: number;
    gallery_urls?: string[];
    rooms?: RoomChip[];
    active_count?: number; // live users right now
    distance?: string;     // pre-formatted string, e.g. "0.3 mi"
    distance_m?: number;   // the same distance in meters
    /** The venue has active offers: a red dot on the Offers button. Absent → no dot. */
    has_active_offers?: boolean;
  };
  /**
   * Is the user inside the venue's radius? true / false, or null / undefined when it is not known (no position or no
   * radius): the card then does not warn and the server decides on entry.
   */
  inside_radius?: boolean | null;
  onEnterChat: (businessId: string) => void;
  onViewMenu: (businessId: string) => void;
  onNavigate: (lat: number, lng: number) => void;
  onShare: (businessId: string) => void;
  onOffers: (businessId: string) => void;
  onReserve: (businessId: string) => void;
  /** Closes the sheet: the card owns the only close (X) button. */
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Derives localized short weekday names (Sun/Mon/… or Dom/Lun/… in es) via
 * Intl.DateTimeFormat, keyed to DAY_ORDER's index (0=Sun…6=Sat, matching
 * Date.getDay()). 2023-01-01 is a known Sunday, used only as a reference date
 * to format weekday names — it does not affect the hours-lookup logic, which
 * still indexes purely by DayKey ('sun'|'mon'|…).
 */
function getDayLabels(locale: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  return DAY_ORDER.map((_, idx) => formatter.format(new Date(Date.UTC(2023, 0, 1 + idx))));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BusinessPreviewCard({
  business,
  inside_radius,
  onEnterChat,
  onViewMenu,
  onNavigate,
  onShare,
  onOffers,
  onReserve,
  onClose,
}: BusinessPreviewCardProps) {
  const { t, i18n } = useTranslation('map');
  const c = useThemeColors();

  // ── Status chip ────────────────────────────────────────────────────────────
  const status = useMemo(() => getOpenStatus(business.hours), [business.hours]);
  const open = status === 'open';
  const statusText = useMemo(() => {
    if (status === 'open') {
      const until = closesAtLabel(business.hours, i18n.language);
      return until ? t('businessPreviewCard.openUntil', { time: until }) : t('businessPreviewCard.openBadge');
    }
    if (status === 'closed') {
      const opensAt = opensAtLabel(business.hours, i18n.language);
      return opensAt ? t('businessPreviewCard.closedOpensAt', { time: opensAt }) : t('businessPreviewCard.closedBadge');
    }
    return t('businessPreviewCard.hoursUnavailable');
  }, [status, business.hours, i18n.language, t]);

  // ── Cover, logo, name row ──────────────────────────────────────────────────
  const fill = initialsColor(business.id);
  const logoUrl = business.logo_url || business.icon_url || null;
  const [logoFailed, setLogoFailed] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const showLogo = !!logoUrl && !logoFailed;
  const showCover = !!business.cover_url && !coverFailed;
  const CategoryIcon = CATEGORY_ICONS[pinCategory(business.category)];

  const city = useMemo(() => cityFromAddress(business.address), [business.address]);
  const distanceText =
    business.distance ??
    (business.distance_m != null ? formatMeters(business.distance_m, usesKilometers()) : null);
  const distanceLine = [distanceText, city].filter(Boolean).join(' · ');

  // ── Entry: outside the radius the button is disabled and a notice explains why ──
  const blocked = inside_radius === false;

  // ── Description: 3 lines + "show more" only when it really is longer ──────────
  const description = business.description?.trim() || '';
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionLines, setDescriptionLines] = useState(0);
  const descriptionTruncated = descriptionLines > DESCRIPTION_LINES;

  // ── Hours (folded) ─────────────────────────────────────────────────────────
  const [hoursOpen, setHoursOpen] = useState(false);

  // One day's row in the hours grid: never throws, "Hours unavailable" when the entry can't be read.
  const dayRange = (entry: DayHours | undefined): string => {
    const range = formatDayRange(entry, i18n.language);
    if (range.kind === 'closed') return t('businessPreviewCard.closedBadge');
    return range.kind === 'range' ? range.text : t('businessPreviewCard.hoursUnavailable');
  };

  // Localized short weekday names (Sun/Mon/… → Dom/Lun/… in es), derived via
  // Intl — DAY_ORDER's day-KEY indexing (used for the hours lookup) is untouched.
  const dayLabels = useMemo(() => getDayLabels(i18n.language), [i18n.language]);

  // Today's day index (0 = Sun … 6 = Sat)
  const todayIndex = new Date().getDay();

  // Ordered hours entries for the hours grid (7 days)
  const hoursEntries = useMemo((): Array<{ label: string; dayKey: DayKey; hours: DayHours | undefined; isToday: boolean }> => {
    return DAY_ORDER.map((dayKey, idx) => ({
      label: dayLabels[idx],
      dayKey,
      hours: business.hours?.[dayKey],
      isToday: idx === todayIndex,
    }));
  }, [business.hours, todayIndex, dayLabels]);

  // Gallery — cap thumbnails at 5 visible + "+N" counter
  const gallery = business.gallery_urls ?? [];
  const MAX_VISIBLE = 5;
  const visiblePhotos = gallery.slice(0, MAX_VISIBLE);
  const extraCount = gallery.length - MAX_VISIBLE;

  const closeLabel = t('mapScreen.closeSheetA11y');

  return (
    <View style={[styles.card, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.bodyContent}
        bounces={false}
      >
        {/* ── Cover: photo (or the venue colour), gradient, chip, logo, name, meta ───── */}
        <View style={[styles.cover, { backgroundColor: fill }]}>
          {showCover ? (
            <Image
              source={{ uri: business.cover_url as string }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              onError={() => setCoverFailed(true)}
              accessibilityLabel={t('businessPreviewCard.coverPhotoA11y', { name: business.name })}
            />
          ) : null}
          <LinearGradient
            colors={['transparent', palette.scrim]}
            style={styles.coverGradient}
            pointerEvents="none"
          />

          {/* Status chip — top left */}
          <View
            style={[styles.statusChip, { backgroundColor: open ? CARD_COLORS.openGreen : c.textTertiary }]}
            accessible
            accessibilityLabel={statusText}
          >
            <Text style={styles.statusChipText} numberOfLines={1}>{statusText}</Text>
          </View>

          {/* Logo + name + category + distance · city — bottom left, over the gradient */}
          <View style={styles.coverBottom} pointerEvents="none">
            <View
              accessible
              accessibilityLabel={t('businessPreviewCard.logoA11y', { name: business.name })}
              style={[styles.logo, { backgroundColor: fill }]}
            >
              {showLogo ? (
                <Image
                  source={{ uri: logoUrl as string }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <Text style={styles.logoInitials}>{initials(business.name)}</Text>
              )}
            </View>
            <View style={styles.coverText}>
              <Text style={styles.businessName} numberOfLines={2}>{business.name}</Text>
              <View style={styles.metaRow}>
                <View style={styles.categoryChip}>
                  <CategoryIcon size={13} color={palette.onImage} strokeWidth={2} />
                  <Text style={styles.categoryChipText} numberOfLines={1}>{business.category}</Text>
                </View>
                {business.rating != null ? (
                  <View style={styles.ratingInline} accessible accessibilityLabel={t('businessPreviewCard.ratingA11y', { rating: business.rating.toFixed(1) })}>
                    <IconStarFilled size={12} color={palette.heatMild} />
                    <Text style={styles.metaText}>{business.rating.toFixed(1)}</Text>
                  </View>
                ) : null}
                {distanceLine ? <Text style={styles.metaText} numberOfLines={1}>{distanceLine}</Text> : null}
              </View>
            </View>
          </View>
        </View>

        {/* ── Main buttons: Enter chat (1.3) + Directions, then Menu / Offers / Reserve ──── */}
        <View style={styles.buttons}>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.btnMain, styles.btnEnter, { backgroundColor: blocked ? c.bgElevated : c.brandFill }]}
              onPress={() => onEnterChat(business.id)}
              disabled={blocked}
              accessibilityRole="button"
              accessibilityState={{ disabled: blocked }}
              accessibilityLabel={blocked ? t('businessPreviewCard.enterChatBlockedA11y') : t('businessPreviewCard.enterChatA11y')}
            >
              <IconMessage size={18} color={blocked ? c.textTertiary : palette.onBrand} strokeWidth={2} />
              <Text style={[styles.btnMainLabel, { color: blocked ? c.textTertiary : palette.onBrand }]} numberOfLines={1}>
                {t('businessPreviewCard.enterChatButton')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnMain, styles.btnDirections, { borderColor: c.borderSubtle, backgroundColor: c.bgElevated }]}
              onPress={() => onNavigate(business.lat, business.lng)}
              accessibilityRole="button"
              accessibilityLabel={t('businessPreviewCard.navigateA11y')}
            >
              <IconNavigation size={18} color={c.brandText} strokeWidth={2} />
              <Text style={[styles.btnMainLabel, { color: c.textPrimary }]} numberOfLines={1}>
                {t('businessPreviewCard.directionsButton')}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.btnSecondary, { borderColor: c.borderSubtle, backgroundColor: c.bgElevated }]}
              onPress={() => onViewMenu(business.id)}
              accessibilityRole="button"
              accessibilityLabel={t('businessPreviewCard.menuA11y')}
            >
              <IconToolsKitchen2 size={17} color={c.textSecondary} strokeWidth={2} />
              <Text style={[styles.btnSecondaryLabel, { color: c.textPrimary }]} numberOfLines={1}>
                {t('businessPreviewCard.menuButton')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnSecondary, { borderColor: c.borderSubtle, backgroundColor: c.bgElevated }]}
              onPress={() => onOffers(business.id)}
              accessibilityRole="button"
              accessibilityLabel={business.has_active_offers ? t('businessPreviewCard.offersActiveA11y') : t('businessPreviewCard.offersA11y')}
            >
              <IconTag size={17} color={c.textSecondary} strokeWidth={2} />
              <Text style={[styles.btnSecondaryLabel, { color: c.textPrimary }]} numberOfLines={1}>
                {t('businessPreviewCard.offersButton')}
              </Text>
              {business.has_active_offers ? <View style={[styles.offersDot, { backgroundColor: palette.danger }]} /> : null}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnSecondary, { borderColor: c.borderSubtle, backgroundColor: c.bgElevated }]}
              onPress={() => onReserve(business.id)}
              accessibilityRole="button"
              accessibilityLabel={t('businessPreviewCard.reserveA11y')}
            >
              <IconCalendarEvent size={17} color={c.textSecondary} strokeWidth={2} />
              <Text style={[styles.btnSecondaryLabel, { color: c.textPrimary }]} numberOfLines={1}>
                {t('businessPreviewCard.reserveButton')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Address (kept from the previous card) ────────────────────────────────── */}
        {business.address ? (
          <View style={styles.addressRow}>
            <IconMapPin size={14} color={palette.brand} style={styles.addressIcon} />
            <Text style={[styles.addressText, { color: c.textSecondary }]} numberOfLines={2}>
              {business.address}
            </Text>
          </View>
        ) : null}

        {/* ── Description: 3 lines + show more ─────────────────────────────────────── */}
        {description ? (
          <View style={styles.descriptionBlock}>
            <Text
              style={[styles.descriptionText, { color: c.textPrimary }]}
              numberOfLines={descriptionExpanded ? undefined : DESCRIPTION_LINES}
            >
              {description}
            </Text>
            {/* Invisible copy without a line limit: tells how many lines the text needs on any platform. */}
            <Text
              style={[styles.descriptionText, styles.descriptionMeasure]}
              onTextLayout={(e) => setDescriptionLines(e.nativeEvent.lines.length)}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {description}
            </Text>
            {descriptionTruncated ? (
              <Pressable
                onPress={() => setDescriptionExpanded((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.moreBtn}
                accessibilityRole="button"
                accessibilityLabel={descriptionExpanded ? t('businessPreviewCard.descriptionLess') : t('businessPreviewCard.descriptionMore')}
              >
                <Text style={[styles.moreLabel, { color: c.brandText }]}>
                  {descriptionExpanded ? t('businessPreviewCard.descriptionLess') : t('businessPreviewCard.descriptionMore')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* ── Photo gallery ─────────────────────────────────────────────────────────── */}
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
                accessibilityLabel={t('businessPreviewCard.photoA11y', { count: idx + 1 })}
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

        {/* ── Live strip (unchanged): people in the chat + room chips ─────────────────── */}
        {((business.active_count ?? 0) > 0 || (business.rooms?.length ?? 0) > 0) && (
          <View style={[styles.liveStrip, { borderTopColor: c.borderSubtle }]}>
            {/* Presence is not real yet (activeCount is 0 until it is): never show "0 active". */}
            {(business.active_count ?? 0) > 0 && (
              <View style={styles.liveLeft}>
                <View style={[styles.liveDot, { backgroundColor: CARD_COLORS.openGreen }]} />
                <Text style={[styles.liveCount, { color: c.textSecondary }]}>
                  {t('businessPreviewCard.activeCount', { count: business.active_count ?? 0 })}
                </Text>
              </View>
            )}

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
                          ? hexToRgba(room.accentColor, 0.13) // ~13% opacity tint of the room accent
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

        {/* ── Hours: folded under "See hours"; today highlighted ──────────────────────── */}
        {business.hours ? (
          <View style={styles.hoursSection}>
            <Pressable
              onPress={() => setHoursOpen((v) => !v)}
              style={styles.hoursToggle}
              accessibilityRole="button"
              accessibilityState={{ expanded: hoursOpen }}
              accessibilityLabel={t('businessPreviewCard.hoursToggleA11y')}
            >
              <Text style={[styles.hoursToggleLabel, { color: c.textPrimary }]}>{t('businessPreviewCard.hoursToggle')}</Text>
              {hoursOpen ? (
                <IconChevronUp size={18} color={c.textSecondary} />
              ) : (
                <IconChevronDown size={18} color={c.textSecondary} />
              )}
            </Pressable>

            {hoursOpen ? (
              <View style={styles.hoursBody}>
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
                            backgroundColor: isToday ? CARD_COLORS.openGreen : c.bgElevated,
                            opacity: isClosed && !isToday ? 0.4 : 1,
                          },
                        ]}
                      >
                        <Text style={[styles.dayCircleLabel, { color: isToday ? palette.onBrand : c.textSecondary }]}>
                          {dayLabels[idx].charAt(0)}
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
                          { color: isToday ? CARD_COLORS.openGreen : c.textSecondary, fontWeight: isToday ? '700' : '400' },
                        ]}
                      >
                        {label}
                      </Text>
                      <Text
                        style={[
                          styles.hoursGridTime,
                          { color: isToday ? CARD_COLORS.openGreen : c.textTertiary, fontWeight: isToday ? '600' : '400' },
                        ]}
                      >
                        {dayRange(dayH)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ── Distance notice: only outside the radius ─────────────────────────────────── */}
        {blocked ? (
          <View style={[styles.notice, { backgroundColor: palette.warningTint, borderColor: palette.warningBorder }]} accessible>
            <IconMapPin size={18} color={palette.warning} style={styles.noticeIcon} />
            <Text style={[styles.noticeText, { color: c.textPrimary }]}>
              {distanceText
                ? t('businessPreviewCard.outsideRadiusNotice', { distance: distanceText })
                : t('businessPreviewCard.outsideRadiusNoticeNoDistance')}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* ── Share + close: fixed at the top right, over the cover, 44 pt targets ───────────── */}
      <View style={styles.headerButtons} pointerEvents="box-none">
        <Pressable
          onPress={() => onShare(business.id)}
          style={styles.headerHit}
          accessibilityRole="button"
          accessibilityLabel={t('businessPreviewCard.shareA11y')}
        >
          <View style={styles.headerBtn}>
            <IconShare size={18} color={palette.onImage} strokeWidth={2} />
          </View>
        </Pressable>
        <Pressable
          onPress={onClose}
          style={styles.headerHit}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        >
          <View style={styles.headerBtn}>
            <IconX size={20} color={palette.onImage} strokeWidth={2} />
          </View>
        </Pressable>
      </View>
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
// Numbers and tokens only — zero hardcoded hex EXCEPT through c.* / palette.* theme tokens.

const styles = StyleSheet.create({
  // Card shell
  card: {
    borderRadius: 24,
    borderWidth: 0.5,
    overflow: 'hidden',
    flexShrink: 1, // inside the sheet's maxHeight the card shrinks and its ScrollView scrolls
    // Shadow rendered by the parent (bottom sheet / map overlay)
  },
  bodyContent: {
    paddingBottom: 16,
  },

  // Cover
  cover: {
    height: COVER_HEIGHT,
    width: '100%',
  },
  coverGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 130,
  },
  statusChip: {
    position: 'absolute',
    top: 14,
    left: 14,
    maxWidth: '62%',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusChipText: {
    color: palette.onBrand,
    fontSize: 12,
    fontWeight: '700',
  },
  coverBottom: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    borderWidth: 2,
    borderColor: palette.onImage,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInitials: {
    color: palette.onBrand,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  coverText: {
    flex: 1,
    gap: 6,
  },
  businessName: {
    color: palette.onImage,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: palette.scrimMedium,
    maxWidth: '100%',
  },
  categoryChipText: {
    color: palette.onImage,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  ratingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    color: palette.onImageStrong,
    fontSize: 12,
    fontWeight: '500',
  },

  // Share + close, over the cover
  headerButtons: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerHit: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.scrimMedium,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Buttons
  buttons: {
    paddingHorizontal: 14,
    paddingTop: 14,
    gap: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btnMain: {
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  btnEnter: {
    flex: 1.3,
  },
  btnDirections: {
    flex: 1,
    borderWidth: 0.5,
  },
  btnMainLabel: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  btnSecondary: {
    flex: 1,
    height: MIN_TOUCH,
    borderRadius: 12,
    borderWidth: 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  btnSecondaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  offersDot: {
    position: 'absolute',
    top: 7,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Address
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  addressIcon: {
    marginTop: 1,
  },
  addressText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },

  // Description
  descriptionBlock: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
  },
  descriptionMeasure: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 12,
    opacity: 0,
  },
  moreBtn: {
    alignSelf: 'flex-start',
    minHeight: 28,
    justifyContent: 'center',
    marginTop: 2,
  },
  moreLabel: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Gallery
  galleryScroll: {
    paddingHorizontal: 14,
    paddingTop: 12,
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
    marginTop: 12,
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

  // Hours (folded)
  hoursSection: {
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  hoursToggle: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hoursToggleLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  hoursBody: {
    gap: 10,
    paddingBottom: 6,
  },
  workingDaysRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  hoursGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  hoursGridItem: {
    width: '50%',
    paddingRight: 8,
    paddingVertical: 3,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  hoursGridDay: {
    fontSize: 12,
    width: 34,
  },
  hoursGridTime: {
    fontSize: 11,
    flex: 1,
  },

  // Distance notice
  notice: {
    marginHorizontal: 14,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  noticeIcon: {
    marginTop: 1,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
