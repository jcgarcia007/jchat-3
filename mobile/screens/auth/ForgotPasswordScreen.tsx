/**
 * JChat 3.0 — Forgot Password Screen
 * Sends a password-reset email via Supabase.
 * The reset link redirects to jchat://reset so the app can handle the session.
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
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { IconChevronLeft, IconMail } from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { useCaptcha, captchaErrorI18nKeys } from '../../services/captcha';

const BTN_HEIGHT = 52;
const INPUT_HEIGHT = 52;

export default function ForgotPasswordScreen() {
  const c = useThemeColors();
  const navigation = useNavigation();
  const { t } = useTranslation('auth');

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  // hCaptcha (D-38): Supabase exige token también en /recover; `CaptchaGate` se monta abajo.
  const { captchaEnabled, getCaptchaToken, CaptchaGate } = useCaptcha();

  const handleSend = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      Alert.alert(t('forgotPassword.errorTitle'), t('forgotPassword.errorInvalidEmail'));
      return;
    }
    if (!isSupabaseConfigured) {
      setSent(true);
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
        setLoading(false);
        const { titleKey, messageKey } = captchaErrorI18nKeys(err);
        Alert.alert(t(titleKey), t(messageKey));
        return;
      }
      if (captchaToken === null) {
        // Usuario canceló: no llamar a Supabase sin token.
        setLoading(false);
        Alert.alert(t('captcha.cancelledTitle'), t('captcha.cancelledMessage'));
        return;
      }
    }

    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: 'jchat://reset',
      captchaToken: captchaToken ?? undefined,
    });
    setLoading(false);
    if (error) {
      Alert.alert(t('forgotPassword.errorTitle'), error.message);
      return;
    }
    setSent(true);
  }, [email, t, captchaEnabled, getCaptchaToken]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bgBase }]}>
      {/* hCaptcha (D-38): invisible; renderiza null salvo cuando el reto está activo. */}
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
          {/* Back button */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel={t('forgotPassword.backA11y')}
          >
            <IconChevronLeft size={24} color={c.textPrimary} strokeWidth={2} />
          </TouchableOpacity>

          {/* Icon */}
          <View style={[styles.iconWrap, { backgroundColor: `${palette.brand}20` }]}>
            <IconMail size={32} color={palette.brand} strokeWidth={1.5} />
          </View>

          <Text style={[styles.title, { color: c.textPrimary }]}>
            {t('forgotPassword.title')}
          </Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            {sent ? t('forgotPassword.sentSubtitle') : t('forgotPassword.subtitle')}
          </Text>

          {!sent ? (
            <>
              {/* Email input */}
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

              {/* Send button */}
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: palette.brand }, loading && styles.btnDisabled]}
                onPress={handleSend}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={t('forgotPassword.sendA11y')}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.sendBtnText}>{t('forgotPassword.sendButton')}</Text>
                }
              </TouchableOpacity>
            </>
          ) : (
            /* Success state */
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: palette.brand }]}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
            >
              <Text style={styles.sendBtnText}>{t('forgotPassword.backToLogin')}</Text>
            </TouchableOpacity>
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: INPUT_HEIGHT,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  input: { flex: 1, fontSize: 15 },
  sendBtn: {
    height: BTN_HEIGHT,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
