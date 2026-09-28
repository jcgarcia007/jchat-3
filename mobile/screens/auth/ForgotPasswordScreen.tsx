/**
 * JChat 3.0 — Forgot Password Screen
 * Requests and verifies a six-digit recovery code without using deep links.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { IconChevronLeft, IconMail, IconShieldCheck } from '@tabler/icons-react-native';
import type { AuthError } from '@supabase/supabase-js';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { useCaptcha, captchaErrorI18nKeys } from '../../services/captcha';
import { useAuth } from '../../context/AuthContext';

const BTN_HEIGHT = 52;
const INPUT_HEIGHT = 52;
const RESEND_DELAY_SECONDS = 60;

type Step = 'email' | 'code';

function isRateLimitError(error: AuthError | null): boolean {
  return error?.code === 'over_email_send_rate_limit' || error?.status === 429;
}

function isCaptchaError(error: AuthError | null): boolean {
  return error?.code === 'captcha_failed';
}

export default function ForgotPasswordScreen() {
  const c = useThemeColors();
  const navigation = useNavigation();
  const { t } = useTranslation('auth');
  const { beginRecovery, clearRecovery } = useAuth();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const { captchaEnabled, getCaptchaToken, CaptchaGate } = useCaptcha();

  useEffect(() => {
    if (step !== 'code') return undefined;
    const timer = setInterval(() => {
      setResendSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  const getFreshCaptchaToken = useCallback(async (): Promise<string | undefined | null> => {
    if (!captchaEnabled) return undefined;
    try {
      const token = await getCaptchaToken();
      if (token === null) {
        Alert.alert(t('captcha.cancelledTitle'), t('captcha.cancelledMessage'));
        return null;
      }
      return token;
    } catch (err) {
      const { titleKey, messageKey } = captchaErrorI18nKeys(err);
      Alert.alert(t(titleKey), t(messageKey));
      return null;
    }
  }, [captchaEnabled, getCaptchaToken, t]);

  const requestCode = useCallback(async (normalizedEmail: string): Promise<boolean> => {
    const captchaToken = await getFreshCaptchaToken();
    if (captchaToken === null) return false;
    if (!isSupabaseConfigured) return true;

    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      captchaToken: captchaToken ?? undefined,
    });

    if (isRateLimitError(error)) {
      Alert.alert(t('forgotPassword.errorTitle'), t('forgotPassword.rateLimited'));
      return false;
    }
    if (isCaptchaError(error)) {
      Alert.alert(t('captcha.errorTitle'), t('captcha.errorMessage'));
      return false;
    }

    // Supabase deliberately obscures whether the address exists. Other responses
    // lead to the same generic code screen so the UI preserves that invariant.
    return true;
  }, [getFreshCaptchaToken, t]);

  const handleSend = useCallback(async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      Alert.alert(t('forgotPassword.errorTitle'), t('forgotPassword.errorInvalidEmail'));
      return;
    }

    setLoading(true);
    const requested = await requestCode(normalizedEmail);
    setLoading(false);
    if (!requested) return;

    setEmail(normalizedEmail);
    setCode('');
    setResendSeconds(RESEND_DELAY_SECONDS);
    setStep('code');
  }, [email, requestCode, t]);

  const handleVerify = useCallback(async () => {
    if (code.length !== 6) {
      Alert.alert(t('forgotPassword.errorTitle'), t('forgotPassword.codeInvalid'));
      return;
    }
    if (!isSupabaseConfigured) {
      Alert.alert(t('forgotPassword.errorTitle'), t('forgotPassword.codeInvalid'));
      return;
    }

    setLoading(true);
    try {
      // Persist this before verifyOtp creates a session, so AppNavigator can never
      // expose the authenticated app between the auth event and the recovery UI.
      await beginRecovery();
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'recovery',
      });
      if (error || !data.session) {
        await clearRecovery();
        Alert.alert(t('forgotPassword.errorTitle'), t('forgotPassword.codeInvalid'));
      }
    } catch (error) {
      await clearRecovery().catch(() => undefined);
      console.warn('[ForgotPassword] recovery verification failed:', error);
      Alert.alert(t('forgotPassword.errorTitle'), t('forgotPassword.codeInvalid'));
    } finally {
      setLoading(false);
    }
  }, [beginRecovery, clearRecovery, code, email, t]);

  const handleResend = useCallback(async () => {
    if (resendSeconds > 0 || loading) return;
    setLoading(true);
    const requested = await requestCode(email);
    setLoading(false);
    if (requested) {
      setCode('');
      setResendSeconds(RESEND_DELAY_SECONDS);
    }
  }, [email, loading, requestCode, resendSeconds]);

  const handleChangeEmail = useCallback(() => {
    setStep('email');
    setCode('');
    setResendSeconds(0);
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bgBase }]}>
      {CaptchaGate}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel={t('forgotPassword.backA11y')}
          >
            <IconChevronLeft size={24} color={c.textPrimary} strokeWidth={2} />
          </TouchableOpacity>

          <View style={[styles.iconWrap, { backgroundColor: palette.brandLight }]}>
            {step === 'email'
              ? <IconMail size={32} color={palette.brand} strokeWidth={1.5} />
              : <IconShieldCheck size={32} color={palette.brand} strokeWidth={1.5} />}
          </View>

          <Text style={[styles.title, { color: c.textPrimary }]}>
            {step === 'email' ? t('forgotPassword.title') : t('forgotPassword.codeTitle')}
          </Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            {step === 'email' ? t('forgotPassword.subtitle') : t('forgotPassword.sentGeneric')}
          </Text>

          {step === 'email' ? (
            <>
              <View style={[styles.inputRow, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
                <TextInput
                  style={[styles.input, { color: c.textPrimary }]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t('forgotPassword.emailPlaceholder')}
                  placeholderTextColor={c.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  accessibilityLabel={t('forgotPassword.emailA11y')}
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: palette.brand }, loading && styles.btnDisabled]}
                onPress={handleSend}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={t('forgotPassword.sendA11y')}
              >
                {loading
                  ? <ActivityIndicator color={palette.textPrimary} />
                  : <Text style={styles.primaryBtnText}>{t('forgotPassword.sendButton')}</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: c.textSecondary }]}>
                  {t('forgotPassword.codeLabel')}
                </Text>
                <View style={[styles.inputRow, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
                  <TextInput
                    style={[styles.codeInput, { color: c.textPrimary }]}
                    value={code}
                    onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
                    placeholder={t('forgotPassword.codePlaceholder')}
                    placeholderTextColor={c.textTertiary}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                    maxLength={6}
                    autoFocus
                    accessibilityLabel={t('forgotPassword.codeLabel')}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  { backgroundColor: palette.brand },
                  (loading || code.length !== 6) && styles.btnDisabled,
                ]}
                onPress={handleVerify}
                disabled={loading || code.length !== 6}
                accessibilityRole="button"
              >
                {loading
                  ? <ActivityIndicator color={palette.textPrimary} />
                  : <Text style={styles.primaryBtnText}>{t('forgotPassword.verify')}</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.textBtn}
                onPress={handleResend}
                disabled={loading || resendSeconds > 0}
                accessibilityRole="button"
              >
                <Text style={[
                  styles.textBtnLabel,
                  { color: resendSeconds > 0 ? c.textTertiary : palette.brand },
                ]}>
                  {resendSeconds > 0
                    ? t('forgotPassword.resendIn', { seconds: resendSeconds })
                    : t('forgotPassword.resend')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.textBtn}
                onPress={handleChangeEmail}
                disabled={loading}
                accessibilityRole="button"
              >
                <Text style={[styles.textBtnLabel, { color: c.textSecondary }]}>
                  {t('forgotPassword.changeEmail')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { padding: 24, gap: 20 },
  backBtn: { alignSelf: 'flex-start', padding: 4, marginBottom: 8 },
  iconWrap: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 14, lineHeight: 22 },
  fieldGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: '500' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: INPUT_HEIGHT,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  input: { flex: 1, fontSize: 15 },
  codeInput: { flex: 1, fontSize: 24, fontWeight: '700', letterSpacing: 8, textAlign: 'center' },
  primaryBtn: {
    height: BTN_HEIGHT,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: palette.textPrimary, fontSize: 16, fontWeight: '700' },
  textBtn: { alignItems: 'center', justifyContent: 'center', minHeight: 40, paddingHorizontal: 8 },
  textBtnLabel: { fontSize: 14, fontWeight: '600' },
});
