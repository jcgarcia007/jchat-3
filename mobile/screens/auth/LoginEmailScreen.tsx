/**
 * JChat 3.0 — Login, email step ("boleto" design).
 *
 * Same sign-in logic as before (signInWithPassword, hCaptcha token requested at submit, translated
 * errors via toUserMessage); only the presentation changed. Sign-in success is handled by
 * AuthContext (onAuthStateChange), so there is no explicit navigation here.
 */

import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { IconArrowLeft, IconEye, IconEyeOff } from '@tabler/icons-react-native';

import { ticket } from '../../theme/ticket';
import { loginFont, useLoginFonts } from '../../theme/loginFonts';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { toUserMessage } from '../../utils/errors';
import { useCaptcha, captchaErrorI18nKeys } from '../../services/captcha';
import type { AuthStackParamList } from '../../navigation/AppNavigator';
import { TicketPlaceholder, TicketShell } from '../../components/auth/TicketShell';
import { TicketHeader } from '../../components/auth/TicketHeader';
import { TicketPerforation } from '../../components/auth/TicketPerforation';
import { TicketTitle } from '../../components/auth/TicketReveal';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'LoginEmail'>;

const PHOTO_FRACTION = 0.3;

export default function LoginEmailScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation('auth');
  const fontsReady = useLoginFonts();
  // hCaptcha (D-38): token pedido en el submit; `CaptchaGate` se monta abajo.
  const { captchaEnabled, getCaptchaToken, CaptchaGate } = useCaptcha();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

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
        // Usuario canceló: no llamar a Supabase sin token.
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
      Alert.alert(
        t('login.alerts.signInFailedTitle'),
        toUserMessage(error, 'auth:login.alerts.signInErrorMessage'),
      );
    }
  }

  if (!fontsReady) return <TicketPlaceholder photoFraction={PHOTO_FRACTION} />;

  const backButton = (
    <Pressable
      onPress={() => navigation.goBack()}
      style={styles.back}
      accessibilityRole="button"
      accessibilityLabel={t('ticket.back')}
    >
      <IconArrowLeft size={22} color={ticket.ticketPillText} strokeWidth={2} />
    </Pressable>
  );

  return (
    <TicketShell photoFraction={PHOTO_FRACTION} overlap={56} leftSlot={backButton}>
      {/* hCaptcha (D-38): invisible; renderiza null salvo cuando el reto está activo. */}
      {CaptchaGate}
      <TicketHeader />
      <TicketTitle text={t('ticket.emailTitle')} />

      <Text style={styles.fieldLabel}>{t('ticket.emailLabel')}</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder={t('ticket.emailPlaceholder')}
        placeholderTextColor={ticket.ticketInkMuted}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        accessibilityLabel={t('login.emailA11y')}
      />

      <Text style={styles.fieldLabel}>{t('ticket.passwordLabel')}</Text>
      <View style={styles.passwordRow}>
        <TextInput
          style={[styles.input, styles.passwordInput]}
          value={password}
          onChangeText={setPassword}
          placeholder={t('ticket.passwordPlaceholder')}
          placeholderTextColor={ticket.ticketInkMuted}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={handleSignIn}
          accessibilityLabel={t('login.passwordA11y')}
        />
        <Pressable
          onPress={() => setShowPassword((v) => !v)}
          style={styles.eye}
          accessibilityRole="button"
          accessibilityLabel={showPassword ? t('login.hidePassword') : t('login.showPassword')}
        >
          {showPassword ? (
            <IconEyeOff size={20} color={ticket.ticketInkMuted} strokeWidth={1.75} />
          ) : (
            <IconEye size={20} color={ticket.ticketInkMuted} strokeWidth={1.75} />
          )}
        </Pressable>
      </View>

      <Pressable
        onPress={() => navigation.navigate('ForgotPassword')}
        style={styles.forgot}
        accessibilityRole="button"
        accessibilityLabel={t('ticket.forgot')}
      >
        <Text style={styles.link}>{t('ticket.forgot')}</Text>
      </Pressable>

      <Pressable
        onPress={handleSignIn}
        disabled={loading}
        style={[styles.primary, loading && styles.primaryDisabled]}
        accessibilityRole="button"
        accessibilityState={{ disabled: loading, busy: loading }}
        accessibilityLabel={t('ticket.signIn')}
      >
        <Text style={styles.primaryText}>{loading ? t('ticket.signingIn') : t('ticket.signIn')}</Text>
      </Pressable>

      <TicketPerforation />

      <View style={styles.newHere}>
        <Text style={styles.newHereText}>{t('ticket.newHere')} </Text>
        <Pressable
          onPress={() => navigation.navigate('RegisterStep1')}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('ticket.createAccount')}
        >
          <Text style={styles.link}>{t('ticket.createAccount')}</Text>
        </Pressable>
      </View>
    </TicketShell>
  );
}

const styles = StyleSheet.create({
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ticket.ticketBackBg,
  },
  fieldLabel: {
    marginTop: 18,
    marginBottom: 6,
    fontFamily: loginFont.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    color: ticket.ticketInkMuted,
  },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ticket.ticketFieldBorder,
    backgroundColor: ticket.ticketField,
    paddingHorizontal: 14,
    fontFamily: loginFont.text,
    fontSize: 16,
    color: ticket.ticketInk,
  },
  passwordRow: { justifyContent: 'center' },
  passwordInput: { paddingRight: 52 },
  eye: { position: 'absolute', right: 0, width: 48, height: 52, alignItems: 'center', justifyContent: 'center' },
  forgot: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center' },
  link: { fontFamily: loginFont.textBold, fontSize: 14, color: ticket.brandAccent },
  primary: {
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ticket.ticketButton,
  },
  primaryDisabled: { opacity: 0.6 },
  primaryText: { fontFamily: loginFont.textXBold, fontSize: 16, color: ticket.ticketButtonText },
  newHere: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  newHereText: { fontFamily: loginFont.text, fontSize: 14, color: ticket.ticketInkMuted },
});
