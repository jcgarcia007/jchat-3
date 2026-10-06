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
 * TODO: change-password flow (supabase.auth.updateUser or resetPasswordForEmail)
 * TODO(server): schedule account deletion with 24h delay
 * TODO(schema): ensure users table has columns:
 *   - language        text default 'en'
 *   - settings        jsonb default '{}'
 *   (or a dedicated user_settings table)
 * TODO(nav): register a SettingsStack so the Privacy route can be pushed from here
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
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
  IconEyeOff,
  IconBriefcase,
  IconChevronLeft,
  IconChevronRight,
  IconCreditCard,
  IconFingerprint,
  IconLanguage,
  IconLock,
  IconMoon,
  IconReceipt,
  IconSpeakerphone,
  IconShield,
  IconTrash,
  IconUser,
} from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { applyAppearance, type AppearancePreference } from '../../theme/appearance';
import { useAuth } from '../../context/AuthContext';
import { isSupabaseConfigured } from '../../services/supabase';
import { deleteMyAccount } from '../../services/account';
import {
  canUseBiometrics,
  isBiometricEnabled,
  setBiometricEnabled,
  authenticateBiometric,
} from '../../services/biometric';
import i18n, { changeAppLanguage, type SupportedLanguage } from '../../i18n';
import { posMyBusinesses } from '../../services/pos';
import {
  DEFAULT_FEED_RADIUS_MILES,
  FEED_RADIUS_OPTIONS,
  formatRadius,
  isFeedRadiusMiles,
} from '../../utils/distanceUnits';
import { getUserById } from '../../services/users';
import {
  loadUserSettings,
  updateMyLanguage,
  updateMySettings,
  type UserLanguage,
  type PushPreview,
  type UserSettings,
} from '../../services/userSettings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

function defaultSettings(): UserSettings {
  return {
    notifWork: true,
    notifSocial: true,
    // TODO(geofence): Keep the stored mode while proximity controls are hidden.
    proximityMode: 'all',
    language: i18n.language?.startsWith('es') ? 'es' : 'en',
    appearance: 'system',
    feedRadiusMiles: DEFAULT_FEED_RADIUS_MILES,
    // Match defaults mirror the server (migration 189).
    gamesEnabled: true,
    pushPreviewMatch: 'discreet',
    pushPreviewDm: 'full',
    matchNotifyNewPeople: false,
    matchAgeMin: 18,
    matchAgeMax: 99,
  };
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
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const settingsRef = useRef(settings);
  const [username, setUsername] = useState<string | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  // Biometric app-lock (M2) — device-local opt-in, independent of user settings.
  const [biometricOn, setBiometricOn] = useState(false);
  // The device has biometric hardware AND an enrolled face/fingerprint (otherwise the switch is disabled).
  const [biometricAvailable, setBiometricAvailable] = useState(true);
  // POS Work Mode — show item only when user has at least one pos_access business.
  const [hasPosAccess, setHasPosAccess] = useState(false);

  // ── Load settings from Supabase on mount ──────────────────────────────────
  useEffect(() => {
    if (!user?.id) {
      setLoadingSettings(false);
      return;
    }
    loadUserSettings(user.id)
      .then((remote) => {
        setSettings((prev) => {
          const next = { ...prev, ...remote };
          // loadUserSettings reports a missing radius as undefined: keep the default.
          if (!isFeedRadiusMiles(next.feedRadiusMiles)) next.feedRadiusMiles = DEFAULT_FEED_RADIUS_MILES;
          settingsRef.current = next;
          return next;
        });
      })
      .catch(() => {
        // Fall back to defaults silently
      })
      .finally(() => setLoadingSettings(false));
    void getUserById(user.id)
      .then((row) => setUsername(row?.username ?? null))
      .catch(() => setUsername(null));
  }, [user?.id]);

  // ── Biometric app-lock: read the current opt-in state on mount ─────────────
  useEffect(() => {
    let mounted = true;
    isBiometricEnabled()
      .then((on) => {
        if (mounted) setBiometricOn(on);
      })
      .catch(() => null);
    canUseBiometrics()
      .then((ok) => {
        if (mounted) setBiometricAvailable(ok);
      })
      .catch(() => {
        if (mounted) setBiometricAvailable(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // ── Check POS access on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    posMyBusinesses()
      .then((rows) => setHasPosAccess(rows.length > 0))
      .catch(() => null);
  }, [user?.id]);

  // ── Toggle biometric app-lock ──────────────────────────────────────────────
  const handleToggleBiometric = useCallback(
    async (next: boolean) => {
      if (!next) {
        // Disabling — no verification needed.
        await setBiometricEnabled(false);
        setBiometricOn(false);
        return;
      }
      // Enabling — require hardware + enrollment, then confirm with a live prompt.
      const available = await canUseBiometrics();
      if (!available) {
        Alert.alert(
          t('alerts.biometricUnavailableTitle'),
          t('alerts.biometricUnavailableMessage'),
        );
        return; // leave the toggle OFF
      }
      const ok = await authenticateBiometric(t('lock.prompt', { ns: 'auth' }));
      if (!ok) return; // failed/cancelled — leave the toggle OFF
      await setBiometricEnabled(true);
      setBiometricOn(true);
    },
    [t],
  );

  // ── Patch helper — updates local state + persists delta ───────────────────
  const patch = useCallback(
    async (delta: Partial<UserSettings>) => {
      const previous = settingsRef.current;
      const next = { ...previous, ...delta };
      settingsRef.current = next;
      setSettings(next);

      if (delta.language) {
        void changeAppLanguage(delta.language as SupportedLanguage);
      }
      if (delta.appearance) {
        void applyAppearance(delta.appearance).catch(() => undefined);
      }

      if (!user?.id) return;
      try {
        const { language, ...settingsPatch } = delta;
        if (language) await updateMyLanguage(user.id, language);
        if (Object.keys(settingsPatch).length > 0) await updateMySettings(settingsPatch);
      } catch {
        settingsRef.current = previous;
        setSettings(previous);
        if (delta.language) {
          void changeAppLanguage(previous.language as SupportedLanguage);
        }
        if (delta.appearance) {
          void applyAppearance(previous.appearance).catch(() => undefined);
        }
        Alert.alert(t('state.error', { ns: 'common' }));
      }
    },
    [t, user?.id],
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
      const deleted = await deleteMyAccount();
      if (!deleted) {
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
    navigation.navigate('ChangePassword');
  }, [navigation]);

  // ── Privacy navigation ─────────────────────────────────────────────────────
  const handlePrivacy = useCallback(() => {
    navigation.navigate('Privacy');
  }, [navigation]);

  const openPrivacyPolicy = useCallback(async () => {
    await WebBrowser.openBrowserAsync('https://jchat.cloud/privacy');
  }, []);

  const openTerms = useCallback(async () => {
    await WebBrowser.openBrowserAsync('https://jchat.cloud/terms');
  }, []);

  // TODO(geofence): Restore the proximityMode control when geofencing ships.

  // ── Language options ───────────────────────────────────────────────────────
  const PREVIEW_OPTIONS: PushPreview[] = ['full', 'name', 'discreet'];
  const PREVIEW_LABELS: Record<PushPreview, string> = {
    full: t('main.previewLevel.full'),
    name: t('main.previewLevel.name'),
    discreet: t('main.previewLevel.discreet'),
  };

  const LANGUAGE_OPTIONS: UserLanguage[] = ['en', 'es'];
  const LANGUAGE_LABELS: Record<UserLanguage, string> = {
    en: 'English',
    es: 'Español',
  };

  // ── Appearance options ─────────────────────────────────────────────────────
  const APPEARANCE_OPTIONS: AppearancePreference[] = ['dark', 'light', 'system'];
  const APPEARANCE_LABELS: Record<AppearancePreference, string> = {
    dark: t('main.appearanceDark'),
    light: t('main.appearanceLight'),
    system: t('main.appearanceSystem'),
  };

  // ── Feed radius options (picker values are strings; stored value is miles) ──
  const RADIUS_OPTIONS = FEED_RADIUS_OPTIONS.map(String);
  const RADIUS_LABELS: Record<string, string> = Object.fromEntries(
    FEED_RADIUS_OPTIONS.map((miles) => [String(miles), formatRadius(miles)]),
  );

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
        <Pressable
          testID="settings-back"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('back', { ns: 'common' })}
        >
          <IconChevronLeft size={24} color={c.brand} strokeWidth={2} />
        </Pressable>
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
          sublabel={username ? `@${username}` : '@—'}
        />

        <SectionDivider />

        {/* My orders */}
        <SettingsRow
          icon={<IconReceipt size={20} color={c.brand} strokeWidth={2} />}
          label={t('main.myOrders')}
          sublabel={t('main.myOrdersSub')}
          onPress={() => navigation.navigate('MyOrders')}
          right={<ChevronRight />}
        />

        <SectionDivider />

        {/* Plans / Cuentas */}
        <SettingsRow
          icon={<IconCreditCard size={20} color={c.brand} strokeWidth={2} />}
          label={t('main.plans')}
          sublabel={t('main.plansSub')}
          onPress={() => navigation.navigate('Pricing')}
          right={<ChevronRight />}
        />

        {/* Work Mode — only shown when user has at least one POS-access business */}
        {hasPosAccess && (
          <>
            <SectionDivider />
            <SettingsRow
              icon={<IconBriefcase size={20} color={c.brand} strokeWidth={2} />}
              label={t('workMode.row')}
              sublabel={t('workMode.rowSub')}
              onPress={() => navigation.navigate('WorkMode')}
              right={<ChevronRight />}
            />
          </>
        )}

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

        {/* Lock-screen preview levels: Match and direct messages */}
        {([
          { key: 'pushPreviewMatch', label: 'main.previewMatch', sub: 'main.previewMatchSub' },
          { key: 'pushPreviewDm', label: 'main.previewDm', sub: 'main.previewDmSub' },
        ] as const).map(({ key, label, sub }) => (
          <View key={key} style={[styles.compoundRow, { backgroundColor: c.bgSurface }]}>
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <IconEyeOff size={20} color={c.brand} strokeWidth={2} />
              </View>
              <View style={styles.rowBody}>
                <Text style={[styles.rowLabel, { color: c.textPrimary }]}>{t(label)}</Text>
                <Text style={[styles.rowSublabel, { color: c.textTertiary }]}>{t(sub)}</Text>
              </View>
            </View>
            <View style={styles.pickerPad}>
              <SegmentedPicker<PushPreview>
                options={PREVIEW_OPTIONS}
                value={settings[key]}
                onChange={(v) => void patch({ [key]: v })}
                labelMap={PREVIEW_LABELS}
              />
            </View>
            <Text style={[styles.rowSublabel, { color: c.textSecondary, paddingHorizontal: 16, paddingBottom: 12 }]}>
              {t(`main.previewHint.${settings[key]}`)}
            </Text>
          </View>
        ))}
        <Text style={[styles.rowSublabel, { color: c.textTertiary, paddingHorizontal: 16, paddingTop: 8 }]}>
          {t('main.previewBrandNote')}
        </Text>

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
            <SegmentedPicker<UserLanguage>
              options={LANGUAGE_OPTIONS}
              value={settings.language}
              onChange={(v) => {
                void patch({ language: v });
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
              <Text style={[styles.rowSublabel, { color: c.textTertiary }]}>
                {t('main.themeSub')}
              </Text>
            </View>
          </View>
          <View style={styles.pickerPad}>
            <SegmentedPicker<AppearancePreference>
              options={APPEARANCE_OPTIONS}
              value={settings.appearance}
              onChange={(v) => {
                void patch({ appearance: v });
              }}
              labelMap={APPEARANCE_LABELS}
            />
          </View>
        </View>

        {/* Spacer */}
        <View style={styles.sectionGap} />

        {/* ── 4b. NEWS FEED RADIUS ─────────────────────────────────────────── */}
        <SectionHeader label={t('main.sectionFeed')} />

        <View style={[styles.compoundRow, { backgroundColor: c.bgSurface }]}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <IconSpeakerphone size={20} color={c.brand} strokeWidth={2} />
            </View>
            <View style={styles.rowBody}>
              <Text style={[styles.rowLabel, { color: c.textPrimary }]}>{t('main.feedRadius')}</Text>
              <Text style={[styles.rowSublabel, { color: c.textTertiary }]}>
                {t('main.feedRadiusSub')}
              </Text>
            </View>
          </View>
          <View style={styles.pickerPad}>
            <SegmentedPicker<string>
              options={RADIUS_OPTIONS}
              value={String(settings.feedRadiusMiles)}
              onChange={(v) => {
                void patch({ feedRadiusMiles: Number(v) as typeof settings.feedRadiusMiles });
              }}
              labelMap={RADIUS_LABELS}
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

        <SectionDivider />

        <SettingsRow
          icon={<IconLock size={20} color={c.textSecondary} strokeWidth={2} />}
          label={t('main.privacyPolicy')}
          onPress={() => { void openPrivacyPolicy(); }}
          right={<ChevronRight />}
        />

        <SectionDivider />

        <SettingsRow
          icon={<IconLock size={20} color={c.textSecondary} strokeWidth={2} />}
          label={t('main.termsOfService')}
          onPress={() => { void openTerms(); }}
          right={<ChevronRight />}
        />

        <SectionDivider />

        {/* Biometric app-lock (M2) — opt-in Face ID / Touch ID gate */}
        <SettingsRow
          icon={<IconFingerprint size={20} color={c.brand} strokeWidth={2} />}
          label={t('main.biometricLock')}
          sublabel={biometricAvailable || biometricOn ? t('main.biometricLockSub') : t('main.biometricLockUnavailable')}
          right={
            <Switch
              value={biometricOn}
              disabled={!biometricAvailable && !biometricOn}
              onValueChange={(v) => {
                void handleToggleBiometric(v);
              }}
              trackColor={{ false: c.borderSubtle, true: c.brand }}
              thumbColor={Platform.OS === 'android' ? c.bgSurface : undefined}
              accessibilityLabel={t('main.biometricLock')}
            />
          }
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  backButton: { marginRight: 8, padding: 4 },

  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
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
