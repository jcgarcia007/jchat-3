/**
 * JChat 3.0 — Edit Profile Screen (Task 1.8)
 *
 * Fields: display name, @username (debounced availability check), bio,
 * city of residence (manual text — NEVER GPS), language (EN/ES),
 * avatar photo, profile theme (the cover photo is not edited any more: the profile header is the theme's gradient).
 *
 * Flow:
 *   1. Load current values on mount via getUserById(user.id).
 *   2. Avatar: expo-image-picker → upload to Supabase Storage
 *      (bucket: `avatars`) guarded by isSupabaseConfigured;
 *      when not configured the local uri is used as a preview.
 *   3. Username field: debounced 500 ms query on `users.username`,
 *      skipped when the value hasn't changed from the original.
 *   4. Profile Theme: "Change Theme" button opens a full-screen Modal
 *      containing the existing <ProfileThemeSelector>; closing sets
 *      local state with the chosen profile_theme_id.
 *   5. Save: updates the `users` table row and navigates back.
 *   6. Cancel: Alert confirm if unsaved changes, then goBack().
 *
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Spinner } from '../../components/common/Spinner';
import AppText from '../../components/common/AppText';
import FormField from '../../components/common/FormField';
import { AppModal } from '../../components/common/AppModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import {
  IconCamera,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconPalette,
  IconUser,
  IconX,
} from '@tabler/icons-react-native';

import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { controlMinHeight, fieldGap, fieldLabelGap, sectionGap, space } from '../../theme/spacing';
import { typeCap, typeStyle } from '../../theme/typography';
import { getProfileTheme } from '../../theme/profileThemes';
import type { ProfileTheme } from '../../theme/profileThemes';

import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { getUserById, getProfileCounts } from '../../services/users';
import type { UserRow } from '../../services/users';
import { uploadAvatarPair } from '../../services/avatar';
import { listPendingRequests } from '../../services/follows';
import { YourNetwork, type NetworkTab } from '../../components/profile/YourNetwork';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/AppNavigator';

import ProfileThemeSelector from '../../components/profile/ProfileThemeSelector';

// ── Navigation ───────────────────────────────────────────────────────────────
// Using the generic hook so we don't depend on a typed param list here.
// The screen is registered in AppNavigator separately (Task 1.8 wire-up).
import { useNavigation } from '@react-navigation/native';
import { toUserMessage } from '../../utils/errors';
import { pickPhotoFromLibrary } from '../../services/photoPicker';
import { emitMyProfileChanged } from '../../services/profileEvents';
import { confirm, showAlert } from '../../utils/dialog';

// ── Constants ────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
] as const;

type LanguageCode = (typeof LANGUAGES)[number]['code'];

const USERNAME_DEBOUNCE_MS = 500;

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function EditProfileScreen(): React.JSX.Element {
  const c = useThemeColors();
  const fieldPalette = { background: c.bgSurface, border: c.borderSubtle };
  const { t } = useTranslation('profile');
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user: authUser } = useAuth();

  // ── Local form state ──────────────────────────────────────────────────────

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Original values loaded from DB — used to detect unsaved changes
  const originalRef = useRef<Partial<UserRow>>({});

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [profileThemeId, setProfileThemeId] = useState(1);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  // ── Username availability state ───────────────────────────────────────────

  type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Profile theme modal ───────────────────────────────────────────────────

  const [themeModalVisible, setThemeModalVisible] = useState(false);

  // ── "Your network": numbers shown here now that the profile has no counters ──

  const [network, setNetwork] = useState({ followers: 0, following: 0, requests: 0 });
  useEffect(() => {
    if (!authUser?.id) return;
    let alive = true;
    void (async () => {
      try {
        const [counts, pending] = await Promise.all([getProfileCounts(authUser.id), listPendingRequests()]);
        if (alive) setNetwork({ followers: counts.followers, following: counts.following, requests: pending.length });
      } catch {
        // The rows keep showing 0; the screen still works.
      }
    })();
    return () => { alive = false; };
  }, [authUser?.id]);
  const openNetwork = (tab: NetworkTab) => navigation.navigate('Friends', { userId: authUser?.id, initialTab: tab });

  // ── Load profile on mount ─────────────────────────────────────────────────

  useEffect(() => {
    if (!authUser?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const row = await getUserById(authUser!.id);
        if (cancelled || !row) return;

        // Store originals for change detection
        originalRef.current = {
          display_name: row.display_name ?? '',
          username: row.username,
          bio: row.bio ?? '',
          language: row.language,
          profile_theme_id: row.profile_theme_id,
          avatar_url: row.avatar_url ?? null,
          cover_url: row.cover_url ?? null,
          city: row.city ?? '',
        };

        setDisplayName(row.display_name ?? '');
        setUsername(row.username);
        setBio(row.bio ?? '');
        setLanguage((row.language as LanguageCode) ?? 'en');
        setProfileThemeId(row.profile_theme_id ?? 1);
        setAvatarUri(row.avatar_url ?? null);
        setCity(row.city ?? '');
      } catch {
        // Silently fall through; fields stay blank
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [authUser?.id]);

  // ── Username availability check (debounced) ───────────────────────────────

  const handleUsernameChange = useCallback(
    (value: string) => {
      setUsername(value);

      // Clear previous timer
      if (debounceRef.current) clearTimeout(debounceRef.current);

      // If back to original, no need to check
      if (value === originalRef.current.username) {
        setUsernameStatus('idle');
        return;
      }

      if (!value.trim()) {
        setUsernameStatus('idle');
        return;
      }

      setUsernameStatus('checking');

      debounceRef.current = setTimeout(async () => {
        if (!isSupabaseConfigured) {
          // In demo mode, pretend it's available
          setUsernameStatus('available');
          return;
        }
        try {
          const { data, error } = await supabase.rpc('username_available', {
            check_username: value.trim(),
          });

          if (error) {
            setUsernameStatus('error');
            return;
          }
          // RPC returns boolean: true = available, false = taken.
          setUsernameStatus(data === true ? 'available' : 'taken');
        } catch {
          setUsernameStatus('error');
        }
      }, USERNAME_DEBOUNCE_MS);
    },
    [],
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ── Image picker helpers ──────────────────────────────────────────────────

  const pickAvatar = useCallback(async () => {
    const result = await pickPhotoFromLibrary({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (result && !result.canceled && result.assets.length > 0) {
      setAvatarUri(result.assets[0].uri);
    }
  }, []);

  // ── Change detection ──────────────────────────────────────────────────────

  function hasUnsavedChanges(): boolean {
    const o = originalRef.current;
    return (
      displayName !== (o.display_name ?? '') ||
      username !== (o.username ?? '') ||
      bio !== (o.bio ?? '') ||
      city !== (o.city ?? '') ||
      language !== (o.language ?? 'en') ||
      profileThemeId !== (o.profile_theme_id ?? 1) ||
      avatarUri !== (o.avatar_url ?? null)
    );
  }

  // ── Cancel handler ────────────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    if (!hasUnsavedChanges()) {
      navigation.goBack();
      return;
    }
    void confirm(t('edit.discardTitle'), t('edit.discardMessage'), { confirmText: t('edit.discard'), cancelText: t('edit.keepEditing'), destructive: true }).then((accepted) => {
      if (!accepted) return;
      navigation.goBack();
    });
  }, [navigation, displayName, username, bio, city, language, profileThemeId, avatarUri, t]);

  // ── Save handler ──────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!authUser?.id) return;

    // Block save if username is taken
    if (usernameStatus === 'taken') {
      showAlert(t('edit.usernameTakenTitle'), t('edit.usernameTakenMessage'));
      return;
    }

    // Block save while checking
    if (usernameStatus === 'checking') {
      showAlert(t('edit.pleaseWaitTitle'), t('edit.checkingUsername'));
      return;
    }

    setSaving(true);
    try {
      // Upload avatar if changed (URI is local)
      let finalAvatarUrl = avatarUri;
      const originalAvatar = originalRef.current.avatar_url ?? null;
      if (avatarUri && avatarUri !== originalAvatar) {
        finalAvatarUrl = await uploadAvatarPair(authUser.id, avatarUri);
      }

      if (!isSupabaseConfigured) {
        // Demo mode: skip the actual update, just go back
        navigation.goBack();
        return;
      }

      const updates: Record<string, unknown> = {
        display_name: displayName.trim() || null,
        username: username.trim(),
        bio: bio.trim() || null,
        language,
        profile_theme_id: profileThemeId,
        avatar_url: finalAvatarUrl,
        city: city.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', authUser.id);

      if (error) throw error;

      // The chat (if one is open below) shows my new name / photo on my messages at once.
      emitMyProfileChanged({ userId: authUser.id, displayName: (updates.display_name as string | null) ?? undefined, avatarUrl: finalAvatarUrl });

      navigation.goBack();
    } catch (err) {
      const msg = toUserMessage(err, 'profile:edit.saveErrorGeneric');
      showAlert(t('edit.saveFailedTitle'), msg);
    } finally {
      setSaving(false);
    }
  }, [
    authUser?.id,
    displayName,
    username,
    bio,
    city,
    language,
    profileThemeId,
    avatarUri,
    usernameStatus,
    navigation,
    t,
  ]);

  // ── Theme preview ─────────────────────────────────────────────────────────

  const selectedTheme: ProfileTheme = getProfileTheme(profileThemeId);

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.bgBase }]}>
        <Spinner size="large" color={c.brandText} />
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.bgBase }]}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[styles.header, { borderBottomColor: c.borderSubtle }]}>
        <TouchableOpacity
          onPress={handleCancel}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel={t('back', { ns: 'common' })}
          disabled={saving}
        >
          <IconChevronLeft size={24} color={c.brandText} strokeWidth={2} />
        </TouchableOpacity>

        <AppText variant="headline" adjustsFontSizeToFit minimumFontScale={0.6} numberOfLines={1} style={styles.headerTitle}>
          {t('edit.title')}
        </AppText>

        <TouchableOpacity
          onPress={() => { void handleSave(); }}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel={t('actions.save', { ns: 'common' })}
          disabled={saving}
        >
          {saving ? (
            <Spinner size="small" color={c.brandText} />
          ) : (
            <AppText variant="button" color={c.brandText} style={styles.saveText}>{t('actions.save', { ns: 'common' })}</AppText>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { backgroundColor: c.bgBase }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Avatar photo ─────────────────────────────────────────────── */}
          <View style={styles.avatarRow}>
            <TouchableOpacity
              testID="edit-change-avatar"
              onPress={() => { void pickAvatar(); }}
              accessibilityRole="button"
              accessibilityLabel={t('edit.changeAvatarPhotoA11y')}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.avatarWrap,
                  {
                    backgroundColor: c.bgSurface,
                    borderColor: selectedTheme.avatarBorder,
                  },
                ]}
              >
                {avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={styles.avatarImage}
                    resizeMode="cover"
                    accessibilityLabel={t('edit.avatarPreviewA11y')}
                  />
                ) : (
                  <IconUser size={36} color={c.textTertiary} />
                )}
                <View style={[styles.avatarCameraChip, { backgroundColor: selectedTheme.btn1Bg }]}>
                  <IconCamera size={12} color={selectedTheme.btn1Color} />
                </View>
              </View>
            </TouchableOpacity>
          </View>

          <YourNetwork followers={network.followers} following={network.following} requests={network.requests} onOpen={openNetwork} />

          {/* ── Form fields ───────────────────────────────────────────────── */}
          <View style={styles.form}>

            {/* Display name */}
            <FormField
              first
              label={t('edit.displayNameLabel')}
              palette={fieldPalette}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder={t('edit.namePlaceholder')}
              maxLength={50}
              autoCorrect={false}
              accessibilityLabel={t('edit.displayNameA11y')}
            />

            {/* Username */}
            <FormField
              first
              label={t('edit.usernameLabel')}
              palette={fieldPalette}
              left={<AppText variant="field" color={c.textTertiary}>@</AppText>}
              leftWidth={space.xxl}
              right={<UsernameIndicator status={usernameStatus} />}
              below={<UsernameHint status={usernameStatus} c={c} />}
              maxLength={30}
              value={username}
              onChangeText={handleUsernameChange}
              placeholder={t('edit.usernamePlaceholder')}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t('edit.usernameA11y')}
            />

            {/* Bio */}
            <FormField
              first
              label={t('edit.bioLabel')}
              palette={fieldPalette}
              style={styles.textArea}
              value={bio}
              onChangeText={setBio}
              placeholder={t('edit.bioPlaceholder')}
              multiline
              numberOfLines={3}
              maxLength={160}
              accessibilityLabel={t('edit.bioA11y')}
            />

            {/* City */}
            {/* multiline so a long placeholder wraps to a second line at large text sizes; it stays one line of text (no new lines). */}
            <FormField
              first // the form's gap already separates the fields
              label={t('edit.cityLabel')}
              palette={fieldPalette}
              value={city}
              onChangeText={(value) => setCity(value.replace(/[\r\n]+/g, ' '))}
              multiline
              scrollEnabled={false}
              submitBehavior="blurAndSubmit"
              placeholder={t('edit.cityPlaceholder')}
              maxLength={80}
              autoCorrect={false}
              accessibilityLabel={t('edit.cityA11y')}
            />

            {/* Language */}
            <View style={styles.fieldGroup}>
              <AppText variant="label" color={c.textSecondary}>
                {t('edit.languageLabel')}
              </AppText>
              <View style={styles.langRow}>
                {LANGUAGES.map((lang) => {
                  const isSelected = language === lang.code;
                  return (
                    <TouchableOpacity
                      key={lang.code}
                      onPress={() => setLanguage(lang.code)}
                      style={[
                        styles.langChip,
                        {
                          backgroundColor: isSelected
                            ? c.brandFill
                            : c.bgSurface,
                          borderColor: isSelected
                            ? c.brand
                            : c.borderSubtle,
                        },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={lang.label}
                      aria-checked={isSelected}
                    >
                      <AppText
                        variant="body"
                        style={[
                          styles.langLabel,
                          {
                            // The chip is filled with brandFill whatever the profile theme: its label is the on-brand white (4.98:1),
                            // not the theme's button colour (which is picked for the theme's accent and gave 3.84:1 on brandFill).
                            color: isSelected
                              ? palette.onBrand
                              : c.textPrimary,
                          },
                        ]}
                      >
                        {lang.label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Profile Theme */}
            <View style={styles.fieldGroup}>
              <AppText variant="label" color={c.textSecondary}>
                {t('edit.themeLabel')}
              </AppText>
              <TouchableOpacity
                onPress={() => setThemeModalVisible(true)}
                style={[
                  styles.themeRow,
                  {
                    backgroundColor: c.bgSurface,
                    borderColor: c.borderSubtle,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('edit.changeThemeA11y', { name: selectedTheme.name })}
              >
                {/* Theme swatch */}
                <View
                  style={[
                    styles.themeSwatch,
                    { backgroundColor: selectedTheme.accent },
                  ]}
                />
                <AppText variant="body" style={styles.themeLabel}>
                  {selectedTheme.name}
                </AppText>
                <IconPalette size={18} color={c.textTertiary} style={styles.themeIcon} />
                <IconChevronRight size={18} color={c.textTertiary} />
              </TouchableOpacity>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Profile Theme Modal ─────────────────────────────────────────────── */}
      <AppModal
        visible={themeModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setThemeModalVisible(false)}
      >
        <SafeAreaView style={[styles.modalSafe, { backgroundColor: c.bgBase }]}>
          {/* Modal header */}
          <View style={[styles.modalHeader, { borderBottomColor: c.borderSubtle }]}>
            <AppText variant="headline" style={styles.modalTitle}>
              {t('edit.chooseTheme')}
            </AppText>
            <TouchableOpacity
              onPress={() => setThemeModalVisible(false)}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel={t('edit.closeThemePickerA11y')}
            >
              <IconCheck size={22} color={c.brandText} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalScroll}
            showsVerticalScrollIndicator={false}
          >
            <ProfileThemeSelector
              selectedId={profileThemeId}
              onSelect={(id) => {
                setProfileThemeId(id);
                setThemeModalVisible(false);
              }}
            />
          </ScrollView>
        </SafeAreaView>
      </AppModal>
    </SafeAreaView>
  );
}

// ── Username status sub-components ────────────────────────────────────────────

interface StatusProps {
  status: 'idle' | 'checking' | 'available' | 'taken' | 'error';
}

function UsernameIndicator({ status }: StatusProps): React.JSX.Element | null {
  if (status === 'idle') return null;
  if (status === 'checking') {
    return <Spinner size="small" color={palette.brand} style={styles.statusIcon} />;
  }
  if (status === 'available') {
    return <IconCheck size={18} color={palette.success} style={styles.statusIcon} />;
  }
  if (status === 'taken') {
    return <IconX size={18} color={palette.danger} style={styles.statusIcon} />;
  }
  return null;
}

interface HintProps extends StatusProps {
  c: ReturnType<typeof useThemeColors>;
}

function UsernameHint({ status, c }: HintProps): React.JSX.Element | null {
  const { t } = useTranslation('profile');
  if (status === 'available') {
    return (
      <AppText variant="caption" color={palette.success} style={styles.hintText}>
        {t('edit.usernameAvailable')}
      </AppText>
    );
  }
  if (status === 'taken') {
    return (
      <AppText variant="caption" color={palette.danger} style={styles.hintText}>
        {t('edit.usernameTaken')}
      </AppText>
    );
  }
  if (status === 'error') {
    return (
      <AppText variant="caption" color={palette.warning} style={styles.hintText}>
        {t('edit.usernameCheckError')}
      </AppText>
    );
  }
  return null;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const AVATAR_SIZE = 80;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    flexShrink: 0,
    padding: space.xs,
    minWidth: controlMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    flexShrink: 1,
    fontWeight: '600',
    textAlign: 'center',
  },
  saveText: {
    fontWeight: '600',
  },

  // ── Scroll content ────────────────────────────────────────────────────────
  scroll: {
    paddingBottom: space.xxxl + space.xl,
  },

  // ── Avatar ────────────────────────────────────────────────────────────────
  avatarRow: {
    paddingHorizontal: space.xl,
    marginTop: space.lg, // no cover banner above any more: the avatar starts the form
    marginBottom: space.sm,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarCameraChip: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Form ──────────────────────────────────────────────────────────────────
  form: {
    paddingHorizontal: space.xl,
    gap: fieldGap,
    marginTop: sectionGap,
  },
  fieldGroup: {
    gap: fieldLabelGap,
  },
  input: {
    ...typeStyle('field'),
    minHeight: controlMinHeight,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: space.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  textArea: {
    minHeight: 80, // multi-line field: taller than controlMinHeight
    textAlignVertical: 'top',
  },

  // ── Username row with inline status icon ──────────────────────────────────
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: controlMinHeight,
    borderRadius: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
  },
  atSymbol: {
    marginRight: space.xs,
  },
  inputInner: {
    flex: 1,
    ...typeStyle('field'),
    paddingVertical: space.sm,
  },
  statusIcon: {
    marginLeft: space.sm,
  },
  hintText: {
    marginTop: space.xs,
    marginLeft: space.xs,
  },

  // ── Language chips ────────────────────────────────────────────────────────
  langRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  langChip: {
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
    minHeight: controlMinHeight,
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
  },
  langLabel: {
    fontWeight: '500',
  },

  // ── Theme picker row ──────────────────────────────────────────────────────
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: controlMinHeight,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.md,
  },
  themeSwatch: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  themeLabel: {
    flex: 1,
  },
  themeIcon: {
    // spacer between label and chevron
  },

  // ── Theme Modal ───────────────────────────────────────────────────────────
  modalSafe: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontWeight: '600',
  },
  modalScroll: {
    paddingHorizontal: space.md,
    paddingBottom: space.xxxl,
  },
});
