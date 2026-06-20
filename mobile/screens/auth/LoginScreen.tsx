/**
 * JChat 3.0 — Login Screen (Task 1.3)
 * Biometric (Face ID / Touch ID) primary, social (Google / Apple) secondary,
 * email + password form, forgot password stub, sign-up link.
 */

import React, { useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
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
import type { AuthStackParamList } from '../../navigation/AppNavigator';

// ---------------------------------------------------------------------------
// Screen-local brand gradient hexes (login header background).
// All surface / text colors come from useThemeColors() / palette. // TODO(i18n)
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function LoginScreen() {
  const c = useThemeColors();
  const navigation = useNavigation<LoginNav>();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Biometric ─────────────────────────────────────────────────────────────
  async function handleBiometric() {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      Alert.alert('Not supported', 'This device does not support biometric authentication.');
      return;
    }
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) {
      Alert.alert(
        'No biometrics enrolled',
        'Please set up Face ID or Touch ID in your device settings first.',
      );
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Sign in to JChat',
      fallbackLabel: 'Use password',
    });
    if (result.success) {
      // TODO: resume an existing Supabase session here.
      // supabase.auth.getSession() → if a valid session exists, the AuthContext
      // listener will already have picked it up and isAuthenticated will be true.
      // If no stored session, show an error directing the user to sign in with email.
      Alert.alert(
        'Biometric verified',
        'No stored session found. Please sign in with your email first.',
      );
    } else if (result.error !== 'user_cancel' && result.error !== 'system_cancel') {
      Alert.alert('Authentication failed', 'Biometric verification was not successful.');
    }
  }

  // ── Social OAuth ──────────────────────────────────────────────────────────
  async function handleOAuth(provider: 'google' | 'apple') {
    if (!isSupabaseConfigured) {
      Alert.alert('Not configured', 'Supabase is not configured. Add credentials to .env.');
      return;
    }
    const { data, error } = await supabase.auth.signInWithOAuth({ provider });
    if (error) {
      Alert.alert('Sign-in error', error.message);
      return;
    }
    if (data.url) {
      // TODO(deep-link): handle OAuth redirect back into the app.
      // Set up a deep-link handler (e.g. jchat://auth/callback) so Supabase
      // can return the session to the app after the browser completes the flow.
      await WebBrowser.openBrowserAsync(data.url);
    }
  }

  // ── Email / password ──────────────────────────────────────────────────────
  async function handleSignIn() {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    if (!isSupabaseConfigured) {
      Alert.alert('Not configured', 'Supabase is not configured. Add credentials to .env.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: trimmedPassword,
    });
    setLoading(false);

    if (error) {
      // AuthContext session listener handles successful sign-in automatically.
      Alert.alert('Sign-in failed', error.message);
    }
    // On success: AuthContext onAuthStateChange fires → isAuthenticated flips →
    // AppNavigator switches to MainStack. No explicit navigation call needed.
  }

  // ── Forgot password ───────────────────────────────────────────────────────
  function handleForgotPassword() {
    // TODO: password reset flow — navigate to a ForgotPasswordScreen that calls
    // supabase.auth.resetPasswordForEmail(email, { redirectTo: 'jchat://reset' })
    Alert.alert('Coming soon', 'Password reset is not yet available.');
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: c.bgBase }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          {/* TODO(i18n) */}
          <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Welcome back</Text>
          <Text style={[styles.headerSub, { color: c.textSecondary }]}>
            Sign in to your JChat account
          </Text>
        </View>

        {/* ── Biometric card (primary) ────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.biometricCard, { backgroundColor: palette.brand }]}
          onPress={handleBiometric}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Sign in with Face ID or Touch ID" // TODO(i18n)
        >
          <IconFaceId size={36} color={LOGIN_COLORS.onBrand} strokeWidth={1.5} />
          <View style={styles.biometricText}>
            {/* TODO(i18n) */}
            <Text style={styles.biometricTitle}>Use Face ID / Touch ID</Text>
            <Text style={styles.biometricSub}>Sign in instantly with biometrics</Text>
          </View>
        </TouchableOpacity>

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
            accessibilityLabel="Sign in with Google" // TODO(i18n)
          >
            <IconBrandGoogle size={22} color={c.textPrimary} strokeWidth={1.5} />
            {/* TODO(i18n) */}
            <Text style={[styles.socialBtnText, { color: c.textPrimary }]}>Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.socialBtn,
              { backgroundColor: c.bgSurface, borderColor: c.borderSubtle },
            ]}
            onPress={() => handleOAuth('apple')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Sign in with Apple" // TODO(i18n)
          >
            <IconBrandApple size={22} color={c.textPrimary} strokeWidth={1.5} />
            {/* TODO(i18n) */}
            <Text style={[styles.socialBtnText, { color: c.textPrimary }]}>Apple</Text>
          </TouchableOpacity>
        </View>

        {/* ── Divider ─────────────────────────────────────────────────────── */}
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: c.borderSubtle }]} />
          {/* TODO(i18n) */}
          <Text style={[styles.dividerLabel, { color: c.textTertiary }]}>
            or continue with email
          </Text>
          <View style={[styles.dividerLine, { backgroundColor: c.borderSubtle }]} />
        </View>

        {/* ── Email input ─────────────────────────────────────────────────── */}
        <View style={[styles.inputWrap, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
          <TextInput
            style={[styles.input, { color: c.textPrimary }]}
            value={email}
            onChangeText={setEmail}
            placeholder="Email" // TODO(i18n)
            placeholderTextColor={c.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            accessibilityLabel="Email address" // TODO(i18n)
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
            placeholder="Password" // TODO(i18n)
            placeholderTextColor={c.textTertiary}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={handleSignIn}
            accessibilityLabel="Password" // TODO(i18n)
          />
          <TouchableOpacity
            onPress={() => setShowPassword((v) => !v)}
            style={styles.eyeBtn}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} // TODO(i18n)
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
          accessibilityLabel="Forgot password?" // TODO(i18n)
        >
          {/* TODO(i18n) */}
          <Text style={[styles.forgotText, { color: palette.brand }]}>Forgot password?</Text>
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
          accessibilityLabel="Sign in" // TODO(i18n)
        >
          {/* TODO(i18n) */}
          <Text style={styles.signInBtnText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
        </TouchableOpacity>

        {/* ── Sign up link ────────────────────────────────────────────────── */}
        <View style={styles.signUpRow}>
          {/* TODO(i18n) */}
          <Text style={[styles.signUpLabel, { color: c.textSecondary }]}>
            Don't have an account?{' '}
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('RegisterStep1')}
            accessibilityRole="button"
            accessibilityLabel="Sign up" // TODO(i18n)
          >
            {/* TODO(i18n) */}
            <Text style={[styles.signUpLink, { color: palette.brand }]}>Sign up</Text>
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
