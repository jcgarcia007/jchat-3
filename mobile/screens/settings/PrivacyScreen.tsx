/**
 * JChat 3.0 — Privacy & Security Screen (Task 1.13)
 * MASTER_SPEC Section 13
 *
 * Key invariants enforced here:
 *  - Location is PERMANENTLY LOCKED off. No toggle is rendered.
 *  - Geotag defaults to OFF. Manual text only, never GPS.
 *  - No real-time location is ever exposed to other users.
 *  - All non-location settings persist to users.privacy_settings (JSONB).
 *
 * TODO(i18n) — all user-facing strings are English for now.
 * TODO(schema): add users.privacy_settings jsonb default '{}'
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  IconChevronRight,
  IconEye,
  IconEyeOff,
  IconGhost,
  IconLock,
  IconMapPin,
  IconMessage,
  IconPhoto,
  IconShieldLock,
  IconStar,
  IconUserCircle,
  IconUsers,
} from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import type { MainStackParamList } from '../../navigation/AppNavigator';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type VisibilityOption = 'everyone' | 'followers' | 'nobody';
type AccountVisibility = 'public' | 'private';

/**
 * Typed shape for users.privacy_settings (JSONB).
 * Stored as plain JSON in Postgres; parsed/serialized on load/save.
 *
 * TODO(schema): add users.privacy_settings jsonb default '{}'
 */
export interface PrivacySettings {
  // Profile
  accountVisibility: AccountVisibility;
  showCity: boolean;
  showActiveStatus: boolean;
  offlineMode: boolean;

  // Content
  whoSeesMyPosts: VisibilityOption;
  whoSeesMyStories: VisibilityOption;
  whoSeesPlacesTab: VisibilityOption;
  whoSeesGiftsTab: VisibilityOption;
  /** Always off by default; manual text entry only — NEVER GPS. */
  geotagEnabled: boolean;
  /** Visible profile tabs */
  tabPosts: boolean;
  tabStories: boolean;
  tabPlaces: boolean;
  tabGifts: boolean;
  tabSaved: boolean;

  // Messages & chat
  whoCanDMMe: VisibilityOption;
  showReadReceipts: boolean;
  whoCanMentionMe: VisibilityOption;
}

const DEFAULT_SETTINGS: PrivacySettings = {
  // Profile
  accountVisibility: 'public',
  showCity: true,
  showActiveStatus: true,
  offlineMode: false,

  // Content
  whoSeesMyPosts: 'everyone',
  whoSeesMyStories: 'everyone',
  whoSeesPlacesTab: 'everyone',
  whoSeesGiftsTab: 'everyone',
  geotagEnabled: false, // OFF by default per spec
  tabPosts: true,
  tabStories: true,
  tabPlaces: true,
  tabGifts: true,
  tabSaved: true,

  // Messages & chat
  whoCanDMMe: 'everyone',
  showReadReceipts: true,
  whoCanMentionMe: 'everyone',
};

// ─────────────────────────────────────────────────────────────────────────────
// Navigation — extend MainStackParamList with BlockedUsers stub
// ─────────────────────────────────────────────────────────────────────────────

// TODO(BlockedUsersScreen): add 'BlockedUsers: undefined' to MainStackParamList
// once that screen is implemented and registered in AppNavigator.tsx.
type PrivacyNavProp = NativeStackNavigationProp<MainStackParamList>;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Merges a partial update into the current settings and returns the full object. */
function mergeSettings(
  current: PrivacySettings,
  patch: Partial<PrivacySettings>,
): PrivacySettings {
  return { ...current, ...patch };
}

/** Parse raw JSONB value from Supabase into a typed PrivacySettings object. */
function parseSettings(raw: unknown): PrivacySettings {
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS };
  }
  const r = raw as Partial<PrivacySettings>;
  return {
    accountVisibility: r.accountVisibility ?? DEFAULT_SETTINGS.accountVisibility,
    showCity: r.showCity ?? DEFAULT_SETTINGS.showCity,
    showActiveStatus: r.showActiveStatus ?? DEFAULT_SETTINGS.showActiveStatus,
    offlineMode: r.offlineMode ?? DEFAULT_SETTINGS.offlineMode,
    whoSeesMyPosts: r.whoSeesMyPosts ?? DEFAULT_SETTINGS.whoSeesMyPosts,
    whoSeesMyStories: r.whoSeesMyStories ?? DEFAULT_SETTINGS.whoSeesMyStories,
    whoSeesPlacesTab: r.whoSeesPlacesTab ?? DEFAULT_SETTINGS.whoSeesPlacesTab,
    whoSeesGiftsTab: r.whoSeesGiftsTab ?? DEFAULT_SETTINGS.whoSeesGiftsTab,
    geotagEnabled: r.geotagEnabled ?? DEFAULT_SETTINGS.geotagEnabled,
    tabPosts: r.tabPosts ?? DEFAULT_SETTINGS.tabPosts,
    tabStories: r.tabStories ?? DEFAULT_SETTINGS.tabStories,
    tabPlaces: r.tabPlaces ?? DEFAULT_SETTINGS.tabPlaces,
    tabGifts: r.tabGifts ?? DEFAULT_SETTINGS.tabGifts,
    tabSaved: r.tabSaved ?? DEFAULT_SETTINGS.tabSaved,
    whoCanDMMe: r.whoCanDMMe ?? DEFAULT_SETTINGS.whoCanDMMe,
    showReadReceipts: r.showReadReceipts ?? DEFAULT_SETTINGS.showReadReceipts,
    whoCanMentionMe: r.whoCanMentionMe ?? DEFAULT_SETTINGS.whoCanMentionMe,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  textColor: string;
}
function SectionHeader({ title, textColor }: SectionHeaderProps) {
  return (
    <Text style={[styles.sectionHeader, { color: textColor }]}>
      {title.toUpperCase()}
    </Text>
  );
}

interface RowBaseProps {
  bgColor: string;
  borderColor: string;
  isFirst?: boolean;
  isLast?: boolean;
}

function rowBorderRadius(isFirst?: boolean, isLast?: boolean) {
  return {
    borderTopLeftRadius: isFirst ? 12 : 0,
    borderTopRightRadius: isFirst ? 12 : 0,
    borderBottomLeftRadius: isLast ? 12 : 0,
    borderBottomRightRadius: isLast ? 12 : 0,
  };
}

/** A row that renders a label on the left and a Switch on the right. */
interface ToggleRowProps extends RowBaseProps {
  icon?: React.ReactNode;
  label: string;
  subLabel?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  labelColor: string;
  subLabelColor: string;
}
function ToggleRow({
  icon,
  label,
  subLabel,
  value,
  onValueChange,
  bgColor,
  borderColor,
  isFirst,
  isLast,
  labelColor,
  subLabelColor,
}: ToggleRowProps) {
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: bgColor, borderColor },
        rowBorderRadius(isFirst, isLast),
        !isLast && styles.rowBorderBottom,
      ]}
    >
      {icon != null && <View style={styles.rowIcon}>{icon}</View>}
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, { color: labelColor }]}>{label}</Text>
        {subLabel != null && (
          <Text style={[styles.rowSubLabel, { color: subLabelColor }]}>
            {subLabel}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: palette.textTertiary, true: palette.brand }}
        thumbColor={Platform.OS === 'android' ? palette.bgSurfaceLight : undefined}
        ios_backgroundColor={palette.textTertiary}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value }}
      />
    </View>
  );
}

/** A row that renders a label on the left and cycles through options on tap. */
interface SelectRowProps extends RowBaseProps {
  icon?: React.ReactNode;
  label: string;
  options: readonly string[];
  value: string;
  onSelect: (v: string) => void;
  labelColor: string;
  valueColor: string;
}
function SelectRow({
  icon,
  label,
  options,
  value,
  onSelect,
  bgColor,
  borderColor,
  isFirst,
  isLast,
  labelColor,
  valueColor,
}: SelectRowProps) {
  function cycleOption() {
    const idx = options.indexOf(value);
    const next = options[(idx + 1) % options.length];
    if (next !== undefined) {
      onSelect(next);
    }
  }

  const displayValue =
    value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');

  return (
    <TouchableOpacity
      onPress={cycleOption}
      activeOpacity={0.7}
      style={[
        styles.row,
        { backgroundColor: bgColor, borderColor },
        rowBorderRadius(isFirst, isLast),
        !isLast && styles.rowBorderBottom,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label}, current value: ${displayValue}. Tap to change.`}
    >
      {icon != null && <View style={styles.rowIcon}>{icon}</View>}
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, { color: labelColor }]}>{label}</Text>
      </View>
      <Text style={[styles.rowValue, { color: valueColor }]}>{displayValue}</Text>
      <IconChevronRight size={16} color={valueColor} strokeWidth={2} style={styles.rowChevron} />
    </TouchableOpacity>
  );
}

/** An informational / navigation-only row (no switch, no select). */
interface InfoRowProps extends RowBaseProps {
  icon?: React.ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
  labelColor: string;
  valueColor: string;
  /** When true the row is not interactive — rendered as View, not TouchableOpacity. */
  locked?: boolean;
  rightBadge?: React.ReactNode;
}
function InfoRow({
  icon,
  label,
  value,
  onPress,
  bgColor,
  borderColor,
  isFirst,
  isLast,
  labelColor,
  valueColor,
  locked = false,
  rightBadge,
}: InfoRowProps) {
  const inner = (
    <>
      {icon != null && <View style={styles.rowIcon}>{icon}</View>}
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, { color: labelColor }]}>{label}</Text>
      </View>
      {value != null && (
        <Text style={[styles.rowValue, { color: valueColor }]}>{value}</Text>
      )}
      {rightBadge}
      {!locked && onPress != null && (
        <IconChevronRight size={16} color={valueColor} strokeWidth={2} style={styles.rowChevron} />
      )}
    </>
  );

  const rowStyle = [
    styles.row,
    { backgroundColor: bgColor, borderColor },
    rowBorderRadius(isFirst, isLast),
    !isLast && styles.rowBorderBottom,
  ];

  if (locked || onPress == null) {
    return <View style={rowStyle}>{inner}</View>;
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={rowStyle}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {inner}
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function PrivacyScreen() {
  const c = useThemeColors();
  const { user } = useAuth();
  const navigation = useNavigation<PrivacyNavProp>();

  const [settings, setSettings] = useState<PrivacySettings>({ ...DEFAULT_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Track the blocked users count loaded from DB.
  const [blockedCount, setBlockedCount] = useState(0);

  // Debounce timer for auto-save.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load settings on mount ─────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!isSupabaseConfigured || user == null) {
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('users')
          .select('privacy_settings') // TODO(schema): add users.privacy_settings jsonb default '{}'
          .eq('id', user.id)
          .single();

        if (error) {
          // Column might not exist yet — fall back to defaults silently.
          console.warn('[PrivacyScreen] Could not load privacy_settings:', error.message);
        } else if (mounted && data != null) {
          // data is typed as any here since the column is not in the generated types yet.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setSettings(parseSettings((data as any).privacy_settings));
        }

        // Load blocked count — TODO(schema): requires blocks table
        const { count } = await supabase
          .from('blocks' as 'follows') // cast: blocks table not yet in schema
          .select('id', { count: 'exact', head: true })
          .eq('blocker_id' as 'follower_id', user.id);
        if (mounted) setBlockedCount(count ?? 0);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [user]);

  // ── Persist settings (debounced, 800 ms after last change) ─────────────────
  const persistSettings = useCallback(
    async (next: PrivacySettings) => {
      if (!isSupabaseConfigured || user == null) return;
      setSaving(true);
      try {
        const { error } = await supabase
          .from('users')
          .update({
            // TODO(schema): add users.privacy_settings jsonb default '{}'
            privacy_settings: next as unknown as Record<string, unknown>,
          } as unknown as { privacy_settings: Record<string, unknown> })
          .eq('id', user.id);
        if (error) {
          console.warn('[PrivacyScreen] Could not save privacy_settings:', error.message);
          Alert.alert('Save failed', 'Your settings could not be saved. Please try again.');
        }
      } finally {
        setSaving(false);
      }
    },
    [user],
  );

  function updateSettings(patch: Partial<PrivacySettings>) {
    setSettings((prev) => {
      const next = mergeSettings(prev, patch);
      // Debounce the Supabase write.
      if (saveTimer.current != null) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void persistSettings(next);
      }, 800);
      return next;
    });
  }

  // Cleanup timer on unmount.
  useEffect(() => {
    return () => {
      if (saveTimer.current != null) clearTimeout(saveTimer.current);
    };
  }, []);

  // ── Navigate to BlockedUsers ───────────────────────────────────────────────
  function handleManageBlocked() {
    // TODO(BlockedUsersScreen): implement and register BlockedUsers in MainStackParamList.
    // navigation.navigate('BlockedUsers');
    Alert.alert('Coming soon', 'Blocked Users management will be available in a future update.');
  }

  // ── Shared row colors ──────────────────────────────────────────────────────
  const rowBg = c.bgSurface;
  const rowBorder = c.borderSubtle;
  const labelColor = c.textPrimary;
  const subLabelColor = c.textSecondary;
  const valueColor = c.textSecondary;
  const iconColor = c.textSecondary;

  const VISIBILITY_OPTIONS: readonly VisibilityOption[] = ['everyone', 'followers', 'nobody'];
  const ACCOUNT_VIS_OPTIONS: readonly AccountVisibility[] = ['public', 'private'];

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.bgBase }]}>
        <ActivityIndicator color={palette.brand} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: c.bgBase }}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ── LOCATION WARNING BANNER (always pinned at top) ─────────────────── */}
      {/* PRIVACY: location is permanently locked — never render a toggle here */}
      <View
        style={[
          styles.locationBanner,
          {
            backgroundColor: `${palette.danger}18`, // danger at ~10% opacity
            borderColor: `${palette.danger}55`,
          },
        ]}
        accessibilityRole="text"
        accessibilityLabel="Location privacy notice"
      >
        <IconShieldLock size={20} color={palette.danger} strokeWidth={2} />
        <Text style={[styles.locationBannerText, { color: palette.danger }]}>
          {/* TODO(i18n) */}
          Your real-time location is never shared — this cannot be changed.
        </Text>
      </View>

      {saving && (
        <View style={styles.savingRow}>
          <ActivityIndicator size="small" color={palette.brand} />
          {/* TODO(i18n) */}
          <Text style={[styles.savingText, { color: c.textTertiary }]}>Saving…</Text>
        </View>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — Profile
         ══════════════════════════════════════════════════════════════════════ */}
      <SectionHeader title="Profile" textColor={c.textTertiary} />
      <View style={styles.card}>
        {/* Account visibility: Public / Private */}
        <SelectRow
          icon={<IconUserCircle size={20} color={iconColor} strokeWidth={1.5} />}
          label="Account visibility" // TODO(i18n)
          options={ACCOUNT_VIS_OPTIONS}
          value={settings.accountVisibility}
          onSelect={(v) =>
            updateSettings({ accountVisibility: v as AccountVisibility })
          }
          bgColor={rowBg}
          borderColor={rowBorder}
          isFirst
          labelColor={labelColor}
          valueColor={valueColor}
        />

        {/* City of residence: Show / Hide (manual text — never GPS) */}
        <ToggleRow
          icon={<IconMapPin size={20} color={iconColor} strokeWidth={1.5} />}
          label="City of residence" // TODO(i18n)
          subLabel="Manual text only — never your GPS location" // TODO(i18n)
          value={settings.showCity}
          onValueChange={(v) => updateSettings({ showCity: v })}
          bgColor={rowBg}
          borderColor={rowBorder}
          labelColor={labelColor}
          subLabelColor={subLabelColor}
        />

        {/* Active status: Show / Hide */}
        <ToggleRow
          icon={<IconEye size={20} color={iconColor} strokeWidth={1.5} />}
          label="Active status" // TODO(i18n)
          subLabel="Show when you were last active" // TODO(i18n)
          value={settings.showActiveStatus}
          onValueChange={(v) => updateSettings({ showActiveStatus: v })}
          bgColor={rowBg}
          borderColor={rowBorder}
          labelColor={labelColor}
          subLabelColor={subLabelColor}
        />

        {/* Offline mode toggle */}
        <ToggleRow
          icon={<IconGhost size={20} color={iconColor} strokeWidth={1.5} />}
          label="Offline mode" // TODO(i18n)
          subLabel="Appear offline while you're active" // TODO(i18n)
          value={settings.offlineMode}
          onValueChange={(v) => updateSettings({ offlineMode: v })}
          bgColor={rowBg}
          borderColor={rowBorder}
          isLast
          labelColor={labelColor}
          subLabelColor={subLabelColor}
        />
      </View>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — Content
         ══════════════════════════════════════════════════════════════════════ */}
      <SectionHeader title="Content" textColor={c.textTertiary} />
      <View style={styles.card}>
        {/* Who sees my posts */}
        <SelectRow
          icon={<IconPhoto size={20} color={iconColor} strokeWidth={1.5} />}
          label="Who sees my posts" // TODO(i18n)
          options={VISIBILITY_OPTIONS}
          value={settings.whoSeesMyPosts}
          onSelect={(v) => updateSettings({ whoSeesMyPosts: v as VisibilityOption })}
          bgColor={rowBg}
          borderColor={rowBorder}
          isFirst
          labelColor={labelColor}
          valueColor={valueColor}
        />

        {/* Who sees my stories */}
        <SelectRow
          icon={<IconEye size={20} color={iconColor} strokeWidth={1.5} />}
          label="Who sees my stories" // TODO(i18n)
          options={VISIBILITY_OPTIONS}
          value={settings.whoSeesMyStories}
          onSelect={(v) => updateSettings({ whoSeesMyStories: v as VisibilityOption })}
          bgColor={rowBg}
          borderColor={rowBorder}
          labelColor={labelColor}
          valueColor={valueColor}
        />

        {/* Places visited tab (NO timestamps ever) */}
        <SelectRow
          icon={<IconMapPin size={20} color={iconColor} strokeWidth={1.5} />}
          label="Places visited tab" // TODO(i18n)
          options={VISIBILITY_OPTIONS}
          value={settings.whoSeesPlacesTab}
          onSelect={(v) => updateSettings({ whoSeesPlacesTab: v as VisibilityOption })}
          bgColor={rowBg}
          borderColor={rowBorder}
          labelColor={labelColor}
          valueColor={valueColor}
        />

        {/* Gifts received tab */}
        <SelectRow
          icon={<IconStar size={20} color={iconColor} strokeWidth={1.5} />}
          label="Gifts received tab" // TODO(i18n)
          options={VISIBILITY_OPTIONS}
          value={settings.whoSeesGiftsTab}
          onSelect={(v) => updateSettings({ whoSeesGiftsTab: v as VisibilityOption })}
          bgColor={rowBg}
          borderColor={rowBorder}
          labelColor={labelColor}
          valueColor={valueColor}
        />

        {/* Geotag on posts & stories — OFF by default, manual text only, NEVER GPS */}
        <ToggleRow
          icon={<IconMapPin size={20} color={iconColor} strokeWidth={1.5} />}
          label="Geotag on posts & stories" // TODO(i18n)
          subLabel="Manual text only — never your GPS coordinates" // TODO(i18n)
          value={settings.geotagEnabled}
          onValueChange={(v) => updateSettings({ geotagEnabled: v })}
          bgColor={rowBg}
          borderColor={rowBorder}
          labelColor={labelColor}
          subLabelColor={subLabelColor}
        />

        {/* Visible profile tabs — Posts */}
        <ToggleRow
          label="Show Posts tab on profile" // TODO(i18n)
          value={settings.tabPosts}
          onValueChange={(v) => updateSettings({ tabPosts: v })}
          bgColor={rowBg}
          borderColor={rowBorder}
          labelColor={labelColor}
          subLabelColor={subLabelColor}
        />

        {/* Visible profile tabs — Stories */}
        <ToggleRow
          label="Show Stories tab on profile" // TODO(i18n)
          value={settings.tabStories}
          onValueChange={(v) => updateSettings({ tabStories: v })}
          bgColor={rowBg}
          borderColor={rowBorder}
          labelColor={labelColor}
          subLabelColor={subLabelColor}
        />

        {/* Visible profile tabs — Places */}
        <ToggleRow
          label="Show Places tab on profile" // TODO(i18n)
          value={settings.tabPlaces}
          onValueChange={(v) => updateSettings({ tabPlaces: v })}
          bgColor={rowBg}
          borderColor={rowBorder}
          labelColor={labelColor}
          subLabelColor={subLabelColor}
        />

        {/* Visible profile tabs — Gifts */}
        <ToggleRow
          label="Show Gifts tab on profile" // TODO(i18n)
          value={settings.tabGifts}
          onValueChange={(v) => updateSettings({ tabGifts: v })}
          bgColor={rowBg}
          borderColor={rowBorder}
          labelColor={labelColor}
          subLabelColor={subLabelColor}
        />

        {/* Visible profile tabs — Saved */}
        <ToggleRow
          label="Show Saved tab on profile" // TODO(i18n)
          value={settings.tabSaved}
          onValueChange={(v) => updateSettings({ tabSaved: v })}
          bgColor={rowBg}
          borderColor={rowBorder}
          isLast
          labelColor={labelColor}
          subLabelColor={subLabelColor}
        />
      </View>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 3 — Messages & Chat
         ══════════════════════════════════════════════════════════════════════ */}
      <SectionHeader title="Messages & Chat" textColor={c.textTertiary} />
      <View style={styles.card}>
        {/* Who can DM me */}
        <SelectRow
          icon={<IconMessage size={20} color={iconColor} strokeWidth={1.5} />}
          label="Who can DM me" // TODO(i18n)
          options={VISIBILITY_OPTIONS}
          value={settings.whoCanDMMe}
          onSelect={(v) => updateSettings({ whoCanDMMe: v as VisibilityOption })}
          bgColor={rowBg}
          borderColor={rowBorder}
          isFirst
          labelColor={labelColor}
          valueColor={valueColor}
        />

        {/* Read receipts */}
        <ToggleRow
          icon={<IconEyeOff size={20} color={iconColor} strokeWidth={1.5} />}
          label="Read receipts" // TODO(i18n)
          subLabel="Let others see when you've read their messages" // TODO(i18n)
          value={settings.showReadReceipts}
          onValueChange={(v) => updateSettings({ showReadReceipts: v })}
          bgColor={rowBg}
          borderColor={rowBorder}
          labelColor={labelColor}
          subLabelColor={subLabelColor}
        />

        {/* Who can mention me */}
        <SelectRow
          icon={<IconUsers size={20} color={iconColor} strokeWidth={1.5} />}
          label="Who can mention me (@)" // TODO(i18n)
          options={VISIBILITY_OPTIONS}
          value={settings.whoCanMentionMe}
          onSelect={(v) => updateSettings({ whoCanMentionMe: v as VisibilityOption })}
          bgColor={rowBg}
          borderColor={rowBorder}
          isLast
          labelColor={labelColor}
          valueColor={valueColor}
        />
      </View>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 4 — Location (LOCKED)
          PRIVACY: location is permanently locked — never render a toggle here
         ══════════════════════════════════════════════════════════════════════ */}
      <SectionHeader title="Location" textColor={c.textTertiary} />
      <View style={styles.card}>
        {/* PRIVACY: location is permanently locked — never render a toggle here */}
        <InfoRow
          icon={
            // Icon in danger (red) as per spec
            <IconShieldLock size={20} color={palette.danger} strokeWidth={1.5} />
          }
          label="Real-time location sharing" // TODO(i18n)
          bgColor={rowBg}
          borderColor={rowBorder}
          isFirst
          isLast
          locked // NO interactive control — permanently locked off
          labelColor={labelColor}
          valueColor={palette.danger}
          rightBadge={
            <View
              style={[
                styles.lockedBadge,
                { backgroundColor: `${palette.danger}18`, borderColor: `${palette.danger}44` },
              ]}
            >
              {/* TODO(i18n) */}
              <IconLock size={11} color={palette.danger} strokeWidth={2.5} />
              <Text style={[styles.lockedBadgeText, { color: palette.danger }]}>
                Always off — Locked
              </Text>
            </View>
          }
        />
      </View>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 5 — Blocked Users
         ══════════════════════════════════════════════════════════════════════ */}
      <SectionHeader title="Blocked Users" textColor={c.textTertiary} />
      <View style={styles.card}>
        <InfoRow
          icon={<IconUsers size={20} color={iconColor} strokeWidth={1.5} />}
          label="Blocked users" // TODO(i18n)
          value={blockedCount > 0 ? String(blockedCount) : 'None'} // TODO(i18n)
          onPress={handleManageBlocked}
          bgColor={rowBg}
          borderColor={rowBorder}
          isFirst
          isLast
          labelColor={labelColor}
          valueColor={valueColor}
          // TODO(BlockedUsersScreen): navigation.navigate('BlockedUsers')
        />
      </View>

      {/* Bottom spacer */}
      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Location warning banner ────────────────────────────────────────────────
  locationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
  },
  locationBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },

  // ── Saving indicator ──────────────────────────────────────────────────────
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    justifyContent: 'flex-end',
  },
  savingText: {
    fontSize: 12,
    fontWeight: '400',
  },

  // ── Section header ─────────────────────────────────────────────────────────
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 4,
  },

  // ── Card container ─────────────────────────────────────────────────────────
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 24,
  },

  // ── Row base ───────────────────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    // Border-bottom-only between rows; top/bottom radii via rowBorderRadius().
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
  rowBorderBottom: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    marginRight: 12,
    opacity: 0.8,
  },
  rowContent: {
    flex: 1,
    paddingRight: 8,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '400',
  },
  rowSubLabel: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 2,
    lineHeight: 16,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '400',
    marginRight: 2,
  },
  rowChevron: {
    marginLeft: 2,
  },

  // ── Locked badge ───────────────────────────────────────────────────────────
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    marginLeft: 4,
  },
  lockedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },

  // ── Bottom spacer ──────────────────────────────────────────────────────────
  bottomSpacer: {
    height: 16,
  },
});
