/**
 * JChat 3.0 — Register Step 1 Screen (Task 1.4)
 *
 * Collects: Full name, Email, Password, Confirm Password.
 * Validates locally, then hands data off to RegisterStep2 via navigation params.
 * No Supabase writes here — that happens in Step 2 (Task 1.5).
 *
 * Design ("boleto", same look as the login — option B, form first):
 *  • TicketShell: night photo + paper ticket, ES · EN pill, back button
 *  • Step indicator "1 of 2", title in the login's display font
 *  • Form fields with inline validation errors and the password rules
 *  • "Continue" button → leaked-password check → navigate to RegisterStep2
 *  • Perforation, then the social signup row: Apple | Google
 *  • "Already have an account? Log in" link
 * Fixed artwork: it does not follow light/dark mode (theme/ticket.ts).
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { hasActiveAgeRejection } from '../../services/ageRejection';
import type { RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { IconArrowLeft, IconCheck, IconCircle, IconEye, IconEyeOff } from '@tabler/icons-react-native';

import { ticket } from '../../theme/ticket';
import { useLoginFonts } from '../../theme/loginFonts';
import { controlMinHeight, fieldLabelGap, sectionGap, space } from '../../theme/spacing';
import AppText from '../../components/common/AppText';
import FormField from '../../components/common/FormField';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { toUserMessage } from '../../utils/errors';
import { passwordRules, isPasswordValid } from '../../utils/password';
import { checkPwnedPassword, type PwnedResult } from '../../services/pwned';
import { Spinner } from '../../components/common/Spinner';
import type { AuthStackParamList } from '../../navigation/AppNavigator';
import { showAlert } from '../../utils/dialog';
import { readAuthCode } from '../../utils/authUrl';
import { AppleAuthSlot } from '../../components/auth/AppleAuthSlot';
import { TicketPlaceholder, TicketShell } from '../../components/auth/TicketShell';
import { TicketHeader } from '../../components/auth/TicketHeader';
import { EntryVenueCard } from '../../components/auth/EntryVenueCard';
import { TicketPerforation } from '../../components/auth/TicketPerforation';
import { TicketTitle } from '../../components/auth/TicketReveal';
import { TicketStep } from '../../components/auth/TicketStep';

type RegisterStep1Nav = NativeStackNavigationProp<AuthStackParamList, 'RegisterStep1'>;
type RegisterStep1Route = RouteProp<AuthStackParamList, 'RegisterStep1'>;

/** A shorter photo than the login: this ticket carries a whole form. */
const PHOTO_FRACTION = 0.22;

/** The ticket's own palette for FormField (fixed artwork, same in light and dark). */
const fieldPalette = {
  label: ticket.ticketInkMuted,
  text: ticket.ticketInk,
  placeholder: ticket.ticketInkMuted,
  background: ticket.ticketField,
  border: ticket.ticketFieldBorder,
  error: ticket.ticketError,
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validators return i18n keys (resolved with t() at render) so they can stay at
// module scope. Keys map to the `auth` namespace's `validation.*` block.
type ValidationErrorKey =
  | 'validation.nameRequired'
  | 'validation.emailRequired'
  | 'validation.emailInvalid'
  | 'validation.passwordRequired'
  | 'validation.passwordWeak'
  | 'validation.passwordLeaked'
  | 'validation.confirmRequired'
  | 'validation.passwordsMismatch';

function validateName(v: string): ValidationErrorKey | null {
  if (!v.trim()) return 'validation.nameRequired';
  return null;
}

function validateEmail(v: string): ValidationErrorKey | null {
  if (!v.trim()) return 'validation.emailRequired';
  if (!EMAIL_REGEX.test(v.trim())) return 'validation.emailInvalid';
  return null;
}

function validatePassword(v: string): ValidationErrorKey | null {
  if (!v) return 'validation.passwordRequired';
  if (!isPasswordValid(v)) return 'validation.passwordWeak';
  return null;
}

function validateConfirmPassword(password: string, confirm: string): ValidationErrorKey | null {
  if (!confirm) return 'validation.confirmRequired';
  if (password !== confirm) return 'validation.passwordsMismatch';
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function RegisterStep1Screen() {
  const navigation = useNavigation<RegisterStep1Nav>();
  const route = useRoute<RegisterStep1Route>();
  const { t } = useTranslation('auth');
  const fontsReady = useLoginFonts();

  // B2-13: after an age rejection this device can not reopen the sign-up for 24 h (the form is left and the same neutral dialog shows).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void hasActiveAgeRejection().then((blocked) => {
        if (!blocked || cancelled) return;
        showAlert(t('register.alerts.ageTitle'), t('register.alerts.ageMessage'));
        if (navigation.canGoBack()) navigation.goBack();
      });
      return () => {
        cancelled = true;
      };
    }, [navigation, t]),
  );

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password visibility toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Inline error state — only shown after user has touched a field or tapped Continue
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    password: false,
    confirmPassword: false,
  });

  // Password rules list (shown once the field has focus or text), the leaked-password check and its cache.
  const passwordInputRef = useRef<TextInput>(null);
  const passwordValueRef = useRef('');
  passwordValueRef.current = password;
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [checking, setChecking] = useState(false);
  const [leakedPassword, setLeakedPassword] = useState<string | null>(null); // the password found in a breach
  const pwnedCache = useRef(new Map<string, PwnedResult>());
  const rules = passwordRules(password);

  // Derived errors
  const errors = {
    name:            touched.name            ? validateName(name)                             : null,
    email:           touched.email           ? validateEmail(email)                           : null,
    password:        touched.password
      ? validatePassword(password) ?? (leakedPassword !== null && leakedPassword === password ? 'validation.passwordLeaked' : null)
      : null,
    confirmPassword: touched.confirmPassword ? validateConfirmPassword(password, confirmPassword) : null,
  };

  // Continue stays off until every field passes its validator (errors above only show once touched).
  const formInvalid = !!(
    validateName(name) || validateEmail(email) || validatePassword(password) || validateConfirmPassword(password, confirmPassword)
  );

  const markTouched = useCallback((field: keyof typeof touched) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  // Step 2 sends us back with { passwordError: 'leaked' } when Supabase rejects the password at sign-up.
  const passwordErrorParam = route.params?.passwordError;
  useEffect(() => {
    if (passwordErrorParam !== 'leaked') return;
    const leaked = passwordValueRef.current;
    pwnedCache.current.set(leaked, 'leaked');
    setLeakedPassword(leaked);
    setTouched((prev) => ({ ...prev, password: true }));
    passwordInputRef.current?.focus();
  }, [route.params, passwordErrorParam]);

  // ---------------------------------------------------------------------------
  // Social OAuth
  // ---------------------------------------------------------------------------
  const handleOAuth = useCallback(async (provider: 'google' | 'apple') => {
    if (!isSupabaseConfigured) {
      showAlert(t('register.alerts.demoModeTitle'), t('register.alerts.demoModeMessage'));
      return;
    }
    const redirectTo = Linking.createURL('auth/callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) {
      showAlert(t('register.alerts.signUpFailedTitle'), toUserMessage(error, 'auth:register.alerts.unexpectedError'));
      return;
    }
    if (!data?.url) return;
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) return;
    // PKCE: `?code=…` only; tokens in a URL are never accepted (utils/authUrl.ts).
    const code = readAuthCode(result.url);
    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) showAlert(t('register.alerts.signUpFailedTitle'), toUserMessage(exchangeError, 'auth:register.alerts.unexpectedError'));
      return;
    }
    // The provider's text is raw and English-only: show the translated generic message.
    showAlert(t('register.alerts.signUpFailedTitle'), t('register.alerts.unexpectedError'));
  }, [t]);

  const handleGoogleSignUp = useCallback(() => handleOAuth('google'), [handleOAuth]);
  const handleAppleSignUp  = useCallback(() => handleOAuth('apple'),  [handleOAuth]);


  // ---------------------------------------------------------------------------
  // Continue — validate all fields, navigate if clean
  // ---------------------------------------------------------------------------
  const handleContinue = useCallback(async () => {
    if (checking) return;

    // Mark all as touched to reveal any remaining errors
    const allTouched = { name: true, email: true, password: true, confirmPassword: true };
    setTouched(allTouched);

    const nameErr     = validateName(name);
    const emailErr    = validateEmail(email);
    const passwordErr = validatePassword(password);
    const confirmErr  = validateConfirmPassword(password, confirmPassword);

    if (nameErr || emailErr || passwordErr || confirmErr) return;

    // Leaked-password check (Have I Been Pwned: only 5 chars of the hash leave the phone). 'unknown' lets it through:
    // Supabase checks again at sign-up. The last answer per password is cached so a retry does not ask twice.
    let result = pwnedCache.current.get(password);
    if (!result) {
      setChecking(true);
      try {
        result = await checkPwnedPassword(password);
      } finally {
        setChecking(false);
      }
      pwnedCache.current.set(password, result);
    }
    if (result === 'leaked') {
      setLeakedPassword(password);
      passwordInputRef.current?.focus();
      return;
    }

    navigation.navigate('RegisterStep2', {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
    });
  }, [checking, name, email, password, confirmPassword, navigation]);

  if (!fontsReady) return <TicketPlaceholder photoFraction={PHOTO_FRACTION} />;

  const backButton = (
    <Pressable
      onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Login'))}
      style={styles.back}
      accessibilityRole="button"
      accessibilityLabel={t('ticket.back')}
    >
      <IconArrowLeft size={22} color={ticket.ticketPillText} strokeWidth={2} />
    </Pressable>
  );

  return (
    <TicketShell photoFraction={PHOTO_FRACTION} overlap={44} leftSlot={backButton}>
      <TicketHeader />
      <EntryVenueCard variant="ticket" />
      <TicketStep step={1} />
      <TicketTitle text={t('register.step1Title')} />
      <AppText variant="body" family="text" color={ticket.ticketInkMuted} style={styles.subtitle}>
        {t('register.step1Subtitle')}
      </AppText>

      {/* ── Form ───────────────────────────────────────────────────── */}

      {/* Full name */}
      <FormField
        first
        label={t('register.nameLabel')}
        palette={fieldPalette}
        labelFamily="mono"
        textFamily="text"
        placeholder={t('register.namePlaceholder')}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="next"
        value={name}
        onChangeText={setName}
        onBlur={() => markTouched('name')}
        accessibilityLabel={t('register.nameA11y')}
        error={errors.name ? t(errors.name) : null}
      />

      {/* Email */}
      <FormField
        label={t('register.emailLabel')}
        palette={fieldPalette}
        labelFamily="mono"
        textFamily="text"
        placeholder={t('register.emailPlaceholder')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        value={email}
        onChangeText={setEmail}
        onBlur={() => markTouched('email')}
        accessibilityLabel={t('register.emailA11y')}
        error={errors.email ? t(errors.email) : null}
      />

      {/* Password */}
      <FormField
        ref={passwordInputRef}
        label={t('register.passwordLabel')}
        palette={fieldPalette}
        labelFamily="mono"
        textFamily="text"
        placeholder={t('register.passwordPlaceholder')}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="newPassword"
        autoComplete="new-password"
        passwordRules="minlength: 8; required: lower; required: digit;"
        returnKeyType="next"
        value={password}
        onChangeText={setPassword}
        onFocus={() => setPasswordFocused(true)}
        onBlur={() => {
          setPasswordFocused(false);
          markTouched('password');
        }}
        accessibilityLabel={t('register.passwordA11y')}
        error={errors.password ? t(errors.password) : null}
        right={
          <Pressable
            style={styles.eye}
            onPress={() => setShowPassword((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? t('register.hidePassword') : t('register.showPassword')}
            hitSlop={8}
          >
            {showPassword ? (
              <IconEyeOff size={20} color={ticket.ticketInkMuted} strokeWidth={1.75} />
            ) : (
              <IconEye size={20} color={ticket.ticketInkMuted} strokeWidth={1.75} />
            )}
          </Pressable>
        }
      />
      {passwordFocused || password.length > 0 ? (
        <View style={styles.rulesList}>
          {([
            ['ruleMinLength', rules.minLength],
            ['ruleLetter', rules.hasLetter],
            ['ruleNumber', rules.hasNumber],
          ] as const).map(([key, met]) => {
            const label = t(`validation.${key}`);
            return (
              <View
                key={key}
                style={styles.ruleRow}
                accessible
                accessibilityLabel={`${label}, ${t(met ? 'validation.ruleMet' : 'validation.rulePending')}`}
              >
                {met ? (
                  <IconCheck size={14} color={ticket.brandAccent} strokeWidth={2.5} />
                ) : (
                  <IconCircle size={14} color={ticket.ticketInkMuted} strokeWidth={1.75} />
                )}
                <AppText
                  variant="caption"
                  family={met ? 'textSemi' : 'text'}
                  color={met ? ticket.ticketInk : ticket.ticketInkMuted}
                >
                  {label}
                </AppText>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Confirm password */}
      <FormField
        label={t('register.confirmLabel')}
        palette={fieldPalette}
        labelFamily="mono"
        textFamily="text"
        placeholder={t('register.confirmPlaceholder')}
        secureTextEntry={!showConfirm}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="newPassword"
        autoComplete="new-password"
        passwordRules="minlength: 8; required: lower; required: digit;"
        returnKeyType="done"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        onBlur={() => markTouched('confirmPassword')}
        onSubmitEditing={handleContinue}
        accessibilityLabel={t('register.confirmA11y')}
        error={errors.confirmPassword ? t(errors.confirmPassword) : null}
        right={
          <Pressable
            style={styles.eye}
            onPress={() => setShowConfirm((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={showConfirm ? t('register.hideConfirm') : t('register.showConfirm')}
            hitSlop={8}
          >
            {showConfirm ? (
              <IconEyeOff size={20} color={ticket.ticketInkMuted} strokeWidth={1.75} />
            ) : (
              <IconEye size={20} color={ticket.ticketInkMuted} strokeWidth={1.75} />
            )}
          </Pressable>
        }
      />

      {/* ── Continue button ────────────────────────────────────────── */}
      <Pressable
        style={[styles.primary, formInvalid && styles.primaryDisabled]}
        onPress={handleContinue}
        disabled={formInvalid || checking}
        accessibilityRole="button"
        accessibilityLabel={t('register.continue')}
        accessibilityState={{ disabled: formInvalid || checking, busy: checking }}
      >
        {checking ? (
          <Spinner color={ticket.ticketButtonText} />
        ) : (
          <AppText variant="button" family="textXBold" color={ticket.ticketButtonText}>
            {t('register.continue')}
          </AppText>
        )}
      </Pressable>

      <TicketPerforation />

      {/* ── Social signup (after the form) ─────────────────────────── */}
      <AppText variant="label" family="mono" color={ticket.ticketInkMuted} style={styles.socialTitle}>
        {t('register.dividerSocial')}
      </AppText>
      <View style={styles.socialRow}>
        {/* iOS: the official native Apple button (guideline 4.8 + HIG); Android / web keep the text button. */}
        <AppleAuthSlot
          mode="signUp"
          surface="light" // the paper ticket is light in both themes
          style={styles.socialOfficial}
          cornerRadius={14}
          onError={(message) => showAlert(t('register.alerts.signUpFailedTitle'), message)}
          fallback={
            <Pressable
              onPress={handleAppleSignUp}
              style={styles.social}
              accessibilityRole="button"
              accessibilityLabel={t('register.appleA11y')}
            >
              <AppText variant="button" family="textBold" color={ticket.ticketInk}>
                {t('ticket.apple')}
              </AppText>
            </Pressable>
          }
        />
        <Pressable
          onPress={handleGoogleSignUp}
          style={styles.social}
          accessibilityRole="button"
          accessibilityLabel={t('register.googleA11y')}
        >
          <AppText variant="button" family="textBold" color={ticket.ticketInk}>
            {t('ticket.google')}
          </AppText>
        </Pressable>
      </View>

      {/* ── Already have an account ───────────────────────────────── */}
      <View style={styles.haveAccount}>
        <AppText variant="body" family="text" color={ticket.ticketInkMuted}>
          {t('register.haveAccount')}
        </AppText>
        <Pressable
          onPress={() => navigation.navigate('Login')}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          accessibilityRole="link"
          accessibilityLabel={t('register.login')}
        >
          <AppText variant="body" family="textBold" color={ticket.ticketButton}>
            {t('register.login')}
          </AppText>
        </Pressable>
      </View>
    </TicketShell>
  );
}

// ---------------------------------------------------------------------------
// Styles — ticket tokens only (theme/ticket.ts), no hex here
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ticket.ticketBackBg,
  },
  subtitle: { marginTop: space.sm, marginBottom: sectionGap },
  eye: { width: controlMinHeight, minHeight: controlMinHeight, alignItems: 'center', justifyContent: 'center' },
  rulesList: { marginTop: space.sm, gap: space.xs },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: fieldLabelGap },
  primary: {
    minHeight: 54,
    borderRadius: 14,
    marginTop: sectionGap,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ticket.ticketButton,
  },
  primaryDisabled: { opacity: 0.4 },
  socialTitle: { textAlign: 'center' },
  socialRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  social: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ticket.ticketFieldBorder,
    backgroundColor: ticket.ticketField,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Apple's official button: same row slot and height as the Google button.
  socialOfficial: { flex: 1, height: 50 },
  haveAccount: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, minHeight: 44, marginTop: space.sm },
});
