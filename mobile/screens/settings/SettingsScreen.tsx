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
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from '../../navigation/SettingsStack';
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
import {
  supabase,
  isSupabaseConfigured,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from '../../services/supabase';
import { changeAppLanguage, type SupportedLanguage } from '../../i18n';

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
  const { t } = useTranslation('settings');
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList, 'SettingsHome'>>();
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
      t('alerts.signOutTitle'),
      t('alerts.signOutMessage'),
      [
        { text: t('actions.cancel', { ns: 'common' }), style: 'cancel' },
        {
          text: t('alerts.signOutConfirm'),
          style: 'destructive',
          onPress: () => {
            signOut().catch(() => {
              Alert.alert(t('alerts.signOutErrorTitle'), t('alerts.signOutError'));
            });
          },
        },
      ],
    );
  }, [signOut, t]);

  // ── Delete account (M6 — hard delete via Edge Function) ────────────────────
  // Calls the `delete-account` Edge Function, which verifies the caller's JWT
  // server-side and hard-deletes auth.users (cascades all personal data).
  const performDeleteAccount = useCallback(async () => {
    if (!isSupabaseConfigured) {
      Alert.alert(t('alerts.deleteErrorTitle'), t('alerts.deleteErrorMessage'));
      return;
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        Alert.alert(t('alerts.deleteErrorTitle'), t('alerts.deleteErrorMessage'));
        return;
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        Alert.alert(t('alerts.deleteErrorTitle'), t('alerts.deleteErrorMessage'));
        return;
      }

      // Success — confirm, then sign out (AuthContext routes to Welcome/Login).
      Alert.alert(t('alerts.deleteSuccessTitle'), t('alerts.deleteSuccessMessage'), [
        {
          text: t('actions.ok', { ns: 'common' }),
          onPress: () => {
            signOut().catch(() => null);
          },
        },
      ]);
    } catch {
      Alert.alert(t('alerts.deleteErrorTitle'), t('alerts.deleteErrorMessage'));
    }
  }, [signOut, t]);

  const handleDeleteAccount = useCallback(() => {
    // Confirmation 1 — explain that deletion is permanent and irreversible.
    Alert.alert(t('alerts.deleteTitle'), t('alerts.deleteMessage'), [
      { text: t('actions.cancel', { ns: 'common' }), style: 'cancel' },
      {
        text: t('alerts.deleteContinue'),
        style: 'destructive',
        onPress: () => {
          // Confirmation 2 — last chance before the irreversible action.
          Alert.alert(t('alerts.deleteFinalTitle'), t('alerts.deleteFinalMessage'), [
            { text: t('actions.cancel', { ns: 'common' }), style: 'cancel' },
            {
              text: t('alerts.deleteConfirm'),
              style: 'destructive',
              onPress: () => {
                void performDeleteAccount();
              },
            },
          ]);
        },
      },
    ]);
  }, [performDeleteAccount, t]);

  // ── Change password ────────────────────────────────────────────────────────
  const handleChangePassword = useCallback(() => {
    // TODO: implement change-password flow
    // Option A: supabase.auth.updateUser({ password: newPassword }) for logged-in users
    // Option B: supabase.auth.resetPasswordForEmail(user.email, { redirectTo: 'jchat://reset' })
    Alert.alert(t('alerts.comingSoonTitle'), t('alerts.changePasswordSoon'));
  }, [t]);

  // ── Privacy navigation ─────────────────────────────────────────────────────
  const handlePrivacy = useCallback(() => {
    navigation.navigate('Privacy');
  }, [navigation]);

  // ── Proximity mode options ─────────────────────────────────────────────────
  const PROXIMITY_OPTIONS: ProximityMode[] = ['all', 'favorites', 'visited', 'off'];
  const PROXIMITY_LABELS: Record<ProximityMode, string> = {
    all: t('main.proxAll'),
    favorites: t('main.proxFavorites'),
    visited: t('main.proxVisited'),
    off: t('main.proxOff'),
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
    dark: t('main.appearanceDark'),
    light: t('main.appearanceLight'),
    system: t('main.appearanceSystem'),
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
        <Text style={[styles.headerTitle, { color: c.textPrimary }]}>{t('main.title')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. ACCOUNT ──────────────────────────────────────────────────── */}
        <SectionHeader label={t('main.sectionAccount')} />

        {/* Email (display only) */}
        <SettingsRow
          icon={<IconUser size={20} color={c.brand} strokeWidth={2} />}
          label={t('main.email')}
          sublabel={user?.email ?? '—'}
        />

        <SectionDivider />

        {/* Change password */}
        <SettingsRow
          icon={<IconLock size={20} color={c.brand} strokeWidth={2} />}
          label={t('main.changePassword')}
          onPress={handleChangePassword}
          right={<ChevronRight />}
        />

        <SectionDivider />

        {/* @username (display only) */}
        <SettingsRow
          icon={<IconUser size={20} color={c.brand} strokeWidth={2} />}
          label={t('main.username')}
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
        <SectionHeader label={t('main.sectionNotifications')} />

        {/* Work notifications toggle */}
        <SettingsRow
          icon={<IconBell size={20} color={c.brand} strokeWidth={2} />}
          label={t('main.work')}
          sublabel={t('main.workSub')}
          right={
            <Switch
              value={settings.notifWork}
              onValueChange={(v) => patch({ notifWork: v })}
              trackColor={{ false: c.borderSubtle, true: c.brand }}
              thumbColor={Platform.OS === 'android' ? c.bgSurface : undefined}
              accessibilityLabel={t('main.workA11y')}
            />
          }
        />

        <SectionDivider />

        {/* Social notifications toggle */}
        <SettingsRow
          icon={<IconBell size={20} color={c.brand} strokeWidth={2} />}
          label={t('main.social')}
          sublabel={t('main.socialSub')}
          right={
            <Switch
              value={settings.notifSocial}
              onValueChange={(v) => patch({ notifSocial: v })}
              trackColor={{ false: c.borderSubtle, true: c.brand }}
              thumbColor={Platform.OS === 'android' ? c.bgSurface : undefined}
              accessibilityLabel={t('main.socialA11y')}
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
              <Text style={[styles.rowLabel, { color: c.textPrimary }]}>{t('main.proximityAlerts')}</Text>
              <Text style={[styles.rowSublabel, { color: c.textTertiary }]}>
                {t('main.proximitySub')}
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
        <SectionHeader label={t('main.sectionLanguage')} />

        <View style={[styles.compoundRow, { backgroundColor: c.bgSurface }]}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <IconLanguage size={20} color={c.brand} strokeWidth={2} />
            </View>
            <View style={styles.rowBody}>
              <Text style={[styles.rowLabel, { color: c.textPrimary }]}>{t('main.language')}</Text>
            </View>
          </View>
          <View style={styles.pickerPad}>
            <SegmentedPicker<Language>
              options={LANGUAGE_OPTIONS}
              value={settings.language}
              onChange={(v) => {
                patch({ language: v });
                changeAppLanguage(v as SupportedLanguage);
              }}
              labelMap={LANGUAGE_LABELS}
            />
          </View>
        </View>

        {/* Spacer */}
        <View style={styles.sectionGap} />

        {/* ── 4. APPEARANCE ────────────────────────────────────────────────── */}
        <SectionHeader label={t('main.sectionAppearance')} />

        <View style={[styles.compoundRow, { backgroundColor: c.bgSurface }]}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <IconMoon size={20} color={c.brand} strokeWidth={2} />
            </View>
            <View style={styles.rowBody}>
              <Text style={[styles.rowLabel, { color: c.textPrimary }]}>{t('main.theme')}</Text>
              {/* TODO(ThemeContext): apply appearance override without restart */}
              <Text style={[styles.rowSublabel, { color: c.textTertiary }]}>
                {t('main.themeSub')}
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
        <SectionHeader label={t('main.sectionPrivacy')} />

        <SettingsRow
          icon={<IconShield size={20} color={c.brand} strokeWidth={2} />}
          label={t('main.privacySettings')}
          onPress={handlePrivacy}
          right={<ChevronRight />}
        />

        {/* Spacer */}
        <View style={styles.sectionGap} />

        {/* ── 6. SIGN OUT ──────────────────────────────────────────────────── */}
        <SettingsRow
          icon={<IconLock size={20} color={c.danger} strokeWidth={2} />}
          label={t('main.signOut')}
          onPress={handleSignOut}
          destructive
        />

        {/* Spacer */}
        <View style={styles.sectionGap} />

        {/* ── 7. DELETE ACCOUNT ────────────────────────────────────────────── */}
        <SettingsRow
          icon={<IconTrash size={20} color={c.danger} strokeWidth={2} />}
          label={t('main.deleteAccount')}
          sublabel={t('main.deleteAccountSub')}
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
