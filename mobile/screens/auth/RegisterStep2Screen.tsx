/**
 * JChat 3.0 — Register Step 2 Screen (Task 1.5)
 *
 * Collects: Date of birth, Language preference, @username, Terms acceptance.
 * Validates 18+ on submission, real-time debounced username availability check,
 * then calls supabase.auth.signUp and inserts the profile row into `users`.
 *
 * Design ("boleto", same look as the login):
 *  • TicketShell: night photo + paper ticket, ES · EN pill, back button
 *  • Step indicator "2 of 2" + title "Almost there!" + subtitle
 *  • Date of birth in three numeric boxes (TicketBirthDate / utils/birthDate.ts), 18+ checked on submit
 *  • Language selector (EN / ES)
 *  • @username field with real-time availability (debounced 300ms)
 *  • Terms + Privacy Policy checkbox (links via expo-web-browser)
 *  • "Create my account 🎉" button
 * Fixed artwork: it does not follow light/dark mode (theme/ticket.ts).
 *
 * Auth guard: supabase.auth.signUp → AuthContext session listener flips
 * isAuthenticated → AppNavigator switches to main tabs automatically.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Spinner } from '../../components/common/Spinner';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { IconAlertCircle, IconArrowLeft, IconAt, IconCheck } from '@tabler/icons-react-native';

import { ticket } from '../../theme/ticket';
import { loginFont, useLoginFonts } from '../../theme/loginFonts';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { toUserMessage } from '../../utils/errors';
import { useAuth } from '../../context/AuthContext';
import { confirmAge } from '../../services/age';
import { deleteMyAccount } from '../../services/account';
import { useCaptcha, captchaErrorI18nKeys } from '../../services/captcha';
import type { AuthStackParamList } from '../../navigation/AppNavigator';
import i18n, { changeAppLanguage, type SupportedLanguage } from '../../i18n';
import { showAlert } from '../../utils/dialog';
import { parseBirthDate, type DateParts } from '../../utils/birthDate';
import { TicketPlaceholder, TicketShell } from '../../components/auth/TicketShell';
import { TicketHeader } from '../../components/auth/TicketHeader';
import { TicketTitle } from '../../components/auth/TicketReveal';
import { TicketStep } from '../../components/auth/TicketStep';
import { TicketBirthDate } from '../../components/auth/TicketBirthDate';
import { peekPendingEntry } from '../../services/venueEntry';

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

/** A shorter photo than the login: this ticket carries a whole form. */
const PHOTO_FRACTION = 0.22;
const EMPTY_DATE: DateParts = { day: '', month: '', year: '' };

// ---------------------------------------------------------------------------
// Legal URL stubs
// ---------------------------------------------------------------------------
const TERMS_URL = 'https://jchat.cloud/terms';
const PRIVACY_URL = 'https://jchat.cloud/privacy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;

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
  const { t, i18n: appI18n } = useTranslation('auth');
  const fontsReady = useLoginFonts();
  // hCaptcha (D-38): token pedido en el submit; `CaptchaGate` se monta abajo.
  const { captchaEnabled, getCaptchaToken, CaptchaGate } = useCaptcha();
  const { holdAgeGate, refreshAge, signOut } = useAuth();
  const { name = '', email = '', password = '' } = route.params ?? {};

  // ── Date of birth ──────────────────────────────────────────────────────────
  // The three boxes start empty (no default date). `dob` is derived: null until they read as a real, past date.
  // The full date is only sent to rpc confirm_age (server stores the year only) — never persisted here.
  const [dobParts, setDobParts] = useState<DateParts>(EMPTY_DATE);
  const parsedDob = useMemo(() => parseBirthDate(dobParts), [dobParts]);
  const dob = parsedDob.ok ? parsedDob.date : null;
  const dobFilled = dobParts.day !== '' && dobParts.month !== '' && dobParts.year !== '';

  // ── Language selector ──────────────────────────────────────────────────────
  const [language, setLanguage] = useState<Language>(
    (i18n.language === 'es' ? 'es' : 'en') as Language,
  );
  // The ES · EN pill of the shell changes the app language: the selector (and the language saved in the profile)
  // follows it instead of staying on what it was when the screen opened.
  const appLanguage: Language = appI18n.language === 'es' ? 'es' : 'en';
  useEffect(() => {
    setLanguage(appLanguage);
  }, [appLanguage]);

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
  // Once the three boxes are filled: a date that does not exist / is in the future, or an 18+ failure.
  const dobError: string | null = (() => {
    if (!dobFilled) return null;
    if (!parsedDob.ok) {
      if (parsedDob.reason === 'future') return t('age.dateFuture');
      return parsedDob.reason === 'invalid' ? t('age.dateInvalid') : null;
    }
    return isAtLeast18(parsedDob.date) ? null : t('register.dobError');
  })();

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
    setUsernameTouched(true);
    setTermsTouched(true);

    // ── Client-side validation ────────────────────────────────────────────
    if (!dob) {
      showAlert(t('register.dobLabel'), t('register.dobPlaceholder'));
      return;
    }
    if (!isAtLeast18(dob)) {
      showAlert(
        t('register.alerts.ageTitle'),
        t('register.alerts.ageMessage'),
      );
      return;
    }

    const formatErr = validateUsername(username);
    if (formatErr) {
      showAlert(t('register.alerts.invalidUsernameTitle'), t(formatErr));
      return;
    }

    if (availability !== 'available') {
      if (availability === 'taken') {
        showAlert(t('register.alerts.usernameTakenTitle'), t('register.alerts.usernameTakenMessage'));
      } else if (availability === 'checking') {
        showAlert(t('register.alerts.pleaseWaitTitle'), t('register.alerts.pleaseWaitMessage'));
      } else {
        // idle or error — re-trigger a check
        showAlert(t('register.alerts.checkUsernameTitle'), t('register.alerts.checkUsernameMessage'));
      }
      return;
    }

    if (!termsAccepted) {
      showAlert(
        t('register.alerts.termsRequiredTitle'),
        t('register.alerts.termsRequiredMessage'),
      );
      return;
    }

    if (!email || !password) {
      showAlert(
        t('register.alerts.missingDataTitle'),
        t('register.alerts.missingDataMessage'),
      );
      return;
    }

    setSubmitting(true);

    try {
      // ── Guard: no real backend configured ────────────────────────────────
      if (!isSupabaseConfigured) {
        showAlert(
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
          showAlert(t(titleKey), t(messageKey));
          setSubmitting(false);
          return;
        }
        if (captchaToken === null) {
          // Usuario canceló: no llamar a Supabase sin token.
          showAlert(t('captcha.cancelledTitle'), t('captcha.cancelledMessage'));
          setSubmitting(false);
          return;
        }
      }

      // ── 1. Create auth user ───────────────────────────────────────────────
      // The profile choices also travel as user_metadata (`pending_profile`): when
      // email confirmation is ON, signUp returns no session, so the UPDATE below
      // can't run yet (RLS: authenticated only). AuthContext applies the pending
      // profile on the first authenticated session (after jchat://confirm).
      const pendingProfile = {
        username: username.trim().toLowerCase(),
        display_name: name.trim() || null,
        language,
      };
      // Keep the 18+ gate from flashing while we confirm the age we already asked for.
      holdAgeGate(true);
      const pendingEntry = (await peekPendingEntry()) ?? undefined;
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          captchaToken: captchaToken ?? undefined,
          emailRedirectTo: 'jchat://confirm',
          // pending_entry: the venue the user was entering (QR / link) travels in the account too, so confirming the e-mail and
          // signing in in ANOTHER browser still lands in the venue (applied on the first session, then cleared).
          data: { full_name: name.trim() || undefined, pending_profile: pendingProfile, pending_entry: pendingEntry },
        },
      });

      if (signUpError) {
        // Leaked / weak password (Supabase "Prevent use of leaked passwords"): back to step 1, which is still mounted
        // in the stack, so name and email are kept and the password field shows the error.
        const code = (signUpError as { code?: string }).code;
        if (code === 'weak_password' || /weak|leaked|pwned/i.test(signUpError.message ?? '')) {
          setSubmitting(false);
          navigation.navigate('RegisterStep1', { passwordError: 'leaked' });
          return;
        }
        showAlert(t('register.alerts.signUpFailedTitle'), toUserMessage(signUpError, 'auth:register.alerts.unexpectedError'));
        setSubmitting(false);
        return;
      }

      const userId = authData.user?.id;
      if (!userId) {
        showAlert(
          t('register.alerts.signUpErrorTitle'),
          t('register.alerts.signUpErrorMessage'),
        );
        setSubmitting(false);
        return;
      }

      // Email confirmation ON → no session yet. The profile is applied after the
      // user taps the link in the email (AuthContext, pending_profile).
      if (!authData.session) {
        setSubmitting(false);
        showAlert(
          t('register.alerts.checkEmailTitle'),
          t('register.alerts.checkEmailMessage', { email: email.trim().toLowerCase() }),
          [{ text: t('actions.ok', { ns: 'common' }), onPress: () => navigation.navigate('Login') }],
        );
        return;
      }

      // ── 1b. 18+ confirmation (server-side) ────────────────────────────────
      // The DOB asked in this form goes to rpc confirm_age right after the session
      // exists. Only the birth year is stored; the full date is never persisted.
      // If it fails (network), the age gate asks again — the account never enters
      // the app unconfirmed.
      if (dob) {
        const ageResult = await confirmAge(dob);
        if (ageResult === 'underage') {
          await deleteMyAccount();
          await signOut().catch(() => null);
          showAlert(t('register.alerts.ageTitle'), t('register.alerts.ageMessage'));
          setSubmitting(false);
          return;
        }
        if (ageResult === 'ok') await refreshAge();
      }

      // ── 2. Insert profile into `users` table ──────────────────────────────
      // The handle_new_auth_user trigger already created the row, with a username
      // DERIVED from the email — not the one the user chose in this form. Apply the
      // user's actual choices with an UPDATE. No `id` in the payload → respects the
      // users column allow-list (migr 066): id is in the WHERE, not the SET.
      const { error: profileError } = await supabase
        .from('users')
        .update({
          ...pendingProfile,
          profile_theme_id: 1, // default theme
        })
        .eq('id', userId);

      if (profileError) {
        // Surface it: a unique violation means the chosen username is taken — the
        // user must SEE that, not silently keep the email-derived fallback.
        console.warn('[RegisterStep2] profile update error:', profileError.message);
        // 23505 = the chosen username was taken in the meantime.
        showAlert(
          t('register.alerts.signUpErrorTitle'),
          profileError.code === '23505'
            ? t('register.usernameTaken')
            : toUserMessage(profileError, 'auth:register.alerts.unexpectedError'),
        );
        setSubmitting(false);
        return;
      }
      // Applied here directly (session present) — drop the pending copy.
      void supabase.auth.updateUser({ data: { pending_profile: null } });

      // The authenticated root navigator reads onboarding_completed and routes
      // this new session to Onboarding before the user enters the main tabs.
    } catch (err: unknown) {
      showAlert(t('register.alerts.errorTitle'), toUserMessage(err, 'auth:register.alerts.unexpectedError'));
      setSubmitting(false);
    } finally {
      holdAgeGate(false);
    }
  }, [holdAgeGate, refreshAge, signOut, dob, username, availability, termsAccepted, email, password, name, language, captchaEnabled, getCaptchaToken, t, navigation]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (!fontsReady) return <TicketPlaceholder photoFraction={PHOTO_FRACTION} />;

  const backButton = (
    <Pressable
      onPress={() => navigation.goBack()}
      style={styles.back}
      accessibilityRole="button"
      accessibilityLabel={t('register.backA11y')}
    >
      <IconArrowLeft size={22} color={ticket.ticketPillText} strokeWidth={2} />
    </Pressable>
  );

  const usernameBorder =
    usernameFormatError || availability === 'taken' ? ticket.ticketError : ticket.ticketFieldBorder;

  return (
    <TicketShell photoFraction={PHOTO_FRACTION} overlap={44} leftSlot={backButton}>
      {/* hCaptcha (D-38): invisible; renderiza null salvo cuando el reto está activo. */}
      {CaptchaGate}
      <TicketHeader />
      <TicketStep step={2} />
      <TicketTitle text={t('register.step2Title')} dot={false} />
      <Text style={styles.subtitle}>{t('register.step2Subtitle')}</Text>

      {/* ── Date of birth ─────────────────────────────────────────────── */}
      <TicketBirthDate parts={dobParts} onChangeParts={setDobParts} error={dobError} />

      {/* ── Language selector ─────────────────────────────────────────── */}
      <Text style={styles.fieldLabel}>{t('register.languageLabel')}</Text>
      <View style={styles.languageRow} role="radiogroup" accessibilityLabel={t('register.languageA11y')}>
        {LANGUAGE_OPTIONS.map((opt) => {
          const selected = opt.value === language;
          return (
            <Pressable
              key={opt.value}
              style={[styles.languageOption, selected && styles.languageOptionOn]}
              onPress={() => {
                setLanguage(opt.value);
                changeAppLanguage(opt.value as SupportedLanguage);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={opt.label}
            >
              <Text style={styles.languageFlag}>{opt.flag}</Text>
              <Text style={[styles.languageLabel, selected && styles.languageLabelOn]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── @username ─────────────────────────────────────────────────── */}
      <Text style={styles.fieldLabel}>{t('register.usernameLabel')}</Text>
      <View style={[styles.usernameWrapper, { borderColor: usernameBorder }]}>
        <IconAt size={18} color={ticket.ticketInkMuted} strokeWidth={1.75} />
        <TextInput
          style={styles.usernameInput}
          placeholder={t('register.usernamePlaceholder')}
          placeholderTextColor={ticket.ticketInkMuted}
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
          {availability === 'checking' && <Spinner size="small" color={ticket.ticketInkMuted} />}
          {availability === 'available' && !usernameFormatError && (
            <IconCheck size={18} color={ticket.brandAccent} strokeWidth={2.5} />
          )}
          {availability === 'taken' && <IconAlertCircle size={18} color={ticket.ticketError} strokeWidth={2} />}
        </View>
      </View>
      {/* Inline status messages */}
      {usernameFormatError && usernameTouched ? (
        <Text style={styles.errorText}>{t(usernameFormatError)}</Text>
      ) : availability === 'taken' ? (
        <Text style={styles.errorText}>{t('register.usernameTaken')}</Text>
      ) : availability === 'available' && !usernameFormatError ? (
        <Text style={styles.statusText}>{t('register.usernameAvailable')}</Text>
      ) : availability === 'error' ? (
        <Text style={styles.mutedText}>{t('register.usernameCheckError')}</Text>
      ) : null}

      {/* ── Terms & Privacy checkbox ──────────────────────────────────── */}
      <Pressable
        style={styles.termsRow}
        onPress={() => {
          setTermsAccepted((v) => !v);
          setTermsTouched(true);
        }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: termsAccepted }}
        accessibilityLabel={t('register.termsA11y')}
      >
        <View
          style={[
            styles.checkbox,
            termsError ? styles.checkboxError : null,
            termsAccepted && styles.checkboxOn,
          ]}
        >
          {termsAccepted && <IconCheck size={14} color={ticket.ticketButtonText} strokeWidth={2.5} />}
        </View>
        {/* Label with tappable links */}
        <View style={styles.termsTextWrap}>
          <Text style={styles.termsText}>{t('register.termsAgree')}</Text>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              void openTerms();
            }}
            hitSlop={6}
          >
            <Text style={styles.termsLink}>{t('register.termsOfService')}</Text>
          </Pressable>
          <Text style={styles.termsText}>{t('register.termsAnd')}</Text>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              void openPrivacy();
            }}
            hitSlop={6}
          >
            <Text style={styles.termsLink}>{t('register.privacyPolicy')}</Text>
          </Pressable>
        </View>
      </Pressable>
      {termsError ? <Text style={styles.errorText}>{termsError}</Text> : null}

      {/* ── Create account button ─────────────────────────────────────── */}
      <Pressable
        style={[styles.primary, submitting && styles.primaryBusy]}
        onPress={() => { void handleCreateAccount(); }}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityState={{ disabled: submitting, busy: submitting }}
        accessibilityLabel={t('register.createA11y')}
      >
        {submitting ? (
          <Spinner color={ticket.ticketButtonText} />
        ) : (
          <Text style={styles.primaryText}>{t('register.createButton')}</Text>
        )}
      </Pressable>
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
  subtitle: {
    marginTop: 8,
    marginBottom: 4,
    fontFamily: loginFont.text,
    fontSize: 15,
    lineHeight: 22,
    color: ticket.ticketInkMuted,
  },
  fieldLabel: {
    marginTop: 18,
    marginBottom: 6,
    fontFamily: loginFont.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: ticket.ticketInkMuted,
  },

  // ── Language selector ──────────────────────────────────────────────────────
  languageRow: { flexDirection: 'row', gap: 10 },
  languageOption: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ticket.ticketFieldBorder,
    backgroundColor: ticket.ticketField,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  languageOptionOn: { borderColor: ticket.ticketButton, borderWidth: 2 },
  languageFlag: { fontSize: 18 },
  languageLabel: { fontFamily: loginFont.text, fontSize: 15, color: ticket.ticketInkMuted },
  languageLabelOn: { fontFamily: loginFont.textBold, color: ticket.ticketInk },

  // ── @username field ────────────────────────────────────────────────────────
  usernameWrapper: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: ticket.ticketField,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  usernameInput: {
    flex: 1,
    height: '100%',
    fontFamily: loginFont.text,
    fontSize: 16,
    color: ticket.ticketInk,
  },
  availabilityIcon: { width: 24, alignItems: 'center', justifyContent: 'center' },

  // ── Inline feedback text ───────────────────────────────────────────────────
  errorText: { marginTop: 6, fontFamily: loginFont.text, fontSize: 12, color: ticket.ticketError },
  statusText: { marginTop: 6, fontFamily: loginFont.textSemi, fontSize: 12, color: ticket.ticketInk },
  mutedText: { marginTop: 6, fontFamily: loginFont.text, fontSize: 12, color: ticket.ticketInkMuted },

  // ── Terms checkbox row ─────────────────────────────────────────────────────
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 20, minHeight: 44 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: ticket.ticketFieldBorder,
    backgroundColor: ticket.ticketField,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxOn: { borderColor: ticket.ticketButton, backgroundColor: ticket.ticketButton },
  checkboxError: { borderColor: ticket.ticketError },
  termsTextWrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  termsText: { fontFamily: loginFont.text, fontSize: 13, lineHeight: 22, color: ticket.ticketInkMuted },
  termsLink: {
    fontFamily: loginFont.textBold,
    fontSize: 13,
    lineHeight: 22,
    color: ticket.ticketButton,
    textDecorationLine: 'underline',
  },

  // ── Create account button ──────────────────────────────────────────────────
  primary: {
    height: 54,
    borderRadius: 14,
    marginTop: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ticket.ticketButton,
  },
  primaryBusy: { opacity: 0.7 },
  primaryText: { fontFamily: loginFont.textXBold, fontSize: 16, color: ticket.ticketButtonText },
});
