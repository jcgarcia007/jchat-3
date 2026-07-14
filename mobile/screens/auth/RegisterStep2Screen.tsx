/**
 * JChat 3.0 — Register Step 2 Screen (Task 1.5)
 *
 * Collects: Date of birth, Language preference, @username, Terms acceptance.
 * Validates 18+ on submission, real-time debounced username availability check,
 * then calls supabase.auth.signUp and inserts the profile row into `users`.
 *
 * Design:
 *  • Progress dots — BOTH filled (brand color)
 *  • Title "Almost there!" + subtitle
 *  • Date-of-birth picker via @react-native-community/datetimepicker
 *  • Language selector (EN / ES)
 *  • @username field with real-time availability (debounced 300ms)
 *  • Terms + Privacy Policy checkbox (links via expo-web-browser)
 *  • "Create my account 🎉" button
 *
 * Auth guard: supabase.auth.signUp → AuthContext session listener flips
 * isAuthenticated → AppNavigator switches to main tabs automatically.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import {
  IconAt,
  IconCheck,
  IconAlertCircle,
  IconChevronDown,
  IconCalendar,
  IconLoader2,
} from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { useCaptcha, captchaErrorI18nKeys } from '../../services/captcha';
import type { AuthStackParamList } from '../../navigation/AppNavigator';
import i18n, { changeAppLanguage, type SupportedLanguage } from '../../i18n';

// ---------------------------------------------------------------------------
// Screen-local color constants — only values not already in palette/tokens
// ---------------------------------------------------------------------------
const LOCAL_COLORS = {
  onBrand: '#FFFFFF',            // text on filled brand button
  dividerLine: 'rgba(128,128,128,0.25)',
  checkboxBorder: 'rgba(128,128,128,0.5)',
  overlayBackdrop: 'rgba(0,0,0,0.6)',
} as const;

// ---------------------------------------------------------------------------
// Types / navigation
// ---------------------------------------------------------------------------
type Props = {
  route: RouteProp<AuthStackParamList, 'RegisterStep2'>;
  navigation: NativeStackNavigationProp<AuthStackParamList, 'RegisterStep2'>;
};

type Language = 'en' | 'es';

const LANGUAGE_OPTIONS: { value: Language; label: string; flag: string }[] = [
  { value: 'en', label: 'English', flag: '🇺🇸' },
  { value: 'es', label: 'Español', flag: '🇲🇽' },
];

// ---------------------------------------------------------------------------
// Legal URL stubs
// ---------------------------------------------------------------------------
const TERMS_URL = 'https://jchat.app/terms';       // TODO
const PRIVACY_URL = 'https://jchat.app/privacy';   // TODO

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}/${d}/${y}`;
}

function isAtLeast18(dob: Date): boolean {
  const today = new Date();
  const eighteenYearsAgo = new Date(
    today.getFullYear() - 18,
    today.getMonth(),
    today.getDate(),
  );
  return dob <= eighteenYearsAgo;
}

// Returns an i18n key (resolved with t() at render / in the alert). Keys map to
// the `auth` namespace's `validation.*` block.
type UsernameErrorKey = 'validation.usernameRequired' | 'validation.usernameFormat';
function validateUsername(v: string): UsernameErrorKey | null {
  if (!v.trim()) return 'validation.usernameRequired';
  if (!USERNAME_REGEX.test(v.trim())) return 'validation.usernameFormat';
  return null;
}

// ---------------------------------------------------------------------------
// Username availability status type
// ---------------------------------------------------------------------------
type AvailabilityStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function RegisterStep2Screen({ route, navigation }: Props) {
  const c = useThemeColors();
  const { t } = useTranslation('auth');
  // hCaptcha (D-38): token pedido en el submit; `CaptchaGate` se monta abajo.
  const { captchaEnabled, getCaptchaToken, CaptchaGate } = useCaptcha();
  const { name = '', email = '', password = '' } = route.params ?? {};

  // ── Date of birth ──────────────────────────────────────────────────────────
  const defaultDob = new Date(2000, 0, 1);
  const [dob, setDob] = useState<Date>(defaultDob);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dobTouched, setDobTouched] = useState(false);

  // ── Language selector ──────────────────────────────────────────────────────
  const [language, setLanguage] = useState<Language>(
    (i18n.language === 'es' ? 'es' : 'en') as Language,
  );
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);

  // ── Username ───────────────────────────────────────────────────────────────
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityStatus>('idle');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Terms ──────────────────────────────────────────────────────────────────
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsTouched, setTermsTouched] = useState(false);

  // ── Submission ─────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);

  // ---------------------------------------------------------------------------
  // Derived errors (only after touch or submit attempt)
  // ---------------------------------------------------------------------------
  const dobError: string | null =
    dobTouched && !isAtLeast18(dob)
      ? t('register.dobError')
      : null;

  const usernameFormatError: string | null = usernameTouched
    ? validateUsername(username)
    : null;

  const termsError: string | null =
    termsTouched && !termsAccepted
      ? t('register.termsError')
      : null;

  // ---------------------------------------------------------------------------
  // Real-time username availability check — debounced 300ms
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Clear any pending timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Skip check if there's a format error or the field is empty
    if (!username.trim() || validateUsername(username) !== null) {
      setAvailability('idle');
      return;
    }

    setAvailability('checking');

    debounceTimer.current = setTimeout(async () => {
      if (!isSupabaseConfigured) {
        // Demo mode — treat as available so flow is unblocked
        setAvailability('available');
        return;
      }

      try {
        const { data, error } = await supabase.rpc('username_available', {
          check_username: username.trim().toLowerCase(),
        });

        if (error) {
          setAvailability('error');
          return;
        }

        // RPC returns boolean: true = available, false = taken.
        setAvailability(data === true ? 'available' : 'taken');
      } catch {
        setAvailability('error');
      }
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [username]);

  // ---------------------------------------------------------------------------
  // Date picker handlers
  // ---------------------------------------------------------------------------
  const handleDateChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      // On Android the picker dismisses itself after selection / cancellation
      if (Platform.OS === 'android') {
        setShowDatePicker(false);
      }
      if (event.type === 'set' && selectedDate) {
        setDob(selectedDate);
        setDobTouched(true);
      }
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Legal links
  // ---------------------------------------------------------------------------
  const openTerms = useCallback(async () => {
    await WebBrowser.openBrowserAsync(TERMS_URL);
  }, []);

  const openPrivacy = useCallback(async () => {
    await WebBrowser.openBrowserAsync(PRIVACY_URL);
  }, []);

  // ---------------------------------------------------------------------------
  // Submit — validate → signUp → insert profile
  // ---------------------------------------------------------------------------
  const handleCreateAccount = useCallback(async () => {
    // Mark all as touched to surface any hidden errors
    setDobTouched(true);
    setUsernameTouched(true);
    setTermsTouched(true);

    // ── Client-side validation ────────────────────────────────────────────
    if (!isAtLeast18(dob)) {
      Alert.alert(
        t('register.alerts.ageTitle'),
        t('register.alerts.ageMessage'),
      );
      return;
    }

    const formatErr = validateUsername(username);
    if (formatErr) {
      Alert.alert(t('register.alerts.invalidUsernameTitle'), t(formatErr));
      return;
    }

    if (availability !== 'available') {
      if (availability === 'taken') {
        Alert.alert(t('register.alerts.usernameTakenTitle'), t('register.alerts.usernameTakenMessage'));
      } else if (availability === 'checking') {
        Alert.alert(t('register.alerts.pleaseWaitTitle'), t('register.alerts.pleaseWaitMessage'));
      } else {
        // idle or error — re-trigger a check
        Alert.alert(t('register.alerts.checkUsernameTitle'), t('register.alerts.checkUsernameMessage'));
      }
      return;
    }

    if (!termsAccepted) {
      Alert.alert(
        t('register.alerts.termsRequiredTitle'),
        t('register.alerts.termsRequiredMessage'),
      );
      return;
    }

    if (!email || !password) {
      Alert.alert(
        t('register.alerts.missingDataTitle'),
        t('register.alerts.missingDataMessage'),
      );
      return;
    }

    setSubmitting(true);

    try {
      // ── Guard: no real backend configured ────────────────────────────────
      if (!isSupabaseConfigured) {
        Alert.alert(
          t('register.alerts.demoModeTitle'),
          t('register.alerts.demoModeMessage'),
        );
        setSubmitting(false);
        return;
      }

      // ── hCaptcha (D-38): token JUSTO antes del signUp (uso único, expira) ──
      // Kill-switch (sin sitekey): captchaEnabled=false → se procede sin token.
      let captchaToken: string | null = null;
      if (captchaEnabled) {
        try {
          captchaToken = await getCaptchaToken();
        } catch (err) {
          // Expiración / timeout / red / no disponible / ocupado: mensaje según el código.
          const { titleKey, messageKey } = captchaErrorI18nKeys(err);
          Alert.alert(t(titleKey), t(messageKey));
          setSubmitting(false);
          return;
        }
        if (captchaToken === null) {
          // Usuario canceló: no llamar a Supabase sin token.
          Alert.alert(t('captcha.cancelledTitle'), t('captcha.cancelledMessage'));
          setSubmitting(false);
          return;
        }
      }

      // ── 1. Create auth user ───────────────────────────────────────────────
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { captchaToken: captchaToken ?? undefined },
      });

      if (signUpError) {
        Alert.alert(t('register.alerts.signUpFailedTitle'), signUpError.message);
        setSubmitting(false);
        return;
      }

      const userId = authData.user?.id;
      if (!userId) {
        Alert.alert(
          t('register.alerts.signUpErrorTitle'),
          t('register.alerts.signUpErrorMessage'),
        );
        setSubmitting(false);
        return;
      }

      // ── 2. Insert profile into `users` table ──────────────────────────────
      const { error: profileError } = await supabase.from('users').upsert(
        {
          id: userId,
          username: username.trim().toLowerCase(),
          display_name: name.trim() || null,
          language,
          profile_theme_id: 1, // default theme
        },
        // DO NOTHING on conflict: the row already exists (handle_new_auth_user
        // trigger created it). A merge-upsert would put `id` in the ON CONFLICT
        // SET clause, which the users column allow-list (migr 066) no longer
        // grants → permission denied. Matches web/app/business/register.
        { onConflict: 'id', ignoreDuplicates: true },
      );

      if (profileError) {
        // Non-fatal: auth succeeded; user can update profile later.
        // Log but don't block navigation.
        console.warn('[RegisterStep2] profile insert error:', profileError.message);
      }

      // TODO(Task 1.6): navigate to Onboarding before main tabs.
      // For now, the AuthContext session listener (supabase.auth.onAuthStateChange)
      // detects the new session and flips isAuthenticated → AppNavigator renders
      // MainStack (BottomTabs) automatically — no explicit navigation needed here.
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('register.alerts.unexpectedError');
      Alert.alert(t('register.alerts.errorTitle'), message);
      setSubmitting(false);
    }
  }, [dob, username, availability, termsAccepted, email, password, name, language, captchaEnabled, getCaptchaToken, t]);

  // ---------------------------------------------------------------------------
  // Computed values for rendering
  // ---------------------------------------------------------------------------
  const inputBg = c.bgSurface;
  const inputBorder = c.borderSubtle;
  const selectedLanguage = LANGUAGE_OPTIONS.find((o) => o.value === language)!;

  // Max date: today (can't claim a future DOB)
  const maxDate = new Date();

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bgBase }]}>
      {/* hCaptcha (D-38): invisible; renderiza null salvo cuando el reto está activo. */}
      {CaptchaGate}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Progress dots — both filled ─────────────────────────────── */}
          <View style={styles.dotsRow} accessibilityLabel={t('register.step2Indicator')}>
            <View style={[styles.dot, { backgroundColor: palette.brand, width: 20 }]} />
            <View style={[styles.dot, { backgroundColor: palette.brand, width: 20 }]} />
          </View>

          {/* ── Title ────────────────────────────────────────────────────── */}
          <Text style={[styles.title, { color: c.textPrimary }]}>
            {t('register.step2Title')}
          </Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            {t('register.step2Subtitle')}
          </Text>

          {/* ── Date of birth ─────────────────────────────────────────────── */}
          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: c.textSecondary }]}>
              {t('register.dobLabel')}
            </Text>
            <TouchableOpacity
              style={[
                styles.input,
                styles.selectorRow,
                {
                  backgroundColor: inputBg,
                  borderColor: dobError ? palette.danger : inputBorder,
                },
              ]}
              onPress={() => {
                setShowDatePicker(true);
                setDobTouched(true);
              }}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={t('register.dobA11y')}
            >
              <IconCalendar size={18} color={c.textTertiary} strokeWidth={1.75} />
              <Text
                style={[
                  styles.selectorText,
                  {
                    color: dobTouched ? c.textPrimary : c.textTertiary,
                    marginLeft: 8,
                    flex: 1,
                  },
                ]}
              >
                {dobTouched ? formatDate(dob) : t('register.dobPlaceholder')}
              </Text>
            </TouchableOpacity>
            {dobError ? (
              <Text style={[styles.errorText, { color: palette.danger }]}>
                {dobError}
              </Text>
            ) : null}
          </View>

          {/* iOS: inline picker when triggered */}
          {showDatePicker && Platform.OS === 'ios' && (
            <View
              style={[
                styles.iosPickerWrap,
                { backgroundColor: inputBg, borderColor: inputBorder },
              ]}
            >
              <DateTimePicker
                value={dob}
                mode="date"
                display="spinner"
                maximumDate={maxDate}
                onChange={handleDateChange}
                textColor={c.textPrimary}
              />
              <TouchableOpacity
                style={[styles.iosDoneButton, { borderTopColor: inputBorder }]}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={[styles.iosDoneText, { color: palette.brand }]}>
                  {t('register.dobDone')}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Android: modal picker — shown imperatively */}
          {showDatePicker && Platform.OS === 'android' && (
            <DateTimePicker
              value={dob}
              mode="date"
              display="default"
              maximumDate={maxDate}
              onChange={handleDateChange}
            />
          )}

          {/* ── Language selector ─────────────────────────────────────────── */}
          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: c.textSecondary }]}>
              {t('register.languageLabel')}
            </Text>
            <TouchableOpacity
              style={[
                styles.input,
                styles.selectorRow,
                { backgroundColor: inputBg, borderColor: inputBorder },
              ]}
              onPress={() => setShowLanguagePicker(true)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={t('register.languageA11y')}
            >
              <Text style={[styles.selectorText, { color: c.textPrimary }]}>
                {selectedLanguage.flag}{'  '}{selectedLanguage.label}
              </Text>
              <IconChevronDown size={18} color={c.textTertiary} strokeWidth={1.75} />
            </TouchableOpacity>
          </View>

          {/* Language picker modal */}
          <Modal
            visible={showLanguagePicker}
            transparent
            animationType="fade"
            onRequestClose={() => setShowLanguagePicker(false)}
          >
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => setShowLanguagePicker(false)}
            >
              <View
                style={[
                  styles.languageSheet,
                  { backgroundColor: c.bgSurface, borderColor: inputBorder },
                ]}
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.languageOption,
                      opt.value === language && {
                        backgroundColor: palette.brandLight,
                      },
                    ]}
                    onPress={() => {
                      setLanguage(opt.value);
                      changeAppLanguage(opt.value as SupportedLanguage);
                      setShowLanguagePicker(false);
                    }}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={opt.label}
                  >
                    <Text style={styles.languageFlag}>{opt.flag}</Text>
                    <Text style={[styles.languageLabel, { color: c.textPrimary }]}>
                      {opt.label}
                    </Text>
                    {opt.value === language && (
                      <IconCheck size={18} color={palette.brand} strokeWidth={2} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </Pressable>
          </Modal>

          {/* ── @username ─────────────────────────────────────────────────── */}
          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: c.textSecondary }]}>
              {t('register.usernameLabel')}
            </Text>
            <View
              style={[
                styles.usernameInputWrapper,
                {
                  backgroundColor: inputBg,
                  borderColor:
                    usernameFormatError || availability === 'taken'
                      ? palette.danger
                      : availability === 'available'
                      ? palette.success
                      : inputBorder,
                },
              ]}
            >
              {/* @ prefix icon */}
              <IconAt size={18} color={c.textTertiary} strokeWidth={1.75} style={styles.atIcon} />

              <TextInput
                style={[styles.usernameInput, { color: c.textPrimary }]}
                placeholder={t('register.usernamePlaceholder')}
                placeholderTextColor={c.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                value={username}
                onChangeText={(v) => {
                  // Normalise to lowercase as the user types
                  setUsername(v.toLowerCase());
                }}
                onBlur={() => setUsernameTouched(true)}
                accessibilityLabel={t('register.usernameA11y')}
              />

              {/* Availability indicator */}
              <View style={styles.availabilityIcon}>
                {availability === 'checking' && (
                  <ActivityIndicator size="small" color={c.textTertiary} />
                )}
                {availability === 'available' && !usernameFormatError && (
                  <IconCheck size={18} color={palette.success} strokeWidth={2.5} />
                )}
                {availability === 'taken' && (
                  <IconAlertCircle size={18} color={palette.danger} strokeWidth={2} />
                )}
              </View>
            </View>

            {/* Inline status messages */}
            {usernameFormatError && usernameTouched ? (
              <Text style={[styles.errorText, { color: palette.danger }]}>
                {t(usernameFormatError)}
              </Text>
            ) : availability === 'taken' ? (
              <Text style={[styles.errorText, { color: palette.danger }]}>
                {t('register.usernameTaken')}
              </Text>
            ) : availability === 'available' && !usernameFormatError ? (
              <Text style={[styles.statusText, { color: palette.success }]}>
                {t('register.usernameAvailable')}
              </Text>
            ) : availability === 'error' ? (
              <Text style={[styles.errorText, { color: palette.warning }]}>
                {t('register.usernameCheckError')}
              </Text>
            ) : null}
          </View>

          {/* ── Terms & Privacy checkbox ──────────────────────────────────── */}
          <View style={styles.fieldWrap}>
            <TouchableOpacity
              style={styles.termsRow}
              onPress={() => {
                setTermsAccepted((v) => !v);
                setTermsTouched(true);
              }}
              activeOpacity={0.75}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
              accessibilityLabel={t('register.termsA11y')}
            >
              {/* Checkbox */}
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: termsError
                      ? palette.danger
                      : termsAccepted
                      ? palette.brand
                      : LOCAL_COLORS.checkboxBorder,
                    backgroundColor: termsAccepted ? palette.brand : 'transparent',
                  },
                ]}
              >
                {termsAccepted && (
                  <IconCheck size={14} color={LOCAL_COLORS.onBrand} strokeWidth={2.5} />
                )}
              </View>

              {/* Label with tappable links */}
              <View style={styles.termsTextWrap}>
                <Text style={[styles.termsText, { color: c.textSecondary }]}>
                  {t('register.termsAgree')}
                </Text>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    void openTerms();
                  }}
                  hitSlop={6}
                >
                  <Text style={[styles.termsLink, { color: palette.brand }]}>
                    {t('register.termsOfService')}
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.termsText, { color: c.textSecondary }]}>
                  {t('register.termsAnd')}
                </Text>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    void openPrivacy();
                  }}
                  hitSlop={6}
                >
                  <Text style={[styles.termsLink, { color: palette.brand }]}>
                    {t('register.privacyPolicy')}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
            {termsError ? (
              <Text style={[styles.errorText, { color: palette.danger }]}>
                {termsError}
              </Text>
            ) : null}
          </View>

          {/* ── Create account button ─────────────────────────────────────── */}
          <TouchableOpacity
            style={[
              styles.createButton,
              {
                backgroundColor: palette.brand,
                opacity: submitting ? 0.7 : 1,
              },
            ]}
            onPress={() => { void handleCreateAccount(); }}
            activeOpacity={0.85}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel={t('register.createA11y')}
          >
            {submitting ? (
              <ActivityIndicator color={LOCAL_COLORS.onBrand} />
            ) : (
              <Text style={styles.createButtonText}>
                {t('register.createButton')}
              </Text>
            )}
          </TouchableOpacity>

          {/* ── Back link ─────────────────────────────────────────────────── */}
          <TouchableOpacity
            style={styles.backRow}
            onPress={() => navigation.goBack()}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={t('register.backA11y')}
          >
            <Text style={[styles.backText, { color: c.textTertiary }]}>
              {t('register.back')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles — no hardcoded hex except in LOCAL_COLORS above
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 48,
  },

  // ── Progress dots ──────────────────────────────────────────────────────────
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 28,
  },
  dot: {
    height: 6,
    width: 6,
    borderRadius: 3,
  },

  // ── Title ──────────────────────────────────────────────────────────────────
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 28,
  },

  // ── Shared field wrapper ───────────────────────────────────────────────────
  fieldWrap: { marginBottom: 18 },
  label: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },

  // ── Generic input / selector ───────────────────────────────────────────────
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorText: {
    fontSize: 15,
    flex: 1,
  },

  // ── iOS date picker inline ─────────────────────────────────────────────────
  iosPickerWrap: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: -12,
    marginBottom: 18,
  },
  iosDoneButton: {
    borderTopWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  iosDoneText: {
    fontSize: 16,
    fontWeight: '600',
  },

  // ── Language picker modal ──────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: LOCAL_COLORS.overlayBackdrop,
    justifyContent: 'center',
    alignItems: 'center',
  },
  languageSheet: {
    width: 260,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 12,
  },
  languageFlag: {
    fontSize: 22,
  },
  languageLabel: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },

  // ── @username field ────────────────────────────────────────────────────────
  usernameInputWrapper: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  atIcon: {
    // Keep the icon vertically centred; no extra margins needed — gap handles spacing
  },
  usernameInput: {
    flex: 1,
    height: '100%',
    fontSize: 15,
  },
  availabilityIcon: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Inline feedback text ───────────────────────────────────────────────────
  errorText: {
    fontSize: 12,
    marginTop: 4,
    marginLeft: 2,
  },
  statusText: {
    fontSize: 12,
    marginTop: 4,
    marginLeft: 2,
  },

  // ── Terms checkbox row ─────────────────────────────────────────────────────
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,       // align with first text line
    flexShrink: 0,
  },
  termsTextWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  termsText: {
    fontSize: 13,
    lineHeight: 20,
  },
  termsLink: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  // ── Create account button ──────────────────────────────────────────────────
  createButton: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  createButtonText: {
    color: LOCAL_COLORS.onBrand,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.1,
  },

  // ── Back link ──────────────────────────────────────────────────────────────
  backRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  backText: {
    fontSize: 14,
  },
});
