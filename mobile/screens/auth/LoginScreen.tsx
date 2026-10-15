/**
 * JChat 3.0 — Login ("boleto" design).
 *
 * Night photo + paper ticket: "Continue with email" (opens the email step), Apple and Google through
 * the same browser OAuth flow as before (handleOAuth), and the link to create an account.
 * Fixed artwork: it does not follow light/dark mode (theme/ticket.ts).
 */

import React, { useCallback, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { IconArrowRight, IconMail } from '@tabler/icons-react-native';

import { ticket } from '../../theme/ticket';
import { loginFont, useLoginFonts } from '../../theme/loginFonts';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { toUserMessage } from '../../utils/errors';
import type { AuthStackParamList } from '../../navigation/AppNavigator';
import { TicketPlaceholder, TicketShell } from '../../components/auth/TicketShell';
import { TicketHeader } from '../../components/auth/TicketHeader';
import { EntryVenueCard } from '../../components/auth/EntryVenueCard';
import { TicketPerforation } from '../../components/auth/TicketPerforation';
import { TicketTitle, useTicketCascade } from '../../components/auth/TicketReveal';
import { showAlert } from '../../utils/dialog';
import { readAuthCode } from '../../utils/authUrl';
import { AppleAuthSlot } from '../../components/auth/AppleAuthSlot';

type LoginNav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

export default function LoginScreen() {
  const navigation = useNavigation<LoginNav>();
  const { t } = useTranslation('auth');
  const fontsReady = useLoginFonts();
  const [oauthBusy, setOauthBusy] = useState(false);
  // Entrance: the ticket rises and, while it is still moving, six blocks fade in one after another
  // (timings live in TicketShell / TicketReveal); the title sweeps in.
  const cascade = useTicketCascade(6, 1);
  const handleContentReady = useCallback(
    (reduceMotion: boolean) => (reduceMotion ? cascade.showAll() : cascade.start()),
    [cascade],
  );

  // ── Social OAuth (deep-link, M1) ───────────────────────────────────────────
  // signInWithOAuth({ redirectTo: jchat://auth/callback, skipBrowserRedirect })
  //   → openAuthSessionAsync abre el browser y captura el redirect de vuelta
  //   → PKCE: ?code=… → exchangeCodeForSession (los tokens en la URL ya no se aceptan: utils/authUrl.ts)
  //   → AuthContext.onAuthStateChange entra a la app.
  async function handleOAuth(provider: 'google' | 'apple') {
    if (!isSupabaseConfigured) {
      showAlert(t('login.alerts.notConfiguredTitle'), t('login.alerts.notConfiguredMessage'));
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
      showAlert(t('login.alerts.signInErrorTitle'), toUserMessage(error, 'auth:login.alerts.signInErrorMessage'));
      return;
    }
    if (!data?.url) return;

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    // 'cancel' / 'dismiss' → el usuario cerró el navegador; sin error que reportar.
    if (result.type !== 'success' || !result.url) return;

    // PKCE: the browser returns `?code=…` (tokens in a URL are never accepted, see utils/authUrl.ts). Only this
    // device, which holds the code verifier, can exchange it.
    const code = readAuthCode(result.url);
    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        showAlert(t('login.alerts.signInErrorTitle'), toUserMessage(exchangeError, 'auth:login.alerts.signInErrorMessage'));
      }
      return;
    }

    // Sin code: el texto del provider es crudo e inglés; mostrar el genérico traducido.
    showAlert(t('login.alerts.signInErrorTitle'), t('login.alerts.signInErrorMessage'));
  }

  async function runOAuth(provider: 'google' | 'apple') {
    if (oauthBusy) return;
    setOauthBusy(true);
    try {
      await handleOAuth(provider);
    } finally {
      setOauthBusy(false);
    }
  }

  if (!fontsReady) return <TicketPlaceholder />;

  return (
    <TicketShell entrance onContentReady={handleContentReady}>
      <Animated.View style={cascade.blockStyle(0)}>
        <TicketHeader />
        <EntryVenueCard variant="ticket" />
      </Animated.View>
      <Animated.View style={cascade.blockStyle(1)}>
        <TicketTitle text={t('ticket.title')} reveal={cascade.reveal} />
      </Animated.View>
      <Animated.View style={cascade.blockStyle(2)}>
        <Text style={styles.subtitle}>{t('ticket.subtitle')}</Text>
      </Animated.View>

      <Animated.View style={cascade.blockStyle(3)}>
      <Pressable
        onPress={() => navigation.navigate('LoginEmail')}
        style={styles.primary}
        accessibilityRole="button"
        accessibilityLabel={t('ticket.continueEmail')}
      >
        <IconMail size={22} color={ticket.ticketButtonText} strokeWidth={1.75} />
        <Text style={styles.primaryText}>{t('ticket.continueEmail')}</Text>
        <IconArrowRight size={22} color={ticket.ticketButtonText} strokeWidth={1.75} />
      </Pressable>
      </Animated.View>

      {/* Apple: the OFFICIAL native button on iOS (guideline 4.8 + HIG), as prominent as Google's; Android / web keep the
          browser OAuth button. TODO(official-social-buttons): the official Google "G" logo is still text-only. */}
      <Animated.View style={[styles.socialRow, cascade.blockStyle(4)]}>
        <AppleAuthSlot
          mode="signIn"
          disabled={oauthBusy}
          style={styles.socialOfficial}
          cornerRadius={14}
          onError={(message) => showAlert(t('login.alerts.signInErrorTitle'), message)}
          fallback={
            <Pressable
              onPress={() => void runOAuth('apple')}
              disabled={oauthBusy}
              style={[styles.social, oauthBusy && styles.socialBusy]}
              accessibilityRole="button"
              accessibilityLabel={t('login.appleA11y')}
            >
              <Text style={styles.socialText}>{t('ticket.apple')}</Text>
            </Pressable>
          }
        />
        <Pressable
          onPress={() => void runOAuth('google')}
          disabled={oauthBusy}
          style={[styles.social, oauthBusy && styles.socialBusy]}
          accessibilityRole="button"
          accessibilityLabel={t('login.googleA11y')}
        >
          <Text style={styles.socialText}>{t('ticket.google')}</Text>
        </Pressable>
      </Animated.View>

      {/* TODO(biometric-login): the "BIOMETRICS" divider + Face ID button go here once a real biometric
          sign-in exists (needs the session stored with expo-secure-store). Hidden until then: the
          old button could not sign anyone in. LockScreen is unrelated and untouched. */}

      <Animated.View style={cascade.blockStyle(5)}>
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
      </Animated.View>
    </TicketShell>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    marginTop: 10,
    marginBottom: 22,
    fontFamily: loginFont.text,
    fontSize: 15,
    lineHeight: 22,
    color: ticket.ticketInkMuted,
  },
  primary: {
    height: 56,
    borderRadius: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: ticket.ticketButton,
  },
  primaryText: { fontFamily: loginFont.textXBold, fontSize: 16, color: ticket.ticketButtonText },
  socialRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  social: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ticket.ticketFieldBorder,
    backgroundColor: ticket.ticketField,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialBusy: { opacity: 0.6 },
  // Apple's official button: same row slot and height as the Google button.
  socialOfficial: { flex: 1, height: 50 },
  socialText: { fontFamily: loginFont.textBold, fontSize: 15, color: ticket.ticketInk },
  newHere: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  newHereText: { fontFamily: loginFont.text, fontSize: 14, color: ticket.ticketInkMuted },
  link: { fontFamily: loginFont.textBold, fontSize: 14, color: ticket.ticketButton },
});
