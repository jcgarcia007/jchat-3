/**
 * JChat 3.0 — Login Screen (Task 1.3)
 * Biometric (Face ID / Touch ID) primary, social (Google / Apple) secondary,
 * email + password form, forgot password stub, sign-up link.
 */

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  IconBrandApple,
  IconBrandGoogle,
  IconEye,
  IconEyeOff,
  IconFaceId,
} from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { isBiometricEnabled } from '../../services/biometric';
import { useCaptcha, captchaErrorI18nKeys } from '../../services/captcha';
import type { AuthStackParamList } from '../../navigation/AppNavigator';

// ---------------------------------------------------------------------------
// Screen-local brand gradient hexes (login header background).
// All surface / text colors come from useThemeColors() / palette.
// ---------------------------------------------------------------------------
const LOGIN_COLORS = {
  gradientCardTop: '#0d1235',   // top of biometric card (dark)
  ghostBorder:     '#2a2a3e',   // social button border on dark
  onBrand:         '#ffffff',   // text / icon on brand-filled surface
} as const;

type LoginNav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H_PAD = 24;
const BTN_RADIUS = 14;
const BTN_HEIGHT = 52;
const INPUT_HEIGHT = 52;

/**
 * Parse the `#key=value&…` fragment of the OAuth callback URL into a plain object.
 * Manual parse (no reliance on RN's partial URLSearchParams polyfill). Implicit
 * flow returns access_token / refresh_token (or error / error_description) here.
 */
function parseAuthFragment(url: string): Record<string, string> {
  const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const out: Record<string, string> = {};
  for (const pair of hash.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = eq >= 0 ? pair.slice(0, eq) : pair;
    const val = eq >= 0 ? pair.slice(eq + 1) : '';
    out[decodeURIComponent(key)] = decodeURIComponent(val);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function LoginScreen() {
  const c = useThemeColors();
  const navigation = useNavigation<LoginNav>();
  const { t } = useTranslation('auth');
  // hCaptcha (D-38): token pedido en el submit; `CaptchaGate` se monta abajo.
  const { captchaEnabled, getCaptchaToken, CaptchaGate } = useCaptcha();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Biometric login card is opt-in: only shown once the user enabled the lock (M2).
  const [biometricButtonVisible, setBiometricButtonVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void isBiometricEnabled().then((enabled) => {
      if (!cancelled) setBiometricButtonVisible(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Biometric ─────────────────────────────────────────────────────────────
  async function handleBiometric() {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      Alert.alert(t('login.alerts.notSupportedTitle'), t('login.alerts.notSupportedMessage'));
      return;
    }
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) {
      Alert.alert(
        t('login.alerts.noBiometricsTitle'),
        t('login.alerts.noBiometricsMessage'),
      );
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: t('login.biometricPrompt'),
      fallbackLabel: t('login.biometricFallback'),
    });
    if (result.success) {
      // The real cold-start biometric gate lives in LockScreen (M2); this button
      // only matters for the rare case of an already-authenticated user viewing
      // the login screen. If a session exists, AuthContext has already routed
      // into the app — nothing to do. If not, there is no session to unlock, so
      // direct the user to sign in with email.
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        Alert.alert(
          t('login.alerts.biometricVerifiedTitle'),
          t('login.alerts.biometricVerifiedMessage'),
        );
      }
    } else if (result.error !== 'user_cancel' && result.error !== 'system_cancel') {
      Alert.alert(t('login.alerts.authFailedTitle'), t('login.alerts.authFailedMessage'));
    }
  }

  // ── Social OAuth (deep-link, M1) ───────────────────────────────────────────
  // signInWithOAuth({ redirectTo: jchat://auth/callback, skipBrowserRedirect })
  //   → openAuthSessionAsync abre el browser y captura el redirect de vuelta
  //   → implicit flow: tokens en el fragment (#access_token=…&refresh_token=…) → setSession
  //   → PKCE flow: ?code=… → exchangeCodeForSession
  //   → AuthContext.onAuthStateChange entra a la app.
  async function handleOAuth(provider: 'google' | 'apple') {
    if (!isSupabaseConfigured) {
      Alert.alert(t('login.alerts.notConfiguredTitle'), t('login.alerts.notConfiguredMessage'));
      return;
    }

    // Deep-link de retorno; debe coincidir con la Redirect URL registrada en Supabase.
    const redirectTo = Linking.createURL('auth/callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      // skipBrowserRedirect: abrimos data.url nosotros con openAuthSessionAsync para
      // capturar el retorno y cerrar el flujo dentro de la app.
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) {
      Alert.alert(t('login.alerts.signInErrorTitle'), error.message);
      return;
    }
    if (!data?.url) return;

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    // 'cancel' / 'dismiss' → el usuario cerró el navegador; sin error que reportar.
    if (result.type !== 'success' || !result.url) return;

    const returnedUrl = result.url;

    // Caso 1 — implicit flow: access_token + refresh_token en el fragment.
    const fragment = parseAuthFragment(returnedUrl);
    if (fragment.access_token && fragment.refresh_token) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: fragment.access_token,
        refresh_token: fragment.refresh_token,
      });
      if (sessionError) {
        Alert.alert(t('login.alerts.signInErrorTitle'), sessionError.message);
      }
      // Éxito: onAuthStateChange en AuthContext dispara y la app entra.
      return;
    }

    // Caso 2 — PKCE flow: ?code=… en los query params. Linking.parse maneja el scheme
    // custom jchat:// de forma fiable (new URL no parsea bien esquemas no estándar en RN).
    const code = Linking.parse(returnedUrl).queryParams?.code;
    if (typeof code === 'string' && code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        Alert.alert(t('login.alerts.signInErrorTitle'), exchangeError.message);
      }
      return;
    }

    // Ni token ni code: mostrar el error del provider si vino, o un fallback genérico.
    const errDesc = fragment.error_description ?? fragment.error;
    Alert.alert(
      t('login.alerts.signInErrorTitle'),
      errDesc ?? t('login.alerts.signInErrorMessage'),
    );
  }

  // ── Email / password ──────────────────────────────────────────────────────
  async function handleSignIn() {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      Alert.alert(t('login.alerts.missingFieldsTitle'), t('login.alerts.missingFieldsMessage'));
      return;
    }
    if (!isSupabaseConfigured) {
      Alert.alert(t('login.alerts.notConfiguredTitle'), t('login.alerts.notConfiguredMessage'));
      return;
    }

    setLoading(true);

    // hCaptcha (D-38): obtener token JUSTO antes del intento (uso único, expira).
    // Kill-switch (sin sitekey): captchaEnabled=false → se procede sin token.
    let captchaToken: string | null = null;
    if (captchaEnabled) {
      try {
        captchaToken = await getCaptchaToken();
      } catch (err) {
        // Expiración / timeout / red / no disponible / ocupado: mensaje según el código.
        setLoading(false);
        const { titleKey, messageKey } = captchaErrorI18nKeys(err);
        Alert.alert(t(titleKey), t(messageKey));
        return;
      }
      if (captchaToken === null) {
        // Usuario canceló: no llamar a Supabase sin token (con el captcha activado
        // fallaría con "captcha verification failed").
        setLoading(false);
        Alert.alert(t('captcha.cancelledTitle'), t('captcha.cancelledMessage'));
        return;
      }
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: trimmedPassword,
      options: { captchaToken: captchaToken ?? undefined },
    });
    setLoading(false);

    if (error) {
      // AuthContext session listener handles successful sign-in automatically.
      // Tras cualquier intento el token queda quemado: el próximo pide uno nuevo.
      Alert.alert(t('login.alerts.signInFailedTitle'), error.message);
    }
    // On success: AuthContext onAuthStateChange fires → isAuthenticated flips →
    // AppNavigator switches to MainStack. No explicit navigation call needed.
  }

  // ── Forgot password ───────────────────────────────────────────────────────
  function handleForgotPassword() {
    // TODO: password reset flow — navigate to a ForgotPasswordScreen that calls
    // supabase.auth.resetPasswordForEmail(email, { redirectTo: 'jchat://reset' })
    Alert.alert(t('login.alerts.comingSoonTitle'), t('login.alerts.passwordResetMessage'));
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: c.bgBase }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" />
      {/* hCaptcha (D-38): invisible; renderiza null salvo cuando el reto está activo. */}
      {CaptchaGate}
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: c.textPrimary }]}>{t('login.title')}</Text>
          <Text style={[styles.headerSub, { color: c.textSecondary }]}>
            {t('login.subtitle')}
          </Text>
        </View>

        {/* ── Biometric card (primary) — opt-in, only when the lock is enabled ── */}
        {biometricButtonVisible && (
          <TouchableOpacity
            style={[styles.biometricCard, { backgroundColor: palette.brand }]}
            onPress={handleBiometric}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('login.biometricA11y')}
          >
            <IconFaceId size={36} color={LOGIN_COLORS.onBrand} strokeWidth={1.5} />
            <View style={styles.biometricText}>
              <Text style={styles.biometricTitle}>{t('login.biometricTitle')}</Text>
              <Text style={styles.biometricSub}>{t('login.biometricSub')}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Social buttons ──────────────────────────────────────────────── */}
        <View style={styles.socialRow}>
          <TouchableOpacity
            style={[
              styles.socialBtn,
              { backgroundColor: c.bgSurface, borderColor: c.borderSubtle },
            ]}
            onPress={() => handleOAuth('google')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('login.googleA11y')}
          >
            <IconBrandGoogle size={22} color={c.textPrimary} strokeWidth={1.5} />
            <Text style={[styles.socialBtnText, { color: c.textPrimary }]}>{t('login.google')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.socialBtn,
              { backgroundColor: c.bgSurface, borderColor: c.borderSubtle },
            ]}
            onPress={() => handleOAuth('apple')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('login.appleA11y')}
          >
            <IconBrandApple size={22} color={c.textPrimary} strokeWidth={1.5} />
            <Text style={[styles.socialBtnText, { color: c.textPrimary }]}>{t('login.apple')}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Divider ─────────────────────────────────────────────────────── */}
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: c.borderSubtle }]} />
          <Text style={[styles.dividerLabel, { color: c.textTertiary }]}>
            {t('login.divider')}
          </Text>
          <View style={[styles.dividerLine, { backgroundColor: c.borderSubtle }]} />
        </View>

        {/* ── Email input ─────────────────────────────────────────────────── */}
        <View style={[styles.inputWrap, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
          <TextInput
            style={[styles.input, { color: c.textPrimary }]}
            value={email}
            onChangeText={setEmail}
            placeholder={t('login.emailPlaceholder')}
            placeholderTextColor={c.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            accessibilityLabel={t('login.emailA11y')}
          />
        </View>

        {/* ── Password input ──────────────────────────────────────────────── */}
        <View
          style={[
            styles.inputWrap,
            styles.inputRow,
            { backgroundColor: c.bgSurface, borderColor: c.borderSubtle },
          ]}
        >
          <TextInput
            style={[styles.input, styles.inputFlex, { color: c.textPrimary }]}
            value={password}
            onChangeText={setPassword}
            placeholder={t('login.passwordPlaceholder')}
            placeholderTextColor={c.textTertiary}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={handleSignIn}
            accessibilityLabel={t('login.passwordA11y')}
          />
          <TouchableOpacity
            onPress={() => setShowPassword((v) => !v)}
            style={styles.eyeBtn}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? t('login.hidePassword') : t('login.showPassword')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {showPassword ? (
              <IconEyeOff size={20} color={c.textTertiary} strokeWidth={1.5} />
            ) : (
              <IconEye size={20} color={c.textTertiary} strokeWidth={1.5} />
            )}
          </TouchableOpacity>
        </View>

        {/* ── Forgot password ─────────────────────────────────────────────── */}
        <TouchableOpacity
          onPress={handleForgotPassword}
          style={styles.forgotWrap}
          accessibilityRole="button"
          accessibilityLabel={t('login.forgot')}
        >
          <Text style={[styles.forgotText, { color: palette.brand }]}>{t('login.forgot')}</Text>
        </TouchableOpacity>

        {/* ── Sign in button ──────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[
            styles.signInBtn,
            { backgroundColor: palette.brand },
            loading && styles.signInBtnDisabled,
          ]}
          onPress={handleSignIn}
          disabled={loading}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('login.signIn')}
        >
          <Text style={styles.signInBtnText}>{loading ? t('login.signingIn') : t('login.signIn')}</Text>
        </TouchableOpacity>

        {/* ── Sign up link ────────────────────────────────────────────────── */}
        <View style={styles.signUpRow}>
          <Text style={[styles.signUpLabel, { color: c.textSecondary }]}>
            {t('login.noAccount')}
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('RegisterStep1')}
            accessibilityRole="button"
            accessibilityLabel={t('login.signUp')}
          >
            <Text style={[styles.signUpLink, { color: palette.brand }]}>{t('login.signUp')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: H_PAD,
    paddingTop: Platform.OS === 'ios' ? 64 : 48,
    paddingBottom: 40,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    marginBottom: 32,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  headerSub: {
    fontSize: 15,
    fontWeight: '400',
  },

  // ── Biometric card ────────────────────────────────────────────────────────
  biometricCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BTN_RADIUS,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 16,
    // Shadow for depth
    shadowColor: palette.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  biometricText: {
    flex: 1,
  },
  biometricTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: LOGIN_COLORS.onBrand,
    marginBottom: 2,
  },
  biometricSub: {
    fontSize: 13,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.75)',
  },

  // ── Social buttons ────────────────────────────────────────────────────────
  socialRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: BTN_HEIGHT,
    borderRadius: BTN_RADIUS,
    borderWidth: 1,
    gap: 8,
  },
  socialBtnText: {
    fontSize: 15,
    fontWeight: '500',
  },

  // ── Divider ───────────────────────────────────────────────────────────────
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerLabel: {
    fontSize: 13,
    fontWeight: '400',
  },

  // ── Inputs ────────────────────────────────────────────────────────────────
  inputWrap: {
    height: INPUT_HEIGHT,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 12,
    justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    fontSize: 15,
    fontWeight: '400',
  },
  inputFlex: {
    flex: 1,
  },
  eyeBtn: {
    paddingLeft: 8,
  },

  // ── Forgot password ───────────────────────────────────────────────────────
  forgotWrap: {
    alignSelf: 'flex-end',
    marginBottom: 20,
    paddingVertical: 2,
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // ── Sign in button ────────────────────────────────────────────────────────
  signInBtn: {
    height: BTN_HEIGHT,
    borderRadius: BTN_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    width: '100%',
  },
  signInBtnDisabled: {
    opacity: 0.65,
  },
  signInBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: LOGIN_COLORS.onBrand,
    letterSpacing: 0.1,
  },

  // ── Sign up link ──────────────────────────────────────────────────────────
  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signUpLabel: {
    fontSize: 14,
  },
  signUpLink: {
    fontSize: 14,
    fontWeight: '600',
  },
});
