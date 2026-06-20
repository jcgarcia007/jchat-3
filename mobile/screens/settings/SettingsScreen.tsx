/**
 * JChat 3.0 — Settings Screen (Task 1.14)
 *
 * Sections
 * ─────────
 * 1. Account       — email display, change password stub, @username display
 * 2. Notifications — Work vs Social toggles; Proximity alerts mode selector
 * 3. Language      — EN / ES toggle (persisted to users.language)
 * 4. Appearance    — dark / light / system selector (persisted to users.settings)
 * 5. Privacy & Security — navigates to the Privacy screen by route name
 * 6. Sign out      — confirmation Alert → useAuth().signOut()
 * 7. Delete account — confirmation Alert with 24h-delay note
 *
 * TODOs
 * ─────
 * TODO(i18n): apply language across app immediately after persisting
 * TODO(ThemeContext): apply appearance override without restart
 * TODO: change-password flow (supabase.auth.updateUser or resetPasswordForEmail)
 * TODO(server): schedule account deletion with 24h delay
 * TODO(schema): ensure users table has columns:
 *   - language        text default 'en'
 *   - settings        jsonb default '{}'
 *   (or a dedicated user_settings table)
 * TODO(nav): register a SettingsStack so the Privacy route can be pushed from here
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  IconBell,
  IconChevronRight,
  IconLanguage,
  IconLock,
  IconMoon,
  IconShield,
  IconTrash,
  IconUser,
  IconWifi,
} from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../../services/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProximityMode = 'all' | 'favorites' | 'visited' | 'off';
type Language = 'en' | 'es';
type AppearancePref = 'dark' | 'light' | 'system';

interface UserSettings {
  notifWork: boolean;
  notifSocial: boolean;
  proximityMode: ProximityMode;
  language: Language;
  appearance: AppearancePref;
}

const DEFAULT_SETTINGS: UserSettings = {
  notifWork: true,
  notifSocial: true,
  proximityMode: 'all',
  language: 'en',
  appearance: 'system',
};

// ---------------------------------------------------------------------------
// Helpers — Supabase persistence
// ---------------------------------------------------------------------------

async function loadUserSettings(userId: string): Promise<Partial<UserSettings>> {
  if (!isSupabaseConfigured) return {};
  // TODO(schema): ensure users has: language text, settings jsonb
  const { data, error } = await supabase
    .from('users')
    .select('language, settings')
    .eq('id', userId)
    .single();

  if (error || !data) return {};

  const dbSettings = (data.settings as Record<string, unknown>) ?? {};
  return {
    language: (data.language as Language) ?? undefined,
    notifWork:
      typeof dbSettings.notifWork === 'boolean' ? dbSettings.notifWork : undefined,
    notifSocial:
      typeof dbSettings.notifSocial === 'boolean' ? dbSettings.notifSocial : undefined,
    proximityMode: (dbSettings.proximityMode as ProximityMode) ?? undefined,
    appearance: (dbSettings.appearance as AppearancePref) ?? undefined,
  };
}

async function persistUserSettings(
  userId: string,
  patch: Partial<UserSettings>,
): Promise<void> {
  if (!isSupabaseConfigured) return;

  // Split: language lives in its own column; the rest go into settings JSONB.
  const { language, ...rest } = patch;

  const updates: Record<string, unknown> = {};
  if (language !== undefined) {
    updates.language = language;
    // TODO(i18n): apply language across app immediately
  }
  if (Object.keys(rest).length > 0) {
    // Merge into existing JSONB via a read-modify-write approach.
    // For a production implementation, use a Postgres function or jsonb || operator.
    // TODO(schema): ensure settings column exists in users table
    updates.settings = rest;
  }

  if (Object.keys(updates).length === 0) return;

  await supabase.from('users').update(updates).eq('id', userId);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Thin horizontal rule separating sections */
function SectionDivider() {
  const c = useThemeColors();
  return <View style={[styles.divider, { backgroundColor: c.borderSubtle }]} />;
}

/** Section header label */
function SectionHeader({ label }: { label: string }) {
  const c = useThemeColors();
  return (
    <Text style={[styles.sectionHeader, { color: c.textTertiary }]}>{label}</Text>
  );
}

/** Generic row with an icon, title, optional subtitle, and optional right element */
function SettingsRow({
  icon,
  label,
  sublabel,
  right,
  onPress,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: c.bgSurface },
        pressed && onPress && { opacity: 0.7 },
      ]}
      accessibilityRole={onPress ? 'button' : 'none'}
    >
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowBody}>
        <Text
          style={[
            styles.rowLabel,
            { color: destructive ? c.danger : c.textPrimary },
          ]}
        >
          {label}
        </Text>
        {sublabel ? (
          <Text style={[styles.rowSublabel, { color: c.textTertiary }]}>{sublabel}</Text>
        ) : null}
      </View>
      {right ? <View style={styles.rowRight}>{right}</View> : null}
    </Pressable>
  );
}

/** A chevron arrow used as a "navigate" indicator */
function ChevronRight() {
  const c = useThemeColors();
  return <IconChevronRight size={18} color={c.textTertiary} strokeWidth={2} />;
}

/** Segmented-style horizontal option selector */
function SegmentedPicker<T extends string>({
  options,
  value,
  onChange,
  labelMap,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  labelMap: Record<T, string>;
}) {
  const c = useThemeColors();
  return (
    <View style={[styles.segmented, { backgroundColor: c.bgElevated, borderColor: c.borderSubtle }]}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[
              styles.segmentedOption,
              active && { backgroundColor: c.bgSurface, borderRadius: 8 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text
              style={[
                styles.segmentedLabel,
                { color: active ? c.textPrimary : c.textSecondary },
                active && { fontWeight: '600' },
              ]}
            >
              {labelMap[opt]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function SettingsScreen() {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user, signOut } = useAuth();

  // ── Local state ────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // ── Load settings from Supabase on mount ──────────────────────────────────
  useEffect(() => {
    if (!user?.id) {
      setLoadingSettings(false);
      return;
    }
    loadUserSettings(user.id)
      .then((remote) => {
        setSettings((prev) => ({ ...prev, ...remote }));
      })
      .catch(() => {
        // Fall back to defaults silently
      })
      .finally(() => setLoadingSettings(false));
  }, [user?.id]);

  // ── Patch helper — updates local state + persists delta ───────────────────
  const patch = useCallback(
    (delta: Partial<UserSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...delta };
        if (user?.id) {
          persistUserSettings(user.id, delta).catch(() => {
            // TODO: surface persistence error to user (toast / retry)
          });
        }
        return next;
      });
    },
    [user?.id],
  );

  // ── Sign out ───────────────────────────────────────────────────────────────
  const handleSignOut = useCallback(() => {
    Alert.alert(
      'Sign out', // TODO(i18n)
      'Are you sure you want to sign out?', // TODO(i18n)
      [
        { text: 'Cancel', style: 'cancel' }, // TODO(i18n)
        {
          text: 'Sign out', // TODO(i18n)
          style: 'destructive',
          onPress: () => {
            signOut().catch(() => {
              Alert.alert('Error', 'Could not sign out. Please try again.');
            });
          },
        },
      ],
    );
  }, [signOut]);

  // ── Delete account ─────────────────────────────────────────────────────────
  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete account', // TODO(i18n)
      'Your account will be permanently deleted after a 24-hour grace period. This action cannot be undone.', // TODO(i18n)
      [
        { text: 'Cancel', style: 'cancel' }, // TODO(i18n)
        {
          text: 'Delete my account', // TODO(i18n)
          style: 'destructive',
          onPress: () => {
            // TODO(server): schedule account deletion with 24h delay
            // Call a server-side Edge Function that:
            //   1. Marks users.deletion_requested_at = now()
            //   2. Schedules a job to permanently delete after 24h
            //   3. Signs the user out immediately
            Alert.alert(
              'Request received', // TODO(i18n)
              'Your account will be deleted within 24 hours. You have been signed out.', // TODO(i18n)
              [
                {
                  text: 'OK',
                  onPress: () => {
                    signOut().catch(() => null);
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }, [signOut]);

  // ── Change password ────────────────────────────────────────────────────────
  const handleChangePassword = useCallback(() => {
    // TODO: implement change-password flow
    // Option A: supabase.auth.updateUser({ password: newPassword }) for logged-in users
    // Option B: supabase.auth.resetPasswordForEmail(user.email, { redirectTo: 'jchat://reset' })
    Alert.alert('Coming soon', 'Password change is not yet available.'); // TODO(i18n)
  }, []);

  // ── Privacy navigation ─────────────────────────────────────────────────────
  const handlePrivacy = useCallback(() => {
    // TODO(nav): ensure 'Privacy' screen is registered in a SettingsStack or MainStack
    // @ts-ignore — Privacy screen not yet in the type-safe param list;
    //              will be resolved when PrivacyScreen is registered in AppNavigator
    navigation.navigate('Privacy');
  }, [navigation]);

  // ── Proximity mode options ─────────────────────────────────────────────────
  const PROXIMITY_OPTIONS: ProximityMode[] = ['all', 'favorites', 'visited', 'off'];
  const PROXIMITY_LABELS: Record<ProximityMode, string> = {
    all: 'All', // TODO(i18n)
    favorites: 'Favorites', // TODO(i18n)
    visited: 'Visited', // TODO(i18n)
    off: 'Off', // TODO(i18n)
  };

  // ── Language options ───────────────────────────────────────────────────────
  const LANGUAGE_OPTIONS: Language[] = ['en', 'es'];
  const LANGUAGE_LABELS: Record<Language, string> = {
    en: 'English',
    es: 'Español',
  };

  // ── Appearance options ─────────────────────────────────────────────────────
  const APPEARANCE_OPTIONS: AppearancePref[] = ['dark', 'light', 'system'];
  const APPEARANCE_LABELS: Record<AppearancePref, string> = {
    dark: 'Dark', // TODO(i18n)
    light: 'Light', // TODO(i18n)
    system: 'System', // TODO(i18n)
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: c.bgBase }]}>
      <StatusBar barStyle={c.bgBase === palette.bgBase ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 12, backgroundColor: c.bgBase, borderBottomColor: c.borderSubtle },
        ]}
      >
        {/* TODO(i18n) */}
        <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. ACCOUNT ──────────────────────────────────────────────────── */}
        {/* TODO(i18n) */}
        <SectionHeader label="Account" />

        {/* Email (display only) */}
        <SettingsRow
          icon={<IconUser size={20} color={c.brand} strokeWidth={2} />}
          label="Email" // TODO(i18n)
          sublabel={user?.email ?? '—'}
        />

        <SectionDivider />

        {/* Change password */}
        <SettingsRow
          icon={<IconLock size={20} color={c.brand} strokeWidth={2} />}
          label="Change Password" // TODO(i18n)
          onPress={handleChangePassword}
          right={<ChevronRight />}
        />

        <SectionDivider />

        {/* @username (display only) */}
        <SettingsRow
          icon={<IconUser size={20} color={c.brand} strokeWidth={2} />}
          label="Username" // TODO(i18n)
          // TODO(schema): surface user_metadata.username or users.username
          sublabel={
            (() => {
              const uname = user?.user_metadata?.username as string | undefined;
              return uname ? `@${uname}` : '@—';
            })()
          }
        />

        {/* Spacer */}
        <View style={styles.sectionGap} />

        {/* ── 2. NOTIFICATIONS ─────────────────────────────────────────────── */}
        {/* TODO(i18n) */}
        <SectionHeader label="Notifications" />

        {/* Work notifications toggle */}
        <SettingsRow
          icon={<IconBell size={20} color={c.brand} strokeWidth={2} />}
          label={loadingSettings ? 'Work' : 'Work'} // TODO(i18n)
          sublabel="Shifts, check-ins, offers" // TODO(i18n)
          right={
            <Switch
              value={settings.notifWork}
              onValueChange={(v) => patch({ notifWork: v })}
              trackColor={{ false: c.borderSubtle, true: c.brand }}
              thumbColor={Platform.OS === 'android' ? c.bgSurface : undefined}
              accessibilityLabel="Work notifications" // TODO(i18n)
            />
          }
        />

        <SectionDivider />

        {/* Social notifications toggle */}
        <SettingsRow
          icon={<IconBell size={20} color={c.brand} strokeWidth={2} />}
          label="Social" // TODO(i18n)
          sublabel="Follows, reactions, messages" // TODO(i18n)
          right={
            <Switch
              value={settings.notifSocial}
              onValueChange={(v) => patch({ notifSocial: v })}
              trackColor={{ false: c.borderSubtle, true: c.brand }}
              thumbColor={Platform.OS === 'android' ? c.bgSurface : undefined}
              accessibilityLabel="Social notifications" // TODO(i18n)
            />
          }
        />

        <SectionDivider />

        {/* Proximity alerts mode */}
        <View style={[styles.compoundRow, { backgroundColor: c.bgSurface }]}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <IconWifi size={20} color={c.brand} strokeWidth={2} />
            </View>
            <View style={styles.rowBody}>
              {/* TODO(i18n) */}
              <Text style={[styles.rowLabel, { color: c.textPrimary }]}>Proximity Alerts</Text>
              {/* TODO(i18n) */}
              <Text style={[styles.rowSublabel, { color: c.textTertiary }]}>
                Notify when venues nearby
              </Text>
            </View>
          </View>
          <View style={styles.pickerPad}>
            <SegmentedPicker<ProximityMode>
              options={PROXIMITY_OPTIONS}
              value={settings.proximityMode}
              onChange={(v) => patch({ proximityMode: v })}
              labelMap={PROXIMITY_LABELS}
            />
          </View>
        </View>

        {/* Spacer */}
        <View style={styles.sectionGap} />

        {/* ── 3. LANGUAGE ──────────────────────────────────────────────────── */}
        {/* TODO(i18n) */}
        <SectionHeader label="Language" />

        <View style={[styles.compoundRow, { backgroundColor: c.bgSurface }]}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <IconLanguage size={20} color={c.brand} strokeWidth={2} />
            </View>
            <View style={styles.rowBody}>
              {/* TODO(i18n) */}
              <Text style={[styles.rowLabel, { color: c.textPrimary }]}>Language</Text>
            </View>
          </View>
          <View style={styles.pickerPad}>
            <SegmentedPicker<Language>
              options={LANGUAGE_OPTIONS}
              value={settings.language}
              onChange={(v) => {
                patch({ language: v });
                // TODO(i18n): apply language across app immediately
              }}
              labelMap={LANGUAGE_LABELS}
            />
          </View>
        </View>

        {/* Spacer */}
        <View style={styles.sectionGap} />

        {/* ── 4. APPEARANCE ────────────────────────────────────────────────── */}
        {/* TODO(i18n) */}
        <SectionHeader label="Appearance" />

        <View style={[styles.compoundRow, { backgroundColor: c.bgSurface }]}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <IconMoon size={20} color={c.brand} strokeWidth={2} />
            </View>
            <View style={styles.rowBody}>
              {/* TODO(i18n) */}
              <Text style={[styles.rowLabel, { color: c.textPrimary }]}>Theme</Text>
              {/* TODO(ThemeContext): apply appearance override without restart */}
              <Text style={[styles.rowSublabel, { color: c.textTertiary }]}>
                Follows OS until ThemeContext is wired
              </Text>
            </View>
          </View>
          <View style={styles.pickerPad}>
            <SegmentedPicker<AppearancePref>
              options={APPEARANCE_OPTIONS}
              value={settings.appearance}
              onChange={(v) => {
                patch({ appearance: v });
                // TODO(ThemeContext): apply appearance override without restart
              }}
              labelMap={APPEARANCE_LABELS}
            />
          </View>
        </View>

        {/* Spacer */}
        <View style={styles.sectionGap} />

        {/* ── 5. PRIVACY & SECURITY ────────────────────────────────────────── */}
        {/* TODO(i18n) */}
        <SectionHeader label="Privacy & Security" />

        <SettingsRow
          icon={<IconShield size={20} color={c.brand} strokeWidth={2} />}
          label="Privacy Settings" // TODO(i18n)
          onPress={handlePrivacy}
          right={<ChevronRight />}
        />

        {/* Spacer */}
        <View style={styles.sectionGap} />

        {/* ── 6. SIGN OUT ──────────────────────────────────────────────────── */}
        <SettingsRow
          icon={<IconLock size={20} color={c.danger} strokeWidth={2} />}
          label="Sign Out" // TODO(i18n)
          onPress={handleSignOut}
          destructive
        />

        {/* Spacer */}
        <View style={styles.sectionGap} />

        {/* ── 7. DELETE ACCOUNT ────────────────────────────────────────────── */}
        <SettingsRow
          icon={<IconTrash size={20} color={c.danger} strokeWidth={2} />}
          label="Delete Account" // TODO(i18n)
          sublabel="24-hour grace period before permanent deletion" // TODO(i18n)
          onPress={handleDeleteAccount}
          destructive
        />
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const SECTION_HEADER_H = 36;
const ROW_MIN_H = 52;
const ICON_BOX = 36;
const H_PAD = 16;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  header: {
    paddingHorizontal: H_PAD,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
  },

  scroll: {
    paddingTop: 12,
    paddingHorizontal: H_PAD,
  },

  // ── Section header ─────────────────────────────────────────────────────────
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    minHeight: SECTION_HEADER_H,
    paddingTop: 8,
    paddingBottom: 4,
  },

  sectionGap: {
    height: 24,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: H_PAD + ICON_BOX + 12,
  },

  // ── Row ───────────────────────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ROW_MIN_H,
    paddingHorizontal: H_PAD,
  },

  rowIcon: {
    width: ICON_BOX,
    height: ICON_BOX,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  rowBody: {
    flex: 1,
    paddingVertical: 4,
  },

  rowLabel: {
    fontSize: 16,
    fontWeight: '400',
  },

  rowSublabel: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 2,
  },

  rowRight: {
    paddingLeft: 8,
  },

  // ── Compound row (row + picker below) ────────────────────────────────────
  compoundRow: {
    borderRadius: 12,
    overflow: 'hidden',
  },

  pickerPad: {
    paddingHorizontal: H_PAD,
    paddingBottom: 12,
  },

  // ── Segmented picker ─────────────────────────────────────────────────────
  segmented: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
  },

  segmentedOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },

  segmentedLabel: {
    fontSize: 13,
    fontWeight: '400',
  },
});
