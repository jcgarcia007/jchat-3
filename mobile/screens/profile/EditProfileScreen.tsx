/**
 * JChat 3.0 — Edit Profile Screen (Task 1.8)
 *
 * Fields: display name, @username (debounced availability check), bio,
 * city of residence (manual text — NEVER GPS), language (EN/ES),
 * avatar photo, cover photo, profile theme.
 *
 * Flow:
 *   1. Load current values on mount via getUserById(user.id).
 *   2. Avatar / cover: expo-image-picker → upload to Supabase Storage
 *      (buckets: `avatars`, `covers`) guarded by isSupabaseConfigured;
 *      when not configured the local uri is used as a preview.
 *   3. Username field: debounced 500 ms query on `users.username`,
 *      skipped when the value hasn't changed from the original.
 *   4. Profile Theme: "Change Theme" button opens a full-screen Modal
 *      containing the existing <ProfileThemeSelector>; closing sets
 *      local state with the chosen profile_theme_id.
 *   5. Save: updates the `users` table row and navigates back.
 *   6. Cancel: Alert confirm if unsaved changes, then goBack().
 *
 * TODO(i18n): replace English strings with translation keys.
 * TODO(schema): add `city` text column to the users table.
 * TODO(schema): add `cover_url` text column to the users table.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  IconCamera,
  IconCheck,
  IconChevronRight,
  IconLogout,
  IconPalette,
  IconUser,
  IconX,
} from '@tabler/icons-react-native';

import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { getProfileTheme } from '../../theme/profileThemes';
import type { ProfileTheme } from '../../theme/profileThemes';

import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { getUserById } from '../../services/users';
import type { UserRow } from '../../services/users';

import ProfileThemeSelector from '../../components/profile/ProfileThemeSelector';

// ── Navigation ───────────────────────────────────────────────────────────────
// Using the generic hook so we don't depend on a typed param list here.
// The screen is registered in AppNavigator separately (Task 1.8 wire-up).
import { useNavigation } from '@react-navigation/native';

// ── Constants ────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
] as const;

type LanguageCode = (typeof LANGUAGES)[number]['code'];

const USERNAME_DEBOUNCE_MS = 500;
const AVATAR_BUCKET = 'avatars';
const COVER_BUCKET = 'covers';

// ── Upload helpers ───────────────────────────────────────────────────────────

/**
 * Upload a local image URI to the given Supabase Storage bucket.
 * Returns the public URL on success, or the original localUri when
 * Supabase is not configured (demo/dev mode).
 */
async function uploadImage(
  userId: string,
  localUri: string,
  bucket: string,
): Promise<string> {
  if (!isSupabaseConfigured) return localUri;

  // Fetch the file as a blob
  const response = await fetch(localUri);
  const blob = await response.blob();

  const ext = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType, upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function EditProfileScreen(): React.JSX.Element {
  const c = useThemeColors();
  const navigation = useNavigation();
  const { user: authUser, signOut } = useAuth();

  // ── Local form state ──────────────────────────────────────────────────────

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Original values loaded from DB — used to detect unsaved changes
  const originalRef = useRef<Partial<UserRow>>({});

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState(''); // TODO(schema): city column
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [profileThemeId, setProfileThemeId] = useState(1);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);

  // ── Username availability state ───────────────────────────────────────────

  type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Profile theme modal ───────────────────────────────────────────────────

  const [themeModalVisible, setThemeModalVisible] = useState(false);

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
        };

        setDisplayName(row.display_name ?? '');
        setUsername(row.username);
        setBio(row.bio ?? '');
        setLanguage((row.language as LanguageCode) ?? 'en');
        setProfileThemeId(row.profile_theme_id ?? 1);
        setAvatarUri(row.avatar_url ?? null);
        // TODO(schema): load cover_url once the column exists
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

  async function requestMediaPermission(): Promise<boolean> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== ImagePicker.PermissionStatus.GRANTED) {
      Alert.alert(
        'Permission required',
        'Please allow access to your photo library in Settings.',
      );
      return false;
    }
    return true;
  }

  const pickAvatar = useCallback(async () => {
    const granted = await requestMediaPermission();
    if (!granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (!result.canceled && result.assets.length > 0) {
      setAvatarUri(result.assets[0].uri);
    }
  }, []);

  const pickCover = useCallback(async () => {
    const granted = await requestMediaPermission();
    if (!granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });

    if (!result.canceled && result.assets.length > 0) {
      setCoverUri(result.assets[0].uri);
    }
  }, []);

  // ── Change detection ──────────────────────────────────────────────────────

  function hasUnsavedChanges(): boolean {
    const o = originalRef.current;
    return (
      displayName !== (o.display_name ?? '') ||
      username !== (o.username ?? '') ||
      bio !== (o.bio ?? '') ||
      language !== (o.language ?? 'en') ||
      profileThemeId !== (o.profile_theme_id ?? 1) ||
      avatarUri !== (o.avatar_url ?? null) ||
      coverUri !== null // cover is always "new" if set
    );
  }

  // ── Logout handler ────────────────────────────────────────────────────────

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Log out?',
      'Are you sure you want to log out of your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out', style: 'destructive', onPress: () => { void signOut(); } },
      ],
    );
  }, [signOut]);

  // ── Cancel handler ────────────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    if (!hasUnsavedChanges()) {
      navigation.goBack();
      return;
    }
    Alert.alert(
      'Discard changes?', // TODO(i18n)
      'You have unsaved changes. Discard them?',
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.goBack(),
        },
      ],
    );
  }, [navigation, displayName, username, bio, city, language, profileThemeId, avatarUri, coverUri]);

  // ── Save handler ──────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!authUser?.id) return;

    // Block save if username is taken
    if (usernameStatus === 'taken') {
      Alert.alert('Username taken', 'Please choose a different username.');
      return;
    }

    // Block save while checking
    if (usernameStatus === 'checking') {
      Alert.alert('Please wait', 'Checking username availability…');
      return;
    }

    setSaving(true);
    try {
      // Upload avatar if changed (URI is local)
      let finalAvatarUrl = avatarUri;
      const originalAvatar = originalRef.current.avatar_url ?? null;
      if (avatarUri && avatarUri !== originalAvatar) {
        finalAvatarUrl = await uploadImage(authUser.id, avatarUri, AVATAR_BUCKET);
      }

      // Upload cover if set
      let finalCoverUrl: string | null = null;
      if (coverUri) {
        finalCoverUrl = await uploadImage(authUser.id, coverUri, COVER_BUCKET);
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
        updated_at: new Date().toISOString(),
        // TODO(schema): uncomment once columns are added to users table:
        // city: city.trim() || null,
        // cover_url: finalCoverUrl,
      };

      // Only include cover_url if we have one (avoids touching the column if it doesn't exist yet)
      if (finalCoverUrl) {
        // TODO(schema): enable this line once cover_url column exists
        // updates.cover_url = finalCoverUrl;
        void finalCoverUrl; // suppress unused warning until schema is ready
      }

      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', authUser.id);

      if (error) throw error;

      navigation.goBack();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An error occurred while saving.';
      Alert.alert('Save failed', msg);
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
    coverUri,
    usernameStatus,
    navigation,
  ]);

  // ── Theme preview ─────────────────────────────────────────────────────────

  const selectedTheme: ProfileTheme = getProfileTheme(profileThemeId);

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.bgBase }]}>
        <ActivityIndicator size="large" color={palette.brand} />
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
          accessibilityLabel="Cancel"
          disabled={saving}
        >
          <IconX size={22} color={c.textSecondary} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: c.textPrimary }]}>
          Edit Profile {/* TODO(i18n) */}
        </Text>

        <TouchableOpacity
          onPress={() => { void handleSave(); }}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel="Save"
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={palette.brand} />
          ) : (
            <Text style={[styles.saveText, { color: palette.brand }]}>Save</Text>
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

          {/* ── Cover photo ──────────────────────────────────────────────── */}
          <TouchableOpacity
            onPress={() => { void pickCover(); }}
            accessibilityRole="button"
            accessibilityLabel="Change cover photo"
            activeOpacity={0.8}
          >
            <View style={[styles.coverContainer, { backgroundColor: selectedTheme.coverBg }]}>
              {coverUri ? (
                <Image
                  source={{ uri: coverUri }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                  accessibilityLabel="Cover photo preview"
                />
              ) : null}
              <View style={styles.coverOverlay}>
                <View style={[styles.cameraChip, { backgroundColor: c.bgOverlay }]}>
                  <IconCamera size={16} color={c.textPrimary} />
                  <Text style={[styles.cameraLabel, { color: c.textPrimary }]}>
                    Change Cover {/* TODO(i18n) */}
                  </Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>

          {/* ── Avatar photo ─────────────────────────────────────────────── */}
          <View style={styles.avatarRow}>
            <TouchableOpacity
              onPress={() => { void pickAvatar(); }}
              accessibilityRole="button"
              accessibilityLabel="Change avatar photo"
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
                    accessibilityLabel="Avatar preview"
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

          {/* ── Form fields ───────────────────────────────────────────────── */}
          <View style={styles.form}>

            {/* Display name */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: c.textSecondary }]}>
                Display Name {/* TODO(i18n) */}
              </Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                style={[
                  styles.input,
                  {
                    color: c.textPrimary,
                    backgroundColor: c.bgSurface,
                    borderColor: c.borderSubtle,
                  },
                ]}
                placeholder="Your name"
                placeholderTextColor={c.textTertiary}
                maxLength={50}
                autoCorrect={false}
                accessibilityLabel="Display name"
              />
            </View>

            {/* Username */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: c.textSecondary }]}>
                Username {/* TODO(i18n) */}
              </Text>
              <View style={[styles.inputRow, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
                <Text style={[styles.atSymbol, { color: c.textTertiary }]}>@</Text>
                <TextInput
                  value={username}
                  onChangeText={handleUsernameChange}
                  style={[styles.inputInner, { color: c.textPrimary }]}
                  placeholder="username"
                  placeholderTextColor={c.textTertiary}
                  maxLength={30}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Username"
                />
                <UsernameIndicator status={usernameStatus} />
              </View>
              <UsernameHint status={usernameStatus} c={c} />
            </View>

            {/* Bio */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: c.textSecondary }]}>
                Bio {/* TODO(i18n) */}
              </Text>
              <TextInput
                value={bio}
                onChangeText={setBio}
                style={[
                  styles.input,
                  styles.textArea,
                  {
                    color: c.textPrimary,
                    backgroundColor: c.bgSurface,
                    borderColor: c.borderSubtle,
                  },
                ]}
                placeholder="Tell people about yourself"
                placeholderTextColor={c.textTertiary}
                multiline
                numberOfLines={3}
                maxLength={160}
                accessibilityLabel="Bio"
              />
            </View>

            {/* City */}
            <View style={styles.fieldGroup}>
              {/* TODO(schema): city column not yet in users table */}
              <Text style={[styles.label, { color: c.textSecondary }]}>
                City {/* TODO(i18n) */}
              </Text>
              <TextInput
                value={city}
                onChangeText={setCity}
                style={[
                  styles.input,
                  {
                    color: c.textPrimary,
                    backgroundColor: c.bgSurface,
                    borderColor: c.borderSubtle,
                  },
                ]}
                placeholder="Your city (manual text only)"
                placeholderTextColor={c.textTertiary}
                maxLength={80}
                autoCorrect={false}
                accessibilityLabel="City of residence"
              />
            </View>

            {/* Language */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: c.textSecondary }]}>
                Language {/* TODO(i18n) */}
              </Text>
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
                            ? palette.brand
                            : c.bgSurface,
                          borderColor: isSelected
                            ? palette.brand
                            : c.borderSubtle,
                        },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={lang.label}
                    >
                      <Text
                        style={[
                          styles.langLabel,
                          {
                            color: isSelected
                              ? '#ffffff'
                              : c.textPrimary,
                          },
                        ]}
                      >
                        {lang.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Profile Theme */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: c.textSecondary }]}>
                Profile Theme {/* TODO(i18n) */}
              </Text>
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
                accessibilityLabel={`Change profile theme, current: ${selectedTheme.name}`}
              >
                {/* Theme swatch */}
                <View
                  style={[
                    styles.themeSwatch,
                    { backgroundColor: selectedTheme.coverBg },
                  ]}
                />
                <Text style={[styles.themeLabel, { color: c.textPrimary }]}>
                  {selectedTheme.name}
                </Text>
                <IconPalette size={18} color={c.textTertiary} style={styles.themeIcon} />
                <IconChevronRight size={18} color={c.textTertiary} />
              </TouchableOpacity>
            </View>

            {/* Log Out */}
            <TouchableOpacity
              onPress={handleLogout}
              style={[styles.logoutBtn, { borderColor: palette.danger }]}
              accessibilityRole="button"
              accessibilityLabel="Log out"
              disabled={saving}
            >
              <IconLogout size={18} color={palette.danger} />
              <Text style={[styles.logoutLabel, { color: palette.danger }]}>Log Out{/* TODO(i18n) */}</Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Profile Theme Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={themeModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setThemeModalVisible(false)}
      >
        <SafeAreaView style={[styles.modalSafe, { backgroundColor: c.bgBase }]}>
          {/* Modal header */}
          <View style={[styles.modalHeader, { borderBottomColor: c.borderSubtle }]}>
            <Text style={[styles.modalTitle, { color: c.textPrimary }]}>
              Choose Theme {/* TODO(i18n) */}
            </Text>
            <TouchableOpacity
              onPress={() => setThemeModalVisible(false)}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel="Close theme picker"
            >
              <IconCheck size={22} color={palette.brand} />
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
      </Modal>
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
    return <ActivityIndicator size="small" color={palette.brand} style={styles.statusIcon} />;
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
  if (status === 'available') {
    return (
      <Text style={[styles.hintText, { color: palette.success }]}>
        Username available {/* TODO(i18n) */}
      </Text>
    );
  }
  if (status === 'taken') {
    return (
      <Text style={[styles.hintText, { color: palette.danger }]}>
        Username already taken {/* TODO(i18n) */}
      </Text>
    );
  }
  if (status === 'error') {
    return (
      <Text style={[styles.hintText, { color: palette.warning }]}>
        Could not check availability {/* TODO(i18n) */}
      </Text>
    );
  }
  return null;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const AVATAR_SIZE = 80;
const COVER_HEIGHT = 120;

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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    padding: 4,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
  },

  // ── Scroll content ────────────────────────────────────────────────────────
  scroll: {
    paddingBottom: 60,
  },

  // ── Cover photo ───────────────────────────────────────────────────────────
  coverContainer: {
    width: '100%',
    height: COVER_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  cameraChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  cameraLabel: {
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Avatar ────────────────────────────────────────────────────────────────
  avatarRow: {
    paddingHorizontal: 20,
    marginTop: -AVATAR_SIZE / 2,
    marginBottom: 8,
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
    paddingHorizontal: 20,
    gap: 20,
    marginTop: 8,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // ── Username row with inline status icon ──────────────────────────────────
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  atSymbol: {
    fontSize: 15,
    marginRight: 2,
  },
  inputInner: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 11,
  },
  statusIcon: {
    marginLeft: 8,
  },
  hintText: {
    fontSize: 12,
    marginTop: 2,
    marginLeft: 2,
  },

  // ── Language chips ────────────────────────────────────────────────────────
  langRow: {
    flexDirection: 'row',
    gap: 10,
  },
  langChip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  langLabel: {
    fontSize: 14,
    fontWeight: '500',
  },

  // ── Theme picker row ──────────────────────────────────────────────────────
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  themeSwatch: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  themeLabel: {
    flex: 1,
    fontSize: 15,
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
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  modalScroll: {
    paddingHorizontal: 12,
    paddingBottom: 40,
  },

  // ── Log Out button ────────────────────────────────────────────────────────
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: 10, borderWidth: 1, marginTop: 4,
  },
  logoutLabel: { fontSize: 15, fontWeight: '600' },
});
