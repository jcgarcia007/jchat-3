/**
 * JChat 3.0 — Register Step 1 Screen (Task 1.4)
 *
 * Collects: Full name, Email, Password, Confirm Password.
 * Validates locally, then hands data off to RegisterStep2 via navigation params.
 * No Supabase writes here — that happens in Step 2 (Task 1.5).
 *
 * Design:
 *  • Progress dots (2 dots, first filled brand, second empty)
 *  • Social signup row: Google | Apple | Facebook (OAuth stubs)
 *  • Divider "or with email"
 *  • Form fields with inline validation errors
 *  • "Continue" button → navigate to RegisterStep2
 *  • "Already have an account? Log in" link
 */

import React, { useState, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';
import {
  IconEye,
  IconEyeOff,
  IconBrandGoogle,
  IconBrandApple,
  IconBrandFacebook,
} from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import type { AuthStackParamList } from '../../navigation/AppNavigator';

// ---------------------------------------------------------------------------
// Screen-local color constants — only values not in palette/tokens
// ---------------------------------------------------------------------------
const LOCAL_COLORS = {
  dividerLine: 'rgba(128,128,128,0.25)',  // neutral separator line
  socialIconGoogle: '#EA4335',             // Google brand red
  socialIconApple: '#000000',              // Apple logo black (light mode)
  socialIconAppleDark: '#FFFFFF',          // Apple logo white (dark mode)
  socialIconFacebook: '#1877F2',           // Facebook brand blue
  onBrand: '#FFFFFF',                      // text on filled brand button
} as const;

type RegisterStep1Nav = NativeStackNavigationProp<AuthStackParamList, 'RegisterStep1'>;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateName(v: string): string | null {
  if (!v.trim()) return 'Full name is required'; // TODO(i18n)
  return null;
}

function validateEmail(v: string): string | null {
  if (!v.trim()) return 'Email is required'; // TODO(i18n)
  if (!EMAIL_REGEX.test(v.trim())) return 'Enter a valid email address'; // TODO(i18n)
  return null;
}

function validatePassword(v: string): string | null {
  if (!v) return 'Password is required'; // TODO(i18n)
  if (v.length < 8) return 'Password must be at least 8 characters'; // TODO(i18n)
  return null;
}

function validateConfirmPassword(password: string, confirm: string): string | null {
  if (!confirm) return 'Please confirm your password'; // TODO(i18n)
  if (password !== confirm) return 'Passwords do not match'; // TODO(i18n)
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function RegisterStep1Screen() {
  const c = useThemeColors();
  const navigation = useNavigation<RegisterStep1Nav>();

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

  // Derived errors
  const errors = {
    name:            touched.name            ? validateName(name)                             : null,
    email:           touched.email           ? validateEmail(email)                           : null,
    password:        touched.password        ? validatePassword(password)                     : null,
    confirmPassword: touched.confirmPassword ? validateConfirmPassword(password, confirmPassword) : null,
  };

  const markTouched = useCallback((field: keyof typeof touched) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  // ---------------------------------------------------------------------------
  // Social OAuth stubs
  // ---------------------------------------------------------------------------
  const handleGoogleSignUp = useCallback(async () => {
    // TODO(deep-link): wire up real Google OAuth via Supabase
    await WebBrowser.openBrowserAsync('https://jchat.app/auth/google');
  }, []);

  const handleAppleSignUp = useCallback(async () => {
    // TODO(deep-link): wire up real Apple OAuth via Supabase
    await WebBrowser.openBrowserAsync('https://jchat.app/auth/apple');
  }, []);

  const handleFacebookSignUp = useCallback(async () => {
    // TODO(deep-link): wire up real Facebook OAuth via Supabase
    await WebBrowser.openBrowserAsync('https://jchat.app/auth/facebook');
  }, []);

  // ---------------------------------------------------------------------------
  // Continue — validate all fields, navigate if clean
  // ---------------------------------------------------------------------------
  const handleContinue = useCallback(() => {
    // Mark all as touched to reveal any remaining errors
    const allTouched = { name: true, email: true, password: true, confirmPassword: true };
    setTouched(allTouched);

    const nameErr     = validateName(name);
    const emailErr    = validateEmail(email);
    const passwordErr = validatePassword(password);
    const confirmErr  = validateConfirmPassword(password, confirmPassword);

    if (nameErr || emailErr || passwordErr || confirmErr) return;

    navigation.navigate('RegisterStep2', {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
    });
  }, [name, email, password, confirmPassword, navigation]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const appleIconColor =
    c.bgBase === palette.bgBase
      ? LOCAL_COLORS.socialIconAppleDark   // dark mode
      : LOCAL_COLORS.socialIconApple;      // light mode

  const inputBg = c.bgSurface;
  const inputBorder = c.borderSubtle;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bgBase }]}>
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
          {/* ── Progress dots ──────────────────────────────────────────── */}
          <View style={styles.dotsRow} accessibilityLabel="Step 1 of 2">
            <View style={[styles.dot, { backgroundColor: palette.brand, width: 20 }]} />
            <View style={[styles.dot, { backgroundColor: c.borderSubtle }]} />
          </View>

          {/* ── Title ──────────────────────────────────────────────────── */}
          <Text style={[styles.title, { color: c.textPrimary }]}>
            Create account {/* TODO(i18n) */}
          </Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            Join local conversations and discover what{'’'}s happening nearby. {/* TODO(i18n) */}
          </Text>

          {/* ── Social buttons ─────────────────────────────────────────── */}
          <View style={styles.socialRow}>
            <TouchableOpacity
              style={[styles.socialButton, { backgroundColor: inputBg, borderColor: inputBorder }]}
              onPress={handleGoogleSignUp}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Sign up with Google" // TODO(i18n)
            >
              <IconBrandGoogle
                size={22}
                color={LOCAL_COLORS.socialIconGoogle}
                strokeWidth={1.75}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.socialButton, { backgroundColor: inputBg, borderColor: inputBorder }]}
              onPress={handleAppleSignUp}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Sign up with Apple" // TODO(i18n)
            >
              <IconBrandApple
                size={22}
                color={appleIconColor}
                strokeWidth={1.75}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.socialButton, { backgroundColor: inputBg, borderColor: inputBorder }]}
              onPress={handleFacebookSignUp}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Sign up with Facebook" // TODO(i18n)
            >
              <IconBrandFacebook
                size={22}
                color={LOCAL_COLORS.socialIconFacebook}
                strokeWidth={1.75}
              />
            </TouchableOpacity>
          </View>

          {/* ── Divider ────────────────────────────────────────────────── */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: LOCAL_COLORS.dividerLine }]} />
            <Text style={[styles.dividerText, { color: c.textTertiary }]}>
              or with email {/* TODO(i18n) */}
            </Text>
            <View style={[styles.dividerLine, { backgroundColor: LOCAL_COLORS.dividerLine }]} />
          </View>

          {/* ── Form ───────────────────────────────────────────────────── */}

          {/* Full name */}
          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: c.textSecondary }]}>
              Full name {/* TODO(i18n) */}
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: inputBg,
                  borderColor: errors.name ? palette.danger : inputBorder,
                  color: c.textPrimary,
                },
              ]}
              placeholder="Your full name" // TODO(i18n)
              placeholderTextColor={c.textTertiary}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              value={name}
              onChangeText={setName}
              onBlur={() => markTouched('name')}
              accessibilityLabel="Full name"
            />
            {errors.name ? (
              <Text style={[styles.errorText, { color: palette.danger }]}>
                {errors.name}
              </Text>
            ) : null}
          </View>

          {/* Email */}
          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: c.textSecondary }]}>
              Email {/* TODO(i18n) */}
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: inputBg,
                  borderColor: errors.email ? palette.danger : inputBorder,
                  color: c.textPrimary,
                },
              ]}
              placeholder="you@example.com" // TODO(i18n)
              placeholderTextColor={c.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              value={email}
              onChangeText={setEmail}
              onBlur={() => markTouched('email')}
              accessibilityLabel="Email address"
            />
            {errors.email ? (
              <Text style={[styles.errorText, { color: palette.danger }]}>
                {errors.email}
              </Text>
            ) : null}
          </View>

          {/* Password */}
          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: c.textSecondary }]}>
              Password {/* TODO(i18n) */}
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[
                  styles.input,
                  styles.inputFlex,
                  {
                    backgroundColor: inputBg,
                    borderColor: errors.password ? palette.danger : inputBorder,
                    color: c.textPrimary,
                  },
                ]}
                placeholder="Min. 8 characters" // TODO(i18n)
                placeholderTextColor={c.textTertiary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                value={password}
                onChangeText={setPassword}
                onBlur={() => markTouched('password')}
                accessibilityLabel="Password"
              />
              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowPassword((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} // TODO(i18n)
                hitSlop={8}
              >
                {showPassword ? (
                  <IconEyeOff size={20} color={c.textTertiary} strokeWidth={1.75} />
                ) : (
                  <IconEye size={20} color={c.textTertiary} strokeWidth={1.75} />
                )}
              </Pressable>
            </View>
            {errors.password ? (
              <Text style={[styles.errorText, { color: palette.danger }]}>
                {errors.password}
              </Text>
            ) : null}
          </View>

          {/* Confirm password */}
          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: c.textSecondary }]}>
              Confirm password {/* TODO(i18n) */}
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[
                  styles.input,
                  styles.inputFlex,
                  {
                    backgroundColor: inputBg,
                    borderColor: errors.confirmPassword ? palette.danger : inputBorder,
                    color: c.textPrimary,
                  },
                ]}
                placeholder="Repeat your password" // TODO(i18n)
                placeholderTextColor={c.textTertiary}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onBlur={() => markTouched('confirmPassword')}
                onSubmitEditing={handleContinue}
                accessibilityLabel="Confirm password"
              />
              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowConfirm((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showConfirm ? 'Hide confirm password' : 'Show confirm password'} // TODO(i18n)
                hitSlop={8}
              >
                {showConfirm ? (
                  <IconEyeOff size={20} color={c.textTertiary} strokeWidth={1.75} />
                ) : (
                  <IconEye size={20} color={c.textTertiary} strokeWidth={1.75} />
                )}
              </Pressable>
            </View>
            {errors.confirmPassword ? (
              <Text style={[styles.errorText, { color: palette.danger }]}>
                {errors.confirmPassword}
              </Text>
            ) : null}
          </View>

          {/* ── Continue button ────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.continueButton, { backgroundColor: palette.brand }]}
            onPress={handleContinue}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Continue" // TODO(i18n)
          >
            <Text style={styles.continueButtonText}>
              Continue {/* TODO(i18n) */}
            </Text>
          </TouchableOpacity>

          {/* ── Already have an account ───────────────────────────────── */}
          <View style={styles.loginRow}>
            <Text style={[styles.loginPrompt, { color: c.textSecondary }]}>
              Already have an account?{' '} {/* TODO(i18n) */}
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              accessibilityRole="link"
              accessibilityLabel="Log in" // TODO(i18n)
              hitSlop={8}
            >
              <Text style={[styles.loginLink, { color: palette.brand }]}>
                Log in {/* TODO(i18n) */}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles — no hardcoded hex except in LOCAL_COLORS above
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
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

  // ── Social buttons ─────────────────────────────────────────────────────────
  socialRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  socialButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Divider ────────────────────────────────────────────────────────────────
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
    fontWeight: '400',
  },

  // ── Form fields ────────────────────────────────────────────────────────────
  fieldWrap: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputFlex: {
    flex: 1,
    paddingRight: 44, // space for the eye icon
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    width: 32,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    marginLeft: 2,
  },

  // ── Continue button ────────────────────────────────────────────────────────
  continueButton: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  continueButtonText: {
    color: LOCAL_COLORS.onBrand,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.1,
  },

  // ── Login link ─────────────────────────────────────────────────────────────
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginPrompt: {
    fontSize: 14,
  },
  loginLink: {
    fontSize: 14,
    fontWeight: '600',
  },
});
